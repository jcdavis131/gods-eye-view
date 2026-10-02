// Every sentence an insight page can print, in one file, in the style of
// lib/brief/sentence.ts: a total switch from template id to template text,
// and interpolation only. No language model wrote any of it and nothing
// varies with anything but the slots. The slot values come from the bundle's
// evidence, each one the `value` of a numbers entry with its own provenance;
// build.ts checks that before a template is ever filled.
//
// The producer (vector-places places.export) ships its template texts next
// to the slots. They are not trusted as text: build.ts compares each one
// with the registered text here and refuses the finding on any difference, so
// a wording change upstream is a refusal on this side until it lands here as
// a reviewed diff in this file and its golden test. That covers every
// producer text the page prints: the headline clauses (H3 ranks, the H3b
// clause, the twins clause), the random-peer sentence, the caveats, the
// chart's title and subtitle with their ladders, the subject's label line,
// the universe line, the axis, bubble and median labels and the two estimate
// methods the chart prints, the method line and the methods page's lines.
// The status note is this side's own sentence, keyed by the bundle status.
// Formulas, thresholds and the reasons a value is missing or a clause is
// suppressed are evidence fields, not sentences; the page shows them
// verbatim, labelled as the evidence's, in its tables.
//
// Slot formats. A template that carries its own unit ("grew {a}%", "from
// {v0}k") takes a bare number, a num slot; signedPct prints its own sign and
// unit ("+36.0%") and is used where the template carries none ("{a} / {b}").
// fill() refuses a slot followed by "%" that is not a bare number, so no
// sentence can print "36.0%%" or "+36.0%%". year is the integer as written
// ("2019", never "2,019"), ordinal is "1st", list is "A and B", a place slot
// prints its short label, and a slot with no format (the universe line's)
// must be a whole number and prints as written, the way the producer's
// str.format printed it. Numbers go through lib/brief/format.ts. A value
// that is not a finite number refuses: a sentence never says "not
// published" where a number belongs.

import { joinList } from "@/lib/brief/sentence";
import { num, ordinal, signedPct } from "@/lib/brief/format";
import type { RobustnessRow, Slot } from "./types";

