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
  ROLE_TEMPLATES,
  TEMPLATE_IDS,
  THRESHOLDS,
  TITLE_LADDER_H3B,
  asSentence,
  axisParts,
  cellNote,
  fill,
  fillWords,
  formatSlot,
  gatesCopy,
  h3bWordingPatterns,
  headlineSentence,
  isNumberKey,
  isSetKey,
  isTemplateId,
  matchFormula,
  matchTemplate,
  mayPrintAs,
  panelBGateTemplate,
  periodLabel,
  placeholders,
  preconditionForm,
  registeredFormula,
  registeredPath,
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
  const sentence = headlineSentence(clauses, H.slots);

  it("equals the pinned sentence for the bundle's slots", () => {
    expect(sentence).toBe(GOLDEN_HEADLINE);
  });

  it("equals the bundle's own clause texts filled with the same slots, joined and ended as the bundle says", () => {
    const printed = H.clauses.filter((c) => c.printed).map((c) => producerText(c.text, H.slots));
    expect(printed.join(H.join) + H.end).toBe(sentence);
  });

  it("joins and ends with the registered connectives, never the bundle's", () => {
    expect([templateText("C1.headline.join"), templateText("C1.headline.end")]).toEqual([H.join, H.end]);
    expect(headlineSentence(clauses, H.slots)).toBe(sentence);
    expect(sentence.endsWith(`on both${templateText("C1.headline.end")}`)).toBe(true);
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
      headlineSentence(H.clauses.map((c) => ({ id: c.id as TemplateId, printed: c.printed })), H.slots),
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
    // Its years are slots, read back from the evidence by build.ts: X1's window and the latest QCEW cell.
    expect(matchTemplate("C1.reason.qcew_manufacturing", EV.caveats.find((c) => c.id === "C1.caveat.qcew_manufacturing")!.reason!)).toEqual({ y1: "2023", y0: "2019" });
    expect(templateText("C1.reason.mlc_not_published")).toBe(EV.chart.not_published[0].reason);
    for (const p of EV.preconditions) expect(THRESHOLDS.some((id) => matchTemplate(id, p.threshold) !== null), p.threshold).toBe(true);
    for (const [key, n] of Object.entries(EV.numbers)) {
      if (n.kind === "registered") expect(n.formula, key).toBeUndefined();
      else expect(registeredFormula(n.kind, key, n.formula), key).toBe(n.formula);
    }
    // Each formula the bundle states is exactly one registered formula, and every registered formula is used.
    const used = new Set(Object.values(EV.numbers).flatMap((n) => (n.formula ? [n.formula] : [])));
    const matched = (f: string) => FORMULA_IDS.filter((id) => matchFormula(id, f) !== null);
    for (const f of used) expect(matched(f), f).toHaveLength(1);
    expect(new Set([...used].flatMap(matched))).toEqual(new Set(FORMULA_IDS));
    // The universe's formula names its year, period and cutoff ranks as slots, which build.ts reads back.
    expect(matchFormula("count.universe", EV.numbers["main.universe.n"].formula!)).toEqual({ year: "2019", period: "M13", n: "150", n1: "151" });
  });
  it("fill this side's own sentences with words read from the bundle, every placeholder and no stray word", () => {
    expect(fillWords("C1.shaping.census_p1", { n: "150", ranked_by: "Census 2025 population (POPESTIMATE2025)" })).toBe("Row P1's peer set: the 150 largest metros by Census 2025 population (POPESTIMATE2025).");
    expect(() => fillWords("C1.shaping.census_p1", { n: "150" })).toThrow(/needs \{ranked_by\}/);
    expect(() => fillWords("C1.shaping.qcew_county", { year: "2019", n: "1" })).toThrow(/has no \{n\}/);
    // No number of their own: each number they print is a word filled from the bundle (a row id like P1 is a name).
    for (const id of ["C1.shaping.omb", "C1.shaping.qcew_county", "C1.shaping.census_p1"] as const) expect(templateText(id), id).not.toMatch(/\b\d/);
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
  it("read a placeholder used twice only when it reads the same both times", () => {
    const reason = EV.caveats.find((c) => c.id === "C1.caveat.qcew_manufacturing")!.reason!;
    expect(matchTemplate("C1.reason.qcew_manufacturing", reason.replace("2023", "2024"))).toBeNull();
    expect(matchTemplate("C1.reason.qcew_manufacturing", reason.replaceAll("2023", "2024"))).toEqual({ y1: "2024", y0: "2019" });
  });
  it("word each period a card's Source line prints, and refuse a period code they have no words for", () => {
    expect(periodLabel("2019", "M13")).toBe("2019 annual average");
    expect(() => periodLabel("2025", "M08")).toThrow(/no words for the period "M08"/);
  });
});

