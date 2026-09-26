// A drawn area of interest: what the loaded layers hold inside it, a watch
// that reports what arrives in it and what leaves, and the files to take it
// away. The area is the Measure tool's drawn polygon; nothing here fetches:
// it works on what the globe already holds (lib/globe/registry.ts), so the
// answer is only as complete as the layers that are on and what they loaded.
// Pure, tested.

import type { LayerFeature, LayerId } from "@/lib/layers/types";
import { featureInside, featurePoint, ringBox, type Ring } from "./geometry";

/** Layers whose features are never "in" an area: map furniture, propagated orbits, simulations. */
export const NOT_IN_AREAS: ReadonlySet<LayerId> = new Set<LayerId>(["satellites", "traffic", "field", "constructs"]);

export function countable(f: LayerFeature): boolean {
  const p = f.properties;
  if (p.kind === "loaded-box" || p.kind === "ground") return false;
  if (p.simulated) return false;
  return !NOT_IN_AREAS.has(p.layer);
}

export interface InsideGroup {
  layer: LayerId;
  features: LayerFeature[];
}

/** Loaded features any part of which is inside the area, grouped by layer in the order given. */
export function featuresInside(features: Iterable<LayerFeature>, ring: Ring): InsideGroup[] {
  if (ring.length < 3) return [];
  const box = ringBox(ring);
  const by = new Map<LayerId, LayerFeature[]>();
  for (const f of features) {
    if (!countable(f)) continue;
    if (!featureInside(f, ring, box)) continue;
    const l = f.properties.layer;
    let arr = by.get(l);
    if (!arr) by.set(l, (arr = []));
    arr.push(f);
  }
  return [...by.entries()].map(([layer, fs]) => ({ layer, features: fs }));
}

// ---------------------------------------------------------------- watch

/** Layers whose features come and go: the watch reports these. */
export const WATCH_LAYERS: ReadonlySet<LayerId> = new Set<LayerId>(["aircraft", "ships", "earthquakes", "fires", "wildfire", "hazards", "alerts", "events"]);

export interface WatchEvent {
  at: number;
  kind: "arrived" | "left";
  layer: LayerId;
  id: string;
  name: string;
}

export interface WatchState {
  /** key "<layer>:<id>" -> what was inside at the last step. */
  inside: Map<string, { layer: LayerId; id: string; name: string }>;
  /** Layers whose baseline has been taken (their first answer is never reported as arrivals). */
  seen: Set<LayerId>;
  log: WatchEvent[];
}

export function newWatch(): WatchState {
  return { inside: new Map(), seen: new Set(), log: [] };
}

/** Most events kept in the log. */
export const WATCH_LOG_MAX = 500;

/**
 * One watch step. `features` are the watched layers' loaded features now; `answering`
 * the watched layers that are on and answered their last fetch. A layer's first answer
 * sets its baseline silently. A feature that disappears because its layer stopped
 * answering (switched off, failed) is not reported as leaving; that layer is dropped
 * from the baseline, so its return is silent too. The caller pauses the watch while
 * the area is out of view, since view-dependent layers stop loading it then.
 */
export function watchStep(state: WatchState, features: Iterable<LayerFeature>, ring: Ring, answering: ReadonlySet<LayerId>, now: number): WatchEvent[] {
  const box = ringBox(ring);
  const current = new Map<string, { layer: LayerId; id: string; name: string }>();
  for (const f of features) {
    const l = f.properties.layer;
    if (!WATCH_LAYERS.has(l) || !answering.has(l) || !countable(f)) continue;
    if (!featureInside(f, ring, box)) continue;
    current.set(`${l}:${f.properties.id}`, { layer: l, id: f.properties.id, name: f.properties.name });
  }
  const events: WatchEvent[] = [];
  for (const [key, v] of current) {
    if (state.inside.has(key)) continue;
    if (state.seen.has(v.layer)) events.push({ at: now, kind: "arrived", ...v });
  }
  for (const [key, v] of state.inside) {
    if (current.has(key)) continue;
    // Only a layer still answering can say something left; the rest just stop being counted.
    if (answering.has(v.layer)) events.push({ at: now, kind: "left", ...v });
  }
  // Forget layers that are no longer answering, so their return is a new, silent baseline.
  for (const l of [...state.seen]) if (!answering.has(l)) state.seen.delete(l);
  for (const l of answering) if (WATCH_LAYERS.has(l)) state.seen.add(l);
  state.inside = current;
  state.log = [...events, ...state.log].slice(0, WATCH_LOG_MAX);
  return events;
}

// ---------------------------------------------------------------- take it away

type Scalar = string | number | boolean | null;

function flatDetails(f: LayerFeature): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const [k, v] of Object.entries(f.properties.details ?? {})) if (v != null && v !== "") out[k] = v as Scalar;
  return out;
}

/** The area and everything inside it as GeoJSON, each feature with its layer, source and dossier fields. */
export function insideGeoJson(ring: Ring, groups: InsideGroup[], generatedAt = new Date().toISOString()) {
  const closed = ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ? [...ring, ring[0]] : ring;
  return {
    type: "FeatureCollection" as const,
    generated: generatedAt,
    note: "Features the globe had loaded that touch the drawn area, as each layer's source published them; only as complete as the layers that were on.",
    features: [
      { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [closed] }, properties: { role: "drawn area" } },
      ...groups.flatMap((g) =>
        g.features.map((f) => ({
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            layer: f.properties.layer,
            id: f.properties.id,
            name: f.properties.name,
            kind: f.properties.kind ?? null,
            source: f.properties.source,
            observed_at: f.properties.observedAt != null ? new Date(f.properties.observedAt).toISOString() : null,
            ...flatDetails(f),
          },
        })),
      ),
    ],
  };
}

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const INSIDE_COLUMNS = ["layer", "id", "name", "kind", "lon", "lat", "source", "observed_at", "details"] as const;

/** One row per feature inside; `lon`/`lat` are a point's position or a line or polygon's anchor. */
export function insideCsv(groups: InsideGroup[]): string {
  const rows = [INSIDE_COLUMNS.join(",")];
  for (const g of groups) {
    for (const f of g.features) {
      const pt = featurePoint(f);
      const details = Object.entries(flatDetails(f))
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      rows.push(
        [g.layer, f.properties.id, f.properties.name, f.properties.kind ?? "", pt?.[0] ?? "", pt?.[1] ?? "", f.properties.source, f.properties.observedAt != null ? new Date(f.properties.observedAt).toISOString() : "", details]
          .map(cell)
          .join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

export function watchCsv(log: WatchEvent[]): string {
  const rows = ["time,event,layer,id,name"];
  for (const e of log) rows.push([new Date(e.at).toISOString(), e.kind, e.layer, e.id, e.name].map(cell).join(","));
  return rows.join("\r\n") + "\r\n";
}