export const TEMPLATE_IDS = [
  "C1.H3.ranks",
  "C1.H3b",
  "C1.H3.twins",
  "C1.random_peer",
  "C1.caveat.recency",
  "C1.caveat.ces_manufacturing",
  "C1.caveat.qcew_manufacturing",
  "C1.caveat.not_published",
  "C1.caveat.not_published.plural",
  "C1.caveat.benchmarked",
  "C1.chart_title.raw",
  "C1.chart_title.h3b.1",
  "C1.chart_title.h3b.2",
  "C1.chart_dek",
  "C1.chart_dek.recency.1",
  "C1.chart_dek.recency.2",
  "C1.chart.subject_note",
  "C1.chart_universe",
  "C1.chart.x_label",
  "C1.chart.y_label",
  "C1.chart.size_label",
  "C1.chart.median_label",
  "C1.chart.growth_method",
  "C1.chart.bubble_method",
  "C1.method_line",
  "C1.methods.is.raw",
  "C1.methods.is.ranks",
  "C1.methods.is.descriptive",
  "C1.methods.is_not.twins",
  "C1.methods.is_not.occupations",
  "C1.methods.is_not.causal",
  "C1.methods.panel_b",
  "C1.methods.status",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

/**
 * The registered text of a template: docs/FLAGSHIP.md HEADLINES, CHART and
 * the C1 caveats as rules_version 4 words them, word for word. The chart's
 * axis, bubble and median labels and its estimate methods have no producer
 * id (the sidecar carries them filled in), so their ids are this side's.
 */
export function templateText(id: TemplateId): string {
  switch (id) {
    case "C1.H3.ranks":
      return "From {t0} to {t1} {subject}'s office-industry jobs grew {a}% and its goods-and-logistics jobs {b}%, ranking {r_a} and {r_b} of {N} major metros";
    case "C1.H3b":
      return "no major metro beat {subject} on both";
    case "C1.H3.twins":
      return "its {t0} twins {T1}, {T2} and {T3} grew a median {a_med}% and {b_med}%";
    case "C1.random_peer":
      return "drawing {k} major metros at random, with replacement, the chance that {subject} beat all {k} on both is {p}";
    case "C1.caveat.recency":
      return "from {t0} to {t1} {subject} ranks {r_a} on office-industry and {r_b} on goods-and-logistics growth, and {beat_both} beat it on both";
    case "C1.caveat.ces_manufacturing":
      return "CES shows {subject} manufacturing stepping up from {v0}k ({y0}) to {v1}k ({y1})";
    case "C1.caveat.qcew_manufacturing":
      return "QCEW shows that level from {qcew_period}; the two sources agree at the {t0} and {t1} endpoints";
    case "C1.caveat.not_published":
      return "{metros} is not published";
    case "C1.caveat.not_published.plural":
      return "{metros} are not published";
    case "C1.caveat.benchmarked":
      return "the {t0} and {t1} annual averages are benchmarked";
    case "C1.chart_title.raw":
      return "Job Growth in Office and Goods-and-Logistics Industries, {N} Largest US Metros, {t0} to {t1}";
    case "C1.chart_title.h3b.1":
      return "No Major Metro Beat {subject} on Both Office-Industry and Goods-and-Logistics Job Growth, {t0} to {t1}";
    case "C1.chart_title.h3b.2":
      return "No Major Metro Beat {subject} on Both Office and Goods-and-Logistics Job Growth, {t0} to {t1}";
    case "C1.chart_dek":
      return "Industries, not occupations; jobs by employer industry and place of work; supersector 60 includes administrative & support services; CES estimates come from a sample survey benchmarked to QCEW once a year";
    case "C1.chart_dek.recency.1":
      return "Industries, not occupations; supersector 60 includes administrative & support services. {t0} to {t1}: {subject} ranks {r_a} in office-industry and {r_b} in goods-and-logistics growth; {beat_both} beat it on both";
    case "C1.chart_dek.recency.2":
      return "Industries, not occupations. {t0} to {t1}: {subject} ranks {r_a} in office-industry and {r_b} in goods-and-logistics growth; {beat_both} beat it on both";
    case "C1.chart.subject_note":
      return "{a} / {b}";
    case "C1.chart_universe":
      return "The {N} largest US metro areas by {t0} CES total nonfarm jobs; {n_pub} of {N} publish every component";
    case "C1.chart.x_label":
      return "Office-industry jobs, change {t0} to {t1}";
    case "C1.chart.y_label":
      return "Goods-and-logistics jobs, change {t0} to {t1}";
    case "C1.chart.size_label":
      return "change in total nonfarm jobs (thousands), {t0} to {t1}";
    case "C1.chart.median_label":
      return "Median metro";
    case "C1.chart.growth_method":
      return "growth = ({t1} / {t0} - 1) x 100 of annual-average jobs summed over CES supersectors 50 + 55 + 60 (horizontal) and MLC + 30 + 43 (vertical), MLC = 15, else 10 + 20; null if a part is not published; CES is a sample survey, benchmarked to QCEW once a year";
    case "C1.chart.bubble_method":
      return "bubble = {t1} - {t0} annual-average total nonfarm jobs (CES 00), thousands";
    case "C1.method_line":
      return "Industry groups standing in for white- and blue-collar work: office = information, finance, professional and business services; goods and logistics = mining, logging, construction, manufacturing, transportation, warehousing and utilities. Industries, not occupations: BLS counts jobs by employer industry. Annual averages, not seasonally adjusted.";
    case "C1.methods.is.raw":
      return "Raw growth of office-industry and goods-and-logistics jobs from {t0} to {t1}, from published CES SM annual averages (M13, not seasonally adjusted), for the {N} largest metros by {t0} CES total nonfarm jobs.";
    case "C1.methods.is.ranks":
      return "Each axis ranked among the metros that publish every component, as competition ranks (1 = the largest growth).";
    case "C1.methods.is.descriptive":
      return "Descriptive: metro scans carry no test (SPEC 8).";
    case "C1.methods.is_not.twins":
      return "Not adjusted for where each metro started: twins and the twin-adjusted panel B are pending.";
    case "C1.methods.is_not.occupations":
      return "Not occupations: jobs are counted by employer industry and place of work.";
    case "C1.methods.is_not.causal":
      return "Not a causal estimate and not a forecast.";
    case "C1.methods.panel_b":
      return "Twin-adjusted panel B is pending the place-model bar: no rung has been through it, so no rung has shipped and no twin exists.";
    case "C1.methods.status":
      return "Twin-adjusted panel pending: this page is panel A, raw growth ranked among the major metros that publish every component, not against each metro's {t0} twins.";
  }
}

/** The methods page's "is" and "is not" lines, in their registered order. */
export const METHODS_IS: TemplateId[] = ["C1.methods.is.raw", "C1.methods.is.ranks", "C1.methods.is.descriptive"];
export const METHODS_IS_NOT: TemplateId[] = ["C1.methods.is_not.twins", "C1.methods.is_not.occupations", "C1.methods.is_not.causal"];

/** The chart title when the H3b clause prints: the first rung every canvas can set wins (render/canvas.ts headlineMisfits). */
export const TITLE_LADDER_H3B: TemplateId[] = ["C1.chart_title.h3b.1", "C1.chart_title.h3b.2"];
/** The chart subtitle when the recency caveat prints: the first rung that fills to at most DEK_LIMIT characters wins. */
export const DEK_LADDER_RECENCY: TemplateId[] = ["C1.chart_dek.recency.1", "C1.chart_dek.recency.2"];
/** The longest subtitle a rung may fill to (the ChartSpec's dek bound). */
export const DEK_LIMIT = 240;

function finiteOrThrow(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`slot ${what} has no finite value (${JSON.stringify(v)}); a sentence never prints a missing number`);
  return v;
}

