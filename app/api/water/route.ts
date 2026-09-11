// Water API. One route, several ops, every upstream keyless, CORS open, so
// anyone can call it from a notebook, a script or their own page:
//
//   /api/water?op=gauges&bbox=w,s,e,n   USGS latest-continuous (flow, stage,
//                                       temperature, DO, conductance, pH,
//                                       turbidity, reservoir elevation/storage)
//                                       joined with monitoring-locations for names.
//   /api/water?op=nwps&bbox=w,s,e,n     NOAA NWPS gauges with flood categories.
//   /api/water?op=twdb                  Texas Water Development Board reservoirs.
//   /api/water?op=wells&bbox=w,s,e,n    USGS latest-daily groundwater levels
//                                       (72019 depth to water, 62610/62611
//                                       water-level elevation) joined with
//                                       aquifer names.
//   /api/water?op=drought               US Drought Monitor current polygons
//                                       (simplified, via the USDM ArcGIS service).
//   /api/water?op=history&site=..&param=..            USGS daily values, 365 d.
//   /api/water?op=matchup&site=..&param=..&from=..&to=..  USGS instantaneous values.
//   /api/water?op=report&lon=..&lat=..  The community water report for a point,
//                                       built server-side from the ops above
//                                       (no satellite turbidity: that needs a
//                                       browser).
//
// The USGS API has no documented keyless quota but does throttle; every bbox
// is snapped to a coarse grid so a panning browser reuses the cache, the
// polite() gate keeps concurrent tabs from stampeding one upstream, and
// Cache-Control lets Vercel's edge absorb repeat callers.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError, polite, upstreamJson } from "@/lib/server/upstream";
import { bboxAround } from "@/lib/globe/geo";
import { buildDrought, buildGauges, buildReservoirs, buildWells, intersectsTexas, mergeFlood } from "@/lib/water/features";
import { buildWaterReport } from "@/lib/water/report";
import type { LayerFeature } from "@/lib/layers/types";

export const maxDuration = 60;

const USGS = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const GAUGE_PARAMS = "00060,00065,00010,00300,00095,00400,63680,00062,00054";
const WELL_PARAMS = "72019,62610,62611";
const MAX_SPAN_DEG = 4;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

interface UsgsRow {
  properties: {
    monitoring_location_id: string;
    parameter_code: string;
    statistic_id?: string;
    time: string;
    value: string | null;
    unit_of_measure: string;
    approval_status?: string;
    qualifier?: string | null;
  };
  geometry: { type: "Point"; coordinates: [number, number] } | null;
}

interface UsgsSite {
  properties: {
    id: string;
    monitoring_location_name?: string;
    site_type?: string;
    site_type_code?: string;
    county_name?: string;
    state_name?: string;
    altitude?: number | null;
    aquifer_code?: string | null;
    national_aquifer_code?: string | null;
    aquifer_type_code?: string | null;
    well_depth?: number | null;
    hole_depth?: number | null;
    drainage_area?: number | null;
  };
  geometry: { type: "Point"; coordinates: [number, number] } | null;
}

interface UsgsCollection<T> {
  features: T[];
  numberReturned?: number;
}

export interface GaugeReading {
  site: string;
  name?: string;
  siteType?: string;
  lon: number;
  lat: number;
  param: string;
  value: number;
  unit: string;
  time: string;
  approval?: string;
}

export interface WellReading extends GaugeReading {
  aquifer?: string;
  aquiferCode?: string;
  localAquifer?: string;
  wellDepthFt?: number;
}

type Bbox = [number, number, number, number];

function parseBbox(raw: string | null): Bbox | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  return snapBbox(v as Bbox);
}

/** Clamp to MAX_SPAN_DEG around the centre and snap outward to a 0.5 degree grid. */
function snapBbox(v: Bbox): Bbox {
  let [w, s, e, n] = v;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  w = Math.max(w, cx - MAX_SPAN_DEG / 2);
  e = Math.min(e, cx + MAX_SPAN_DEG / 2);
  s = Math.max(s, cy - MAX_SPAN_DEG / 2);
  n = Math.min(n, cy + MAX_SPAN_DEG / 2);
  const f = (x: number) => Math.floor(x * 2) / 2;
  const c = (x: number) => Math.ceil(x * 2) / 2;
  return [f(w), f(s), c(e), c(n)];
}

