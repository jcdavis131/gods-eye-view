import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseOffset,
  clockOffset,
  countdown,
  cueAt,
  estimateLineMs,
  GAP_MS,
  layoutSegment,
  LEAD_IN_MS,
  MIN_RATE,
  needsRundown,
  OFFSET_IGNORE_MS,
  onAir,
  rundownStatus,
  rundownUrl,
  TAIL_MS,
  upNext,
  utcHm,
  utcHms,
} from "./playback";
import { playhead, WHEEL, WHEEL_S } from "./schedule";
import { templateRundown } from "./template";
import { fixtureFacts, CAPTURED_MS } from "./fixtureFacts";
import type { Rundown, RundownLine } from "./rundown";

// The rundown the page would get for the half hour the fixtures were captured in.
const TURN = Date.parse(playhead(CAPTURED_MS).wheelStartedAt);
const RUNDOWN: Rundown = templateRundown(fixtureFacts(), new Date(TURN).toISOString());
const at = (segStartS: number, intoS = 0) => TURN + (segStartS + intoS) * 1000;
const seg = (id: string) => WHEEL.find((s) => s.id === id)!;

function line(text: string, factIds: string[] = [], anchor: RundownLine["anchor"] = "plume"): RundownLine {
  return { anchor, text, factIds };
}

/** The engine must not read the clock: make Date.now throw while it runs. */
beforeEach(() => {
  vi.spyOn(Date, "now").mockImplementation(() => {
    throw new Error("lib/news/playback read the clock");
  });
});
afterEach(() => vi.restoreAllMocks());

describe("estimateLineMs", () => {
  it("grows with the text and stays inside its bounds", () => {
    expect(estimateLineMs("Ears up.")).toBeGreaterThanOrEqual(1200);
    const short = estimateLineMs("USGS reports a magnitude 5.9 earthquake.");
    const long = estimateLineMs("USGS reports a magnitude 5.9 earthquake 264 km SSW of Severo-Kuril’sk, Russia, at 16:48 UTC on 6 October, 26 kilometres deep.");
    expect(long).toBeGreaterThan(short);
    expect(estimateLineMs("x".repeat(5000))).toBe(40_000);
    expect(estimateLineMs("")).toBe(1200);
  });
  it("reads at about a newsreader's pace (13 to 18 characters a second)", () => {
    const text = "The National Weather Service has 53 alerts rated Severe or Extreme in force and the commonest is the Storm Warning with 16 of them in force";
    const cps = text.length / (estimateLineMs(text) / 1000);
    expect(cps).toBeGreaterThan(13);
    expect(cps).toBeLessThan(18);
  });
});

