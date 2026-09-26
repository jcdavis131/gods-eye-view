// Every picture the terrain & soil layers draw, in one catalog: where it comes
// from, which zoom levels exist, how it reaches the browser, and what it is
// not. Shared by the layer styles, /api/terrain (which renders the "route"
// products by their projected tile box and serves the catalog) and the README.
//
// Two ways a picture reaches the globe:
//   direct  the browser asks the publisher's own tile cache or map service
//           (USGS shaded relief, NRCS soils WMS, USFS WHP, NOAA sea level rise)
//   route   /api/terrain?op=tile renders it from a slow or flaky dynamic service
//           once and the edge keeps it (3DEP slope and contours, NLCD, FEMA),
//           so every viewer after the first costs the publisher nothing
//
// Pure data and URL builders: no Cesium, no fetch.

import { bboxParam } from "./webmercator";
import type { SourceId } from "@/lib/provenance/sources";

export const DEP_IMAGE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer";
export const RELIEF_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}";
export const SDM_WMS = "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms";
export const SDA_TABULAR = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";
export const WHP_IMAGE = "https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_RMRS_WildfireHazardPotentialClassified/ImageServer";
export const SLR_BASE = "https://coast.noaa.gov/arcgis/rest/services/dc_slr";
export const NLCD_WMS = "https://www.mrlc.gov/geoserver/mrlc_display/wms";
export const NLCD_LAYER = "NLCD_2021_Land_Cover_L48";
export const NFHL_MAP = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
export const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/**
 * WHP's classified render for one Web Mercator tile: an ImageServer exportImage asked for the
 * tile's projected box ({westProjected}… are the imagery provider's own tags), with the
 * service's classified raster function named explicitly.
 */
export const WHP_TEMPLATE = `${WHP_IMAGE}/exportImage?bbox={westProjected},{southProjected},{eastProjected},{northProjected}&bboxSR=3857&imageSR=3857&size=256,256&format=png&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: "WHP_CLS_2023_8bit" }))}&f=image`;

/** Deepest terrarium zoom published (about 4.8 m a pixel at the equator). */
export const TERRARIUM_MAX_ZOOM = 15;

// ---------------------------------------------------------------- route products

export type RenderProductId = "slope" | "contours" | "landcover" | "floodmap";

export interface RenderProduct {
  id: RenderProductId;
  title: string;
  source: SourceId;
  tileSize: 256 | 512;
  minZoom: number;
  maxZoom: number;
  /** Edge cache for a rendered tile, seconds. */
  ttlS: number;
  /** Politeness gate: one request start per `intervalMs` per upstream, per server instance. */
  gate: string;
  intervalMs: number;
  timeoutMs: number;
  /** The upstream request that renders tile x, y, z. */
  upstreamUrl: (x: number, y: number, z: number) => string;
  /** What the picture is not. */
  caveat: string;
}

const depRender = (fn: string) => (x: number, y: number, z: number) =>
  `${DEP_IMAGE}/exportImage?bbox=${bboxParam(x, y, z)}&bboxSR=3857&imageSR=3857&size=512,512&format=png&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: fn }))}&f=image`;

export const RENDER_PRODUCTS: Record<RenderProductId, RenderProduct> = {
  slope: {
    id: "slope",
    title: "Slope (USGS 3DEP \"Slope Map\")",
    source: "usgs-3dep",
    tileSize: 512,
    minZoom: 8,
    maxZoom: 16,
    ttlS: 30 * 86_400,
    gate: "usgs-3dep",
    intervalMs: 60,
    timeoutMs: 25_000,
    upstreamUrl: depRender("Slope Map"),
    caveat: "Rendered by USGS from the best available 3DEP bare-earth DEM (1 m lidar where flown, 1/3 arc-second elsewhere); USGS's own colour ramp, no legend values are published with it.",
  },
  contours: {
    id: "contours",
    title: "2 ft contours (USGS 3DEP \"Preset 2ft Contour Interval\")",
    source: "usgs-3dep",
    tileSize: 512,
    minZoom: 13,
    maxZoom: 17,
    ttlS: 30 * 86_400,
    gate: "usgs-3dep",
    intervalMs: 60,
    timeoutMs: 25_000,
    upstreamUrl: depRender("Preset 2ft Contour Interval"),
    caveat: "Lines drawn by USGS at a 2 ft interval from the 3DEP bare-earth DEM, unlabelled; where the DEM under them is 1/3 arc-second (about 10 m) rather than lidar, a 2 ft interval shows more detail than the data holds.",
  },
  landcover: {
    id: "landcover",
    title: "NLCD 2021 land cover (MRLC)",
    source: "mrlc-nlcd",
    tileSize: 512,
    minZoom: 5,
    maxZoom: 12,
    ttlS: 30 * 86_400,
    gate: "mrlc",
    intervalMs: 100,
    timeoutMs: 25_000,
    upstreamUrl: (x, y, z) =>
      `${NLCD_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${NLCD_LAYER}&STYLES=&CRS=EPSG:3857&BBOX=${bboxParam(x, y, z)}&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true`,
    caveat: "30 m pixels classified from 2021 Landsat imagery, conterminous United States only; a class is what the pixel looked like to the classifier, not a land-use or zoning designation.",
  },
  floodmap: {
    id: "floodmap",
    title: "FEMA flood hazard zones, FEMA's own map (NFHL layer 28)",
    source: "fema-nfhl",
    tileSize: 512,
    minZoom: 14,
    maxZoom: 17,
    ttlS: 7 * 86_400,
    gate: "fema-nfhl",
    intervalMs: 150,
    timeoutMs: 18_000,
    upstreamUrl: (x, y, z) =>
      `${NFHL_MAP}/export?bbox=${bboxParam(x, y, z)}&bboxSR=3857&imageSR=3857&size=512,512&layers=show:28&transparent=true&format=png32&dpi=96&f=image`,
    caveat: "FEMA's rendering of its regulatory flood map (FIRM), not a forecast; FEMA draws it only finer than about 1:36,000.",
  },
};

