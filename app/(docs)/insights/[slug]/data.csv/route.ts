// The chart's rows as CSV: exactly the rows of the committed chart sidecar,
// plotted or not, with a `#` footer carrying the as-of date, the citation of
// every provenance record, the rows that are not published and the bundle's
// hashes (lib/insights/downloads.ts). Statically generated from the bundle;
// no clock in it, so one bundle always serves the same bytes.

import { insightBySlug, publishedInsights } from "@/lib/insights/build";
import { insightCsv } from "@/lib/insights/downloads";
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
  return new Response(insightCsv(i), {
    headers: {
      ...CORS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `inline; filename="${i.slug}.csv"`,
      "cache-control": cacheControl(86400),
    },
  });
}