async function usgs<T>(collection: string, params: Record<string, string>): Promise<UsgsCollection<T>> {
  const qs = new URLSearchParams({ f: "json", limit: "5000", ...params });
  return polite("usgs-water", 400, 30_000, () =>
    upstreamJson<UsgsCollection<T>>("usgs-water", USGS + "/" + collection + "/items?" + qs.toString(), {
      timeoutMs: 40_000,
    }),
  );
}

async function sitesFor(bbox: string): Promise<Map<string, UsgsSite["properties"]>> {
  const r = await cached("usgs:sites:" + bbox, 6 * 3600_000, () => usgs<UsgsSite>("monitoring-locations", { bbox }));
  const m = new Map<string, UsgsSite["properties"]>();
  for (const s of r.value.features) m.set(s.properties.id, s.properties);
  return m;
}

function rows(features: UsgsRow[], sites: Map<string, UsgsSite["properties"]>): GaugeReading[] {
  const out: GaugeReading[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!f.geometry || p.value == null) continue;
    const value = Number(p.value);
    if (!Number.isFinite(value)) continue;
    const site = sites.get(p.monitoring_location_id);
    out.push({
      site: p.monitoring_location_id,
      name: site?.monitoring_location_name,
      siteType: site?.site_type,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      param: p.parameter_code,
      value,
      unit: p.unit_of_measure,
      time: p.time,
      approval: p.approval_status,
    });
  }
  return out;
}

let aquiferNames: Promise<Map<string, string>> | null = null;
function aquiferLookup(): Promise<Map<string, string>> {
  if (!aquiferNames) {
    aquiferNames = usgs<{ properties: { id: string; national_aquifer_name: string } }>("national-aquifer-codes", {})
      .then((r) => new Map(r.features.map((f) => [f.properties.id, f.properties.national_aquifer_name])))
      .catch((err) => {
        aquiferNames = null;
        throw err;
      });
  }
  return aquiferNames;
}

interface NwpsGauge {
  lid: string;
  name: string;
  latitude: number;
  longitude: number;
  state?: { abbreviation: string };
  status?: {
    observed?: {
      primary: number;
      primaryUnit: string;
      secondary: number;
      secondaryUnit: string;
      floodCategory: string;
      validTime: string;
    };
    forecast?: { primary: number; primaryUnit: string; floodCategory: string; validTime: string };
  };
}

interface TwdbReservoir {
  short_name: string;
  full_name: string;
  percent_full: number | null;
  conservation_capacity: number | null;
  conservation_storage: number | null;
  elevation: number | null;
  conservation_pool_elevation: number | null;
  gauge_location?: { coordinates: [number, number] } | null;
  timestamp?: string;
  tags?: string[];
}

const SITE_RE = /^USGS-\w+$/;
const PARAM_RE = /^\d{5}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// ---- op implementations (each returns data + meta + a TTL for the edge cache)

interface OpResult {
  data: unknown;
  meta: Record<string, unknown>;
  ttlS: number;
}

async function opGauges(bbox: Bbox, param?: string | null): Promise<OpResult> {
  const key = bbox.join(",");
  const params = param && /^[\d,]+$/.test(param) ? param : GAUGE_PARAMS;
  const r = await cached("usgs:gauges:" + key + ":" + params, 5 * 60_000, async () => {
    const [latest, sites] = await Promise.all([usgs<UsgsRow>("latest-continuous", { bbox: key, parameter_code: params }), sitesFor(key)]);
    return { readings: rows(latest.features, sites), returned: latest.numberReturned ?? latest.features.length };
  });
  return { data: r.value.readings, meta: { source: "usgs", bbox, cacheAge: r.age, returned: r.value.returned }, ttlS: 300 };
}

