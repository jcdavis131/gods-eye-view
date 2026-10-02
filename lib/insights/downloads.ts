// The data behind an insight chart, as the two downloads its page links to.
//
// By default both carry the rows the chart plots, and nothing else: no row
// is added, filtered beyond that or recomputed. With ?all=1 (the routes pass
// { all: true }) they carry every row of the chart sidecar, the chart's whole
// universe, the rows it could not plot included. A value the publisher did
// not publish is written "not published" (lib/brief/format.ts MISSING) in
// both, never 0 and never an empty cell; in a plotted row that can only be
// the bubble size. The provenance travels with them: the CSV's `#` footer
// says which rows these are, and has the as-of date, each upstream file's
// citation with its sha256 and Last-Modified, the estimates' methods, the
// rows that are not published and the hashes of the bundle files; the JSON
// has the provenance records of the rows it carries.
//
// Neither stamps a wall-clock time (lib/server/respond.ts csvFooterLines and
// ok() default to new Date()), so the same bundle serves the same bytes.

import { MISSING, num } from "@/lib/brief/format";
import { csvComments, toCsv, type CsvRow } from "@/lib/server/csv";
import { isPlotted } from "./render/table";
import { byteCompare, type BubbleSpec } from "./render/spec";
import type { Insight } from "./types";

export interface DownloadOptions {
  /** Every row of the chart's universe, not only the plotted ones (?all=1). */
  all?: boolean;
}

/** The query string that asks a download route for every row. */
export const ALL_ROWS_QUERY = "all=1";

const cellValue = (v: number | null): number | string => (v === null || !Number.isFinite(v) ? MISSING : v);

function bubbleOf(i: Insight): BubbleSpec {
  if (i.spec.kind !== "bubble") throw new Error(`insight ${i.id}: only bubble charts have a data download`);
  return i.spec;
}

/** Which rows a download carries, and a line that says so. */
function selection(i: Insight, all: boolean): { rows: BubbleSpec["data"]; plotted: number; total: number; note: string } {
  const s = bubbleOf(i);
  const plotted = s.data.filter((d) => isPlotted(s, d)).length;
  const total = s.data.length;
  const rows = all ? s.data : s.data.filter((d) => isPlotted(s, d));
  const note = all
    ? `rows: all ${num(total)} rows of the chart's universe, the ${num(total - plotted)} it does not plot included; without ?${ALL_ROWS_QUERY}, only the ${num(plotted)} plotted rows`
    : `rows: the ${num(plotted)} rows the chart plots; ?${ALL_ROWS_QUERY} adds the ${num(total - plotted)} of its ${num(total)} it does not plot`;
  return { rows, plotted, total, note };
}

/** The chart's rows as CSV with the provenance footer: plotted rows unless { all: true }. */
export function insightCsv(i: Insight, opts: DownloadOptions = {}): string {
  const s = bubbleOf(i);
  const sel = selection(i, opts.all === true);
  const columns = ["id", "Name", s.x.label, s.y.label, s.size.label];
  const rows: CsvRow[] = [...sel.rows]
    .sort((a, b) => byteCompare(a.fullLabel, b.fullLabel) || byteCompare(a.id, b.id))
    .map((d) => ({ id: d.id, Name: d.fullLabel, [s.x.label]: cellValue(d.x), [s.y.label]: cellValue(d.y), [s.size.label]: cellValue(d.size) }));
  const footer = [
    sel.note,
    `missing values: "${MISSING}", never 0 and never empty`,
    `as_of: ${i.asOf}`,
    ...i.citations.map((c) => `source: ${c}`),
    ...(i.notPublished.length ? [`not published: ${i.notPublished.map((m) => m.title).join("; ")}`] : []),
    `finding: ${i.id}, ${i.bundle} (release ${i.release}, rules_version ${i.rulesVersion})`,
    `bundle sha256: manifest.json ${i.hashes.manifest}; chart sidecar ${i.hashes.chart}; evidence ${i.hashes.evidence}`,
    `read with pandas: pd.read_csv(url, comment='#', na_values=['${MISSING}'])`,
  ];
  return `${toCsv(rows, columns)}\r\n${csvComments(footer)}\r\n`;
}

/** The chart's rows and the provenance records they cite, as JSON: plotted rows unless { all: true }. */
export function insightJson(i: Insight, opts: DownloadOptions = {}): Record<string, unknown> {
  const s = bubbleOf(i);
  const sel = selection(i, opts.all === true);
  const rows = [...sel.rows].sort((a, b) => byteCompare(a.id, b.id));
  const cited = new Set(rows.flatMap((d) => d.provenance));
  return {
    finding: i.id,
    slug: i.slug,
    bundle: i.bundle,
    release: i.release,
    rulesVersion: i.rulesVersion,
    status: i.status,
    asOf: i.asOf,
    retrievedAt: i.retrievedAt,
    headline: i.headline,
    chartTitle: i.chartTitle,
    universe: i.universe,
    subject: s.subject ?? null,
    selection: { rows: opts.all === true ? "all" : "plotted", count: rows.length, plotted: sel.plotted, total: sel.total, note: sel.note },
    missing: MISSING,
    columns: {
      x: { label: s.x.label, format: s.x.format },
      y: { label: s.y.label, format: s.y.format },
      size: { label: s.size.label, format: s.size.format },
    },
    rows: rows.map((d) => ({ id: d.id, label: d.label, fullLabel: d.fullLabel, x: cellValue(d.x), y: cellValue(d.y), size: cellValue(d.size), provenance: d.provenance })),
    notPublished: i.notPublished,
    provenance: Object.fromEntries(Object.keys(s.provenance).sort(byteCompare).filter((k) => cited.has(k)).map((k) => [k, s.provenance[k]])),
    citations: i.citations,
    hashes: i.hashes,
  };
}
