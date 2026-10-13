// Layer: contaminated and regulated sites. EPA program listings as points
// below CONTAMINANTS_MAX_M, inside the same ~11 km dashed box as the
// Environmental permits layer, anywhere in the United States:
//
//   Superfund (SEMS)   every site in EPA's Superfund system, NPL and not,
//                      active and archived
//   TRI                Toxics Release Inventory reporters
//   RCRA               hazardous-waste handlers (RCRAInfo)
//   Brownfields        ACRES properties
//
// from EPA's Envirofacts EMEF map service through /api/permits. A listing is
// a regulatory status, not a finding of contamination at the point; no
// release amounts are shown. A feature is named by its program id; EPA's
// facility name is in the dossier only and never searched.

import type { FeatureCollection } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature } from "./types";
import { proxy } from "./aircraft";
import { civicLoadedBox } from "./civicBox";
import { envBox, inUs } from "./envpermits";
import { FeatureMemo } from "./featureMemo";
import { coverageNote, type CoverageLike } from "@/lib/permits/notes";
import type { Bbox } from "@/lib/zoning/features";

export const CONTAMINANTS_MAX_M = 25_000;
const KEY_GRID = 0.05;

const memo = new FeatureMemo();

async function fetchContaminants(ctx: FetchContext): Promise<FetchResult> {
  const empty = (note: string): FetchResult => ({
    collection: { type: "FeatureCollection", features: [] },
    source: "EPA Envirofacts (EMEF)",
    fetchedAt: ctx.now,
    note,
    meta: { count: 0 },
  });
  if (ctx.view.height > CONTAMINANTS_MAX_M) return empty(`descend below ${CONTAMINANTS_MAX_M / 1000} km for EPA's Superfund, TRI, RCRA and Brownfields listings (United States)`);
  const want = envBox(ctx.view);
  if (!inUs(want)) return empty("EPA's program listings cover the United States only");
  const env = await proxy<FeatureCollection>(`/api/permits?op=contaminants&bbox=${want.join(",")}`, ctx);
  const meta = env as unknown as { bbox?: Bbox; coverage?: CoverageLike[] };
  const loaded: Bbox = Array.isArray(meta.bbox) && meta.bbox.length === 4 ? meta.bbox : want;
  const features = memo.stable(env.data.features as unknown as LayerFeature[]);
  return {
    collection: { type: "FeatureCollection", features: [...features, civicLoadedBox("contaminants", loaded, "EPA program listings")] },
    source: "EPA Envirofacts (EMEF)",
    fetchedAt: ctx.now,
    note: coverageNote(`${features.length.toLocaleString("en-US")} listings in the dashed box (outside it: not loaded) · a listing is a regulatory status, not a finding of contamination`, meta.coverage ?? []),
    meta: { count: features.length },
  };
}

export const contaminantsLayer: LayerDefinition = {
  id: "contaminants",
  label: "Contaminated sites (EPA)",
  description:
    "EPA program listings below 25 km inside a dashed box: Superfund sites (SEMS, NPL and non-NPL, active and archived), Toxics Release Inventory reporters, RCRA hazardous-waste handlers and Brownfields properties, coloured by program, each with its EPA record. A listing is a regulatory status, not a finding of contamination; a TRI reporter's record shows, on request, what it reported releasing that year. United States.",
  color: "#F87171",
  updateIntervalMs: 6 * 60 * 60_000,
  defaultEnabled: false,
  viewDependent: true,
  viewKey: (v) => (v.height > CONTAMINANTS_MAX_M ? "above" : `${Math.round(v.lon / KEY_GRID)},${Math.round(v.lat / KEY_GRID)}`),
  attribution: "U.S. EPA Envirofacts (EMEF): SEMS, TRI, RCRAInfo, ACRES",
  fetch: fetchContaminants,
};
