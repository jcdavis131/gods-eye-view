import type { MetadataRoute } from "next";

import { publishedInsights } from "@/lib/insights/build";
import { insightPath } from "@/lib/insights/feed";
import { absoluteUrl } from "@/lib/seo/base";

// The insights hub and every published insight, served at
// /insights/sitemap.xml and listed in app/robots.ts.
//
// lastModified is the date the numbers are as of (the chart sidecar's asOf),
// which is what changes when a new bundle is imported; the hub carries the
// latest of them. No clock, so one bundle always writes the same file.

export default function sitemap(): MetadataRoute.Sitemap {
  const insights = publishedInsights();
  const latest = insights.map((i) => i.asOf).reduce((a, b) => (b > a ? b : a), "");
  return [
    { url: absoluteUrl("/insights"), ...(latest ? { lastModified: latest } : {}), changeFrequency: "weekly" as const, priority: 0.8 },
    ...insights.map((i) => ({ url: absoluteUrl(insightPath(i)), lastModified: i.asOf, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
