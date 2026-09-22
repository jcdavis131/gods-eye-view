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

export const constructsStyle: LayerStyle = {
  color: "#E5E7EB",
  pointSize: (f) => (f.properties.kind === "here" ? 10 : 7),
  colorFor: colorOf,
  label: (f) => {
    const n = extraOf(f)?.node;
    return n ? `${KINDS[n.kind].label.toUpperCase()} · ${n.name}` : f.properties.name;
  },
  labelMax: 0,
  labelAlways: (f) => f.properties.kind === "here" || ALWAYS_LABEL.has(f.properties.kind ?? ""),
  lines: (f) => {
    const x = extraOf(f);
    if (!x?.node) return null;
    const [lon, lat, alt] = f.geometry.type === "Point" ? (f.geometry.coordinates as number[]) : [x.ground[0], x.ground[1], x.alt];
    const color = colorOf(f);
    const out: StyledLine[] = [{ positions: [[lon, lat, alt], [x.ground[0], x.ground[1], 0]], color, alpha: 0.35, width: 1 }];
    if (x.node.rings) out.push(...ringLines(x.node.rings, x.alt, color, 0.28, 1.1));
    return out;
  },
  selectedLines: (f) => {
    const x = extraOf(f);
    if (!x?.node?.rings) return null;
    const color = colorOf(f);
    return [...ringLines(x.node.rings, x.alt, color, 0.95, 2.4), ...ringLines(x.node.rings, 30, color, 0.8, 1.6, true)];
  },
  scaleByDistance: [2e4, 1.0, 2e7, 0.4],
};
