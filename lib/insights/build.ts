// A published finding, assembled from a committed places bundle.
//
// buildInsight is pure over a loaded bundle: no clock, no network, no
// randomness. It refuses (throws InsightRefused, naming the reason) unless
// every one of these holds, so a page can only ever render a finding that
// passed them all:
//
//   - the finding's panel is "shipped" in the manifest, its template family
//     is one this file has sentences for (a total switch), and the methods
//     page's status line agrees with the manifest;
//   - every precondition the evidence records has pass: true, every printed
//     clause is gated by at least one of them, and every clause that does not
//     print is listed as suppressed with a reason;
//   - the H3b clause ("no major metro beat {subject} on both") prints only
//     when its own precondition table holds row by row (h3bGate): the main
//     specification and every gating row, each present, evaluated and at
//     zero, the metros that are not publishable checked, the subject
//     publishable and the recency caveat printed with it. The gating rows are
//     the ones sentence.ts registers (GATING_ROWS_H3B), not only the ones the
//     bundle lists, and no count is taken on trust: each is recomputed from
//     its window's sets (recompute.ts) and must agree;
//   - the main specification's sets are the chart's rows, and its counts, the
//     subject's ranks, the medians and the random peer's m and n are what
//     those sets give; so is every count and rank of every robustness row;
//   - every template text in the evidence equals the registered text in
//     sentence.ts and is one its place on the page may print
//     (ROLE_TEMPLATES: the H3b clause in the headline alone, its title rungs
//     in the chart title alone), each ladder is the registered ladder and
//     the chosen rung is the one its rule picks (the title: the first that
//     every canvas can set, measured here with render/canvas.ts; the
//     subtitle: the first that fills to at most 240 characters), and the
//     sentence uses none of the never-used words;
//   - as a backstop to both, the H3b clause's words (in any case, with any
//     subject) appear nowhere in the built insight unless the clause prints,
//     and then only in the headline, its description and the chart title
//     (h3bWordingAt), whatever route they took in: a caveat, the random
//     peer, a label, a reason, a precondition's name;
//   - the years and counts the registered texts carry are read back from the
//     evidence: the QCEW caveat's reason (row X1's window, the latest QCEW
//     cell), the universe formula (the window's start, the period, the two
//     cutoff ranks and their cells) and the period each card's Source line
//     prints for a cell (one the rows read, at an end of the window);
//   - every slot that prints a number names the one evidence number its
//     template registers for it (sentence.ts slotPins: the chart title's
//     years are window.t0/t1, the recency caveat's are row R's registered
//     window, the manufacturing caveat's cells are the subject's supersector
//     30 at the registered years), in the registered format and digits, and
//     its value is that number's, so the printed number carries that entry's
//     formula and published cells; a template with no registered evidence
//     for its slots does not print; a probability's exact fraction is
//     recomputed, over the registered k grid;
//   - every evidence number is the kind, over the sets, that its key says
//     (sentence.ts numberForm); every comparison set reads the cells its
//     window label names (recompute.ts setPeriodProblems), each robustness
//     row is evaluated over its registered windows, and row R's registered
//     years are methods.json's, so a window printed is the window computed;
//   - the reason a caveat or a metro does not print is read back from this
//     side's registered values and the evidence's sets and cells, never from
//     the caveat's own slots: "no_value" names a cell the table does not
//     publish, "not above" compares the registered cells;
//   - the rules_version, the panel and the chart's axis and bubble formats
//     (sentence.ts RULES_VERSION, FINDING_PANEL, CHART_AXES) are this side's,
//     and the bundle's must equal them;
//   - the chart sidecar is a valid ChartSpec whose title, subtitle, subject
//     note, universe line, axis labels and estimate methods are the
//     templates' output, whose rows are exactly the evidence's chart rows
//     with exactly the evidence's values, whose reference lines are the
//     evidence's medians, and whose labels are the evidence's request in its
//     order, which the renderer keeps;
//   - the methods page's lines are the registered ones, every robustness
//     number equals its evidence entry, and every robustness denominator is
//     the size of the universe of the sets its count runs over;
//   - no producer text prints. Every metro is named from Atlas's registry by
//     CBSA (withRegistryNames, registryMetro: the bundle's label and title
//     must be the registry's and are never printed); the headline's join
//     and end are registered connectives; each precondition is a registered
//     name with its registered gate and threshold; every evidence key the
//     arithmetic prints is of a registered form, and a registered number
//     cites the pre-registration at its registered path; every source entry
//     a citation prints is of the fixed form of its fields; and the spec the
//     cards and downloads draw is rebuilt here, with this side's source
//     names, notes, dates, slug and as-of date, from records the sidecar's
//     must equal (lib/insights/taint.test.ts appends a canary to every
//     string of the bundle and finds none printed);
//   - the precondition table is printed as this side recomputes it, row by
//     row (preconditionRow): each value recomputed or read from the one
//     evidence number its name registers, the registered threshold, and the
//     value against it; a name recorded twice, a passing row for a clause
//     that does not print, or a value of neither kind refuses; the universe's
//     size is one number in the set, main.universe.n and the registered
//     largest_n;
//   - every growth, change and cell the evidence holds, and every set
//     member's growth, is recomputed from the published cells it reads
//     (recompute.ts recomputeFromCells), and the peer rows ranked like the
//     universe are its largest metros (recomputePeers).
//
// Timestamps are the bundle's own: asOf from the sidecar, retrievedAt the
// latest retrieval among the chart's provenance records.

import { citation, type Provenance, type SourceRef } from "@/lib/provenance/types";
import { signedPct, num, ordinal } from "@/lib/brief/format";
import { stableHash } from "@/lib/feed/hash";
import { BUNDLES, loadBundle, type LoadedBundle, type LoadedFinding } from "./load";
import { CANVAS_IDS, headlineMisfits, type CanvasId } from "./render/canvas";
import { layoutFrame } from "./render/frame";
import { LABEL_CAP, requestedLabels } from "./render/charts/bubble";
import { isPlotted } from "./render/table";
import { byteCompare, canonicalJson, parseChartSpec, toProvenance, type BubbleSpec, type ChartSpec, type SpecProvenance } from "./render/spec";
import {
  CHART_AXES,
  DEK_LADDER_RECENCY,
  DEK_LIMIT,
  FINDING_IDS,
  FINDING_PANEL,
  GATING_ROWS_H3B,
  MANUFACTURING,
  METHODS_IS,
  NOT_PUBLISHED_CODES,
  PREREG_FILE,
  METHODS_IS_NOT,
  RANDOM_PEER_K_GRID,
  RECENCY_R_WINDOW,
  RULES_VERSION,
  TITLE_LADDER_H3B,
  asSentence,
  axisParts,
  numberForm,
  pinnedKey,
  rowAxes,
  slotPins,
  thresholdText,
  axisCopy,
  cellNote,
  fill,
  fillWords,
  formatSlot,
  headlineSentence,
  h3bWordingPatterns,
  isNumberKey,
  isSetKey,
  isTemplateId,
  matchFormula,
  matchTemplate,
  mayPrintAs,
  panelBGateTemplate,
  placeholders,
  preconditionForm,
  registeredFormula,
  registeredPath,
  periodLabel,
  ROLE_TEMPLATES,
  robustnessChange,
  robustnessRegistered,
  statusNote,
  statusTemplate,
  templateText,
  windowLabel,
  type TemplateId,
  type TemplateRole,
} from "./sentence";
import {
  anchorMainToChart,
  beatOnBoth,
  monthsBetween,
  partOf,
  publishedCell,
  recomputeFromCells,
  recomputeMedian,
  recomputePeers,
  recomputeRandomPeer,
  recomputeSpec,
  seriesOfPart,
  setPeriodProblems,
  windowSets,
} from "./recompute";
import { cbsaOfQcew, metroName, qcewCode, qcewTitle } from "./metros";
import { CES_SM, MONTHS, SHAPING, isoDateOf, sourceEntryProblems, sourceRefById } from "./sources";
import type {
  ArithmeticRow,
  CellCitation,
  Evidence,
  EvidenceNumber,
  FileCitation,
  Insight,
  Methods,
  MetroRef,
  Precondition,
  RobustnessRow,
  RobustnessSummary,
  ShapingSource,
  Slot,
  SourceEntry,
} from "./types";

export class InsightRefused extends Error {
  constructor(finding: string, reason: string) {
    super(`finding ${finding} refused: ${reason}`);
    this.name = "InsightRefused";
  }
}

const TUPLE = ["series_id", "year", "period", "value", "footnote", "url", "sha256", "last_modified"] as const;
/** The fixed form of each printed field of a provenance tuple (the URL, sha256 and Last-Modified must be its source entry's). */
const TUPLE_FORMS = {
  series: /^(?:SMU\d{17}|C\d{4}:own5:\d{4}:agglvl43)$/,
  year: /^\d{4}$/,
  period: /^(?:M(?:0[1-9]|1[0-3])|A)$/,
  value: /^-?\d+(?:\.\d+)?$/,
  footnote: /^[A-Z]?$/,
} as const;
const H3B = "C1.H3b";
const RECENCY = "C1.caveat.recency";
/** The chart's two estimate records, by sidecar key, and the registered method each states. */
const ESTIMATES = { growth: "C1.chart.growth_method", bubble: "C1.chart.bubble_method" } as const satisfies Record<string, TemplateId>;

/** The template families this file can word. A new family is a refusal until it has sentences. */
function templateFamily(template: string): "C1" | null {
  switch (template) {
    case "C1":
      return "C1";
    default:
      return null;
  }
}

function hasNumber(s: Slot): s is Slot & { number: string } {
  return "number" in s && typeof s.number === "string";
}

/** A citation with the file's sha256 and Last-Modified header after it: citation() itself prints neither. */
export function withFile(cite: string, sha256: string, lastModified: string | null, bytes?: number): string {
  return `${cite} sha256 ${sha256}.${lastModified ? ` Last-Modified ${lastModified}.` : ""}${bytes != null ? ` ${num(bytes)} bytes.` : ""}`;
}

/** Years as ISO 8601: one year, or the interval from the first to the last ("2019/2025"). */
export function isoYears(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  if (ys.length === 0) throw new Error("no year to cover");
  return ys.length === 1 ? String(ys[0]) : `${ys[0]}/${ys[ys.length - 1]}`;
}

// ---------------------------------------------------------------- the H3b gate

/**
 * Why the H3b clause may not print, or nothing when its gate holds. The gate
 * is the clause's own precondition table (docs/FLAGSHIP.md PRECONDITIONS,
 * H3b), read row by row against methods.json's gating list, not "every
 * recorded precondition passes": a row whose preconditions were dropped from
 * the table must fail it, and does here.
 */
export function h3bGate(ev: Evidence, methods: Methods): string[] {
  const problems: string[] = [];
  const rows = methods.robustness.gating?.[H3B] ?? [];
  if (rows.length === 0) problems.push("methods.json names no robustness row that gates it");
  // The gating rows are registered here, not only in the bundle: a row dropped from every list the bundle keeps still fails.
  if (canonicalJson([...rows].sort(byteCompare)) !== canonicalJson([...GATING_ROWS_H3B].sort(byteCompare))) {
    problems.push(`methods.json gates it on ${JSON.stringify(rows)}, not the registered rows ${JSON.stringify(GATING_ROWS_H3B)}`);
  }
  const registeredRows = ev.headline.rule?.H3b?.gating_rows;
  if (!registeredRows || canonicalJson([...registeredRows].sort(byteCompare)) !== canonicalJson([...rows].sort(byteCompare))) {
    problems.push(`methods.json gates it on ${JSON.stringify(rows)}, the evidence's registered rule on ${JSON.stringify(registeredRows ?? null)}`);
  }
  const listed = methods.panel_a.headline?.h3b_gates?.rows ?? [];
  if (canonicalJson(listed) !== canonicalJson(["main", ...rows])) problems.push(`the methods page lists its gate as ${JSON.stringify(listed)}, not the main specification and ${JSON.stringify(rows)}`);
  for (const [id, row] of Object.entries(methods.robustness.rows)) {
    if ((row.gates ?? []).includes(H3B) !== rows.includes(id)) problems.push(`robustness row ${id} and the gating list disagree on whether it gates the clause`);
  }

  const pre = (name: string) => ev.preconditions.find((p) => p.name === name);
  /** A count that must be zero, as its precondition records it and as its evidence number says. */
  const zero = (name: string, spec: string, suffix: string): void => {
    const p = pre(name);
    if (!p) {
      problems.push(`precondition ${name} is missing`);
      return;
    }
    if (p.gates !== H3B) problems.push(`precondition ${name} gates ${JSON.stringify(p.gates)}, not ${H3B}`);
    if (p.pass !== true) problems.push(`precondition ${name} does not pass`);
    if (p.threshold !== "== 0" || p.value !== 0) problems.push(`precondition ${name} is ${JSON.stringify(p.value)} against ${JSON.stringify(p.threshold)}; it must be 0 against "== 0"`);
    const n = p.number ? ev.numbers[p.number] : undefined;
    if (!p.number || !n) {
      problems.push(`precondition ${name} names no evidence number`);
      return;
    }
    if (!p.number.startsWith(`${spec}:`) || !p.number.endsWith(`.${ev.subject}.${suffix}`)) problems.push(`precondition ${name} reads ${p.number}, not ${spec}'s ${suffix} for ${ev.subject}`);
    if (n.value !== 0 || (n.metros ?? []).length !== 0) problems.push(`evidence number ${p.number} is ${JSON.stringify(n.value)} (${(n.metros ?? []).join(", ")}), not 0`);
  };
  for (const spec of ["main", ...new Set([...rows, ...GATING_ROWS_H3B])]) {
    zero(`h3b.no_metro_beat_both.${spec}`, spec, "beat_on_both");
    zero(`h3b.not_publishable_cannot_beat_both.${spec}`, spec, "not_publishable_could_beat_both");
    // The counts are not taken on trust: recomputed from the window's sets and the metros' own numbers, they must say the same.
    const key = pre(`h3b.no_metro_beat_both.${spec}`)?.number;
    const suffix = `.${ev.subject}.beat_on_both`;
    if (key?.endsWith(suffix) && key.startsWith(`${spec}:`)) problems.push(...recomputeSpec(ev, key.slice(0, -suffix.length), ev.subject));
    if (spec === "main") continue;
    const row = methods.robustness.rows[spec];
    const p = pre(`h3b.no_metro_beat_both.${spec}`);
    const win = row && p?.window ? row.windows[p.window] : undefined;
    if (!row || !win || !win.axes || !win.publishable || win.publishable.value <= 0) {
      problems.push(`gating row ${spec} is not present and evaluated in methods.json`);
      continue;
    }
    if (!win.beat_on_both || win.beat_on_both.number !== p?.number || win.beat_on_both.value !== 0 || win.beat_on_both.metros.length !== 0) {
      problems.push(`gating row ${spec}'s beat-on-both count in methods.json is not its precondition's 0`);
    }
  }

  const subject = pre("h3b.subject_publishable");
  if (!subject || subject.gates !== H3B || subject.pass !== true || subject.value !== true) problems.push("precondition h3b.subject_publishable is missing or does not hold");
  const row = ev.chart.rows[ev.subject];
  if (!row || typeof ev.numbers[row.x]?.value !== "number" || typeof ev.numbers[row.y]?.value !== "number") problems.push("the subject has no value on both axes");

  const recency = pre("h3b.recency_caveat_prints");
  if (!recency || recency.gates !== H3B || recency.pass !== true || recency.value !== true) problems.push("precondition h3b.recency_caveat_prints is missing or does not hold");
  const caveat = ev.caveats.find((c) => c.id === RECENCY);
  const list = caveat?.slots?.beat_both;
  if (!caveat?.printed || !list || list.format !== "list" || list.metros.length === 0) problems.push("the recency caveat does not print with a non-empty list of the metros that beat the subject on both");
  else {
    // Its ranks and its list are row R's own numbers for the subject, recomputed from that window's sets.
    const prefix = `${caveat.row}:${caveat.window}`;
    const want: Record<string, string> = { r_a: `${prefix}.${ev.subject}.office.rank`, r_b: `${prefix}.${ev.subject}.goods_logistics.rank`, beat_both: `${prefix}.${ev.subject}.beat_on_both` };
    for (const [name, key] of Object.entries(want)) {
      const s = caveat.slots?.[name];
      if (!s || !("number" in s) || s.number !== key) problems.push(`the recency caveat's {${name}} is not ${key}`);
    }
    if (caveat.row !== "R") problems.push(`the recency caveat reads row ${JSON.stringify(caveat.row)}, not R`);
    problems.push(...recomputeSpec(ev, prefix, ev.subject));
  }
  return problems;
}

