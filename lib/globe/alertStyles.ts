"use client";
// How live warnings are drawn: the outline in its hazard colour, breathing
// while the warning is in force, a faint wash that thins as the expiry nears,
// and a node at the centre carrying the event name. Selected, the outline
// turns white and the wash deepens.

import type { LayerFeature } from "@/lib/layers/types";
import type { AlertExtra } from "@/lib/layers/alerts";
import type { LayerStyle, LonLatAlt, StyledLine, StyledPolygon } from "./renderer";

function extraOf(f: LayerFeature): AlertExtra | undefined {
  return f.properties.extra as AlertExtra | undefined;
}

/** 1 while plenty of time is left, down to 0.25 in the last hour. */
export function lifeLeft(until: number | null, now: number): number {
  if (until == null) return 1;
  const h = (until - now) / 3600_000;
  if (h <= 0) return 0.25;
  return Math.max(0.25, Math.min(1, h));
}

const OUTLINE_ALT = 120;

export const alertsStyle: LayerStyle = {
  color: "#FB7185",
  colorFor: (f) => extraOf(f)?.color ?? "#FB7185",
  pointSize: () => 8,
  label: (f) => f.properties.name,
  labelMax: 12,
  tickMs: 100,
  lines: (f, t) => {
    const x = extraOf(f);
    const rings = x?.node?.rings;
    if (!x || !rings) return null;
    const life = lifeLeft(x.until, Date.now());
    // Breathing: a slow pulse on the outline, two seconds a breath.
    const breath = 0.55 + 0.35 * Math.sin((t / 2000) * Math.PI * 2);
    return rings.map(
      (ring): StyledLine => ({
        positions: ring.map((p) => [p[0], p[1], OUTLINE_ALT] as LonLatAlt),
        color: x.color,
        alpha: breath * life,
        width: 2.2,
        glow: x.outline === "polygon",
      }),
    );
  },
  polygons: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    return [{ rings: x.node.rings, color: x.color, alpha: 0.1 * lifeLeft(x.until, Date.now()) + 0.04 } satisfies StyledPolygon];
  },
  selectedLines: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    return x.node.rings.map((ring) => ({ positions: ring.map((p) => [p[0], p[1], OUTLINE_ALT + 40] as LonLatAlt), color: "#FFFFFF", alpha: 0.95, width: 3 }));
  },
  scaleByDistance: [5e4, 1.0, 1.5e7, 0.5],
};
