"use client";
// Bridges data layers to the globe: one tanstack-query per enabled layer,
// one LayerRenderer per layer. Nothing here knows how a layer is fetched or
// drawn; it only moves GeoJSON from fetch() into the renderer and reports
// status to the HUD.

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LAYERS } from "@/lib/layers";
import { viewKey, type LayerDefinition } from "@/lib/layers/types";
import { getViewer } from "@/lib/globe/cesium";
import { LayerRenderer } from "@/lib/globe/renderer";
import { registerRenderer, unregisterRenderer } from "@/lib/globe/registry";
import { STYLES } from "@/lib/globe/styles";
import { satWorker } from "@/lib/globe/satWorker";
import { useGlobe } from "@/lib/store/globe";
import { useSettings, type Prefs } from "@/lib/store/settings";
import { useNow } from "@/lib/hooks/useNow";
import EmergenceBridge from "./EmergenceBridge";
import TraceOverlay from "./TraceOverlay";

/** Which preferences each layer's fetch() depends on (changes trigger a refetch). */
const OPTION_KEYS: Partial<Record<LayerDefinition["id"], Array<keyof Prefs>>> = {
  aircraft: ["aircraftSource"],
  satellites: ["satelliteGroups"],
  field: ["fieldPov"],
};

export default function LayerHost() {
  const ready = useGlobe((s) => s.ready);
  if (!ready) return null;
  return (
    <>
      {LAYERS.map((def) => (
        <LayerBridge key={def.id} def={def} />
      ))}
      <EmergenceBridge />
      <TraceOverlay />
    </>
  );
}

/**
 * The camera reports its target several times a second while flying. View-
 * dependent layers must not refetch on every intermediate frame (adsb.lol
 * rate-limits at a handful of requests per second), so the view used for
 * query keys only updates once the camera has been still for a moment.
 */
function useSettledView(delayMs = 700, followCadenceMs = 5000) {
  const live = useGlobe((s) => s.view);
  const following = useGlobe((s) => s.following);
  const [settled, setSettled] = useState(live);
  // Free camera: settle once it has been still for a moment.
  useEffect(() => {
    if (following) return;
    const id = setTimeout(() => setSettled(live), delayMs);
    return () => clearTimeout(id);
  }, [live, delayMs, following]);
  // Following a moving target the camera never stops, so sample the live
  // view on a fixed cadence instead; otherwise a long chase would keep
  // polling around the place the chase started.
  useEffect(() => {
    if (!following) return;
    const id = setInterval(() => setSettled(useGlobe.getState().view), followCadenceMs);
    return () => clearInterval(id);
  }, [following, followCadenceMs]);
  return settled;
}

function LayerBridge({ def }: { def: LayerDefinition }) {
  const enabled = useGlobe((s) => s.layers[def.id]);
  const view = useSettledView();
  const setStatus = useGlobe((s) => s.setStatus);
  const pushLog = useGlobe((s) => s.pushLog);
  const keys = useSettings((s) => s.keys);
  const prefs = useSettings((s) => s.prefs);
  const labels = prefs.labels;
  const clockOffset = useGlobe((s) => s.clock.offsetMs);
  // Time-dependent layers (satellite scenes) re-fetch when the mission clock
  // crosses into another UTC day; a coarse minute tick is plenty for that.
  const minute = useNow(60_000);
  const missionDay = def.timeDependent ? Math.floor((minute + clockOffset) / 86_400_000) : 0;

  const rendererRef = useRef<LayerRenderer | null>(null);

  useEffect(() => {
    const viewer = getViewer();
    const style = STYLES[def.id];
    if (!viewer || !style) return;
    const r = new LayerRenderer(viewer, def.id, style);
    r.show = useGlobe.getState().layers[def.id];
    r.setLabelsEnabled(useSettings.getState().prefs.labels);
    registerRenderer(def.id, r);
    rendererRef.current = r;
    return () => {
      unregisterRenderer(def.id);
      r.destroy();
      rendererRef.current = null;
    };
  }, [def.id]);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.show = enabled;
    // The satellite propagation worker only needs to run while the layer shows.
    if (def.id === "satellites") satWorker.setEnabled(enabled);
  }, [enabled, def.id]);

  useEffect(() => {
    rendererRef.current?.setLabelsEnabled(labels);
  }, [labels]);

  const vk = def.viewDependent ? (def.viewKey?.(view) ?? viewKey(view)) : "static";
  const optionsKey = useMemo(() => {
    const ks = OPTION_KEYS[def.id] ?? [];
    return JSON.stringify(ks.map((k) => prefs[k]));
  }, [def.id, prefs]);

  // TanStack re-reads queryFn on every render, so the closure always carries
  // the latest settled view, keys and prefs without touching refs in render.
  const query = useQuery({
    queryKey: ["layer", def.id, vk, optionsKey, missionDay],
    queryFn: ({ signal }) =>
      def.fetch({
        keys,
        view,
        now: Date.now(),
        missionTime: Date.now() + useGlobe.getState().clock.offsetMs,
        signal,
        options: { ...prefs } as unknown as Record<string, unknown>,
      }),
    enabled,
    refetchInterval: def.updateIntervalMs,
    staleTime: Math.max(1000, def.updateIntervalMs / 2),
    placeholderData: keepPreviousData,
  });

  const { data, error, isFetching } = query;

  useEffect(() => {
    if (!data) return;
    rendererRef.current?.update(data.collection);
    const live = data.collection.features.filter((f) => !f.properties.simulated).length;
    const metaCount = typeof data.meta?.count === "number" ? (data.meta.count as number) : undefined;
    setStatus(def.id, {
      count: metaCount ?? (def.simulated ? data.collection.features.length : live),
      source: data.source,
      fetchedAt: data.fetchedAt,
      note: data.note,
      error: undefined,
      loading: false,
    });
  }, [data, def.id, def.simulated, setStatus]);

  useEffect(() => {
    if (!error) return;
    const text = error instanceof Error ? error.message : String(error);
    setStatus(def.id, { error: text, loading: false });
    pushLog({ level: "warn", text: `${def.label}: ${text}`, layer: def.id });
  }, [error, def.id, def.label, setStatus, pushLog]);

  useEffect(() => {
    setStatus(def.id, { loading: isFetching });
  }, [isFetching, def.id, setStatus]);

  return null;
}
