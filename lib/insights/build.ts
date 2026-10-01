// A published finding, assembled from a committed places bundle.
//
// buildInsight is pure over a loaded bundle: no clock, no network, no
// randomness. It refuses (throws InsightRefused, naming the reason) unless
// every one of these holds, so a page can only ever render a finding that
// passed them all:
//
//   - the finding's panel is "shipped" in the manifest, and its template
//     family is one this file has sentences for (a total switch);
//   - every precondition the evidence records has pass: true, every printed
//     clause is gated by at least one of them, and every clause that does not
//     print is listed as suppressed with a reason;
//   - every template text in the evidence equals the registered text in
//     sentence.ts, and the sentence uses none of the never-used words;
//   - every slot that prints a number names an evidence number whose value is
//     the slot's value, so the printed number carries that entry's formula
//     and published cells;
//   - the chart sidecar is a valid ChartSpec whose title, universe line and
//     dek are the templates' output, whose rows are exactly the evidence's
//     chart rows with exactly the evidence's values, and whose reference
//     lines are the evidence's medians;
//   - the methods page's lines are the registered ones, and every robustness
//     number equals its evidence entry.
//
// Timestamps are the bundle's own: asOf from the sidecar, retrievedAt the
// latest retrieval among the chart's provenance records.

import { citation, type Provenance, type SourceRef } from "@/lib/provenance/types";
import { SOURCES } from "@/lib/provenance/sources";
import { signedPct, num, ordinal } from "@/lib/brief/format";
import { stableHash } from "@/lib/feed/hash";
import { BUNDLES, loadBundle, type LoadedBundle, type LoadedFinding } from "./load";
import { citations as chartCitations, isPlotted } from "./render/table";
import { byteCompare, parseChartSpec, toProvenance, type BubbleSpec, type ChartSpec } from "./render/spec";
import {
  METHODS_IS,
  METHODS_IS_NOT,
  asSentence,
  axisCopy,
  fill,
  formatSlot,
  headlineSentence,
  isTemplateId,
  robustnessChange,
  statusNote,
  templateText,
  windowLabel,
  type TemplateId,
} from "./sentence";
import type { ArithmeticRow, CellCitation, Evidence, Insight, MetroRef, RobustnessSummary, Slot, SourceEntry } from "./types";

export class InsightRefused extends Error {
  constructor(finding: string, reason: string) {
    super(`finding ${finding} refused: ${reason}`);
    this.name = "InsightRefused";
  }
}

const TUPLE = ["series_id", "year", "period", "value", "footnote", "url", "sha256", "last_modified"] as const;

/** The template families this file can word. A new family is a refusal until it has sentences. */
function templateFamily(template: string): "C1" | null {
  switch (template) {
    case "C1":
      return "C1";
    default:
      return null;
  }
}

/** The source a provenance tuple's file belongs to, by the producer's registry id. */
function sourceRefFor(entry: SourceEntry, spec: ChartSpec): SourceRef | null {
  switch (entry.source) {
    case "bls_ces_sm_data":
    case "bls_ces_sm_data_alt": {
      const p = Object.values(spec.provenance).find((r) => r.source.id === "bls-ces-sm");
      return p ? p.source : null;
    }
    case "qcew_msa_area":
      return SOURCES["bls-qcew"];
    default:
      return null;
  }
}

function hasNumber(s: Slot): s is Slot & { number: string } {
  return "number" in s && typeof s.number === "string";
}

