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
// Every response carries `provenance` (one record per upstream the values
// came from, with site, parameter codes and observation time where the call
// knew them) and `generatedAt`; the tabular ops (gauges, wells, nwps, twdb,
// history, matchup) also answer `format=csv` with the provenance as `#`
// footer lines. See docs/API.md.
//
// The USGS API has no documented keyless quota but does throttle; every bbox
// is snapped to a coarse grid so a panning browser reuses the cache, the
// polite() gate keeps concurrent tabs from stampeding one upstream, and
// Cache-Control lets Vercel's edge absorb repeat callers.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, csv as csvResponse, ok, options, parseFormat, withCors, type CsvRow, type ResponseFormat } from "@/lib/server/respond";
import type { Provenance } from "@/lib/provenance/types";
import { usgsProvenance } from "@/lib/water/provenance";
import { flattenGauges, flattenHistory, flattenMatchup, flattenNwps, flattenTwdb, flattenWells, GAUGE_COLUMNS, HISTORY_COLUMNS, MATCHUP_COLUMNS, NWPS_COLUMNS, TWDB_COLUMNS, WELL_COLUMNS } from "@/lib/water/flatten";
import {
  opDrought,
  opGauges,
  opNwps,
  opTwdb,
  opWells,
  retrievedAt,
  snapBbox,
  usgsItems,
  waterReportAt,
  type Bbox,
  type UsgsRow,
  type WaterOp,
} from "@/lib/water/assemble";

// The readings the layers and the flatteners type against are declared where
// they are produced; re-exported here because that is where they have always
// been imported from.
export type { GaugeReading, WellReading } from "@/lib/water/assemble";

export const maxDuration = 60;

function parseBbox(raw: string | null): Bbox | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  return snapBbox(v as Bbox);
}

const SITE_RE = /^USGS-\w+$/;
const PARAM_RE = /^\d{5}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// ---- op envelopes (each returns data + meta + a TTL for the edge cache). The
// upstream calls, their cache keys and the report assembly live in
// lib/water/assemble.ts so a page can use them without going through HTTP.

interface OpResult {
  data: unknown;
  meta: Record<string, unknown>;
  ttlS: number;
  /** One record per upstream the payload was read from. */
  provenance: Provenance[];
  caveats?: string[];
  /** Tabular ops: how to flatten `data` for `format=csv`. Absent means CSV is not offered for this op. */
  csv?: () => { rows: CsvRow[]; columns: readonly string[]; filename: string };
}

/** This route's envelope around an assembled upstream answer, plus the CSV flattener for the tabular ops. */
function envelope<T>(r: WaterOp<T>, csv?: OpResult["csv"]): OpResult {
  return { data: r.data, meta: r.meta, ttlS: r.ttlS, provenance: r.provenance, csv };
}

async function gaugesOp(bbox: Bbox, param?: string | null): Promise<OpResult> {
  const r = await opGauges(bbox, param);
  const key = bbox.join(",");
  return envelope(r, () => ({ rows: flattenGauges(r.data), columns: GAUGE_COLUMNS, filename: `water-gauges-${key.replace(/,/g, "_")}.csv` }));
}

async function wellsOp(bbox: Bbox): Promise<OpResult> {
  const r = await opWells(bbox);
  const key = bbox.join(",");
  return envelope(r, () => ({ rows: flattenWells(r.data), columns: WELL_COLUMNS, filename: `water-wells-${key.replace(/,/g, "_")}.csv` }));
}

async function nwpsOp(bbox: Bbox): Promise<OpResult> {
  const r = await opNwps(bbox);
  return envelope(r, () => ({ rows: flattenNwps(r.data), columns: NWPS_COLUMNS, filename: `water-nwps-${bbox.join("_")}.csv` }));
}

async function twdbOp(): Promise<OpResult> {
  const r = await opTwdb();
  return envelope(r, () => ({ rows: flattenTwdb(r.data), columns: TWDB_COLUMNS, filename: "water-twdb-reservoirs.csv" }));
}

async function droughtOp(): Promise<OpResult> {
  return envelope(await opDrought());
}

