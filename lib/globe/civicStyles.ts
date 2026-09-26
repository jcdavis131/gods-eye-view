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
import { polyFills, polyOutlines } from "./hazardStyles";

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