// ---------------------------------------------------------------- reasons

/** The places in an insight where the H3b clause's words may appear, and only while the clause prints. */
const H3B_PLACES: ReadonlySet<string> = new Set(["headline", "description", "chartTitle", "spec.headline"]);

/**
 * Every place in `value` (an insight, walked down to each string, object keys
 * included) whose text carries the H3b clause's words in any case
 * (sentence.ts h3bWordingPatterns), as a path such as "caveats.2.text".
 * Runs of whitespace read as one space and invisible characters as none.
 */
export function h3bWordingAt(value: unknown): string[] {
  const patterns = h3bWordingPatterns();
  const out: string[] = [];
  const says = (text: string) => {
    const t = text.replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ");
    return patterns.some((re) => re.test(t));
  };
  const walk = (v: unknown, at: string): void => {
    if (typeof v === "string") {
      if (says(v)) out.push(at);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, k) => walk(x, at ? `${at}.${k}` : String(k)));
      return;
    }
    if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        const next = at ? `${at}.${k}` : k;
        if (says(k)) out.push(`${next} (key)`);
        walk(x, next);
      }
    }
  };
  walk(value, "");
  return out;
}

/** The words a peers row ranked on CES total nonfarm starts with; the rest is the period of the cells it ranks on. */
const CES_RANKING = "CES total nonfarm, ";

/**
 * The cells a monthly end reads, "year|Mmm", from its registered words ("the
 * mean of the 12 monthly values Sep 2025-Aug 2026"): every month from the
 * first to the last, which must be as many as the words say; null when the
 * words are not that form.
 */
export function monthlyEnd(words: string): string[] | null {
  const m = /^the mean of the (\d+) monthly values (.+)$/.exec(words);
  const months = m ? monthsBetween(m[2]) : null;
  return m && months && months.length === Number(m[1]) ? months : null;
}

/** The window label a robustness row's evidence keys carry for a monthly end ("2019->mean(Sep 2025-Aug 2026)"), from its registered words. */
function monthlyLabel(t0: number, words: string): string | null {
  const m = /^the mean of the \d+ monthly values (.+)$/.exec(words);
  return m && monthlyEnd(words) ? `${t0}->mean(${m[1]})` : null;
}

/** A registered reason template and the check its captured slots must pass against the evidence. */
type ReasonForm = [TemplateId, (slots: Record<string, string>) => boolean];

/** A CES cell key as the producer writes one: series id, year, period. */
const CELL_KEY = /^SMU\d{17}\|\d{4}\|M\d{2}$/;
/** The producer's Python repr of a list of CES cell keys. */
const CELL_KEY_LIST = /^\['SMU\d{17}\|\d{4}\|M\d{2}'(?:, 'SMU\d{17}\|\d{4}\|M\d{2}')*\]$/;

/** The years of the QCEW cells the evidence holds, from its cell table and the tuples its numbers cite, under `prefix` only when given. */
function qcewYears(ev: Evidence, prefix?: string): number[] {
  const qcew = (s: SourceEntry | undefined) => !!s && s.source.startsWith("qcew");
  const urls = new Set(Object.values(ev.sources).filter(qcew).map((s) => s.url));
  const years: number[] = [];
  for (const [key, n] of Object.entries(ev.numbers)) {
    if (prefix !== undefined && !key.startsWith(prefix)) continue;
    for (const t of n.provenance ?? []) {
      const parts = t.split("|");
      if (urls.has(parts[5])) years.push(Number(parts[1]));
    }
  }
  if (prefix === undefined) {
    for (const [key, bySeries] of Object.entries(ev.cells ?? {})) {
      if (!qcew(ev.sources[key])) continue;
      for (const cells of Object.values(bySeries)) for (const yp of Object.keys(cells)) years.push(Number(yp.split("|")[0]));
    }
  }
  return years;
}

/**
 * The QCEW caveat's reason read back: row X1 is the cross-source row
 * registered over {y0} to {y1} and its numbers read QCEW cells of exactly
 * those two years, and no QCEW cell anywhere in the evidence is after {y1}.
 */
function qcewReasonHolds(ev: Evidence, methods: Methods, y0: string, y1: string): boolean {
  const x1 = methods.robustness.rows.X1;
  const w = x1?.registered.window;
  if (!x1 || x1.kind !== "cross_source" || !w || String(w.t0) !== y0 || String(w.t1) !== y1 || !Object.hasOwn(x1.windows, `${y0}->${y1}`)) return false;
  const all = qcewYears(ev);
  const x1Years = [...new Set(qcewYears(ev, `X1:${y0}->${y1}.`))].sort((a, b) => a - b);
  return all.length > 0 && all.every((y) => y <= Number(y1)) && canonicalJson(x1Years) === canonicalJson([Number(y0), Number(y1)]);
}

/** What a caveat's reason is read back against: row R's registered window the recency caveat reads, and the manufacturing caveat's two cells. */
interface ReasonContext {
  /** prereg flagship.registered_rows.R.windows[RECENCY_R_WINDOW] as a window label, "2022->2025". */
  recencyWindow?: string;
  /** The subject's CES manufacturing cells at the registered years, "series|year|M13". */
  manufacturing?: [string, string];
}

/**
 * The registered forms of the reason a caveat gives when it does not print, by caveat. Each captured slot is
 * read back from this side's registered values and the evidence's sets and cells, never from the caveat's own
 * slots or fields: a reason is printed, so what it says has to be so.
 */
