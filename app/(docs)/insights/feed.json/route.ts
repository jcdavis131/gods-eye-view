// Every published insight as JSON Feed 1.1: the same document as feed.xml,
// so the two cannot disagree about what was published (lib/insights/feed.ts).

import { publishedInsights } from "@/lib/insights/build";
import { insightsFeedDoc } from "@/lib/insights/feed";
import { renderJsonFeed } from "@/lib/feed/render";
import { absoluteUrl } from "@/lib/seo/base";
import { CORS, cacheControl } from "@/lib/server/respond";

export const dynamic = "force-static";

export function GET(): Response {
  const doc = insightsFeedDoc(publishedInsights(), { self: absoluteUrl("/insights/feed.json"), home: absoluteUrl("/insights") });
  return new Response(JSON.stringify(renderJsonFeed(doc), null, 2), {
    headers: { ...CORS, "content-type": "application/feed+json; charset=utf-8", "cache-control": cacheControl(3600) },
  });
}
