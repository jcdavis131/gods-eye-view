// Economy API: trade, commerce and real estate over public, keyless sources.
// CORS open and edge-cached like /api/water, so scripts and notebooks can use it.
//
//   /api/economy?op=areas&bbox=w,s,e,n        counties in the box joined with BLS QCEW
//                                             (jobs, wages) and Zillow (home values, rents)
//   /api/economy?op=areas&level=state         every state, same joins
//   /api/economy?op=sectors&fips=48029        private-sector NAICS mix for a county (or a
//                                             state: 48000), with location quotients
//   /api/economy?op=context&fips=48029        sector mix plus metro, state and US home values
//   /api/economy?op=msas                      every MSA: centroid, employment, most distinctive
//                                             occupation group (BLS OEWS, May 2025)
//   /api/economy?op=msa-jobs&msa=41700        occupation mix for one MSA: top 30 detailed
//                                             occupations + 22 major groups, wages, location quotients
//   /api/economy?op=ports&bbox=..&min=medium  World Port Index harbours in the box with BTS
//                                             Port Performance volumes where published
//   /api/economy?op=border                    every US land port of entry, 25 months of BTS counts
//   /api/economy?op=countries                 Natural Earth polygons joined with World Bank
//                                             GDP, exports, imports, trade/GDP, container TEU
//   /api/economy?op=partners&iso3=USA         top trading partners (WITS, latest year)
//   /api/economy?op=pulse                     national series: FRED + BTS freight indicators
//   /api/economy?op=report&lon=..&lat=..      the market report for a point, built server-side
//
// Bounding boxes are snapped outward to a one-degree grid so nearby callers
// share an entry; every upstream table is cached in memory for hours.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { bboxAround, haversine } from "@/lib/globe/geo";
import {
  buildAreas,
  buildCountries,
  buildCrossings,
  buildPorts,
  portSizeRank,
  type AreaJoins,
  type AreaLevel,
  type AreaPoly,
  type HomeValue,
  type PortStats,
  type WpiPort,
} from "@/lib/economy/features";
import {
  borderCrossings,
  btsIndicators,
  btsPortStats,
  COUNTRIES,
  fred,
  FRED_SERIES,
  metroRow,
  oewsMsaIndex,
  oewsMsaJobs,
  qcewLatest,
  qcewSectors,
  stateLookup,
  tigerCountyAt,
  tigerCounties,
  tigerStates,
  witsPartners,
  worldBank,
  WPI,
  zillow,
  type PulseItem,
  type TigerDetail,
} from "@/lib/economy/sources";
import { buildMarketReport } from "@/lib/economy/report";
import type { LayerFeature } from "@/lib/layers/types";

export const maxDuration = 60;

const MAX_SPAN_DEG = 18;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

type Bbox = [number, number, number, number];

function parseBbox(raw: string | null): Bbox | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  return snapBbox(v as Bbox);
}

/** Clamp to MAX_SPAN_DEG around the centre and snap outward to a 1 degree grid. */
function snapBbox(v: Bbox): Bbox {
  let [w, s, e, n] = v;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  w = Math.max(w, cx - MAX_SPAN_DEG / 2, -180);
  e = Math.min(e, cx + MAX_SPAN_DEG / 2, 180);
  s = Math.max(s, cy - MAX_SPAN_DEG / 2, -90);
  n = Math.min(n, cy + MAX_SPAN_DEG / 2, 90);
  return [Math.floor(w), Math.floor(s), Math.ceil(e), Math.ceil(n)];
}

interface OpResult {
  data: unknown;
  meta: Record<string, unknown>;
  ttlS: number;
}

/** Generalization by box size: fine polygons for a city, coarse for a region. */
function detailFor(b: Bbox): TigerDetail {
  const span = Math.max(b[2] - b[0], b[3] - b[1]);
  return span <= 2 ? "500K" : span <= 7 ? "5M" : "20M";
}

