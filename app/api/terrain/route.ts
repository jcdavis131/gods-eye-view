// Terrain API: the pictures the terrain & land cover layers draw that no
// publisher caches as tiles, rendered once per Web Mercator tile and held at
// the edge, and the class or value under a point. CORS open, keyless.
//
//   /api/terrain?op=tile&product=slope&z=13&x=1855&y=3393
//        one 512 px PNG tile of: slope (USGS 3DEP "Slope Map", z 8-16),
//        contours (3DEP "Preset 2ft Contour Interval", z 13-17), landcover
//        (MRLC NLCD 2021 WMS, z 5-12), floodmap (FEMA NFHL layer 28 export,
//        z 14-17). The route builds the upstream request from the product and
//        the tile's EPSG:3857 box; it never takes a URL.
//   /api/terrain?op=point&product=firehazard|landcover|slope&lon=..&lat=..
//        the WHP 2023 class, the NLCD 2021 class, or the 3DEP slope in degrees
//        at a point, with the class table the service's own legend publishes
//   /api/terrain?op=wayback
//        Esri World Imagery Wayback's release index, [{release, date}] newest
//        first (2014-02-20 onward), held a day; tiles are never proxied
//   /api/terrain?op=topo&lon=..&lat=..
//        USGS historical topographic maps (HTMC, 1879-2006) at a point: the
//        edition years there with their scales, and each sheet's citation,
//        with its GeoPDF and GeoTIFF from USGS TNM where TNM lists the scan
//        (point snapped to 0.01 degrees, held 30 days; the collection is closed)
//   /api/terrain?op=products
//        the catalog: every terrain picture, direct or rendered here, with its
//        source, zoom range, class tables, caveats and the terrain tiles'
//        required attribution
//
// Tiles are cached a day in this process and for weeks at the edge (the data
// behind them changes on the scale of months to years); point answers a day.
// 3DEP sits behind CloudFront, whose IPv6 path reset connections in probing,
// so this route resolves IPv4 first (lib/server/net.ts).

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError, polite, UpstreamError, upstreamJson } from "@/lib/server/upstream";
import { badRequest, CORS, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4, retrying } from "@/lib/server/net";
import { provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import {
  DIRECT_SOURCES,
  NWI_RASTER_CAVEAT,
  RENDER_PRODUCTS,
  SLR_CAVEAT,
  SLR_FEET,
  SOIL_CAVEAT,
  TERRARIUM_ATTRIBUTION,
  WHP_CAVEAT,
  isRenderProduct,
} from "@/lib/terrain/products";
import { NLCD_CLASSES, NWI_RASTER_CLASSES, SLR_LEGEND, WHP_CLASSES } from "@/lib/terrain/classes";
import { validTile } from "@/lib/terrain/webmercator";
import { nlcdAt, renderTile, slopeAt, whpAt } from "@/lib/terrain/sources";
import { parseWaybackConfig, WAYBACK_ATTRIBUTION, WAYBACK_CAVEAT, WAYBACK_CONFIG, waybackTiles } from "@/lib/terrain/wayback";
import { arcgisRows } from "@/lib/server/arcgis";
import { HTMC, HTMC_ATTRIBUTION, HTMC_FIELDS, parseHtmcSheets, TNM_PRODUCTS, tnmFiles, TOPO_CAVEAT, topoTiles, topoYears, withTnmFiles, type TnmFiles } from "@/lib/terrain/topo";

export const maxDuration = 60;
export const OPTIONS = options;

preferIpv4();

const DAY = 24 * 3600_000;

/** An integer query parameter, or null (blank and "1.5" are not integers). */
function intParam(v: string | null): number | null {
  if (v == null || !/^\d{1,8}$/.test(v.trim())) return null;
  return Number(v.trim());
}

/** A finite number, or null; a missing or blank one is null, never 0. */
function numParam(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const TILE_HELP = "op=tile needs product=slope|contours|landcover|floodmap and integer z, x, y inside the product's zoom range, e.g. product=slope&z=13&x=1855&y=3393";

async function opTile(q: URLSearchParams): Promise<Response> {
  const product = q.get("product") ?? "";
  if (!isRenderProduct(product)) return badRequest(TILE_HELP);
  const p = RENDER_PRODUCTS[product];
  const z = intParam(q.get("z"));
  const x = intParam(q.get("x"));
  const y = intParam(q.get("y"));
  if (z == null || x == null || y == null || !validTile(z, x, y)) return badRequest(TILE_HELP);
  if (z < p.minZoom || z > p.maxZoom) return badRequest(`${product} is rendered at z ${p.minZoom}-${p.maxZoom}; asked for z ${z}`);
  const t = await renderTile(product, z, x, y);
  return new Response(t.body as unknown as BodyInit, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": t.contentType,
      // Browsers keep a day; the edge keeps the product's TTL and serves stale while it refreshes.
      "cache-control": `public, max-age=86400, s-maxage=${p.ttlS}, stale-while-revalidate=86400`,
      "x-terrain-source": source(p.source).name,
    },
  });
}

