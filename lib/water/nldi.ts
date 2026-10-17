// Rivers and where the water goes: the USGS Network Linked Data Index (NLDI)
// on the medium-resolution NHDPlus Version 2 network, and EPA's NHDPlus V2.1
// attributes for the reach a point drains to. Pure: URL builders, parsers,
// sentinels and the basin simplifier; the route (/api/water?op=reach|trace)
// does the fetching.
//
//   reach   NLDI comid/position (the catchment containing the point) -> comid,
//           then EPA's NHDPlus V2.1 flowline layer by comid (lowercase field
//           names: uppercase answers 400). Both on the V2 network, so the reach
//           named is the reach a trace starts from. Worded "drains to", never
//           "this stream is": the catchment is what contains the point.
//   trace   one NLDI navigation per mode, always with an explicit distance
//           (the answer depends on it): down = main stem downstream (DM
//           flowlines), gauges = USGS stream gauges upstream (UT nwissite),
//           basin = the drainage basin polygon (NLDI's simplified one, cut
//           further here to BASIN_MAX_VERTICES).
//
// NHDPlus HR is not used (deferred, D-H1): its point query took 51 s and 18.6 s
// on two of five calls on 2026-10-16 and named a canal at the Boise River.

/** NLDI linked-data root (CORS *, keyless). */
export const NLDI = "https://api.water.usgs.gov/nldi/linked-data";
/** EPA NHDPlus V2.1 flowlines (Network Flowline), MapServer layer 2. */
export const EPA_V21 = "https://watersgeo.epa.gov/arcgis/rest/services/NHDPlus/NHDPlus/MapServer/2";
/** USGS NHD cached tiles (the picture). */
export const HYDRO_TILES = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}";
/** The service's own copyrightText (read 2026-10-16), used as the credit. */
export const HYDRO_ATTRIBUTION = "USGS The National Map: National Hydrography Dataset. Data refreshed September, 2026.";
/** The cache publishes levels 0-23 (24 LODs, read 2026-10-16); deeper than 16 adds nothing at globe scale. */
export const HYDRO_MAX_ZOOM = 16;

/** The fields asked of EPA's V2.1 flowline layer (named, never *). */
export const V21_FIELDS = ["comid", "gnis_name", "reachcode", "ftype", "fcode", "streamorder", "totdasqkm", "qa_ma", "qe_ma", "fdate", "lengthkm"] as const;

export type TraceMode = "down" | "gauges" | "basin";
export const TRACE_MODES: readonly TraceMode[] = ["down", "gauges", "basin"];
/** Default and largest distance asked of NLDI, km (the basin takes none). */
export const TRACE_DEFAULT_KM: Record<Exclude<TraceMode, "basin">, number> = { down: 100, gauges: 150 };
export const TRACE_MAX_KM = 500;
export const BASIN_MAX_VERTICES = 2000;

export const HYDRO_CAVEAT =
  "Streams drawn from the USGS National Hydrography Dataset. Trace and flow use the medium-resolution NHDPlus Version 2 network, so a small stream on the map may drain to a larger NHDPlus reach. Mean annual flow is a model estimate, not a measurement; measured flow is on the gauges.";

export const FLOW_CAVEAT =
  "Both flows are NHDPlus V2.1 model output in cubic feet per second: the EROM estimate adjusted to gauges (QE_MA) and the runoff-only estimate (QA_MA). They can differ several-fold; neither is a measurement.";

export function isTraceMode(v: unknown): v is TraceMode {
  return typeof v === "string" && (TRACE_MODES as readonly string[]).includes(v);
}

/** The distance to ask NLDI for, km: the default for the mode, clamped to 1..TRACE_MAX_KM. */
export function traceDistance(mode: Exclude<TraceMode, "basin">, raw: string | null): number {
  const n = raw == null || raw === "" ? NaN : Number(raw);
  const km = Number.isFinite(n) ? Math.round(n) : TRACE_DEFAULT_KM[mode];
  return Math.min(TRACE_MAX_KM, Math.max(1, km));
}

/** A point snapped to 0.001 degrees (about 100 m), the reach cache's grid. */
export function snapPoint(lon: number, lat: number): [number, number] {
  return [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000];
}

export function positionUrl(lon: number, lat: number): string {
  return `${NLDI}/comid/position?coords=${encodeURIComponent(`POINT(${lon} ${lat})`)}&f=json`;
}

export function traceUrl(comid: number, mode: TraceMode, distanceKm: number): string {
  if (mode === "basin") return `${NLDI}/comid/${comid}/basin?simplified=true&splitCatchment=false`;
  const nav = mode === "down" ? "DM/flowlines" : "UT/nwissite";
  return `${NLDI}/comid/${comid}/navigation/${nav}?distance=${distanceKm}&f=json`;
}

export function v21Params(comid: number): Record<string, string> {
  return { where: `comid=${comid}`, outFields: V21_FIELDS.join(","), returnGeometry: "false" };
}

