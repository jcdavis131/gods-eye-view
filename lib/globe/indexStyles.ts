// County and tract index choropleths (rounds 4 to 6): FEMA's National Risk Index
// in its five rating classes, CDC PLACES in quintile bins, and CDC/ATSDR SVI on
// fixed percentile breaks. A feature with no class ("Not Applicable",
// "Insufficient Data", "No Rating", "Data Unavailable", not in the index)
// gets no fill and a dashed grey edge, so it never reads as low.

import type { LayerStyle } from "./renderer";
import type { LayerFeature } from "@/lib/layers/types";
import { polyFills, polyOutlines } from "./hazardStyles";
import { NRI_COLORS, NRI_NO_RATING_EDGE, type NriExtra } from "@/lib/hazards/nri";
import { PLACES_BIN_COLORS } from "@/lib/civic/places";
import type { HealthExtra } from "@/lib/layers/health";
import { SVI_BIN_COLORS, SVI_NO_RANK_EDGE, type SviExtra } from "@/lib/civic/svi";
import { BROADBAND_BIN_COLORS, BROADBAND_NO_DATA_EDGE, type BroadbandExtra } from "@/lib/civic/broadband";
import { WRC_BIN_COLORS, WRC_NO_RANK_EDGE, type WrcExtra } from "@/lib/hazards/wrc";

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

// ---------------------------------------------------------------- social vulnerability (CDC/ATSDR SVI)

export function vulnerabilityColor(f: LayerFeature): string {
  const bin = (f.properties.extra as SviExtra | undefined)?.bin;
  return bin == null ? SVI_NO_RANK_EDGE : SVI_BIN_COLORS[bin];
}

export const vulnerabilityStyle: LayerStyle = {
  color: "#C2410C",
  icon: () => null,
  colorFor: vulnerabilityColor,
  label: (f) => f.properties.name,
  labelMax: 12,
  polygons: (f) => ((f.properties.extra as SviExtra | undefined)?.bin != null ? polyFills(f, vulnerabilityColor(f), 0.55) : null),
  lines: (f) => {
    const ranked = (f.properties.extra as SviExtra | undefined)?.bin != null;
    return polyOutlines(f, ranked ? "#1F2937" : SVI_NO_RANK_EDGE, ranked ? 0.45 : 0.85, 1, !ranked);
  },
};

// ---------------------------------------------------------------- broadband (FCC BDC via Esri)

export function broadbandColor(f: LayerFeature): string {
  const bin = (f.properties.extra as BroadbandExtra | undefined)?.bin;
  return bin == null ? BROADBAND_NO_DATA_EDGE : BROADBAND_BIN_COLORS[bin];
}

export const broadbandStyle: LayerStyle = {
  color: "#2563EB",
  icon: () => null,
  colorFor: broadbandColor,
  label: (f) => f.properties.name,
  labelMax: 12,
  polygons: (f) => ((f.properties.extra as BroadbandExtra | undefined)?.bin != null ? polyFills(f, broadbandColor(f), 0.55) : null),
  lines: (f) => {
    const x = f.properties.extra as BroadbandExtra | undefined;
    const drawn = x?.bin != null;
    return polyOutlines(f, drawn ? "#1F2937" : BROADBAND_NO_DATA_EDGE, drawn ? (x?.level === "hex" ? 0.25 : 0.45) : 0.85, 1, !drawn);
  },
};

// ---------------------------------------------------------------- wildfire risk ranks (USFS WRC)

export function wildfireriskColor(f: LayerFeature): string {
  const bin = (f.properties.extra as WrcExtra | undefined)?.bin;
  return bin == null ? WRC_NO_RANK_EDGE : WRC_BIN_COLORS[bin];
}

export const wildfireriskStyle: LayerStyle = {
  color: "#D95F0E",
  icon: () => null,
  colorFor: wildfireriskColor,
  label: (f) => f.properties.name,
  labelMax: 12,
  polygons: (f) => ((f.properties.extra as WrcExtra | undefined)?.bin != null ? polyFills(f, wildfireriskColor(f), 0.55) : null),
  lines: (f) => {
    const ranked = (f.properties.extra as WrcExtra | undefined)?.bin != null;
    return polyOutlines(f, ranked ? "#1F2937" : WRC_NO_RANK_EDGE, ranked ? 0.45 : 0.85, 1, !ranked);
  },
};
