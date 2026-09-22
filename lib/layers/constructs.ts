// Layer: constructs. The world of human and scientific frames stacked over
// the physical one at the camera target.
//
// The physical layers put things on the ground. This one lifts the constructs
// the ground sits inside (county, district, watershed, ecoregion, flood zone,
// forecast office, federal region, country) into strata above it: each
// construct floats at its own height, smallest nearest the ground, with its
// outline drawn at that height and a tether down to the point it was asked
// about. Select a stratum and the info panel joins it back to the physical
// world: every loaded aircraft, gauge, well, harbour, company or bank office
// that falls inside it, which is how one point of view reaches another.
//
// Coverage: the whole stack in the United States; the country anywhere else.
// Source: /api/fabric (TIGERweb, USGS WBD, EPA ecoregions, FEMA NFHL, NWS,
// USGS 3DEP, Natural Earth, published federal region lists).

import type { Point } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature, ViewState } from "./types";
import { proxy } from "./aircraft";
import { KINDS } from "@/lib/fabric/catalog";
import type { ConstructExtra, Fabric } from "@/lib/fabric/types";

/** Vertical spacing between strata for a camera height: visible from the city to the continent. */
export function strataStep(height: number): number {
  return Math.min(60_000, Math.max(250, height * 0.012));
}

/** Outer radius of the strata spiral, metres: wide enough that labels separate when seen from above. */
export function strataRadius(height: number): number {
  return Math.min(1_500_000, Math.max(500, height * 0.35));
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Where stratum `i` of `n` floats: a phyllotaxis spiral around the point,
 * rising one step per tier. From above it reads as a rosette of labelled
 * nodes; tilted, as a staircase with every node tethered to the ground.
 */
export function strataPosition(lon: number, lat: number, i: number, n: number, height: number): [number, number, number] {
  const r = strataRadius(height) * Math.sqrt((i + 1) / Math.max(1, n));
  const a = i * GOLDEN;
  const dLat = (r * Math.cos(a)) / 111_320;
  const dLon = (r * Math.sin(a)) / (111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  return [((lon + dLon + 540) % 360) - 180, Math.max(-89.9, Math.min(89.9, lat + dLat)), strataStep(height) * (i + 1)];
}

/** Changes when the target moves ~1 km or the height changes bucket. */
export function constructsViewKey(view: ViewState): string {
  const bucket = Math.round(Math.log2(Math.max(view.height, 1000) / 1000));
  return `${view.lon.toFixed(2)},${view.lat.toFixed(2)},${bucket}`;
}

export function fabricFeatures(fabric: Fabric, height: number): LayerFeature<Point>[] {
  const { lon, lat } = fabric.point;
  const features: LayerFeature<Point>[] = [];
  fabric.nodes.forEach((n, i) => {
    const pos = strataPosition(lon, lat, i, fabric.nodes.length, height);
    const details: Record<string, string | number | null> = {
      "point of view": n.domain,
      construct: KINDS[n.kind].label,
      code: n.code ?? null,
      [n.areaBasis === "total" ? "area (total)" : "area (land)"]: n.areaKm2 != null ? `${n.areaKm2.toLocaleString("en-US")} km²` : null,
      ...n.facts,
    };
    for (const l of n.links) if (/^https?:\/\//.test(l.url)) details[l.label.toLowerCase()] = l.url;
    const extra: ConstructExtra = { node: n, alt: pos[2], tier: i, ground: [lon, lat] };
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: pos },
      properties: {
        id: n.id,
        layer: "constructs",
        name: n.name,
        kind: n.kind,
        source: n.source,
        details,
        extra,
        anchor: n.anchor,
      },
    });
  });
  const here: ConstructExtra = { alt: 0, tier: -1, fabric, ground: [lon, lat] };
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat, 0] },
    properties: {
      id: "here",
      layer: "constructs",
      name: `Here · ${fabric.nodes.length} constructs`,
      kind: "here",
      source: "fabric",
      details: {
        elevation: fabric.point.elevationM != null ? `${fabric.point.elevationM} m (USGS 3DEP)` : null,
        constructs: fabric.nodes.length,
        relations: fabric.edges.length,
        coverage: fabric.coverage,
        missing: fabric.failed.length ? fabric.failed.map((f) => f.source).join(", ") : null,
      },
      extra: here,
    },
  });
  return features;
}

async function fetchConstructs(ctx: FetchContext): Promise<FetchResult> {
  const { lon, lat, height } = ctx.view;
  const env = await proxy<Fabric>(`/api/fabric?op=stack&lon=${lon.toFixed(3)}&lat=${lat.toFixed(3)}&geometry=1`, ctx);
  const fabric = env.data;
  const features = fabricFeatures(fabric, height);
  const missing = fabric.failed.map((f) => f.source);
  return {
    collection: { type: "FeatureCollection", features },
    source: fabric.answered.join(", ") || "fabric",
    fetchedAt: Date.now(),
    note: missing.length ? `${fabric.coverage} Missing: ${missing.join(", ")}.` : fabric.coverage,
    meta: { constructs: fabric.nodes.length },
  };
}

export const constructsLayer: LayerDefinition = {
  id: "constructs",
  label: "Constructs",
  description:
    "The human and scientific frames over the camera target, floated as strata above the ground: county, city, districts, school district, tract, metro, watershed (HUC-2 to HUC-12), ecoregion, flood zone, forecast office, time zone, federal regions, country. Select one to see every loaded feature inside it.",
  color: "#E5E7EB",
  updateIntervalMs: 6 * 3600_000,
  defaultEnabled: false,
  viewDependent: true,
  viewKey: constructsViewKey,
  attribution: "Census TIGERweb, USGS WBD + 3DEP, EPA ecoregions, FEMA NFHL, NOAA NWS, Natural Earth (public domain)",
  fetch: fetchConstructs,
};