/** One slot as printed. A num slot is the bare number, its template supplying the unit; signedPct prints its own. */
export function formatSlot(name: string, slot: Slot): string {
  switch (slot.format) {
    case "year": {
      const v = finiteOrThrow(slot.value, name);
      if (!Number.isInteger(v)) throw new Error(`slot ${name} is a year but ${v} is not a whole number`);
      return String(v);
    }
    case "num":
      return num(finiteOrThrow(slot.value, name), slot.digits ?? 0);
    case "signedPct":
      return signedPct(finiteOrThrow(slot.value, name), slot.digits);
    case "ordinal":
      return ordinal(finiteOrThrow(slot.value, name));
    case "list":
      if (slot.metros.length === 0) throw new Error(`slot ${name} is an empty list`);
      return joinList(slot.metros.map((m) => m.label));
    case undefined: {
      if ("cbsa" in slot) return slot.label;
      const v = finiteOrThrow(slot.value, name);
      if (!Number.isInteger(v)) throw new Error(`slot ${name} has no format and ${v} is not a whole number`);
      return String(v);
    }
    default:
      throw new Error(`slot ${name} has format ${JSON.stringify((slot as { format: unknown }).format)}, which no template here prints`);
  }
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The placeholder names a template uses, in order of first use. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * A template with every placeholder replaced. A placeholder without a slot
 * throws, and so does a slot right before a "%" in the template that is not
 * a bare number: the template already prints that unit, so the slot must not.
 */
export function fill(id: TemplateId, slots: Record<string, Slot>): string {
  const text = templateText(id);
  const out = text.replace(PLACEHOLDER, (match: string, name: string, offset: number) => {
    const slot = slots[name];
    if (!slot) throw new Error(`template ${id} needs slot {${name}}, which the evidence does not carry`);
    if (text.charAt(offset + match.length) === "%" && slot.format !== "num") {
      throw new Error(`template ${id} prints "%" after {${name}}, so that slot must be a bare number (format num), not ${JSON.stringify(slot.format ?? null)}`);
    }
    return formatSlot(name, slot);
  });
  if (out.includes("%%")) throw new Error(`template ${id} would print "%%": ${out}`);
  return out;
}

/** The headline: the printed clauses, filled, joined and ended as the evidence says. */
export function headlineSentence(clauses: Array<{ id: TemplateId; printed: boolean }>, slots: Record<string, Slot>, join: string, end: string): string {
  const parts = clauses.filter((c) => c.printed).map((c) => fill(c.id, slots));
  if (parts.length === 0) throw new Error("no clause of the headline is printed");
  return parts.join(join) + end;
}

/** A fragment as a sentence on the page: first letter up, a full stop. */
export function asSentence(fragment: string): string {
  const s = fragment.trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
}

/** The status note's template for a bundle status; an unknown status refuses rather than print nothing. */
export function statusTemplate(status: string): TemplateId {
  switch (status) {
    case "twins_pending":
      return "C1.methods.status";
    default:
      throw new Error(`no status note for bundle status ${JSON.stringify(status)}`);
  }
}

/** What the bundle's status means on the page; its year is the registered window's start (the evidence's window.t0). */
export function statusNote(status: string, t0: Slot): string {
  return fill(statusTemplate(status), { t0 });
}

// ---------------------------------------------------------------- robustness rows

/** The kind of change a registered robustness row makes. */
export function robustnessKind(kind: RobustnessRow["kind"]): string {
  switch (kind) {
    case "definition":
      return "Industry definition";
    case "end_year":
      return "End year";
    case "peers":
      return "Peer set";
    case "disclosure":
      return "Sub-period";
    case "cross_source":
      return "Second source: BLS QCEW";
  }
}

/** What the row changes, built from its registered entry only. */
export function robustnessChange(row: RobustnessRow): string {
  const r = row.registered;
  switch (row.kind) {
    case "definition":
    case "disclosure":
      if (!r.rule) throw new Error(`a ${row.kind} row has no registered rule`);
      return r.rule;
    case "end_year":
      if (!r.window) throw new Error("an end_year row has no registered window");
      return `ends at ${r.window.t1}`;
    case "peers":
      if (r.largest_n == null || !r.ranked_by) throw new Error("a peers row has no registered size or ranking");
      return `the ${num(r.largest_n)} largest metros by ${r.ranked_by}`;
    case "cross_source": {
      const wc = r.wc as string[] | undefined;
      const bc = r.bc as string[] | undefined;
      if (!wc || !bc) throw new Error("a cross_source row has no registered industries");
      return `QCEW native metro rows; white-collar = QCEW industries ${wc.join(" + ")}; blue-collar = ${bc.join(" + ")}`;
    }
  }
}

/** What a row gates, as the robustness table says it: the clause it is a precondition of, or that it is reported only. */
export function gatesCopy(gates: string[]): string {
  if (gates.length === 0) return "no (reported only)";
  return gates
    .map((g) => {
      switch (g) {
        case "C1.H3b":
          return 'yes: the clause "no major metro beat it on both"';
        default:
          throw new Error(`no wording for a row that gates ${JSON.stringify(g)}`);
      }
    })
    .join("; ");
}

/** Column order and label of a robustness axis; office-type axes first. */
export function axisCopy(axis: string): { order: number; label: string } {
  switch (axis) {
    case "office":
      return { order: 0, label: "Office-industry" };
    case "wc":
      return { order: 0, label: "QCEW white-collar" };
    case "goods_logistics":
      return { order: 1, label: "Goods-and-logistics" };
    case "bc":
      return { order: 1, label: "QCEW blue-collar" };
    default:
      throw new Error(`no label for robustness axis ${JSON.stringify(axis)}`);
  }
}

/** "2019->2025" as a reader says it. */
export function windowLabel(w: string): string {
  return w.replace("->", " to ");
}
