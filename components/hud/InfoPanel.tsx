"use client";
// Right-hand panel: selected object dossier, or the signal log when idle.

import { useEffect, useState } from "react";
import { Crosshair, LocateFixed, X } from "lucide-react";
import { useGlobe } from "@/lib/store/globe";
import { LAYER_BY_ID } from "@/lib/layers";
import { formatAltitude, formatLatLon, formatSpeed, timeAgo } from "@/lib/globe/geo";
import { flyToSelection, startFollowing, stopFollowing } from "@/lib/globe/camera";
import { getRenderer } from "@/lib/globe/registry";
import { getCesium } from "@/lib/globe/cesium";
import { isLive } from "@/lib/globe/clock";

function useRefresh(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function InfoPanel() {
  const selected = useGlobe((s) => s.selected);
  const feature = useGlobe((s) => s.selectedFeature);
  const following = useGlobe((s) => s.following);
  const clock = useGlobe((s) => s.clock);
  const log = useGlobe((s) => s.log);
  useRefresh(1000);

  if (!selected || !feature) {
    return (
      <aside className="pointer-events-auto absolute right-3 top-[76px] z-30 hidden w-[300px] md:block">
        <div className="hud-panel">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="hud-label">Signal log</span>
            <span className="text-[9px] text-muted-foreground">click any object</span>
          </div>
          <ul className="max-h-[38vh] overflow-y-auto px-3 py-2 text-[10px] leading-relaxed">
            {log.length === 0 && <li className="text-muted-foreground">Waiting for signals…</li>}
            {log.slice(0, 14).map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {new Date(e.t).toISOString().slice(11, 19)}
                </span>
                <span
                  className={
                    e.level === "alert" ? "text-alert" : e.level === "warn" ? "text-warn" : "text-foreground/85"
                  }
                >
                  {e.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    );
  }

  const p = feature.properties;
  const def = LAYER_BY_ID[p.layer];
  const color = def?.color ?? "var(--primary)";
  const live = isLive(clock.offsetMs);
  const renderer = getRenderer(p.layer);
  const pos = renderer?.getPosition(p.id);
  let lonlat: [number, number, number] | null = null;
  if (pos) {
    const C = getCesium();
    const c = C.Cartographic.fromCartesian(pos);
    lonlat = [C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude), c.height];
  } else if (feature.geometry.type === "Point") {
    const [lon, lat, alt] = feature.geometry.coordinates;
    lonlat = [lon, lat, alt ?? 0];
  }
  const details = Object.entries(p.details ?? {}).filter(([, v]) => v != null && v !== "" && v !== false);
  const isLiveLayer = !p.simulated && p.layer !== "satellites" && p.layer !== "launches";

  return (
    <aside className="pointer-events-auto absolute right-3 top-[76px] z-30 w-[320px] max-w-[calc(100vw-24px)]">
      <div className="hud-panel">
        <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="hud-label" style={{ color }}>
              {def?.label ?? p.layer} · {p.kind ?? "object"}
              {p.simulated && <span className="ml-2 text-warn">SIMULATED</span>}
            </div>
            <div className="hud-display truncate text-[18px] font-semibold leading-tight text-foreground">
              {p.name}
            </div>
            <div className="text-[9px] text-muted-foreground">
              src {p.source}
              {p.observedAt ? ` · seen ${timeAgo(p.observedAt)}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => useGlobe.getState().select(null)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {isLiveLayer && !live && (
          <div className="border-b border-warn/40 bg-warn/10 px-3 py-1 text-[9px] tracking-widest text-warn">
            MISSION CLOCK NOT LIVE · SHOWING LAST KNOWN POSITION
          </div>
        )}

        {p.imageUrl && <CameraStill key={p.imageUrl} url={p.imageUrl} name={p.name} />}

        <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 px-3 py-2 text-[11px]">
          {lonlat && (
            <>
              <dt className="hud-label">Position</dt>
              <dd className="tabular-nums">{formatLatLon(lonlat[1], lonlat[0])}</dd>
            </>
          )}
          {(p.altitude != null || (lonlat && lonlat[2] > 1)) && (
            <>
              <dt className="hud-label">Altitude</dt>
              <dd className="tabular-nums">{formatAltitude(lonlat ? lonlat[2] : p.altitude)}</dd>
            </>
          )}
          {p.speed != null && (
            <>
              <dt className="hud-label">Speed</dt>
              <dd className="tabular-nums">{formatSpeed(p.speed)}</dd>
            </>
          )}
          {p.heading != null && (
            <>
              <dt className="hud-label">Heading</dt>
              <dd className="tabular-nums">{Math.round(p.heading)}°</dd>
            </>
          )}
          {details.map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </dl>

        <div className="flex gap-1 border-t border-border p-2">
          <button
            type="button"
            onClick={() => (following ? stopFollowing() : startFollowing())}
            className={`flex flex-1 items-center justify-center gap-2 border px-2 py-1.5 text-[10px] uppercase tracking-widest ${
              following
                ? "border-warn/60 bg-warn/15 text-warn"
                : "border-border text-foreground/80 hover:bg-accent hover:text-primary"
            }`}
          >
            <LocateFixed className="size-3.5" />
            {following ? "Following" : "Follow"}
          </button>
          <button
            type="button"
            onClick={() => flyToSelection(selected)}
            className="flex flex-1 items-center justify-center gap-2 border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest text-foreground/80 hover:bg-accent hover:text-primary"
          >
            <Crosshair className="size-3.5" />
            Fly to
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string | number | boolean | null | undefined }) {
  const text = typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  const isUrl = typeof v === "string" && /^https?:\/\//.test(v);
  return (
    <>
      <dt className="hud-label truncate" title={k}>
        {k}
      </dt>
      <dd className="break-words">
        {isUrl ? (
          <a href={v as string} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
            {text.replace(/^https?:\/\//, "").slice(0, 40)}
          </a>
        ) : (
          text
        )}
      </dd>
    </>
  );
}

function CameraStill({ url, name }: { url: string; name: string }) {
  // Keyed by url by the parent, so a new camera mounts fresh state.
  const [stamp, setStamp] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStamp(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const src = `${url}${url.includes("?") ? "&" : "?"}t=${stamp}`;
  return (
    <div className="relative border-b border-border bg-black/60">
      {failed ? (
        <div className="grid h-[150px] place-items-center text-[10px] text-muted-foreground">feed unavailable</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Public camera: ${name}`}
          className="block max-h-[200px] w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
      <div className="absolute left-2 top-2 flex items-center gap-1 text-[9px] tracking-widest text-alert">
        <span className="hud-dot blink" /> PUBLIC FEED
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] text-white/60">
        {new Date(stamp).toISOString().slice(11, 19)}Z
      </div>
    </div>
  );
}