async function opWells(bbox: Bbox): Promise<OpResult> {
  const key = bbox.join(",");
  const r = await cached("usgs:wells:" + key, 60 * 60_000, async () => {
    const [latest, sites, names] = await Promise.all([
      usgs<UsgsRow>("latest-daily", { bbox: key, parameter_code: WELL_PARAMS }),
      sitesFor(key),
      aquiferLookup().catch(() => new Map<string, string>()),
    ]);
    const base = rows(latest.features, sites);
    const readings: WellReading[] = base.map((g) => {
      const s = sites.get(g.site);
      const code = s?.national_aquifer_code ?? undefined;
      return {
        ...g,
        aquiferCode: code,
        aquifer: code ? names.get(code) : undefined,
        localAquifer: s?.aquifer_code ?? undefined,
        wellDepthFt: s?.well_depth ?? undefined,
      };
    });
    return { readings, returned: latest.numberReturned ?? latest.features.length };
  });
  return { data: r.value.readings, meta: { source: "usgs", bbox, cacheAge: r.age, returned: r.value.returned }, ttlS: 1800 };
}

async function opNwps(bbox: Bbox): Promise<OpResult> {
  const [w, s, e, n] = bbox;
  const r = await cached("nwps:" + bbox.join(","), 5 * 60_000, async () => {
    const url = `https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=${w}&bbox.ymin=${s}&bbox.xmax=${e}&bbox.ymax=${n}&srid=EPSG_4326`;
    const json = await polite("nwps", 300, 30_000, () => upstreamJson<{ gauges?: NwpsGauge[] }>("nwps", url, { timeoutMs: 30_000 }));
    return (json.gauges ?? []).map((g) => ({
      lid: g.lid,
      name: g.name,
      lat: g.latitude,
      lon: g.longitude,
      state: g.state?.abbreviation,
      observed: g.status?.observed,
      forecast: g.status?.forecast,
    }));
  });
  return { data: r.value, meta: { source: "nwps", bbox, cacheAge: r.age }, ttlS: 300 };
}

async function opTwdb(): Promise<OpResult> {
  const r = await cached("twdb:reservoirs", 30 * 60_000, async () => {
    const json = await upstreamJson<TwdbReservoir[] | Record<string, TwdbReservoir>>(
      "twdb",
      "https://www.waterdatafortexas.org/reservoirs/recent-conditions.json",
      { timeoutMs: 30_000 },
    );
    const list = Array.isArray(json) ? json : Object.values(json);
    return list
      .filter((x) => x.gauge_location?.coordinates)
      .map((x) => ({
        id: x.short_name,
        name: x.full_name,
        lon: x.gauge_location!.coordinates[0],
        lat: x.gauge_location!.coordinates[1],
        percentFull: x.percent_full,
        capacityAcFt: x.conservation_capacity,
        storageAcFt: x.conservation_storage,
        elevationFt: x.elevation,
        poolElevationFt: x.conservation_pool_elevation,
        date: x.timestamp,
        tags: (x.tags ?? []).filter((t) => /^(water_supply|municipal_|flood_control|monitored)/.test(t)),
      }));
  });
  return { data: r.value, meta: { source: "twdb", cacheAge: r.age }, ttlS: 1800 };
}

async function opDrought(): Promise<OpResult> {
  const r = await cached("usdm:current", 6 * 3600_000, () =>
    upstreamJson<GeoJSON.FeatureCollection>(
      "usdm",
      "https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0/query?where=1%3D1&outFields=DM&outSR=4326&geometryPrecision=2&maxAllowableOffset=0.05&f=geojson",
      { timeoutMs: 40_000 },
    ),
  );
  return { data: r.value, meta: { source: "usdm", cacheAge: r.age }, ttlS: 3600 };
}

async function opHistory(site: string, param: string): Promise<OpResult> {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 86_400_000);
  const range = from.toISOString().slice(0, 10) + "/" + to.toISOString().slice(0, 10);
  const r = await cached("usgs:daily:" + site + ":" + param, 60 * 60_000, async () => {
    const j = await usgs<UsgsRow>("daily", { monitoring_location_id: site, parameter_code: param, datetime: range });
    return j.features
      .filter((f) => f.properties.value != null && (f.properties.statistic_id ?? "00003") === "00003")
      .map((f) => [f.properties.time, Number(f.properties.value)] as [string, number])
      .filter((x) => Number.isFinite(x[1]))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  });
  return { data: r.value, meta: { source: "usgs", site, param, range, cacheAge: r.age }, ttlS: 3600 };
}

