// Server-side fetchers for /api/permits. Only the route imports this file.
//
//   buildingPermits   permits issued in the last N days in a box, from every wired
//                     city portal the box meets, newest first, 500 per city at most;
//                     each city's answer cached 30 minutes (Los Angeles, weekly, 6 h)
//   licences          licensed premises in a box from five registries; 1 h (LA 6 h)
//   environmental     EPA ECHO NPDES and air facilities (two steps: a query id,
//                     then its rows; the rows are cached, never the id) and the
//                     Corps' ORM actions in a box; 6 h
//
// Every request goes through lib/civic/request.ts (a gate per host, ten
// minutes off after a 429 or a 503). A city that fails is named in
// `coverage` as "error", never left out.

import { cached } from "@/lib/server/cache";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { civicJson, runRows } from "@/lib/civic/request";
import type { Bbox } from "@/lib/zoning/features";
import {
  answeredState,
  buildPermits,
  PERMIT_CITIES,
  permitCitiesInBox,
  permitGapsInBox,
  permitRequest,
  permitRequestUrl,
  PERMIT_LIMIT,
  type CoverageState,
  type PermitCityId,
  type PermitRecord,
} from "./features";
import { buildLicences, LICENCE_LIMIT, LICENCE_SOURCES, licenceRequestUrl, licenceSourcesInBox, type LicenceRecord, type LicenceSourceId } from "./licences";
import {
  buildAir,
  buildNpdes,
  buildUsace,
  echoFacilities,
  echoFacilitiesUrl,
  echoQidUrl,
  echoQuery,
  ormFeatures,
  ormUrl,
  ORM_MAX,
  type EnvProgram,
  type EnvRecord,
} from "./environmental";

const MIN = 60_000;
const iso = (ageMs: number) => new Date(Date.now() - ageMs).toISOString();

export interface CoverageEntry {
  id: string;
  name: string;
  state: CoverageState;
  count: number;
  /** Why a source is stale, has no feed, is not wired or failed. */
  reason?: string;
  /** How often the source updates, as its portal states. */
  cadence?: string;
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 160);
}

// ------------------------------------------------------------------ building permits

export interface PermitsAnswer {
  records: PermitRecord[];
  coverage: CoverageEntry[];
  provenance: Provenance[];
  age: number;
}

export async function buildingPermits(b: Bbox, days: number): Promise<PermitsAnswer> {
  // The window starts at a UTC day, so every caller today shares the cache entry.
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const cities = permitCitiesInBox(b);
  const results = await Promise.all(
    cities.map(async (c) => {
      const req = permitRequest(c.id, b, since);
      const url = permitRequestUrl(req);
      try {
        const r = await cached(`permits:${c.id}:${b.join(",")}:${since}`, c.id === "losangeles" ? 6 * 60 * MIN : 30 * MIN, async () => {
          const res =
            req.kind === "arcgis"
              ? await runRows(`permits-${c.id}`, { kind: "arcgis", layer: req.url, params: req.params ?? {} }, 25_000)
              : await runRows(`permits-${c.id}`, { kind: "socrata", url: req.url }, c.id === "sanfrancisco" ? 25_000 : 20_000);
          return { records: buildPermits(c.id, res.features), rows: res.features.length, truncated: res.truncated };
        });
        return { city: c.id, ok: true as const, ...r.value, age: r.age, url };
      } catch (err) {
        return { city: c.id, ok: false as const, error: errorText(err) };
      }
    }),
  );
  const records: PermitRecord[] = [];
  const coverage: CoverageEntry[] = [];
  const prov: Provenance[] = [];
  let age = 0;
  for (const r of results) {
    const c = PERMIT_CITIES[r.city];
    if (!r.ok) {
      coverage.push({ id: c.id, name: c.name, state: "error", count: 0, reason: r.error, cadence: c.cadence });
      continue;
    }
    records.push(...r.records);
    age = Math.max(age, r.age);
    const state = answeredState(r.rows, r.truncated);
    coverage.push({
      id: c.id,
      name: c.name,
      state,
      count: r.records.length,
      cadence: c.cadence,
      reason: state === "partial" ? `the newest ${PERMIT_LIMIT} of more` : undefined,
    });
    prov.push(
      provenance(source(c.source), {
        kind: "published",
        upstreamUrl: r.url,
        retrievedAt: iso(r.age),
        notes: [`permits issued since ${since}: ${r.records.length}${state === "partial" ? ` (the newest ${PERMIT_LIMIT}; there are more)` : ""}`],
      }),
    );
  }
  for (const g of permitGapsInBox(b)) coverage.push({ id: g.name.toLowerCase().replace(/\W+/g, "-"), name: g.name, state: g.state, count: 0, reason: g.reason });
  records.sort((a, z) => (z.issued ?? "").localeCompare(a.issued ?? ""));
  return { records, coverage, provenance: prov, age };
}

// ------------------------------------------------------------------ licences

export interface LicencesAnswer {
  records: LicenceRecord[];
  coverage: CoverageEntry[];
  /** Withheld by the home-based heuristic, per source. */
  withheld: number;
  provenance: Provenance[];
  age: number;
}

