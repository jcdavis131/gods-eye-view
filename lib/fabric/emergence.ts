// Emergence: the constructs world takes its state from the physical one.
//
// A construct has no sensors of its own. What it "knows" is what the physical
// layers put inside it: the gauges in a watershed, the aircraft over a
// district right now, the companies and bank offices in a county, the
// earthquakes in an ecoregion today. This module turns the loaded physical
// features into vitals per construct: counts by layer, density per 1,000 km²,
// and a heat in 0..1 relative to the other constructs in view. The field
// layer is drawn from those vitals, so it changes as the physical twin does.
//
// Rules kept: simulated features (the traffic layer) are never counted; only
// features with a point position are placed (polygon layers are constructs of
// their own, not things inside one); counts are of what is loaded in the
// browser now, and every place that shows them says so.

import type { LayerFeature, LayerId } from "@/lib/layers/types";
import { bboxContains, ringsBbox, ringsContain, type BBox } from "./geo";
import type { ConstructNode } from "./types";

/** What a construct's heat is measured by: every physical signal, or one layer. */
export type Measure = "all" | LayerId;
export type Normalise = "count" | "density";

export interface Vitals {
  total: number;
  byLayer: Partial<Record<LayerId, number>>;
  /** Features per 1,000 km² of the construct's area; null when no area is known. */
  density: number | null;
  /** The value the heat is taken from (count or density of the chosen measure). */
  value: number;
  /** value relative to the largest in view, 0..1, square-root scaled so small counts still show. */
  heat: number;
  /** 0 = the largest value in view. */
  rank: number;
}

/**
 * Layers whose points are not things on the ground: the constructs themselves,
 * metro-level statistics drawn at a centroid, and a sampling grid. Area layers
 * (counties, countries) drop out on their own because only points count.
 */
const NOT_PHYSICAL = new Set<LayerId>(["constructs", "field", "occupations", "weather"]);

export function isPhysical(f: LayerFeature): boolean {
  return !NOT_PHYSICAL.has(f.properties.layer) && !f.properties.simulated && f.geometry?.type === "Point";
}

interface Indexed {
  node: ConstructNode;
  box: BBox;
}

/** Place each physical feature into every construct whose outline contains it. */
export function computeVitals(nodes: ConstructNode[], features: Iterable<LayerFeature>, measure: Measure = "all", normalise: Normalise = "count"): Map<string, Vitals> {
  const idx: Indexed[] = [];
  for (const node of nodes) {
    if (!node.rings) continue;
    const box = ringsBbox(node.rings);
    if (box) idx.push({ node, box });
  }
  const byNode = new Map<string, Partial<Record<LayerId, number>>>();
  for (const f of features) {
    if (!isPhysical(f)) continue;
    const c = (f.geometry as { coordinates: number[] }).coordinates;
    const lon = c[0];
    const lat = c[1];
    for (const { node, box } of idx) {
      if (!bboxContains(box, lon, lat) || !ringsContain(node.rings!, lon, lat)) continue;
      const m = byNode.get(node.id) ?? {};
      m[f.properties.layer] = (m[f.properties.layer] ?? 0) + 1;
      byNode.set(node.id, m);
    }
  }
  const out = new Map<string, Vitals>();
  for (const { node } of idx) {
    const byLayer = byNode.get(node.id) ?? {};
    const total = Object.values(byLayer).reduce((a, b) => a + (b ?? 0), 0);
    const count = measure === "all" ? total : (byLayer[measure] ?? 0);
    const area = node.areaKm2 && node.areaKm2 > 0 ? node.areaKm2 : null;
    const density = area ? (total / area) * 1000 : null;
    const value = normalise === "density" ? (area ? (count / area) * 1000 : 0) : count;
    out.set(node.id, { total, byLayer, density, value, heat: 0, rank: 0 });
  }
  const values = [...out.values()].map((v) => v.value);
  const max = Math.max(0, ...values);
  const sorted = [...out.entries()].sort((a, b) => b[1].value - a[1].value);
  sorted.forEach(([, v], i) => {
    v.rank = i;
    v.heat = max > 0 ? Math.sqrt(v.value / max) : 0;
  });
  return out;
}

/** A cheap fingerprint so the field is only redrawn when something it shows changed. */
export function vitalsKey(v: Map<string, Vitals>): string {
  const parts: string[] = [];
  for (const [id, x] of v) if (x.value > 0) parts.push(`${id}=${x.value.toFixed(2)}`);
  return parts.sort().join("|");
}

/** Heat ramp for the field: dim slate, through cyan and gold, to hot orange. */
export function heatColor(heat: number): string {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [71, 85, 105]],
    [0.25, [34, 211, 238]],
    [0.6, [250, 204, 21]],
    [1, [249, 115, 22]],
  ];
  const h = Math.max(0, Math.min(1, heat));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (h <= t1) {
      const k = (h - t0) / (t1 - t0);
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k));
      return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return "#f97316";
}