/** NLDI position answer -> comid, or null when it holds none. */
export function parseComid(j: unknown): number | null {
  const f = (j as { features?: Array<{ properties?: { comid?: unknown; identifier?: unknown } }> } | null)?.features?.[0];
  const c = f?.properties?.comid ?? f?.properties?.identifier;
  const n = typeof c === "number" ? c : typeof c === "string" && /^\d+$/.test(c) ? Number(c) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** NHD FType codes NHDPlus V2 flowlines carry, as NHD names them. An unknown code is shown as its number, never guessed. */
export const FTYPE_WORDS: Readonly<Record<number, string>> = {
  334: "connector",
  336: "canal/ditch",
  420: "underground conduit",
  428: "pipeline",
  460: "stream/river",
  558: "artificial path",
  566: "coastline",
};

export function ftypeWord(ftype: number | null): string | null {
  if (ftype == null) return null;
  return FTYPE_WORDS[ftype] ?? `NHD FType ${ftype}`;
}

export interface Reach {
  comid: number;
  /** GNIS name of the reach, null when unnamed. */
  name: string | null;
  reachcode: string | null;
  ftype: number | null;
  /** NHD's word for the FType. */
  ftypeWord: string | null;
  /** Strahler order; null where NHDPlus assigns none (0 or -9 in the source). */
  streamOrder: number | null;
  /** Total upstream drainage area, km²; null where EPA publishes -9999. */
  drainageKm2: number | null;
  /** EROM mean annual flow adjusted to gauges (QE_MA), cfs; null where not published. */
  flowCfs: number | null;
  /** EROM runoff-only mean annual flow (QA_MA), cfs; null where not published. */
  runoffCfs: number | null;
  lengthKm: number | null;
  /** The flowline's NHD feature date, YYYY-MM-DD. */
  fdate: string | null;
}

/** A published non-negative number; NHDPlus's -9998 / -9999 sentinels, any negative, null and NaN are null. */
export function published(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/** EPA V2.1 rows (f=json) -> the reach for `comid`, or null when EPA has no row for it. */
export function parseV21(j: unknown, comid: number): Reach | null {
  const rows = (j as { features?: Array<{ attributes?: Record<string, unknown> }> } | null)?.features ?? [];
  const a = rows.map((r) => r.attributes ?? {}).find((x) => x.comid === comid);
  if (!a) return null;
  const ftype = typeof a.ftype === "number" && Number.isInteger(a.ftype) ? a.ftype : null;
  const order = typeof a.streamorder === "number" && Number.isInteger(a.streamorder) && a.streamorder > 0 ? a.streamorder : null;
  const fdate = typeof a.fdate === "number" && Number.isFinite(a.fdate) ? new Date(a.fdate).toISOString().slice(0, 10) : null;
  return {
    comid,
    name: text(a.gnis_name),
    reachcode: text(a.reachcode),
    ftype,
    ftypeWord: ftypeWord(ftype),
    streamOrder: order,
    drainageKm2: published(a.totdasqkm),
    flowCfs: published(a.qe_ma),
    runoffCfs: published(a.qa_ma),
    lengthKm: published(a.lengthkm),
    fdate,
  };
}

const NOT_PUBLISHED = "not published";

function cfs(v: number | null): string {
  return v == null ? NOT_PUBLISHED : `${v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)} cfs`;
}

/** The dossier lines for a reach, in reading order. */
export function reachDetails(r: Reach | null, comid: number | null): Record<string, string> {
  if (comid == null) return { "drains to": "no NHDPlus V2 reach here (outside the network: ocean, Great Lakes or outside the conterminous US)" };
  if (!r) return { "drains to": `NHDPlus V2 reach ${comid} (EPA's attributes did not answer: name, order, area and flow unknown)`, "nhdplus comid": String(comid) };
  return {
    "drains to": `${r.name ?? "an unnamed reach"} (NHDPlus V2 reach)`,
    "reach type": r.ftypeWord ?? NOT_PUBLISHED,
    "stream order": r.streamOrder == null ? NOT_PUBLISHED : String(r.streamOrder),
    "drainage area": r.drainageKm2 == null ? NOT_PUBLISHED : `${r.drainageKm2.toLocaleString("en-US", { maximumFractionDigits: 1 })} km²`,
    "modelled mean annual flow (EROM, gauge-adjusted)": cfs(r.flowCfs),
    "runoff-only estimate": cfs(r.runoffCfs),
    "flow note": "model output, not a measurement; measured flow is on the gauges",
    "nhdplus comid": String(r.comid),
    reachcode: r.reachcode ?? NOT_PUBLISHED,
    "nhd feature date": r.fdate ?? NOT_PUBLISHED,
  };
}

type Pos = number[];
type Ring = Pos[];

/** NLDI DM flowlines -> one MultiLineString of their coordinates (lon, lat) and how many came back. */
export function flowlines(j: unknown): { geometry: GeoJSON.MultiLineString; count: number } {
  const feats = (j as { features?: Array<{ geometry?: GeoJSON.Geometry | null }> } | null)?.features ?? [];
  const lines: Pos[][] = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g?.type === "LineString") lines.push(g.coordinates.map((p) => [p[0], p[1]]));
    else if (g?.type === "MultiLineString") for (const l of g.coordinates) lines.push(l.map((p) => [p[0], p[1]]));
  }
  return { geometry: { type: "MultiLineString", coordinates: lines }, count: feats.length };
}

