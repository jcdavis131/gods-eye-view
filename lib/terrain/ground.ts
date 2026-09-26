"use client";
// "Ground here": a click on the ground while a terrain, soil or land cover
// picture is on asks each of those publishers what is under the click and
// opens one dossier with their answers as they land. Pictures have no
// features to pick, so the store holds the point, the dossier is fed from it,
// and a marker shows where it was asked.
//
//   soils       /api/soil?op=point           map unit, farmland class, NCCPI
//   firehazard  /api/terrain?op=point        WHP 2023 class
//   landcover   /api/terrain?op=point        NLCD 2021 class
//   slope       /api/terrain?op=point        3DEP slope, degrees
//   relief,     /api/land?op=elevation       3DEP ground elevation and the
//   contours                                 source DEM's resolution
//
// Only the layers that are on are asked, and only below GROUND_MAX_HEIGHT_M,
// so a click from orbit still just deselects.

import { create } from "zustand";
import type * as CesiumNS from "cesium";
import { useGlobe } from "@/lib/store/globe";
import { getCesium } from "@/lib/globe/cesium";
import type { LayerFeature, LayerId } from "@/lib/layers/types";
import { GROUND_LAYERS } from "@/lib/layers/terrain";
import type { ClassAnswer } from "./classes";
import { nccpiText, type SoilAnswer } from "./soil";

/** Above this camera height a ground click is not a question about the ground. */
export const GROUND_MAX_HEIGHT_M = 150_000;

export type GroundPart = "soils" | "firehazard" | "landcover" | "slope" | "elevation";

export interface PartState {
  loading: boolean;
  error?: string;
  data?: unknown;
}

export interface GroundPick {
  lon: number;
  lat: number;
  seq: number;
  layer: LayerId;
  parts: Partial<Record<GroundPart, PartState>>;
}

interface PickState {
  pick: GroundPick | null;
  set: (pick: GroundPick | null) => void;
}

export const useGroundPick = create<PickState>()((set) => ({
  pick: null,
  set: (pick) => set({ pick }),
}));

const PART_OF: Partial<Record<LayerId, GroundPart>> = {
  soils: "soils",
  firehazard: "firehazard",
  landcover: "landcover",
  slope: "slope",
  contours: "elevation",
  relief: "elevation",
};

