// Layer: gas prices. EIA weekly retail regular-gasoline prices for the US
// and the nine states EIA's weekly survey covers, drawn at state label
// points and coloured against the national average.
//
//   EIA Weekly Retail Gasoline Price   bundled as lib/gas/data/gas_prices.json
//                                      by the gas-forecaster pipeline
//                                      (~/workspace/gas-forecaster); refresh
//                                      with `npm run data:gas`
//
// Published values as EIA sent them; nothing estimated here. Weekly cadence:
// the bundle goes stale between Monday prints, and the layer note says so.

import type { Point } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature } from "./types";
import { fmtGal, fmtGalChange, gasPrices, statePriceList } from "@/lib/gas/gas";

export interface GasPriceExtra {
  code: string;
  price: number;
  changeWow: number | null;
  vsNational: number | null;
}

async function fetchGasPrices(ctx: FetchContext): Promise<FetchResult> {
  const bundle = gasPrices();
  const states = statePriceList();
  const national = bundle.national.current;
  const features: LayerFeature<Point>[] = states.map((s) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    properties: {
      id: `gas-${s.code}`,
      layer: "gasprices",
      name: s.name,
      kind: "state",
      altitude: 0,
      observedAt: Date.parse(`${s.asof}T12:00:00Z`),
      source: "U.S. Energy Information Administration",
      details: {
        "Regular": fmtGal(s.current),
        "Week ago": fmtGal(s.prevWeek),
        "WoW change": fmtGalChange(s.changeWow),
        "vs national": fmtGalChange(s.current - national),
        "As of": s.asof,
        "National avg": fmtGal(national),
      },
      extra: {
        code: s.code,
        price: s.current,
        changeWow: s.changeWow,
        vsNational: s.current - national,
      } satisfies GasPriceExtra,
    },
  }));
  return {
    collection: { type: "FeatureCollection", features },
    source: "U.S. Energy Information Administration",
    fetchedAt: ctx.now,
    note: [
      `${features.length} states · EIA weekly retail regular`,
      `as of ${bundle.national.asof} · national ${fmtGal(national)}`,
      `refresh: npm run data:gas`,
    ].join(" · "),
    meta: {
      asof: bundle.national.asof,
      national: national,
      count: features.length,
      provenance: bundle.meta.provenance,
    },
  };
}

export const gasPricesLayer: LayerDefinition = {
  id: "gasprices",
  label: "Gas prices",
  description:
    "EIA weekly retail regular-gasoline price for the nine states its weekly survey covers, coloured against the national average. Published values as EIA sent them; the bundle refreshes weekly via npm run data:gas.",
  color: "#FBBF24",
  updateIntervalMs: 24 * 3600_000,
  defaultEnabled: false,
  attribution: "U.S. Energy Information Administration, Weekly Retail Gasoline Price",
  fetch: fetchGasPrices,
};
