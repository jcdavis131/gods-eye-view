// Every published insight as RSS 2.0. Built from the committed bundles at
// build time: entry ids are content-addressed (lib/insights/feed.ts), so an
// unchanged bundle serves byte-identical guids and a poller is never
// re-notified, and the dates are the bundle's own stamps, never a clock.

import { publishedInsights } from "@/lib/insights/build";
import { insightsFeedDoc } from "@/lib/insights/feed";
import { renderRss } from "@/lib/feed/render";
import { absoluteUrl } from "@/lib/seo/base";
import { CORS, cacheControl } from "@/lib/server/respond";

export const dynamic = "force-static";

export function GET(): Response {
  const doc = insightsFeedDoc(publishedInsights(), { self: absoluteUrl("/insights/feed.xml"), home: absoluteUrl("/insights") });
  return new Response(renderRss(doc), {
    headers: { ...CORS, "content-type": "application/rss+xml; charset=utf-8", "cache-control": cacheControl(3600) },
  });
}
