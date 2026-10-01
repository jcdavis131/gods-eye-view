// The chart's rows as JSON: exactly the rows of the committed chart sidecar
// with their provenance keys, the provenance records themselves, their
// citations and the bundle's hashes (lib/insights/downloads.ts). Not the
// lib/server/respond.ts ok() envelope, which stamps a wall-clock generatedAt:
// these bytes depend on the bundle only.

import { insightBySlug, publishedInsights } from "@/lib/insights/build";
import { insightJson } from "@/lib/insights/downloads";
import { CORS, cacheControl, notFound, options } from "@/lib/server/respond";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return publishedInsights().map((i) => ({ slug: i.slug }));
}

export const OPTIONS = options;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const i = insightBySlug(slug);
  if (!i) return notFound(`no published insight ${slug}`, { slug });
  return new Response(JSON.stringify(insightJson(i), null, 2) + "\n", {
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": cacheControl(86400) },
  });
}
