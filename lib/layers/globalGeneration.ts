// Layer: global electricity generation by fuel. Ember yearly data for the
// top generating countries, drawn at country label points with the fuel mix
// in the details panel.
//
//   Ember Electricity Data Explorer   bundled as lib/energy/data/global_generation.json
//                                     by lib/energy/build_bundles.py; refresh
//                                     with `npm run data:energy`
//
// Published values as Ember sent them (aggregated sources excluded to avoid
// double counting); nothing estimated here. Country label points are
// approximate; only countries with a label point are drawn.

import type { Point } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature } from "./types";
import { globalGenerationBundle } from "@/lib/energy/energy";

async function fetchGlobalGeneration(ctx: FetchContext): Promise<FetchResult> {
  const bundle = globalGenerationBundle();
  const features: LayerFeature<Point>[] = bundle.countries.map((c) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [c.lon, c.lat] },
    properties: {
      id: `gen-${c.country.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      layer: "globalgeneration",
      name: c.country,
      kind: "country",
      altitude: 0,
      source: "Ember",
      details: {
        "Total": `${c.total_twh.toLocaleString()} TWh`,
        "Year": String(c.year),
        ...Object.fromEntries(
          c.fuels.map((f) => [`${f.fuel}`, `${f.twh.toLocaleString()} TWh (${f.share_pct}%)`]),
        ),
      },
    },
  }));
  return {
    collection: { type: "FeatureCollection", features },
    source: "Ember",
    fetchedAt: ctx.now,
    note: [
      `${features.length} countries · Ember yearly generation by fuel`,
      `year ${bundle.asof_year} · label points approximate`,
      `refresh: npm run data:energy`,
    ].join(" · "),
    meta: {
      asofYear: bundle.asof_year,
      count: features.length,
      provenance: bundle.meta.provenance,
    },
  };
}

export const globalGenerationLayer: LayerDefinition = {
  id: "globalgeneration",
  label: "Global generation mix",
  description:
    "Yearly electricity generation by fuel for the top generating countries, from Ember's open data. Published values as Ember sent them; country points are approximate label points.",
  color: "#A3E635",
  updateIntervalMs: 24 * 3600_000,
  defaultEnabled: false,
  attribution: "Ember, Electricity Data Explorer",
  fetch: fetchGlobalGeneration,
};
