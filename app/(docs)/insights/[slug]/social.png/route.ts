// The 1080 x 1350 social card: the chart's social-canvas SVG (dark theme,
// headline, dek, source lines and brand footer) rasterised by resvg-wasm with
// the vendored Geist faces as its only fonts (lib/insights/render/raster.ts).
// Node runtime: raster.ts reads the wasm and the fonts from disk, and
// next.config.ts traces them into /insights/**.

import { insightBySlug, publishedInsights } from "@/lib/insights/build";
import { PNG_WIDTH, toPng } from "@/lib/insights/render/raster";
import { renderSvg } from "@/lib/insights/render/render";
import { cacheControl, notFound } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return publishedInsights().map((i) => ({ slug: i.slug }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const i = insightBySlug(slug);
  if (!i) return notFound(`no published insight ${slug}`, { slug });
  const png = await toPng(renderSvg(i.spec, "social", "dark"), PNG_WIDTH.social);
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "content-disposition": `inline; filename="${i.slug}.png"`,
      "cache-control": cacheControl(86400),
    },
  });
}
