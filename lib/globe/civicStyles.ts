"use client";
// Styles for the civic layers: zoning districts, building permits, business
// licences and environmental permits. Zoning is ground polygons in the
// colours zoning maps conventionally use (residential yellow, commercial red,
// industrial purple); the three permit layers are points. Every near-only
// layer draws the box it loaded as a dashed outline.

import type { LayerStyle } from "./renderer";
import type { LayerFeature } from "@/lib/layers/types";
import type { ZoningFamily } from "@/lib/zoning/features";
import { isLoadedBox } from "@/lib/layers/civicBox";
import { polyFills, polyOutlines, UNRATED } from "./hazardStyles";

const LOADED_BOX = "#E5E7EB";

// ---------------------------------------------------------------- zoning

export const ZONING_FAMILY_COLOR: Record<Exclude<ZoningFamily, "coded">, string> = {
  residential: "#FACC15",
  mixed: "#FB923C",
  commercial: "#F87171",
  downtown: "#E879F9",
  industrial: "#A78BFA",
  planned: "#2DD4BF",
  public: "#4ADE80",
  "right-of-way": "#9CA3AF",
  other: "#94A3B8",
};

/** For cities that publish no category: a colour per district code, so neighbours differ; it means nothing else. */
const CODED = ["#60A5FA", "#F472B6", "#34D399", "#FBBF24", "#C084FC", "#22D3EE", "#FB7185", "#A3E635"];

export function codedColor(code: string): string {
  // The base district (before any suffix) keeps one colour: "PD-571" and "PD-1090" differ, "CBD-CURE" and "CBD" match.
  const base = code.split(/[-\s(]/)[0] ?? code;
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return CODED[h % CODED.length];
}

export function zoningColor(f: LayerFeature): string {
  const x = f.properties.extra as { family?: ZoningFamily; code?: string } | undefined;
  const fam = x?.family ?? "other";
  if (fam === "coded") return codedColor(x?.code ?? f.properties.name);
  return ZONING_FAMILY_COLOR[fam];
}

export const zoningStyle: LayerStyle = {
  color: "#F0ABFC",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : zoningColor(f)),
  label: (f) => f.properties.name,
  labelMax: 40,
  labelWhen: (f) => !isLoadedBox(f),
  polygons: (f) => (isLoadedBox(f) ? null : polyFills(f, zoningColor(f), f.properties.kind === "right-of-way" ? 0.06 : 0.2)),
  lines: (f) => (isLoadedBox(f) ? polyOutlines(f, LOADED_BOX, 0.7, 1.5, true) : polyOutlines(f, zoningColor(f), 0.65, 1)),
};

// ---------------------------------------------------------------- permits, licences, environmental

/** Building permits by the city's own permit words (lib/permits/dossier.ts permitFamily). */
export const PERMIT_FAMILY_COLOR: Record<string, string> = {
  new: "#4ADE80",
  demolition: "#F87171",
  alteration: "#FDBA74",
  trades: "#60A5FA",
  other: "#CBD5E1",
};

function boxLines(f: LayerFeature) {
  return isLoadedBox(f) ? polyOutlines(f, LOADED_BOX, 0.7, 1.5, true) : null;
}

export const permitsStyle: LayerStyle = {
  color: "#FDBA74",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : PERMIT_FAMILY_COLOR[f.properties.kind ?? "other"] ?? PERMIT_FAMILY_COLOR.other),
  // Bigger dots for bigger jobs, where the city published a valuation; none published is the base size, not zero.
  pointSize: (f) => {
    const v = (f.properties.extra as { valuation?: number } | undefined)?.valuation;
    if (v == null) return 6;
    return v >= 5_000_000 ? 11 : v >= 500_000 ? 9 : v >= 50_000 ? 7 : 6;
  },
  label: (f) => f.properties.name,
  labelMax: 25,
  labelWhen: (f) => !isLoadedBox(f),
  lines: boxLines,
  scaleByDistance: [1.5e3, 1.0, 8e3, 0.6],
};

export const LICENCE_SOURCE_COLOR: Record<string, string> = {
  nysla: "#C084FC",
  chicago: "#67E8F9",
  sanfrancisco: "#67E8F9",
  losangeles: "#67E8F9",
  nycdcwp: "#67E8F9",
};

export const licencesStyle: LayerStyle = {
  color: "#67E8F9",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : LICENCE_SOURCE_COLOR[f.properties.kind ?? ""] ?? "#67E8F9"),
  pointSize: () => 5,
  label: (f) => f.properties.name,
  labelMax: 30,
  labelWhen: (f) => !isLoadedBox(f),
  lines: boxLines,
  scaleByDistance: [1e3, 1.0, 3e3, 0.6],
};

/** ECHO's compliance words: a violation in its words is amber; none reported is "not rated" violet, never calm. */
export function envColor(f: LayerFeature): string {
  const x = f.properties.extra as { program?: string; compliance?: string } | undefined;
  if (x?.program === "usace") return "#38BDF8";
  const c = (x?.compliance ?? "").toLowerCase();
  if (!c || c.startsWith("not reported")) return UNRATED;
  if (/\bno violation/.test(c)) return x?.program === "air" ? "#A7F3D0" : "#86EFAC";
  if (/violation|noncompliance|non-compliance/.test(c)) return "#FBBF24";
  return UNRATED;
}

export const envpermitsStyle: LayerStyle = {
  color: "#86EFAC",
  icon: () => null,
  colorFor: (f) => (isLoadedBox(f) ? LOADED_BOX : envColor(f)),
  pointSize: (f) => ((f.properties.extra as { program?: string } | undefined)?.program === "usace" ? 7 : 6),
  label: (f) => f.properties.name,
  labelMax: 20,
  labelWhen: (f) => !isLoadedBox(f),
  lines: boxLines,
  scaleByDistance: [5e3, 1.0, 4e4, 0.6],
};
