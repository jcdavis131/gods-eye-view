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
// methods the chart prints, the method line and the methods page's lines,
// panel B's gate rules, each robustness row's rule, ranking or end
// (robustnessRegistered), the reasons a clause or caveat does not print and
// a metro is not published (each form the producer writes, its slots read
// back from the evidence by build.ts), the precondition thresholds, every
// formula (formulaText) and the period a card's Source line prints for a
// cell. The headline's connectives (C1.headline.join, C1.headline.end), the
// precondition names (preconditionForm), the evidence and set keys the
// arithmetic prints (isNumberKey, isSetKey), the pre-registration paths
// (registeredPath), the CES series notes (cellNote) and the parts each
// specification sums (axisParts) are registered here too, so the bundle's
// copies are compared and this side's are printed. Metro names are not
// templates: they come from Atlas's registry (metros.ts). The years and
// counts in the reasons and formulas are placeholders, read back from the
// evidence by build.ts. Each text may print in its own place on the page
// only (ROLE_TEMPLATES), and each slot of it reads the one evidence key its
// template registers (slotPins), in the registered format; the kind and
// sets of every evidence number are read from its key (numberForm). The
// rules_version, the finding's panel, the random peer's k grid, the row R
// window the recency caveat reads, the manufacturing caveat's cells and the
// chart's number formats are registered here too. The status note is this
// side's own sentence, keyed by the bundle status.
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
  "C1.headline.join",
  "C1.headline.end",
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
  "C1.chart.period_annual",
  "C1.chart.cell_note",
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
  "C1.panel_b.gate.bar_result_recorded",
  "C1.panel_b.gate.beats_naive_and_geography_peers",
  "C1.panel_b.gate.stage0_passed",
  "C1.reason.twins_pending",
  "C1.reason.extends_suppressed",
  "C1.reason.precondition_fails",
  "C1.reason.recency_no_window",
  "C1.reason.recency_subject",
  "C1.reason.recency_empty",
  "C1.reason.ces_not_above",
  "C1.reason.ces_no_cell",
  "C1.reason.qcew_manufacturing",
  "C1.reason.mlc_not_published",
  "C1.reason.no_value",
  "C1.reason.zero_base",
  "C1.threshold.zero",
  "C1.threshold.true",
  "C1.threshold.universe_n",
  "C1.threshold.nulls_named",
  "C1.threshold.fail_closed_named",
  "C1.threshold.twins_stable",
  "C1.shaping.omb",
  "C1.shaping.qcew_county",
  "C1.shaping.census_p1",
  "C1.slug",
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
    // What stands between two printed clauses of the headline and after the last one (evidence headline.join and
    // headline.end): the bundle's strings are compared with these, and these are what the headline prints.
    case "C1.headline.join":
      return "; ";
    case "C1.headline.end":
      return ".";
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
    // The period a card's Source line prints for each published cell (sidecar provenance[*].period), by the cell's
    // period code: build.ts periodLabel requires it of every cell the chart cites.
    case "C1.chart.period_annual":
      return "{year} annual average";
    // The note on each published cell's record in the chart's provenance (the downloads carry it): what the series
    // is, by its supersector code and this side's name for it (cesSupersector).
    case "C1.chart.cell_note":
      return "supersector {code} {name}, all employees, not seasonally adjusted, thousands";
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
    // Panel B's gate, rule by rule (methods.json panel_b.gate[*].rule). "{B*}" is the producer's own placeholder for
    // the frozen best baseline, printed as it stands: it is not a slot here, and these texts are compared, never filled.
    case "C1.panel_b.gate.bar_result_recorded":
      return 'The shipped rung\'s bar result is recorded. If the MTNN did not clear, the footer says "twins chosen by {B*}; the learned model did not beat this".';
    case "C1.panel_b.gate.beats_naive_and_geography_peers":
      return "The shipped rung beat naive peers (R0n: same division, ±25% size) and geography-only peers (R0g) on val PS, each with CI lower bound > 0. Otherwise panel B does not ship, and the flagship publishes panel A with the methods note.";
    case "C1.panel_b.gate.stage0_passed":
      return "Stage-0 passed.";
    // Why a clause or a caveat does not print (evidence suppressed[*].reason and caveats[*].reason), in each form the
    // producer writes one (vector-places places/export.py). The page prints them under "Not printed, and why".
    case "C1.reason.twins_pending":
      return "twins_pending: no rung has shipped, so no twin exists (M7-M9 have not run; they wait on RAM)";
    case "C1.reason.extends_suppressed":
      return "the clause it extends (C1.H3.ranks) is suppressed";
    case "C1.reason.precondition_fails":
      return "a precondition fails: {names}";
    case "C1.reason.recency_no_window":
      return "row R's {window} window is not in data/flagship/registered_rows.json";
    case "C1.reason.recency_subject":
      return "the subject is not publishable in row R's window";
    case "C1.reason.recency_empty":
      return "no metro beat the subject on both in row R's window, so the list the caveat names is empty";
    case "C1.reason.ces_not_above":
      return "the {y1} value is not above the {y0} one, so the caveat would say something the cells do not";
    case "C1.reason.ces_no_cell":
      return "no published unfootnoted cell {key}";
    case "C1.reason.qcew_manufacturing":
      return "no QCEW cell after {y1} is in this bundle's evidence (row X1 reads {y0} and {y1}), so the comparison can't be shown from published cells here";
    // Why a metro's value is not published (chart.not_published[*].reason): "; "-joined codes.
    case "C1.reason.mlc_not_published":
      return "mlc_not_published: CES publishes neither 15 nor both 10 and 20";
    case "C1.reason.no_value":
      return "no_value:{key}";
    case "C1.reason.zero_base":
      return "zero_base";
    // The thresholds the precondition table prints (evidence preconditions[*].threshold).
    case "C1.threshold.zero":
      return "== 0";
    case "C1.threshold.true":
      return "== true";
    case "C1.threshold.universe_n":
      return "== {N} (prereg flagship.universe.largest_n)";
    case "C1.threshold.nulls_named":
      return "every metro without a value on both axes is named with its reason";
    case "C1.threshold.fail_closed_named":
      return "every metro that fails closed for twins is named (no twins, still in panel A)";
    case "C1.threshold.twins_stable":
      return ">= 0.8 of draws for each twin shown";
    // What each file that shapes the comparison decides (lib/insights/sources.ts SHAPING), printed in the Universe
    // and Sources sections. These are this side's sentences; build.ts fills them with fillWords from the bundle: the
    // delineation's month and year, the weights' year and the peer set's size and ranking.
    case "C1.shaping.omb":
      return "Which metros there are and what they are called: a metro is a metropolitan statistical area of OMB's {month} {year} delineation, the geography CES rebuilds metro history on, and its member counties are the ones the fail-closed check reads.";
    case "C1.shaping.qcew_county":
      return "The fail-closed check's weights: each member county's {year} QCEW total covered employment; a metro with a member county that has none fails closed for twins.";
    case "C1.shaping.census_p1":
      return "Row P1's peer set: the {n} largest metros by {ranked_by}.";
    // The page's address under /insights: the finding id in lower case and the registered window.
    case "C1.slug":
      return "{finding}-office-goods-job-growth-{t0}-{t1}";
  }
}

