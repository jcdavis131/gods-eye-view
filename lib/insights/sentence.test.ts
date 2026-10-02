// The C1 sentences: the golden headline, random-peer sentence and caveats for
// the committed bundle's slots, the slot formats one by one (one % per
// number), and the refusals.
//
// The golden is two-sided. The sentence must equal a pinned string (a wording
// change is a diff here), and it must equal the producer's own texts with the
// same slots substituted in, so the registered templates in sentence.ts and
// the texts the bundle ships cannot drift apart unnoticed.

import { describe, expect, it } from "vitest";
import { loadBundle } from "./load";
import {
  DEK_LADDER_RECENCY,
  FORMULA_IDS,
  TEMPLATE_IDS,
  THRESHOLDS,
  TITLE_LADDER_H3B,
  asSentence,
  fill,
  formatSlot,
  formulaText,
  headlineSentence,
  isTemplateId,
  matchTemplate,
  panelBGateTemplate,
  placeholders,
  registeredFormula,
  robustnessRegistered,
  statusNote,
  templateText,
  type TemplateId,
} from "./sentence";
import type { Slot } from "./types";

const BUNDLE = loadBundle("places-v0.1.1");
const EV = BUNDLE.findings.find((f) => f.id === "C1-raw")!.evidence;
const METHODS = BUNDLE.methods;
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

  it("prints the H3 ranks and the H3b clause, and leaves out the twins clause (twins pending)", () => {
    expect(H.clauses.map((c) => `${c.id}:${c.printed}`)).toEqual(["C1.H3.ranks:true", "C1.H3b:true", "C1.H3.twins:false"]);
    expect(sentence).not.toMatch(/twin/i);
  });

  it("uses none of the never-used words", () => {
    for (const w of H.never_used) expect(sentence).not.toMatch(new RegExp(`\\b${w}\\b`, "i"));
  });
});

describe("one % per number", () => {
  it("prints each growth once with its %, from bare-number slots in a template that carries the %", () => {
    expect(H.slots.a).toMatchObject({ format: "num", digits: 1 });
    const s = fill("C1.H3.ranks", H.slots);
    expect(s).toContain("grew 36.0% and its goods-and-logistics jobs 38.6%, ranking");
    expect(s.match(/%/g)).toHaveLength(2);
    expect(s).not.toContain("%%");
  });

  it("prints the subject's label values with their own sign and %, in a template that carries none", () => {
    const note = EV.chart.subject_note!;
    expect(fill("C1.chart.subject_note", note.slots)).toBe("+36.0% / +38.6%");
  });

  it("refuses a slot before a template's % that prints its own %, or any slot there but a bare number", () => {
    const pctA: Slot = { format: "signedPct", number: "n", value: 35.956493921944976, digits: 1 };
    expect(() => fill("C1.H3.ranks", { ...H.slots, a: pctA })).toThrow(/prints "%" after \{a\}, so that slot must be a bare number/);
    const ordinalA: Slot = { format: "ordinal", number: "n", value: 1 };
    expect(() => fill("C1.H3.ranks", { ...H.slots, a: ordinalA })).toThrow(/must be a bare number/);
  });

  it("never prints %% in any sentence the bundle fills", () => {
    const filled = [
      headlineSentence(H.clauses.map((c) => ({ id: c.id as TemplateId, printed: c.printed })), H.slots, H.join, H.end),
      fill(EV.random_peer.id as TemplateId, EV.random_peer.slots),
      ...EV.caveats.filter((c) => c.printed).map((c) => fill(c.id as TemplateId, c.slots ?? {})),
      fill(EV.chart.title.id as TemplateId, EV.chart.title.slots),
      fill(EV.chart.dek.id as TemplateId, EV.chart.dek.slots),
      fill("C1.chart.subject_note", EV.chart.subject_note!.slots),
    ];
    for (const s of filled) expect(s).not.toContain("%%");
  });
});

