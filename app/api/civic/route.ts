// Civic API: community indicators for counties and tracts. CORS open,
// edge-cached, with the shared envelope (lib/server/respond.ts). Round 4 has
// one op; later rounds add svi, broadband, ejscreen and housing here.
//
//   /api/civic?op=health&level=county&measure=DIABETES
//        CDC PLACES (2025 release): every county's age-adjusted prevalence for one
//        measure, from one whole-measure pull, with its 95% CI and data year. Held a
//        week (the release is static until CDC's next). Join by `fips` onto county
//        outlines (Connecticut in planning regions 09110-09190).
//   /api/civic?op=health&level=tract&measure=DIABETES&counties=09110,09120
//        Crude prevalence for every published tract of at most 6 counties, by
//        countyfips (never a within_box query: a cold one took 19.6 s). Each county
//        held a week.
//   /api/civic?op=health&level=place&fips=48453
//        Every measure for one county, age-adjusted, for the click answer. Held a week.
//
// All through the civic gate (one request a second to data.cdc.gov, a 429 or 503
// closes it for ten minutes). A county or tract with no row is not published,
// never 0.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4 } from "@/lib/server/net";
import { provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { civicJson } from "@/lib/civic/request";
import {
  countyMeasureUrl,
  isPlacesMeasure,
  parsePlaces,
  PLACES_ATTRIBUTION,
  PLACES_CAVEAT,
  PLACES_MAX_COUNTIES,
  PLACES_MEASURES,
  placeUrl,
  quintiles,
  tractUrl,
  type PlacesMeasure,
} from "@/lib/civic/places";

export const maxDuration = 60;
export const OPTIONS = options;

preferIpv4();

const WEEK_MS = 7 * 24 * 3600_000;
const HEALTH_HELP =
  "op=health needs level=county&measure=<MEASUREID>, level=tract&measure=<MEASUREID>&counties=<up to 6 five-digit FIPS>, or level=place&fips=<five-digit FIPS>; measures: " +
  Object.keys(PLACES_MEASURES).join(", ");

const at = (age: number) => new Date(Date.now() - age).toISOString();

async function healthCounty(m: PlacesMeasure) {
  const url = countyMeasureUrl(m);
  const r = await cached(`places:county:${m}`, WEEK_MS, async () => parsePlaces(await civicJson<unknown>("cdc-places", url, 25_000), "county"));
  const meta = PLACES_MEASURES[m];
  return ok(
    { level: "county", measure: m, rows: r.value.map(({ fips, name, state, value, low, high, year, population }) => ({ fips, name, state, value, low, high, year, population })) },
    {
      meta: {
        source: PLACES_ATTRIBUTION,
        measure: { id: m, name: meta.name, short: meta.short, category: meta.category, year: meta.year },
        valueType: "age-adjusted prevalence, %",
        count: r.value.length,
        breaks: quintiles(r.value.map((v) => v.value)),
        cacheAge: r.age,
      },
      ttlS: 86_400,
      provenance: [provenance(source("cdc-places"), { kind: "published", seriesId: `swc5-untb (PLACES county, 2025 release), measureid=${m}, AgeAdjPrv`, upstreamUrl: url, retrievedAt: at(r.age) })],
      caveats: [PLACES_CAVEAT, "`breaks` are national quintiles of the published county values for this measure. A county with no row is not published, not 0."],
    },
  );
}

async function healthTract(m: PlacesMeasure, counties: string[]) {
  const parts = await Promise.all(
    counties.map((c) => cached(`places:tract:${m}:${c}`, WEEK_MS, async () => parsePlaces(await civicJson<unknown>("cdc-places", tractUrl(c, m), 25_000), "tract")).catch(() => null)),
  );
  if (parts.every((p) => p == null)) throw new Error("CDC PLACES did not answer for any county asked");
  const coverage = counties.map((c, i) => ({ county: c, state: parts[i] ? "covered" : "error", count: parts[i] ? parts[i]!.value.length : null }));
  const rows = parts.flatMap((p) => p?.value ?? []);
  const caveats = [PLACES_CAVEAT, "Crude prevalence, as CDC publishes tracts. A tract with no row is not published (small populations are withheld), not 0."];
  for (const c of coverage) if (c.state === "error") caveats.push(`CDC PLACES did not answer for county ${c.county} this time: its tracts are unknown, not missing.`);
  return ok(
    { level: "tract", measure: m, rows: rows.map(({ fips, state, value, low, high, year, population }) => ({ fips, state, value, low, high, year, population })) },
    {
      meta: { source: PLACES_ATTRIBUTION, measure: { id: m, ...PLACES_MEASURES[m] }, valueType: "crude prevalence, %", coverage, count: rows.length, cacheAge: Math.max(...parts.map((p) => p?.age ?? 0)) },
      ttlS: coverage.some((c) => c.state === "error") ? 600 : 86_400,
      provenance: [provenance(source("cdc-places"), { kind: "published", seriesId: `cwsq-ngmh (PLACES tract, 2025 release), measureid=${m}, CrdPrv, countyfips in (${counties.join(", ")})`, upstreamUrl: tractUrl(counties[0], m), retrievedAt: at(Math.max(...parts.map((p) => p?.age ?? 0))) })],
      caveats,
    },
  );
}

async function healthPlace(fips: string) {
  const url = placeUrl(fips);
  const r = await cached(`places:place:${fips}`, WEEK_MS, async () => parsePlaces(await civicJson<unknown>("cdc-places", url, 25_000), "county"), { deadlineMs: 25_000 });
  return ok(
    { level: "place", fips, values: r.value },
    {
      meta: { source: PLACES_ATTRIBUTION, count: r.value.length, cacheAge: r.age },
      ttlS: 86_400,
      provenance: [provenance(source("cdc-places"), { kind: "published", seriesId: `swc5-untb (PLACES county, 2025 release), locationid=${fips}, AgeAdjPrv`, upstreamUrl: url, retrievedAt: at(r.age) })],
      caveats: [PLACES_CAVEAT, "Measures this county has no row for are not published; the seven social-needs measures come from an optional survey module not every state fielded."],
    },
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "health": {
        const level = q.get("level") ?? "county";
        if (level === "place") {
          const fips = q.get("fips") ?? "";
          if (!/^\d{5}$/.test(fips)) return badRequest(HEALTH_HELP);
          return await healthPlace(fips);
        }
        const m = q.get("measure");
        if (!isPlacesMeasure(m)) return badRequest(HEALTH_HELP);
        if (level === "county") return await healthCounty(m);
        if (level === "tract") {
          const counties = [...new Set((q.get("counties") ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
          if (!counties.length || counties.length > PLACES_MAX_COUNTIES || !counties.every((c) => /^\d{5}$/.test(c))) return badRequest(HEALTH_HELP);
          return await healthTract(m, counties.sort());
        }
        return badRequest(HEALTH_HELP);
      }
      default:
        return badRequest("unknown op: health");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
