// Civic API: community indicators for counties and tracts, and public schools.
// CORS open, edge-cached, with the shared envelope (lib/server/respond.ts).
// Round 4 added health, round 5 svi and schools; later rounds add broadband,
// ejscreen and housing here.
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
//   /api/civic?op=svi&level=county
//        CDC/ATSDR SVI 2022: every county's overall and four theme percentiles and flag
//        count, attributes only (two pages of 2,000), held a week. Join by `fips` onto
//        county outlines (Connecticut in planning regions). -999 ("not ranked") is null.
//   /api/civic?op=svi&level=tract&bbox=w,s,e,n
//        SVI's own tract polygons in a box of at most 0.4 degrees (snapped to 0.05), at
//        most two pages, held a week per box.
//   /api/civic?op=svi&level=place&fips=48453 (or an 11-digit tract)
//        One county or tract with the 16 estimates and margins; 404 when CDC has no row.
//   /api/civic?op=schools&bbox=w,s,e,n
//        NCES EDGE public schools, school year 2024-25, in a box of at most 0.2 degrees
//        (the civic box; snapped to 0.05), held a day. Directory fields, enrollment, free
//        and reduced-price lunch, FTE and the student-teacher ratio as NCES publishes them;
//        no race, sex or grade-level enrollment cell is requested. Inactive and Future
//        schools are left out (counted). A negative is a CCD reporting code, never 0.
//
// All through the civic gate (one request a second to data.cdc.gov, one every 500 ms
// to an ArcGIS organisation; a 429 or 503 closes it for ten minutes). A county or
// tract with no row is not published, never 0.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, notFound, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4 } from "@/lib/server/net";
import { provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { civicJson, runRows } from "@/lib/civic/request";
import { parseBbox as gridBbox, type Bbox } from "@/lib/civic/bbox";
import { buildSchools, NCES_MAX_PAGES, NCES_PAGE, NCES_SCHOOLS, SCHOOL_FIELDS, SCHOOLS_ATTRIBUTION, SCHOOLS_CAVEAT } from "@/lib/civic/schools";
import type { LayerFeature } from "@/lib/layers/types";
import {
  SVI_ATTRIBUTION,
  SVI_BREAKS,
  SVI_CAVEAT,
  SVI_COUNTY_FIELDS,
  SVI_COUNTY_LAYER,
  SVI_COUNTY_PAGES,
  SVI_PAGE,
  SVI_PLACE_FIELDS,
  SVI_THEMES,
  SVI_TRACT_BOX_DEG,
  SVI_TRACT_LAYER,
  SVI_TRACT_PAGES,
  SVI_VINTAGE_NOTE,
  sviPlace,
  sviRow,
  type SviRow,
} from "@/lib/civic/svi";
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

// ---------------------------------------------------------------- svi (CDC/ATSDR SVI 2022)

const SVI_HELP = "op=svi needs level=county, level=tract&bbox=w,s,e,n (at most 0.4 degrees a side), or level=place&fips=<5-digit county or 11-digit tract FIPS>";
const SVI_CAVEATS = [SVI_CAVEAT, SVI_VINTAGE_NOTE];

const sviProv = (layer: string, seriesId: string, age: number, notes?: string[]) =>
  provenance(source("cdc-svi"), { kind: "published", seriesId, upstreamUrl: layer, period: "ACS 2018-2022 (SVI 2022)", retrievedAt: at(age), notes });

/** The compact county row the layer joins: percentiles in SVI_THEMES order, null where not ranked. */
const compactSvi = (r: SviRow) => ({ fips: r.fips, name: r.county, state: r.stAbbr, rpl: r.rpl, flags: r.flags });

async function sviCounty() {
  const r = await cached(
    "svi:county",
    WEEK_MS,
    async () => {
      const rows: SviRow[] = [];
      let cut = false;
      for (let page = 0; page < SVI_COUNTY_PAGES; page++) {
        const res = await runRows(
          "cdc-svi",
          { kind: "arcgis", layer: SVI_COUNTY_LAYER, params: { where: "1=1", outFields: SVI_COUNTY_FIELDS.join(","), returnGeometry: "false", orderByFields: "FIPS", resultRecordCount: String(SVI_PAGE), resultOffset: String(page * SVI_PAGE) } },
          25_000,
        );
        for (const f of res.features) {
          const row = sviRow(f.properties ?? {});
          if (row) rows.push(row);
        }
        cut = res.truncated;
        if (!cut) break;
      }
      return { rows, cut };
    },
    { deadlineMs: 45_000 },
  );
  const notRanked = r.value.rows.filter((x) => x.rpl[0] == null).length;
  const caveats = [...SVI_CAVEATS, "Counties come as attribute rows only: join them by `fips` onto your own county outlines (Connecticut in planning regions 09110-09190, as TIGER current is). A county with no row is not in this release (SVI US covers the states and DC), never 0."];
  if (r.value.cut) caveats.push(`CDC's answer was still cut at ${SVI_COUNTY_PAGES * SVI_PAGE} counties: some counties are missing from this answer, not unranked.`);
  return ok(
    { level: "county", themes: SVI_THEMES.map((t) => t.name), rows: r.value.rows.map(compactSvi) },
    {
      meta: { source: SVI_ATTRIBUTION, count: r.value.rows.length, notRanked, breaks: [...SVI_BREAKS], capped: r.value.cut, cacheAge: r.age },
      ttlS: 86_400,
      provenance: [sviProv(SVI_COUNTY_LAYER, "CDC_ATSDR_Social_Vulnerability_Index_2022_USA FeatureServer layer 1 (SVI2022 US county), attributes", r.age)],
      caveats,
    },
  );
}

async function sviTract(b: Bbox) {
  const r = await cached(
    `svi:tract:${b.join(",")}`,
    WEEK_MS,
    async () => {
      const features: Array<{ type: "Feature"; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }> = [];
      let cut = false;
      const [w, s, e, n] = b;
      for (let page = 0; page < SVI_TRACT_PAGES; page++) {
        const res = await runRows(
          "cdc-svi",
          {
            kind: "arcgis",
            layer: SVI_TRACT_LAYER,
            params: {
              where: "1=1",
              geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n }),
              geometryType: "esriGeometryEnvelope",
              inSR: "4326",
              spatialRel: "esriSpatialRelIntersects",
              outSR: "4326",
              outFields: SVI_COUNTY_FIELDS.join(","),
              returnGeometry: "true",
              geometryPrecision: "5",
              maxAllowableOffset: "0.0005",
              orderByFields: "FIPS",
              resultRecordCount: String(SVI_PAGE),
              resultOffset: String(page * SVI_PAGE),
            },
          },
          25_000,
        );
        for (const f of res.features) features.push({ type: "Feature", geometry: f.geometry, properties: f.properties ?? {} });
        cut = res.truncated;
        if (!cut) break;
      }
      return { features, cut };
    },
    { deadlineMs: 45_000 },
  );
  const caveats = [...SVI_CAVEATS, "SVI's own tract polygons, simplified to 0.0005 degrees. A tract CDC does not rank carries -999 in every RPL_ field: not ranked, never least vulnerable."];
  if (r.value.cut) caveats.push(`CDC's answer for this box was still cut at ${SVI_TRACT_PAGES * SVI_PAGE} tracts: ask a smaller box for every tract.`);
  return ok(
    { type: "FeatureCollection", features: r.value.features },
    {
      meta: { source: SVI_ATTRIBUTION, level: "tract", bbox: b, count: r.value.features.length, capped: r.value.cut, breaks: [...SVI_BREAKS], cacheAge: r.age },
      ttlS: 86_400,
      provenance: [sviProv(SVI_TRACT_LAYER, "CDC_ATSDR_Social_Vulnerability_Index_2022_USA FeatureServer layer 2 (SVI2022 US tract), polygons simplified to 0.0005 degrees", r.age, [`bbox ${b.join(",")}`])],
      caveats,
    },
  );
}