type PointProduct = "firehazard" | "landcover" | "slope";
const POINT_PRODUCTS: PointProduct[] = ["firehazard", "landcover", "slope"];
const POINT_HELP = "op=point needs product=firehazard|landcover|slope and lon, lat, e.g. product=landcover&lon=-98.4936&lat=29.4241";

async function opPoint(q: URLSearchParams): Promise<Response> {
  const product = q.get("product") as PointProduct;
  if (!POINT_PRODUCTS.includes(product)) return badRequest(POINT_HELP);
  const lon = numParam(q.get("lon"));
  const lat = numParam(q.get("lat"));
  if (lon == null || lat == null || Math.abs(lon) > 180 || Math.abs(lat) > 90) return badRequest(POINT_HELP);
  const x = Number(lon.toFixed(5));
  const y = Number(lat.toFixed(5));
  const key = `terrain-point:${product}:${x},${y}`;
  if (product === "slope") {
    const r = await cached(key, DAY, () => slopeAt(x, y));
    return ok(
      { lon: x, lat: y, product, degrees: r.value.degrees },
      {
        meta: { source: source("usgs-3dep").name, cacheAge: r.age },
        ttlS: 3600,
        provenance: [provenance(source("usgs-3dep"), { kind: "published", seriesId: "3DEPElevation ImageServer identify, raster function \"Slope Degrees\"", upstreamUrl: r.value.upstreamUrl, retrievedAt: new Date(Date.now() - r.age).toISOString() })],
        caveats: [
          r.value.degrees == null
            ? "3DEP returned no slope here (outside its coverage or NoData)."
            : "Slope in whole degrees as 3DEP's \"Slope Degrees\" function returns it at this point, from the best available bare-earth DEM (1 m lidar where flown).",
        ],
      },
    );
  }
  const whp = product === "firehazard";
  const r = await cached(key, DAY, () => (whp ? whpAt(x, y) : nlcdAt(x, y)));
  const src = source(whp ? "usfs-whp" : "mrlc-nlcd");
  return ok(
    { lon: x, lat: y, product, class: r.value.value, classes: whp ? WHP_CLASSES : NLCD_CLASSES },
    {
      meta: { source: src.name, cacheAge: r.age },
      ttlS: 3600,
      provenance: [
        provenance(src, {
          kind: "published",
          seriesId: whp ? "ImageServer identify (class code) + the service's /legend (labels)" : "WMS GetFeatureInfo PALETTE_INDEX (class code) + MRLC GetLegendGraphic (labels)",
          upstreamUrl: r.value.upstreamUrl,
          retrievedAt: new Date(Date.now() - r.age).toISOString(),
        }),
      ],
      caveats: [
        whp ? WHP_CAVEAT : "NLCD 2021, 30 m pixels, conterminous US: a class is what the pixel looked like to the classifier, not a land use or zoning designation.",
        ...(r.value.value == null ? [`${whp ? "WHP" : "NLCD"} has no class here (outside the conterminous US, NoData, or a code its legend does not list).`] : []),
      ],
    },
  );
}

