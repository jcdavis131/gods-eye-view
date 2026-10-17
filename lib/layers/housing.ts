// Layer: housing assistance (HUD). Below HOUSING_MAX_M, the 2020 census tracts
// in a box of at most 0.3 degrees around the view: HUD's Housing Choice
// Voucher households per tract, coloured by HUD's share of renter units or by
// the count (the picker under the layer's row, pref housingMeasure, permalink
// hv=) on fixed breaks, and HUD's Qualified Census Tracts (titled 2026) as
// amber outlines on top.
//
// HUD omits the count in tracts with 10 or fewer voucher holders: those are
// drawn grey with a dashed edge, "10 or fewer vouchers, or none (HUD
// suppresses)", never a colour from the scale. Every Connecticut tract is null
// in HUD's layer, so Connecticut is drawn unfilled and dashed, "not published".
// The loaded box is drawn dashed: outside it is not loaded, not "no data".

import type { FetchContext, FetchResult, LayerDefinition, LayerFeature, ViewState } from "./types";
import { proxy } from "./aircraft";
import { viewBbox } from "./water";
import { civicLoadedBox } from "./civicBox";
import {
  HOUSING_ATTRIBUTION,
  HOUSING_BOX_DEG,
  HOUSING_GRID,
  HOUSING_MAX_M,
  HOUSING_MEASURES,
  HOUSING_SOURCE_LABEL,
  SUPPRESSED_LEGEND,
  buildHousing,
  parseHousingMeasure,
} from "@/lib/civic/housing";

export function housingViewKey(v: ViewState): string {
  return v.height > HOUSING_MAX_M ? "above" : `${Math.round(v.lon / HOUSING_GRID)},${Math.round(v.lat / HOUSING_GRID)}`;
}

/** The box request for a view (the route clamps it to HOUSING_BOX_DEG around its centre). */
export function housingRequest(ctx: FetchContext): string {
  const b = viewBbox(ctx, 15_000).map((x) => x.toFixed(3)).join(",");
  return `/api/civic?op=housing&bbox=${b}`;
}

type Fc = { type: "FeatureCollection"; features: Array<{ geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }> };

async function fetchHousing(ctx: FetchContext): Promise<FetchResult> {
  const m = parseHousingMeasure(ctx.options.housingMeasure);
  const base = { source: HOUSING_SOURCE_LABEL, fetchedAt: ctx.now };
  if (ctx.view.height > HOUSING_MAX_M) {
    return { ...base, collection: { type: "FeatureCollection", features: [] }, note: `descend below ${HOUSING_MAX_M / 1000} km for HUD housing vouchers and Qualified Census Tracts by tract`, meta: { count: 0, measure: m } };
  }
  const env = await proxy<{ hcv: Fc; qct: Fc }>(housingRequest(ctx), ctx);
  const built = buildHousing(env.data.hcv?.features ?? [], env.data.qct?.features ?? [], m);
  const { capped, bbox } = env as unknown as { capped?: boolean; bbox?: [number, number, number, number] };
  const box = Array.isArray(bbox) && bbox.length === 4 ? [civicLoadedBox("housing", bbox, "HUD tracts")] : [];
  return {
    ...base,
    collection: { type: "FeatureCollection", features: [...(built.features as LayerFeature[]), ...box] },
    note:
      `${built.published} tracts with a voucher count · ${HOUSING_MEASURES[m].name.toLowerCase()} (fixed breaks)` +
      ` · ${built.suppressed} grey: ${SUPPRESSED_LEGEND}` +
      (built.ctNotPublished ? ` · ${built.ctNotPublished} Connecticut tracts dashed: not published for Connecticut` : "") +
      ` · ${built.qct} Qualified Census Tracts (amber outline, titled 2026 by HUD)` +
      ` · tracts within ${HOUSING_BOX_DEG / 2} degrees of the view's centre; outside that box is not loaded, not "no data"` +
      (capped ? " · cut at 2,000 tracts: zoom in for every tract" : ""),
    meta: { count: built.features.length, measure: m, suppressed: built.suppressed, qct: built.qct },
  };
}

export const housingLayer: LayerDefinition = {
  id: "housing",
  label: "Housing assistance (HUD)",
  description:
    "HUD's Housing Choice Voucher households per 2020 census tract (through December 2025), coloured by HUD's share of renter-occupied units or by the count on fixed breaks, with HUD's Qualified Census Tracts (titled 2026) outlined in amber, below 100 km. HUD omits tracts with 10 or fewer voucher holders: they are grey, '10 or fewer, or none', never a low colour. Connecticut is not published in the voucher layer. A Qualified Census Tract is a tax-credit designation, not a measure of conditions.",
  color: "#0F766E",
  updateIntervalMs: 24 * 60 * 60_000,
  defaultEnabled: false,
  viewDependent: true,
  viewKey: housingViewKey,
  attribution: HOUSING_ATTRIBUTION,
  fetch: fetchHousing,
};