async function sviPlaceOp(fips: string) {
  const layer = fips.length === 5 ? SVI_COUNTY_LAYER : SVI_TRACT_LAYER;
  const r = await cached(
    `svi:place:${fips}`,
    WEEK_MS,
    async () => {
      const res = await runRows("cdc-svi", { kind: "arcgis", layer, params: { where: `FIPS='${fips}'`, outFields: SVI_PLACE_FIELDS.join(","), returnGeometry: "false" } }, 20_000);
      const place = res.features.map((f) => sviPlace(f.properties ?? {})).find((p) => p != null) ?? null;
      return { place };
    },
    { deadlineMs: 25_000 },
  );
  if (!r.value.place) return notFound(`not in this release: CDC/ATSDR SVI 2022 has no row for FIPS ${fips} (SVI US covers the states and DC)`);
  return ok(
    { level: fips.length === 5 ? "county" : "tract", fips, ...r.value.place },
    {
      meta: { source: SVI_ATTRIBUTION, cacheAge: r.age },
      ttlS: 86_400,
      provenance: [sviProv(layer, `CDC_ATSDR_Social_Vulnerability_Index_2022_USA FeatureServer layer ${fips.length === 5 ? 1 : 2}, FIPS='${fips}'`, r.age)],
      caveats: [...SVI_CAVEATS, "Estimates (EP_) are percentages from ACS 2018-2022 with their margins of error (MP_) as CDC publishes them; null where CDC publishes none."],
    },
  );
}

