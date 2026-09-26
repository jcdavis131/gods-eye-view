// Shared by the zoning, permits, licences and environmental-permits layers:
// the box a near-only layer loaded, drawn as a dashed outline, and the view
// key that asks for a new box only when the camera target leaves a grid cell.
// Ground outside the box was never loaded, which must not read as "nothing
// there" (the flood layer's rule, lib/layers/flood.ts).

import type { Bbox } from "@/lib/zoning/features";
import type { LayerFeature, LayerId, ViewState } from "./types";

/** The box a layer loaded, as a dashed outline feature (kind "loaded-box"; never counted or searched). */
export function civicLoadedBox(layer: LayerId, b: Bbox, what: string): LayerFeature {
  const [w, s, e, n] = b;
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    properties: {
      id: `${layer}:loaded-box`,
      layer,
      name: "Loaded area",
      kind: "loaded-box",
      source: "this app",
      details: {
        "what this is": `the box ${what} were loaded for. Outside it nothing is loaded, which is not the same as none being there`,
        box: `${w}, ${s} to ${e}, ${n}`,
      },
    },
  };
}

/** "above" over `max` metres; otherwise the grid cell of the camera target. */
export function civicViewKey(max: number, grid: number) {
  return (v: ViewState) => (v.height > max ? "above" : `${Math.round(v.lon / grid)},${Math.round(v.lat / grid)}`);
}

/** Centre of the view key's cell, so every viewer in a cell sends the same box. */
export function cellCentre(v: ViewState, grid: number): { lon: number; lat: number } {
  return { lon: Math.round(v.lon / grid) * grid, lat: Math.round(v.lat / grid) * grid };
}

export function isLoadedBox(f: LayerFeature): boolean {
  return f.properties.kind === "loaded-box";
}
