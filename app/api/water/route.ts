// Water proxies. One route, several ops, every upstream keyless:
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
//
// The USGS API has no documented keyless quota but does throttle; every bbox
// is snapped to a coarse grid so a panning browser reuses the cache, and the
// polite() gate keeps concurrent tabs from stampeding one upstream.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError, polite, proxied, upstreamJson } from "@/lib/server/upstream";

export const maxDuration = 60;

const USGS = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const GAUGE_PARAMS = "00060,00065,00010,00300,00095,00400,63680,00062,00054";
const WELL_PARAMS = "72019,62610,62611";
const MAX_SPAN_DEG = 4;

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

function parseBbox(raw: string | null): [number, number, number, number] | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  let [w, s, e, n] = v;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  w = Math.max(w, cx - MAX_SPAN_DEG / 2);
  e = Math.min(e, cx + MAX_SPAN_DEG / 2);
  s = Math.max(s, cy - MAX_SPAN_DEG / 2);
  n = Math.min(n, cy + MAX_SPAN_DEG / 2);
  // Snap outward to a 0.5 degree grid so nearby views share one cache entry.
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
  const r = await cached("usgs:sites:" + bbox, 6 * 3600_000, () =>
    usgs<UsgsSite>("monitoring-locations", { bbox }),
  );
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

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "gauges": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return Response.json({ error: "bbox=w,s,e,n required" }, { status: 400 });
        const bbox = b.join(",");
        const param = q.get("param");
        const params = param && /^[\d,]+$/.test(param) ? param : GAUGE_PARAMS;
        const r = await cached("usgs:gauges:" + bbox + ":" + params, 5 * 60_000, async () => {
          const [latest, sites] = await Promise.all([
            usgs<UsgsRow>("latest-continuous", { bbox, parameter_code: params }),
            sitesFor(bbox),
          ]);
          return { readings: rows(latest.features, sites), returned: latest.numberReturned ?? latest.features.length };
        });
        return proxied(r.value.readings, { source: "usgs", bbox: b, cacheAge: r.age, returned: r.value.returned });
      }
      case "wells": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return Response.json({ error: "bbox=w,s,e,n required" }, { status: 400 });
        const bbox = b.join(",");
        const r = await cached("usgs:wells:" + bbox, 60 * 60_000, async () => {
          const [latest, sites, names] = await Promise.all([
            usgs<UsgsRow>("latest-daily", { bbox, parameter_code: WELL_PARAMS }),
            sitesFor(bbox),
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
        return proxied(r.value.readings, { source: "usgs", bbox: b, cacheAge: r.age, returned: r.value.returned });
      }
      case "nwps": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return Response.json({ error: "bbox=w,s,e,n required" }, { status: 400 });
        const [w, s, e, n] = b;
        const r = await cached("nwps:" + b.join(","), 5 * 60_000, async () => {
          const url =
            "https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=" +
            w +
            "&bbox.ymin=" +
            s +
            "&bbox.xmax=" +
            e +
            "&bbox.ymax=" +
            n +
            "&srid=EPSG_4326";
          const json = await polite("nwps", 300, 30_000, () =>
            upstreamJson<{ gauges?: NwpsGauge[] }>("nwps", url, { timeoutMs: 30_000 }),
          );
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
        return proxied(r.value, { source: "nwps", bbox: b, cacheAge: r.age });
      }
      case "twdb": {
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
        return proxied(r.value, { source: "twdb", cacheAge: r.age });
      }
      case "drought": {
        const r = await cached("usdm:current", 6 * 3600_000, () =>
          upstreamJson<GeoJSON.FeatureCollection>(
            "usdm",
            "https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0/query?where=1%3D1&outFields=DM&outSR=4326&geometryPrecision=2&maxAllowableOffset=0.05&f=geojson",
            { timeoutMs: 40_000 },
          ),
        );
        return proxied(r.value, { source: "usdm", cacheAge: r.age });
      }
      case "history": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param)) {
          return Response.json({ error: "site=USGS-xxxx and param=00060 required" }, { status: 400 });
        }
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
        return proxied(r.value, { source: "usgs", site, param, range, cacheAge: r.age });
      }
      case "matchup": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        const from = q.get("from") ?? "";
        const to = q.get("to") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param) || !ISO_RE.test(from) || !ISO_RE.test(to)) {
          return Response.json({ error: "site, param, from, to (ISO Z) required" }, { status: 400 });
        }
        const r = await cached("usgs:iv:" + site + ":" + param + ":" + from + ":" + to, 60 * 60_000, async () => {
          const j = await usgs<UsgsRow>("continuous", {
            monitoring_location_id: site,
            parameter_code: param,
            datetime: from + "/" + to,
            limit: "500",
          });
          return j.features
            .filter((f) => f.properties.value != null)
            .map(
              (f) =>
                [f.properties.time, Number(f.properties.value), f.properties.unit_of_measure] as [string, number, string],
            );
        });
        return proxied(r.value, { source: "usgs", site, param, cacheAge: r.age });
      }
      default:
        return Response.json({ error: "unknown op" }, { status: 400 });
    }
  } catch (err) {
    return jsonError(err);
  }
}