// ---------------------------------------------------------------- schools (NCES EDGE 2024-25)

const DAY_MS = 24 * 3600_000;
const SCHOOLS_HELP = "op=schools needs bbox=w,s,e,n (at most 0.2 degrees a side around its centre), e.g. bbox=-97.8,30.2,-97.7,30.3";

async function schools(b: Bbox) {
  const r = await cached(
    `schools:${b.join(",")}`,
    DAY_MS,
    async () => {
      const [w, s, e, n] = b;
      const rows: Array<{ geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }> = [];
      let cut = false;
      for (let page = 0; page < NCES_MAX_PAGES; page++) {
        const res = await runRows(
          "nces-edge-public",
          {
            kind: "arcgis",
            layer: NCES_SCHOOLS,
            params: {
              where: "1=1",
              geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n }),
              geometryType: "esriGeometryEnvelope",
              inSR: "4326",
              spatialRel: "esriSpatialRelIntersects",
              outSR: "4326",
              outFields: SCHOOL_FIELDS.join(","),
              returnGeometry: "true",
              orderByFields: "NCESSCH",
              resultRecordCount: String(NCES_PAGE),
              resultOffset: String(page * NCES_PAGE),
            },
          },
          25_000,
        );
        rows.push(...res.features);
        cut = res.truncated;
        if (!cut) break;
      }
      const built = buildSchools(rows);
      return { features: built.features as LayerFeature[], hidden: built.hidden, cut };
    },
    { deadlineMs: 45_000 },
  );
  const caveats = [
    SCHOOLS_CAVEAT,
    "Directory and membership fields only: no race, sex or grade-level enrollment cell is requested. A negative value is one of CCD's reporting codes (-1 not reported, -2 not applicable, and others), shown as such, never as 0. The free or reduced-price lunch share is TOTFRL over TOTAL, two published counts.",
    "Schools NCES marks Inactive or Future are left out (`hidden`). School and district names and addresses are public institutions' as NCES publishes them.",
    "Only the returned `bbox` was loaded; outside it nothing is loaded, which is not the same as no school being there.",
  ];
  if (r.value.cut) caveats.push(`NCES's answer for this box was still cut at ${NCES_MAX_PAGES * NCES_PAGE} schools: ask a smaller box for every school.`);
  return ok(
    { type: "FeatureCollection", features: r.value.features },
    {
      meta: { source: SCHOOLS_ATTRIBUTION, bbox: b, count: r.value.features.length, hidden: r.value.hidden, truncated: r.value.cut, cacheAge: r.age },
      ttlS: 6 * 3600,
      provenance: [
        provenance(source("nces-edge-public"), {
          kind: "published",
          seriesId: "EDGE_ADMINDATA_PUBLICSCH_2425 MapServer layer 1 (Public School Administrative Data 2024-25)",
          upstreamUrl: NCES_SCHOOLS,
          period: "school year 2024-25",
          retrievedAt: at(r.age),
          notes: [`bbox ${b.join(",")}`],
        }),
      ],
      caveats,
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
      case "svi": {
        const level = q.get("level") ?? "county";
        if (level === "county") return await sviCounty();
        if (level === "tract") {
          const b = gridBbox(q.get("bbox"), SVI_TRACT_BOX_DEG, 0.05);
          return b ? await sviTract(b) : badRequest(SVI_HELP);
        }
        if (level === "place") {
          const fips = q.get("fips") ?? "";
          return /^(\d{5}|\d{11})$/.test(fips) ? await sviPlaceOp(fips) : badRequest(SVI_HELP);
        }
        return badRequest(SVI_HELP);
      }
      case "schools": {
        const b = gridBbox(q.get("bbox"), 0.2, 0.05);
        return b ? await schools(b) : badRequest(SCHOOLS_HELP);
      }
      default:
        return badRequest("unknown op: health | svi | schools");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
