// Economy API: trade, commerce and real estate over public, keyless sources.
// CORS open and edge-cached like /api/water, so scripts and notebooks can use it.
//
//   /api/economy?op=areas&bbox=w,s,e,n        counties in the box joined with BLS QCEW
//                                             (jobs, wages) and Zillow (home values, rents)
//   /api/economy?op=areas&level=state         every state, same joins
//   /api/economy?op=sectors&fips=48029        private-sector NAICS mix for a county (or a
//                                             state: 48000), with location quotients
//   /api/economy?op=context&fips=48029        sector mix plus metro, state and US home values
//   /api/economy?op=ports&bbox=..&min=medium  World Port Index harbours in the box with BTS
//                                             Port Performance volumes where published
//   /api/economy?op=border                    every US land port of entry, 25 months of BTS counts
//   /api/economy?op=countries                 Natural Earth polygons joined with World Bank
//                                             GDP, exports, imports, trade/GDP, container TEU
//   /api/economy?op=partners&iso3=USA         top trading partners (WITS, latest year)
//   /api/economy?op=pulse                     national series: FRED + BTS freight indicators
//   /api/economy?op=report&lon=..&lat=..      the market report for a point, built server-side
//
// Every response carries `provenance` (one record per upstream release the
// numbers came from, estimates with their formula) and `generatedAt`; the
// tabular ops (areas, ports, border, countries, sectors, pulse) also answer
// `format=csv` with the same provenance as `#` footer lines. See docs/API.md.
//
// Bounding boxes are snapped outward to a one-degree grid so nearby callers
// share an entry; every upstream table is cached in memory for hours.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, csv as csvResponse, ok, options, parseFormat, withCors, type CsvRow, type ResponseFormat } from "@/lib/server/respond";
import type { Provenance } from "@/lib/provenance/types";
import { dedupeProvenance } from "@/lib/provenance/collect";
import {
  btsBorderProvenance,
  btsPortsProvenance,
  naturalEarthProvenance,
  pulseProvenance,
  qcewProvenance,
  tigerProvenance,
  witsProvenance,
  worldBankProvenance,
  wpiProvenance,
  zillowProvenance,
} from "@/lib/economy/provenance";
import {
  AREA_COLUMNS,
  COUNTRY_COLUMNS,
  CROSSING_COLUMNS,
  flattenAreas,
  flattenCountries,
  flattenCrossings,
  flattenPorts,
  flattenPulse,
  flattenPulseSeries,
  flattenSectors,
  PORT_COLUMNS,
  PULSE_COLUMNS,
  PULSE_SERIES_COLUMNS,
  SECTOR_COLUMNS,
} from "@/lib/economy/flatten";
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
  /** One record per upstream release the payload was read or computed from. */
  provenance: Provenance[];
  caveats?: string[];
  /** Tabular ops: how to flatten `data` for `format=csv`. Absent means CSV is not offered for this op. */
  csv?: () => { rows: CsvRow[]; columns: readonly string[]; filename: string };
}

/** When a cached value was fetched: now minus its age. */
function retrievedAt(ageMs: number): string {
  return new Date(Date.now() - ageMs).toISOString();
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
  const at = retrievedAt(r.age);
  const provenance: Provenance[] = [tigerProvenance(at, r.value.detail)];
  if (r.value.asOf.qcew) provenance.push(qcewProvenance(r.value.asOf.qcew, at, { notes: [`${level} rows, all ownerships, all industries`] }));
  if (r.value.asOf.zhvi) provenance.push(zillowProvenance(level === "county" ? "zhviCounty" : "zhviState", r.value.asOf.zhvi, at));
  if (r.value.asOf.zori) provenance.push(zillowProvenance("zoriCounty", r.value.asOf.zori, at));
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: { source: r.value.sources.join(" + ") + " + Census TIGERweb", asOf: r.value.asOf, level, bbox, polygons: r.value.polygons, detail: r.value.detail, cacheAge: r.age },
    ttlS: 3600,
    provenance,
    csv: () => ({ rows: flattenAreas(r.value.features), columns: AREA_COLUMNS, filename: `economy-areas-${level}${bbox ? "-" + bbox.join("_") : ""}.csv` }),
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
  const at = new Date().toISOString();
  const provenance: Provenance[] = [];
  if (sectors) provenance.push(qcewProvenance(sectors.period, at, { area: fips, sectors: true }));
  if (home) provenance.push(zillowProvenance("zhviCounty", county?.asOf, at));
  if (metro) provenance.push(zillowProvenance("zhviMetro", metro.asOf, at, ["metro and United States rows"]));
  if (state && stateName) provenance.push(zillowProvenance("zhviState", state.asOf, at));
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
    provenance,
  };
}

async function opSectors(fips: string): Promise<OpResult> {
  const s = await qcewSectors(fips);
  return {
    data: s,
    meta: { source: "BLS QCEW", fips },
    ttlS: 6 * 3600,
    provenance: [qcewProvenance(s.period, new Date().toISOString(), { area: fips, sectors: true })],
    csv: () => ({ rows: flattenSectors(fips, s.period, s.sectors), columns: SECTOR_COLUMNS, filename: `economy-sectors-${fips}.csv` }),
  };
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
  const at = retrievedAt(r.age);
  const provenance: Provenance[] = [wpiProvenance(at, WPI.pulled)];
  if (r.value.bts) provenance.push(btsPortsProvenance(r.value.btsYear, at));
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
    provenance,
    csv: () => ({ rows: flattenPorts(r.value.features), columns: PORT_COLUMNS, filename: `economy-ports-${bbox.join("_")}.csv` }),
  };
}