/**
 * Esri World Imagery Wayback's release index: [{release, date}] newest first, held a day.
 * Metadata only: the route never takes a URL and never fetches or caches a tile (the
 * browser loads them from Esri; the item's licence rules out exporting tiles offline).
 */
async function opWayback(): Promise<Response> {
  const r = await cached("wayback-config", DAY, async () => {
    const j = await retrying(() => polite("esri-wayback", 500, 30_000, () => upstreamJson<unknown>("esri-wayback", WAYBACK_CONFIG, { timeoutMs: 20_000 })), 2);
    const releases = parseWaybackConfig(j);
    if (!releases.length) throw new UpstreamError("esri-wayback", 502, "esri-wayback: the release index listed no dated release");
    return releases;
  });
  const releases = r.value;
  return ok(
    { releases, newest: releases[0], oldest: releases[releases.length - 1], tiles: waybackTiles(0).replace("/tile/0/", "/tile/{release}/") },
    {
      meta: { source: source("esri-wayback").name, attribution: WAYBACK_ATTRIBUTION, cacheAge: r.age },
      ttlS: 3600,
      provenance: [
        provenance(source("esri-wayback"), {
          kind: "published",
          seriesId: "waybackconfig.json (release index)",
          upstreamUrl: WAYBACK_CONFIG,
          retrievedAt: new Date(Date.now() - r.age).toISOString(),
          notes: [`${releases.length} dated releases, ${releases[releases.length - 1].date} to ${releases[0].date}`],
        }),
      ],
      caveats: [WAYBACK_CAVEAT, "Tiles load from Esri directly; this route serves the release index only."],
    },
  );
}

const TOPO_HELP = "op=topo needs lon and lat, e.g. lon=-122.42&lat=37.77";
/** The HTMC is closed (nothing after 2006): a point's sheets do not change. */
const TOPO_TTL = 30 * DAY;