/** The parts to ask for, given which layers are on (each once, in a fixed order). */
export function partsFor(on: Partial<Record<LayerId, boolean>>): GroundPart[] {
  const out: GroundPart[] = [];
  for (const l of GROUND_LAYERS) {
    const p = PART_OF[l];
    if (on[l] && p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** Whether a click on empty ground should ask the ground (a ground layer on, the camera low enough). */
export function groundClickWanted(on: Partial<Record<LayerId, boolean>>, height: number): boolean {
  return height <= GROUND_MAX_HEIGHT_M && partsFor(on).length > 0;
}

export function groundId(lon: number, lat: number): string {
  return `ground:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

const SOURCE_OF: Record<GroundPart, string> = {
  soils: "NRCS SSURGO",
  firehazard: "USFS WHP 2023",
  landcover: "MRLC NLCD 2021",
  slope: "USGS 3DEP",
  elevation: "USGS 3DEP EPQS",
};

type Details = NonNullable<LayerFeature["properties"]["details"]>;

function waiting(d: Details, key: string, s: PartState | undefined, who: string): boolean {
  if (!s) return true;
  if (s.loading) {
    d[key] = `asking ${who}…`;
    return true;
  }
  if (s.error) {
    d[key] = `${who} did not answer: ${s.error.slice(0, 80)}`;
    return true;
  }
  return false;
}

/** The dossier details for a pick, in reading order; pure, tested. */
export function groundDetails(p: Pick<GroundPick, "lon" | "lat" | "parts">): Details {
  const d: Details = {};
  const soil = p.parts.soils;
  if (soil && !waiting(d, "soil map unit", soil, "NRCS Soil Data Access")) {
    const a = soil.data as SoilAnswer | null;
    if (!a) d["soil map unit"] = "none mapped here (water, or outside the survey)";
    else {
      const mu = a.mapUnit;
      d["soil map unit"] = `${mu.name ?? "unnamed"}${mu.symbol ? ` (${mu.symbol})` : ""}`;
      d["farmland class (NRCS)"] = mu.farmlandClass ?? "not published";
      if (a.dominant) {
        d["main soil"] = `${a.dominant.name ?? "unnamed"}${a.dominant.percent != null ? `, ${a.dominant.percent} % of the map unit` : ""}`;
      }
      d["NCCPI (main soil, 0 to 1)"] = nccpiText(a.dominant);
      if (mu.areaName || mu.areaSymbol) d["soil survey"] = `${mu.areaName ?? mu.areaSymbol}${mu.surveySaved ? `, saved ${mu.surveySaved}` : ""}`;
      d["map unit key"] = mu.mukey;
    }
  }
  const whp = p.parts.firehazard;
  if (whp && !waiting(d, "wildfire hazard potential", whp, "USFS")) {
    const c = whp.data as ClassAnswer | null;
    d["wildfire hazard potential"] = c ? `${c.label} (class ${c.code} of WHP 2023)` : "no class here (WHP covers the conterminous US)";
  }
  const lc = p.parts.landcover;
  if (lc && !waiting(d, "land cover", lc, "MRLC")) {
    const c = lc.data as ClassAnswer | null;
    d["land cover"] = c ? `${c.label} (NLCD 2021 class ${c.code})` : "no class here (NLCD 2021 covers the conterminous US)";
  }
  const sl = p.parts.slope;
  if (sl && !waiting(d, "slope", sl, "USGS 3DEP")) {
    const deg = sl.data as number | null;
    d.slope = deg == null ? "no 3DEP value here" : `${deg}° (3DEP "Slope Degrees", whole degrees)`;
  }
  const el = p.parts.elevation;
  if (el && !waiting(d, "ground elevation", el, "USGS 3DEP EPQS")) {
    const e = el.data as { metres?: number; resolutionM?: number } | null;
    d["ground elevation"] =
      e?.metres != null
        ? `${e.metres.toFixed(1)} m · ${(e.metres / 0.3048).toFixed(0)} ft${e.resolutionM != null ? `, source DEM ${e.resolutionM} m` : ""}`
        : "no 3DEP value here (it covers the United States)";
  }
  d.point = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  return d;
}

/** The dossier feature for a pick. */
export function groundFeature(p: GroundPick): LayerFeature {
  const asked = (Object.keys(p.parts) as GroundPart[]).map((k) => SOURCE_OF[k]);
  const soil = p.parts.soils?.data as SoilAnswer | null | undefined;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: {
      id: groundId(p.lon, p.lat),
      layer: p.layer,
      name: soil?.mapUnit.name ? `Ground here · ${soil.mapUnit.name}` : "Ground here",
      kind: "ground",
      source: [...new Set(asked)].join(" · "),
      details: groundDetails(p),
      anchor: [p.lon, p.lat],
    },
  };
}

let seq = 0;

function show(p: GroundPick) {
  useGroundPick.getState().set(p);
  const f = groundFeature(p);
  useGlobe.getState().select({ layer: p.layer, id: f.properties.id }, f);
}

function current(n: number): GroundPick | null {
  const p = useGroundPick.getState().pick;
  if (!p || p.seq !== n) return null;
  const sel = useGlobe.getState().selected;
  return sel && sel.id === groundId(p.lon, p.lat) ? p : null;
}

async function getJson(url: string): Promise<{ data?: unknown; error?: string }> {
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({}))) as { data?: unknown; error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

const ASK: Record<GroundPart, (lon: string, lat: string) => Promise<unknown>> = {
  soils: async (lon, lat) => (await getJson(`/api/soil?op=point&lon=${lon}&lat=${lat}`)).data ?? null,
  firehazard: async (lon, lat) => ((await getJson(`/api/terrain?op=point&product=firehazard&lon=${lon}&lat=${lat}`)).data as { class?: unknown })?.class ?? null,
  landcover: async (lon, lat) => ((await getJson(`/api/terrain?op=point&product=landcover&lon=${lon}&lat=${lat}`)).data as { class?: unknown })?.class ?? null,
  slope: async (lon, lat) => ((await getJson(`/api/terrain?op=point&product=slope&lon=${lon}&lat=${lat}`)).data as { degrees?: unknown })?.degrees ?? null,
  elevation: async (lon, lat) => (await getJson(`/api/land?op=elevation&lon=${lon}&lat=${lat}`)).data ?? null,
};

/** Ask every ground layer that is on what is under this point, and open the dossier. */
export async function identifyGround(lon: number, lat: number, on: Partial<Record<LayerId, boolean>> = useGlobe.getState().layers): Promise<void> {
  const parts = partsFor(on);
  const layer = GROUND_LAYERS.find((l) => on[l]);
  if (!parts.length || !layer) return;
  const n = ++seq;
  const x = lon.toFixed(5);
  const y = lat.toFixed(5);
  const start: GroundPick = { lon: Number(x), lat: Number(y), seq: n, layer, parts: Object.fromEntries(parts.map((k) => [k, { loading: true }])) };
  show(start);
  await Promise.all(
    parts.map(async (k) => {
      let state: PartState;
      try {
        state = { loading: false, data: await ASK[k](x, y) };
      } catch (err) {
        state = { loading: false, error: err instanceof Error ? err.message : String(err) };
      }
      const p = current(n);
      if (p) show({ ...p, parts: { ...p.parts, [k]: state } });
    }),
  );
}

/** Whether a selection is a ground answer (it travels in links as its point, not as sel=). */
export function isGroundSelection(sel: { id: string } | null | undefined): boolean {
  return !!sel && sel.id.startsWith("ground:");
}

/** Draws a marker where the open ground dossier was asked; returns a disposer. */
export function startGroundOverlay(viewer: CesiumNS.Viewer): () => void {
  const C = getCesium();
  const scene = viewer.scene;
  const points = scene.primitives.add(new C.PointPrimitiveCollection());
  const draw = () => {
    if (viewer.isDestroyed()) return;
    points.removeAll();
    const p = useGroundPick.getState().pick;
    const sel = useGlobe.getState().selected;
    if (!p || !sel || sel.id !== groundId(p.lon, p.lat)) return;
    points.add({
      position: C.Cartesian3.fromDegrees(p.lon, p.lat, 0),
      pixelSize: 10,
      color: C.Color.fromCssColorString("#F3E3A6"),
      outlineColor: C.Color.BLACK.withAlpha(0.85),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  };
  draw();
  const unsubPick = useGroundPick.subscribe(draw);
  const unsubSel = useGlobe.subscribe((s, prev) => {
    if (s.selected !== prev.selected) draw();
  });
  return () => {
    unsubPick();
    unsubSel();
    if (!viewer.isDestroyed() && scene.primitives.contains(points)) scene.primitives.remove(points);
  };
}