/**
 * A template filled with words rather than evidence slots: for this side's
 * own sentences whose values are read from the bundle's structure (a file's
 * year, a set's size), not from an evidence number. A placeholder without a
 * word throws, and so does a word that is not used.
 */
export function fillWords(id: TemplateId, words: Record<string, string>): string {
  const text = templateText(id);
  const used = placeholders(text);
  for (const k of Object.keys(words)) if (!used.includes(k)) throw new Error(`template ${id} has no {${k}}`);
  return text.replace(PLACEHOLDER, (_m: string, name: string) => {
    const w = words[name];
    if (w === undefined || w === "") throw new Error(`template ${id} needs {${name}}`);
    return w;
  });
}

/** The registered template of panel B's gate rule `name`, or null when none is registered (a refusal at build time). */
export function panelBGateTemplate(name: string): TemplateId | null {
  const id = `C1.panel_b.gate.${name}`;
  return isTemplateId(id) ? id : null;
}

/** A precondition's threshold as the table prints it: the registered text, the universe's size in it where it has one. */
export function thresholdText(id: TemplateId, universeN: number): string {
  return id === "C1.threshold.universe_n" ? fillWords(id, { N: String(universeN) }) : fillWords(id, {});
}

/** The precondition thresholds the page may print. */
export const THRESHOLDS: TemplateId[] = ["C1.threshold.zero", "C1.threshold.true", "C1.threshold.universe_n", "C1.threshold.nulls_named", "C1.threshold.fail_closed_named", "C1.threshold.twins_stable"];

/** What a registered precondition gates and the threshold it states; `row` names the specification an H3b row reads. */
export interface PreconditionForm {
  /** "finding" for the finding itself, else the clause it gates. */
  gates: "finding" | TemplateId;
  threshold: TemplateId;
  row?: string;
}

/**
 * The preconditions a C1 evidence may record, by name (the table prints each
 * name, and a reason may print a failing one's): a total switch, so a name the
 * producer invents is a refusal in build.ts, not a row on the page. The H3b
 * rows are one per registered specification: main and the gating rows.
 */
export function preconditionForm(name: string): PreconditionForm | null {
  switch (name) {
    case "universe.n":
      return { gates: "finding", threshold: "C1.threshold.universe_n" };
    case "universe.nulls_named":
      return { gates: "finding", threshold: "C1.threshold.nulls_named" };
    case "universe.fail_closed_named":
      return { gates: "finding", threshold: "C1.threshold.fail_closed_named" };
    case "h3.subject_publishable":
      return { gates: "C1.H3.ranks", threshold: "C1.threshold.true" };
    case "h3.cells_not_annual_or_footnoted":
      return { gates: "C1.H3.ranks", threshold: "C1.threshold.zero" };
    case "h3.twins_stable_in_80pct_of_draws":
      return { gates: "C1.H3.twins", threshold: "C1.threshold.twins_stable" };
    case "h3b.subject_publishable":
    case "h3b.recency_caveat_prints":
      return { gates: "C1.H3b", threshold: "C1.threshold.true" };
  }
  const m = /^h3b\.(?:no_metro_beat_both|not_publishable_cannot_beat_both)\.([A-Za-z0-9]+)$/.exec(name);
  if (m && (m[1] === "main" || GATING_ROWS_H3B.includes(m[1]))) return { gates: "C1.H3b", threshold: "C1.threshold.zero", row: m[1] };
  return null;
}

