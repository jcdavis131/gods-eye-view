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
import { getRenderer, registerRenderer, unregisterRenderer } from "@/lib/globe/registry";
import { STYLES } from "@/lib/globe/styles";
import { satWorker } from "@/lib/globe/satWorker";
import { useGlobe } from "@/lib/store/globe";
import { useSettings, type Prefs } from "@/lib/store/settings";
import { useNow } from "@/lib/hooks/useNow";
import { useStrata } from "@/lib/fabric/strataStore";
import EmergenceBridge from "./EmergenceBridge";
import TraceOverlay from "./TraceOverlay";
import UpstreamOverlay from "./UpstreamOverlay";
import StrataOverlay from "./StrataOverlay";

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
      <UpstreamOverlay />
      <StrataOverlay />
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
  // The constructs stack can be pinned to a point (lib/fabric/strataStore.ts);
  // its view key reads the pin, so a pin change must re-render the bridge.
  useStrata((s) => (def.id === "constructs" ? s.pin : null));
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

  // The state of the layers this one's refine() reads: on/off, their last
  // answer and whether it failed (hazards steps aside for Earthquakes and Live
  // warnings only while they are drawing the same events). A change re-runs
  // refine on the data in hand; it is not a refetch.
  const depsKey = useGlobe((s) => (def.dependsOn ?? []).map((id) => `${s.layers[id] ? 1 : 0}:${s.status[id]?.fetchedAt ?? 0}:${s.status[id]?.error ? 1 : 0}`).join("|"));

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

  const { data: fetched, error, isFetching } = query;

  // What is drawn: the fetched result, refined by the layers it depends on.
  // The renderer is updated before the status below, so a layer refining on
  // this one's status finds these features in the renderer when it re-runs.
  const data = useMemo(() => {
    if (!fetched || !def.refine) return fetched;
    const deps = def.dependsOn ?? [];
    const s = useGlobe.getState();
    return def.refine(fetched, {
      layersOn: Object.fromEntries(deps.map((id) => [id, !!s.layers[id]])),
      answering: Object.fromEntries(deps.map((id) => [id, s.status[id]?.fetchedAt != null && !s.status[id]?.error])),
      // What the layer's renderer holds; whether it is shown is layersOn (the
      // store flips before the renderer's own effect catches up).
      holds: (layer, id) => deps.includes(layer) && !!getRenderer(layer)?.getFeature(id),
    });
    // depsKey is what the store reads above: re-run when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched, def, depsKey]);

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
