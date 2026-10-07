import { describe, expect, it } from "vitest";
import { factRows, humanKey, KIND_LABEL, sourceCard, utcStamp } from "./sourceCard";
import { fixtureFacts } from "./fixtureFacts";
import { templateRundown } from "./template";
import { selectRundown } from "./rundown";
import type { Fact } from "./facts";

const FACTS = fixtureFacts();
const NOW = Date.parse("2026-10-07T02:45:00Z");
const RUNDOWN = selectRundown(null, FACTS, NOW, templateRundown(FACTS, "2026-10-07T02:30:00.000Z")).rundown;

describe("humanKey and utcStamp", () => {
  it("turns field names into words without touching values", () => {
    expect(humanKey("commonestEvent")).toBe("commonest event");
    expect(humanKey("depthKm")).toBe("depth km");
    expect(humanKey("netPrecision")).toBe("net precision");
    expect(humanKey("PAGERAlert")).toBe("pager alert");
    expect(humanKey("in_force")).toBe("in force");
  });
  it("writes instants in UTC and leaves anything else alone", () => {
    expect(utcStamp("2026-10-06T16:48:21.123Z")).toBe("2026-10-06 16:48 UTC");
    expect(utcStamp("2026-10-06T11:48:21-05:00")).toBe("2026-10-06 16:48 UTC");
    expect(utcStamp("2026-10-09")).toBe("2026-10-09");
    expect(utcStamp(null)).toBe("");
  });
});

describe("factRows", () => {
  it("shows every published word and number exactly as the fact carries it", () => {
    for (const f of FACTS) {
      const rows = factRows(f);
      expect(rows.map((r) => r.value)).toEqual([...Object.values(f.headline_fields), ...Object.values(f.numbers).map(String)]);
    }
  });
  it("labels every fact kind", () => {
    for (const f of FACTS) expect(KIND_LABEL[f.kind], f.kind).toBeTruthy();
  });
});

describe("sourceCard", () => {
  it("lists every fact any line of a segment cites, with the lines that cite it", () => {
    for (const seg of RUNDOWN.segments) {
      const card = sourceCard(seg, FACTS);
      expect(card.missing).toEqual([]);
      const listed = new Set(card.facts.map((c) => c.fact.id));
      seg.lines.forEach((l, i) => {
        for (const id of l.factIds) {
          expect(listed.has(id), `${seg.id} line ${i + 1} cites ${id}`).toBe(true);
          expect(card.facts.find((c) => c.fact.id === id)!.lines).toContain(i + 1);
        }
      });
    }
  });
  it("names a cited fact it does not have instead of dropping it", () => {
    const seg = RUNDOWN.segments.find((s) => s.facts.length > 1)!;
    const without: Fact[] = FACTS.filter((f) => f.id !== seg.facts[0]);
    const card = sourceCard(seg, without);
    expect(card.missing).toEqual([seg.facts[0]]);
  });
  it("is empty for banter", () => {
    const bumper = RUNDOWN.segments.find((s) => s.id === "bumper-1")!;
    expect(sourceCard(bumper, FACTS)).toEqual({ facts: [], missing: [] });
  });
});