// ---------------------------------------------------------------- evidence keys the page prints

/** The registered robustness rows (robustnessRegistered has words for each). */
export const ROBUSTNESS_ROWS: readonly string[] = ["D1", "D2", "D3", "E1", "E2", "E3", "P1", "P2", "P3", "R", "X1"];

const KEY_ROW = `(?:main|${ROBUSTNESS_ROWS.join("|")})`;
const KEY_WINDOW = String.raw`\d{4}->(?:\d{4}|mean\([A-Z][a-z]{2} \d{4}-[A-Z][a-z]{2} \d{4}\))`;
const KEY_METRO = String.raw`(?:\d{5}|C\d{4})`;
const KEY_AXIS = "(?:office|goods_logistics|wc|bc)";
const NUMBER_KEYS: RegExp[] = [
  /^window\.t[01]$/,
  /^random_peer\.k$/,
  /^R\.windows\.\d\.t[01]$/,
  /^main\.universe\.n$/,
  /^cell\.SMU\d{17}\|\d{4}\|M(?:0[1-9]|1[0-3])$/,
  new RegExp(`^${KEY_ROW}:${KEY_WINDOW}\\.publishable$`),
  new RegExp(`^${KEY_ROW}:${KEY_WINDOW}\\.${KEY_AXIS}\\.median$`),
  new RegExp(`^${KEY_ROW}:${KEY_WINDOW}\\.${KEY_METRO}\\.${KEY_AXIS}\\.(?:growth_pct|rank)$`),
  new RegExp(`^${KEY_ROW}:${KEY_WINDOW}\\.${KEY_METRO}\\.(?:beat_on_both|beat_on_either|rank_min|not_publishable_could_beat_both|total_nonfarm\\.change|random_peer\\.k\\d{1,3})$`),
];
const SET_KEYS: RegExp[] = [/^main:universe$/, new RegExp(`^${KEY_ROW}:${KEY_WINDOW}:${KEY_AXIS}$`)];

/**
 * Whether `key` is an evidence-number key of a registered form. The
 * arithmetic prints each number's key and the sets it runs over, so a key is
 * a producer text like any other: build.ts refuses one of no registered form
 * (a key that says something rather than names something).
 */
export function isNumberKey(key: string): boolean {
  return NUMBER_KEYS.some((re) => re.test(key)) && numberForm(key) !== null;
}

/** The two axes a specification's rows compare: QCEW's white- and blue-collar industries for X1, else office and goods-and-logistics. */
export function rowAxes(row: string): [string, string] {
  return row === "X1" ? ["wc", "bc"] : ["office", "goods_logistics"];
}

/**
 * What an evidence number of this key is and the sets it runs over, read from the key alone: the arithmetic
 * prints both ("(rank) ... Over the sets ..."), so neither is the producer's to choose. A rank runs over its
 * axis's set, a median over its axis's set, a count, rank_min or probability over the window's two sets,
 * main.universe.n over the universe set; a growth, change, cell or registered value over none. Null for a key of
 * no registered form, or one whose axis is not its row's.
 */
export function numberForm(key: string): { kind: "growth" | "rank" | "count" | "median" | "change" | "cell" | "registered" | "probability"; over: string[] } | null {
  if (/^(?:window\.t[01]|random_peer\.k|R\.windows\.\d\.t[01])$/.test(key)) return { kind: "registered", over: [] };
  if (key === "main.universe.n") return { kind: "count", over: ["main:universe"] };
  if (/^cell\.SMU\d{17}\|\d{4}\|M(?:0[1-9]|1[0-3])$/.test(key)) return { kind: "cell", over: [] };
  const m = new RegExp(`^(${KEY_ROW}):(${KEY_WINDOW})\\.(.+)$`).exec(key);
  if (!m) return null;
  const prefix = `${m[1]}:${m[2]}`;
  const axes = rowAxes(m[1]);
  const pair = axes.map((a) => `${prefix}:${a}`);
  const rest = m[3];
  if (rest === "publishable") return { kind: "count", over: pair };
  const median = /^([a-z_]+)\.median$/.exec(rest);
  if (median) return axes.includes(median[1]) ? { kind: "median", over: [`${prefix}:${median[1]}`] } : null;
  const per = new RegExp(`^${KEY_METRO}\\.(.+)$`).exec(rest);
  if (!per) return null;
  const what = per[1];
  const axis = /^([a-z_]+)\.(growth_pct|rank)$/.exec(what);
  if (axis) {
    if (!axes.includes(axis[1])) return null;
    return axis[2] === "growth_pct" ? { kind: "growth", over: [] } : { kind: "rank", over: [`${prefix}:${axis[1]}`] };
  }
  if (/^(?:beat_on_both|beat_on_either|not_publishable_could_beat_both)$/.test(what)) return { kind: "count", over: pair };
  if (what === "rank_min") return { kind: "rank", over: pair };
  if (what === "total_nonfarm.change") return { kind: "change", over: [] };
  if (/^random_peer\.k\d{1,3}$/.test(what)) return { kind: "probability", over: pair };
  return null;
}