describe("layoutSegment", () => {
  it("plays every line once, in order, inside the slot, with pauses between", () => {
    for (const s of RUNDOWN.segments) {
      const slotMs = seg(s.id).durS * 1000;
      const tl = layoutSegment(s.id, s.lines, slotMs);
      const first = tl.cues.filter((c) => !c.recap);
      expect(first.map((c) => c.lineIndex), s.id).toEqual(s.lines.map((_, i) => i));
      expect(first.map((c) => c.text)).toEqual(s.lines.map((l) => l.text));
      expect(tl.cues[0].startMs).toBe(LEAD_IN_MS);
      for (let i = 1; i < tl.cues.length; i++) expect(tl.cues[i].startMs - tl.cues[i - 1].endMs).toBeGreaterThanOrEqual(GAP_MS);
      expect(tl.cues[tl.cues.length - 1].endMs).toBeLessThanOrEqual(slotMs - TAIL_MS);
      expect(tl.dropped).toBe(0);
      expect(tl.rate).toBe(1);
    }
  });

  it("recaps only fact lines, verbatim, and never in a bumper", () => {
    const planet = RUNDOWN.segments.find((s) => s.id === "planet-watch")!;
    const tl = layoutSegment(planet.id, planet.lines, seg("planet-watch").durS * 1000);
    const recaps = tl.cues.filter((c) => c.recap);
    expect(recaps.length).toBeGreaterThan(0);
    for (const c of recaps) {
      expect(c.factIds.length).toBeGreaterThan(0);
      expect(c.text).toBe(planet.lines[c.lineIndex].text);
      expect(c.key).toMatch(/:recap$/);
    }
    const bumper = RUNDOWN.segments.find((s) => s.id === "bumper-1")!;
    expect(layoutSegment(bumper.id, bumper.lines, 60_000).cues.some((c) => c.recap)).toBe(false);
  });

  it("reads overlong lines faster, down to MIN_RATE, then drops what still does not fit", () => {
    const lines = Array.from({ length: 20 }, (_, i) => line(`Line ${i}. ${"word ".repeat(80)}`));
    const tl = layoutSegment("bumper-1", lines, 60_000);
    expect(tl.rate).toBe(MIN_RATE);
    expect(tl.dropped).toBeGreaterThan(0);
    expect(tl.cues.length + tl.dropped).toBe(20);
    expect(tl.cues[tl.cues.length - 1].endMs).toBeLessThanOrEqual(60_000 - TAIL_MS);
    expect(tl.cues.some((c) => c.recap)).toBe(false);
  });

  it("speeds up only as much as it must", () => {
    // Three lines whose natural total slightly exceeds the 60 s budget.
    const text = "word ".repeat(70);
    const tl = layoutSegment("bumper-1", [line(text), line(text), line(text)], 60_000);
    expect(tl.rate).toBeLessThan(1);
    expect(tl.rate).toBeGreaterThan(MIN_RATE);
    expect(tl.dropped).toBe(0);
    expect(tl.cues[2].endMs).toBeGreaterThan(60_000 - TAIL_MS - 50);
  });

  it("uses real durations as given and never speeds them up", () => {
    const lines = [line("a"), line("b"), line("c")];
    const tl = layoutSegment("bumper-1", lines, 60_000, { durationOf: (_, i) => [5000, 6000, 7000][i] });
    expect(tl.cues.map((c) => c.endMs - c.startMs)).toEqual([5000, 6000, 7000]);
    const over = layoutSegment("bumper-1", lines, 60_000, { durationOf: () => 25_000 });
    expect(over.cues.map((c) => c.endMs - c.startMs)).toEqual([25_000, 25_000]);
    expect(over.dropped).toBe(1);
  });

  it("falls back to the estimate when a real duration is missing or bad", () => {
    const tl = layoutSegment("bumper-1", [line("Ears up.")], 60_000, { durationOf: () => Number.NaN });
    expect(tl.cues[0].endMs - tl.cues[0].startMs).toBe(estimateLineMs("Ears up."));
  });

  it("cuts a single line that is longer than the slot at the slot's end", () => {
    const tl = layoutSegment("bumper-1", [line("x"), line("y")], 10_000, { durationOf: () => 60_000 });
    expect(tl.cues).toHaveLength(1);
    expect(tl.cues[0].endMs).toBe(10_000 - TAIL_MS);
    expect(tl.dropped).toBe(1);
  });
});

describe("cueAt", () => {
  const tl = layoutSegment("bumper-1", [line("One line here."), line("A second line.")], 60_000, { recap: false });
  const [a, b] = tl.cues;
  it("walks lead-in, line, gap, line, hold", () => {
    expect(cueAt(tl, 0)).toMatchObject({ phase: "lead-in", caption: null, next: a, untilChangeMs: LEAD_IN_MS });
    const mid = cueAt(tl, (a.startMs + a.endMs) / 2);
    expect(mid.phase).toBe("line");
    expect(mid.speaking).toBe(a);
    expect(mid.progress).toBeCloseTo(0.5, 5);
    const gap = cueAt(tl, a.endMs + 1);
    expect(gap).toMatchObject({ phase: "gap", speaking: null, caption: a, next: b });
    expect(cueAt(tl, b.startMs).speaking).toBe(b);
    const hold = cueAt(tl, b.endMs + 10);
    expect(hold).toMatchObject({ phase: "hold", caption: b, next: null });
    expect(hold.untilChangeMs).toBe(60_000 - b.endMs - 10);
  });
  it("never reports a negative wait", () => {
    expect(cueAt(tl, 90_000).untilChangeMs).toBe(0);
  });
});