async function opMatchup(site: string, param: string, from: string, to: string): Promise<OpResult> {
  const r = await cached("usgs:iv:" + site + ":" + param + ":" + from + ":" + to, 60 * 60_000, async () => {
    const j = await usgs<UsgsRow>("continuous", {
      monitoring_location_id: site,
      parameter_code: param,
      datetime: from + "/" + to,
      limit: "500",
    });
    return j.features
      .filter((f) => f.properties.value != null)
      .map((f) => [f.properties.time, Number(f.properties.value), f.properties.unit_of_measure] as [string, number, string]);
  });
  return { data: r.value, meta: { source: "usgs", site, param, cacheAge: r.age }, ttlS: 3600 };
}

/** The community water report, server-side: same builders and arithmetic as the globe, minus satellite turbidity. */
async function opReport(lon: number, lat: number, origin: string): Promise<OpResult> {
  const now = Date.now();
  const bbox = snapBbox(bboxAround(lat, lon, 160_000));
  const [gauges, nwps, twdb, wells, drought] = await Promise.all([
    opGauges(bbox).catch(() => null),
    opNwps(bbox).catch(() => null),
    intersectsTexas(bbox) ? opTwdb().catch(() => null) : Promise.resolve(null),
    opWells(bbox).catch(() => null),
    opDrought().catch(() => null),
  ]);
  const water: LayerFeature[] = [];
  const caveats = ["Server report: satellite turbidity is only computed in a browser, so that term is absent here."];
  if (gauges) {
    const g = buildGauges(gauges.data as GaugeReading[], now);
    water.push(...g);
    if (nwps) water.push(...mergeFlood(g, nwps.data as Parameters<typeof mergeFlood>[1]));
  } else caveats.push("USGS gauges did not answer.");
  if (twdb) {
    const [w, s, e, n] = bbox;
    water.push(
      ...buildReservoirs((twdb.data as Parameters<typeof buildReservoirs>[0]).filter((r) => r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n)),
    );
  }
  const groundwater: LayerFeature[] = [];
  if (drought) groundwater.push(...buildDrought(drought.data as GeoJSON.FeatureCollection));
  else caveats.push("US Drought Monitor did not answer.");
  if (wells) groundwater.push(...buildWells(wells.data as WellReading[], now));
  else caveats.push("USGS wells did not answer.");
  const report = buildWaterReport(
    lon,
    lat,
    {
      water,
      groundwater,
      turbidity: [],
      loaded: { water: !!gauges, groundwater: !!(drought || wells), turbidity: false },
      caveats,
    },
    now,
  );
  const globe = `${origin}/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&h=120000&layers=water,groundwater,turbidity&report=1`;
  return { data: report, meta: { source: "usgs+nwps+twdb+usdm", bbox, globe }, ttlS: 300 };
}

function respond(r: OpResult) {
  return NextResponse.json(
    { ...r.meta, data: r.data },
    {
      headers: {
        ...CORS,
        "cache-control": `public, max-age=0, s-maxage=${r.ttlS}, stale-while-revalidate=${r.ttlS}`,
      },
    },
  );
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "gauges": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await opGauges(b, q.get("param")));
      }
      case "wells": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await opWells(b));
      }
      case "nwps": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await opNwps(b));
      }
      case "twdb":
        return respond(await opTwdb());
      case "drought":
        return respond(await opDrought());
      case "history": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param)) return bad("site=USGS-xxxx and param=00060 required");
        return respond(await opHistory(site, param));
      }
      case "matchup": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        const from = q.get("from") ?? "";
        const to = q.get("to") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param) || !ISO_RE.test(from) || !ISO_RE.test(to)) {
          return bad("site, param, from, to (ISO Z) required");
        }
        return respond(await opMatchup(site, param, from, to));
      }
      case "report": {
        const lon = Number(q.get("lon"));
        const lat = Number(q.get("lat"));
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return bad("lon and lat required");
        }
        return respond(await opReport(lon, lat, req.nextUrl.origin));
      }
      default:
        return bad("unknown op: gauges | wells | nwps | twdb | drought | history | matchup | report");
    }
  } catch (err) {
    const res = jsonError(err);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}
