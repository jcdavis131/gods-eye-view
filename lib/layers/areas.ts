// Shared fetch for the two county layers (commerce, realestate). One server
// response carries jobs, home values and rents for every county in view;
// each layer dresses its own copy. Above COUNTY_MAX_HEIGHT_M the same
// joins are shown per state.

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { monthLabel, tagArea } from "@/lib/economy/features";
import type { BaseProps, FetchContext, FetchResult, LayerFeature } from "./types";
import { proxy } from "./aircraft";
import { viewBbox } from "./water";

export const COUNTY_MAX_HEIGHT_M = 2_500_000;

type AreaFc = FeatureCollection<Polygon | MultiPolygon, BaseProps>;
interface AreaEnvelope {
  data: AreaFc;
  asOf?: Record<string, string>;
  source?: string;
  level?: string;
  polygons?: number;
}

let states: Promise<AreaEnvelope> | null = null;
let statesAt = 0;

function loadStates(ctx: FetchContext): Promise<AreaEnvelope> {
  if (!states || ctx.now - statesAt > 6 * 3600_000) {
    statesAt = ctx.now;
    states = proxy<AreaFc>("/api/economy?op=areas&level=state", { ...ctx, signal: undefined }).catch((err) => {
      states = null;
      throw err;
    });
  }
  return states;
}

export async function fetchAreas(ctx: FetchContext, layer: "commerce" | "realestate"): Promise<FetchResult> {
  const level = ctx.view.height > COUNTY_MAX_HEIGHT_M ? "state" : "county";
  const env: AreaEnvelope =
    level === "state"
      ? await loadStates(ctx)
      : await proxy<AreaFc>(`/api/economy?op=areas&bbox=${viewBbox(ctx, ctx.view.bbox ? 300_000 : Math.min(ctx.view.height, 2_000_000)).map((x) => x.toFixed(2)).join(",")}`, ctx);
  const features: LayerFeature[] = [];
  for (const f of env.data.features) {
    const t = tagArea(f as LayerFeature<Polygon | MultiPolygon>, layer);
    if (t) features.push(t);
  }
  const asOf = env.asOf ?? {};
  const stamp = layer === "commerce" ? (asOf.qcew ? `QCEW ${asOf.qcew}` : "") : asOf.zhvi ? `ZHVI ${monthLabel(asOf.zhvi)}` : "";
  const note =
    level === "state"
      ? `${features.length} states${stamp ? " · " + stamp : ""} · descend below ${Math.round(COUNTY_MAX_HEIGHT_M / 1000).toLocaleString()} km for counties`
      : `${features.length} counties${stamp ? " · " + stamp : ""}`;
  return {
    collection: { type: "FeatureCollection", features },
    source: env.source ?? "BLS QCEW + Zillow + Census TIGERweb",
    fetchedAt: ctx.now,
    note,
    meta: { count: features.length, level },
  };
}
