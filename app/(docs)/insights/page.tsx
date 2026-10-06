// The published insights, from the committed places bundles.
//
// A finding is listed only when its panel shipped and lib/insights/build.ts
// built it, which means every precondition in its evidence passed and every
// sentence is a registered template. Statically generated from the bundle
// files under lib/insights/data; no network.

import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumbs from "@/components/doc/Breadcrumbs";
import JsonLd from "@/components/doc/JsonLd";
import { publishedInsights } from "@/lib/insights/build";
import { INSIGHTS_DESCRIPTION, insightPath } from "@/lib/insights/feed";
import { insightTrail } from "@/lib/insights/jsonld";
import { breadcrumbJsonLd } from "@/lib/places/jsonld";
import { absoluteUrl } from "@/lib/seo/base";

const DESCRIPTION = INSIGHTS_DESCRIPTION;

export const metadata: Metadata = {
  title: "Insights",
  description: DESCRIPTION,
  alternates: {
    canonical: absoluteUrl("/insights"),
    types: {
      "application/rss+xml": absoluteUrl("/insights/feed.xml"),
      "application/feed+json": absoluteUrl("/insights/feed.json"),
    },
  },
  openGraph: { title: "Insights", description: DESCRIPTION, url: absoluteUrl("/insights"), type: "website" },
};

export default function InsightsIndex() {
  const insights = publishedInsights();
  return (
    <article>
      <JsonLd nodes={[breadcrumbJsonLd(insightTrail())]} />
      <Breadcrumbs trail={insightTrail()} />
      <header className="mt-4">
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">Insights</h1>
        <p className="mt-3 max-w-[48rem] text-[15px] leading-relaxed text-muted-foreground">{DESCRIPTION}</p>
        <p className="mt-2 text-[13px]">
          <a href="/insights/feed.xml" className="text-primary underline">
            RSS
          </a>
          {" · "}
          <a href="/insights/feed.json" className="text-primary underline">
            JSON Feed
          </a>
        </p>
      </header>
      <ol className="mt-8 space-y-8">
        {insights.map((i) => (
          <li key={i.slug} className="border-t border-border pt-5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Panel {i.panel} · {i.bundle} · numbers as of {i.asOf}
            </p>
            <h2 className="mt-1 text-[19px] font-semibold leading-tight">
              <Link href={insightPath(i)} className="text-primary underline">
                {i.chartTitle}
              </Link>
            </h2>
            <p className="mt-2 max-w-[48rem] text-[15px] leading-relaxed text-foreground">{i.headline}</p>
            <p className="mt-2 max-w-[48rem] text-[13px] leading-relaxed text-muted-foreground">{i.dek}</p>
            {i.randomPeer ? <p className="mt-2 max-w-[48rem] text-[13px] leading-relaxed text-foreground">{i.randomPeer}</p> : null}
            <p className="mt-2 text-[13px]">
              <a href={`${insightPath(i)}/data.csv`} className="text-primary underline">
                data.csv
              </a>
              {" · "}
              <a href={`${insightPath(i)}/data.json`} className="text-primary underline">
                data.json
              </a>
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
