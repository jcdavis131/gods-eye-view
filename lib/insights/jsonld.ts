// schema.org nodes for an insight page, hand-typed like lib/places/jsonld.ts.
//
// Three nodes: the finding as a Report, the chart's rows as a Dataset whose
// distributions are the two downloads the page really serves, and the
// breadcrumb. isBasedOn is lib/places/jsonld.ts's own, fed the chart's
// provenance records, so its entries are the upstream files the numbers were
// read from, each with its own licence and publisher. Dates are the bundle's
// (asOf), never a clock.

import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/base";
import { breadcrumbJsonLd, isBasedOn } from "@/lib/places/jsonld";
import { byteCompare } from "./render/spec";
import { insightPath } from "./feed";
import type { Insight } from "./types";

const CONTEXT = "https://schema.org";

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

export function insightJsonLd(i: Insight): unknown[] {
  const url = absoluteUrl(insightPath(i));
  const publishers = new Map<string, Record<string, unknown>>();
  for (const p of i.provenance) if (!publishers.has(p.source.publisher)) publishers.set(p.source.publisher, organization(p.source.publisher, p.source.url));
  const licenses = [...new Set(i.provenance.map((p) => p.source.license))].sort(byteCompare);
  const interval = i.provenance.map((p) => p.period ?? "").find((p) => /^\d{4}\/\d{4}$/.test(p));

  const dataset: Record<string, unknown> = {
    "@context": CONTEXT,
    "@type": "Dataset",
    "@id": `${url}#data`,
    name: i.chartTitle,
    description: i.universe,
    url,
    license: licenses[0],
    isAccessibleForFree: true,
    creator: [...publishers.values()],
    publisher: organization(SITE_NAME, SITE_URL),
    ...(interval ? { temporalCoverage: interval } : {}),
    distribution: [
      { "@type": "DataDownload", name: `${i.chartTitle} (CSV)`, contentUrl: absoluteUrl(`${insightPath(i)}/data.csv`), encodingFormat: "text/csv" },
      { "@type": "DataDownload", name: `${i.chartTitle} (JSON)`, contentUrl: absoluteUrl(`${insightPath(i)}/data.json`), encodingFormat: "application/json" },
    ],
    isBasedOn: isBasedOn(i.provenance),
    dateModified: i.asOf,
  };
  const report: Record<string, unknown> = {
    "@context": CONTEXT,
    "@type": "Report",
    "@id": `${url}#insight`,
    name: i.chartTitle,
    headline: i.headline,
    abstract: i.dek,
    url,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    about: { "@type": "Place", name: i.subject.title, url: absoluteUrl(`/metro/${i.subject.cbsa}`) },
    publisher: organization(SITE_NAME, SITE_URL),
    isBasedOn: { "@id": `${url}#data` },
    citation: i.citations,
    dateModified: i.asOf,
  };
  return [report, dataset, breadcrumbJsonLd(insightTrail(i))];
}