/** Whether `key` is an evidence-set key of a registered form. */
export function isSetKey(key: string): boolean {
  return SET_KEYS.some((re) => re.test(key));
}

/** The pre-registration file the registered numbers are read from (manifest.json inputs). */
export const PREREG_FILE = "registry/prereg.json";

/** Where in the pre-registration a registered number lives, by its key; null for a key that is not a registered number. */
export function registeredPath(key: string): string | null {
  switch (key) {
    case "window.t0":
    case "window.t1":
    case "random_peer.k":
      return `flagship.${key}`;
  }
  const m = /^R\.windows\.(\d)\.(t[01])$/.exec(key);
  return m ? `flagship.registered_rows.R.windows[${m[1]}].${m[2]}` : null;
}

/** The findings this side has sentences for: a total list, like the template families. */
export const FINDING_IDS: readonly string[] = ["C1-raw"];

/** The panel each finding is, as the page prints it ("panel A"): registered, not read from the manifest. */
export const FINDING_PANEL: Readonly<Record<string, string>> = { "C1-raw": "A" };

/**
 * The rules_version these texts are registered under (docs/FLAGSHIP.md, rules_version 4). The page, the CSV and
 * data.json print it; build.ts refuses a bundle whose manifest, evidence or methods name another, and prints this.
 */
export const RULES_VERSION = 4;

/** The random peer's k grid (prereg flagship.random_peer.k_grid): the page prints the probability at each. */
export const RANDOM_PEER_K_GRID: readonly number[] = [5, 10, 20];

/**
 * The window of row R the recency caveat reads: its index among row R's registered windows (prereg
 * flagship.registered_rows.R.windows[1], 2022->2025; docs/FLAGSHIP.md H3b, "row R, 2022->2025").
 */
export const RECENCY_R_WINDOW = 1;

/** The CES supersector and the two years the manufacturing caveat reads (docs/FLAGSHIP.md WHAT THE DATA ALREADY SAYS). */
export const MANUFACTURING = { supersector: "30", years: [2022, 2023] } as const;

/**
 * How the chart prints its numbers: each axis's and the bubble's format and digits, and the gridline step. These
 * decide the unit a printed number claims ("+36%" against "$36"), so they are registered here and the sidecar's
 * must be the same.
 */
export const CHART_AXES = {
  x: { format: "signedPct", digits: 0, step: 10 },
  y: { format: "signedPct", digits: 0, step: 10 },
  size: { format: "num", digits: 1, negative: "outline" },
} as const;

// ---------------------------------------------------------------- the evidence each slot reads

/**
 * What one slot of a template must be. A number slot names one evidence key, of the form given with build.ts's
 * context filled in ({main}: the main specification over the registered window, "main:2019->2025"; {subject}:
 * the subject's CBSA; {recency}: row R's window the recency caveat reads, "R:2022->2025"; {ri}: that window's
 * index among row R's registered windows; {k}: the registered k; {mfg0}, {mfg1}: the subject's CES
 * manufacturing cells at the registered years), and prints in the registered format with the registered digits
 * ("bare": no format, a whole number as written). A place slot is the subject. A list slot names the metros of
 * one count, or (key null) the chart's metros that are not published, which build.ts compares.
 */
export type SlotPin =
  | { kind: "number"; key: string; format: "year" | "num" | "signedPct" | "ordinal" | "bare"; digits?: number; period?: string }
  | { kind: "subject" }
  | { kind: "list"; key: string | null };

const pinYear = (key: string, period?: string): SlotPin => ({ kind: "number", key, format: "year", ...(period ? { period } : {}) });
const pinNum = (key: string, digits = 0): SlotPin => ({ kind: "number", key, format: "num", digits });
const pinSigned = (key: string, digits: number): SlotPin => ({ kind: "number", key, format: "signedPct", digits });
const pinOrdinal = (key: string): SlotPin => ({ kind: "number", key, format: "ordinal" });
const pinBare = (key: string): SlotPin => ({ kind: "number", key, format: "bare" });
const PIN_SUBJECT: SlotPin = { kind: "subject" };
const PIN_WINDOW = { t0: pinYear("window.t0"), t1: pinYear("window.t1") };
const PIN_RECENCY: Record<string, SlotPin> = {
  t0: pinYear("R.windows.{ri}.t0"),
  t1: pinYear("R.windows.{ri}.t1"),
  subject: PIN_SUBJECT,
  r_a: pinOrdinal("{recency}.{subject}.office.rank"),
  r_b: pinOrdinal("{recency}.{subject}.goods_logistics.rank"),
  beat_both: { kind: "list", key: "{recency}.{subject}.beat_on_both" },
};

