"use client";
// Tiled imagery for picture layers (the H1 hook on LayerStyle).
//
// A LayerStyle may return TileSpecs; the renderer turns each into a Cesium
// imagery layer on a Web Mercator tiling scheme:
//
//   xyz   a URL template: {z}/{x}/{y} caches (USGS relief, NOAA sea level rise),
//         this app's /api/terrain renders, or an ArcGIS ImageServer exportImage
//         asked for the tile's projected box through Cesium's own
//         {westProjected},{southProjected},{eastProjected},{northProjected} tags
//         (so a renderingRule, which Cesium's ArcGIS provider cannot pass, can)
//   wms   an OGC WMS GetMap (NRCS soils), EPSG:3857 boxes
//
// with an opacity the viewer can change, a camera-height gate (the renderer
// shows the layer only inside [minHeight, maxHeight]), a credit, a floor below
// which levels are drawn empty without a request (the service draws nothing
// there, and Cesium would otherwise ask for them from far tiles), nearest
// magnification for class rasters, and an "ink" pass for dark line art.
//
// Cesium clamps any level below a provider's `minimumLevel` UP to it, which
// from a tilted view means thousands of tiles; so `minimumLevel` is never set
// on the provider: the floor is handled here by answering a blank tile.

import type * as CesiumNS from "cesium";
import { getCesium } from "./cesium";
import { hexRgb, inkToTint } from "@/lib/terrain/webmercator";

export interface TileSpec {
  /** Identity: a spec with a new key replaces the layer's imagery. */
  key: string;
  kind: "xyz" | "wms";
  /** xyz: the URL template; wms: the service endpoint. */
  url: string;
  /** wms: LAYERS. */
  layers?: string;
  /** wms: extra GetMap parameters (format, transparent, version are set). */
  wmsParameters?: Record<string, string>;
  tileSize?: 256 | 512;
  /** Deepest level the source publishes; Cesium magnifies it beyond. */
  maximumLevel: number;
  /** Levels below this are drawn empty without asking the source. */
  floorLevel?: number;
  /** Only request inside [west, south, east, north] degrees. */
  rectangle?: [number, number, number, number];
  credit: string;
  /** Default opacity, 0..1 (the viewer's slider overrides it). */
  alpha: number;
  /** Camera-height gate in metres: drawn only while the camera is at or below maxHeight (and at or above minHeight). */
  maxHeight?: number;
  minHeight?: number;
  /** Class rasters (land cover, hazard classes): magnify without smoothing. */
  nearest?: boolean;
  /** Dark lines on a light opaque background -> these lines in this colour on transparent. */
  ink?: string;
  /** Stacking among picture layers; higher draws on top. */
  z: number;
}

export type TileHealth = { failing: false } | { failing: true; message: string };

/** Whether the camera height is inside a spec's gate. */
export function inHeightGate(spec: Pick<TileSpec, "minHeight" | "maxHeight">, height: number): boolean {
  if (spec.maxHeight != null && height > spec.maxHeight) return false;
  if (spec.minHeight != null && height < spec.minHeight) return false;
  return true;
}

let blank: HTMLCanvasElement | null = null;
function blankTile(): HTMLCanvasElement {
  if (!blank) {
    blank = document.createElement("canvas");
    blank.width = 1;
    blank.height = 1;
  }
  return blank;
}

type Img = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/**
 * Recolour line art. Cesium decodes imagery to an ImageBitmap already flipped
 * for upload (and WebGL ignores UNPACK_FLIP_Y for bitmaps), but flips a canvas
 * or an <img> as it uploads it; so a bitmap in comes back as a bitmap of the
 * same orientation, anything else as a canvas, and the tile is never upside down.
 */
async function inked(img: Img, rgb: [number, number, number]): Promise<Img> {
  const w = (img as { width: number }).width;
  const h = (img as { height: number }).height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return img;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  inkToTint(data.data, rgb);
  ctx.putImageData(data, 0, 0);
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) return createImageBitmap(c);
  return c;
}

