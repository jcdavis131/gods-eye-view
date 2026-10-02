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
//     sentence.ts, each ladder is the registered ladder and the chosen rung
//     is the one its rule picks (the title: the first that every canvas can
//     set, measured here with render/canvas.ts; the subtitle: the first that
//     fills to at most 240 characters), and the sentence uses none of the
//     never-used words;
//   - every slot that prints a number names an evidence number whose value is
//     the slot's value, so the printed number carries that entry's formula
//     and published cells; a probability's exact fraction is recomputed;
//   - the chart sidecar is a valid ChartSpec whose title, subtitle, subject
//     note, universe line, axis labels and estimate methods are the
//     templates' output, whose rows are exactly the evidence's chart rows
//     with exactly the evidence's values, whose reference lines are the
//     evidence's medians, and whose labels are the evidence's request in its
//     order, which the renderer keeps;
//   - the methods page's lines are the registered ones, every robustness
//     number equals its evidence entry, and every robustness denominator is
//     the size of the universe of the sets its count runs over.
//
// Timestamps are the bundle's own: asOf from the sidecar, retrievedAt the
// latest retrieval among the chart's provenance records.

import { citation, type Provenance, type SourceRef } from "@/lib/provenance/types";
import { signedPct, num, ordinal } from "@/lib/brief/format";
import { stableHash } from "@/lib/feed/hash";
import { BUNDLES, loadBundle, type LoadedBundle, type LoadedFinding } from "./load";
import { CANVAS_IDS, headlineMisfits, type CanvasId } from "./render/canvas";
import { LABEL_CAP, requestedLabels } from "./render/charts/bubble";
import { isPlotted } from "./render/table";
import { byteCompare, canonicalJson, parseChartSpec, toProvenance, type BubbleSpec, type ChartSpec } from "./render/spec";
import {
  DEK_LADDER_RECENCY,
  DEK_LIMIT,
  GATING_ROWS_H3B,
  METHODS_IS,
  METHODS_IS_NOT,
  TITLE_LADDER_H3B,
  asSentence,
  axisCopy,
  fill,
  formatSlot,
  headlineSentence,
  isTemplateId,
  placeholders,
  robustnessChange,
  statusNote,
  templateText,
  windowLabel,
  type TemplateId,
} from "./sentence";
import { anchorMainToChart, recomputeMedian, recomputeRandomPeer, recomputeSpec } from "./recompute";
import { SHAPING, sourceRefById } from "./sources";
import type {
  ArithmeticRow,
  CellCitation,
  Evidence,
  EvidenceNumber,
  FileCitation,
  Insight,
  Methods,
  MetroRef,
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
const H3B = "C1.H3b";
const RECENCY = "C1.caveat.recency";

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

// ---------------------------------------------------------------- the build

export function buildInsight(bundle: LoadedBundle, findingId: string): Insight {
  const refuse = (reason: string): never => {
    throw new InsightRefused(findingId, reason);
  };
  const f: LoadedFinding = bundle.findings.find((x) => x.id === findingId) ?? refuse(`not in bundle ${bundle.name}`);
  const ev: Evidence = f.evidence;
  const { manifest, methods } = bundle;

  // The finding, its panel, its template family and the status line.
  const panel = manifest.panels[f.panel];
  if (panel !== "shipped") refuse(`panel ${f.panel} is ${JSON.stringify(panel)}, not shipped`);
  if (ev.finding_id !== findingId) refuse(`its evidence is for ${JSON.stringify(ev.finding_id)}`);
  if (ev.release !== manifest.release || methods.release !== manifest.release) refuse(`evidence, methods and manifest name different releases`);
  if (ev.status !== manifest.status || methods.status !== manifest.status) refuse(`evidence, methods and manifest disagree on status`);
  if (templateFamily(f.template) === null || ev.template !== f.template) refuse(`no sentences for template ${JSON.stringify(f.template)}`);
  const sl = methods.status_line;
  if (!sl || sl.id !== "C1.methods.status" || sl.slots.status !== manifest.status || sl.slots.panel_a !== manifest.panels.A || sl.slots.panel_b !== manifest.panels.B) {
    refuse("the methods page's status line does not agree with the manifest");
  }

  // Preconditions: every one passes.
  if (ev.preconditions.length === 0) refuse("the evidence records no preconditions");
  const failing = ev.preconditions.filter((p) => p.pass !== true);
  if (failing.length) refuse(`precondition ${failing.map((p) => `${p.name} (value ${JSON.stringify(p.value)}, needs ${p.threshold})`).join("; ")} does not pass`);
  if (!ev.preconditions.some((p) => p.gates === findingId)) refuse("no precondition gates the finding itself");

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
  const checkSlots = (where: string, id: TemplateId, slots: Record<string, Slot>): string => {
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
  const registered = (where: string, id: string, text: string): TemplateId => {
    if (!isTemplateId(id)) return refuse(`${where} uses template ${id}, which has no registered text`);
    if (text !== templateText(id)) refuse(`${where} template ${id} reads ${JSON.stringify(text)}, not the registered text`);
    return id;
  };

  // The headline, and the H3b clause's own gate.
  const h = ev.headline;
  if (!h.primary) refuse("its headline is not primary");
  const clauses = h.clauses.map((c) => ({ id: registered("headline", c.id, c.text), printed: c.printed }));
  for (const c of clauses) {
    if (c.printed && !ev.preconditions.some((p) => p.gates === c.id)) refuse(`clause ${c.id} prints but no precondition gates it`);
    if (!c.printed && !ev.suppressed.some((s) => s.clause === c.id && s.reason)) refuse(`clause ${c.id} does not print and is not listed as suppressed`);
    if (methods.panel_a.headline?.clauses?.[c.id] !== c.printed) refuse(`the methods page and the evidence disagree on whether clause ${c.id} prints`);
  }
  const h3bPrinted = clauses.some((c) => c.id === H3B && c.printed);
  if (h3bPrinted) {
    const problems = h3bGate(ev, methods);
    if (problems.length) refuse(`the H3b clause prints but its gate does not hold: ${problems.join("; ")}`);
  }
  for (const c of clauses.filter((x) => x.printed)) checkSlots("headline", c.id, h.slots);
  let headline: string;
  try {
    headline = headlineSentence(clauses, h.slots, h.join, h.end);
  } catch (e) {
    return refuse(`headline: ${(e as Error).message}`);
  }
  for (const word of h.never_used) {
    if (new RegExp(`\\b${word.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i").test(headline)) refuse(`the headline uses the never-used word ${JSON.stringify(word)}`);
  }
  const subject = h.slots.subject;
  if (!subject || subject.format !== undefined || !("cbsa" in subject) || subject.cbsa !== ev.subject) return refuse("the headline has no subject slot for the evidence's subject");
  const methodLine = templateText(registered("method line", h.method_line.id, h.method_line.text));

  // The registered window: both ends are registered numbers, read from the pre-registration.
  const t0 = h.slots.t0;
  const t1 = h.slots.t1;
  for (const [name, s, key] of [["t0", t0, "window.t0"], ["t1", t1, "window.t1"]] as const) {
    if (!s || s.format !== "year" || s.number !== key || ev.numbers[key]?.kind !== "registered") refuse(`the headline's {${name}} is not the registered ${key}`);
  }
  const windowSlots: Record<string, Slot> = { t0, t1 };
  const window = { t0: (t0 as { value: number }).value, t1: (t1 as { value: number }).value };

  // The main specification, recomputed from its sets: the chart's rows are its universe and read its numbers, and
  // the subject's ranks, the publishable count, the beat-on-both and not-publishable counts, the medians and the
  // random peer's m and n are what the sets say, not only what the evidence numbers say.
  const nSlot = h.slots.N;
  const mainPrefix = nSlot && hasNumber(nSlot) && nSlot.number.endsWith(".publishable") ? nSlot.number.slice(0, -".publishable".length) : refuse("the headline's {N} is not a publishable count");
  if (mainPrefix !== `main:${window.t0}->${window.t1}`) refuse(`the headline's {N} counts ${mainPrefix}, not the main specification over the registered window`);
  const mainProblems = [
    ...anchorMainToChart(ev, mainPrefix, "office", "goods_logistics"),
    ...recomputeSpec(ev, mainPrefix, ev.subject),
    ...Object.values(ev.chart.medians).flatMap((m) => recomputeMedian(ev, m.number)),
    ...Object.values(ev.random_peer.grid).flatMap((g) => recomputeRandomPeer(ev, g.number, mainPrefix, ev.subject)),
  ];
  if (mainProblems.length) refuse(`the evidence's counts disagree with its sets: ${mainProblems.join("; ")}`);
  for (const [name, axis, what] of [["a", "office", "growth_pct"], ["b", "goods_logistics", "growth_pct"], ["r_a", "office", "rank"], ["r_b", "goods_logistics", "rank"]] as const) {
    const r = h.slots[name];
    if (!r || !hasNumber(r) || r.number !== `${mainPrefix}.${ev.subject}.${axis}.${what}`) refuse(`the headline's {${name}} is not the subject's ${axis} ${what} in ${mainPrefix}`);
  }

  // Caveats: printed ones are filled from registered templates; the rest say why not.
  const caveats: Insight["caveats"] = [];
  const notPrinted: Insight["notPrinted"] = ev.suppressed.map((s) => ({ id: s.clause, reason: s.reason }));
  for (const c of ev.caveats) {
    const id = registered(`caveat ${c.id}`, c.id, c.text);
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

  // The random-peer probability: the sentence, and its arithmetic recomputed exactly.
  const rp = ev.random_peer;
  let randomPeer: string | null = null;
  const randomPeerGrid: Array<{ k: number; printed: string; number: string; arithmetic: string }> = [];
  // n is the publishable metros other than the subject: the universe line's {n_pub} count, less one.
  const nPub = ev.chart.universe_line.slots.n_pub;
  const pubMain = nPub && hasNumber(nPub) ? ev.numbers[nPub.number] : undefined;
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
    const id = registered("random peer", rp.id, rp.text);
    const k = rp.slots.k;
    const p = rp.slots.p;
    if (!k || !("value" in k) || k.value !== rp.rule.k || !hasNumber(k) || ev.numbers[k.number]?.kind !== "registered") refuse("the random-peer k is not the registered k");
    if (!p || !hasNumber(p) || rp.grid[String(rp.rule.k)]?.number !== p.number) refuse("the random-peer probability is not the grid's entry at the registered k");
    for (const kg of rp.rule.k_grid) {
      const g = rp.grid[String(kg)] ?? refuse(`the random-peer grid has no k = ${kg}`);
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
  const titleId = registered("chart title", ch.title.id, ch.title.text);
  if (h3bPrinted) {
    const ladder = (ch.title.ladder ?? []).map((r) => registered("chart title ladder", r.id, r.text));
    if (canonicalJson(ladder) !== canonicalJson(TITLE_LADDER_H3B)) refuse(`the chart title's ladder is ${JSON.stringify(ladder)}, not the registered ${JSON.stringify(TITLE_LADDER_H3B)}`);
    const fits = TITLE_LADDER_H3B.find((id) => headlineMisfits(checkSlots("chart title", id, ch.title.slots)).length === 0) ?? refuse("no rung of the H3b title ladder fits every canvas");
    if (titleId !== fits) refuse(`the chart title is ${titleId}, but ${fits} is the first rung every canvas can set`);
  } else if (titleId !== "C1.chart_title.raw") refuse(`the H3b clause does not print, so the chart title must be the neutral C1.chart_title.raw, not ${titleId}`);
  const chartTitle = checkSlots("chart title", titleId, ch.title.slots);
  if (bubble.headline !== chartTitle) refuse("the chart title is not its template's output");

  // The subtitle: the recency ladder's first rung within DEK_LIMIT, with the recency caveat's own slots, or the neutral line.
  const dekId = registered("chart subtitle", ch.dek.id, ch.dek.text);
  if (recency?.printed) {
    const ladder = (ch.dek.ladder ?? []).map((r) => registered("chart subtitle ladder", r.id, r.text));
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
  if (ch.subject_note) {
    const id = registered("subject label", ch.subject_note.id, ch.subject_note.text);
    const a = ch.subject_note.slots.a;
    const b = ch.subject_note.slots.b;
    if (!subjectRow || !a || !b || !hasNumber(a) || !hasNumber(b) || a.number !== subjectRow.x || b.number !== subjectRow.y) refuse("the subject's label values are not its chart row's x and y");
    const note = checkSlots("subject label", id, ch.subject_note.slots);
    if (canonicalJson(bubble.subjectNotes ?? []) !== canonicalJson([note])) refuse("the chart's subject note is not its template's output");
  } else if ((bubble.subjectNotes ?? []).length) refuse("the chart carries a subject note the evidence does not");

  if (bubble.universe !== checkSlots("universe line", registered("universe line", ch.universe_line.id, ch.universe_line.text), ch.universe_line.slots)) refuse("the chart's universe line is not its template's output");
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
  const plotted = bubble.data.filter((d) => isPlotted(bubble, d)).length;
  if (plotted !== ch.plotted) refuse(`the chart plots ${plotted} rows, the evidence says ${ch.plotted}`);
  for (const m of ch.not_published) {
    const d = bubble.data.find((x) => x.id === m.cbsa) ?? refuse(`${m.title} is named as not published but is not a chart row`);
    if (isPlotted(bubble, d)) refuse(`${m.title} is named as not published but is plotted`);
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
  if (canonicalJson(requestedLabels(bubble)) !== canonicalJson(requested)) refuse("the renderer would not ask for the evidence's labels in the evidence's order");

  // Provenance of every printed cell, cited with its file's sha256 and Last-Modified.
  const cesRef: SourceRef | null = Object.values(spec.provenance).find((r) => r.source.id === "bls-ces-sm")?.source ?? null;
  const sourceByUrl = new Map(Object.values(ev.sources).map((s) => [s.url, s]));
  const cell = (tuple: string): CellCitation => {
    const parts = tuple.split("|");
    if (parts.length !== TUPLE.length) return refuse(`provenance tuple with ${parts.length} fields: ${tuple}`);
    const [seriesId, year, period, value, footnote, url, sha256, lastModified] = parts;
    const entry = sourceByUrl.get(url) ?? refuse(`provenance tuple cites ${url}, which is not an evidence source`);
    if (entry.sha256 !== sha256 || (entry.last_modified ?? "") !== lastModified) refuse(`provenance tuple cites ${url} at ${sha256}, Last-Modified ${lastModified}; the evidence source says otherwise`);
    const source = sourceRefById(entry.source, cesRef) ?? refuse(`no source reference for upstream file kind ${entry.source}`);
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
  const manifestByUrl = new Map(Object.values(manifest.sources).map((s) => [s.url, s]));
  const yearsByUrl = new Map<string, Set<number>>();
  for (const d of bubble.data) {
    for (const k of ["x", "y", "size"] as const) {
      for (const t of ev.numbers[ch.rows[d.id][k]].provenance) {
        const c = cell(t);
        const ys = yearsByUrl.get(c.url) ?? new Set<number>();
        ys.add(Number(c.period.slice(0, 4)));
        yearsByUrl.set(c.url, ys);
      }
    }
  }
  for (const p of Object.values(spec.provenance)) {
    if (p.upstreamUrl && !yearsByUrl.has(p.upstreamUrl)) refuse(`the chart cites ${p.upstreamUrl}, which none of its rows' numbers read`);
  }
  const fileCite = (entry: SourceEntry, ref: SourceRef, period: string): Provenance => ({ source: ref, upstreamUrl: entry.url, period, retrievedAt: entry.fetched_at, kind: "published" });
  const files: FileCitation[] = [...yearsByUrl.keys()].sort(byteCompare).map((url) => {
    const entry = manifestByUrl.get(url) ?? refuse(`the chart reads ${url}, which manifest.json does not record`);
    const ref = sourceRefById(entry.source, cesRef) ?? refuse(`no source reference for upstream file kind ${entry.source}`);
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
  const shaping: ShapingSource[] = SHAPING.map((rule) => {
    const entry = Object.values(manifest.sources).find((s) => s.source === rule.id) ?? refuse(`manifest.json records no ${rule.id} file`);
    const provenance = fileCite(entry, rule.ref, rule.coverage);
    return { id: rule.id, role: rule.role, url: entry.url, coverage: rule.coverage, chart: rule.chart, provenance, citation: withFile(citation(provenance), entry.sha256, entry.last_modified, entry.bytes) };
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
      arithmetic.push({
        where,
        slot: name,
        printed: formatSlot(name, s),
        number: s.number,
        kind: n.kind,
        formula: n.formula ?? (n.kind === "registered" ? "a registered value" : refuse(`evidence number ${s.number} has no formula`)),
        ...(prob ? { arithmetic: prob.arithmetic } : {}),
        over: n.over ?? [],
        cells: (n.provenance ?? []).map(cell),
        ...(n.registered ? { registered: `${n.registered.file} ${n.registered.path} (sha256 ${n.registered.sha256})` } : {}),
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
  const is = METHODS_IS.map((id) => fill(id, methodSlots));
  const isNot = METHODS_IS_NOT.map((id) => fill(id, methodSlots));
  if (canonicalJson(is) !== canonicalJson(methods.panel_a.is)) refuse("the methods page's \"is\" lines are not the registered ones");
  if (canonicalJson(isNot) !== canonicalJson(methods.panel_a.is_not)) refuse("the methods page's \"is not\" lines are not the registered ones");
  if (methods.panel_a.method_line !== methodLine) refuse("the methods page's method line is not the registered one");
  if (methods.panel_a.finding !== findingId) refuse(`the methods page's panel A is ${methods.panel_a.finding}`);
  const panelBText = templateText("C1.methods.panel_b");
  if (methods.panel_b.status !== "pending" || methods.panel_b.text !== panelBText || manifest.panels.B !== "pending") refuse("panel B's status or text is not the registered pending note");
  let status: string;
  try {
    status = statusNote(manifest.status, t0);
  } catch (e) {
    return refuse((e as Error).message);
  }
  addRows("Status note", "C1.methods.status", { t0 });

  // Robustness rows: a summary of each, every printed number checked against the evidence.
  const robustness: RobustnessSummary[] = [];
  /** How each robustness column is computed: the evidence's own formula, once per formula, with the rows that use it. */
  const formulas = new Map<string, { column: string; rows: Set<string> }>();
  for (const rid of Object.keys(methods.robustness.rows).sort(byteCompare)) {
    const row = methods.robustness.rows[rid];
    const cites = new Map<string, string>();
    for (const w of Object.keys(row.windows).sort(byteCompare)) {
      const win = row.windows[w];
      const check = (column: string, key: string, value: number) => {
        const n = ev.numbers[key] ?? refuse(`robustness ${rid} ${w} names evidence number ${key}, which does not exist`);
        if (n.value !== value) refuse(`robustness ${rid} ${w}: ${key} is ${value} on the methods page, ${JSON.stringify(n.value)} in the evidence`);
        const formula = n.formula ?? refuse(`robustness ${rid} ${w}: evidence number ${key} has no formula`);
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
      const recomputed = recomputeSpec(ev, prefix, win.subject);
      if (recomputed.length) refuse(`robustness ${rid} ${w}: the evidence's counts disagree with its sets: ${recomputed.join("; ")}`);
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
      const base = {
        id: rid,
        kind: row.kind,
        change: robustnessChange(row),
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
      if (both) check("Beat on both", both.number, both.value);
      robustness.push({ ...base, axes, beatOnBoth: both ? { count: num(both.value), names: both.metros.map((m) => m.title), number: both.number } : null });
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

  // The chart's own provenance and the bundle's stamps.
  const provenance = Object.keys(spec.provenance)
    .sort(byteCompare)
    .map((k) => toProvenance(spec.provenance[k]));
  const retrievedAt = provenance.map((p) => p.retrievedAt).reduce((a, b) => (b > a ? b : a));
  const hashes = { manifest: bundle.hashes["manifest.json"], chart: bundle.hashes[f.chartFile], evidence: bundle.hashes[f.evidenceFile], methods: bundle.hashes["methods.json"] };

  const subjectRef: MetroRef = { cbsa: subject.cbsa, label: subject.label, title: subject.title };
  return {
    id: findingId,
    slug: spec.slug,
    bundle: bundle.name,
    release: manifest.release,
    rulesVersion: manifest.rules_version,
    status: manifest.status,
    panel: f.panel,
    headline,
    chartTitle,
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
    panelB: { text: panelBText, gate: methods.panel_b.gate },
    preconditions: ev.preconditions,
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
