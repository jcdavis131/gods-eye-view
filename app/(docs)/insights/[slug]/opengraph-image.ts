// The 1200 x 630 Open Graph card for an insight: the chart's og-canvas SVG
// (a text column with the chart title, its subtitle and the source lines, the
// plot beside it; the subtitle carries the recency caveat when the title makes
// the H3b claim)
// rasterised by resvg-wasm with the vendored Geist faces. Not next/og's
// ImageResponse: that goes through sharp/librsvg wherever sharp resolves and
// draws no text without fonts (lib/insights/render/raster.ts). The default
// export returns a plain Response, which the metadata image convention
// accepts.

import { insightBySlug } from "@/lib/insights/build";
import { PNG_WIDTH, toPng } from "@/lib/insights/render/raster";
import { renderSvg } from "@/lib/insights/render/render";
import { cacheControl } from "@/lib/server/respond";

export const runtime = "nodejs";
export const alt = "An Embedding Atlas insight chart card; the full data table and every source are on the page.";
/** A literal, as the metadata image convention documents it; the og canvas (lib/insights/render/canvas.ts) is the same 1200 x 630, and the route test checks the decoded PNG against this. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const i = insightBySlug(slug);
  if (!i) return new Response("no published insight", { status: 404 });
  const png = await toPng(renderSvg(i.spec, "og", "dark"), PNG_WIDTH.og);
  return new Response(png, { headers: { "content-type": contentType, "cache-control": cacheControl(86400) } });
}
