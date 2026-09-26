"use client";
// Keyless terrain (H2): AWS Terrain Tiles in the terrarium encoding, decoded in
// the browser. One tile cache feeds two things: the globe's 3D surface (a
// CustomHeightmapTerrainProvider) and the measure tool's elevation profile.
//
// The globe asks for Cesium's geographic tiles (two at level 0, so the poles
// are covered); each is filled with a 65 × 65 grid sampled bilinearly from the
// Web Mercator terrarium tiles under it, at the terrarium zoom equal to the
// geographic level (at most 15, about 4.8 m a pixel at the equator; deeper
// geographic levels sample zoom 15 more finely). Beyond ±85.05° the edge row
// of the Mercator square holds.
//
// Rendering rule: terrarium carries ETOPO1 bathymetry, so the sea floor is
// several kilometres below sea level, and ships and every layer drawn at 0 m
// would float over a drained ocean. The globe's surface therefore draws any
// height below 0 m at 0 m. It is a drawing rule only: the elevation profile and
// every number shown report the tile's own value, below zero included.
//
// Tiles are fetched with at most MAX_ACTIVE requests in flight; past twice
// that the terrain callback answers `undefined`, which tells Cesium to ask
// again later (it is a throttle, never "no data").

import type * as CesiumNS from "cesium";
import { getCesium } from "@/lib/globe/cesium";
import { TERRARIUM, TERRARIUM_MAX_ZOOM } from "./products";
import { bilinear, decodeTerrarium, lonLatToTile } from "./webmercator";
import type { HeightTile } from "./profile";

const SIZE = 256;
const GRID = 65;
const MAX_ACTIVE = 8;
const CACHE_MAX = 128;

const cache = new Map<string, HeightTile>();
const inflight = new Map<string, Promise<HeightTile>>();
const queue: Array<() => void> = [];
let active = 0;

function remember(key: string, t: HeightTile) {
  cache.delete(key);
  cache.set(key, t);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

function slot(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => {
    active++;
    resolve();
  }));
}

function release() {
  active--;
  const next = queue.shift();
  if (next) next();
}

/** Pixels of an image, colour-managed off so the encoded bytes survive decoding untouched. */
async function pixels(blob: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("no 2d canvas");
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  } finally {
    bmp.close();
  }
}

/** One decoded terrarium tile (heights in metres, north row first), cached. */
export function terrariumTile(z: number, x: number, y: number): Promise<HeightTile> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    return Promise.resolve(hit);
  }
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      await slot();
      try {
        const url = TERRARIUM.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`terrain tile ${key}: HTTP ${res.status}`);
        const rgba = await pixels(await res.blob());
        const t: HeightTile = { size: SIZE, heights: decodeTerrarium(rgba, SIZE, SIZE) };
        remember(key, t);
        return t;
      } finally {
        release();
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Tiles in flight or queued (the terrain callback throttles on it). */
export function terrariumBusy(): number {
  return inflight.size;
}

/** Heights for one geographic tile rectangle (degrees), GRID × GRID, north row first, below-zero drawn at zero. */
async function gridFor(west: number, south: number, east: number, north: number, level: number): Promise<Float32Array> {
  const z = Math.max(0, Math.min(TERRARIUM_MAX_ZOOM, level));
  const n = 2 ** z;
  const [fx0, fy0] = lonLatToTile(west, north, z);
  const [fx1, fy1] = lonLatToTile(east, south, z);
  const x0 = Math.max(0, Math.floor(fx0));
  const x1 = Math.min(n - 1, Math.floor(fx1 - 1e-9));
  const y0 = Math.max(0, Math.floor(fy0));
  const y1 = Math.min(n - 1, Math.floor(fy1 - 1e-9));
  const tiles = new Map<string, HeightTile>();
  const jobs: Promise<void>[] = [];
  for (let tx = x0; tx <= Math.max(x0, x1); tx++) {
    for (let ty = y0; ty <= Math.max(y0, y1); ty++) {
      jobs.push(terrariumTile(z, tx, ty).then((t) => void tiles.set(`${tx}/${ty}`, t)));
    }
  }
  await Promise.all(jobs);
  const out = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) {
    const lat = north - ((north - south) * j) / (GRID - 1);
    for (let i = 0; i < GRID; i++) {
      const lon = west + ((east - west) * i) / (GRID - 1);
      const [fx, fy] = lonLatToTile(lon, lat, z);
      const tx = Math.max(x0, Math.min(Math.max(x0, x1), Math.floor(fx)));
      const ty = Math.max(y0, Math.min(Math.max(y0, y1), Math.floor(fy)));
      const t = tiles.get(`${tx}/${ty}`)!;
      const h = bilinear(t.heights, t.size, t.size, (fx - tx) * t.size, (fy - ty) * t.size);
      out[j * GRID + i] = h > 0 ? h : 0;
    }
  }
  return out;
}

export const TERRAIN_CREDIT =
  "Terrain: AWS Terrain Tiles (Mapzen/Tilezen terrarium): USGS 3DEP, SRTM, GMTED2010, ETOPO1 and other sources (see About)";

/** The keyless terrain provider. */
export function createTerrariumTerrain(): CesiumNS.TerrainProvider {
  const C = getCesium();
  const scheme = new C.GeographicTilingScheme();
  return new C.CustomHeightmapTerrainProvider({
    width: GRID,
    height: GRID,
    tilingScheme: scheme,
    credit: new C.Credit(TERRAIN_CREDIT),
    callback: (x: number, y: number, level: number) => {
      if (terrariumBusy() > MAX_ACTIVE * 2) return undefined;
      const r = scheme.tileXYToRectangle(x, y, level);
      const d = C.Math.toDegrees;
      return gridFor(d(r.west), d(r.south), d(r.east), d(r.north), level);
    },
  });
}