export function isRenderProduct(id: string): id is RenderProductId {
  return Object.prototype.hasOwnProperty.call(RENDER_PRODUCTS, id);
}

/** The canonical /api/terrain tile URL (fixed parameter order, so every viewer shares one edge cache entry). */
export function routeTileUrl(product: RenderProductId, z: number | string, x: number | string, y: number | string): string {
  return `/api/terrain?op=tile&product=${product}&z=${z}&x=${x}&y=${y}`;
}

// ---------------------------------------------------------------- direct sources

export interface DirectSource {
  id: "relief" | "soils" | "firehazard" | "sealevel" | "terrain";
  title: string;
  source: SourceId;
  /** Host the browser fetches from (CSP img-src / connect-src must allow it). */
  host: string;
  template: string;
  maxZoom: number;
  note: string;
}

export const DIRECT_SOURCES: DirectSource[] = [
  {
    id: "relief",
    title: "USGS Shaded Relief (The National Map tile cache)",
    source: "usgs-shaded-relief",
    host: "basemap.nationalmap.gov",
    template: RELIEF_TILES,
    maxZoom: 13,
    note: "Cached to level 13 (about 17 m a pixel at 30° N); closer than that the globe magnifies level 13.",
  },
  {
    id: "soils",
    title: "SSURGO soil map units (NRCS Soil Data Mart WMS, layer mapunitpoly)",
    source: "nrcs-ssurgo",
    host: "sdmdataaccess.sc.egov.usda.gov",
    template: `${SDM_WMS} (WMS 1.1.1 GetMap, LAYERS=mapunitpoly, SRS=EPSG:3857, 512 px, transparent PNG)`,
    maxZoom: 18,
    note: "The WMS draws map units only at fine scales (its ScaleHint), from about zoom 11.",
  },
  {
    id: "firehazard",
    title: "Wildfire Hazard Potential 2023, classified (USFS, ImageServer exportImage)",
    source: "usfs-whp",
    host: "imagery.geoplatform.gov",
    template: WHP_TEMPLATE,
    maxZoom: 11,
    note: "270 m pixels; beyond zoom 11 the globe magnifies them without smoothing.",
  },
  {
    id: "sealevel",
    title: "Sea level rise inundation (NOAA Office for Coastal Management tile caches, slr_Nft)",
    source: "noaa-slr",
    host: "coast.noaa.gov",
    template: `${SLR_BASE}/slr_{ft}ft/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 16,
    note: "One cache per scenario, 1 to 10 ft above MHHW; NOAA cached them to level 16.",
  },
  {
    id: "terrain",
    title: "AWS Terrain Tiles, terrarium encoding (Mapzen / Tilezen joerd)",
    source: "aws-terrain-tiles",
    host: "s3.amazonaws.com",
    template: TERRARIUM,
    maxZoom: TERRARIUM_MAX_ZOOM,
    note: "Heights decoded in the browser; the profile tool reads the same tiles.",
  },
];

/** Sea level rise scenarios offered (whole feet above MHHW; NOAA also publishes half feet). */
export const SLR_FEET = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const SLR_DEFAULT_FT = 3;

export function isSlrFeet(v: unknown): v is (typeof SLR_FEET)[number] {
  return typeof v === "number" && (SLR_FEET as readonly number[]).includes(v);
}

// ---------------------------------------------------------------- caveats (quoted where the publisher said it)

export const WHP_CAVEAT =
  "USFS: WHP is \"an index that quantifies the relative potential for high-intensity wildfire that may be difficult to manage\"; \"On its own, WHP is not an explicit map of wildfire threat or risk\" and it is \"not a forecast or wildfire outlook for any particular season\". 270 m pixels, landscape as of the end of 2020 (LANDFIRE 2020).";

export const SLR_CAVEAT =
  "NOAA: \"The viewer is a screening-level tool\"; the data \"illustrates the scale of potential flooding, not the exact location, and does not account for erosion, subsidence, or future construction\". Inundation is shown at the highest high tides (MHHW) plus the scenario's rise; a scenario, not a forecast of when.";

export const SOIL_CAVEAT =
  "A soil survey rating from NRCS SSURGO, never a price, a parcel score or a statement about any one field; map units are drawn at survey scale and can hold several soils.";

/** Terrarium's attribution, verbatim from tilezen/joerd docs/attribution.md ("Required attribution"). */
export const TERRARIUM_ATTRIBUTION = [
  "ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736",
  "Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017",
  "Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich",
  "Canada terrain data contains information licensed under the Open Government Licence – Canada",
  "Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers",
  "Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration",
  "Mexico terrain data source: INEGI, Continental relief, 2016",
  "New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)",
  "Norway terrain data © Kartverket",
  "United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved",
  "United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey",
];