async function opHistory(site: string, param: string): Promise<OpResult> {
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 86_400_000);
  const range = from.toISOString().slice(0, 10) + "/" + to.toISOString().slice(0, 10);
  const r = await cached("usgs:daily:" + site + ":" + param, 60 * 60_000, async () => {
    const j = await usgsItems<UsgsRow>("daily", { monitoring_location_id: site, parameter_code: param, datetime: range });
    return j.features
      .filter((f) => f.properties.value != null && (f.properties.statistic_id ?? "00003") === "00003")
      .map((f) => [f.properties.time, Number(f.properties.value)] as [string, number])
      .filter((x) => Number.isFinite(x[1]))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  });
  return {
    data: r.value,
    meta: { source: "usgs", site, param, range, cacheAge: r.age },
    ttlS: 3600,
    provenance: [usgsProvenance({ collection: "daily", site, params: [param], period: range, retrievedAt: retrievedAt(r.age), notes: ["daily mean (statistic 00003)"] })],
    csv: () => ({ rows: flattenHistory(site, param, r.value), columns: HISTORY_COLUMNS, filename: `water-history-${site}-${param}.csv` }),
  };
}

async function opMatchup(site: string, param: string, from: string, to: string): Promise<OpResult> {
  const r = await cached("usgs:iv:" + site + ":" + param + ":" + from + ":" + to, 60 * 60_000, async () => {
    const j = await usgsItems<UsgsRow>("continuous", {
      monitoring_location_id: site,
      parameter_code: param,
      datetime: from + "/" + to,
      limit: "500",
    });
    return j.features
      .filter((f) => f.properties.value != null)
      .map((f) => [f.properties.time, Number(f.properties.value), f.properties.unit_of_measure] as [string, number, string]);
  });
  return {
    data: r.value,
    meta: { source: "usgs", site, param, cacheAge: r.age },
    ttlS: 3600,
    provenance: [usgsProvenance({ collection: "continuous", site, params: [param], period: `${from}/${to}`, retrievedAt: retrievedAt(r.age) })],
    csv: () => ({ rows: flattenMatchup(site, param, r.value), columns: MATCHUP_COLUMNS, filename: `water-matchup-${site}-${param}.csv` }),
  };
}

/** The community water report, server-side, plus the globe permalink that reproduces it in the browser. */
async function reportOp(lon: number, lat: number, origin: string): Promise<OpResult> {
  const a = await waterReportAt(lon, lat);
  const globe = `${origin}/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&h=120000&layers=water,groundwater,turbidity&report=1`;
  // Per-section provenance and citations live on the report; the envelope repeats the union.
  return { data: a.report, meta: { source: "usgs+nwps+twdb+usdm", bbox: a.bbox, globe }, ttlS: 300, provenance: a.report.provenance, caveats: a.report.caveats };
}

/** JSON envelope, or CSV when asked and the op is tabular. */
function respond(r: OpResult, format: ResponseFormat = "json", op = "") {
  if (format === "csv") {
    if (!r.csv) return badRequest(`format=csv is not offered for op=${op}; tabular ops are gauges, wells, nwps, twdb, history, matchup`);
    const t = r.csv();
    return csvResponse(t.rows, { columns: [...t.columns], filename: t.filename, provenance: r.provenance, caveats: r.caveats, ttlS: r.ttlS });
  }
  return ok(r.data, { meta: r.meta, provenance: r.provenance, caveats: r.caveats, ttlS: r.ttlS });
}

const bad = badRequest;

export const OPTIONS = options;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  const format = parseFormat(req);
  try {
    switch (op) {
      case "gauges": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        const param = q.get("param");
        if (param && !/^\d{5}(,\d{5})*$/.test(param)) return bad("param=00060 or a comma list of five-digit USGS parameter codes");
        return respond(await gaugesOp(b, param), format, op);
      }
      case "wells": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await wellsOp(b), format, op);
      }
      case "nwps": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await nwpsOp(b), format, op);
      }
      case "twdb":
        return respond(await twdbOp(), format, op);
      case "drought":
        return respond(await droughtOp(), format, op);
      case "history": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param)) return bad("site=USGS-xxxx and param=00060 required");
        return respond(await opHistory(site, param), format, op);
      }
      case "matchup": {
        const site = q.get("site") ?? "";
        const param = q.get("param") ?? "";
        const from = q.get("from") ?? "";
        const to = q.get("to") ?? "";
        if (!SITE_RE.test(site) || !PARAM_RE.test(param) || !ISO_RE.test(from) || !ISO_RE.test(to)) {
          return bad("site, param, from, to (ISO Z) required");
        }
        if (from >= to) return bad("from must be before to");
        return respond(await opMatchup(site, param, from, to), format, op);
      }
      case "report": {
        const lon = Number(q.get("lon"));
        const lat = Number(q.get("lat"));
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return bad("lon and lat required");
        }
        return respond(await reportOp(lon, lat, req.nextUrl.origin), format, op);
      }
      default:
        return bad("unknown op: gauges | wells | nwps | twdb | drought | history | matchup | report");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
