// The data behind an insight chart, as the two downloads its page links to.
//
// Both carry exactly the rows of the chart sidecar - every metro in the
// chart's universe, plotted or not - and nothing else: no row is added,
// dropped, filtered or recomputed. A value the publisher did not publish is
// an empty CSV cell and a JSON null, never 0. The provenance travels with
// them: the CSV's `#` footer has the as-of date, the citation of every
// provenance record, the rows that are not published and the hashes of the
// bundle files; the JSON has the records themselves.
//
// Neither stamps a wall-clock time (lib/server/respond.ts csvFooterLines and
// ok() default to new Date()), so the same bundle serves the same bytes.

import { csvComments } from "@/lib/server/csv";
import { chartTable } from "./render/table";
import { byteCompare } from "./render/spec";
import type { Insight } from "./types";

/** The sidecar's rows as CSV with the provenance footer. */
export function insightCsv(i: Insight): string {
  const footer = [
    `finding: ${i.id}, ${i.bundle} (release ${i.release}, rules_version ${i.rulesVersion})`,
    `bundle sha256: manifest.json ${i.hashes.manifest}; chart sidecar ${i.hashes.chart}; evidence ${i.hashes.evidence}`,
    "read with pandas: pd.read_csv(url, comment='#')",
  ];
  return `${chartTable(i.spec).csv}${csvComments(footer)}\r\n`;
}

/** The sidecar's rows and provenance records as JSON. */
export function insightJson(i: Insight): Record<string, unknown> {
  const s = i.spec;
  if (s.kind !== "bubble") throw new Error(`insight ${i.id}: only bubble charts have a data download`);
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
    columns: {
      x: { label: s.x.label, format: s.x.format },
      y: { label: s.y.label, format: s.y.format },
      size: { label: s.size.label, format: s.size.format },
    },
    rows: [...s.data].sort((a, b) => byteCompare(a.id, b.id)).map((d) => ({ id: d.id, label: d.label, fullLabel: d.fullLabel, x: d.x, y: d.y, size: d.size, provenance: d.provenance })),
    notPublished: i.notPublished,
    provenance: s.provenance,
    citations: i.citations,
    hashes: i.hashes,
  };
}