describe("onAir", () => {
  it("follows the wheel through the whole half hour, captioning only the slot's own lines", () => {
    for (let s = 0; s < WHEEL_S; s += 7) {
      const now = TURN + s * 1000;
      const o = onAir(now, RUNDOWN);
      expect(o.segment.id).toBe(playhead(now).segment.id);
      expect(o.status).toBe("playing");
      const lines = RUNDOWN.segments.find((x) => x.id === o.segment.id)!.lines.map((l) => l.text);
      if (o.at?.caption) expect(lines).toContain(o.at.caption.text);
    }
  });

  it("puts two viewers 10 s apart 10 s apart, and two at the same moment on the same line", () => {
    const t = at(seg("planet-watch").startS, 30);
    const a = onAir(t, RUNDOWN);
    const b = onAir(t + 10_000, RUNDOWN);
    expect(b.offsetMs - a.offsetMs).toBe(10_000);
    expect(b.segment.id).toBe(a.segment.id);
    expect(onAir(t, RUNDOWN)).toEqual(a);
    // The second tab, opened 10 s later, catches up to the first 10 s after that.
    expect(onAir(t + 10_000, RUNDOWN)).toEqual(b);
  });

  it("lands on the right segment and line after a twenty-minute sleep", () => {
    const before = at(seg("top").startS, 30);
    const after = before + 20 * 60_000; // 1230 s into the turn: Money Desk, 270 s in
    const woke = onAir(after, RUNDOWN);
    expect(woke.segment.id).toBe("money-desk");
    expect(woke.offsetMs).toBe((1230 - seg("money-desk").startS) * 1000);
    const money = RUNDOWN.segments.find((s) => s.id === "money-desk")!;
    const tl = layoutSegment("money-desk", money.lines, seg("money-desk").durS * 1000);
    expect(woke.at).toEqual(cueAt(tl, woke.offsetMs));
  });

  it("flips segments exactly on the boundary, and the turn on :00 and :30", () => {
    const b = at(seg("liftoff").startS);
    expect(onAir(b - 1, RUNDOWN).segment.id).toBe("bumper-1");
    expect(onAir(b, RUNDOWN).segment.id).toBe("liftoff");
    expect(onAir(b, RUNDOWN).at?.phase).toBe("lead-in");
    const end = TURN + WHEEL_S * 1000;
    expect(onAir(end - 1, RUNDOWN).segment.id).toBe("sign-off");
    const next = onAir(end, RUNDOWN);
    expect(next.segment.id).toBe("top");
    // The template rundown expires with its turn: the studio holds and fetches the next one.
    expect(next.status).toBe("rundown-expired");
    expect(next.at).toBeNull();
  });

  it("says why it is not playing", () => {
    expect(onAir(TURN, null).status).toBe("no-rundown");
    const noTop: Rundown = { ...RUNDOWN, segments: RUNDOWN.segments.filter((s) => s.id !== "top") };
    expect(onAir(TURN + 5000, noTop)).toMatchObject({ status: "segment-missing", speaker: "plume", at: null });
  });

  it("puts the speaking anchor on camera, and the last speaker during a pause", () => {
    const bumper = RUNDOWN.segments.find((s) => s.id === "bumper-1")!;
    const tl = layoutSegment("bumper-1", bumper.lines, 60_000);
    for (const c of tl.cues) {
      expect(onAir(at(seg("bumper-1").startS) + c.startMs + 1, RUNDOWN).speaker).toBe(c.anchor);
      expect(onAir(at(seg("bumper-1").startS) + c.endMs + 1, RUNDOWN).speaker).toBe(c.anchor);
    }
  });
});