export interface UpstreamGauge {
  /** "USGS-13186000", as NLDI identifies it. */
  identifier: string;
  /** "13186000": the site number the water layer's gauges carry after "USGS-". */
  siteNo: string;
  /** The station name as USGS publishes it. */
  name: string | null;
  lon: number;
  lat: number;
  comid: number | null;
  /** waterdata.usgs.gov page, as NLDI gives it. */
  uri: string | null;
}

/** NLDI UT nwissite -> gauges with a USGS- identifier and a point; each site once. */
export function upstreamGauges(j: unknown): UpstreamGauge[] {
  const feats = (j as { features?: Array<{ geometry?: GeoJSON.Geometry | null; properties?: Record<string, unknown> }> } | null)?.features ?? [];
  const seen = new Set<string>();
  const out: UpstreamGauge[] = [];
  for (const f of feats) {
    const p = f.properties ?? {};
    const id = text(p.identifier);
    const g = f.geometry;
    if (!id || !/^USGS-\d+$/.test(id) || g?.type !== "Point" || seen.has(id)) continue;
    seen.add(id);
    const uri = text(p.uri);
    out.push({
      identifier: id,
      siteNo: id.slice(5),
      name: text(p.name),
      lon: g.coordinates[0],
      lat: g.coordinates[1],
      comid: typeof p.comid === "number" ? p.comid : null,
      uri: uri && /^https:\/\//.test(uri) ? uri : null,
    });
  }
  return out;
}

/**
 * The upstream gauges the water layer is not already drawing: `drawn` holds the water
 * layer's gauge ids ("usgs:USGS-13206000") or bare site numbers; a match is by site number.
 */
export function newGauges(gauges: UpstreamGauge[], drawn: Iterable<string>): UpstreamGauge[] {
  const have = new Set<string>();
  for (const d of drawn) {
    const m = d.match(/^(?:usgs:USGS-|USGS-)?(\d{6,15})$/);
    if (m) have.add(m[1]);
  }
  return gauges.filter((g) => !have.has(g.siteNo));
}

function perpDist(p: Pos, a: Pos, b: Pos): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker on an open line (iterative, so a long ring cannot overflow the stack). */
function dp(line: Ring, tol: number): Ring {
  if (line.length < 3) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perpDist(line[k], line[i], line[j]);
      if (d > worst) {
        worst = d;
        at = k;
      }
    }
    if (at > 0 && worst > tol) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return line.filter((_, k) => keep[k]);
}

/** A closed ring simplified, kept closed and at least a triangle (else returned unchanged). */
function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length <= 4) return ring;
  const open = ring.slice(0, -1);
  const out = dp(open, tol);
  if (out.length < 3) return ring;
  out.push(out[0]);
  return out;
}

function polysOf(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

export function vertexCount(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  return polysOf(g).reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
}

/** Planar shoelace area in square degrees scaled by cos(latitude), for comparing a ring with its simplification. */
export function approxAreaKm2(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  let total = 0;
  for (const poly of polysOf(g)) {
    poly.forEach((ring, i) => {
      let a = 0;
      let lat = 0;
      for (let k = 0; k < ring.length - 1; k++) {
        a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
        lat += ring[k][1];
      }
      const kmPerDeg = 111.32;
      const c = Math.cos(((lat / Math.max(1, ring.length - 1)) * Math.PI) / 180);
      const km2 = (Math.abs(a) / 2) * kmPerDeg * kmPerDeg * c;
      total += i === 0 ? km2 : -km2;
    });
  }
  return total;
}

/**
 * NLDI basin -> its polygon with at most `max` vertices: as NLDI sent it when it already fits,
 * otherwise Douglas-Peucker at a tolerance doubled from 0.0005 degrees until it fits.
 */
export function basinPolygon(j: unknown, max = BASIN_MAX_VERTICES): { geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; vertices: number; sent: number; tolerance: number | null } | null {
  const g = (j as { features?: Array<{ geometry?: GeoJSON.Geometry | null }> } | null)?.features?.[0]?.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const sent = vertexCount(g);
  if (sent <= max) return { geometry: g, vertices: sent, sent, tolerance: null };
  let tol = 0.0005;
  for (let i = 0; i < 16; i++) {
    const polys = polysOf(g).map((p) => p.map((r) => simplifyRing(r, tol)));
    const out: GeoJSON.Polygon | GeoJSON.MultiPolygon = g.type === "Polygon" ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
    const n = vertexCount(out);
    if (n <= max) return { geometry: out, vertices: n, sent, tolerance: tol };
    tol *= 2;
  }
  return null;
}
