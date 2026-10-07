import { describe, expect, it } from "vitest";
import { PERSONAS } from "./personas";
import { KIND_SOURCES, playhead, scheduleFor, slotStatus, WHEEL, WHEEL_S } from "./schedule";
import { fixtureFacts, CAPTURED_MS } from "./fixtureFacts";
import { SOURCES } from "@/lib/provenance/sources";

describe("WHEEL", () => {
  it("tiles thirty minutes with no gap and no overlap", () => {
    let t = 0;
    for (const s of WHEEL) {
      expect(s.startS, s.id).toBe(t);
      expect(s.durS).toBeGreaterThan(0);
      t += s.durS;
    }
    expect(t).toBe(WHEEL_S);
    expect(new Set(WHEEL.map((s) => s.id)).size).toBe(WHEEL.length);
  });
  it("gives every segment a real anchor, and every news segment fact kinds", () => {
    for (const s of WHEEL) {
      expect(PERSONAS[s.anchor], s.id).toBeDefined();
      if (s.kind === "news") expect(s.factKinds.length, s.id).toBeGreaterThan(0);
      else expect(s.factKinds).toEqual([]);
    }
  });
  it("names only registered sources behind each fact kind", () => {
    for (const ids of Object.values(KIND_SOURCES)) for (const id of ids) expect(SOURCES[id as keyof typeof SOURCES], id).toBeDefined();
  });
});

describe("playhead", () => {
  it("is a function of UTC time alone: the same instant gives the same segment", () => {
    const t = Date.parse("2026-10-07T02:40:01.668Z");
    expect(playhead(t)).toEqual(playhead(t));
    // 02:40:01 is 601 s into the 02:30 wheel: just inside bumper-1 (600-660).
    const p = playhead(t);
    expect(p.segment.id).toBe("bumper-1");
    expect(p.offsetS).toBe(1);
    expect(p.remainingS).toBe(59);
    expect(p.wheelStartedAt).toBe("2026-10-07T02:30:00.000Z");
    expect(p.segmentStartedAt).toBe("2026-10-07T02:40:00.000Z");
    expect(p.next.id).toBe("liftoff");
    expect(p.nextStartsAt).toBe("2026-10-07T02:41:00.000Z");
  });
  it("starts the top segment on the hour and the half hour", () => {
    for (const iso of ["2026-10-07T03:00:00Z", "2026-10-07T03:30:00Z", "1999-12-31T23:30:00Z"]) {
      const p = playhead(Date.parse(iso));
      expect(p.segment.id, iso).toBe("top");
      expect(p.offsetS).toBe(0);
    }
  });
  it("wraps from the sign-off to the next top", () => {
    const p = playhead(Date.parse("2026-10-07T03:29:59Z"));
    expect(p.segment.id).toBe("sign-off");
    expect(p.next.id).toBe("top");
    expect(p.nextStartsAt).toBe("2026-10-07T03:30:00.000Z");
  });
  it("visits every segment in order across one wheel", () => {
    const base = Date.parse("2026-10-07T04:00:00Z");
    const seen: string[] = [];
    for (let s = 0; s < WHEEL_S; s += 30) {
      const id = playhead(base + s * 1000).segment.id;
      if (seen[seen.length - 1] !== id) seen.push(id);
    }
    expect(seen).toEqual(WHEEL.map((s) => s.id));
  });
});

describe("slots", () => {
  const facts = fixtureFacts();
  it("plays every news segment that has facts", () => {
    const sch = scheduleFor(CAPTURED_MS, facts, []);
    expect(sch.slots.map((s) => s.status)).toEqual(WHEEL.map(() => "on"));
    expect(sch.skipped).toEqual([]);
    expect(sch.slots[0].startsAt).toBe("2026-10-07T02:30:00.000Z");
    expect(sch.slots[sch.slots.length - 1].endsAt).toBe("2026-10-07T03:00:00.000Z");
    expect(sch.serverNow).toBe(new Date(CAPTURED_MS).toISOString());
  });
  it("keeps an empty segment's slot and says why: nothing in force, or a feed that did not answer", () => {
    const noSpace = facts.filter((f) => !["launch", "kp", "flare"].includes(f.kind));
    const empty = scheduleFor(CAPTURED_MS, noSpace, []);
    const lo = empty.slots.find((s) => s.segment.id === "liftoff")!;
    expect(lo.status).toBe("empty");
    expect(lo.note).toMatch(/nothing to report/);
    expect(empty.skipped.map((s) => s.id)).toEqual(["liftoff"]);
    // Same start time either way: slots never move.
    expect(lo.startsAt).toBe(scheduleFor(CAPTURED_MS, facts, []).slots.find((s) => s.segment.id === "liftoff")!.startsAt);
    const down = scheduleFor(CAPTURED_MS, noSpace, ["launch-library-2"]);
    const lo2 = down.slots.find((s) => s.segment.id === "liftoff")!;
    expect(lo2.status).toBe("standing-by");
    expect(lo2.note).toMatch(/launch-library-2 did not answer/);
  });
  it("never skips a bumper", () => {
    for (const s of WHEEL.filter((x) => x.kind === "bumper")) expect(slotStatus(s, [], new Set(["nws-api"])).status).toBe("on");
  });
});