/** The years and sheets of the USGS historical topographic maps at a point (snapped to 0.01 degrees). */
async function opTopo(q: URLSearchParams): Promise<Response> {
  const lon = numParam(q.get("lon"));
  const lat = numParam(q.get("lat"));
  if (lon == null || lat == null || Math.abs(lon) > 180 || Math.abs(lat) > 90) return badRequest(TOPO_HELP);
  const x = Number((Math.round(lon * 100) / 100).toFixed(2));
  const y = Number((Math.round(lat * 100) / 100).toFixed(2));
  const htmcQuery = new URLSearchParams({
    where: "Category=1",
    geometry: `${x},${y}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: HTMC_FIELDS.join(","),
    returnGeometry: "false",
  });
  const tnmUrl = `${TNM_PRODUCTS}?${new URLSearchParams({ datasets: "Historical Topographic Maps", bbox: [Math.round(x * 1000) - 5, Math.round(y * 1000) - 5, Math.round(x * 1000) + 5, Math.round(y * 1000) + 5].map((v) => (v / 1000).toFixed(3)).join(","), max: "200", outputFormat: "JSON" })}`;
  const [sheetsR, tnmR] = await Promise.all([
    cached(`topo-sheets:${x},${y}`, TOPO_TTL, async () => {
      const rows = await arcgisRows("usgs-htmc", HTMC, Object.fromEntries(htmcQuery), { gate: "usgs-htmc", minIntervalMs: 200, timeoutMs: 20_000, tries: 2 });
      return parseHtmcSheets({ features: rows.map((attributes) => ({ attributes })) });
    }),
    // TNM only adds the download links; its failure never fails the op.
    cached(`topo-tnm:${x},${y}`, TOPO_TTL, async () => {
      const j = await retrying(() => polite("usgs-tnm", 300, 30_000, () => upstreamJson<unknown>("usgs-tnm", tnmUrl, { timeoutMs: 20_000 })), 2);
      return [...tnmFiles(j).entries()];
    }).catch(() => null),
  ]);
  const files: Map<number, TnmFiles> | null = tnmR ? new Map(tnmR.value) : null;
  const sheets = withTnmFiles(sheetsR.value, files);
  const years = topoYears(sheets);
  const caveats = [TOPO_CAVEAT];
  if (!sheets.length) caveats.push("No USGS topographic sheet in the collection covers this point (outside the United States, or open water off the coast).");
  if (!files) caveats.push("USGS TNM did not answer this time, so the sheets' GeoPDF and GeoTIFF links are missing (geopdf, geotiff: null); the sheets themselves are listed.");
  else if (sheets.some((s) => !s.geotiff)) caveats.push("A sheet with geotiff: null is one TNM did not list for this scan; it is not a sheet without a scan.");
  const prov = [
    provenance(source("usgs-htmc"), { kind: "published", seriesId: "USGS_Historical_Topographic_Maps ImageServer query (Category=1)", upstreamUrl: `${HTMC}/query`, retrievedAt: new Date(Date.now() - sheetsR.age).toISOString(), notes: [`point ${x},${y}`, `${sheets.length} sheets, ${years.length} edition years`] }),
  ];
  if (tnmR) prov.push(provenance(source("usgs-htmc"), { kind: "published", seriesId: "TNM Access products, Historical Topographic Maps (GeoPDF, GeoTIFF)", upstreamUrl: tnmUrl, retrievedAt: new Date(Date.now() - tnmR.age).toISOString() }));
  return ok(
    { lon: x, lat: y, years, sheets, tiles: topoTiles(0).replace("DateCurrent%3D0", "DateCurrent%3D{year}") },
    { meta: { source: source("usgs-htmc").name, attribution: HTMC_ATTRIBUTION, cacheAge: sheetsR.age }, ttlS: files ? 86400 : 600, provenance: prov, caveats },
  );
}

function opProducts(): Response {
  const rendered = Object.values(RENDER_PRODUCTS).map((p) => ({
    id: p.id,
    title: p.title,
    delivery: "route",
    tile: `/api/terrain?op=tile&product=${p.id}&z={z}&x={x}&y={y}`,
    tileSize: p.tileSize,
    minZoom: p.minZoom,
    maxZoom: p.maxZoom,
    edgeCacheS: p.ttlS,
    source: source(p.source),
    caveat: p.caveat,
  }));
  const direct = DIRECT_SOURCES.map((d) => ({ id: d.id, title: d.title, delivery: "direct", tile: d.template, host: d.host, maxZoom: d.maxZoom, source: source(d.source), note: d.note }));
  return ok(
    {
      products: [...rendered, ...direct],
      classes: { firehazard: WHP_CLASSES, landcover: NLCD_CLASSES, sealevel: SLR_LEGEND, wetlands: NWI_RASTER_CLASSES },
      sealevelFeet: SLR_FEET,
      caveats: { firehazard: WHP_CAVEAT, sealevel: SLR_CAVEAT, soils: SOIL_CAVEAT, wetlands: NWI_RASTER_CAVEAT },
      terrainAttribution: TERRARIUM_ATTRIBUTION,
    },
    { ttlS: 3600, provenance: [], caveats: ["The catalog of terrain pictures; each product's own source and caveat is on it."] },
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "tile":
        return await opTile(q);
      case "point":
        return await opPoint(q);
      case "products":
        return opProducts();
      case "wayback":
        return await opWayback();
      case "topo":
        return await opTopo(q);
      default:
        return badRequest("unknown op: tile | point | products | wayback | topo");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
