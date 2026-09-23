"use client";
// How the constructs layer is drawn: every stratum a node coloured by its
// point of view, a tether from the node down to the point the stack was asked
// about, and the construct's outline floating at the stratum's height. The
// selected stratum brightens and drops its outline to the ground as a dashed
// footprint, so the construct and the physical ground it covers read together.

import type { LayerFeature } from "@/lib/layers/types";
import type { LayerStyle, LonLatAlt, StyledLine } from "./renderer";
import { DOMAINS, KINDS } from "@/lib/fabric/catalog";
import type { ConstructExtra } from "@/lib/fabric/types";

/** The HUD's warm signal accent (app/globals.css --signal): selection is always drawn in it. */
export const SIGNAL = "#FFA458";

/** Kinds that keep a label however many strata there are: the ones people navigate by. */
const ALWAYS_LABEL = new Set(["county", "place", "cd", "huc8", "eco3", "flood"]);

function extraOf(f: LayerFeature): ConstructExtra | undefined {
  return f.properties.extra as ConstructExtra | undefined;
}

function colorOf(f: LayerFeature): string {
  const n = extraOf(f)?.node;
  return n ? DOMAINS[n.domain].color : "#FFFFFF";
}

function ringLines(rings: number[][][], alt: number, color: string, alpha: number, width: number, dashed = false): StyledLine[] {
  return rings.map((ring) => ({
    positions: ring.map((p) => [p[0], p[1], alt] as LonLatAlt),
    color,
    alpha,
    width,
    dashed,
  }));
}

/** How long one stratum takes to rise, and the stagger between tiers, ms. */
const RISE_MS = 1400;
const STAGGER_MS = 70;

/** 0..1 progress of a stratum's rise out of the ground (ease-out cubic). */
export function riseProgress(born: number | undefined, tier: number, now: number): number {
  if (born == null) return 1;
  const t = (now - born - tier * STAGGER_MS) / RISE_MS;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** 3;
}

export const constructsStyle: LayerStyle = {
  color: "#E5E7EB",
  pointSize: (f) => (f.properties.kind === "here" ? 10 : 7),
  colorFor: colorOf,
  label: (f) => {
    const n = extraOf(f)?.node;
    return n ? `${KINDS[n.kind].label.toUpperCase()} · ${n.name}` : f.properties.name;
  },
  labelMax: 0,
  // Emergence: each stratum rises from the ground point to its place in the spiral.
  position: (f) => {
    if (f.geometry.type !== "Point") return null;
    const [lon, lat, alt] = f.geometry.coordinates as [number, number, number];
    const x = extraOf(f);
    if (!x?.node) return [lon, lat, alt ?? 0];
    const k = riseProgress(x.born, x.tier, Date.now());
    return [x.ground[0] + (lon - x.ground[0]) * k, x.ground[1] + (lat - x.ground[1]) * k, (alt ?? 0) * k];
  },
  tickMs: 40,
  labelAlways: (f) => f.properties.kind === "here" || ALWAYS_LABEL.has(f.properties.kind ?? ""),
  lines: (f) => {
    const x = extraOf(f);
    if (!x?.node) return null;
    const [lon, lat, alt] = f.geometry.type === "Point" ? (f.geometry.coordinates as number[]) : [x.ground[0], x.ground[1], x.alt];
    const color = colorOf(f);
    // Tethers and shells stay quiet so the stack reads as one composed column.
    const out: StyledLine[] = [{ positions: [[lon, lat, alt], [x.ground[0], x.ground[1], 0]], color, alpha: 0.26, width: 1 }];
    if (x.node.rings) out.push(...ringLines(x.node.rings, x.alt, color, 0.22, 1));
    return out;
  },
  selectedLines: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    const color = colorOf(f);
    // The shell brightens in its own point-of-view colour; the footprint it
    // drops on the ground is the selection, in the signal accent.
    return [...ringLines(x.node.rings, x.alt, color, 0.95, 2.2), ...ringLines(x.node.rings, 30, SIGNAL, 0.85, 1.6, true)];
  },
  scaleByDistance: [2e4, 1.0, 2e7, 0.4],
};
