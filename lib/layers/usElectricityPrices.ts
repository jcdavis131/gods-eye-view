// Layer: US state retail electricity prices. EIA SEDS annual retail prices
// by sector, drawn at state label points and coloured against the national
// residential average.
//
//   EIA State Energy Data System   bundled as lib/energy/data/us_electricity_prices.json
//                                 by lib/energy/build_bundles.py; refresh
//                                 with `npm run data:energy`
//
// Published values as EIA sent them; nothing estimated here. Annual cadence:
// the bundle goes stale between EIA releases, and the layer note says so.

import type { Point } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature } from "./types";
import { fmtCentsKwh, usElectricityBundle } from "@/lib/energy/energy";

export interface StateElectricityExtra {
  code: string;
  residential: number | null;
  vsNational: number | null;
}

async function fetchUsElectricityPrices(ctx: FetchContext): Promise<FetchResult> {
  const bundle = usElectricityBundle();
  const national = bundle.national_residential_avg;
  const features: LayerFeature<Point>[] = Object.entries(bundle.states).map(
    ([code, s]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: {
        id: `uselec-${code}`,
        layer: "uselectricity",
        name: s.name,
        kind: "state",
        altitude: 0,
        source: "U.S. Energy Information Administration",
        details: {
          "Residential": fmtCentsKwh(s.residential),
          "Commercial": fmtCentsKwh(s.commercial),
          "Industrial": fmtCentsKwh(s.industrial),
          "vs national": s.residential == null || national == null
            ? "n/a"
            : `${s.residential - national >= 0 ? "+" : ""}${(s.residential - national).toFixed(2)}¢`,
          "Year": String(bundle.asof_year),
          "National avg": fmtCentsKwh(national),
        },
        extra: {
          code,
          residential: s.residential,
          vsNational: s.residential == null || national == null ? null : s.residential - national,
        } satisfies StateElectricityExtra,
      },
    }),
  );
  return {
    collection: { type: "FeatureCollection", features },
    source: "U.S. Energy Information Administration",
    fetchedAt: ctx.now,
    note: [
      `${features.length} states · EIA SEDS annual retail electricity`,
      `year ${bundle.asof_year} · national residential ${fmtCentsKwh(national)}`,
      `refresh: npm run data:energy`,
    ].join(" · "),
    meta: {
      asofYear: bundle.asof_year,
      nationalResidentialAvg: national,
      count: features.length,
      provenance: bundle.meta.provenance,
    },
  };
}

export const usElectricityPricesLayer: LayerDefinition = {
  id: "uselectricity",
  label: "US electricity prices",
  description:
    "EIA annual retail electricity prices by state and sector, coloured against the national residential average. Published values as EIA sent them; the bundle refreshes with npm run data:energy.",
  color: "#38BDF8",
  updateIntervalMs: 24 * 3600_000,
  defaultEnabled: false,
  attribution: "U.S. Energy Information Administration, State Energy Data System",
  fetch: fetchUsElectricityPrices,
};
