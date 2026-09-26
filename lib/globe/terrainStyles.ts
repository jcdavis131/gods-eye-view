"use client";
// How the terrain, soil and land cover pictures are drawn: one TileSpec each
// (lib/globe/tiles.ts), with the source, zoom range, height gate, default
// opacity and stacking order. Where each picture comes from and what it is
// not lives in lib/terrain/products.ts.

import type { LayerStyle } from "./renderer";
import type { TileSpec } from "./tiles";
import {
  RELIEF_TILES,
  RENDER_PRODUCTS,
  SDM_WMS,
  SLR_BASE,
  SLR_DEFAULT_FT,
  WHP_TEMPLATE,
  isSlrFeet,
  routeTileUrl,
  type RenderProductId,
} from "@/lib/terrain/products";
import {
  CONTOURS_MAX_HEIGHT_M,
  CONUS,
  LANDCOVER_MAX_HEIGHT_M,
  SEALEVEL_MAX_HEIGHT_M,
  SLOPE_MAX_HEIGHT_M,
  SOILS_MAX_HEIGHT_M,
} from "@/lib/layers/terrain";
import { FLOOD_MAX_HEIGHT_M } from "@/lib/layers/flood";

/** Stacking among pictures, bottom to top: relief under everything, lines on top. */
export const TILE_Z = {
  relief: 10,
  landcover: 20,
  firehazard: 30,
  soils: 40,
  slope: 50,
  sealevel: 60,
  floodmap: 70,
  contours: 80,
} as const;

/** A picture /api/terrain renders (slope, contours, land cover, FEMA's flood map). */
export function routeSpec(product: RenderProductId, over: Partial<TileSpec> & Pick<TileSpec, "alpha" | "z" | "credit">): TileSpec {
  const p = RENDER_PRODUCTS[product];
  return {
    key: `route:${product}`,
    kind: "xyz",
    url: routeTileUrl(product, "{z}", "{x}", "{y}"),
    tileSize: p.tileSize,
    maximumLevel: p.maxZoom,
    floorLevel: p.minZoom,
    ...over,
  };
}

const picture = (color: string, tiles: LayerStyle["tiles"]): LayerStyle => ({ color, tiles });

// USGS's relief tiles are opaque JPEGs, almost white (probed means 244-252), so drawn as they come
// they lay a milky veil over the whole globe; `shade` keeps only the shading. Levels 9 and deeper
// are published only around the US, and level 9 has holes even there (all 404), hence `sparse`.
export const reliefStyle = picture("#C9CED6", () => [
  {
    key: "relief",
    kind: "xyz",
    url: RELIEF_TILES,
    maximumLevel: 13,
    shade: true,
    sparse: true,
    alpha: 0.8,
    z: TILE_Z.relief,
    credit: "Relief: USGS The National Map, 3DEP and GMTED2010",
  },
]);

export const slopeStyle = picture("#F2C14E", () => [
  routeSpec("slope", { alpha: 0.6, z: TILE_Z.slope, maxHeight: SLOPE_MAX_HEIGHT_M, credit: "Slope: USGS 3DEP" }),
]);

export const contoursStyle = picture("#E8D9A0", () => [
  routeSpec("contours", { alpha: 0.9, z: TILE_Z.contours, maxHeight: CONTOURS_MAX_HEIGHT_M, ink: "#F3E3A6", credit: "Contours: USGS 3DEP" }),
]);

export const soilsStyle = picture("#C98B4E", () => [
  {
    key: "soils",
    kind: "wms",
    url: SDM_WMS,
    layers: "mapunitpoly",
    wmsParameters: { version: "1.1.1", styles: "" },
    tileSize: 512,
    maximumLevel: 19,
    // The WMS draws map units only finer than its ScaleHint (about 88 m a pixel): 512 px tiles from level 10.
    floorLevel: 10,
    alpha: 0.9,
    z: TILE_Z.soils,
    maxHeight: SOILS_MAX_HEIGHT_M,
    credit: "Soils: USDA NRCS SSURGO",
  },
]);

export const firehazardStyle = picture("#FF7A3D", () => [
  {
    key: "firehazard",
    kind: "xyz",
    url: WHP_TEMPLATE,
    maximumLevel: 11,
    rectangle: CONUS,
    nearest: true,
    alpha: 0.65,
    z: TILE_Z.firehazard,
    credit: "Wildfire Hazard Potential 2023: USDA Forest Service",
  },
]);

export const landcoverStyle = picture("#7FB77E", () => [
  routeSpec("landcover", { alpha: 0.7, z: TILE_Z.landcover, rectangle: CONUS, nearest: true, maxHeight: LANDCOVER_MAX_HEIGHT_M, credit: "Land cover: MRLC NLCD 2021" }),
]);

export const sealevelStyle = picture("#4895E5", ({ meta }) => {
  const ft = isSlrFeet(meta?.seaLevelFt) ? meta.seaLevelFt : SLR_DEFAULT_FT;
  return [
    {
      key: `sealevel:${ft}`,
      kind: "xyz",
      url: `${SLR_BASE}/slr_${ft}ft/MapServer/tile/{z}/{y}/{x}`,
      maximumLevel: 16,
      // Cached only along US coasts: a 404 is "nothing here". The service's published fullExtent
      // is nearly worldwide (3 ft: 348° of longitude, 45.0° S to 78.4° N), so it bounds nothing.
      sparse: true,
      alpha: 0.75,
      z: TILE_Z.sealevel,
      maxHeight: SEALEVEL_MAX_HEIGHT_M,
      credit: `Sea level rise ${ft} ft: NOAA Office for Coastal Management`,
    },
  ];
});

/** FEMA's own map of the flood zones, drawn under the clickable zones of the Flood zones layer. */
export const FLOOD_PICTURE: TileSpec = routeSpec("floodmap", {
  alpha: 0.8,
  z: TILE_Z.floodmap,
  maxHeight: FLOOD_MAX_HEIGHT_M,
  credit: "Flood map: FEMA National Flood Hazard Layer",
});