async function joinsFor(level: AreaLevel): Promise<{ joins: AreaJoins; sources: string[]; asOf: Record<string, string> }> {
  const sources: string[] = [];
  const asOf: Record<string, string> = {};
  const joins: AreaJoins = { jobs: new Map(), home: new Map(), rent: new Map(), stateNames: new Map() };
  const [q, h, r, states] = await Promise.all([
    qcewLatest().catch(() => null),
    zillow(level === "county" ? "zhviCounty" : "zhviState").catch(() => null),
    level === "county" ? zillow("zoriCounty").catch(() => null) : Promise.resolve(null),
    stateLookup().catch(() => null),
  ]);
  if (q) {
    sources.push("BLS QCEW");
    asOf.qcew = q.period;
    joins.jobs = level === "county" ? q.counties : q.states;
  }
  if (h) {
    sources.push("Zillow ZHVI");
    asOf.zhvi = h.asOf;
    if (level === "county") joins.home = h.rows;
    else if (states) {
      // The state file is keyed by name; TIGERweb gives us FIPS.
      for (const [fips, s] of states) {
        const row = h.byName.get(s.name);
        if (row) joins.home.set(fips, row);
      }
    }
  }
  if (r) {
    sources.push("Zillow ZORI");
    asOf.zori = r.asOf;
    joins.rent = r.rows;
  }
  if (states && level === "county") {
    for (const [fips, s] of states) joins.stateNames!.set(fips, s.name);
  }
  return { joins, sources, asOf };
}

/** County polygons carry only a state FIPS prefix; give them the USPS code for labels. */
async function withStusab(polys: AreaPoly[]): Promise<AreaPoly[]> {
  const states = await stateLookup().catch(() => null);
  if (!states) return polys;
  return polys.map((p) => (p.stusab ? p : { ...p, stusab: states.get(p.geoid.slice(0, 2))?.stusab }));
}

async function opAreas(level: AreaLevel, bbox: Bbox | null): Promise<OpResult> {
  const key = `areas:${level}:${bbox ? bbox.join(",") : "all"}`;
  const r = await cached(key, 6 * 3600_000, async () => {
    const polys = level === "state" ? await tigerStates() : await withStusab(await tigerCounties(bbox!, detailFor(bbox!)));
    const { joins, sources, asOf } = await joinsFor(level);
    // Neutral features carrying jobs, home and rent; each browser layer dresses its own copy.
    const features = buildAreas(polys, level, joins);
    return {
      features,
      sources,
      asOf,
      polygons: polys.length,
      detail: level === "state" ? "20M" : detailFor(bbox!),
    };
  });
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: { source: r.value.sources.join(" + ") + " + Census TIGERweb", asOf: r.value.asOf, level, bbox, polygons: r.value.polygons, detail: r.value.detail, cacheAge: r.age },
    ttlS: 3600,
  };
}

/** What a county dossier needs beyond the feature: sector mix and the metro / state / US home values. */
async function opContext(fips: string): Promise<OpResult> {
  const isState = fips.endsWith("000");
  const geoid = isState ? fips.slice(0, 2) : fips;
  const [sectors, county, metro, state, states] = await Promise.all([
    qcewSectors(fips).catch(() => null),
    isState ? Promise.resolve(null) : zillow("zhviCounty").catch(() => null),
    zillow("zhviMetro").catch(() => null),
    zillow("zhviState").catch(() => null),
    stateLookup().catch(() => null),
  ]);
  const home = county?.rows.get(geoid);
  const stateName = states?.get(geoid.slice(0, 2))?.name;
  const slim = (h: HomeValue | undefined | null) => (h ? { name: h.name, latest: h.latest, yoyPct: h.yoyPct, yearly: h.yearly } : null);
  return {
    data: {
      period: sectors?.period,
      sectors: sectors?.sectors ?? [],
      metroHome: home?.metro && metro ? slim(metroRow(metro, home.metro)) : null,
      stateHome: stateName ? slim(state?.byName.get(stateName)) : null,
      usHome: slim(metro?.rows.get("US")),
    },
    meta: { source: "BLS QCEW + Zillow ZHVI", fips },
    ttlS: 6 * 3600,
  };
}

async function opSectors(fips: string): Promise<OpResult> {
  const s = await qcewSectors(fips);
  return { data: s, meta: { source: "BLS QCEW", fips }, ttlS: 6 * 3600 };
}

