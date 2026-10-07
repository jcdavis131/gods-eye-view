// The studio's map inset and its "Open in the Atlas" link.
//
// The inset is a flat Web Mercator picture built from the same keyless Esri
// World Imagery tiles the globe draws (lib/globe/imagery.ts), laid out with
// plain <img> tags: no Cesium on the news page, no WebGL, and no origin the
// Content Security Policy does not already allow. The two constants are
// copied here because lib/globe/imagery.ts imports Cesium; a test keeps
// them equal.
//
// The link opens the full globe at the same spot with the layer that drew
// the story switched on, in the permalink format lib/globe/share.ts reads.
//
// Pure.

import type { Fact, FactKind, FactPlace } from "./facts";

export const ESRI_IMAGERY_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_IMAGERY_CREDIT = "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const TILE_PX = 256;
const MAX_LAT = 85.05112878;

/** A point's pixel position in the Web Mercator world at zoom `z`. */
export function worldPx(lon: number, lat: number, z: number): { x: number; y: number } {
  const size = TILE_PX * 2 ** z;
  const la = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const x = ((lon + 180) / 360) * size;
  const y = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * size;
  return { x, y };
}

export interface Tile {
  key: string;
  url: string;
  /** Position of the tile's top-left corner in the view, px. */
  left: number;
  top: number;
}

/** The tiles that cover a `width` x `height` view centred on (lon, lat) at zoom `z`, wrapping across the antimeridian. */
export function tilesFor(lon: number, lat: number, z: number, width: number, height: number): Tile[] {
  const n = 2 ** z;
  const c = worldPx(lon, lat, z);
  const x0 = c.x - width / 2;
  const y0 = c.y - height / 2;
  const out: Tile[] = [];
  for (let ty = Math.floor(y0 / TILE_PX); ty * TILE_PX < y0 + height; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(x0 / TILE_PX); tx * TILE_PX < x0 + width; tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({
        key: `${z}/${ty}/${tx}`,
        url: ESRI_IMAGERY_URL.replace("{z}", String(z)).replace("{y}", String(ty)).replace("{x}", String(wx)),
        left: Math.round(tx * TILE_PX - x0),
        top: Math.round(ty * TILE_PX - y0),
      });
    }
  }
  return out;
}

/** Where the inset looks for a fact kind, and the globe layer that draws it. */
const FRAMING: Partial<Record<FactKind, { zoom: number; heightM: number; layer: string }>> = {
  quake: { zoom: 5, heightM: 900_000, layer: "earthquakes" },
  alert: { zoom: 6, heightM: 600_000, layer: "alerts" },
  wildfire: { zoom: 8, heightM: 150_000, layer: "wildfire" },
  launch: { zoom: 7, heightM: 300_000, layer: "launches" },
  weather: { zoom: 5, heightM: 900_000, layer: "weather" },
};

/** The world view, for a segment with no place on the map. */
export const WORLD_VIEW = { lon: 0, lat: 20, zoom: 1 } as const;

export interface InsetView {
  /** The place shown, or null for the world view. */
  place: FactPlace | null;
  kind: FactKind | null;
  lon: number;
  lat: number;
  zoom: number;
  /** The globe permalink for this view. */
  href: string;
}

/** The inset's view for the first fact in `facts` that has a place; the world view when none has. */
export function insetView(facts: Array<Pick<Fact, "kind" | "place">>): InsetView {
  for (const f of facts) {
    if (!f.place) continue;
    const fr = FRAMING[f.kind] ?? { zoom: 5, heightM: 900_000, layer: undefined };
    return {
      place: f.place,
      kind: f.kind,
      lon: f.place.lon,
      lat: f.place.lat,
      zoom: fr.zoom,
      href: atlasPermalink({ lat: f.place.lat, lon: f.place.lon, h: fr.heightM, layers: fr.layer ? [fr.layer] : undefined }),
    };
  }
  return { place: null, kind: null, lon: WORLD_VIEW.lon, lat: WORLD_VIEW.lat, zoom: WORLD_VIEW.zoom, href: "/" };
}

/**
 * A globe permalink in lib/globe/share.ts's format: `/?lat=&lon=&h=&layers=`.
 * Latitude and longitude to 4 decimals and the height in whole metres, as
 * shareQuery writes them.
 */
export function atlasPermalink(v: { lat: number; lon: number; h?: number; layers?: string[] }): string {
  const q = new URLSearchParams();
  q.set("lat", v.lat.toFixed(4));
  q.set("lon", v.lon.toFixed(4));
  if (v.h != null) q.set("h", String(Math.round(v.h)));
  if (v.layers?.length) q.set("layers", v.layers.join(","));
  return `/?${q.toString()}`;
}
