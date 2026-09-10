"use client";
// Runtime UI state for the cockpit: which layers are on, what is selected,
// where the camera is, the mission clock and the signal log.

import { create } from "zustand";
import type { LayerId, LayerFeature, ViewState } from "@/lib/layers/types";
import { LAYER_IDS } from "@/lib/layers/types";

export interface Selection {
  layer: LayerId;
  id: string;
}

export interface LayerStatus {
  count: number;
  source: string;
  fetchedAt: number;
  loading: boolean;
  error?: string;
  note?: string;
}

export interface LogEntry {
  t: number;
  level: "info" | "warn" | "alert";
  text: string;
  layer?: LayerId;
}

export interface ClockState {
  /** Offset of the mission clock from wall-clock time, ms. 0 = LIVE. */
  offsetMs: number;
  /** Clock rate multiplier while animating. */
  multiplier: number;
  /** Whether the Cesium clock advances. */
  animate: boolean;
}

interface GlobeState {
  ready: boolean;
  setReady: (ready: boolean) => void;

  layers: Record<LayerId, boolean>;
  toggleLayer: (id: LayerId) => void;
  setLayer: (id: LayerId, on: boolean) => void;

  status: Partial<Record<LayerId, LayerStatus>>;
  setStatus: (id: LayerId, patch: Partial<LayerStatus>) => void;

  selected: Selection | null;
  selectedFeature: LayerFeature | null;
  select: (sel: Selection | null, feature?: LayerFeature | null) => void;
  hover: Selection | null;
  setHover: (sel: Selection | null) => void;

  following: boolean;
  setFollowing: (on: boolean) => void;

  view: ViewState;
  setView: (view: ViewState) => void;

  clock: ClockState;
  setClock: (patch: Partial<ClockState>) => void;

  log: LogEntry[];
  pushLog: (entry: Omit<LogEntry, "t">) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  waterReportOpen: boolean;
  setWaterReportOpen: (open: boolean) => void;
}

const defaultLayers = Object.fromEntries(
  LAYER_IDS.map((id) => [id, false]),
) as Record<LayerId, boolean>;

export const useGlobe = create<GlobeState>()((set) => ({
  ready: false,
  setReady: (ready) => set({ ready }),

  layers: defaultLayers,
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setLayer: (id, on) => set((s) => ({ layers: { ...s.layers, [id]: on } })),

  status: {},
  setStatus: (id, patch) =>
    set((s) => ({
      status: {
        ...s.status,
        [id]: {
          count: 0,
          source: "",
          fetchedAt: 0,
          loading: false,
          ...(s.status[id] ?? {}),
          ...patch,
        },
      },
    })),

  selected: null,
  selectedFeature: null,
  select: (sel, feature) =>
    set((s) => ({
      selected: sel,
      selectedFeature: sel ? (feature ?? s.selectedFeature) : null,
      following: sel ? s.following : false,
    })),
  hover: null,
  setHover: (hover) => set({ hover }),

  following: false,
  setFollowing: (following) => set({ following }),

  view: { lon: -97.74, lat: 30.27, height: 12_000_000, heading: 0, pitch: -90 },
  setView: (view) => set({ view }),

  clock: { offsetMs: 0, multiplier: 1, animate: true },
  setClock: (patch) => set((s) => ({ clock: { ...s.clock, ...patch } })),

  log: [],
  pushLog: (entry) =>
    set((s) => ({
      log: [{ t: Date.now(), ...entry }, ...s.log].slice(0, 80),
    })),

  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  waterReportOpen: false,
  setWaterReportOpen: (waterReportOpen) => set({ waterReportOpen }),
}));

/** Mission time = wall clock + operator offset. */
export function missionNow(clock: ClockState): number {
  return Date.now() + clock.offsetMs;
}