function caveatReasonForms(c: Evidence["caveats"][number], ev: Evidence, methods: Methods, ctx: ReasonContext): ReasonForm[] {
  switch (c.id) {
    case RECENCY: {
      const label = ctx.recencyWindow;
      const prefix = label === undefined ? undefined : `R:${label}`;
      // The window is the registered one, and the caveat says it reads it.
      const registered = label !== undefined && c.row === "R" && c.window === label;
      const evaluated = label !== undefined && (Object.hasOwn(methods.robustness.rows.R?.windows ?? {}, label) || rowAxes("R").some((a) => Object.hasOwn(ev.sets, `R:${label}:${a}`)));
      const sets = prefix !== undefined && typeof windowSets(ev, prefix) !== "string";
      const both = prefix === undefined ? null : beatOnBoth(ev, prefix, ev.subject);
      return [
        ["C1.reason.recency_no_window", (m) => registered && m.window === label && !evaluated],
        ["C1.reason.recency_subject", () => registered && sets && both === null],
        ["C1.reason.recency_empty", () => registered && both !== null && both.length === 0],
      ];
    }
    case "C1.caveat.ces_manufacturing": {
      const keys = ctx.manufacturing;
      /** The cell's value when the table publishes it without a footnote, else null. */
      const unfootnoted = (key: string | undefined): number | null => {
        if (key === undefined) return null;
        const [series, year, period] = key.split("|");
        const cell = publishedCell(ev, series, `${year}|${period}`);
        return cell && cell.footnote === "" ? Number(cell.value) : null;
      };
      const v0 = unfootnoted(keys?.[0]);
      const v1 = unfootnoted(keys?.[1]);
      const [y0, y1] = MANUFACTURING.years.map(String);
      return [
        ["C1.reason.ces_not_above", (m) => m.y0 === y0 && m.y1 === y1 && v0 !== null && v1 !== null && !(v1 > v0)],
        // The producer's Python repr of the two registered cells, one of which the table does not publish unfootnoted.
        ["C1.reason.ces_no_cell", (m) => keys !== undefined && m.key === `[${keys.map((k) => `'${k}'`).join(", ")}]` && CELL_KEY_LIST.test(m.key) && (v0 === null || v1 === null)],
      ];
    }
    case "C1.caveat.qcew_manufacturing":
      return [["C1.reason.qcew_manufacturing", (m) => qcewReasonHolds(ev, methods, m.y0, m.y1)]];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- probabilities

const bigPow = (b: bigint, k: number): bigint => {
  let out = BigInt(1);
  for (let i = 0; i < k; i++) out *= b;
  return out;
};
const bigGcd = (a: bigint, b: bigint): bigint => {
  let x = a;
  let y = b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x;
};

/** The arithmetic of a random-peer probability, recomputed exactly: "(m / n)^k = numerator / denominator", reduced. */
export function randomPeerArithmetic(m: number, n: number, k: number): { numerator: string; denominator: string; text: string } {
  const top = bigPow(BigInt(m), k);
  const bottom = bigPow(BigInt(n), k);
  const g = bigGcd(top, bottom);
  const numerator = (top / g).toString();
  const denominator = (bottom / g).toString();
  return { numerator, denominator, text: `(${m} / ${n})^${k} = ${numerator} / ${denominator}` };
}

// ---------------------------------------------------------------- names

type Refuse = (reason: string) => never;

/**
 * A metro the bundle names, as Atlas's metro registry names it (metros.ts).
 * The bundle's own label and title, where it gives them, must be the
 * registry's; they are compared here and never printed.
 */
export function registryMetro(where: string, m: { cbsa: string; label?: string; title?: string }, refuse: Refuse): MetroRef {
  const reg = metroName(m.cbsa) ?? refuse(`${where} names the metro ${JSON.stringify(m.cbsa)}, which Atlas's metro registry does not have`);
  if (m.label !== undefined && m.label !== reg.label) refuse(`${where} labels ${m.cbsa} ${JSON.stringify(m.label)}; Atlas's metro registry labels it ${JSON.stringify(reg.label)}`);
  if (m.title !== undefined && m.title !== reg.title) refuse(`${where} titles ${m.cbsa} ${JSON.stringify(m.title)}; Atlas's metro registry titles it ${JSON.stringify(reg.title)}`);
  return reg;
}

/** Slots with every place and every list member named from the registry. */
function registrySlots(where: string, slots: Record<string, Slot> | undefined, refuse: Refuse): Record<string, Slot> {
  const out: Record<string, Slot> = {};
  for (const [name, s] of Object.entries(slots ?? {})) {
    if (s.format === "list") out[name] = { ...s, metros: s.metros.map((m) => registryMetro(`${where} slot {${name}}`, m, refuse)) };
    else if (s.format === undefined && "cbsa" in s) out[name] = registryMetro(`${where} slot {${name}}`, s, refuse);
    else out[name] = s;
  }
  return out;
}

/**
 * The evidence with every metro name it would print replaced by the
 * registry's: the slots of the headline, the random peer, the caveats and the
 * chart's title, subtitle, subject note and universe line, the metros that
 * are not published or fail closed, and the label request (checked only:
 * the chart's own rows are renamed where the spec is built). A name that is
 * not the registry's refuses. Only the parts it renames are copied.
 */
export function withRegistryNames(raw: Evidence, refuse: Refuse): Evidence {
  const ch = raw.chart;
  for (const r of ch.labels.requested) registryMetro(`the label request`, { cbsa: r.id, label: r.label }, refuse);
  return {
    ...raw,
    headline: { ...raw.headline, slots: registrySlots("headline", raw.headline.slots, refuse) },
    random_peer: { ...raw.random_peer, slots: registrySlots("random peer", raw.random_peer.slots, refuse) },
    caveats: raw.caveats.map((c) => (c.slots ? { ...c, slots: registrySlots(`caveat ${c.id}`, c.slots, refuse) } : c)),
    chart: {
      ...ch,
      title: { ...ch.title, slots: registrySlots("chart title", ch.title.slots, refuse) },
      dek: { ...ch.dek, slots: registrySlots("chart subtitle", ch.dek.slots, refuse) },
      subject_note: ch.subject_note ? { ...ch.subject_note, slots: registrySlots("subject label", ch.subject_note.slots, refuse) } : null,
      universe_line: { ...ch.universe_line, slots: registrySlots("universe line", ch.universe_line.slots, refuse) },
      not_published: ch.not_published.map((m) => ({ ...registryMetro("the chart's metros that are not published", m, refuse), ...(m.reason !== undefined ? { reason: m.reason } : {}) })),
      fail_closed: ch.fail_closed.map((m) => {
        if (m.qcew_code !== qcewCode(m.cbsa)) refuse(`${m.cbsa} fails closed under the QCEW code ${JSON.stringify(m.qcew_code)}, not ${JSON.stringify(qcewCode(m.cbsa))}`);
        return { ...m, title: registryMetro("the chart's metros that fail closed", m, refuse).title };
      }),
    },
  };
}

/** A metro a robustness row names: a CBSA, or for the QCEW row its area code, whose title is QCEW's (the registry's name and " MSA"). */
function robustnessMetro(where: string, m: { id: string; title: string }, refuse: Refuse): MetroRef {
  const cbsa = cbsaOfQcew(m.id);
  if (cbsa === null) return registryMetro(where, { cbsa: m.id, title: m.title }, refuse);
  const reg = registryMetro(where, { cbsa }, refuse);
  if (m.title !== qcewTitle(reg)) refuse(`${where} titles ${m.id} ${JSON.stringify(m.title)}; QCEW titles ${cbsa} ${JSON.stringify(qcewTitle(reg))}`);
  return reg;
}

// ---------------------------------------------------------------- the build

export function buildInsight(bundle: LoadedBundle, findingId: string): Insight {
  const refuse = (reason: string): never => {
    throw new InsightRefused(findingId, reason);
  };
  const f: LoadedFinding = bundle.findings.find((x) => x.id === findingId) ?? refuse(`not in bundle ${bundle.name}`);
  const { manifest, methods } = bundle;

  // The finding, its panel, its template family and the status line.
  if (!FINDING_IDS.includes(findingId)) refuse(`it is not a finding this side has sentences for (${FINDING_IDS.join(", ")})`);
  const panel = manifest.panels[f.panel];
  if (panel !== "shipped") refuse(`panel ${f.panel} is ${JSON.stringify(panel)}, not shipped`);
  if (!/^[A-Z]$/.test(f.panel)) refuse(`its panel is named ${JSON.stringify(f.panel)}, not a letter`);
  if (!/^v\d+(?:\.\d+)*$/.test(manifest.release) || bundle.name !== `places-${manifest.release}`) refuse(`bundle ${bundle.name} names its release ${JSON.stringify(manifest.release)}`);
  // Every metro the evidence names, by the names in Atlas's registry; the bundle's own labels and titles are only compared.
  const ev: Evidence = withRegistryNames(f.evidence, refuse);
  if (ev.finding_id !== findingId) refuse(`its evidence is for ${JSON.stringify(ev.finding_id)}`);
  if (ev.release !== manifest.release || methods.release !== manifest.release) refuse(`evidence, methods and manifest name different releases`);
  if (ev.status !== manifest.status || methods.status !== manifest.status) refuse(`evidence, methods and manifest disagree on status`);
  if (templateFamily(f.template) === null || ev.template !== f.template) refuse(`no sentences for template ${JSON.stringify(f.template)}`);
  const sl = methods.status_line;
  if (!sl || sl.id !== "C1.methods.status" || sl.slots.status !== manifest.status || sl.slots.panel_a !== manifest.panels.A || sl.slots.panel_b !== manifest.panels.B) {
    refuse("the methods page's status line does not agree with the manifest");
  }
  // A status this side has no note for is refused before anything else is read.
  try {
    statusTemplate(manifest.status);
  } catch (e) {
    refuse((e as Error).message);
  }
  // The rules the texts here are registered under, and the panel the finding is: this side's, which the page prints;
  // the bundle's are compared.
  for (const [what, v] of [["manifest.json", manifest.rules_version], ["the evidence", ev.rules_version], ["methods.json", methods.rules_version]] as const) {
    if (v !== RULES_VERSION) refuse(`${what} names rules_version ${JSON.stringify(v ?? null)}; the templates here are registered under rules_version ${RULES_VERSION}`);
  }
  if (f.panel !== FINDING_PANEL[findingId]) refuse(`the manifest lists it as panel ${JSON.stringify(f.panel)}; ${findingId} is registered as panel ${FINDING_PANEL[findingId]}`);

  // Every evidence number is of a registered key form, and is the kind of number, over the sets, that its key says:
  // the arithmetic prints each one's key, kind and sets.
  for (const [key, n] of Object.entries(ev.numbers)) {
    const form = numberForm(key) ?? refuse(`evidence number ${JSON.stringify(key)} is not a key of a registered form`);
    if (n.kind !== form.kind) refuse(`evidence number ${key} is a ${JSON.stringify(n.kind)}; a key of its form is a ${form.kind}`);
    if (canonicalJson(n.over ?? []) !== canonicalJson(form.over)) refuse(`evidence number ${key} runs over ${JSON.stringify(n.over ?? [])}, not ${JSON.stringify(form.over)}, the sets its key names`);
  }
  // Every set is the row, window and axis its key says, and reads the cells its window names.
  const setProblems = setPeriodProblems(ev, (row) => (methods.robustness.rows[row]?.kind === "cross_source" ? "A" : "M13"));
  if (setProblems.length) refuse(`the evidence's sets do not read the cells their windows name: ${setProblems.slice(0, 5).join("; ")}${setProblems.length > 5 ? `; and ${setProblems.length - 5} more` : ""}`);

  // The registered window and k: registered numbers, read from the pre-registration (each prints with its citation).
  // The window's years are the main specification's, whose sets read the cells of those years (above).
  const registeredInt = (key: string): number => {
    const n = ev.numbers[key];
    if (!n || n.kind !== "registered" || typeof n.value !== "number" || !Number.isInteger(n.value)) return refuse(`evidence number ${key} is not a registered whole number`);
    return n.value;
  };
  const window = { t0: registeredInt("window.t0"), t1: registeredInt("window.t1") };
  if (!(window.t0 < window.t1)) refuse(`the registered window runs from ${window.t0} to ${window.t1}`);
  const mainPrefix = `main:${window.t0}->${window.t1}`;
  const peerK = registeredInt("random_peer.k");
  // Row R's registered windows: each year a registered number states is the one methods.json registers there, and the
  // recency caveat reads the registered window RECENCY_R_WINDOW (whose sets read that window's cells).
  const rRow = methods.robustness.rows.R;
  for (const [key, n] of Object.entries(ev.numbers)) {
    const m = /^R\.windows\.(\d)\.(t[01])$/.exec(key);
    if (!m) continue;
    const reg = rRow?.registered.windows?.[Number(m[1])]?.[m[2] as "t0" | "t1"];
    if (reg === undefined || n.value !== reg) refuse(`registered number ${key} is ${JSON.stringify(n.value)}; methods.json registers row R's window ${m[1]} ${m[2]} as ${JSON.stringify(reg ?? null)}`);
  }
  const rWin = rRow?.registered.windows?.[RECENCY_R_WINDOW];
  const recencyWindow = rWin && Number.isInteger(rWin.t0) && Number.isInteger(rWin.t1) ? `${rWin.t0}->${rWin.t1}` : undefined;
  // The subject's CES manufacturing cells at the registered years, in the state its own main series are published under.
  const subjectStates = new Set(
    ["office", "goods_logistics"]
      .flatMap((a) => (ev.sets[`${mainPrefix}:${a}`]?.members[ev.subject] as { series?: string[] } | undefined)?.series ?? [])
      .map((s) => /^SMU(\d{2})(\d{5})/.exec(s))
      .filter((m): m is RegExpExecArray => m !== null && m[2] === ev.subject)
      .map((m) => m[1]),
  );
  const mfgSeries = subjectStates.size === 1 ? `SMU${[...subjectStates][0]}${ev.subject}${MANUFACTURING.supersector}00000001` : undefined;
  const manufacturing = mfgSeries === undefined ? undefined : (MANUFACTURING.years.map((y) => `${mfgSeries}|${y}|M13`) as [string, string]);
  /** What a slot's registered evidence key is read with (sentence.ts slotPins). */
  const pinContext: Record<string, string | undefined> = {
    main: mainPrefix,
    subject: ev.subject,
    k: String(peerK),
    ri: String(RECENCY_R_WINDOW),
    recency: recencyWindow === undefined ? undefined : `R:${recencyWindow}`,
    mfg0: manufacturing?.[0],
    mfg1: manufacturing?.[1],
  };

  // Preconditions: every one passes.
  if (ev.preconditions.length === 0) refuse("the evidence records no preconditions");
  const failing = ev.preconditions.filter((p) => p.pass !== true);
  if (failing.length) refuse(`precondition ${failing.map((p) => `${p.name} (value ${JSON.stringify(p.value)}, needs ${p.threshold})`).join("; ")} does not pass`);
  if (!ev.preconditions.some((p) => p.gates === findingId)) refuse("no precondition gates the finding itself");
  // The precondition table prints each one's name, what it gates, its value and its threshold: the name a registered
  // precondition, the gate and the threshold its registered ones, and a value read from an evidence number the
  // value of that number. A suppressed clause's preconditions print by name in its reason, so they are held to it too.
  for (const p of [...ev.preconditions, ...ev.suppressed.flatMap((s) => s.preconditions ?? [])]) {
    const form = preconditionForm(p.name) ?? refuse(`precondition ${JSON.stringify(p.name)} is not a registered precondition`);
    const gates = form.gates === "finding" ? findingId : form.gates;
    if (p.gates !== gates) refuse(`precondition ${p.name} gates ${JSON.stringify(p.gates)}; registered, it gates ${gates}`);
    if (matchTemplate(form.threshold, p.threshold) === null) refuse(`precondition ${p.name} states the threshold ${JSON.stringify(p.threshold)}, which is not its registered one (${form.threshold})`);
    if (p.number !== undefined && !isNumberKey(p.number)) refuse(`precondition ${p.name} reads ${JSON.stringify(p.number)}, which is not an evidence key of a registered form`);
    if (p.value !== null && typeof p.value !== "number" && typeof p.value !== "boolean") refuse(`precondition ${p.name}'s value ${JSON.stringify(p.value)} is not a number or true or false`);
  }
  for (const p of [...ev.preconditions, ...ev.suppressed.flatMap((s) => s.preconditions ?? [])]) {
    // The result the row prints is its value against its threshold, where the threshold is a comparison.
    const form = preconditionForm(p.name) as NonNullable<ReturnType<typeof preconditionForm>>;
    const holds =
      form.threshold === "C1.threshold.zero" ? p.value === 0 : form.threshold === "C1.threshold.true" ? p.value === true : form.threshold === "C1.threshold.universe_n" ? String(p.value) === matchTemplate(form.threshold, p.threshold)?.N : undefined;
    if (holds !== undefined && holds !== p.pass) refuse(`precondition ${p.name} says it ${p.pass ? "passes" : "fails"}, but ${JSON.stringify(p.value)} against ${JSON.stringify(p.threshold)} ${holds ? "holds" : "does not hold"}`);
  }
  for (const p of ev.preconditions) {
    if (p.number === undefined) continue;
    const n = ev.numbers[p.number] ?? refuse(`precondition ${p.name} reads evidence number ${p.number}, which does not exist`);
    if (n.value !== p.value) refuse(`precondition ${p.name} prints ${JSON.stringify(p.value)}, but its evidence number ${p.number} is ${JSON.stringify(n.value)}`);
  }
  // The universe's size, printed three times (the table's value, its threshold's N and the universe line's {N}): the
  // main:universe set's size, main.universe.n and the pre-registered largest_n, all one number.
  const universeN = ev.numbers["main.universe.n"];
  const universeSize = Object.keys(ev.sets["main:universe"]?.members ?? {}).length;
  if (!universeN || universeN.value !== universeSize || universeN.registered_n !== universeSize) {
    refuse(`main.universe.n is ${JSON.stringify(universeN?.value ?? null)} (registered largest_n ${JSON.stringify(universeN?.registered_n ?? null)}), but the main:universe set holds ${universeSize} metros`);
  }
  {
    const p = ev.preconditions.find((x) => x.name === "universe.n") ?? refuse("the evidence records no universe.n precondition");
    const threshold = matchTemplate("C1.threshold.universe_n", p.threshold);
    if (p.number !== "main.universe.n" || p.value !== universeSize || threshold?.N !== String(universeSize)) {
      refuse(`precondition universe.n prints ${JSON.stringify(p.value)} against ${JSON.stringify(p.threshold)} from ${JSON.stringify(p.number ?? null)}, but main.universe.n, the main:universe set and the registered largest_n are ${universeSize}`);
    }
  }
  // The values the table prints for the named-metro preconditions are the counts of the metros the chart names.
  for (const [name, named] of [["universe.nulls_named", ev.chart.not_published.map((m) => m.cbsa)], ["universe.fail_closed_named", ev.chart.fail_closed.map((m) => m.cbsa)]] as const) {
    const p = ev.preconditions.find((x) => x.name === name);
    if (p && (p.value !== named.length || canonicalJson([...(p.metros ?? [])].sort(byteCompare)) !== canonicalJson([...named].sort(byteCompare)))) refuse(`precondition ${name} counts ${JSON.stringify(p.value)} (${(p.metros ?? []).join(", ")}), the chart names ${named.length} (${named.join(", ")})`);
  }

  // The numbers behind every slot.
  // A year slot that cites a published cell prints the cell's year, so it is
  // checked against the tuple's year field; every other numeric slot prints
  // the number's value itself; a list slot prints the metros the count names.
  const numberOf = (where: string, name: string, s: Slot): EvidenceNumber | null => {
    if (!hasNumber(s)) return null;
    const n = ev.numbers[s.number] ?? refuse(`${where} slot {${name}} names evidence number ${s.number}, which does not exist`);
    const bad = (got: unknown) => refuse(`${where} slot {${name}} is ${JSON.stringify(got)}, evidence number ${s.number} does not say so`);
    if (s.format === "year" && n.kind !== "registered") {
      if (n.provenance.length === 0) bad(s.value);
      for (const t of n.provenance) {
        const [, year, period] = t.split("|");
        if (year !== String(s.value) || (s.period !== undefined && period !== s.period)) bad(s.value);
      }
    } else if (s.format === "list") {
      // The same metros; the slot orders them for reading, the number by id.
      const named = [...(n.metros ?? [])].sort(byteCompare).join(",");
      const listed = s.metros.map((m) => m.cbsa).sort(byteCompare);
      if (n.value !== listed.length || named !== listed.join(",")) bad(listed);
    } else if ("value" in s && n.value !== s.value) bad(s.value);
    return n;
  };
  /**
   * Every placeholder's slot is the evidence its template registers for it (sentence.ts slotPins): the subject, the
   * count a list names, or the one evidence key, in the registered format and digits. A slot that carries a true
   * number of another key ("2022" in the chart title from row R's window) is a refusal, as is a template that has
   * no registered evidence for its slots.
   */
  const pinSlots = (where: string, id: TemplateId, slots: Record<string, Slot>): void => {
    const pins = slotPins(id) ?? refuse(`${where} uses template ${id}, which has no registered evidence for its slots, so it may not print`);
    for (const name of placeholders(templateText(id))) {
      const pin = pins[name] ?? refuse(`${where}: template ${id} registers no evidence for {${name}}`);
      const s = slots[name] ?? refuse(`${where} has no slot {${name}}`);
      if (pin.kind === "subject") {
        if (s.format !== undefined || !("cbsa" in s) || s.cbsa !== ev.subject) refuse(`${where} slot {${name}} is not the subject ${ev.subject}`);
        continue;
      }
      let key: string | null;
      try {
        key = pin.key === null ? null : pinnedKey(pin.key, pinContext);
      } catch (e) {
        return refuse(`${where} slot {${name}}: ${(e as Error).message}`);
      }
      if (pin.kind === "list") {
        const got = s.format === "list" ? (s.number ?? null) : undefined;
        if (got !== key) refuse(`${where} slot {${name}} lists ${JSON.stringify(got ?? null)}, not the metros of ${JSON.stringify(key)}, the evidence its template registers`);
        continue;
      }
      const got = hasNumber(s) && !("cbsa" in s) ? s.number : null;
      if (got !== key) refuse(`${where} slot {${name}} reads ${JSON.stringify(got)}, not ${key}, the evidence its template registers`);
      const format = pin.format === "bare" ? undefined : pin.format;
      if (s.format !== format) refuse(`${where} slot {${name}} prints as ${JSON.stringify(s.format ?? null)}, not the registered ${JSON.stringify(format ?? null)}`);
      const { digits, period } = s as { digits?: number; period?: string };
      const wantDigits = pin.format === "num" || pin.format === "signedPct" ? (pin.digits ?? 0) : undefined;
      if ((wantDigits === undefined ? digits : (digits ?? 0)) !== wantDigits) refuse(`${where} slot {${name}} prints ${JSON.stringify(digits ?? null)} digits, not the registered ${JSON.stringify(wantDigits ?? null)}`);
      if (period !== pin.period) refuse(`${where} slot {${name}} is for the period ${JSON.stringify(period ?? null)}, not the registered ${JSON.stringify(pin.period ?? null)}`);
    }
  };
  const checkSlots = (where: string, id: TemplateId, slots: Record<string, Slot>): string => {
    pinSlots(where, id, slots);
    for (const [name, s] of Object.entries(slots)) {
      numberOf(where, name, s);
      if (s.format === undefined && "cbsa" in s && s.cbsa !== ev.subject) refuse(`${where} slot {${name}} is ${s.cbsa}, the subject is ${ev.subject}`);
    }
    try {
      return fill(id, slots);
    } catch (e) {
      return refuse(`${where}: ${(e as Error).message}`);
    }
  };
  /** A number's formula as the page prints it: the registered text for its kind, or a refusal. */
  const formulaOf = (key: string, n: EvidenceNumber): string => {
    try {
      return registeredFormula(n.kind, key, n.formula);
    } catch (e) {
      return refuse((e as Error).message);
    }
  };
  /** A producer text in its place on the page: a registered template, one that place may print (ROLE_TEMPLATES), word for word. */
  const registered = (where: string, id: string, text: string, role: TemplateRole): TemplateId => {
    if (!isTemplateId(id)) return refuse(`${where} uses template ${id}, which has no registered text`);
    if (!mayPrintAs(role, id)) refuse(`${where} uses template ${id}, which a ${role} may not print (only ${ROLE_TEMPLATES[role].join(", ")})`);
    if (text !== templateText(id)) refuse(`${where} template ${id} reads ${JSON.stringify(text)}, not the registered text`);
    return id;
  };

  // The headline, and the H3b clause's own gate.
  const h = ev.headline;
  if (!h.primary) refuse("its headline is not primary");
  const clauses = h.clauses.map((c) => ({ id: registered("headline", c.id, c.text, "headline clause"), printed: c.printed }));
  if (new Set(clauses.map((c) => c.id)).size !== clauses.length) refuse(`the headline lists a clause twice: ${clauses.map((c) => c.id).join(", ")}`);
  // The clauses in their registered order, and the H3b clause only after the ranks it extends.
  if (canonicalJson(clauses.map((c) => c.id)) !== canonicalJson(ROLE_TEMPLATES["headline clause"])) refuse(`the headline's clauses are ${JSON.stringify(clauses.map((c) => c.id))}, not the registered ${JSON.stringify(ROLE_TEMPLATES["headline clause"])} in that order`);
  if (clauses.some((c) => c.id === H3B && c.printed) && !clauses.some((c) => c.id === "C1.H3.ranks" && c.printed)) refuse("the H3b clause prints without the ranks clause it extends");
  for (const c of clauses) {
    if (c.printed && !ev.preconditions.some((p) => p.gates === c.id)) refuse(`clause ${c.id} prints but no precondition gates it`);
    if (!c.printed && !ev.suppressed.some((s) => s.clause === c.id && s.reason)) refuse(`clause ${c.id} does not print and is not listed as suppressed`);
    if (methods.panel_a.headline?.clauses?.[c.id] !== c.printed) refuse(`the methods page and the evidence disagree on whether clause ${c.id} prints`);
  }
  // A suppressed entry prints its clause id under "Not printed, and why", and a precondition its gates in the table:
  // each is a clause of this headline (a suppressed one, one that does not print) or the finding itself.
  for (const s of ev.suppressed) {
    if (!clauses.some((c) => c.id === s.clause && !c.printed)) refuse(`the evidence suppresses ${JSON.stringify(s.clause)}, which is not a headline clause that does not print`);
  }
  for (const p of ev.preconditions) {
    if (p.gates !== findingId && !clauses.some((c) => c.id === p.gates)) refuse(`precondition ${p.name} gates ${JSON.stringify(p.gates)}, which is neither the finding nor a clause of its headline`);
    // The table is the preconditions that hold for what prints: one that gates a clause that does not print belongs
    // to that clause's suppressed entry, not to a row that says "pass".
    if (p.gates !== findingId && !clauses.some((c) => c.id === p.gates && c.printed)) refuse(`precondition ${p.name} passes and gates ${p.gates}, which does not print`);
  }
  if (new Set(ev.caveats.map((c) => c.id)).size !== ev.caveats.length) refuse(`the evidence lists a caveat twice: ${ev.caveats.map((c) => c.id).join(", ")}`);
  const h3bPrinted = clauses.some((c) => c.id === H3B && c.printed);
  if (h3bPrinted) {
    const problems = h3bGate(ev, methods);
    if (problems.length) refuse(`the H3b clause prints but its gate does not hold: ${problems.join("; ")}`);
  }
  for (const c of clauses.filter((x) => x.printed)) checkSlots("headline", c.id, h.slots);
  // What stands between the clauses and after the last: the registered connectives, which the bundle's must equal.
  for (const [what, got, id] of [["joins its clauses with", h.join, "C1.headline.join"], ["ends with", h.end, "C1.headline.end"]] as const) {
    if (got !== templateText(id)) refuse(`the headline ${what} ${JSON.stringify(got)}, not the registered ${id} ${JSON.stringify(templateText(id))}`);
  }
  let headline: string;
  try {
    headline = headlineSentence(clauses, h.slots);
  } catch (e) {
    return refuse(`headline: ${(e as Error).message}`);
  }
  for (const word of h.never_used) {
    if (new RegExp(`\\b${word.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i").test(headline)) refuse(`the headline uses the never-used word ${JSON.stringify(word)}`);
  }
  const subject = h.slots.subject;
  if (!subject || subject.format !== undefined || !("cbsa" in subject) || subject.cbsa !== ev.subject) return refuse("the headline has no subject slot for the evidence's subject");
  const methodLine = templateText(registered("method line", h.method_line.id, h.method_line.text, "method line"));

  // The registered window: both ends are registered numbers, read from the pre-registration. The headline's slots are
  // these (slotPins); the labels, the methods lines and the status note are filled with this side's.
  for (const [name, key] of [["t0", "window.t0"], ["t1", "window.t1"]] as const) {
    const s = h.slots[name];
    if (!s || s.format !== "year" || s.number !== key) refuse(`the headline's {${name}} is not the registered ${key}`);
  }
  const t0: Slot = { format: "year", number: "window.t0", value: window.t0 };
  const t1: Slot = { format: "year", number: "window.t1", value: window.t1 };
  const windowSlots: Record<string, Slot> = { t0, t1 };

  // main.universe.n's formula names the cells it ranks on ("2019 M13") and the two ranks either side of the cutoff
  // ("rank_150 and rank_151"): each is read back here, from the window, the universe set and the two cells it cites.
  {
    const u = ev.sets["main:universe"];
    const n = universeN.value as number;
    const got = universeN.formula === undefined ? null : matchFormula("count.universe", universeN.formula);
    const ends = u?.periods?.t0 ?? [];
    const cut = u?.cutoff ?? {};
    const inside = cut[`rank_${n}`];
    const outside = cut[`rank_${n + 1}`];
    const valueOf = (cbsa: string) => (u?.members[cbsa] as { value?: unknown } | undefined)?.value;
    const values = Object.keys(u?.members ?? {}).map(valueOf);
    const problems: string[] = [];
    if (!got) problems.push("it is not the registered count.universe formula");
    else {
      if (ends.length !== 1 || ends[0][0] !== window.t0 || got.year !== String(window.t0) || got.period !== ends[0][1]) problems.push(`it ranks on ${got.year} ${got.period}, the universe set on ${JSON.stringify(ends)} and the window starts in ${window.t0}`);
      if (got.n !== String(n) || got.n1 !== String(n + 1) || universeN.registered_n !== n) problems.push(`it names rank_${got.n} and rank_${got.n1}, the universe holds ${n} metros (registered ${JSON.stringify(universeN.registered_n ?? null)})`);
    }
    if (canonicalJson(Object.keys(cut).sort(byteCompare)) !== canonicalJson([`rank_${n}`, `rank_${n + 1}`].sort(byteCompare)) || !inside || !outside) problems.push(`the universe set's cutoff is ${JSON.stringify(Object.keys(cut))}, not rank_${n} and rank_${n + 1}`);
    else {
      if (!Object.hasOwn(u.members, inside.cbsa) || Object.hasOwn(u.members, outside.cbsa)) problems.push(`rank_${n} (${inside.cbsa}) is not the last metro in or rank_${n + 1} (${outside.cbsa}) not the first one out`);
      if (values.some((v) => typeof v !== "number" || v < inside.value) || !values.includes(inside.value) || !(outside.value <= inside.value)) problems.push(`rank_${n}'s ${inside.value} is not the smallest member value, or rank_${n + 1}'s ${outside.value} is above it`);
      const cells = universeN.provenance.map((t) => t.split("|"));
      const want = [inside, outside];
      const ok =
        cells.length === 2 &&
        cells.every(([series, year, period, value], k) => series.slice(5, 10) === want[k].cbsa && series.slice(10) === "0000000001" && year === String(window.t0) && period === ends[0]?.[1] && Number(value) === want[k].value);
      if (!ok) problems.push(`its cells are not the total nonfarm ${window.t0} cells of rank_${n} and rank_${n + 1}`);
    }
    if (problems.length) refuse(`main.universe.n's formula ${JSON.stringify(universeN.formula ?? null)} does not read back from the evidence: ${problems.join("; ")}`);
  }

  // The main specification, recomputed from its sets: the chart's rows are its universe and read its numbers, and
  // the subject's ranks, the publishable count, the beat-on-both and not-publishable counts, the medians and the
  // random peer's m and n are what the sets say, not only what the evidence numbers say.
  const nSlot = h.slots.N;
  const nCounts = nSlot && hasNumber(nSlot) && nSlot.number.endsWith(".publishable") ? nSlot.number.slice(0, -".publishable".length) : refuse("the headline's {N} is not a publishable count");
  if (nCounts !== mainPrefix) refuse(`the headline's {N} counts ${nCounts}, not the main specification over the registered window`);
  // The medians the reference lines print are the main sets', axis by axis.
  if (canonicalJson(Object.keys(ev.chart.medians).sort(byteCompare)) !== canonicalJson(["goods_logistics", "office"])) refuse(`the chart's medians are for ${JSON.stringify(Object.keys(ev.chart.medians))}, not the office and goods-and-logistics axes`);
  for (const [axisKey, m] of Object.entries(ev.chart.medians)) {
    if (m.number !== `${mainPrefix}.${axisKey}.median`) refuse(`the chart's ${axisKey} median reads ${JSON.stringify(m.number)}, not ${mainPrefix}.${axisKey}.median`);
  }
  // The random peer's k and grid are the registered ones, and each grid entry is the subject's probability at its k in the main specification.
  const rp0 = ev.random_peer;
  if (rp0.rule.k !== peerK || canonicalJson(rp0.rule.k_grid) !== canonicalJson(RANDOM_PEER_K_GRID) || !RANDOM_PEER_K_GRID.includes(peerK)) {
    refuse(`the random peer is drawn at k = ${JSON.stringify(rp0.rule.k)} over the grid ${JSON.stringify(rp0.rule.k_grid)}; registered, k = ${peerK} (random_peer.k) over ${JSON.stringify(RANDOM_PEER_K_GRID)}`);
  }
  if (canonicalJson(Object.keys(rp0.grid).sort(byteCompare)) !== canonicalJson(RANDOM_PEER_K_GRID.map(String).sort(byteCompare))) refuse(`the random-peer grid is at k = ${Object.keys(rp0.grid).join(", ")}, not the registered ${RANDOM_PEER_K_GRID.join(", ")}`);
  for (const [kg, g] of Object.entries(rp0.grid)) {
    if (g.number !== `${mainPrefix}.${ev.subject}.random_peer.k${kg}`) refuse(`the random-peer grid at k = ${kg} reads ${JSON.stringify(g.number)}, not ${mainPrefix}.${ev.subject}.random_peer.k${kg}`);
  }
  const mainProblems = [
    ...anchorMainToChart(ev, mainPrefix, "office", "goods_logistics"),
    ...recomputeSpec(ev, mainPrefix, ev.subject),
    ...Object.values(ev.chart.medians).flatMap((m) => recomputeMedian(ev, m.number)),
    ...Object.values(ev.random_peer.grid).flatMap((g) => recomputeRandomPeer(ev, g.number, mainPrefix, ev.subject)),
  ];
  if (mainProblems.length) refuse(`the evidence's counts disagree with its sets: ${mainProblems.join("; ")}`);
  // h3.cells_not_annual_or_footnoted: the subject's cells on both axes that are not an M13 annual average or carry a footnote.
  const prelim = ev.preconditions.find((p) => p.name === "h3.cells_not_annual_or_footnoted");
  if (prelim) {
    const tuples = ["office", "goods_logistics"].flatMap((a) => ev.numbers[`${mainPrefix}.${ev.subject}.${a}.growth_pct`]?.provenance ?? []);
    const flagged = tuples.filter((t) => {
      const [, , period, , footnote] = t.split("|");
      return period !== "M13" || footnote !== "";
    }).length;
    if (tuples.length === 0 || prelim.value !== flagged) refuse(`precondition h3.cells_not_annual_or_footnoted is ${JSON.stringify(prelim.value)}, the subject's cells give ${flagged}`);
  }
  // The table's true/false values: the subject is a member of both main sets; the recency caveat prints.
  for (const p of ev.preconditions) {
    let want: boolean | undefined;
    if (p.name === "h3.subject_publishable" || p.name === "h3b.subject_publishable") {
      want = ["office", "goods_logistics"].every((a) => Object.hasOwn(ev.sets[`${mainPrefix}:${a}`]?.members ?? {}, ev.subject));
    } else if (p.name === "h3b.recency_caveat_prints") want = ev.caveats.some((c) => c.id === RECENCY && c.printed);
    if (want !== undefined && p.value !== want) refuse(`precondition ${p.name} prints ${JSON.stringify(p.value)}, but the evidence says ${want}`);
  }
  for (const [name, axis, what] of [["a", "office", "growth_pct"], ["b", "goods_logistics", "growth_pct"], ["r_a", "office", "rank"], ["r_b", "goods_logistics", "rank"]] as const) {
    const r = h.slots[name];
    if (!r || !hasNumber(r) || r.number !== `${mainPrefix}.${ev.subject}.${axis}.${what}`) refuse(`the headline's {${name}} is not the subject's ${axis} ${what} in ${mainPrefix}`);
  }

  // The precondition table, row by row, as this side prints it: each value recomputed here (a count of the metros
  // the chart names, a membership of the main sets, the subject's flagged cells) or read from the one evidence number
  // its name registers (main.universe.n; a row's beat-on-both or not-publishable count, recomputed from that row's
  // sets where its window is evaluated), the threshold the registered text and the result the value against it. A
  // precondition with neither has no value this side can print, and refuses.
  const universeCount = universeN.value as number;
  /** The one window a row is evaluated over: the registered window for main, else the row's only window in methods.json. */
  const rowWindow = (row: string): string | undefined => {
    if (row === "main") return `${window.t0}->${window.t1}`;
    const ws = Object.keys(methods.robustness.rows[row]?.windows ?? {});
    return ws.length === 1 ? ws[0] : undefined;
  };
  const preconditionRow = (p: Precondition): Insight["preconditions"][number] => {
    const form = preconditionForm(p.name) as NonNullable<ReturnType<typeof preconditionForm>>;
    const reads = (key: string | undefined): void => {
      if (p.number !== key) refuse(`precondition ${p.name} reads ${JSON.stringify(p.number ?? null)}, not ${JSON.stringify(key ?? null)}, the evidence its name registers`);
    };
    let value: number | boolean;
    switch (p.name) {
      case "universe.n":
        reads("main.universe.n");
        value = universeCount;
        break;
      case "universe.nulls_named":
        reads(undefined);
        value = ev.chart.not_published.length;
        break;
      case "universe.fail_closed_named":
        reads(undefined);
        value = ev.chart.fail_closed.length;
        break;
      case "h3.subject_publishable":
      case "h3b.subject_publishable":
        reads(undefined);
        value = ["office", "goods_logistics"].every((a) => Object.hasOwn(ev.sets[`${mainPrefix}:${a}`]?.members ?? {}, ev.subject));
        break;
      case "h3.cells_not_annual_or_footnoted":
        reads(undefined);
        value = ["office", "goods_logistics"]
          .flatMap((a) => ev.numbers[`${mainPrefix}.${ev.subject}.${a}.growth_pct`]?.provenance ?? [])
          .filter((t) => {
            const [, , period, , footnote] = t.split("|");
            return period !== "M13" || footnote !== "";
          }).length;
        break;
      case "h3b.recency_caveat_prints":
        reads(undefined);
        value = ev.caveats.some((c) => c.id === RECENCY && c.printed);
        break;
      default: {
        if (!form.row) return refuse(`precondition ${p.name} has no value this side can recompute or read from the evidence, so it does not print`);
        const w = rowWindow(form.row) ?? refuse(`precondition ${p.name} is for row ${form.row}, which methods.json does not evaluate over one window`);
        if (p.window !== w) refuse(`precondition ${p.name} is for the window ${JSON.stringify(p.window ?? null)}; row ${form.row} is evaluated over ${w}`);
        const key = `${form.row}:${w}.${ev.subject}.${p.name.startsWith("h3b.no_metro_beat_both.") ? "beat_on_both" : "not_publishable_could_beat_both"}`;
        reads(key);
        const n = ev.numbers[key] ?? refuse(`precondition ${p.name} reads ${key}, which the evidence does not have`);
        // The count is recomputed from the row's sets (recomputeSpec, here and in the robustness rows below).
        const recount = recomputeSpec(ev, `${form.row}:${w}`, ev.subject);
        if (recount.length) refuse(`precondition ${p.name}: the evidence's counts disagree with its sets: ${recount.join("; ")}`);
        if (typeof n.value !== "number") return refuse(`precondition ${p.name} reads ${key}, which has no value`);
        value = n.value;
      }
    }
    const threshold = thresholdText(form.threshold, universeCount);
    const holds =
      form.threshold === "C1.threshold.zero"
        ? value === 0
        : form.threshold === "C1.threshold.true"
          ? value === true
          : form.threshold === "C1.threshold.universe_n"
            ? value === universeN.registered_n
            : // Named-metro rows: the metros it names are the chart's (checked above), which is what its threshold asks.
              form.threshold === "C1.threshold.nulls_named" || form.threshold === "C1.threshold.fail_closed_named";
    if (p.value !== value) refuse(`precondition ${p.name} prints ${JSON.stringify(p.value)}, but the evidence gives ${JSON.stringify(value)}`);
    if (p.threshold !== threshold) refuse(`precondition ${p.name} states the threshold ${JSON.stringify(p.threshold)}, not ${JSON.stringify(threshold)}`);
    if (p.pass !== holds) refuse(`precondition ${p.name} says it ${p.pass ? "passes" : "fails"}, but ${JSON.stringify(value)} against ${JSON.stringify(threshold)} ${holds ? "holds" : "does not hold"}`);
    return { name: p.name, gates: p.gates, value, threshold, pass: holds };
  };
  // Each precondition once, among those that pass and those a suppressed clause names: the table prints a row per
  // entry, and a reason names each failing one once.
  {
    const names = [...ev.preconditions, ...ev.suppressed.flatMap((s) => s.preconditions ?? [])].map((p) => p.name);
    const twice = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    if (twice.length) refuse(`the evidence records precondition ${twice.map((n) => JSON.stringify(n)).join(", ")} more than once`);
  }
  const preconditionTable = ev.preconditions.map(preconditionRow);
  // A suppressed clause's preconditions print only by name, in its reason: each one reads the evidence its name registers.
  for (const p of ev.suppressed.flatMap((s) => s.preconditions ?? [])) {
    const form = preconditionForm(p.name) as NonNullable<ReturnType<typeof preconditionForm>>;
    if (!form.row) continue;
    const w = rowWindow(form.row);
    const key = w === undefined ? undefined : `${form.row}:${w}.${ev.subject}.${p.name.startsWith("h3b.no_metro_beat_both.") ? "beat_on_both" : "not_publishable_could_beat_both"}`;
    if (p.number !== key || p.window !== w) refuse(`suppressed precondition ${p.name} reads ${JSON.stringify(p.number ?? null)} over ${JSON.stringify(p.window ?? null)}, not ${JSON.stringify(key ?? null)}, the evidence its name registers`);
  }

  // Why a clause or a caveat does not print: one of the registered forms, each slot in it read back from the evidence.
  const reasonIs = (what: string, reason: string | undefined, forms: ReasonForm[]): void => {
    if (reason !== undefined && forms.some(([id, ok]) => {
      const m = matchTemplate(id, reason);
      return m !== null && ok(m);
    })) return;
    refuse(`${what} gives the reason ${JSON.stringify(reason ?? null)}, which is none of its registered forms (${forms.map(([id]) => id).join(", ") || "none registered"}) with the evidence's own values`);
  };
  for (const s of ev.suppressed) {
    const failingNames = (s.preconditions ?? []).filter((p) => p.pass !== true).map((p) => p.name);
    const forms: ReasonForm[] = [
      ["C1.reason.precondition_fails", (m) => failingNames.length > 0 && m.names === failingNames.join(", ")],
      ["C1.reason.extends_suppressed", () => failingNames.length === 0 && !clauses.some((c) => c.id === "C1.H3.ranks" && c.printed)],
    ];
    if (s.clause === "C1.H3.twins") forms.unshift(["C1.reason.twins_pending", () => manifest.status === "twins_pending"]);
    reasonIs(`suppressed clause ${s.clause}`, s.reason, forms);
  }

  // Caveats: printed ones are filled from registered templates; the rest say why not, in a registered form.
  const caveats: Insight["caveats"] = [];
  const notPrinted: Insight["notPrinted"] = ev.suppressed.map((s) => ({ id: s.clause, reason: s.reason }));
  for (const c of ev.caveats) {
    if (!c.printed) reasonIs(`caveat ${c.id}`, c.reason, caveatReasonForms(c, ev, methods, { recencyWindow, manufacturing }));
    const id = registered(`caveat ${c.id}`, c.id, c.text, "caveat");
    if (!c.printed && Object.keys(c.slots ?? {}).length) {
      // Only its reason prints, but the slots a caveat that does not print carries are held to its registered evidence too.
      pinSlots(`caveat ${c.id}`, id, c.slots ?? {});
      for (const [name, s] of Object.entries(c.slots ?? {})) numberOf(`caveat ${c.id}`, name, s);
    }
    if (c.printed && id === RECENCY && (c.row !== "R" || c.window !== recencyWindow)) {
      refuse(`the recency caveat reads row ${JSON.stringify(c.row ?? null)}'s ${JSON.stringify(c.window ?? null)} window, not row R's registered window ${RECENCY_R_WINDOW} (${JSON.stringify(recencyWindow ?? null)})`);
    }
    if (c.printed && id === "C1.caveat.ces_manufacturing") {
      // "CES shows": both cells published, without a footnote.
      for (const key of manufacturing ?? []) {
        const [series, year, period] = key.split("|");
        if (publishedCell(ev, series, `${year}|${period}`)?.footnote !== "") refuse(`caveat ${id} prints, but ${key} is not a published cell without a footnote`);
      }
    }
    if (c.printed) {
      if (id === "C1.caveat.not_published" || id === "C1.caveat.not_published.plural") {
        const m = c.slots?.metros;
        const listed = m && m.format === "list" ? m.metros.map((x) => x.cbsa).sort(byteCompare) : [];
        if (canonicalJson(listed) !== canonicalJson(ev.chart.not_published.map((x) => x.cbsa).sort(byteCompare))) refuse(`caveat ${id} does not name exactly the chart's metros that are not published`);
        if ((id === "C1.caveat.not_published") !== (listed.length === 1)) refuse(`caveat ${id} names ${listed.length} metros; one takes "is", more take "are"`);
      }
      if (id === "C1.caveat.ces_manufacturing") {
        const v0 = c.slots?.v0;
        const v1 = c.slots?.v1;
        if (!v0 || !v1 || !("value" in v0) || !("value" in v1) || !(v1.value > v0.value)) refuse(`caveat ${id} prints, but its later value is not above its earlier one`);
      }
      caveats.push({ id, text: asSentence(checkSlots(`caveat ${c.id}`, id, c.slots ?? {})) });
    } else if (c.reason) notPrinted.push({ id, reason: c.reason });
    else refuse(`caveat ${c.id} does not print and gives no reason`);
  }
  const recency = ev.caveats.find((c) => c.id === RECENCY);
  // Wherever the headline travels alone (a page's description, a card's, a Report's) its H3b clause takes the recency caveat with it.
  const recencySentence = caveats.find((c) => c.id === RECENCY)?.text;
  if (h3bPrinted && !recencySentence) refuse("the H3b clause prints but the recency caveat does not");
  const description = h3bPrinted ? `${headline} ${recencySentence}` : headline;

  // The random-peer probability: the sentence, and its arithmetic recomputed exactly.
  const rp = ev.random_peer;
  let randomPeer: string | null = null;
  const randomPeerGrid: Array<{ k: number; printed: string; number: string; arithmetic: string }> = [];
  // n is the publishable metros other than the subject: the main specification's publishable count (the universe line's {n_pub}), less one.
  const pubMain = ev.numbers[`${mainPrefix}.publishable`];
  const checkProbability = (key: string, k: number): { n: EvidenceNumber; arithmetic: string } => {
    const n = ev.numbers[key] ?? refuse(`random-peer number ${key} does not exist`);
    if (n.kind !== "probability" || n.k !== k || n.m == null || n.n == null || !n.exact || typeof n.value !== "number") return refuse(`${key} is not a probability at k = ${k}`);
    const a = randomPeerArithmetic(n.m, n.n, k);
    if (a.numerator !== n.exact.numerator || a.denominator !== n.exact.denominator || a.text !== n.arithmetic) refuse(`${key}: (${n.m} / ${n.n})^${k} is ${a.numerator} / ${a.denominator}, not the evidence's ${n.exact.numerator} / ${n.exact.denominator}`);
    if (Math.abs(Number(a.numerator) / Number(a.denominator) - n.value) > 1e-12) refuse(`${key}: ${n.value} is not ${a.numerator} / ${a.denominator}`);
    if (n.m + (n.not_beaten ?? []).length !== n.n) refuse(`${key}: m = ${n.m} and ${(n.not_beaten ?? []).length} metros not beaten do not make n = ${n.n}`);
    if (!pubMain || canonicalJson(pubMain.over ?? []) !== canonicalJson(n.over ?? []) || pubMain.value !== n.n + 1) refuse(`${key}: n = ${n.n} is not the publishable metros other than the subject`);
    return { n, arithmetic: a.text };
  };
  {
    const id = registered("random peer", rp.id, rp.text, "random peer");
    const k = rp.slots.k;
    const p = rp.slots.p;
    if (!k || !("value" in k) || k.value !== rp.rule.k || !hasNumber(k) || ev.numbers[k.number]?.kind !== "registered") refuse("the random-peer k is not the registered k");
    if (!p || !hasNumber(p) || rp.grid[String(rp.rule.k)]?.number !== p.number) refuse("the random-peer probability is not the grid's entry at the registered k");
    for (const kg of RANDOM_PEER_K_GRID) {
      const g = rp.grid[String(kg)] ?? refuse(`the random-peer grid has no k = ${kg}`);
      if (!isNumberKey(g.number)) refuse(`the random-peer grid at k = ${kg} reads ${JSON.stringify(g.number)}, which is not an evidence key of a registered form`);
      const { n, arithmetic } = checkProbability(g.number, kg);
      if (n.value !== g.value) refuse(`the random-peer grid at k = ${kg} is ${g.value}, evidence number ${g.number} is ${n.value}`);
      randomPeerGrid.push({ k: kg, printed: num(n.value as number, 3), number: g.number, arithmetic });
    }
    if (rp.printed) randomPeer = asSentence(checkSlots("random peer", id, rp.slots));
  }

  // The chart: a valid spec whose words are template output and whose values are evidence numbers.
  let spec: ChartSpec;
  try {
    spec = parseChartSpec(f.chart);
  } catch (e) {
    return refuse(`its chart sidecar is not a valid ChartSpec: ${(e as Error).message}`);
  }
  if (spec.kind !== "bubble") refuse(`its chart is a ${spec.kind}; panel A is a bubble chart`);
  const bubble = spec as BubbleSpec;
  const ch = ev.chart;
  if (ch.sidecar !== f.chartFile) refuse(`the evidence describes ${ch.sidecar}, the manifest's chart is ${f.chartFile}`);

  // The title: the H3b ladder's first rung that every canvas can set, or the neutral title when H3b does not print.
  const titleId = registered("chart title", ch.title.id, ch.title.text, "chart title");
  if (h3bPrinted) {
    const ladder = (ch.title.ladder ?? []).map((r) => registered("chart title ladder", r.id, r.text, "chart title"));
    if (canonicalJson(ladder) !== canonicalJson(TITLE_LADDER_H3B)) refuse(`the chart title's ladder is ${JSON.stringify(ladder)}, not the registered ${JSON.stringify(TITLE_LADDER_H3B)}`);
    const fits = TITLE_LADDER_H3B.find((id) => headlineMisfits(checkSlots("chart title", id, ch.title.slots)).length === 0) ?? refuse("no rung of the H3b title ladder fits every canvas");
    if (titleId !== fits) refuse(`the chart title is ${titleId}, but ${fits} is the first rung every canvas can set`);
  } else if (titleId !== "C1.chart_title.raw") refuse(`the H3b clause does not print, so the chart title must be the neutral C1.chart_title.raw, not ${titleId}`);
  const chartTitle = checkSlots("chart title", titleId, ch.title.slots);
  if (bubble.headline !== chartTitle) refuse("the chart title is not its template's output");

  // The subtitle: the recency ladder's first rung within DEK_LIMIT, with the recency caveat's own slots, or the neutral line.
  const dekId = registered("chart subtitle", ch.dek.id, ch.dek.text, "chart subtitle");
  if (recency?.printed) {
    const ladder = (ch.dek.ladder ?? []).map((r) => registered("chart subtitle ladder", r.id, r.text, "chart subtitle"));
    if (canonicalJson(ladder) !== canonicalJson(DEK_LADDER_RECENCY)) refuse(`the chart subtitle's ladder is ${JSON.stringify(ladder)}, not the registered ${JSON.stringify(DEK_LADDER_RECENCY)}`);
    if (ch.dek.caveat !== RECENCY) refuse("the chart subtitle does not carry the recency caveat");
    for (const name of placeholders(templateText(dekId))) {
      if (canonicalJson(ch.dek.slots[name] ?? null) !== canonicalJson(recency.slots?.[name] ?? null)) refuse(`the chart subtitle's {${name}} is not the recency caveat's`);
    }
    const first = DEK_LADDER_RECENCY.find((id) => checkSlots("chart subtitle", id, ch.dek.slots).length <= DEK_LIMIT) ?? refuse(`no rung of the subtitle ladder fills to at most ${DEK_LIMIT} characters`);
    if (dekId !== first) refuse(`the chart subtitle is ${dekId}, but ${first} is the first rung within ${DEK_LIMIT} characters`);
  } else if (dekId !== "C1.chart_dek") refuse(`the recency caveat does not print, so the chart subtitle must be the neutral C1.chart_dek, not ${dekId}`);
  const dek = checkSlots("chart subtitle", dekId, ch.dek.slots ?? {});
  if (bubble.dek !== dek) refuse("the chart subtitle is not its template's output");

  // The subject's label line: its two values, office-industry first.
  const subjectRow = ch.rows[ev.subject];
  let subjectNote: string | null = null;
  if (ch.subject_note) {
    const id = registered("subject label", ch.subject_note.id, ch.subject_note.text, "subject label");
    const a = ch.subject_note.slots.a;
    const b = ch.subject_note.slots.b;
    if (!subjectRow || !a || !b || !hasNumber(a) || !hasNumber(b) || a.number !== subjectRow.x || b.number !== subjectRow.y) refuse("the subject's label values are not its chart row's x and y");
    subjectNote = checkSlots("subject label", id, ch.subject_note.slots);
    if (canonicalJson(bubble.subjectNotes ?? []) !== canonicalJson([subjectNote])) refuse("the chart's subject note is not its template's output");
  } else if ((bubble.subjectNotes ?? []).length) refuse("the chart carries a subject note the evidence does not");

  const universeLine = checkSlots("universe line", registered("universe line", ch.universe_line.id, ch.universe_line.text, "universe line"), ch.universe_line.slots);
  if (bubble.universe !== universeLine) refuse("the chart's universe line is not its template's output");
  if (bubble.subject !== ev.subject) refuse(`the chart's subject is ${JSON.stringify(bubble.subject)}, the evidence's is ${ev.subject}`);

  // Axis, bubble and median labels and the estimate methods: registered texts over the registered window.
  const label = (what: string, got: string | undefined, id: TemplateId) => {
    const want = fill(id, windowSlots);
    if (got !== want) refuse(`the chart's ${what} reads ${JSON.stringify(got)}, not the registered ${JSON.stringify(want)}`);
  };
  label("horizontal axis title", bubble.x.label, "C1.chart.x_label");
  label("vertical axis title", bubble.y.label, "C1.chart.y_label");
  label("bubble label", bubble.size.label, "C1.chart.size_label");
  const methodsAllowed = new Set([fill("C1.chart.growth_method", windowSlots), fill("C1.chart.bubble_method", windowSlots)]);
  for (const [key, p] of Object.entries(spec.provenance)) {
    if (p.kind === "estimate" && !methodsAllowed.has(p.method ?? "")) refuse(`the chart's estimate ${key} states a method that is not registered: ${JSON.stringify(p.method)}`);
  }
  for (const [axisKey, axis] of [["office", bubble.x], ["goods_logistics", bubble.y]] as const) {
    const m = ch.medians[axisKey] ?? refuse(`the evidence has no ${axisKey} median`);
    if (ev.numbers[m.number]?.value !== m.value || ev.numbers[m.number]?.kind !== "median") refuse(`median ${m.number} is not an evidence median`);
    for (const r of axis.reference ?? []) {
      if (r.value !== m.value) refuse(`reference line ${r.value} on "${axis.label}" is not the evidence's ${axisKey} median`);
      if (r.label !== templateText("C1.chart.median_label")) refuse(`reference line on "${axis.label}" is labelled ${JSON.stringify(r.label)}`);
    }
  }
  // The axes and the bubble as this side draws them: the registered labels, formats, digits and step (sentence.ts
  // CHART_AXES; a format is the unit a printed number claims), and the evidence's median as each axis's one reference
  // line. The sidecar's must be exactly these, so no format, digits, step or domain of the producer's is drawn.
  const medianLabel = templateText("C1.chart.median_label");
  const axisOf = (key: "x" | "y", axisKey: "office" | "goods_logistics", id: TemplateId): BubbleSpec["x"] => ({
    label: fill(id, windowSlots),
    format: CHART_AXES[key].format,
    digits: CHART_AXES[key].digits,
    step: CHART_AXES[key].step,
    reference: [{ value: ch.medians[axisKey].value, label: medianLabel }],
  });
  const xAxis = axisOf("x", "office", "C1.chart.x_label");
  const yAxis = axisOf("y", "goods_logistics", "C1.chart.y_label");
  const sizeAxis: BubbleSpec["size"] = { label: fill("C1.chart.size_label", windowSlots), format: CHART_AXES.size.format, digits: CHART_AXES.size.digits, negative: CHART_AXES.size.negative };
  for (const [what, got, want] of [["horizontal axis", bubble.x, xAxis], ["vertical axis", bubble.y, yAxis], ["bubble size", bubble.size, sizeAxis]] as const) {
    if (canonicalJson(got) !== canonicalJson(want)) refuse(`the chart's ${what} is ${canonicalJson(got)}, not the registered ${canonicalJson(want)}`);
  }

  // Rows and values.
  const rowIds = Object.keys(ch.rows).sort(byteCompare);
  const dataIds = bubble.data.map((d) => d.id).sort(byteCompare);
  if (rowIds.join(",") !== dataIds.join(",")) refuse("the chart's rows are not the evidence's chart rows");
  for (const d of bubble.data) {
    for (const k of ["x", "y", "size"] as const) {
      const key = ch.rows[d.id][k];
      const n = ev.numbers[key];
      if (!n) refuse(`chart row ${d.id} ${k} names evidence number ${key}, which does not exist`);
      if (n.value !== d[k]) refuse(`chart row ${d.id} ${k} is ${JSON.stringify(d[k])}, evidence number ${key} is ${JSON.stringify(n.value)}`);
    }
  }
  /** The cells the main specification reads at its two ends, "year|period". */
  const mainEnds = (["t0", "t1"] as const).flatMap((e) => (ev.sets[`${mainPrefix}:office`]?.periods?.[e] ?? []).map(([y, p]) => `${y}|${p}`));
  /**
   * Whether a not-published code is so of the evidence's cells: mlc_not_published, that the table has no series of
   * the metro's supersector 15 and not both 10 and 20; no_value:{key}, that the key is a cell of one of the metro's
   * registered parts at an end of the main window and the table has no such cell; zero_base, that one of the
   * metro's main growths is null and the cells it reads at the window's start sum to 0.
   */
  const notPublishedHolds = (code: string, cbsa: string): boolean => {
    if (matchTemplate("C1.reason.mlc_not_published", code)) {
      const has = (part: string) => seriesOfPart(ev, cbsa, part).length > 0;
      return !has("15") && !(has("10") && has("20"));
    }
    if (matchTemplate("C1.reason.zero_base", code)) {
      return ["office", "goods_logistics"].some((a) => {
        const n = ev.numbers[`${mainPrefix}.${cbsa}.${a}.growth_pct`];
        const start = (n?.provenance ?? []).map((t) => t.split("|")).filter(([, y, p]) => `${y}|${p}` === mainEnds[0]);
        return n !== undefined && n.value === null && start.length > 0 && start.reduce((s, t) => s + Number(t[3]), 0) === 0;
      });
    }
    const g = matchTemplate("C1.reason.no_value", code);
    if (g && CELL_KEY.test(g.key)) {
      const [series, y, p] = g.key.split("|");
      const part = partOf(series);
      const parts = ["office", "goods_logistics"].flatMap((a) => axisParts("main", a)).flatMap((x) => (x === "MLC" ? ["15", "10", "20"] : [x]));
      return part !== null && part.metro === cbsa && parts.includes(part.part) && mainEnds.includes(`${y}|${p}`) && publishedCell(ev, series, `${y}|${p}`) === null;
    }
    return false;
  };
  const plotted = bubble.data.filter((d) => isPlotted(bubble, d)).length;
  if (plotted !== ch.plotted) refuse(`the chart plots ${plotted} rows, the evidence says ${ch.plotted}`);
  for (const m of ch.not_published) {
    const d = bubble.data.find((x) => x.id === m.cbsa) ?? refuse(`${m.title} is named as not published but is not a chart row`);
    if (isPlotted(bubble, d)) refuse(`${m.title} is named as not published but is plotted`);
    // Its reason prints beside it: registered codes, and the one the main sets give for leaving it out.
    for (const part of (m.reason ?? "").split("; ")) {
      const ok = NOT_PUBLISHED_CODES.some((id) => {
        const g = matchTemplate(id, part);
        return g !== null && (g.key === undefined || CELL_KEY.test(g.key));
      });
      if (!ok) refuse(`${m.title} is not published for the reason ${JSON.stringify(part)}, which is not a registered code`);
    }
    const left = Object.values(ev.sets)
      .filter((s) => s.row === "main" && s.window === `${window.t0}->${window.t1}`)
      .map((s) => s.excluded?.[m.cbsa]);
    if (left.length === 0 || left.some((r) => r !== m.reason)) refuse(`${m.title}'s reason is not the one the main sets give for leaving it out`);
    // And what each code says is so of the published cells: "no_value" names a cell the table does not publish.
    for (const part of (m.reason ?? "").split("; ")) {
      if (!notPublishedHolds(part, m.cbsa)) refuse(`${m.title} is not published for the reason ${JSON.stringify(part)}, which the evidence's published cells do not bear out`);
    }
  }

  // Labels: exactly the evidence's request, in its order, which the renderer keeps, on canvases that can draw that many.
  const requested = ch.labels.requested.map((r) => r.id);
  if (canonicalJson(bubble.labels?.ids ?? []) !== canonicalJson(requested)) refuse("the chart's label ids are not the evidence's requested labels in their order");
  if (bubble.labels?.topBySize !== 0 || bubble.labels?.extremes !== false) refuse("the chart asks the renderer for labels the evidence did not request");
  if (requested.length > ch.labels.max || requested[0] !== ev.subject) refuse(`the label request has ${requested.length} ids (at most ${ch.labels.max}) and must start with the subject`);
  for (const id of requested) {
    const d = bubble.data.find((x) => x.id === id);
    if (!d || !isPlotted(bubble, d)) refuse(`requested label ${id} is not a plotted row`);
  }
  for (const c of ch.labels.canvases) {
    if (!(CANVAS_IDS as string[]).includes(c)) refuse(`the label request names canvas ${JSON.stringify(c)}, which the renderer does not have`);
    if (LABEL_CAP[c as CanvasId] < ch.labels.max) refuse(`the ${c} canvas draws at most ${LABEL_CAP[c as CanvasId]} labels, fewer than the ${ch.labels.max} the evidence allows`);
  }
  // Provenance of every printed cell, cited with its file's sha256 and Last-Modified. A source entry that a citation
  // prints is held to the fixed form of each of its fields (sources.ts) and is manifest.json's entry for its file;
  // every field of a tuple the arithmetic prints is of its fixed form; the source's names are this side's.
  const manifestByUrl = new Map(Object.values(manifest.sources).map((s) => [s.url, s]));
  const sourceByUrl = new Map(Object.values(ev.sources).map((s) => [s.url, s]));
  const entryChecked = new Set<SourceEntry>();
  const checkedEntry = (where: string, entry: SourceEntry): SourceEntry => {
    if (entryChecked.has(entry)) return entry;
    const problems = sourceEntryProblems(entry);
    if (problems.length) refuse(`${where} ${entry.url}: ${problems.join("; ")}`);
    const m = manifestByUrl.get(entry.url);
    if (!m || canonicalJson(m) !== canonicalJson(entry)) refuse(`${where} ${entry.url}, and the evidence's entry for it is not manifest.json's`);
    entryChecked.add(entry);
    return entry;
  };
  const cell = (tuple: string): CellCitation => {
    const parts = tuple.split("|");
    if (parts.length !== TUPLE.length) return refuse(`provenance tuple with ${parts.length} fields: ${tuple}`);
    const [seriesId, year, period, value, footnote, url, sha256, lastModified] = parts;
    for (const [field, text] of [["series", seriesId], ["year", year], ["period", period], ["value", value], ["footnote", footnote]] as const) {
      if (!TUPLE_FORMS[field].test(text)) refuse(`provenance tuple ${tuple} has the ${field} ${JSON.stringify(text)}, which is not of the fixed form a ${field} takes`);
    }
    const entry = checkedEntry("a provenance tuple cites", sourceByUrl.get(url) ?? refuse(`provenance tuple cites ${url}, which is not an evidence source`));
    if (entry.sha256 !== sha256 || (entry.last_modified ?? "") !== lastModified) refuse(`provenance tuple cites ${url} at ${sha256}, Last-Modified ${lastModified}; the evidence source says otherwise`);
    const source = sourceRefById(entry.source) ?? refuse(`no source reference for upstream file kind ${entry.source}`);
    const provenance: Provenance = {
      source,
      seriesId,
      period: `${year} ${period}`,
      upstreamUrl: url,
      retrievedAt: entry.fetched_at,
      kind: "published",
      notes: [`value ${value}${footnote ? `, footnote ${footnote}` : ""}`, `sha256 ${sha256}`, ...(lastModified ? [`Last-Modified ${lastModified}`] : [])],
    };
    return { seriesId, period: `${year} ${period}`, value, footnote, url, sha256, lastModified, provenance, citation: withFile(citation(provenance), sha256, lastModified || null) };
  };

  // The files the chart's rows read, once each, with the years actually read from each (from the evidence tuples).
  const yearsByUrl = new Map<string, Set<number>>();
  /** Each cell the chart's rows read, "series|year|period", with the file it is read from. */
  const chartCells = new Map<string, string>();
  for (const d of bubble.data) {
    for (const k of ["x", "y", "size"] as const) {
      for (const t of ev.numbers[ch.rows[d.id][k]].provenance) {
        const c = cell(t);
        const ys = yearsByUrl.get(c.url) ?? new Set<number>();
        ys.add(Number(c.period.slice(0, 4)));
        yearsByUrl.set(c.url, ys);
        chartCells.set(t.split("|").slice(0, 3).join("|"), c.url);
      }
    }
  }
  for (const p of Object.values(spec.provenance)) {
    if (p.upstreamUrl && !yearsByUrl.has(p.upstreamUrl)) refuse(`the chart cites ${p.upstreamUrl}, which none of its rows' numbers read`);
  }
  // Every card's Source line prints the period of each published cell the sidecar cites, and its citations the
  // estimates' period: each is one of the cells the rows read, at an end of the window, in its registered words.
  // Each record is rebuilt here from what was checked (this side's source names, the cell's file entry, the registered
  // methods) and the sidecar's must be exactly that, so the spec the cards and downloads print carries no record text
  // of the producer's: the cell notes, release and fetch dates and the estimates' fetch times included.
  const windowYears = new Set([String(window.t0), String(window.t1)]);
  const urlsRead = (fields: ReadonlyArray<"x" | "y" | "size">): string[] =>
    [...new Set(bubble.data.flatMap((d) => fields.flatMap((k) => ev.numbers[ch.rows[d.id][k]].provenance.map((t) => t.split("|")[5]))))].sort(byteCompare);
  const latestFetch = (urls: string[]): string => urls.map((u) => (sourceByUrl.get(u) as SourceEntry).fetched_at).reduce((a, b) => (b > a ? b : a), "");
  const records: Record<string, SpecProvenance> = {};
  for (const [key, p] of Object.entries(bubble.provenance)) {
    let want: SpecProvenance;
    if (p.kind === "published") {
      const [series, year, period] = key.split("|");
      if (chartCells.get(key) !== p.upstreamUrl || p.seriesId !== series) refuse(`the chart cites ${key} from ${JSON.stringify(p.upstreamUrl ?? null)}, which is not a cell its rows read from that file`);
      if (!windowYears.has(year)) refuse(`the chart cites ${key}, a ${year} cell, outside the window ${window.t0} to ${window.t1}`);
      let words: string;
      let note: string;
      try {
        words = periodLabel(year, period);
        note = cellNote(series);
      } catch (e) {
        return refuse(`the chart cites ${key}: ${(e as Error).message}`);
      }
      if (p.period !== words) refuse(`the chart's Source line prints ${JSON.stringify(p.period ?? null)} for ${key}, the cell's period is ${JSON.stringify(words)}`);
      const entry = sourceByUrl.get(chartCells.get(key) as string) as SourceEntry;
      if (entry.last_modified === null) return refuse(`the chart cites ${key} from ${entry.url}, which has no Last-Modified date to release it on`);
      want = {
        source: sourceRefById(entry.source) ?? refuse(`no source reference for upstream file kind ${entry.source}`),
        seriesId: series,
        upstreamUrl: entry.url,
        period: words,
        releasedAt: isoDateOf(entry.last_modified),
        retrievedAt: entry.fetched_at,
        kind: "published",
        notes: [note, `sha256 ${entry.sha256}`, `Last-Modified ${entry.last_modified}`, `${entry.bytes} bytes`],
      };
    } else if (p.kind === "estimate") {
      if (p.period !== isoYears([window.t0, window.t1])) refuse(`the chart's estimate ${key} is for ${JSON.stringify(p.period ?? null)}, not the window ${isoYears([window.t0, window.t1])}`);
      if (!Object.hasOwn(ESTIMATES, key)) return refuse(`the chart's estimate record ${JSON.stringify(key)} is not one of its registered estimates (${Object.keys(ESTIMATES).join(", ")})`);
      const est = key as keyof typeof ESTIMATES;
      want = { source: CES_SM, kind: "estimate", method: fill(ESTIMATES[est], windowSlots), period: isoYears([window.t0, window.t1]), retrievedAt: latestFetch(urlsRead(est === "growth" ? ["x", "y"] : ["size"])) };
    } else return refuse(`the chart cites ${key} as a ${p.kind} record; it prints published cells and estimates computed from them only`);
    if (canonicalJson(p) !== canonicalJson(want)) refuse(`the chart's provenance record ${key} is not the one this side builds from the evidence: it reads ${canonicalJson(p)}, not ${canonicalJson(want)}`);
    records[key] = want;
  }

  // The chart's rows as this side prints them: each metro named from Atlas's registry (the sidecar's label and full
  // name must be the registry's), citing exactly the cells its three numbers read and the two estimates.
  const data = bubble.data.map((d) => {
    if (d.href !== undefined) refuse(`chart row ${d.id} carries a link, which the evidence does not give`);
    const read = (["x", "y", "size"] as const).flatMap((k) => ev.numbers[ch.rows[d.id][k]].provenance.map((t) => t.split("|").slice(0, 3).join("|")));
    const cites = [...new Set([...read, ...Object.keys(ESTIMATES)])].sort(byteCompare);
    if (canonicalJson([...d.provenance].sort(byteCompare)) !== canonicalJson(cites)) refuse(`chart row ${d.id} cites ${JSON.stringify(d.provenance)}, not the cells its numbers read and the estimates`);
    const name = registryMetro(`chart row ${d.id}`, { cbsa: d.id, label: d.label, title: d.fullLabel }, refuse);
    return { id: d.id, label: name.label, fullLabel: name.title, provenance: [...d.provenance], x: d.x, y: d.y, size: d.size };
  });
  // The date the numbers are as of: the latest Last-Modified among the files the rows read. The address: registered.
  const asOf = [...yearsByUrl.keys()].map((u) => isoDateOf((sourceByUrl.get(u) as SourceEntry).last_modified ?? "")).reduce((a, b) => (b > a ? b : a));
  if (bubble.asOf !== asOf) refuse(`the chart's numbers are as of ${JSON.stringify(bubble.asOf)}, but the latest file its rows read was last modified on ${asOf}`);
  const slug = fillWords("C1.slug", { finding: findingId.toLowerCase(), t0: String(window.t0), t1: String(window.t1) });
  if (bubble.slug !== slug) refuse(`the chart's slug is ${JSON.stringify(bubble.slug)}, not the registered ${JSON.stringify(slug)}`);
  // The spec the cards, the page and the downloads draw: every word in it this side's (the checks above say the
  // sidecar's are the same), every number the sidecar's that the evidence gives.
  try {
    spec = parseChartSpec({
      version: 1,
      kind: "bubble",
      slug,
      headline: chartTitle,
      dek,
      asOf,
      universe: universeLine,
      subject: ev.subject,
      ...(subjectNote !== null ? { subjectNotes: [subjectNote] } : {}),
      provenance: records,
      x: xAxis,
      y: yAxis,
      size: sizeAxis,
      labels: { ids: requested, topBySize: 0, extremes: false },
      data,
    });
  } catch (e) {
    return refuse(`the chart this side builds is not a valid ChartSpec: ${(e as Error).message}`);
  }
  if (canonicalJson(requestedLabels(spec as BubbleSpec)) !== canonicalJson(requested)) refuse("the renderer would not ask for the evidence's labels in the evidence's order");

  // Every canvas can lay the chart out: the headline, the dek (the OG card's text column carries it too, so the H3b
  // title never travels without its caveat) and the source lines. A chart that would not fit is refused here, not
  // when a card is first requested.
  for (const c of CANVAS_IDS) {
    try {
      layoutFrame(spec, c, "dark");
    } catch (e) {
      refuse(`the chart does not fit the ${c} canvas: ${(e as Error).message}`);
    }
  }

  const fileCite = (entry: SourceEntry, ref: SourceRef, period: string): Provenance => ({ source: ref, upstreamUrl: entry.url, period, retrievedAt: entry.fetched_at, kind: "published" });
  const files: FileCitation[] = [...yearsByUrl.keys()].sort(byteCompare).map((url) => {
    const entry = checkedEntry("the chart reads", manifestByUrl.get(url) ?? refuse(`the chart reads ${url}, which manifest.json does not record`));
    const ref = sourceRefById(entry.source) ?? refuse(`no source reference for upstream file kind ${entry.source}`);
    const years = [...(yearsByUrl.get(url) as Set<number>)].sort((a, b) => a - b);
    const provenance = fileCite(entry, ref, isoYears(years));
    return { url, provenance, years, citation: withFile(citation(provenance), entry.sha256, entry.last_modified, entry.bytes) };
  });
  const estimates = Object.keys(spec.provenance)
    .sort(byteCompare)
    .map((k) => spec.provenance[k])
    .filter((p) => p.kind === "estimate")
    .map((p) => citation(toProvenance(p)));

  // The files that decide who is compared: the delineation (the universe), the fail-closed weights, P1's peers.
  // What each covers and the words of its role are read from the bundle, never written here: the year from the
  // file's own URL (and the registry id's year where it has one), checked against what the evidence says of it.
  const shaping: ShapingSource[] = SHAPING.map((rule) => {
    const entries = Object.values(manifest.sources).filter((s) => s.source === rule.id);
    if (entries.length !== 1) refuse(`manifest.json records ${entries.length} ${rule.id} files, not one`);
    const entry = checkedEntry(`the ${rule.id} file`, entries[0]);
    const year = rule.url.exec(entry.url)?.[1] ?? refuse(`the ${rule.id} file ${entry.url} is not a URL this side can read a year from`);
    const idYear = /(\d{4})$/.exec(rule.id)?.[1];
    if (idYear !== undefined && idYear !== year) refuse(`the ${rule.id} file ${entry.url} is for ${year}, its registry id says ${idYear}`);
    let coverage: string;
    let words: Record<string, string>;
    switch (rule.role) {
      case "C1.shaping.omb": {
        // The delineation sheet the producer composes metros from, as its pre-registration names it ("msa_jul2023").
        const composition = (methods.panel_b as { registered?: { twins?: { pooling_composition?: unknown } } }).registered?.twins?.pooling_composition;
        const m = typeof composition === "string" ? /^msa_([a-z]{3})(\d{4})$/.exec(composition) : null;
        const month = m ? MONTHS[m[1]] : undefined;
        if (!m || !month || m[2] !== year) refuse(`the delineation composition ${JSON.stringify(composition ?? null)} is not a month of ${year}, the year of ${entry.url}`);
        coverage = `${year}-${(month as { iso: string }).iso}`;
        words = { month: (month as { name: string }).name, year };
        break;
      }
      case "C1.shaping.qcew_county": {
        for (const fc of ch.fail_closed) {
          if (!Object.hasOwn(fc, `members_without_${year}_weight`)) refuse(`${fc.title} fails closed, but the evidence does not name its members without a ${year} weight`);
        }
        coverage = year;
        words = { year };
        break;
      }
      case "C1.shaping.census_p1": {
        const row = methods.robustness.rows.P1;
        const wins = row ? Object.values(row.windows) : [];
        if (!row || row.kind !== "peers" || !(row.registered.source_ids ?? []).includes(rule.id) || wins.length !== 1) refuse(`row P1 is not one peer set chosen by ${rule.id}`);
        const rankedBy = robustnessRegistered("P1").ranked_by as string;
        if (!rankedBy.includes(`POPESTIMATE${year}`)) refuse(`row P1 is ranked by ${JSON.stringify(rankedBy)}, not the ${year} estimates in ${entry.url}`);
        coverage = year;
        words = { n: num(wins[0].n), ranked_by: rankedBy };
        break;
      }
      default:
        return refuse(`no words for the file ${rule.id}`);
    }
    const provenance = fileCite(entry, rule.ref, coverage);
    let role: string;
    try {
      role = fillWords(rule.role, words);
    } catch (e) {
      return refuse((e as Error).message);
    }
    return { id: rule.id, role, url: entry.url, coverage, chart: rule.chart, provenance, citation: withFile(citation(provenance), entry.sha256, entry.last_modified, entry.bytes) };
  });
  const citations = [...new Set([...files.map((x) => x.citation), ...estimates, ...shaping.filter((s) => s.chart).map((s) => s.citation)])];

  // The arithmetic: every slot that prints a number, where it prints, and the cells behind it.
  const arithmetic: ArithmeticRow[] = [];
  const addRows = (where: string, id: TemplateId, slots: Record<string, Slot>) => {
    for (const name of placeholders(templateText(id))) {
      const s = slots[name];
      if (!s || !hasNumber(s)) continue;
      if (arithmetic.some((r) => r.where === where && r.number === s.number && r.slot === name)) continue;
      const n = ev.numbers[s.number];
      const prob = n.kind === "probability" ? randomPeerGrid.find((g) => g.number === s.number) : undefined;
      // The keys the arithmetic prints name an evidence number and its sets, in a registered form, and nothing else.
      if (!isNumberKey(s.number)) refuse(`${where} {${name}} reads ${JSON.stringify(s.number)}, which is not an evidence key of a registered form`);
      for (const k of n.over ?? []) if (!isSetKey(k) || !ev.sets[k]) refuse(`evidence number ${s.number} runs over ${JSON.stringify(k)}, which is not an evidence set of a registered form`);
      // A registered number cites where the pre-registration holds it: the registered file, at manifest.json's hash, and the path registered for its key.
      let registeredAt: string | undefined;
      if (n.kind === "registered") {
        const r = n.registered ?? refuse(`registered number ${s.number} cites no pre-registration`);
        const input = manifest.inputs?.[r.file];
        if (r.file !== PREREG_FILE || !input || input.sha256 !== r.sha256 || input.bytes !== r.bytes || r.path !== registeredPath(s.number)) {
          refuse(`registered number ${s.number} cites ${JSON.stringify(`${r.file} ${r.path}`)} at ${r.sha256}, not ${PREREG_FILE} ${JSON.stringify(registeredPath(s.number))} at manifest.json's hash`);
        }
        if (n.provenance.length !== 0 || n.formula !== undefined) refuse(`registered number ${s.number} cites cells or states a formula`);
        registeredAt = `${r.file} ${r.path} (sha256 ${r.sha256})`;
      } else if (n.registered) refuse(`evidence number ${s.number} is a ${n.kind}, but cites a pre-registration`);
      arithmetic.push({
        where,
        slot: name,
        printed: formatSlot(name, s),
        number: s.number,
        kind: n.kind,
        category: n.kind === "registered" ? "registered" : n.kind === "cell" ? "cell" : "estimate",
        formula: n.kind === "registered" ? "a registered value" : formulaOf(s.number, n),
        ...(prob ? { arithmetic: prob.arithmetic } : {}),
        over: n.over ?? [],
        cells: (n.provenance ?? []).map(cell),
        ...(registeredAt ? { registered: registeredAt } : {}),
      });
    }
  };
  for (const c of clauses.filter((x) => x.printed)) addRows("Headline", c.id, h.slots);
  if (rp.printed) addRows("Random peer", rp.id as TemplateId, rp.slots);
  for (const c of ev.caveats.filter((x) => x.printed)) addRows(`Caveat: ${c.id.replace(/^C1\.caveat\./, "")}`, c.id as TemplateId, c.slots ?? {});
  addRows("Chart title", titleId, ch.title.slots);
  addRows("Chart subtitle", dekId, ch.dek.slots ?? {});
  if (ch.subject_note) addRows("Subject label", ch.subject_note.id as TemplateId, ch.subject_note.slots);
  addRows("Universe line", ch.universe_line.id as TemplateId, ch.universe_line.slots);

  // The methods page's lines, rendered here and required to match.
  const methodSlots: Record<string, Slot> = { t0, t1, N: ch.universe_line.slots.N };
  for (const id of [...METHODS_IS, ...METHODS_IS_NOT, "C1.methods.status" as const]) pinSlots(`the methods page's ${id}`, id, methodSlots);
  const is = METHODS_IS.map((id) => fill(id, methodSlots));
  const isNot = METHODS_IS_NOT.map((id) => fill(id, methodSlots));
  for (const id of METHODS_IS) addRows("Method: what this is", id, methodSlots);
  for (const id of METHODS_IS_NOT) addRows("Method: what this is not", id, methodSlots);
  if (canonicalJson(is) !== canonicalJson(methods.panel_a.is)) refuse("the methods page's \"is\" lines are not the registered ones");
  if (canonicalJson(isNot) !== canonicalJson(methods.panel_a.is_not)) refuse("the methods page's \"is not\" lines are not the registered ones");
  if (methods.panel_a.method_line !== methodLine) refuse("the methods page's method line is not the registered one");
  if (methods.panel_a.finding !== findingId) refuse(`the methods page's panel A is ${methods.panel_a.finding}`);
  const panelBText = templateText("C1.methods.panel_b");
  if (methods.panel_b.status !== "pending" || methods.panel_b.text !== panelBText || manifest.panels.B !== "pending") refuse("panel B's status or text is not the registered pending note");
  if (methods.panel_b.gate.length === 0) refuse("panel B's gate lists no rule");
  for (const g of methods.panel_b.gate) {
    const id = panelBGateTemplate(g.name) ?? refuse(`panel B's gate ${JSON.stringify(g.name)} has no registered rule`);
    if (g.rule !== templateText(id)) refuse(`panel B's gate ${g.name} reads ${JSON.stringify(g.rule)}, not the registered rule`);
    if (g.status !== "pending") refuse(`panel B's gate ${g.name} is ${JSON.stringify(g.status)} while panel B is pending`);
  }
  let status: string;
  try {
    status = statusNote(manifest.status, t0);
  } catch (e) {
    return refuse((e as Error).message);
  }
  addRows("Status note", "C1.methods.status", { t0 });

  // Robustness rows: a summary of each, every printed number checked against the evidence.
  const universePeriod = ev.sets["main:universe"]?.periods?.t0?.[0]?.[1];
  const robustness: RobustnessSummary[] = [];
  /** How each robustness column is computed: the evidence's own formula, once per formula, with the rows that use it. */
  const formulas = new Map<string, { column: string; rows: Set<string> }>();
  /**
   * The windows a robustness row is registered over, as its evidence keys label them: a definition or peers row the
   * registered window; an end-year row its registered start (the window's) to its registered end, a year or a run of
   * months; row R its registered windows; the QCEW row its registered window. Its sets read those windows' cells
   * (setPeriodProblems), so the window the table prints is the one the numbers were computed over.
   */
  const registeredWindows = (rid: string, row: RobustnessRow): string[] => {
    const r = row.registered;
    switch (row.kind) {
      case "definition":
      case "peers":
        return [`${window.t0}->${window.t1}`];
      case "end_year": {
        const w = r.window;
        if (!w || w.t0 !== window.t0) return refuse(`robustness row ${rid} is registered from ${JSON.stringify(w?.t0 ?? null)}, not the window's start ${window.t0}`);
        if (typeof w.t1 === "number") return [`${w.t0}->${w.t1}`];
        return [monthlyLabel(w.t0, w.t1) ?? refuse(`robustness row ${rid}'s end ${JSON.stringify(w.t1)} names no run of months`)];
      }
      case "disclosure":
        return (r.windows ?? []).map((x) => `${x.t0}->${x.t1}`);
      case "cross_source": {
        const w = r.window;
        if (!w || typeof w.t1 !== "number") return refuse(`robustness row ${rid} has no registered window of two years`);
        return [`${w.t0}->${w.t1}`];
      }
      default:
        return refuse(`robustness row ${rid} is of no registered kind`);
    }
  };
  for (const rid of Object.keys(methods.robustness.rows).sort(byteCompare)) {
    const row = methods.robustness.rows[rid];
    const cites = new Map<string, string>();
    // What it gates is the registered list's, whether or not the clause prints.
    if (canonicalJson(row.gates ?? []) !== canonicalJson(GATING_ROWS_H3B.includes(rid) ? [H3B] : [])) refuse(`robustness row ${rid} gates ${JSON.stringify(row.gates ?? [])}; registered, it gates ${GATING_ROWS_H3B.includes(rid) ? H3B : "nothing"}`);
    for (const w of Object.keys(row.windows).sort(byteCompare)) {
      const win = row.windows[w];
      const check = (column: string, key: string, value: number) => {
        const n = ev.numbers[key] ?? refuse(`robustness ${rid} ${w} names evidence number ${key}, which does not exist`);
        if (n.value !== value) refuse(`robustness ${rid} ${w}: ${key} is ${value} on the methods page, ${JSON.stringify(n.value)} in the evidence`);
        const formula = formulaOf(key, n);
        const entry = formulas.get(formula) ?? { column, rows: new Set<string>() };
        if (entry.column !== column) refuse(`robustness ${rid} ${w}: one formula computes both ${entry.column} and ${column}`);
        entry.rows.add(rid);
        formulas.set(formula, entry);
        for (const t of n.provenance) {
          const c = cell(t);
          const entry = sourceByUrl.get(c.url) as SourceEntry;
          cites.set(c.url, withFile(citation({ source: c.provenance.source, upstreamUrl: c.url, retrievedAt: entry.fetched_at, kind: "published" }), entry.sha256, entry.last_modified, entry.bytes));
        }
        return n;
      };
      // Every count and rank of the window, recomputed from its sets.
      if (!win.publishable.number.endsWith(".publishable")) refuse(`robustness ${rid} ${w}: ${win.publishable.number} is not a publishable count`);
      const prefix = win.publishable.number.slice(0, -".publishable".length);
      // The window the table prints is the one its numbers read, and the metro it recomputes for is the subject (on the
      // QCEW row, the subject's QCEW area code).
      if (!isNumberKey(win.publishable.number) || prefix !== `${rid}:${w}`) refuse(`robustness ${rid}'s window ${JSON.stringify(w)} is not the window its numbers read (${win.publishable.number})`);
      const subjectId = row.kind === "cross_source" ? qcewCode(ev.subject) : ev.subject;
      if (win.subject !== subjectId) refuse(`robustness ${rid} ${w} is recomputed for ${JSON.stringify(win.subject)}, not the subject ${JSON.stringify(subjectId)}`);
      const recomputed = recomputeSpec(ev, prefix, win.subject);
      if (recomputed.length) refuse(`robustness ${rid} ${w}: the evidence's counts disagree with its sets: ${recomputed.join("; ")}`);
      if (win.axes && canonicalJson(Object.keys(win.axes).sort(byteCompare)) !== canonicalJson([...rowAxes(rid)].sort(byteCompare))) refuse(`robustness ${rid} ${w} prints the axes ${JSON.stringify(Object.keys(win.axes))}, not row ${rid}'s ${JSON.stringify(rowAxes(rid))}`);
      for (const [axis, a] of Object.entries(win.axes ?? {})) {
        if (a.growth_pct.number !== `${prefix}.${win.subject}.${axis}.growth_pct` || a.rank.number !== `${prefix}.${win.subject}.${axis}.rank`) refuse(`robustness ${rid} ${w}: its ${axis} numbers are not the subject's in ${prefix}`);
      }
      if (win.beat_on_both && win.beat_on_both.number !== `${prefix}.${win.subject}.beat_on_both`) refuse(`robustness ${rid} ${w}: its beat-on-both count is not the subject's in ${prefix}`);
      // The denominator: how many metros the row's sets cover, members and the excluded alike, read from the evidence sets.
      const pub = check("Publishable", win.publishable.number, win.publishable.value);
      const over = pub.over ?? [];
      if (over.length === 0) refuse(`robustness ${rid} ${w}: the publishable count names no sets`);
      const universes = over.map((k) => {
        const set = ev.sets[k] ?? refuse(`robustness ${rid} ${w}: set ${k} is not in the evidence`);
        return [...Object.keys(set.members), ...Object.keys(set.excluded ?? {})].sort(byteCompare);
      });
      if (universes.some((u) => canonicalJson(u) !== canonicalJson(universes[0]))) refuse(`robustness ${rid} ${w}: the sets ${over.join(" and ")} cover different metros`);
      const n = universes[0].length;
      if (n !== win.n) refuse(`robustness ${rid} ${w}: the methods page counts ${win.n} metros, the evidence sets ${n}`);
      let change: string;
      try {
        change = robustnessChange(rid, row, n);
      } catch (e) {
        return refuse((e as Error).message);
      }
      if (row.kind === "end_year" && typeof row.registered.window?.t1 === "number" && w !== `${row.registered.window.t0}->${row.registered.window.t1}`) refuse(`robustness ${rid}'s window ${w} is not its registered ${row.registered.window.t0} to ${row.registered.window.t1}`);
      // The years in the row's registered words, read back: a CES ranking is by the cells the universe ranks on, and a
      // monthly end's months are exactly the cells its numbers read past the window's start.
      const words = robustnessRegistered(rid);
      if (row.kind === "peers" && words.ranked_by?.startsWith(CES_RANKING)) {
        let want: string;
        try {
          want = `${CES_RANKING}${periodLabel(String(window.t0), universePeriod ?? "")}`;
        } catch (e) {
          return refuse(`robustness row ${rid}'s ranking: ${(e as Error).message}`);
        }
        if (words.ranked_by !== want) refuse(`robustness row ${rid} is ranked by ${JSON.stringify(words.ranked_by)}, but the universe ranks on ${JSON.stringify(want)}`);
        // Ranked as the universe is, its metros are pinned to that ranking: as many as it registers, the largest of it.
        const peers = recomputePeers(ev, prefix, row.registered.largest_n ?? Number.NaN);
        if (peers.length) refuse(`robustness ${rid} ${w}: ${peers.join("; ")}`);
      }
      if (row.kind === "end_year" && typeof row.registered.window?.t1 === "string") {
        const months = monthlyEnd(row.registered.window.t1) ?? refuse(`robustness row ${rid}'s end ${JSON.stringify(row.registered.window.t1)} names no run of months`);
        const read = new Set<string>();
        for (const [key, entry] of Object.entries(ev.numbers)) {
          if (!key.startsWith(`${rid}:${w}.`)) continue;
          for (const t of entry.provenance ?? []) {
            const [, year, period] = t.split("|");
            if (year !== String(window.t0) || period !== universePeriod) read.add(`${year}|${period}`);
          }
        }
        const got = [...read].sort(byteCompare);
        if (canonicalJson(got) !== canonicalJson([...months].sort(byteCompare))) refuse(`robustness row ${rid} ends at ${JSON.stringify(row.registered.window.t1)}, but its numbers read ${got.join(", ") || "no cell"} past ${window.t0}`);
      }
      const base = {
        id: rid,
        kind: row.kind,
        change,
        window: windowLabel(w),
        publishable: `${num(win.publishable.value)} of ${num(n)}`,
        denominator: { number: win.publishable.number, sets: over },
        gates: row.gates ?? [],
        sources: [] as string[],
      };
      if (!win.axes) {
        robustness.push({ ...base, axes: [], beatOnBoth: null });
        continue;
      }
      const axes = Object.entries(win.axes)
        .sort(([a], [b]) => axisCopy(a).order - axisCopy(b).order || byteCompare(a, b))
        .map(([axis, a]) => {
          check("Growth", a.growth_pct.number, a.growth_pct.value);
          check("Rank", a.rank.number, a.rank.value);
          return { axis, label: axisCopy(axis).label, growth: signedPct(a.growth_pct.value, 1), rank: ordinal(a.rank.value), numbers: [a.growth_pct.number, a.rank.number] as [string, string] };
        });
      const both = win.beat_on_both;
      let names: string[] = [];
      if (both) {
        // The metros the table names are the ones the evidence's count names (recomputed from the sets), by Atlas's registry.
        const counted = check("Beat on both", both.number, both.value);
        const ids = both.metros.map((m) => m.id);
        if (canonicalJson([...ids].sort(byteCompare)) !== canonicalJson([...(counted.metros ?? [])].sort(byteCompare))) {
          refuse(`robustness ${rid} ${w} names ${JSON.stringify(ids)} as beating the subject on both, but ${both.number} names ${JSON.stringify(counted.metros ?? [])}`);
        }
        names = both.metros.map((m) => robustnessMetro(`robustness ${rid} ${w}`, m, refuse).title);
      }
      robustness.push({ ...base, axes, beatOnBoth: both ? { count: num(both.value), names, number: both.number } : null });
    }
    // Its windows are the registered ones, each the window its numbers read (above), whose sets read its cells.
    const windows = registeredWindows(rid, row);
    if (canonicalJson(Object.keys(row.windows).sort(byteCompare)) !== canonicalJson([...windows].sort(byteCompare))) {
      refuse(`robustness row ${rid} is evaluated over ${JSON.stringify(Object.keys(row.windows))}, not its registered windows ${JSON.stringify(windows)}`);
    }
    // A peer set chosen by a file no number cites (row P1: the Census estimates) is cited too.
    for (const sid of row.registered.source_ids ?? []) {
      const s = shaping.find((x) => x.id === sid);
      if (s) cites.set(s.url, s.citation);
    }
    const list = [...cites.entries()].sort(([a], [b]) => byteCompare(a, b)).map(([, c]) => c);
    for (const r of robustness) if (r.id === rid) r.sources = list;
  }
  if (h3bPrinted) {
    const gating = new Set(methods.robustness.gating[H3B]);
    for (const r of robustness) if (r.gates.includes(H3B) !== gating.has(r.id)) refuse(`robustness ${r.id}'s gates disagree with the gating list`);
  }

  // Every growth, change and cell the evidence holds, and every set member's growth, from the published cells it reads.
  const fromCells = recomputeFromCells(ev);
  if (fromCells.length) refuse(`the evidence's values disagree with the published cells they read: ${fromCells.slice(0, 5).join("; ")}${fromCells.length > 5 ? `; and ${fromCells.length - 5} more` : ""}`);

  // The chart's own provenance and the bundle's stamps.
  const provenance = Object.keys(spec.provenance)
    .sort(byteCompare)
    .map((k) => toProvenance(spec.provenance[k]));
  const retrievedAt = provenance.map((p) => p.retrievedAt).reduce((a, b) => (b > a ? b : a));
  const hashes = { manifest: bundle.hashes["manifest.json"], chart: bundle.hashes[f.chartFile], evidence: bundle.hashes[f.evidenceFile], methods: bundle.hashes["methods.json"] };

  const subjectRef: MetroRef = registryMetro("the subject", subject, refuse);
  const insight: Insight = {
    id: findingId,
    slug: spec.slug,
    bundle: bundle.name,
    release: manifest.release,
    rulesVersion: RULES_VERSION,
    status: manifest.status,
    panel: FINDING_PANEL[findingId],
    headline,
    description,
    chartTitle,
    h3bPrinted,
    dek,
    universe: spec.universe,
    subject: subjectRef,
    spec,
    window,
    asOf: spec.asOf,
    retrievedAt,
    caveats,
    randomPeer,
    randomPeerGrid,
    notPrinted,
    methodLine,
    statusNote: status,
    methodNote: [methodLine, status],
    is,
    isNot,
    panelB: { text: panelBText, gate: methods.panel_b.gate.map((g) => ({ name: g.name, rule: g.rule, status: g.status })) },
    // What the table prints of each, as this side recomputed it (preconditionRow), and nothing else of the producer's.
    preconditions: preconditionTable,
    arithmetic,
    robustness,
    robustnessFormulas: [...formulas.entries()].map(([formula, f]) => ({ column: f.column, rows: [...f.rows].sort(byteCompare), formula })),
    notPublished: ch.not_published.map((m) => ({ cbsa: m.cbsa, label: m.label, title: m.title, ...(m.reason ? { reason: m.reason } : {}) })),
    failClosed: ch.fail_closed.map((m) => ({ cbsa: m.cbsa, title: m.title })),
    provenance,
    files,
    shaping,
    citations,
    hashes,
    contentId: stableHash(`${hashes.chart}|${hashes.evidence}|${hashes.methods}`),
  };
  // The backstop behind the gate and the per-place templates: the H3b clause's words, by any route into the insight
  // (a caveat, the random peer, a label, a reason, a precondition's name, a metro's title), print only with the clause,
  // and then only in the headline, its description and the chart title.
  const leaks = h3bWordingAt(insight).filter((at) => !h3bPrinted || !H3B_PLACES.has(at));
  if (leaks.length) {
    refuse(
      h3bPrinted
        ? `the H3b clause's words print outside the headline, its description and the chart title, at ${leaks.join(", ")}`
        : `the H3b clause does not print (its gate did not hold), but its words do, at ${leaks.join(", ")}`,
    );
  }
  return insight;
}

/** Every finding in the published bundles whose panel shipped, built; a refusal propagates. In slug order. */
export function publishedInsights(bundles: LoadedBundle[] = BUNDLES.map((b) => loadBundle(b))): Insight[] {
  const out: Insight[] = [];
  for (const b of bundles) {
    for (const f of b.findings) {
      if (b.manifest.panels[f.panel] !== "shipped") continue;
      out.push(buildInsight(b, f.id));
    }
  }
  const slugs = new Set<string>();
  for (const i of out) {
    if (slugs.has(i.slug)) throw new Error(`two published findings share the slug ${i.slug}`);
    slugs.add(i.slug);
  }
  return out.sort((a, b) => byteCompare(a.slug, b.slug));
}

/** The published finding at `slug`, or null. */
export function insightBySlug(slug: string, bundles?: LoadedBundle[]): Insight | null {
  return publishedInsights(bundles).find((i) => i.slug === slug) ?? null;
}