/** Every MSA with its centroid, employment and most distinctive occupation group. Static for the vintage. */
async function opMsas(): Promise<OpResult> {
  const r = oewsMsaIndex();
  return {
    data: r,
    meta: { source: r.source, asOf: r.asOf, count: r.msas.length },
    ttlS: 24 * 3600,
  };
}

/** Occupation mix for one MSA: top 30 detailed occupations + the 22 major groups, with wages and location quotients. */
async function opMsaJobs(msa: string): Promise<OpResult> {
  const j = oewsMsaJobs(msa);
  if (!j) return { data: null, meta: { source: "BLS OEWS", msa, error: "unknown MSA code" }, ttlS: 3600 };
  return { data: j, meta: { source: j.source, asOf: j.asOf, msa }, ttlS: 24 * 3600 };
}

const SIZE_MIN: Record<string, number> = { large: 3, medium: 2, small: 1, all: 0 };

async function opPorts(bbox: Bbox, min: string): Promise<OpResult> {
  const minRank = SIZE_MIN[min] ?? 2;
  const key = `ports:${bbox.join(",")}:${minRank}`;
  const r = await cached(key, 6 * 3600_000, async () => {
    const [w, s, e, n] = bbox;
    const inBox = (p: WpiPort) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n;
    const stats = await btsPortStats().catch(() => null);
    const byWpi = stats?.byWpi ?? new Map<number, PortStats>();
    const ports = WPI.ports.filter((p) => inBox(p) && (portSizeRank(p) >= minRank || byWpi.has(p.id)));
    const extras = (stats?.extraPorts ?? []).filter((x) => inBox(x.port));
    const statMap = new Map(byWpi);
    for (const x of extras) statMap.set(x.port.id, x.stats);
    const features = buildPorts([...ports, ...extras.map((x) => x.port)], statMap);
    return { features, bts: !!stats, btsYear: stats?.year, withStats: features.filter((f) => (f.properties.extra as { stats?: unknown }).stats).length };
  });
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: {
      source: r.value.bts ? "NGA World Port Index + BTS Port Performance" : "NGA World Port Index",
      wpiPulled: WPI.pulled,
      btsYear: r.value.btsYear,
      withStats: r.value.withStats,
      bbox,
      min,
      cacheAge: r.age,
    },
    ttlS: 6 * 3600,
  };
}

async function opBorder(): Promise<OpResult> {
  const b = await borderCrossings();
  return { data: { type: "FeatureCollection", features: buildCrossings(b.rows) }, meta: { source: "BTS Border Crossing Entry Data", asOf: b.asOf, ports: b.rows.length }, ttlS: 6 * 3600 };
}

async function opCountries(): Promise<OpResult> {
  const r = await cached("countries", 12 * 3600_000, async () => {
    const wb = await worldBank();
    return { features: buildCountries(COUNTRIES.features, wb.stats), failed: wb.failed, withData: [...wb.stats.keys()].length };
  });
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: { source: "Natural Earth + World Bank WDI", nePulled: COUNTRIES.pulled, indicatorsFailed: r.value.failed, countriesWithData: r.value.withData, cacheAge: r.age },
    ttlS: 12 * 3600,
  };
}

async function opPartners(iso3: string): Promise<OpResult> {
  const p = await witsPartners(iso3);
  return { data: p, meta: { source: "World Bank WITS TradeStats", iso3, units: "US$ thousands" }, ttlS: 24 * 3600 };
}

async function opPulse(): Promise<OpResult> {
  const [fredItems, bts] = await Promise.all([Promise.allSettled(FRED_SERIES.map((s) => fred(s.id))), btsIndicators().catch(() => [] as PulseItem[])]);
  const items: PulseItem[] = [];
  const failed: string[] = [];
  fredItems.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) items.push(r.value);
    else failed.push(FRED_SERIES[i].id);
  });
  items.push(...bts);
  return { data: items, meta: { source: "FRED + BTS Supply Chain Indicators", failed, count: items.length }, ttlS: 1800 };
}

