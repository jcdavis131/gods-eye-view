// The chart's rows as JSON (lib/insights/downloads.ts): the rows the chart
// plots, or with ?all=1 every row of the committed chart sidecar, each with
// its provenance keys, "not published" for a value that was not published,
// the provenance records those rows cite, their citations and the bundle's
// hashes. Not the lib/server/respond.ts ok() envelope, which stamps a
// wall-clock generatedAt: these bytes depend on the bundle and the query
// only.
//
// Rendered per request, because the query picks the rows: a route with
// generateStaticParams is prerendered per path at build time, and the
// prerendered body could not see ?all=1. No network, no clock.

import { insightBySlug } from "@/lib/insights/build";
import { insightJson } from "@/lib/insights/downloads";
import { CORS, cacheControl, notFound, options } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export const OPTIONS = options;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const i = insightBySlug(slug);
  if (!i) return notFound(`no published insight ${slug}`, { slug });
  const all = new URL(req.url).searchParams.get("all") === "1";
  return new Response(JSON.stringify(insightJson(i, { all }), null, 2) + "\n", {
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": cacheControl(86400) },
  });
}