async function opBorder(): Promise<OpResult> {
  const b = await borderCrossings();
  const features = buildCrossings(b.rows);
  return {
    data: { type: "FeatureCollection", features },
    meta: { source: "BTS Border Crossing Entry Data", asOf: b.asOf, ports: b.rows.length },
    ttlS: 6 * 3600,
    provenance: [btsBorderProvenance(b.asOf, new Date().toISOString())],
    csv: () => ({ rows: flattenCrossings(features), columns: CROSSING_COLUMNS, filename: "economy-border-crossings.csv" }),
  };
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
    provenance: [naturalEarthProvenance(retrievedAt(r.age), COUNTRIES.pulled), worldBankProvenance(retrievedAt(r.age))],
    caveats: r.value.failed.length ? [`World Bank indicators that did not answer: ${r.value.failed.join(", ")}`] : undefined,
    csv: () => ({ rows: flattenCountries(r.value.features), columns: COUNTRY_COLUMNS, filename: "economy-countries.csv" }),
  };
}

async function opPartners(iso3: string): Promise<OpResult> {
  const p = await witsPartners(iso3);
  return { data: p, meta: { source: "World Bank WITS TradeStats", iso3, units: "US$ thousands" }, ttlS: 24 * 3600, provenance: [witsProvenance(iso3, p?.year, new Date().toISOString())] };
}

async function opPulse(series = false): Promise<OpResult> {
  const [fredItems, bts] = await Promise.all([Promise.allSettled(FRED_SERIES.map((s) => fred(s.id))), btsIndicators().catch(() => [] as PulseItem[])]);
  const items: PulseItem[] = [];
  const failed: string[] = [];
  fredItems.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) items.push(r.value);
    else failed.push(FRED_SERIES[i].id);
  });
  items.push(...bts);
  return {
    data: items,
    meta: { source: "FRED + BTS Supply Chain Indicators", failed, count: items.length },
    ttlS: 1800,
    provenance: pulseProvenance(items, new Date().toISOString()),
    caveats: failed.length ? [`FRED series that did not answer: ${failed.join(", ")}`] : undefined,
    csv: () =>
      series
        ? { rows: flattenPulseSeries(items), columns: PULSE_SERIES_COLUMNS, filename: "economy-pulse-series.csv" }
        : { rows: flattenPulse(items), columns: PULSE_COLUMNS, filename: "economy-pulse.csv" },
  };
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
  // The report already carries per-section provenance and citations; the envelope repeats the union plus the polygon source.
  const provenance = dedupeProvenance([county ? [tigerProvenance(new Date(now).toISOString())] : [], report.provenance]);
  return { data: report, meta: { source: "zillow+qcew+tigerweb+bts+fred", county: county?.geoid ?? null, globe }, ttlS: 900, provenance, caveats: report.caveats };
}

/** JSON envelope, or CSV when asked and the op is tabular. */
function respond(r: OpResult, format: ResponseFormat = "json", op = "") {
  if (format === "csv") {
    if (!r.csv) return badRequest(`format=csv is not offered for op=${op}; tabular ops are areas, sectors, ports, border, countries, pulse`);
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
      case "areas": {
        const level = q.get("level") === "state" ? "state" : "county";
        const b = level === "county" ? parseBbox(q.get("bbox")) : null;
        if (level === "county" && !b) return bad("bbox=w,s,e,n required for level=county");
        return respond(await opAreas(level, b), format, op);
      }
      case "sectors": {
        const fips = q.get("fips") ?? "";
        if (!/^(\d{5}|US000)$/.test(fips)) return bad("fips=SSCCC (county) or SS000 (state) required");
        return respond(await opSectors(fips), format, op);
      }
      case "context": {
        const fips = q.get("fips") ?? "";
        if (!/^\d{5}$/.test(fips)) return bad("fips=SSCCC (county) or SS000 (state) required");
        return respond(await opContext(fips), format, op);
      }
      case "ports": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required");
        const min = q.get("min") ?? "medium";
        if (!(min in SIZE_MIN)) return bad("min=large | medium | small | all");
        return respond(await opPorts(b, min), format, op);
      }
      case "border":
        return respond(await opBorder(), format, op);
      case "countries":
        return respond(await opCountries(), format, op);
      case "partners": {
        const iso3 = (q.get("iso3") ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(iso3)) return bad("iso3=USA required");
        return respond(await opPartners(iso3), format, op);
      }
      case "pulse":
        return respond(await opPulse(q.get("series") === "1"), format, op);
      case "report": {
        const lon = Number(q.get("lon"));
        const lat = Number(q.get("lat"));
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad("lon and lat required");
        return respond(await opReport(lon, lat, req.nextUrl.origin), format, op);
      }
      default:
        return bad("unknown op: areas | sectors | context | ports | border | countries | partners | pulse | report");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