type RequestImage = (x: number, y: number, level: number, request?: CesiumNS.Request) => Promise<unknown> | undefined;

/**
 * Build the imagery layer for a spec (not yet added to the globe). `health`
 * hears when tiles start failing (three failures with no success between) and
 * when one loads again.
 */
export function createTileLayer(spec: TileSpec, health?: (h: TileHealth) => void): CesiumNS.ImageryLayer {
  const C = getCesium();
  const tilingScheme = new C.WebMercatorTilingScheme();
  const size = spec.tileSize ?? 256;
  const rectangle = spec.rectangle ? C.Rectangle.fromDegrees(...spec.rectangle) : undefined;
  const credit = new C.Credit(spec.credit);
  const provider: CesiumNS.ImageryProvider =
    spec.kind === "wms"
      ? new C.WebMapServiceImageryProvider({
          url: spec.url,
          layers: spec.layers ?? "",
          parameters: { transparent: true, format: "image/png", ...(spec.wmsParameters ?? {}) },
          tilingScheme,
          tileWidth: size,
          tileHeight: size,
          maximumLevel: spec.maximumLevel,
          rectangle,
          credit,
          enablePickFeatures: false,
        })
      : new C.UrlTemplateImageryProvider({
          url: spec.url,
          tilingScheme,
          tileWidth: size,
          tileHeight: size,
          maximumLevel: spec.maximumLevel,
          rectangle,
          credit,
          enablePickFeatures: false,
        });

  const target = provider as unknown as { requestImage: RequestImage };
  const base: RequestImage = target.requestImage.bind(provider);
  const rgb = spec.ink ? hexRgb(spec.ink) : null;
  let fails = 0;
  let failing = false;
  target.requestImage = (x, y, level, request) => {
    if (spec.floorLevel != null && level < spec.floorLevel) return Promise.resolve(blankTile());
    const p = base(x, y, level, request);
    if (!p) return p;
    return p.then((img) => {
      fails = 0;
      if (failing) {
        failing = false;
        health?.({ failing: false });
      }
      return rgb && img ? inked(img as Img, rgb) : img;
    });
  };
  // With a listener attached Cesium stops writing each failed tile to the console; three
  // failures with no success between them is reported as the layer failing.
  provider.errorEvent.addEventListener((err: CesiumNS.TileProviderError) => {
    fails++;
    if (!failing && fails >= 3) {
      failing = true;
      const e = err?.error as { statusCode?: number; message?: string } | undefined;
      const why = e?.statusCode ? `HTTP ${e.statusCode}` : (err?.message ?? "tile request failed").slice(0, 80);
      health?.({ failing: true, message: `tiles failing: ${why}` });
    }
  });

  const layer = new C.ImageryLayer(provider, { alpha: spec.alpha });
  if (spec.nearest) layer.magnificationFilter = C.TextureMagnificationFilter.NEAREST;
  return layer;
}

/** Picture layers on the globe with their stacking order, so toggling order never changes what covers what. */
const stack: Array<{ layer: CesiumNS.ImageryLayer; z: number }> = [];

/** Add below every picture layer with a higher `z`, above the rest. */
export function addOrdered(viewer: CesiumNS.Viewer, layer: CesiumNS.ImageryLayer, z: number): void {
  const coll = viewer.imageryLayers;
  let index = coll.length;
  for (const e of stack) {
    if (e.z > z && coll.contains(e.layer)) index = Math.min(index, coll.indexOf(e.layer));
  }
  coll.add(layer, index);
  stack.push({ layer, z });
}

export function removeOrdered(viewer: CesiumNS.Viewer, layer: CesiumNS.ImageryLayer): void {
  const i = stack.findIndex((e) => e.layer === layer);
  if (i >= 0) stack.splice(i, 1);
  if (!viewer.isDestroyed() && viewer.imageryLayers.contains(layer)) viewer.imageryLayers.remove(layer, true);
}