describe("rundown freshness", () => {
  it("is ok until its own expires, then expired", () => {
    expect(rundownStatus(RUNDOWN, TURN)).toBe("ok");
    expect(rundownStatus(RUNDOWN, Date.parse(RUNDOWN.expires))).toBe("expired");
    expect(rundownStatus(null, TURN)).toBe("missing");
    expect(rundownStatus({ ...RUNDOWN, expires: "not a date" }, TURN)).toBe("expired");
  });
  it("asks for a new rundown when the wheel turns, when it expires and when it has none", () => {
    const turn = playhead(TURN).wheelStartedAt;
    expect(needsRundown(RUNDOWN, turn, TURN + 60_000)).toBe(false);
    expect(needsRundown(RUNDOWN, turn, TURN + WHEEL_S * 1000)).toBe(true);
    expect(needsRundown(null, turn, TURN)).toBe(true);
    // A model rundown that outlives the turn is still fetched again when the turn changes.
    const long: Rundown = { ...RUNDOWN, writer: "qwen3:8b", expires: new Date(TURN + 3 * 3600_000).toISOString() };
    expect(needsRundown(long, turn, TURN + WHEEL_S * 1000 + 5)).toBe(true);
    expect(needsRundown(long, playhead(TURN + WHEEL_S * 1000).wheelStartedAt, TURN + WHEEL_S * 1000 + 5)).toBe(false);
  });
  it("keys the rundown request by the turn", () => {
    expect(rundownUrl(TURN + 5000)).toBe(`/api/news?op=rundown&turn=${encodeURIComponent(new Date(TURN).toISOString())}`);
    expect(rundownUrl(TURN + 5000)).toBe(rundownUrl(TURN + WHEEL_S * 1000 - 1));
    expect(rundownUrl(TURN + WHEEL_S * 1000)).not.toBe(rundownUrl(TURN));
  });
});

describe("clock sync", () => {
  it("measures a server clock 5 s ahead from one round trip", () => {
    const o = clockOffset({ sentMs: 1_000_000, receivedMs: 1_000_200, serverMs: 1_005_100 });
    expect(o).toEqual({ offsetMs: 5000, uncertaintyMs: 100 });
  });
  it("adds the time a cache held the answer", () => {
    const o = clockOffset({ sentMs: 1_000_000, receivedMs: 1_000_200, serverMs: 980_100, ageS: 20 });
    expect(o?.offsetMs).toBe(0);
    expect(o?.uncertaintyMs).toBe(1100);
  });
  it("throws out samples it cannot trust", () => {
    expect(clockOffset({ sentMs: 0, receivedMs: 12_000, serverMs: 6000 })).toBeNull();
    expect(clockOffset({ sentMs: 10, receivedMs: 5, serverMs: 6 })).toBeNull();
    expect(clockOffset({ sentMs: 0, receivedMs: 10, serverMs: Number.NaN })).toBeNull();
  });
  it("leaves a clock that is close enough alone, and corrects one that is not", () => {
    expect(chooseOffset([])).toBe(0);
    expect(chooseOffset([{ sentMs: 0, receivedMs: 100, serverMs: 50 + OFFSET_IGNORE_MS - 1 }])).toBe(0);
    expect(chooseOffset([{ sentMs: 0, receivedMs: 100, serverMs: 50 + 90_000 }])).toBe(90_000);
    // The tighter round trip wins.
    expect(chooseOffset([{ sentMs: 0, receivedMs: 3000, serverMs: 1500 + 60_000 }, { sentMs: 0, receivedMs: 100, serverMs: 50 - 40_000 }, null])).toBe(-40_000);
  });
});

describe("up next and the clock face", () => {
  it("lists the next segments with their start times, across the turn", () => {
    const n = upNext(at(seg("the-wire").startS, 10), 3);
    expect(n.map((x) => x.segment.id)).toEqual(["sign-off", "top", "planet-watch"]);
    expect(n.map((x) => x.startsAtMs)).toEqual([at(seg("sign-off").startS), TURN + WHEEL_S * 1000, TURN + (WHEEL_S + 240) * 1000]);
  });
  it("formats UTC times and countdowns", () => {
    expect(utcHms(Date.UTC(2026, 9, 7, 4, 5, 9))).toBe("04:05:09");
    expect(utcHm(Date.UTC(2026, 9, 7, 4, 5, 9))).toBe("04:05");
    expect(countdown(61_001)).toBe("1:02");
    expect(countdown(-5)).toBe("0:00");
    expect(countdown(3_725_000)).toBe("1:02:05");
  });
});
