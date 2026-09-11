"use client";
// Permalinks. The URL carries enough to put another person in the same
// place with the same layers, clock and selection:
//
//   ?lat=29.28&lon=-98.34&h=60000&hd=0&p=-55
//   &layers=water,turbidity      exactly these layers on
//   &t=2026-09-02T18:00:00Z      mission clock (omitted while live)
//   &sel=water:usgs:USGS-08180800   selected feature, best effort
//   &report=1                    community water report open
//   &embed=1                     no HUD chrome (iframes)
//
// The URL is rewritten with replaceState about once a second while things
// change; nothing here ever pushes history entries.

import { LAYER_IDS, type LayerId } from "@/lib/layers/types";
import { useGlobe, type Selection } from "@/lib/store/globe";
import { flyTo, flyToSelection } from "./camera";
import { getRenderer } from "./registry";
import { setMissionTime } from "./clock";

export interface ShareState {
  lat?: number;
  lon?: number;
  /** Camera height in metres. */
  h?: number;
  /** Heading / pitch in degrees. */
  hd?: number;
  p?: number;
  layers?: LayerId[];
  /** Mission clock, epoch ms. */
  t?: number;
  sel?: Selection;
  report?: boolean;
  embed?: boolean;
}

const LAYER_SET = new Set<string>(LAYER_IDS);

export function parseShare(search: string): ShareState {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const num = (k: string) => {
    const v = q.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const out: ShareState = {};
  const lat = num("lat");
  const lon = num("lon");
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    out.lat = lat;
    out.lon = lon;
  }
  const h = num("h");
  if (h != null && h > 100 && h < 5e7) out.h = h;
  const hd = num("hd");
  if (hd != null) out.hd = ((hd % 360) + 360) % 360;
  const p = num("p");
  if (p != null && p <= 0 && p >= -90) out.p = p;
  const layers = q.get("layers");
  if (layers != null) {
    out.layers = layers
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is LayerId => LAYER_SET.has(s));
  }
  const t = q.get("t");
  if (t) {
    const ms = Date.parse(t);
    if (Number.isFinite(ms)) out.t = ms;
  }
  const sel = q.get("sel");
  if (sel) {
    const i = sel.indexOf(":");
    const layer = sel.slice(0, i);
    const id = sel.slice(i + 1);
    if (LAYER_SET.has(layer) && id) out.sel = { layer: layer as LayerId, id };
  }
  if (q.get("report") === "1") out.report = true;
  if (q.get("embed") === "1") out.embed = true;
  return out;
}

export function shareQuery(s: ShareState): string {
  const q = new URLSearchParams();
  if (s.lat != null && s.lon != null) {
    q.set("lat", s.lat.toFixed(4));
    q.set("lon", s.lon.toFixed(4));
  }
  if (s.h != null) q.set("h", String(Math.round(s.h)));
  if (s.hd != null) {
    const hd = ((s.hd % 360) + 360) % 360;
    if (hd > 0.5 && hd < 359.5) q.set("hd", hd.toFixed(0));
  }
  if (s.p != null) q.set("p", s.p.toFixed(0));
  if (s.layers) q.set("layers", s.layers.join(","));
  if (s.t != null) q.set("t", new Date(s.t).toISOString().slice(0, 19) + "Z");
  if (s.sel) q.set("sel", `${s.sel.layer}:${s.sel.id}`);
  if (s.report) q.set("report", "1");
  if (s.embed) q.set("embed", "1");
  const str = q.toString();
  return str ? `?${str}` : "";
}

/** The current cockpit as a ShareState. */
export function currentShare(): ShareState {
  const st = useGlobe.getState();
  const on = LAYER_IDS.filter((id) => st.layers[id]);
  return {
    lat: st.view.lat,
    lon: st.view.lon,
    h: st.view.height,
    hd: st.view.heading,
    p: st.view.pitch,
    layers: on,
    t: Math.abs(st.clock.offsetMs) >= 60_000 ? Date.now() + st.clock.offsetMs : undefined,
    sel: st.selected ?? undefined,
    report: st.waterReportOpen || undefined,
    embed: st.embed || undefined,
  };
}

export function shareUrl(s: ShareState = currentShare()): string {
  const base = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  return base + shareQuery(s);
}

/** Keep the address bar in sync with the cockpit (replaceState, throttled). */
export function startUrlSync(): () => void {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";
  const write = () => {
    timer = null;
    const next = shareQuery(currentShare());
    if (next === last) return;
    last = next;
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}`);
    } catch {
      /* some embedders forbid it */
    }
  };
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(write, 1000);
  };
  const unsub = useGlobe.subscribe((s, prev) => {
    if (
      s.view !== prev.view ||
      s.layers !== prev.layers ||
      s.clock.offsetMs !== prev.clock.offsetMs ||
      s.selected !== prev.selected ||
      s.waterReportOpen !== prev.waterReportOpen
    ) {
      schedule();
    }
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}

/**
 * Apply a parsed share state to a ready globe: layers, clock, camera, report,
 * and the selection once its layer has loaded (best effort, ~20 s).
 */
export function applyShare(s: ShareState, opts: { fly?: boolean } = {}): void {
  const st = useGlobe.getState();
  if (s.layers) {
    for (const id of LAYER_IDS) st.setLayer(id, s.layers.includes(id));
  }
  if (s.t != null) setMissionTime(s.t);
  if (s.report) st.setWaterReportOpen(true);
  if (opts.fly !== false && s.lat != null && s.lon != null) {
    flyTo(s.lon, s.lat, { height: s.h ?? 120_000, pitchDeg: s.p ?? -55, headingDeg: s.hd ?? 0, durationS: 4 });
  }
  if (s.sel) {
    const sel = s.sel;
    const started = Date.now();
    const tryPick = () => {
      const f = getRenderer(sel.layer)?.getFeature(sel.id);
      if (f) {
        useGlobe.getState().select(sel, f);
        flyToSelection(sel);
        return;
      }
      if (Date.now() - started < 20_000) setTimeout(tryPick, 700);
      else useGlobe.getState().pushLog({ level: "warn", text: `Shared object ${sel.id} is not in the ${sel.layer} feed right now.` });
    };
    setTimeout(tryPick, 1500);
  }
}

export async function copyShareLink(): Promise<string> {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    useGlobe.getState().pushLog({ level: "info", text: "Link copied. It carries the view, the layers, the clock and the selection." });
  } catch {
    useGlobe.getState().pushLog({ level: "warn", text: `Clipboard blocked; the link is ${url}` });
  }
  return url;
}