describe("the random-peer sentence (golden)", () => {
  it("equals the pinned sentence and the bundle's own text filled", () => {
    const rp = EV.random_peer;
    expect(asSentence(fill(rp.id as TemplateId, rp.slots))).toBe("Drawing 10 major metros at random, with replacement, the chance that Austin beat all 10 on both is 0.934.");
    expect(fill(rp.id as TemplateId, rp.slots)).toBe(producerText(rp.text, rp.slots));
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
  it("agree in number: one metro is, more are", () => {
    const one = EV.caveats.find((c) => c.id === "C1.caveat.not_published")!.slots!.metros;
    expect(fill("C1.caveat.not_published", { metros: one })).toBe("Tampa is not published");
    const two: Slot = { format: "list", metros: [{ cbsa: "45300", label: "Tampa", title: "Tampa-St. Petersburg-Clearwater, FL" }, { cbsa: "13140", label: "Beaumont", title: "Beaumont-Port Arthur, TX" }] };
    expect(fill("C1.caveat.not_published.plural", { metros: two })).toBe("Tampa and Beaumont are not published");
  });
});

describe("the chart's title and subtitle (golden)", () => {
  it("is the H3b title ladder's second rung and the recency subtitle's first", () => {
    expect(EV.chart.title.id).toBe("C1.chart_title.h3b.2");
    expect(fill("C1.chart_title.h3b.2", EV.chart.title.slots)).toBe("No Major Metro Beat Austin on Both Office and Goods-and-Logistics Job Growth, 2019 to 2025");
    expect(EV.chart.dek.id).toBe("C1.chart_dek.recency.1");
    expect(fill("C1.chart_dek.recency.1", EV.chart.dek.slots)).toBe(
      "Industries, not occupations; supersector 60 includes administrative & support services. 2022 to 2025: Austin ranks 17th in office-industry and 5th in goods-and-logistics growth; Beaumont and Tallahassee beat it on both",
    );
  });
});

describe("registered texts", () => {
  it("cover every template id and every ladder rung the bundle uses, word for word", () => {
    const used = [
      ...H.clauses,
      ...EV.caveats,
      EV.random_peer,
      EV.chart.title,
      ...(EV.chart.title.ladder ?? []),
      EV.chart.dek,
      ...(EV.chart.dek.ladder ?? []),
      EV.chart.subject_note!,
      EV.chart.universe_line,
      H.method_line,
    ];
    for (const t of used) {
      expect(isTemplateId(t.id), t.id).toBe(true);
      expect(templateText(t.id as TemplateId), t.id).toBe(t.text);
    }
    expect((EV.chart.title.ladder ?? []).map((r) => r.id)).toEqual(TITLE_LADDER_H3B);
    expect((EV.chart.dek.ladder ?? []).map((r) => r.id)).toEqual(DEK_LADDER_RECENCY);
  });
  it("has a text for every id (the switch is total)", () => {
    for (const id of TEMPLATE_IDS) expect(templateText(id).length).toBeGreaterThan(0);
  });
  it("no longer registers the clause H3b replaced", () => {
    expect(isTemplateId("C1.H3.no_metro_beat_both")).toBe(false);
  });
  it("cover panel B's gate rules, the robustness rows' words, the reasons, the thresholds and the formulas the bundle prints", () => {
    for (const g of METHODS.panel_b.gate) expect(templateText(panelBGateTemplate(g.name)!), g.name).toBe(g.rule);
    for (const [id, row] of Object.entries(METHODS.robustness.rows)) {
      const reg = robustnessRegistered(id);
      expect(reg.kind, id).toBe(row.kind);
      if (reg.rule !== undefined) expect(row.registered.rule, id).toBe(reg.rule);
      if (reg.ranked_by !== undefined) expect(row.registered.ranked_by, id).toBe(reg.ranked_by);
      if (reg.t1 !== undefined) expect(row.registered.window?.t1, id).toBe(reg.t1);
    }
    expect(() => robustnessRegistered("P4")).toThrow(/no registered words for robustness row "P4"/);
    expect(templateText("C1.reason.twins_pending")).toBe(EV.suppressed.find((s) => s.clause === "C1.H3.twins")!.reason);
    expect(templateText("C1.reason.qcew_manufacturing")).toBe(EV.caveats.find((c) => c.id === "C1.caveat.qcew_manufacturing")!.reason);
    expect(templateText("C1.reason.mlc_not_published")).toBe(EV.chart.not_published[0].reason);
    for (const p of EV.preconditions) expect(THRESHOLDS.some((id) => matchTemplate(id, p.threshold) !== null), p.threshold).toBe(true);
    for (const [key, n] of Object.entries(EV.numbers)) {
      if (n.kind === "registered") expect(n.formula, key).toBeUndefined();
      else expect(registeredFormula(n.kind, key, n.formula), key).toBe(n.formula);
    }
    expect(new Set(Object.values(EV.numbers).flatMap((n) => (n.formula ? [n.formula] : [])))).toEqual(new Set(FORMULA_IDS.map(formulaText)));
  });
  it("read a reason form's slots back out of the text, and nothing that is not the form", () => {
    expect(matchTemplate("C1.reason.precondition_fails", "a precondition fails: h3b.no_metro_beat_both.P2, h3b.no_metro_beat_both.P3")).toEqual({ names: "h3b.no_metro_beat_both.P2, h3b.no_metro_beat_both.P3" });
    expect(matchTemplate("C1.reason.ces_not_above", "the 2023 value is not above the 2022 one, so the caveat would say something the cells do not")).toEqual({ y1: "2023", y0: "2022" });
    expect(matchTemplate("C1.threshold.universe_n", "== 150 (prereg flagship.universe.largest_n)")).toEqual({ N: "150" });
    expect(matchTemplate("C1.reason.zero_base", "zero_base")).toEqual({});
    expect(matchTemplate("C1.reason.zero_base", "zero_base; zero_base")).toBeNull();
    expect(matchTemplate("C1.reason.precondition_fails", "a precondition fails: ")).toBeNull();
    expect(matchTemplate("C1.threshold.zero", "== 0.0")).toBeNull();
  });
});

describe("slot formats", () => {
  it("prints a year as written, never with a thousands separator", () => {
    expect(formatSlot("t0", { format: "year", number: "window.t0", value: 2019 })).toBe("2019");
  });
  it("prints a num slot as the bare number and a signedPct slot with its sign and %", () => {
    expect(formatSlot("a", { format: "num", number: "n", value: 35.956493921944976, digits: 1 })).toBe("36.0");
    expect(formatSlot("a", { format: "signedPct", number: "n", value: 35.956493921944976, digits: 1 })).toBe("+36.0%");
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
  it("refuses a missing value, a fractional year, an empty list and a format it does not know rather than print them", () => {
    expect(() => formatSlot("a", { format: "num", number: "n", value: null as unknown as number, digits: 1 })).toThrow(/no finite value/);
    expect(() => formatSlot("t", { format: "year", number: "n", value: 2019.5 })).toThrow(/not a whole number/);
    expect(() => formatSlot("b", { format: "list", metros: [] })).toThrow(/empty list/);
    expect(() => formatSlot("N", { number: "n", value: 1.5 })).toThrow(/not a whole number/);
    expect(() => formatSlot("a", { format: "pct", number: "n", value: 36, digits: 1 } as unknown as Slot)).toThrow(/format "pct", which no template here prints/);
  });
  it("refuses a template whose slot is absent", () => {
    const rest: Record<string, Slot> = { ...H.slots };
    delete rest.a;
    expect(() => fill("C1.H3.ranks", rest)).toThrow(/needs slot \{a\}/);
    expect(placeholders(templateText("C1.H3.ranks"))).toEqual(["t0", "t1", "subject", "a", "b", "r_a", "r_b", "N"]);
  });
});

describe("the status note", () => {
  it("fills its year from the registered window start, window.t0", () => {
    expect(H.slots.t0).toMatchObject({ format: "year", number: "window.t0", value: 2019 });
    expect(statusNote("twins_pending", H.slots.t0)).toBe(
      "Twin-adjusted panel pending: this page is panel A, raw growth ranked among the major metros that publish every component, not against each metro's 2019 twins.",
    );
    expect(statusNote("twins_pending", { format: "year", number: "window.t0", value: 2018 })).toMatch(/each metro's 2018 twins\.$/);
  });
  it("has a note only for statuses it knows", () => {
    expect(() => statusNote("shipped", H.slots.t0)).toThrow(/no status note/);
  });
});
