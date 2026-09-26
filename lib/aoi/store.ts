"use client";
// The Area panel's state: whether it is open, whether the watch is running,
// and the watch's baseline and log. The area itself is the Measure tool's
// drawn polygon (useGlobe().measure.shape), so it travels in share links as
// `shape=a:…`; `aoi=1` reopens this panel on arrival.

import { create } from "zustand";
import type { LayerId } from "@/lib/layers/types";
import type { LayerStatus } from "@/lib/store/globe";
import { newWatch, type WatchState } from "./area";
import type { Ring } from "./geometry";

interface AreaStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  tab: "inside" | "watch" | "report";
  setTab: (tab: AreaStore["tab"]) => void;
  watching: boolean;
  /** When the watch started; the log counts from here. */
  watchSince: number | null;
  watch: WatchState;
  /** Bumped on every watch step so the panel re-renders the log. */
  tick: number;
  startWatch: () => void;
  stopWatch: () => void;
  bump: () => void;
}

export const useArea = create<AreaStore>()((set) => ({
  open: false,
  setOpen: (open) => set(open ? { open } : { open, watching: false }),
  tab: "inside",
  setTab: (tab) => set({ tab }),
  watching: false,
  watchSince: null,
  watch: newWatch(),
  tick: 0,
  startWatch: () => set({ watching: true, watchSince: Date.now(), watch: newWatch(), tick: 0 }),
  stopWatch: () => set({ watching: false }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));

/** The drawn area as a ring, when the shape is an area of at least three corners. */
export function areaRing(shape: { kind: "line" | "area"; points: Array<[number, number]> } | null | undefined): Ring | null {
  if (!shape || shape.kind !== "area" || shape.points.length < 3) return null;
  return shape.points.map(([lon, lat]) => [lon, lat] as [number, number]);
}

/** Layers that are on and have an answer on the globe: a finished fetch that did not fail. */
export function answeringLayers(on: Partial<Record<LayerId, boolean>>, status: Partial<Record<LayerId, LayerStatus>>): Set<LayerId> {
  const out = new Set<LayerId>();
  for (const [id, isOn] of Object.entries(on) as Array<[LayerId, boolean]>) {
    const st = status[id];
    if (isOn && st && !st.error && st.fetchedAt > 0) out.add(id);
  }
  return out;
}

/**
 * Whether the drawn area is in the camera's view, so view-dependent layers are
 * loading it: the area's centre within reach of the camera target (half the camera
 * height, at least 30 km), or inside the visible box when the camera reports one.
 */
export function areaInView(ring: Ring, view: { lon: number; lat: number; height: number; bbox?: [number, number, number, number] }): boolean {
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  lon /= ring.length;
  lat /= ring.length;
  if (view.bbox) {
    const [w, s, e, n] = view.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) return true;
  }
  const dLat = (lat - view.lat) * 111_195;
  const dLon = (lon - view.lon) * 111_195 * Math.cos((view.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon) <= Math.max(30_000, view.height * 0.5);
}
