// Companies API: public companies from SEC EDGAR at their registered business
// address. CORS open and edge-cached like /api/economy so scripts can use it.
//
//   /api/companies?op=near&bbox=w,s,e,n        HQs in the box from the bundled snapshot (cap 2,000)
//   /api/companies?op=county&fips=48029        HQs in a county (or a state: 48000)
//   /api/companies?op=search&q=nucor           ticker / name search over the snapshot
//   /api/companies?op=company&ticker=NUE       live dossier: profile, recent filings (10-K/10-Q/8-K),
//   /api/companies?op=company&cik=73309        annual fact series, ratios (estimates), cached 12 h
//   /api/companies?op=sectors&fips=48029       county NAICS mix (BLS QCEW) bridged to GICS sectors / ETFs
//   &format=csv                                 near / county / search as CSV
//
// Every JSON response is an Enveloped<T>: { data, provenance[], generatedAt,
// caveats?, ...meta }. Company-level public filings only; no officer, insider
// or shareholder names are read from EDGAR here (Forms 3/4/5 are filtered out).

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { citation, provenance, type Enveloped, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import type { Series } from "@/lib/series/types";
import { qcewSectors } from "@/lib/economy/sources";
import { companyFacts, companyFactsUrl, parseFilings, parseProfile, submissions, submissionsUrl, tickers, tickersExchange } from "@/lib/companies/edgar";
import { derivedRatios, factSeries, latestFacts } from "@/lib/companies/facts";
import { BUNDLE, companiesCsv, companiesInBbox, companiesInCounty, findCompany, searchCompanies } from "@/lib/companies/features";
import { BUNDLE_CAVEATS, bundleProvenance } from "@/lib/companies/section";
import { parseBbox, parseCik, parseFips, parseFormat, parseLimit, parseQuery, parseTicker, DEFAULT_SEARCH_LIMIT, MAX_FEATURES } from "@/lib/companies/params";
import { countySectorExposure, sicToSector } from "@/lib/companies/sectors";
import type { CompanyProfile, ConceptKey, DerivedRatio, FactValue, Filing, SectorExposure } from "@/lib/companies/types";
import type { LayerFeature } from "@/lib/layers/types";

export const maxDuration = 60;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const H = 3600_000;

interface OpResult<T = unknown> {
  data: T;
  provenance: Provenance[];
  caveats?: string[];
  meta: Record<string, unknown>;
  ttlS: number;
}

function collection(features: LayerFeature[]) {
  return { type: "FeatureCollection" as const, features };
}

function opNear(bbox: [number, number, number, number]): OpResult {
  const features = companiesInBbox(bbox, MAX_FEATURES);
  return {
    data: collection(features),
    provenance: bundleProvenance(),
    caveats: [...BUNDLE_CAVEATS],
    meta: { source: "SEC EDGAR", bbox, count: features.length, capped: features.length >= MAX_FEATURES, pulled: BUNDLE.pulled, bundle: BUNDLE.counts },
    ttlS: 6 * 3600,
  };
}

function opCounty(fips: string): OpResult {
  const features = companiesInCounty(fips);
  return {
    data: collection(features),
    provenance: bundleProvenance(),
    caveats: [...BUNDLE_CAVEATS],
    meta: { source: "SEC EDGAR", fips, count: features.length, pulled: BUNDLE.pulled },
    ttlS: 6 * 3600,
  };
}

function opSearch(q: string, limit: number): OpResult {
  const features = searchCompanies(q, limit);
  return {
    data: collection(features),
    provenance: bundleProvenance(),
    caveats: [...BUNDLE_CAVEATS],
    meta: { source: "SEC EDGAR", q, count: features.length, limit, pulled: BUNDLE.pulled },
    ttlS: 6 * 3600,
  };
}

interface CompanyDossier {
  profile: CompanyProfile;
  sector: ReturnType<typeof sicToSector>;
  hq: { countyFips: string | null; lon: number | null; lat: number | null; geo: string | null } | null;
  filings: Filing[];
  facts: Record<ConceptKey, FactValue | null>;
  ratios: DerivedRatio[];
  series: Series[];
  citation: string;
}

/** Ticker -> CIK through the bundle first, then EDGAR's ticker files. */
async function resolveCik(ticker: string): Promise<number | null> {
  const local = findCompany({ ticker });
  if (local) return local.cik;
  const listed = await tickersExchange().catch(() => null);
  const hit = listed?.find((l) => l.ticker === ticker) ?? (await tickers().catch(() => null))?.find((l) => l.ticker === ticker);
  return hit?.cik ?? null;
}

async function opCompany(cik: number): Promise<OpResult<CompanyDossier>> {
  const r = await cached(`companies:dossier:${cik}`, 12 * H, async () => {
    const retrievedAt = new Date().toISOString();
    const [sub, facts] = await Promise.all([submissions(cik), companyFacts(cik).catch(() => null)]);
    const profile = parseProfile(sub);
    const filings = parseFilings(sub, 20);
    const local = findCompany({ cik });
    const hq = local ? { countyFips: local.countyFips, lon: local.lon, lat: local.lat, geo: local.geo } : null;
    const latest = facts ? latestFacts(facts) : ({} as Record<ConceptKey, FactValue | null>);
    const ratios = facts ? derivedRatios(latest) : [];
    const geo = local && local.lon != null && local.lat != null ? ({ kind: "point", id: `cik:${cik}`, name: profile.name, lon: local.lon, lat: local.lat } as const) : undefined;
    const series = facts ? factSeries(facts, { retrievedAt, geo }) : [];
    const prov: Provenance[] = [
      provenance(source("sec-edgar"), { kind: "published", seriesId: `CIK${String(cik).padStart(10, "0")}`, upstreamUrl: submissionsUrl(cik), retrievedAt, notes: ["profile, business address and recent filings from the submissions API"] }),
    ];
    if (facts) prov.push(provenance(source("sec-edgar"), { kind: "published", seriesId: `CIK${String(cik).padStart(10, "0")}:facts`, upstreamUrl: companyFactsUrl(cik), retrievedAt, notes: ["annual values from 10-K family forms, restatements resolved by latest filing date"] }));
    for (const rt of ratios) prov.push(provenance(source("sec-edgar"), { kind: "estimate", method: rt.formula, period: rt.period, seriesId: `CIK${String(cik).padStart(10, "0")}:${rt.key}`, retrievedAt }));
    const caveats: string[] = [];
    if (!facts) caveats.push("companyfacts did not answer; no XBRL facts in this response (small filers and funds often have none).");
    if (!hq) caveats.push("Company is not in the bundled snapshot, so no county or map position is attached.");
    const dossier: CompanyDossier = {
      profile,
      sector: sicToSector(profile.sic),
      hq,
      filings,
      facts: latest,
      ratios,
      series,
      citation: citation(prov[0]),
    };
    return { dossier, prov, caveats };
  });
  return {
    data: r.value.dossier,
    provenance: r.value.prov,
    caveats: r.value.caveats.length ? r.value.caveats : undefined,
    meta: { source: "SEC EDGAR", cik, cacheAge: r.age, filings: r.value.dossier.filings.length, series: r.value.dossier.series.length },
    ttlS: 12 * 3600,
  };
}

async function opSectors(fips: string): Promise<OpResult<{ period: string; fips: string; exposure: SectorExposure[] }>> {
  const s = await qcewSectors(fips);
  const retrievedAt = new Date().toISOString();
  const exposure = countySectorExposure(s.sectors, { period: s.period, fips, retrievedAt });
  return {
    data: { period: s.period, fips, exposure },
    provenance: [provenance(source("bls-qcew"), { kind: "published", period: s.period, seriesId: `qcew:${fips}:sectors`, retrievedAt }), ...exposure.map((e) => e.provenance).slice(0, 1)],
    caveats: ["The NAICS to GICS bridge and the ETF list are a convention documented in lib/companies/sectors.ts; a county's jobs mix is not a portfolio."],
    meta: { source: "BLS QCEW", fips, period: s.period, sectors: exposure.length },
    ttlS: 6 * 3600,
  };
}

function respond<T>(r: OpResult<T>) {
  const body: Enveloped<T> & Record<string, unknown> = { ...r.meta, data: r.data, provenance: r.provenance, generatedAt: new Date().toISOString(), caveats: r.caveats };
  return NextResponse.json(body, {
    headers: { ...CORS, "cache-control": `public, max-age=0, s-maxage=${r.ttlS}, stale-while-revalidate=${r.ttlS}` },
  });
}

function respondCsv(r: OpResult, name: string) {
  const features = (r.data as { features: LayerFeature<GeoJSON.Point>[] }).features;
  return new Response(companiesCsv(features), {
    headers: {
      ...CORS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": `public, max-age=0, s-maxage=${r.ttlS}, stale-while-revalidate=${r.ttlS}`,
    },
  });
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
  const format = parseFormat(q.get("format"));
  if (!format) return bad("format=json|csv");
  try {
    switch (op) {
      case "near": {
        const b = parseBbox(q.get("bbox"));
        if (!b) return bad("bbox=w,s,e,n required (degrees)");
        const r = opNear(b);
        return format === "csv" ? respondCsv(r, "companies-near") : respond(r);
      }
      case "county": {
        const fips = parseFips(q.get("fips"));
        if (!fips) return bad("fips=SSCCC (county) or SS000 (state) required");
        const r = opCounty(fips);
        return format === "csv" ? respondCsv(r, `companies-${fips}`) : respond(r);
      }
      case "search": {
        const text = parseQuery(q.get("q"));
        if (!text) return bad("q=<ticker or name> required (1..64 chars)");
        const r = opSearch(text, parseLimit(q.get("limit"), DEFAULT_SEARCH_LIMIT, 200));
        return format === "csv" ? respondCsv(r, "companies-search") : respond(r);
      }
      case "company": {
        if (format === "csv") return bad("op=company is JSON only");
        let cik = parseCik(q.get("cik"));
        if (cik == null) {
          const ticker = parseTicker(q.get("ticker"));
          if (!ticker) return bad("ticker=AAPL or cik=320193 required");
          cik = await resolveCik(ticker);
          if (cik == null) return NextResponse.json({ error: `unknown ticker ${ticker}` }, { status: 404, headers: CORS });
        }
        return respond(await opCompany(cik));
      }
      case "sectors": {
        if (format === "csv") return bad("op=sectors is JSON only");
        const fips = parseFips(q.get("fips"));
        if (!fips) return bad("fips=SSCCC (county) or SS000 (state) required");
        return respond(await opSectors(fips));
      }
      default:
        return bad("unknown op: near | county | search | company | sectors");
    }
  } catch (err) {
    const res = jsonError(err);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}
