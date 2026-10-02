// The published insights as the narrow document lib/feed/render.ts renders
// (RSS 2.0 at /insights/feed.xml, JSON Feed 1.1 at /insights/feed.json).
//
// Entry ids are content-addressed, as in lib/brief/feed.ts: the slug plus a
// hash of the sha256 of the bundle files the insight was built from (chart
// sidecar, evidence, methods). An unchanged bundle re-serves byte-identical
// guids, so a poller is never re-notified; a new export of a finding gets a
// new id, so it is notified exactly once.
//
// Dates. Nothing in a bundle records when a finding was published (the
// manifest says so: nothing records when the export ran), and inventing a
// publication time would be a fabricated fact. Both stamps of an entry are
// therefore the insight's retrievedAt: the latest time the producer fetched
// an upstream file the chart reads, which is the earliest moment the finding
// could have existed. The channel's generatedAt is the latest of those.

import type { FeedDoc, FeedEntry } from "@/lib/feed/render";
import { absoluteUrl } from "@/lib/seo/base";
import { ALL_ROWS_QUERY } from "./downloads";
import type { Insight } from "./types";

/** The generator string the insights feeds carry; not the place briefs' one. */
export const INSIGHTS_GENERATOR = "Embedding Atlas insights";

/**
 * What an insight is, for the index page and the feeds. Not every number is
 * a published cell: growth, ranks, medians and probabilities are computed
 * from published cells, and each page prints how.
 */
export const INSIGHTS_DESCRIPTION =
  "Findings about US places from published public data. Every sentence is a fixed template filled from a hash-verified bundle, and its numbers are published cells and estimates computed from them (formulas printed), each cell cited to its source file.";

export function insightPath(i: Pick<Insight, "slug">): string {
  return `/insights/${i.slug}`;
}

function entryFor(i: Insight): FeedEntry {
  const lines = [
    i.headline,
    i.dek,
    ...(i.randomPeer ? [i.randomPeer] : []),
    ...i.caveats.map((c) => c.text),
    ...i.methodNote,
    `Numbers as of ${i.asOf}. Data (the plotted rows; ?${ALL_ROWS_QUERY} for every row): ${absoluteUrl(`${insightPath(i)}/data.csv`)}`,
    "Sources:",
    ...i.citations,
  ];
  return {
    id: `gev-insight-${i.slug}-${i.contentId}`,
    title: i.chartTitle,
    link: absoluteUrl(insightPath(i)),
    summary: lines.filter((l) => l.length > 0).join("\n"),
    published: i.retrievedAt,
    updated: i.retrievedAt,
    tags: ["insight", `panel ${i.panel}`, i.bundle],
  };
}

export function insightsFeedDoc(insights: Insight[], urls: { self: string; home: string }): FeedDoc {
  if (insights.length === 0) throw new Error("no published insight to put in a feed");
  return {
    id: "insights",
    title: "Embedding Atlas insights",
    description: INSIGHTS_DESCRIPTION,
    homeUrl: urls.home,
    selfUrl: urls.self,
    generatedAt: insights.map((i) => i.retrievedAt).reduce((a, b) => (b > a ? b : a)),
    generator: INSIGHTS_GENERATOR,
    entries: insights.map(entryFor),
  };
}
