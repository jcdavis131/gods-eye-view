// schema.org nodes for an insight page, hand-typed like lib/places/jsonld.ts.
//
// Three nodes: the finding as a Report, the chart's rows as a Dataset whose
// distributions are the downloads the page really serves, and the
// breadcrumb. The Report's headline is the chart title: search engines take
// at most 110 characters there, and the finding's full sentence goes in its
// description (with the recency caveat when the title makes the H3b claim),
// so a title past that bound throws rather than be cut. Dates
// are the bundle's (asOf), never a clock.
//
// isBasedOn is built here from the insight's own file list, not from
// lib/places/jsonld.ts isBasedOn (which takes the first provenance record's
// period per URL: "2019 annual average" for a file read for 2019 and 2025).
// Each entry is one upstream file the chart's rows read, its
// temporalCoverage the ISO 8601 span of the years actually read from it
// (sm.data.54: 2019 and 2025, so "2019/2025"), plus the delineation that
// decides which metros there are. The Report adds the files that shape the
// page's other claims: the fail-closed weights and row P1's peer ranking.

import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/base";
import { breadcrumbJsonLd } from "@/lib/places/jsonld";
import type { Provenance } from "@/lib/provenance/types";
import { isoYears } from "./build";
import { ALL_ROWS_QUERY } from "./downloads";
import { byteCompare } from "./render/spec";
import { insightPath } from "./feed";
import type { Insight } from "./types";

const CONTEXT = "https://schema.org";
/** The longest Report headline: the bound search engines apply to schema.org headline. */
export const HEADLINE_MAX = 110;

function organization(name: string, url: string): Record<string, unknown> {
  return { "@type": "Organization", name, url };
}

/** The visible breadcrumb and the BreadcrumbList, from one array. */
export function insightTrail(i?: Pick<Insight, "slug" | "chartTitle">): Array<{ name: string; url: string }> {
  const trail = [
    { name: SITE_NAME, url: "/" },
    { name: "Insights", url: "/insights" },
  ];
  return i ? [...trail, { name: i.chartTitle, url: insightPath(i) }] : trail;
}

/** The Report's headline: the chart title, which the template registry keeps short; past HEADLINE_MAX it throws. */
export function reportHeadline(i: Pick<Insight, "id" | "chartTitle">): string {
  if (i.chartTitle.length > HEADLINE_MAX) throw new Error(`insight ${i.id}: the chart title is ${i.chartTitle.length} characters, over the ${HEADLINE_MAX} a Report headline takes`);
  return i.chartTitle;
}

/** One upstream file as a schema.org Dataset, with what it covers. */
function fileNode(p: Provenance, temporalCoverage: string): Record<string, unknown> {
  return {
    "@type": "Dataset",
    name: p.source.name,
    url: p.upstreamUrl ?? p.source.url,
    license: p.source.license,
    creator: organization(p.source.publisher, p.source.url),
    temporalCoverage,
  };
}

/** The files the chart's rows read, each with the years read from it, then the files that decide which metros are rows. */
export function insightIsBasedOn(i: Insight): Array<Record<string, unknown>> {
  return [...i.files.map((f) => fileNode(f.provenance, isoYears(f.years))), ...i.shaping.filter((s) => s.chart).map((s) => fileNode(s.provenance, s.coverage))];
}

export function insightJsonLd(i: Insight): unknown[] {
  const url = absoluteUrl(insightPath(i));
  const publishers = new Map<string, Record<string, unknown>>();
  for (const p of [...i.files.map((f) => f.provenance), ...i.shaping.filter((s) => s.chart).map((s) => s.provenance)]) {
    if (!publishers.has(p.source.publisher)) publishers.set(p.source.publisher, organization(p.source.publisher, p.source.url));
  }
  const licenses = [...new Set(i.files.map((f) => f.provenance.source.license))].sort(byteCompare);
  const coverage = isoYears([i.window.t0, i.window.t1]);
  const data = absoluteUrl(`${insightPath(i)}/data`);

  const dataset: Record<string, unknown> = {
    "@context": CONTEXT,
    "@type": "Dataset",
    "@id": `${url}#data`,
    name: i.chartTitle,
    description: `${i.universe}. The rows the chart plots; ?${ALL_ROWS_QUERY} adds the ones it does not.`,
    url,
    license: licenses[0],
    isAccessibleForFree: true,
    creator: [...publishers.values()],
    publisher: organization(SITE_NAME, SITE_URL),
    temporalCoverage: coverage,
    distribution: [
      { "@type": "DataDownload", name: `${i.chartTitle} (CSV, plotted rows)`, contentUrl: `${data}.csv`, encodingFormat: "text/csv" },
      { "@type": "DataDownload", name: `${i.chartTitle} (CSV, every row)`, contentUrl: `${data}.csv?${ALL_ROWS_QUERY}`, encodingFormat: "text/csv" },
      { "@type": "DataDownload", name: `${i.chartTitle} (JSON, plotted rows)`, contentUrl: `${data}.json`, encodingFormat: "application/json" },
      { "@type": "DataDownload", name: `${i.chartTitle} (JSON, every row)`, contentUrl: `${data}.json?${ALL_ROWS_QUERY}`, encodingFormat: "application/json" },
    ],
    isBasedOn: insightIsBasedOn(i),
    dateModified: i.asOf,
  };
  const report: Record<string, unknown> = {
    "@context": CONTEXT,
    "@type": "Report",
    "@id": `${url}#insight`,
    name: i.chartTitle,
    headline: reportHeadline(i),
    description: i.description,
    abstract: i.dek,
    url,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    temporalCoverage: coverage,
    about: { "@type": "Place", name: i.subject.title, url: absoluteUrl(`/metro/${i.subject.cbsa}`) },
    publisher: organization(SITE_NAME, SITE_URL),
    isBasedOn: [{ "@id": `${url}#data` }, ...i.shaping.filter((s) => !s.chart).map((s) => fileNode(s.provenance, s.coverage))],
    citation: [...i.citations, ...i.shaping.filter((s) => !s.chart).map((s) => s.citation)],
    dateModified: i.asOf,
  };
  return [report, dataset, breadcrumbJsonLd(insightTrail(i))];
}