async function opReport(lon: number, lat: number, origin: string): Promise<OpResult> {
  const now = Date.now();
  const caveats: string[] = [];
  const county = await tigerCountyAt(lon, lat).catch(() => null);
  const areas: LayerFeature[] = [];
  let metroHome: HomeValue | null = null;
  let usHome: HomeValue | null = null;
  let sectors: Awaited<ReturnType<typeof qcewSectors>>["sectors"] = [];
  if (county) {
    const [{ joins }, metro] = await Promise.all([joinsFor("county"), zillow("zhviMetro").catch(() => null)]);
    const polys = await withStusab([county]);
    areas.push(...buildAreas(polys, "county", joins));
    const home = joins.home.get(county.geoid);
    if (metro) {
      usHome = metro.rows.get("US") ?? null;
      if (home?.metro) metroHome = metroRow(metro, home.metro) ?? null;
    }
    sectors = (await qcewSectors(county.geoid).catch(() => null))?.sectors ?? [];
  } else caveats.push("No US county under this point (TIGERweb); home values and jobs cover the United States only.");
  const [pulse, ports, border] = await Promise.all([
    opPulse().catch(() => null),
    opPorts(snapBbox(bboxAround(lat, lon, 220_000)), "medium").catch(() => null),
    opBorder().catch(() => null),
  ]);
  const trade: LayerFeature[] = [];
  if (ports) trade.push(...(ports.data as { features: LayerFeature[] }).features);
  if (border) {
    trade.push(
      ...(border.data as { features: LayerFeature<GeoJSON.Point>[] }).features.filter(
        (f) => haversine(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) <= 260_000,
      ),
    );
  }
  if (!pulse) caveats.push("National series (FRED / BTS) did not answer.");
  const report = buildMarketReport(
    lon,
    lat,
    {
      areas,
      trade,
      loaded: { areas: !!county, trade: !!(ports || border), pulse: !!pulse },
      pulse: (pulse?.data as PulseItem[] | undefined) ?? [],
      sectors,
      metroHome,
      usHome,
      caveats,
    },
    now,
  );
  const globe = `${origin}/?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&h=150000&layers=realestate,commerce,trade&market=1`;
  return { data: report, meta: { source: "zillow+qcew+tigerweb+bts+fred", county: county?.geoid ?? null, globe }, ttlS: 900 };
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
      case "areas": {
        const level = q.get("level") === "state" ? "state" : "county";
        const b = level === "county" ? parseBbox(q.get("bbox")) : null;
        if (level === "county" && !b) return bad("bbox=w,s,e,n required for level=county");
        return respond(await opAreas(level, b));
      }
      case "sectors": {
        const fips = q.get("fips") ?? "";
        if (!/^(\d{5}|US000)$/.test(fips)) return bad("fips=SSCCC (county) or SS000 (state) required");
        return respond(await opSectors(fips));
      }
      case "msas":
        return respond(await opMsas());
      case "msa-jobs": {
        const msa = q.get("msa") ?? "";
        if (!/^\d{5}$/.test(msa)) return bad("msa=5-digit CBSA code required");
        return respond(await opMsaJobs(msa));
      }
      case "context": {
        const fips = q.get("fips") ?? "";
        if (!/^\d{5}$/.test(fips)) return bad("fips=SSCCC (county) or SS000 (state) required");
        return respond(await opContext(fips));
      }
      case "ports": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        return respond(await opPorts(b, q.get("min") ?? "medium"));
      }
      case "border":
        return respond(await opBorder());
      case "countries":
        return respond(await opCountries());
      case "partners": {
        const iso3 = (q.get("iso3") ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(iso3)) return bad("iso3=USA required");
        return respond(await opPartners(iso3));
      }
      case "pulse":
        return respond(await opPulse());
      case "report": {
        const lon = Number(q.get("lon"));
        const lat = Number(q.get("lat"));
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad("lon and lat required");
        return respond(await opReport(lon, lat, req.nextUrl.origin));
      }
      default:
        return bad("unknown op: areas | sectors | context | msas | msa-jobs | ports | border | countries | partners | pulse | report");
    }
  } catch (err) {
    const res = jsonError(err);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}
