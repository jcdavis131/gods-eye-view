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
// a reviewed diff in this file and its golden test.
//
// Slot formats. A template carries its own unit ("grew {a}%", "from {v0}k"),
// so a slot prints the bare number: pct and num are num(v, digits), year is
// the integer as written ("2019", never "2,019"), ordinal is "1st", list is
// "A and B", a place slot prints its short label, and a slot with no format
// (the chart title's) must be a whole number and prints as written, the way
// the producer's str.format printed it. Numbers go through
// lib/brief/format.ts. A value that is not a finite number refuses: a
// sentence never says "not published" where a number belongs.

import { joinList } from "@/lib/brief/sentence";
import { num, ordinal } from "@/lib/brief/format";
import type { RobustnessRow, Slot } from "./types";

export const TEMPLATE_IDS = [
  "C1.H3.ranks",
  "C1.H3.no_metro_beat_both",
  "C1.H3.twins",
  "C1.caveat.recency",
  "C1.caveat.ces_manufacturing",
  "C1.caveat.qcew_manufacturing",
  "C1.caveat.not_published",
  "C1.caveat.benchmarked",
  "C1.chart_title.raw",
  "C1.chart_universe",
  "C1.method_line",
  "C1.methods.is.raw",
  "C1.methods.is.ranks",
  "C1.methods.is.descriptive",
  "C1.methods.is_not.twins",
  "C1.methods.is_not.occupations",
  "C1.methods.is_not.causal",
  "C1.methods.panel_b",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

/** The registered text of a template: docs/FLAGSHIP.md HEADLINES and the C1 caveats, word for word. */
export function templateText(id: TemplateId): string {
  switch (id) {
    case "C1.H3.ranks":
      return "From {t0} to {t1} {subject}'s office-industry jobs grew {a}% and its goods-and-logistics jobs {b}%, ranking {r_a} and {r_b} of {N} major metros";
    case "C1.H3.no_metro_beat_both":
      return "no major metro beat {subject} on both";
    case "C1.H3.twins":
      return "its {t0} twins {T1}, {T2} and {T3} grew a median {a_med}% and {b_med}%";
    case "C1.caveat.recency":
      return "from {t0} to {t1} {subject} ranks {r_a} on office-industry and {r_b} on goods-and-logistics growth, and {beat_both} beat it on both";
    case "C1.caveat.ces_manufacturing":
      return "CES shows {subject} manufacturing stepping up from {v0}k ({y0}) to {v1}k ({y1})";
    case "C1.caveat.qcew_manufacturing":
      return "QCEW shows that level from {qcew_period}; the two sources agree at the {t0} and {t1} endpoints";
    case "C1.caveat.not_published":
      return "{metros} is not published";
    case "C1.caveat.benchmarked":
      return "the {t0} and {t1} annual averages are benchmarked";
    case "C1.chart_title.raw":
      return "Job Growth in Office and Goods-and-Logistics Industries, {N} Largest US Metros, {t0} to {t1}";
    case "C1.chart_universe":
      return "The {N} largest US metro areas by {t0} CES total nonfarm jobs; {n_pub} of {N} publish every component";
    case "C1.method_line":
      return "Industry groups standing in for white- and blue-collar work: office = information, finance, professional and business services; goods and logistics = mining, logging, construction, manufacturing, transportation, warehousing and utilities. Industries, not occupations: BLS counts jobs by employer industry. Annual averages, not seasonally adjusted.";
    case "C1.methods.is.raw":
      return "Raw growth of office-industry and goods-and-logistics jobs from {t0} to {t1}, from published CES SM annual averages (M13, not seasonally adjusted), for the {N} largest metros by {t0} CES total nonfarm jobs.";
    case "C1.methods.is.ranks":
      return "Each axis ranked among the metros that publish every component, as competition ranks (1 = fastest).";
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
  }
}

/** The methods page's "is" and "is not" lines, in their registered order. */
export const METHODS_IS: TemplateId[] = ["C1.methods.is.raw", "C1.methods.is.ranks", "C1.methods.is.descriptive"];
export const METHODS_IS_NOT: TemplateId[] = ["C1.methods.is_not.twins", "C1.methods.is_not.occupations", "C1.methods.is_not.causal"];

function finiteOrThrow(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`slot ${what} has no finite value (${JSON.stringify(v)}); a sentence never prints a missing number`);
  return v;
}

/** One slot as printed. The template supplies the unit. */
export function formatSlot(name: string, slot: Slot): string {
  switch (slot.format) {
    case "year": {
      const v = finiteOrThrow(slot.value, name);
      if (!Number.isInteger(v)) throw new Error(`slot ${name} is a year but ${v} is not a whole number`);
      return String(v);
    }
    case "pct":
      return num(finiteOrThrow(slot.value, name), slot.digits);
    case "num":
      return num(finiteOrThrow(slot.value, name), slot.digits ?? 0);
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
  }
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** The placeholder names a template uses, in order of first use. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** A template with every placeholder replaced; a placeholder without a slot throws. */
export function fill(id: TemplateId, slots: Record<string, Slot>): string {
  return templateText(id).replace(PLACEHOLDER, (_, name: string) => {
    const slot = slots[name];
    if (!slot) throw new Error(`template ${id} needs slot {${name}}, which the evidence does not carry`);
    return formatSlot(name, slot);
  });
}

/** The headline: the printed clauses, filled, joined and ended as the evidence says. */
export function headlineSentence(clauses: Array<{ id: TemplateId; printed: boolean }>, slots: Record<string, Slot>, join: string, end: string): string {
  const parts = clauses.filter((c) => c.printed).map((c) => fill(c.id, slots));
  if (parts.length === 0) throw new Error("no clause of the headline is printed");
  return parts.join(join) + end;
}

/** A caveat fragment as a sentence on the page: first letter up, a full stop. */
export function asSentence(fragment: string): string {
  const s = fragment.trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");
}

/** What the bundle's status means on the page; an unknown status refuses rather than print nothing. */
export function statusNote(status: string): string {
  switch (status) {
    case "twins_pending":
      return "Twin-adjusted panel pending: this page is panel A, raw growth ranked among the major metros that publish every component, not against each metro's 2019 twins.";
    default:
      throw new Error(`no status note for bundle status ${JSON.stringify(status)}`);
  }
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
