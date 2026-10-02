// The chart's rows as CSV (lib/insights/downloads.ts): the rows the chart
// plots, or with ?all=1 every row of the committed chart sidecar, the ones
// it could not plot included. A value that was not published is written
// "not published". A `#` footer says which rows these are and carries the
// as-of date, each upstream file's citation, the rows that are not published
// and the bundle's hashes.
//
// Rendered per request, because the query picks the rows: a route with
// generateStaticParams is prerendered per path at build time, and the
// prerendered body could not see ?all=1. It reads only the committed bundle
// (no network, no clock), so the same URL always serves the same bytes.

import { insightBySlug } from "@/lib/insights/build";
import { insightCsv } from "@/lib/insights/downloads";
import { CORS, cacheControl, notFound, options } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export const OPTIONS = options;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const i = insightBySlug(slug);
  if (!i) return notFound(`no published insight ${slug}`, { slug });
  const all = new URL(req.url).searchParams.get("all") === "1";
  return new Response(insightCsv(i, { all }), {
    headers: {
      ...CORS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `inline; filename="${i.slug}${all ? "-all" : ""}.csv"`,
      "cache-control": cacheControl(86400),
    },
  });
}
