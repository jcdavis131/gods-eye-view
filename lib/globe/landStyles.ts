"use client";
// Styles for the three land layers: FEMA flood zones, NWI wetlands and PAD-US
// public & protected lands. All ground polygons with thin outlines, plus the
// dashed outline of the box the flood and wetland layers loaded.

import type { LayerStyle } from "./renderer";
import type { LayerFeature } from "@/lib/layers/types";
import type { Access, FloodZoneExtra, PublicLandExtra, WetlandExtra } from "@/lib/land/features";
import { polyFills, polyOutlines, UNRATED } from "./hazardStyles";

// ---------------------------------------------------------------- loaded box

/** The box a near-only land layer loaded: a dashed outline, never a fill, never a standing label. */
const LOADED_BOX = "#E5E7EB";

function isLoadedBox(f: LayerFeature): boolean {
  return f.properties.kind === "loaded-box";
}

// ---------------------------------------------------------------- flood zones

const FLOOD: Record<FloodZoneExtra["hazard"], [string, number]> = {
  coastal: ["#1D4ED8", 0.42],
  sfha: ["#2563EB", 0.34],
  moderate: ["#60A5FA", 0.2],
  minimal: ["#93C5FD", 0.05],
  // Zone D: FEMA did not analyse the hazard. Unrated, not safe.
  undetermined: [UNRATED, 0.22],
  water: ["#0EA5E9", 0.08],
  other: ["#94A3B8", 0.18],
};

function floodOf(f: LayerFeature): [string, number] {
  return FLOOD[(f.properties.extra as FloodZoneExtra | undefined)?.hazard ?? "other"] ?? FLOOD.other;
}

export const floodStyle: LayerStyle = {
  color: "#3B82F6",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : floodOf(f)[0]),
  label: (f) => f.properties.name,
  labelMax: 25,
  labelWhen: (f) => !isLoadedBox(f),
  polygons: (f) => {
    if (isLoadedBox(f)) return null;
    const [color, alpha] = floodOf(f);
    return polyFills(f, color, alpha);
  },
  lines: (f) => {
    if (isLoadedBox(f)) return polyOutlines(f, LOADED_BOX, 0.7, 1.5, true);
    const [color, alpha] = floodOf(f);
    return polyOutlines(f, color, Math.min(0.7, alpha + 0.25), 1);
  },
};

// ---------------------------------------------------------------- wetlands

/** The NWI Wetlands Mapper legend colours, by plain-language wetland type. */
const WETLAND_COLOR: Record<string, string> = {
  "Freshwater Emergent Wetland": "#7FC31C",
  "Freshwater Forested/Shrub Wetland": "#008837",
  "Freshwater Pond": "#688CC0",
  Lake: "#13007C",
  Riverine: "#0190BF",
  "Estuarine and Marine Deepwater": "#007C88",
  "Estuarine and Marine Wetland": "#66C2A5",
  Other: "#B28653",
};

function wetlandColor(f: LayerFeature): string {
  return WETLAND_COLOR[(f.properties.extra as WetlandExtra | undefined)?.type ?? ""] ?? "#B28653";
}

export const wetlandsStyle: LayerStyle = {
  color: "#34D399",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : wetlandColor(f)),
  label: (f) => f.properties.name,
  labelMax: 20,
  labelWhen: (f) => !isLoadedBox(f),
  polygons: (f) => (isLoadedBox(f) ? null : polyFills(f, wetlandColor(f), 0.38)),
  lines: (f) => (isLoadedBox(f) ? polyOutlines(f, LOADED_BOX, 0.7, 1.5, true) : polyOutlines(f, wetlandColor(f), 0.7, 1)),
};

// ---------------------------------------------------------------- public & protected lands

const ACCESS_COLOR: Record<Access, string> = {
  open: "#4ADE80",
  restricted: "#F5B849",
  closed: "#FF6B6B",
  unknown: UNRATED,
};
const DESIGNATION = "#A3E635";
const PROCLAMATION = "#E5E7EB";
/** Easements: the owner keeps the land, so an outline in a colour no access class uses. */
const EASEMENT = "#38BDF8";

function publicColor(f: LayerFeature): string {
  const x = f.properties.extra as PublicLandExtra;
  if (x.category === "Fee") return ACCESS_COLOR[x.access];
  if (x.category === "Designation") return DESIGNATION;
  if (x.category === "Easement") return EASEMENT;
  return PROCLAMATION;
}

export const publiclandsStyle: LayerStyle = {
  color: "#4ADE80",
  icon: () => null,
  colorFor: publicColor,
  label: (f) => f.properties.name,
  labelMax: 30,
  labelAlways: (f) => {
    const x = f.properties.extra as PublicLandExtra;
    return x.category === "Fee" && (x.acres ?? 0) >= 20_000;
  },
  polygons: (f) => {
    const x = f.properties.extra as PublicLandExtra;
    if (x.category === "Fee") return polyFills(f, publicColor(f), 0.2);
    if (x.category === "Designation") return polyFills(f, DESIGNATION, 0.05);
    // Easements stay with their owner and proclamation boundaries contain private land: outline only.
    return null;
  },
  lines: (f) => {
    const x = f.properties.extra as PublicLandExtra;
    if (x.category === "Fee") return polyOutlines(f, publicColor(f), 0.75, 1.5);
    if (x.category === "Designation") return polyOutlines(f, DESIGNATION, 0.8, 1.2);
    if (x.category === "Easement") return polyOutlines(f, EASEMENT, 0.8, 1.3);
    return polyOutlines(f, PROCLAMATION, 0.55, 1.2, true);
  },
};
