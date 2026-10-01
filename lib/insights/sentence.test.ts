// The C1 sentences: the golden headline and caveats for the committed
// bundle's slots, the slot formats one by one, and the refusals.
//
// The golden is two-sided. The sentence must equal a pinned string (a wording
// change is a diff here), and it must equal the producer's own clause texts
// with the same slots substituted in, so the registered templates in
// sentence.ts and the texts the bundle ships cannot drift apart unnoticed.

import { describe, expect, it } from "vitest";
import { loadBundle } from "./load";
import { TEMPLATE_IDS, asSentence, fill, formatSlot, headlineSentence, isTemplateId, placeholders, statusNote, templateText, type TemplateId } from "./sentence";
import type { Slot } from "./types";

const EV = loadBundle("places-v0.1").findings.find((f) => f.id === "C1-raw")!.evidence;
const H = EV.headline;

const GOLDEN_HEADLINE =
  "From 2019 to 2025 Austin's office-industry jobs grew 36.0% and its goods-and-logistics jobs 38.6%, ranking 1st and 2nd of 149 major metros; no major metro beat Austin on both.";

/** The bundle's own text with the slots substituted, independently of sentence.ts's templates. */
function producerText(text: string, slots: Record<string, Slot>): string {
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => formatSlot(name, slots[name]));
}

describe("the C1 headline (golden)", () => {
  const clauses = H.clauses.map((c) => ({ id: c.id as TemplateId, printed: c.printed }));
  const sentence = headlineSentence(clauses, H.slots, H.join, H.end);

  it("equals the pinned sentence for the bundle's slots", () => {
    expect(sentence).toBe(GOLDEN_HEADLINE);
  });

  it("equals the bundle's own clause texts filled with the same slots", () => {
    const printed = H.clauses.filter((c) => c.printed).map((c) => producerText(c.text, H.slots));
    expect(printed.join(H.join) + H.end).toBe(sentence);
  });

  it("leaves out the clause that does not print (twins pending)", () => {
    expect(H.clauses.find((c) => c.id === "C1.H3.twins")?.printed).toBe(false);
    expect(sentence).not.toMatch(/twin/i);
  });

  it("uses none of the never-used words", () => {
    for (const w of H.never_used) expect(sentence).not.toMatch(new RegExp(`\\b${w}\\b`, "i"));
  });
});

describe("the C1 caveats (golden)", () => {
  const printed = EV.caveats.filter((c) => c.printed).map((c) => asSentence(fill(c.id as TemplateId, c.slots ?? {})));
  it("are the pinned four, in the evidence's order", () => {
    expect(printed).toEqual([
      "From 2022 to 2025 Austin ranks 17th on office-industry and 5th on goods-and-logistics growth, and Beaumont and Tallahassee beat it on both.",
      "CES shows Austin manufacturing stepping up from 75.2k (2022) to 86.1k (2023).",
      "Tampa is not published.",
      "The 2019 and 2025 annual averages are benchmarked.",
    ]);
  });
  it("match the bundle's own texts filled with the same slots", () => {
    for (const c of EV.caveats.filter((x) => x.printed)) expect(fill(c.id as TemplateId, c.slots ?? {})).toBe(producerText(c.text, c.slots ?? {}));
  });
});

describe("registered texts", () => {
  it("cover every template id the bundle uses, word for word", () => {
    const used = [...H.clauses, ...EV.caveats, EV.chart.title, EV.chart.universe_line, H.method_line];
    for (const t of used) {
      expect(isTemplateId(t.id), t.id).toBe(true);
      expect(templateText(t.id as TemplateId), t.id).toBe(t.text);
    }
  });
  it("has a text for every id (the switch is total)", () => {
    for (const id of TEMPLATE_IDS) expect(templateText(id).length).toBeGreaterThan(0);
  });
});

describe("slot formats", () => {
  it("prints a year as written, never with a thousands separator", () => {
    expect(formatSlot("t0", { format: "year", number: "window.t0", value: 2019 })).toBe("2019");
  });
  it("prints a percent slot as the bare number; the template carries the %", () => {
    expect(formatSlot("a", { format: "pct", number: "n", value: 35.956493921944976, digits: 1 })).toBe("36.0");
    expect(fill("C1.H3.ranks", H.slots)).toContain("grew 36.0% and");
  });
  it("prints ordinals, counts, lists and places", () => {
    expect(formatSlot("r", { format: "ordinal", number: "n", value: 2 })).toBe("2nd");
    expect(formatSlot("N", { format: "num", number: "n", value: 1490 })).toBe("1,490");
    expect(formatSlot("v", { format: "num", number: "n", value: 75.2, digits: 1 })).toBe("75.2");
    const metros = [
      { cbsa: "13140", label: "Beaumont", title: "Beaumont-Port Arthur, TX" },
      { cbsa: "45220", label: "Tallahassee", title: "Tallahassee, FL" },
    ];
    expect(formatSlot("b", { format: "list", metros })).toBe("Beaumont and Tallahassee");
    expect(formatSlot("s", { cbsa: "12420", label: "Austin", title: "Austin-Round Rock-San Marcos, TX" })).toBe("Austin");
    expect(formatSlot("N", { number: "main.universe.n", value: 150 })).toBe("150");
  });
  it("refuses a missing value, a fractional year and an empty list rather than print them", () => {
    expect(() => formatSlot("a", { format: "pct", number: "n", value: null as unknown as number, digits: 1 })).toThrow(/no finite value/);
    expect(() => formatSlot("t", { format: "year", number: "n", value: 2019.5 })).toThrow(/not a whole number/);
    expect(() => formatSlot("b", { format: "list", metros: [] })).toThrow(/empty list/);
    expect(() => formatSlot("N", { number: "n", value: 1.5 })).toThrow(/not a whole number/);
  });
  it("refuses a template whose slot is absent", () => {
    const rest: Record<string, Slot> = { ...H.slots };
    delete rest.a;
    expect(() => fill("C1.H3.ranks", rest)).toThrow(/needs slot \{a\}/);
    expect(placeholders(templateText("C1.H3.ranks"))).toEqual(["t0", "t1", "subject", "a", "b", "r_a", "r_b", "N"]);
  });
  it("has a status note only for statuses it knows", () => {
    expect(statusNote("twins_pending")).toMatch(/^Twin-adjusted panel pending/);
    expect(() => statusNote("shipped")).toThrow(/no status note/);
  });
});
