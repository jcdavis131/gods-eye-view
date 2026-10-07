"use client";
// The studio's map inset: a flat picture of the place a story is about, from
// the same keyless Esri World Imagery tiles the globe draws, that zooms in on
// each new place (a jump when reduced motion is asked for). A world picture
// sits underneath so the frame is never empty while tiles load. No Cesium,
// no WebGL. The "Open in the Atlas" link goes to the full globe at that spot.

import { useEffect, useRef, useState } from "react";
import { ESRI_IMAGERY_CREDIT, tilesFor, type InsetView } from "@/lib/news/mapInset";

/** The size the inset is drawn at before it has measured itself (its CSS box is 16:9). */
const DEFAULT_SIZE = { w: 320, h: 180 };

function TileLayer({ lon, lat, zoom, w, h, className }: { lon: number; lat: number; zoom: number; w: number; h: number; className?: string }) {
  return (
    <div className={`absolute inset-0 ${className ?? ""}`} aria-hidden="true">
      {tilesFor(lon, lat, zoom, w, h).map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- map tiles: 256 px pictures from a tile server, not content images
        <img key={t.key} src={t.url} alt="" width={256} height={256} decoding="async" draggable={false} className="absolute max-w-none select-none" style={{ left: t.left, top: t.top, width: 256, height: 256 }} />
      ))}
    </div>
  );
}

export function MapInset({ view, animate }: { view: InsetView; animate: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyed by the place, so a new place mounts a new layer and its zoom-in plays once.
  const key = `${view.lat.toFixed(3)},${view.lon.toFixed(3)},${view.zoom}`;
  const label = view.place ? view.place.name : "World view: this segment has no place on the map";
  return (
    <figure className="news-inset m-0 flex flex-col gap-1">
      <div ref={box} className="relative aspect-video w-full overflow-hidden border border-[var(--hairline)] bg-[#0a1118]" role="img" aria-label={`Map: ${label}`}>
        <TileLayer lon={view.lon} lat={view.lat} zoom={Math.min(2, view.zoom)} w={size.w} h={size.h} className="opacity-60" />
        {view.zoom > 2 && <TileLayer key={key} lon={view.lon} lat={view.lat} zoom={view.zoom} w={size.w} h={size.h} className={animate ? "news-fly" : undefined} />}
        {view.place && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--signal)] shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" aria-hidden="true" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-4">
          <p className="truncate text-[11px] leading-tight text-[var(--bright)]">{label}</p>
          <p className="truncate text-[9px] leading-tight text-white/70">{ESRI_IMAGERY_CREDIT}</p>
        </div>
      </div>
      <figcaption className="text-[11px]">
        <a href={view.href} className="text-primary underline underline-offset-4 hover:text-[var(--bright)]">
          Open in the Atlas
          <span className="sr-only">{view.place ? `: ${view.place.name}` : ": the globe"}</span> →
        </a>
      </figcaption>
    </figure>
  );
}