/**
 * The evidence each slot of a template reads, by placeholder: a total switch. A template a page fills from
 * evidence slots has an entry naming every placeholder; one with no entry (null) has no registered evidence for
 * its slots, so build.ts refuses to print it (the twins clause, the QCEW caveat: neither has evidence to read
 * yet). A slot that names any other evidence key, even one whose value it carries, is a refusal: "2022 to 2025"
 * in the chart title would be a true number in a false sentence.
 */
export function slotPins(id: TemplateId): Readonly<Record<string, SlotPin>> | null {
  switch (id) {
    case "C1.H3.ranks":
      return {
        ...PIN_WINDOW,
        subject: PIN_SUBJECT,
        a: pinNum("{main}.{subject}.office.growth_pct", 1),
        b: pinNum("{main}.{subject}.goods_logistics.growth_pct", 1),
        r_a: pinOrdinal("{main}.{subject}.office.rank"),
        r_b: pinOrdinal("{main}.{subject}.goods_logistics.rank"),
        N: pinNum("{main}.publishable"),
      };
    case "C1.H3b":
      return { subject: PIN_SUBJECT };
    case "C1.random_peer":
      return { k: pinNum("random_peer.k"), subject: PIN_SUBJECT, p: pinNum("{main}.{subject}.random_peer.k{k}", 3) };
    case "C1.caveat.recency":
    case "C1.chart_dek.recency.1":
    case "C1.chart_dek.recency.2":
      return PIN_RECENCY;
    case "C1.caveat.ces_manufacturing":
      return { subject: PIN_SUBJECT, v0: pinNum("cell.{mfg0}", 1), y0: pinYear("cell.{mfg0}", "M13"), v1: pinNum("cell.{mfg1}", 1), y1: pinYear("cell.{mfg1}", "M13") };
    case "C1.caveat.not_published":
    case "C1.caveat.not_published.plural":
      return { metros: { kind: "list", key: null } };
    case "C1.caveat.benchmarked":
      return PIN_WINDOW;
    case "C1.chart_title.raw":
      return { N: pinBare("main.universe.n"), ...PIN_WINDOW };
    case "C1.chart_title.h3b.1":
    case "C1.chart_title.h3b.2":
      return { subject: PIN_SUBJECT, ...PIN_WINDOW };
    case "C1.chart.subject_note":
      return { a: pinSigned("{main}.{subject}.office.growth_pct", 1), b: pinSigned("{main}.{subject}.goods_logistics.growth_pct", 1) };
    case "C1.chart_universe":
      return { N: pinBare("main.universe.n"), t0: pinBare("window.t0"), n_pub: pinBare("{main}.publishable") };
    case "C1.methods.is.raw":
      return { ...PIN_WINDOW, N: pinBare("main.universe.n") };
    case "C1.methods.status":
      return { t0: PIN_WINDOW.t0 };
    case "C1.headline.join":
    case "C1.headline.end":
    case "C1.chart_dek":
    case "C1.method_line":
    case "C1.methods.is.ranks":
    case "C1.methods.is.descriptive":
    case "C1.methods.is_not.twins":
    case "C1.methods.is_not.occupations":
    case "C1.methods.is_not.causal":
    case "C1.methods.panel_b":
      return {};
    default:
      return null;
  }
}

/** A pinned key with build.ts's context filled in; a placeholder the context has no value for throws. */
export function pinnedKey(key: string, ctx: Readonly<Record<string, string | undefined>>): string {
  return key.replace(/\{([a-z0-9]+)\}/g, (_m: string, name: string) => {
    const v = ctx[name];
    if (v === undefined) throw new Error(`no {${name}} to read ${key} with`);
    return v;
  });
}

/** The CES supersectors a C1 chart reads, by code, as the page names them; any other code refuses. */
export function cesSupersector(code: string): string {
  switch (code) {
    case "00":
      return "Total Nonfarm";
    case "10":
      return "Mining and Logging";
    case "15":
      return "Mining, Logging and Construction";
    case "20":
      return "Construction";
    case "30":
      return "Manufacturing";
    case "43":
      return "Transportation, Warehousing, and Utilities";
    case "50":
      return "Information";
    case "55":
      return "Financial Activities";
    case "60":
      return "Professional and Business Services";
    default:
      throw new Error(`no name for CES supersector ${JSON.stringify(code)}`);
  }
}

/** The note on a published CES cell's record: an all-employees, not seasonally adjusted supersector series, named by its code. */
export function cellNote(series: string): string {
  const m = /^SMU\d{2}\d{5}(\d{2})000000(\d{2})$/.exec(series);
  if (!m || m[2] !== "01") throw new Error(`series ${JSON.stringify(series)} is not a not seasonally adjusted, all-employees CES supersector series`);
  return fillWords("C1.chart.cell_note", { code: m[1], name: cesSupersector(m[1]) });
}

/**
 * The parts each registered specification sums on each axis: CES
 * supersectors (MLC: 15, or 10 and 20 where 15 is not published) or, for the
 * QCEW row X1, QCEW industries. D1 puts all of 40 in place of 43, D2 adds 65
 * to the office industries, D3 does both (robustnessRegistered's words).
 */
