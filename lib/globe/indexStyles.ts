// County and tract index choropleths (round 4): FEMA's National Risk Index
// in its five rating classes, and CDC PLACES in quintile bins. A feature with no class ("Not Applicable",
// "Insufficient Data", "No Rating", "Data Unavailable", not in the index)
// gets no fill and a dashed grey edge, so it never reads as low.

import type { LayerStyle } from "./renderer";
import type { LayerFeature } from "@/lib/layers/types";
import { polyFills, polyOutlines } from "./hazardStyles";
import { NRI_COLORS, NRI_NO_RATING_EDGE, type NriExtra } from "@/lib/hazards/nri";
import { PLACES_BIN_COLORS } from "@/lib/civic/places";
import type { HealthExtra } from "@/lib/layers/health";

export function riskColor(f: LayerFeature): string {
  const x = f.properties.extra as NriExtra | undefined;
  return x?.rating ? NRI_COLORS[x.rating] : NRI_NO_RATING_EDGE;
}

export const riskindexStyle: LayerStyle = {
  color: "#EA580C",
  icon: () => null,
  colorFor: riskColor,
  label: (f) => f.properties.name,
  labelMax: 12,
  polygons: (f) => ((f.properties.extra as NriExtra | undefined)?.rating ? polyFills(f, riskColor(f), 0.5) : null),
  lines: (f) => {
    const rated = !!(f.properties.extra as NriExtra | undefined)?.rating;
    return polyOutlines(f, rated ? "#1F2937" : NRI_NO_RATING_EDGE, rated ? 0.5 : 0.85, 1, !rated);
  },
};

// ---------------------------------------------------------------- community health (CDC PLACES)

export function healthColor(f: LayerFeature): string {
  const bin = (f.properties.extra as HealthExtra | undefined)?.bin;
  return bin == null ? NRI_NO_RATING_EDGE : PLACES_BIN_COLORS[bin];
}

export const healthStyle: LayerStyle = {
  color: "#2563EB",
  icon: () => null,
  colorFor: healthColor,
  label: (f) => f.properties.name,
  labelMax: 12,
  polygons: (f) => ((f.properties.extra as HealthExtra | undefined)?.bin != null ? polyFills(f, healthColor(f), 0.55) : null),
  lines: (f) => {
    const published = (f.properties.extra as HealthExtra | undefined)?.bin != null;
    return polyOutlines(f, published ? "#1F2937" : NRI_NO_RATING_EDGE, published ? 0.45 : 0.85, 1, !published);
  },
};
