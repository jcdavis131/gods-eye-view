// The location join: which features fall inside a construct's outline.
// Pure, so the HUD and the tests share it.

import type { LayerFeature, LayerId } from "@/lib/layers/types";
import { bboxContains, ringsBbox, ringsContain } from "./geo";

/** A feature's point: its Point geometry, else its published anchor. */
export function pointOf(f: LayerFeature): [number, number] | null {
  if (f.geometry.type === "Point") return [f.geometry.coordinates[0], f.geometry.coordinates[1]];
  return f.properties.anchor ?? null;
}

/** Features inside `rings`, grouped by layer; constructs themselves are skipped. */
export function joinInside(rings: number[][][], features: Iterable<LayerFeature>): Map<LayerId, LayerFeature[]> {
  const out = new Map<LayerId, LayerFeature[]>();
  const box = ringsBbox(rings);
  if (!box) return out;
  for (const f of features) {
    if (f.properties.layer === "constructs") continue;
    const p = pointOf(f);
    if (!p || !bboxContains(box, p[0], p[1]) || !ringsContain(rings, p[0], p[1])) continue;
    const list = out.get(f.properties.layer) ?? [];
    list.push(f);
    out.set(f.properties.layer, list);
  }
  return out;
}