export async function licences(b: Bbox): Promise<LicencesAnswer> {
  const today = new Date().toISOString().slice(0, 10);
  const srcs = licenceSourcesInBox(b);
  const results = await Promise.all(
    srcs.map(async (s) => {
      const url = licenceRequestUrl(s.id, b, today);
      try {
        const r = await cached(`licences:${s.id}:${b.join(",")}:${s.id === "chicago" ? today : ""}`, s.id === "losangeles" ? 6 * 60 * MIN : 60 * MIN, async () => {
          const res = await runRows(`licences-${s.id}`, { kind: "socrata", url }, s.id === "sanfrancisco" ? 25_000 : 20_000);
          const built = buildLicences(s.id, res.features.map((f) => f.properties ?? {}));
          return { ...built, rows: res.features.length };
        });
        return { id: s.id, ok: true as const, ...r.value, age: r.age, url };
      } catch (err) {
        return { id: s.id, ok: false as const, error: errorText(err) };
      }
    }),
  );
  const records: LicenceRecord[] = [];
  const coverage: CoverageEntry[] = [];
  const prov: Provenance[] = [];
  let withheld = 0;
  let age = 0;
  for (const r of results) {
    const s = LICENCE_SOURCES[r.id as LicenceSourceId];
    if (!r.ok) {
      coverage.push({ id: s.id, name: s.name, state: "error", count: 0, reason: r.error, cadence: s.cadence });
      continue;
    }
    records.push(...r.records);
    withheld += r.withheld;
    age = Math.max(age, r.age);
    const partial = r.rows >= LICENCE_LIMIT;
    coverage.push({
      id: s.id,
      name: s.name,
      state: partial ? "partial" : "covered",
      count: r.records.length,
      cadence: s.cadence,
      reason: [partial ? `the first ${LICENCE_LIMIT} records the registry returned` : "", r.withheld ? `${r.withheld} withheld at apartment or unit addresses (home-business heuristic)` : ""].filter(Boolean).join("; ") || undefined,
    });
    prov.push(
      provenance(source(s.source), {
        kind: "published",
        upstreamUrl: r.url,
        retrievedAt: iso(r.age),
        notes: [`${r.records.length} licensed premises shown, ${r.withheld} withheld by the home-business heuristic`],
      }),
    );
  }
  return { records, coverage, withheld, provenance: prov, age };
}

// ------------------------------------------------------------------ environmental

export interface EnvAnswer {
  records: EnvRecord[];
  coverage: CoverageEntry[];
  provenance: Provenance[];
  age: number;
}

/** ECHO in two steps: get_facilities for a query id and its row count, get_qid for page one of the rows. */
async function echo(program: "npdes" | "air", b: Bbox): Promise<{ records: EnvRecord[]; total: number; urls: string[] }> {
  const first = echoFacilitiesUrl(program, b);
  const q = echoQuery(await civicJson<unknown>(`echo-${program}`, first, 25_000));
  if (!q) throw new Error(`ECHO ${program}: no query id in the answer`);
  if (q.rows === 0) return { records: [], total: 0, urls: [first] };
  const second = echoQidUrl(program, q.qid);
  const rows = echoFacilities(await civicJson<unknown>(`echo-${program}`, second, 25_000));
  return { records: program === "npdes" ? buildNpdes(rows) : buildAir(rows), total: q.rows, urls: [first, second] };
}

export async function environmental(b: Bbox): Promise<EnvAnswer> {
  const parts: Array<{ id: EnvProgram; name: string; run: () => Promise<{ records: EnvRecord[]; total: number; urls: string[] }> }> = [
    { id: "npdes", name: "EPA ECHO, Clean Water Act (NPDES)", run: () => echo("npdes", b) },
    { id: "air", name: "EPA ECHO, Clean Air Act", run: () => echo("air", b) },
    {
      id: "usace",
      name: "U.S. Army Corps of Engineers, ORM",
      run: async () => {
        const url = ormUrl(b);
        const feats = ormFeatures(await civicJson<unknown>("usace-orm", url, 25_000));
        return { records: buildUsace(feats), total: feats.length, urls: [url] };
      },
    },
  ];
  const results = await Promise.all(
    parts.map(async (p) => {
      try {
        // The resolved rows are cached, never ECHO's query id (server-side state that expires).
        const r = await cached(`env:${p.id}:${b.join(",")}`, 6 * 60 * MIN, p.run);
        return { ...p, ok: true as const, ...r.value, age: r.age };
      } catch (err) {
        return { ...p, ok: false as const, error: errorText(err) };
      }
    }),
  );
  const records: EnvRecord[] = [];
  const coverage: CoverageEntry[] = [];
  const prov: Provenance[] = [];
  let age = 0;
  for (const r of results) {
    if (!r.ok) {
      coverage.push({ id: r.id, name: r.name, state: "error", count: 0, reason: r.error });
      continue;
    }
    records.push(...r.records);
    age = Math.max(age, r.age);
    const partial = r.id === "usace" ? r.total >= ORM_MAX : r.records.length < r.total;
    coverage.push({
      id: r.id,
      name: r.name,
      state: partial ? "partial" : "covered",
      count: r.records.length,
      reason: partial ? (r.id === "usace" ? `the ${ORM_MAX} actions the search returns at most, in no date order (sorted here)` : `${r.records.length} of ${r.total} ECHO rows (page one)`) : undefined,
      cadence: r.id === "usace" ? "as the Corps enters actions" : "ECHO refreshes weekly",
    });
    prov.push(
      provenance(source(r.id === "usace" ? "usace-orm" : r.id === "npdes" ? "epa-echo-cwa" : "epa-echo-air"), {
        kind: "published",
        // The first step's URL: the second carries ECHO's query id, which expires.
        upstreamUrl: r.urls[0],
        retrievedAt: iso(r.age),
        notes: [`${r.records.length} in the box`],
      }),
    );
  }
  return { records, coverage, provenance: prov, age };
}

export type { PermitCityId };