export function axisParts(row: string, axis: string): string[] {
  const office = ["50", "55", "60"];
  const goods = ["MLC", "30", "43"];
  const parts: Record<string, Record<string, string[]>> = {
    main: { office, goods_logistics: goods },
    D1: { office, goods_logistics: ["MLC", "30", "40"] },
    D2: { office: [...office, "65"], goods_logistics: goods },
    D3: { office: [...office, "65"], goods_logistics: ["MLC", "30", "40"] },
    X1: { wc: ["1023", "1024"], bc: ["1011", "1012", "1013"] },
  };
  for (const r of ["E1", "E2", "E3", "P1", "P2", "P3", "R"]) parts[r] = { office, goods_logistics: goods };
  const got = parts[row]?.[axis];
  if (!got) throw new Error(`no registered parts for ${row}'s ${axis} axis`);
  return got;
}

/** The codes a missing chart value's reason may be made of, "; "-joined. */
export const NOT_PUBLISHED_CODES: TemplateId[] = ["C1.reason.mlc_not_published", "C1.reason.no_value", "C1.reason.zero_base"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A template's text as a regular expression source: its literal parts escaped, each placeholder a non-empty capture. */
function patternOf(t: string): { source: string; names: string[] } {
  const names: string[] = [];
  let source = "";
  let last = 0;
  for (const m of t.matchAll(PLACEHOLDER)) {
    source += `${escapeRegExp(t.slice(last, m.index))}(.+?)`;
    names.push(m[1]);
    last = (m.index as number) + m[0].length;
  }
  source += escapeRegExp(t.slice(last));
  return { source, names };
}

/**
 * The slot strings that make `text` the template text `t`, or null. Each
 * placeholder matches a non-empty run of characters, the literal parts must
 * match exactly, and a placeholder used twice must read the same both times.
 */
function matchText(t: string, text: string): Record<string, string> | null {
  const { source, names } = patternOf(t);
  const got = new RegExp(`^${source}$`, "s").exec(text);
  if (!got) return null;
  const out: Record<string, string> = {};
  for (const [i, n] of names.entries()) {
    if (Object.hasOwn(out, n) && out[n] !== got[i + 1]) return null;
    out[n] = got[i + 1];
  }
  return out;
}

/**
 * The slot strings that make `text` the registered template `id`, or null
 * when it is not that template. Each placeholder matches a non-empty run of
 * characters, the literal parts must match exactly and a placeholder the
 * template uses twice must read the same each time. For texts whose slots
 * are not evidence numbers (precondition names, a cell key, a window label,
 * a year), the caller checks each captured string against the evidence.
 */
export function matchTemplate(id: TemplateId, text: string): Record<string, string> | null {
  return matchText(templateText(id), text);
}

// ---------------------------------------------------------------- where each template may print

/**
 * The templates each place on the page may print, and no other. A registered
 * text in the wrong place is a refusal in build.ts: the H3b clause's words
 * are registered for the headline alone (and its title rungs for the chart
 * title), so they cannot reach the page as a caveat, the random-peer
 * sentence, an extra headline clause or a label, where its gate would not
 * run. No template belongs to two places (sentence.test.ts).
 */
export const ROLE_TEMPLATES = {
  "headline clause": ["C1.H3.ranks", "C1.H3b", "C1.H3.twins"],
  caveat: ["C1.caveat.recency", "C1.caveat.ces_manufacturing", "C1.caveat.qcew_manufacturing", "C1.caveat.not_published", "C1.caveat.not_published.plural", "C1.caveat.benchmarked"],
  "random peer": ["C1.random_peer"],
  "headline connective": ["C1.headline.join", "C1.headline.end"],
  "chart title": ["C1.chart_title.raw", "C1.chart_title.h3b.1", "C1.chart_title.h3b.2"],
  "chart subtitle": ["C1.chart_dek", "C1.chart_dek.recency.1", "C1.chart_dek.recency.2"],
  "subject label": ["C1.chart.subject_note"],
  "universe line": ["C1.chart_universe"],
  "method line": ["C1.method_line"],
} as const satisfies Record<string, readonly TemplateId[]>;

export type TemplateRole = keyof typeof ROLE_TEMPLATES;

/** Whether template `id` may print as a `role`. */
export function mayPrintAs(role: TemplateRole, id: TemplateId): boolean {
  return (ROLE_TEMPLATES[role] as readonly TemplateId[]).includes(id);
}

/**
 * The H3b clause's wording as patterns over any text: the clause itself and
 * each title rung that states it, every slot any run of characters, letter
 * case aside. build.ts refuses an insight in which any of them matches
 * anywhere but the headline, its description and the chart title, and
 * anywhere at all when the clause does not print.
 */
export function h3bWordingPatterns(): RegExp[] {
  return (["C1.H3b", ...TITLE_LADDER_H3B] as TemplateId[]).map((id) => new RegExp(patternOf(templateText(id)).source, "is"));
}

// ---------------------------------------------------------------- formulas

export const FORMULA_IDS = [
  "growth.ces",
  "growth.qcew",
  "rank",
  "rank_min",
  "count.publishable",
  "count.beat_on_both",
  "count.beat_on_either",
  "count.not_publishable_could_beat_both",
  "count.universe",
  "median",
  "cell",
  "change",
  "probability",
] as const;

export type FormulaId = (typeof FORMULA_IDS)[number];

/**
 * How each kind of evidence number is computed, as the evidence's `formula`
 * words it (vector-places places/export.py), word for word. The page prints
 * the formula beside every number it shows, so a formula is a producer text
 * like any other: build.ts refuses one that is not registered here for the
 * number's kind (formulasFor). A formula that names the bundle's own years
 * or counts (count.universe) carries them as placeholders, and build.ts
 * checks each one it reads back (matchFormula) against the evidence.
 */
export function formulaText(id: FormulaId): string {
  switch (id) {
    case "growth.ces":
      return "(X_t1 / X_t0 - 1) x 100, X = the sum over parts of the mean over the end's periods (one period: its value), exact sums of the published text; null if a part is not published or has no value";
    case "growth.qcew":
      return "(L_t1 - L_t0) / L_t0 x 100, L = the sum over parts; a part with any disclosure code masks the metro";
    case "rank":
      return "competition rank among the set's members: 1 + the members with a strictly larger value";
    case "rank_min":
      return "competition rank of min(both axes) among the metros in both sets: 1 + those with a strictly larger minimum";
    case "count.publishable":
      return "the metros with a value on both axes (the members of both sets)";
    case "count.beat_on_both":
      return "the metros in both sets with a strictly larger value than the subject on both axes";
    case "count.beat_on_either":
      return "the metros in both sets, the subject aside, with a strictly larger value on at least one axis";
    case "count.not_publishable_could_beat_both":
      return "a metro of the universe that is not in both sets, checked on each axis it has a value on: it could beat the subject on both if it has no axis, or a strictly larger value than the subject's on every axis it has";
    case "count.universe":
      return "the largest_n metros by CES total nonfarm (00), {year} {period}; rank_{n} and rank_{n1} are the cutoff";
    case "median":
      return "the median of the set's members' values; an odd count gives the middle value, a member's own value";
    case "cell":
      return "the published value";
    case "change":
      return "X_t1 - X_t0, the exact difference of the published values";
    case "probability":
      return "(m / n)^k, exact: k independent uniform draws, with replacement, from the n members of both sets other than the subject, m of which have a strictly smaller value than the subject on both axes (a tie is not a beat); not_beaten lists the n - m others";
  }
}

/** The registered formulas a number of this kind and key may carry; empty for a kind that carries none (a registered value). */
export function formulasFor(kind: string, key: string): FormulaId[] {
  switch (kind) {
    case "growth":
      // Row X1 reads QCEW levels; every other row reads CES annual averages.
      return key.startsWith("X1:") ? ["growth.qcew"] : ["growth.ces"];
    case "rank":
      return key.endsWith(".rank_min") ? ["rank_min"] : ["rank"];
    case "count":
      if (key.endsWith(".publishable")) return ["count.publishable"];
      if (key.endsWith(".beat_on_both")) return ["count.beat_on_both"];
      if (key.endsWith(".beat_on_either")) return ["count.beat_on_either"];
      if (key.endsWith(".not_publishable_could_beat_both")) return ["count.not_publishable_could_beat_both"];
      if (key.endsWith(".universe.n")) return ["count.universe"];
      return [];
    case "median":
      return ["median"];
    case "cell":
      return ["cell"];
    case "change":
      return ["change"];
    case "probability":
      return ["probability"];
    default:
      return [];
  }
}

/** The slot strings that make `formula` the registered formula `id`, or null when it is not that formula. */
export function matchFormula(id: FormulaId, formula: string): Record<string, string> | null {
  return matchText(formulaText(id), formula);
}

/** A number's formula, refused unless it is the registered text for its kind. */
export function registeredFormula(kind: string, key: string, formula: string | undefined): string {
  const ids = formulasFor(kind, key);
  if (formula === undefined || !ids.some((id) => matchFormula(id, formula) !== null)) {
    throw new Error(`evidence number ${key} (${kind}) states the formula ${JSON.stringify(formula ?? null)}, not ${ids.length ? `the registered ${ids.join(" or ")}` : "a registered one"}`);
  }
  return formula;
}

/** The methods page's "is" and "is not" lines, in their registered order. */
export const METHODS_IS: TemplateId[] = ["C1.methods.is.raw", "C1.methods.is.ranks", "C1.methods.is.descriptive"];
export const METHODS_IS_NOT: TemplateId[] = ["C1.methods.is_not.twins", "C1.methods.is_not.occupations", "C1.methods.is_not.causal"];

/**
 * The robustness rows the H3b clause is gated on, as docs/FLAGSHIP.md
 * PRECONDITIONS (H3b, b) registers them: the end years, the definitions and
 * the peer sets. The bundle states the list four times (the evidence's rule,
 * methods.json's gating list, the methods page's gate table and each row's
 * own gates) and build.ts h3bGate requires every one of them to be exactly
 * this set, so a row dropped from all four at once is still a refusal here.
 */
export const GATING_ROWS_H3B: readonly string[] = ["E1", "E2", "E3", "D1", "D2", "D3", "P1", "P2", "P3"];

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

/**
 * The headline: the printed clauses, filled, joined and ended with the
 * registered connectives (C1.headline.join, C1.headline.end). The bundle's own
 * join and end are compared with these in build.ts and never printed.
 */
export function headlineSentence(clauses: Array<{ id: TemplateId; printed: boolean }>, slots: Record<string, Slot>): string {
  const parts = clauses.filter((c) => c.printed).map((c) => fill(c.id, slots));
  if (parts.length === 0) throw new Error("no clause of the headline is printed");
  return parts.join(templateText("C1.headline.join")) + templateText("C1.headline.end");
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

/**
 * The producer's words for what each registered robustness row changes
 * (methods.json robustness.rows[id].registered: a definition or disclosure
 * row's rule, a peers row's ranking, an end-year row's end when it is not a
 * year, a cross-source row's QCEW industries), word for word. A total switch
 * over the registered rows: a row this side has no words for refuses.
 */
export function robustnessRegistered(id: string): { kind: RobustnessRow["kind"]; rule?: string; ranked_by?: string; t1?: string; wc?: string[]; bc?: string[] } {
  switch (id) {
    case "D1":
      return { kind: "definition", rule: "all of 40 (trade, transportation and utilities) in place of 43" };
    case "D2":
      return { kind: "definition", rule: "office-industry plus 65 private education and health" };
    case "D3":
      return { kind: "definition", rule: "D1 and D2 together" };
    case "E1":
    case "E3":
      return { kind: "end_year" };
    case "E2":
      return { kind: "end_year", t1: "the mean of the 12 monthly values Sep 2025-Aug 2026" };
    case "P1":
      return { kind: "peers", ranked_by: "Census 2025 population (POPESTIMATE2025)" };
    case "P2":
    case "P3":
      return { kind: "peers", ranked_by: "CES total nonfarm, 2019 annual average" };
    case "R":
      return { kind: "disclosure", rule: "each named metro's ranks are printed" };
    case "X1":
      return { kind: "cross_source", wc: ["1023", "1024"], bc: ["1011", "1012", "1013"] };
    default:
      throw new Error(`no registered words for robustness row ${JSON.stringify(id)}`);
  }
}

/**
 * What the row changes, from its registered entry, each producer text in it
 * required to be the registered one. A peers row's size is the evidence's
 * count of the metros its sets cover (`n`), which must be the registered
 * largest_n; an end-year row's numeric end is the registered window's.
 */
export function robustnessChange(id: string, row: RobustnessRow, n: number): string {
  const r = row.registered;
  const reg = robustnessRegistered(id);
  if (reg.kind !== row.kind) throw new Error(`robustness row ${id} is a ${row.kind} row; the registered one is a ${reg.kind} row`);
  const same = (field: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`robustness row ${id}'s ${field} reads ${JSON.stringify(got)}, not the registered ${JSON.stringify(want)}`);
  };
  switch (row.kind) {
    case "definition":
    case "disclosure":
      same("rule", r.rule, reg.rule);
      return reg.rule as string;
    case "end_year": {
      if (!r.window) throw new Error(`robustness row ${id} has no registered window`);
      if (typeof r.window.t1 === "string") {
        same("end", r.window.t1, reg.t1);
        return `ends at ${reg.t1}`;
      }
      if (reg.t1 !== undefined) same("end", r.window.t1, reg.t1);
      return `ends at ${r.window.t1}`;
    }
    case "peers":
      same("ranking", r.ranked_by, reg.ranked_by);
      if (r.largest_n !== n) throw new Error(`robustness row ${id} registers the ${r.largest_n} largest metros, but its sets cover ${n}`);
      return `the ${num(n)} largest metros by ${reg.ranked_by}`;
    case "cross_source":
      same("white-collar industries", r.wc, reg.wc);
      same("blue-collar industries", r.bc, reg.bc);
      return `QCEW native metro rows; white-collar = QCEW industries ${(reg.wc as string[]).join(" + ")}; blue-collar = ${(reg.bc as string[]).join(" + ")}`;
  }
}

/**
 * What a row gates, as the robustness table says it: the clause it is a
 * precondition of, or that it is reported only. The H3b clause is quoted only
 * when it prints (`printed`); otherwise the table names it by id and says it
 * does not print, so its words never reach a page whose gate did not hold.
 */
export function gatesCopy(gates: string[], printed: (clause: string) => boolean): string {
  if (gates.length === 0) return "no (reported only)";
  return gates
    .map((g) => {
      switch (g) {
        case "C1.H3b":
          return printed(g) ? 'yes: the clause "no major metro beat it on both"' : "yes: clause C1.H3b, which does not print";
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

/** The period a card's Source line prints for a published cell, by its period code; a code with no words refuses. */
export function periodLabel(year: string, period: string): string {
  switch (period) {
    case "M13":
      return fillWords("C1.chart.period_annual", { year });
    default:
      throw new Error(`no words for the period ${JSON.stringify(period)} of a ${year} cell`);
  }
}

/** "2019->2025" as a reader says it. */
export function windowLabel(w: string): string {
  return w.replace("->", " to ");
}