export function buildInsight(bundle: LoadedBundle, findingId: string): Insight {
  const refuse = (reason: string): never => {
    throw new InsightRefused(findingId, reason);
  };
  const f: LoadedFinding = bundle.findings.find((x) => x.id === findingId) ?? refuse(`not in bundle ${bundle.name}`);
  const ev: Evidence = f.evidence;
  const { manifest, methods } = bundle;

  // The finding, its panel and its template family.
  const panel = manifest.panels[f.panel];
  if (panel !== "shipped") refuse(`panel ${f.panel} is ${JSON.stringify(panel)}, not shipped`);
  if (ev.finding_id !== findingId) refuse(`its evidence is for ${JSON.stringify(ev.finding_id)}`);
  if (ev.release !== manifest.release || methods.release !== manifest.release) refuse(`evidence, methods and manifest name different releases`);
  if (ev.status !== manifest.status || methods.status !== manifest.status) refuse(`evidence, methods and manifest disagree on status`);
  if (templateFamily(f.template) === null || ev.template !== f.template) refuse(`no sentences for template ${JSON.stringify(f.template)}`);

  // Preconditions: every one passes.
  if (ev.preconditions.length === 0) refuse("the evidence records no preconditions");
  const failing = ev.preconditions.filter((p) => p.pass !== true);
  if (failing.length) refuse(`precondition ${failing.map((p) => `${p.name} (value ${JSON.stringify(p.value)}, needs ${p.threshold})`).join("; ")} does not pass`);
  if (!ev.preconditions.some((p) => p.gates === findingId)) refuse("no precondition gates the finding itself");

  // The numbers behind every slot.
  // A year slot that cites a published cell prints the cell's year, so it is
  // checked against the tuple's year field; every other numeric slot prints
  // the number's value itself; a list slot prints the metros the count names.
  const numberOf = (where: string, name: string, s: Slot) => {
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
  const checkSlots = (where: string, id: TemplateId, slots: Record<string, Slot>) => {
    for (const [name, s] of Object.entries(slots)) {
      numberOf(where, name, s);
      if (s.format === undefined && "cbsa" in s && s.cbsa !== ev.subject) refuse(`${where} slot {${name}} is ${s.cbsa}, the subject is ${ev.subject}`);
    }
    return fill(id, slots);
  };
  const registered = (where: string, id: string, text: string): TemplateId => {
    if (!isTemplateId(id)) return refuse(`${where} uses template ${id}, which has no registered text`);
    if (text !== templateText(id)) refuse(`${where} template ${id} reads ${JSON.stringify(text)}, not the registered text`);
    return id;
  };

  // The headline.
  const h = ev.headline;
  if (!h.primary) refuse("its headline is not primary");
  const clauses = h.clauses.map((c) => ({ id: registered("headline", c.id, c.text), printed: c.printed }));
  for (const c of clauses) {
    if (c.printed && !ev.preconditions.some((p) => p.gates === c.id)) refuse(`clause ${c.id} prints but no precondition gates it`);
    if (!c.printed && !ev.suppressed.some((s) => s.clause === c.id && s.reason)) refuse(`clause ${c.id} does not print and is not listed as suppressed`);
  }
  for (const c of clauses.filter((x) => x.printed)) checkSlots("headline", c.id, h.slots);
  const headline = headlineSentence(clauses, h.slots, h.join, h.end);
  for (const word of h.never_used) {
    if (new RegExp(`\\b${word.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i").test(headline)) refuse(`the headline uses the never-used word ${JSON.stringify(word)}`);
  }
  const subject = h.slots.subject;
  if (!subject || subject.format !== undefined || !("cbsa" in subject)) return refuse("the headline has no subject slot");
  const methodLine = templateText(registered("method line", h.method_line.id, h.method_line.text));

  // Caveats: printed ones are filled from registered templates; the rest say why not.
  const caveats: Insight["caveats"] = [];
  const notPrinted: Insight["notPrinted"] = ev.suppressed.map((s) => ({ id: s.clause, reason: s.reason }));
  for (const c of ev.caveats) {
    const id = registered(`caveat ${c.id}`, c.id, c.text);
    if (c.printed) caveats.push({ id, text: asSentence(checkSlots(`caveat ${c.id}`, id, c.slots ?? {})) });
    else if (c.reason) notPrinted.push({ id, reason: c.reason });
    else refuse(`caveat ${c.id} does not print and gives no reason`);
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
  if (bubble.headline !== checkSlots("chart title", registered("chart title", ch.title.id, ch.title.text), ch.title.slots)) refuse("the chart title is not its template's output");
  if (bubble.universe !== checkSlots("universe line", registered("universe line", ch.universe_line.id, ch.universe_line.text), ch.universe_line.slots)) refuse("the chart's universe line is not its template's output");
  if (bubble.dek !== ch.dek.text) refuse("the chart dek is not the evidence's");
  if (bubble.subject !== ev.subject) refuse(`the chart's subject is ${JSON.stringify(bubble.subject)}, the evidence's is ${ev.subject}`);
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
  const medians = new Set(Object.values(ch.medians).map((m) => m.value));
  for (const axis of [bubble.x, bubble.y]) {
    for (const r of axis.reference ?? []) if (!medians.has(r.value)) refuse(`reference line ${r.value} on "${axis.label}" is not an evidence median`);
  }
  for (const id of bubble.labels?.ids ?? []) if (!ch.labels.ids.includes(id)) refuse(`chart label ${id} is not one the evidence's label rule picked`);
  for (const m of ch.not_published) {
    const d = bubble.data.find((x) => x.id === m.cbsa) ?? refuse(`${m.title} is named as not published but is not a chart row`);
    if (isPlotted(bubble, d)) refuse(`${m.title} is named as not published but is plotted`);
  }

  // Provenance of every printed cell, cited.
  const sourceByUrl = new Map(Object.values(ev.sources).map((s) => [s.url, s]));
  const cell = (tuple: string): CellCitation => {
    const parts = tuple.split("|");
    if (parts.length !== TUPLE.length) return refuse(`provenance tuple with ${parts.length} fields: ${tuple}`);
    const [seriesId, year, period, value, footnote, url, sha256, lastModified] = parts;
    const entry = sourceByUrl.get(url) ?? refuse(`provenance tuple cites ${url}, which is not an evidence source`);
    const source = sourceRefFor(entry, spec) ?? refuse(`no source reference for upstream file kind ${entry.source}`);
    const provenance: Provenance = {
      source,
      seriesId,
      period: `${year} ${period}`,
      upstreamUrl: url,
      retrievedAt: entry.fetched_at,
      kind: "published",
      notes: [`value ${value}${footnote ? `, footnote ${footnote}` : ""}`, `sha256 ${sha256}`, ...(lastModified ? [`Last-Modified ${lastModified}`] : [])],
    };
    return { seriesId, period: `${year} ${period}`, value, footnote, provenance, citation: citation(provenance) };
  };

  // The arithmetic: every slot that prints a number, where it prints, and the cells behind it.
  const arithmetic: ArithmeticRow[] = [];
  const addRows = (where: string, id: TemplateId, slots: Record<string, Slot>) => {
    const used = [...templateText(id).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
    for (const name of [...new Set(used)]) {
      const s = slots[name];
      if (!s || !hasNumber(s)) continue;
      if (arithmetic.some((r) => r.where === where && r.number === s.number && r.slot === name)) continue;
      const n = ev.numbers[s.number];
      arithmetic.push({
        where,
        slot: name,
        printed: formatSlot(name, s),
        number: s.number,
        kind: n.kind,
        formula: n.formula ?? (n.kind === "registered" ? "a registered value" : refuse(`evidence number ${s.number} has no formula`)),
        over: n.over ?? [],
        cells: (n.provenance ?? []).map(cell),
        ...(n.registered ? { registered: `${n.registered.file} ${n.registered.path} (sha256 ${n.registered.sha256})` } : {}),
      });
    }
  };
  for (const c of clauses.filter((x) => x.printed)) addRows("headline", c.id, h.slots);
  for (const c of ev.caveats.filter((x) => x.printed)) addRows(c.id, c.id as TemplateId, c.slots ?? {});

  // The methods page's lines, rendered here and required to match.
  const methodSlots: Record<string, Slot> = { t0: h.slots.t0, t1: h.slots.t1, N: ch.title.slots.N };
  const is = METHODS_IS.map((id) => fill(id, methodSlots));
  const isNot = METHODS_IS_NOT.map((id) => fill(id, methodSlots));
  if (JSON.stringify(is) !== JSON.stringify(methods.panel_a.is)) refuse("the methods page's \"is\" lines are not the registered ones");
  if (JSON.stringify(isNot) !== JSON.stringify(methods.panel_a.is_not)) refuse("the methods page's \"is not\" lines are not the registered ones");
  if (methods.panel_a.method_line !== methodLine) refuse("the methods page's method line is not the registered one");
  if (methods.panel_a.finding !== findingId) refuse(`the methods page's panel A is ${methods.panel_a.finding}`);
  const panelBText = templateText("C1.methods.panel_b");
  if (methods.panel_b.status !== "pending" || methods.panel_b.text !== panelBText || manifest.panels.B !== "pending") refuse("panel B's status or text is not the registered pending note");
  let status: string;
  try {
    status = statusNote(manifest.status);
  } catch (e) {
    return refuse((e as Error).message);
  }

  // Robustness rows: a summary of each, every printed number checked against the evidence.
  const robustness: RobustnessSummary[] = [];
  for (const rid of Object.keys(methods.robustness.rows).sort(byteCompare)) {
    const row = methods.robustness.rows[rid];
    const files = new Map<string, string>();
    for (const w of Object.keys(row.windows).sort(byteCompare)) {
      const win = row.windows[w];
      const check = (key: string, value: number) => {
        const n = ev.numbers[key] ?? refuse(`robustness ${rid} ${w} names evidence number ${key}, which does not exist`);
        if (n.value !== value) refuse(`robustness ${rid} ${w}: ${key} is ${value} on the methods page, ${JSON.stringify(n.value)} in the evidence`);
        for (const t of n.provenance) {
          const c = cell(t);
          const fileCite: Provenance = { source: c.provenance.source, upstreamUrl: c.provenance.upstreamUrl, retrievedAt: c.provenance.retrievedAt, kind: "published", notes: c.provenance.notes?.slice(1) };
          files.set(c.provenance.upstreamUrl as string, citation(fileCite));
        }
      };
      check(win.publishable.number, win.publishable.value);
      if (!win.axes) {
        robustness.push({ id: rid, kind: row.kind, change: robustnessChange(row), window: windowLabel(w), axes: [], beatOnBoth: null, publishable: `${num(win.publishable.value)} of ${num(win.n)}`, gates: row.gates_no_metro_beat_both, sources: [] });
        continue;
      }
      const axes = Object.entries(win.axes)
        .sort(([a], [b]) => axisCopy(a).order - axisCopy(b).order || byteCompare(a, b))
        .map(([axis, a]) => {
          check(a.growth_pct.number, a.growth_pct.value);
          check(a.rank.number, a.rank.value);
          return { axis, label: axisCopy(axis).label, growth: signedPct(a.growth_pct.value, 1), rank: ordinal(a.rank.value), numbers: [a.growth_pct.number, a.rank.number] as [string, string] };
        });
      const both = win.beat_on_both;
      if (both) check(both.number, both.value);
      robustness.push({
        id: rid,
        kind: row.kind,
        change: robustnessChange(row),
        window: windowLabel(w),
        axes,
        beatOnBoth: both ? { count: num(both.value), names: both.metros.map((m) => m.title), number: both.number } : null,
        publishable: `${num(win.publishable.value)} of ${num(win.n)}`,
        gates: row.gates_no_metro_beat_both,
        sources: [],
      });
    }
    const cites = [...files.entries()].sort(([a], [b]) => byteCompare(a, b)).map(([, c]) => c);
    for (const r of robustness) if (r.id === rid) r.sources = cites;
  }

  // The chart's own provenance, its citations, and the bundle's stamps.
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
    chartTitle: spec.headline,
    dek: spec.dek ?? "",
    universe: spec.universe,
    subject: subjectRef,
    spec,
    asOf: spec.asOf,
    retrievedAt,
    caveats,
    notPrinted,
    methodLine,
    methodNote: [methodLine, status],
    is,
    isNot,
    panelB: { text: panelBText, gate: methods.panel_b.gate },
    preconditions: ev.preconditions,
    arithmetic,
    robustness,
    notPublished: ch.not_published.map((m) => ({ cbsa: m.cbsa, label: m.label, title: m.title, ...(m.reason ? { reason: m.reason } : {}) })),
    failClosed: ch.fail_closed.map((m) => ({ cbsa: m.cbsa, title: m.title })),
    provenance,
    citations: chartCitations(spec),
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
