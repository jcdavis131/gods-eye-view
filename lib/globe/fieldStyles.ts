"use client";
// How the construct field is drawn. Every unit floats as an outline on a
// plate above the globe; a column of light rises from its internal point, as
// tall as the physical signals inside it are dense; a faint wash on the ground
// carries the same heat. All three read the live vitals (emergenceState), and
// the emergence bridge restyles only the units whose vitals changed.

import type { LayerFeature } from "@/lib/layers/types";
import type { LayerStyle, LonLatAlt, StyledLine, StyledPolygon } from "./renderer";
import { heatColor } from "@/lib/fabric/emergence";
import { vitalsFor } from "@/lib/fabric/emergenceState";
import type { FieldExtra } from "@/lib/layers/field";

function extraOf(f: LayerFeature): FieldExtra | undefined {
  return f.properties.extra as FieldExtra | undefined;
}

function heatOf(f: LayerFeature): number {
  return vitalsFor(f.properties.id)?.heat ?? 0;
}

function fmt(v: number): string {
  return v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

export const fieldStyle: LayerStyle = {
  color: "#22D3EE",
  pointSize: (f) => 4 + heatOf(f) * 7,
  colorFor: (f) => heatColor(heatOf(f)),
  label: (f) => {
    const v = vitalsFor(f.properties.id);
    return v && v.value > 0 ? `${f.properties.name} · ${fmt(v.value)}` : f.properties.name;
  },
  labelMax: 0,
  labelAlways: (f) => {
    const v = vitalsFor(f.properties.id);
    return !!v && v.value > 0 && v.rank < 6;
  },
  // The node sits on top of its column.
  position: (f) => {
    const x = extraOf(f);
    if (!x) return null;
    return [x.ground[0], x.ground[1], x.plate + x.column * heatOf(f)];
  },
  tickMs: 1000,
  lines: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    const h = heatOf(f);
    const color = heatColor(h);
    const out: StyledLine[] = x.node.rings.map((ring) => ({
      positions: ring.map((p) => [p[0], p[1], x.plate] as LonLatAlt),
      color,
      alpha: 0.18 + 0.6 * h,
      width: 1 + 1.5 * h,
    }));
    if (h > 0) out.push({ positions: [[x.ground[0], x.ground[1], x.plate], [x.ground[0], x.ground[1], x.plate + x.column * h]], color, alpha: 0.85, width: 3 + 5 * h, glow: true });
    return out;
  },
  polygons: (f) => {
    const x = extraOf(f);
    const h = heatOf(f);
    if (!x?.node?.rings || h <= 0) return null;
    return [{ rings: x.node.rings, color: heatColor(h), alpha: 0.05 + 0.25 * h } satisfies StyledPolygon];
  },
  selectedLines: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    const out: StyledLine[] = [];
    for (const ring of x.node.rings) {
      out.push({ positions: ring.map((p) => [p[0], p[1], x.plate] as LonLatAlt), color: "#FFFFFF", alpha: 0.95, width: 2.6 });
      out.push({ positions: ring.map((p) => [p[0], p[1], 30] as LonLatAlt), color: "#FFFFFF", alpha: 0.7, width: 1.4, dashed: true });
    }
    return out;
  },
  scaleByDistance: [2e4, 1.0, 2e7, 0.45],
};