describe("registered names, keys and parts", () => {
  it("know every precondition the bundle records, with its gate and its threshold, and no other", () => {
    for (const p of [...EV.preconditions, ...EV.suppressed.flatMap((s) => s.preconditions)]) {
      const form = preconditionForm(p.name);
      expect(form, p.name).not.toBeNull();
      expect(form!.gates === "finding" ? "C1-raw" : form!.gates, p.name).toBe(p.gates);
      expect(matchTemplate(form!.threshold, p.threshold), p.name).not.toBeNull();
    }
    expect(preconditionForm("h3b.no_metro_beat_both.P4")).toBeNull();
    expect(preconditionForm("h3b.no_metro_beat_both.R")).toBeNull();
    expect(preconditionForm("no major metro beat Austin on both")).toBeNull();
  });
  it("know every evidence key and set key the arithmetic prints, and nothing that says something", () => {
    for (const k of ["window.t0", "R.windows.1.t1", "random_peer.k", "main.universe.n", "cell.SMU48124203000000001|2022|M13", "main:2019->2025.12420.random_peer.k10", "X1:2019->2023.C1242.wc.rank", "E2:2019->mean(Sep 2025-Aug 2026).12420.office.growth_pct", "main:2019->2025.office.median"]) {
      expect(isNumberKey(k), k).toBe(true);
    }
    for (const k of ["main:2019->2025.Austin unbeaten.office.rank", "window.t0 (unbeaten)", "P4:2019->2025.publishable", "main:2019->2025.12420.office.growth_pct; no major metro beat Austin on both"]) expect(isNumberKey(k), k).toBe(false);
    expect(isSetKey("main:universe")).toBe(true);
    expect(isSetKey("R:2022->2025:goods_logistics")).toBe(true);
    expect(isSetKey("main:2019->2025:everyone")).toBe(false);
    for (const [key, n] of Object.entries(EV.numbers)) {
      expect(isNumberKey(key), key).toBe(true);
      for (const s of n.over ?? []) expect(isSetKey(s), s).toBe(true);
    }
  });
  it("place every registered number in the pre-registration", () => {
    for (const [key, n] of Object.entries(EV.numbers)) if (n.kind === "registered") expect(n.registered!.path, key).toBe(registeredPath(key));
    expect(registeredPath("window.t2")).toBeNull();
  });
  it("name each CES series a chart cell reads, and the parts each specification sums", () => {
    expect(cellNote("SMU48124203000000001")).toBe("supersector 30 Manufacturing, all employees, not seasonally adjusted, thousands");
    expect(() => cellNote("SMU48124206500000001")).toThrow(/no name for CES supersector "65"/);
    expect(() => cellNote("SMU48124203000000002")).toThrow(/all-employees/);
    for (const [id, row] of Object.entries(METHODS.robustness.rows)) {
      for (const [axis, parts] of Object.entries((row as unknown as { definitions: Record<string, string[]> }).definitions)) expect(axisParts(id, axis), `${id} ${axis}`).toEqual(parts);
    }
    expect(() => axisParts("P4", "office")).toThrow(/no registered parts/);
  });
});

describe("where each template may print", () => {
  const roles = Object.keys(ROLE_TEMPLATES) as Array<keyof typeof ROLE_TEMPLATES>;
  it("gives no template two places, and the H3b clause the headline alone", () => {
    const all = roles.flatMap((r) => [...ROLE_TEMPLATES[r]]);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(isTemplateId(id), id).toBe(true);
    expect(roles.filter((r) => mayPrintAs(r, "C1.H3b"))).toEqual(["headline clause"]);
    for (const id of TITLE_LADDER_H3B) expect(roles.filter((r) => mayPrintAs(r, id)), id).toEqual(["chart title"]);
  });
  it("places every producer text the bundle prints where it prints", () => {
    for (const c of H.clauses) expect(mayPrintAs("headline clause", c.id as TemplateId), c.id).toBe(true);
    for (const c of EV.caveats) expect(mayPrintAs("caveat", c.id as TemplateId), c.id).toBe(true);
    expect(mayPrintAs("random peer", EV.random_peer.id as TemplateId)).toBe(true);
    expect(mayPrintAs("chart title", EV.chart.title.id as TemplateId)).toBe(true);
    expect(mayPrintAs("chart subtitle", EV.chart.dek.id as TemplateId)).toBe(true);
    expect(mayPrintAs("subject label", EV.chart.subject_note!.id as TemplateId)).toBe(true);
    expect(mayPrintAs("universe line", EV.chart.universe_line.id as TemplateId)).toBe(true);
    expect(mayPrintAs("method line", H.method_line.id as TemplateId)).toBe(true);
    expect(mayPrintAs("headline connective", "C1.headline.join")).toBe(true);
    expect(mayPrintAs("headline connective", "C1.headline.end")).toBe(true);
  });
  it("finds the H3b clause's words in any case and with any subject, and not the recency caveat's", () => {
    const says = (t: string) => h3bWordingPatterns().some((re) => re.test(t));
    expect(says(fill("C1.H3b", H.slots))).toBe(true);
    expect(says("No major metro beat Houston on both.")).toBe(true);
    expect(says(fill("C1.chart_title.h3b.2", EV.chart.title.slots))).toBe(true);
    expect(says(fill("C1.caveat.recency", EV.caveats.find((c) => c.id === "C1.caveat.recency")!.slots!))).toBe(false);
    expect(says(fill("C1.chart_title.raw", { ...EV.chart.title.slots, N: EV.chart.universe_line.slots.N }))).toBe(false);
  });
  it("quotes the H3b clause in the robustness table only when it prints", () => {
    expect(gatesCopy(["C1.H3b"], () => true)).toBe('yes: the clause "no major metro beat it on both"');
    expect(gatesCopy(["C1.H3b"], () => false)).toBe("yes: clause C1.H3b, which does not print");
    expect(h3bWordingPatterns().some((re) => re.test(gatesCopy(["C1.H3b"], () => false)))).toBe(false);
    expect(gatesCopy([], () => true)).toBe("no (reported only)");
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
