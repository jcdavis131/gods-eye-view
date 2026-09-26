// Land API: flood zones, wetlands, public & protected lands and the ground
// elevation at a point, over keyless federal services. CORS open and
// edge-cached like /api/water, with the shared envelope (lib/server/respond.ts).
//
// FEMA NFHL appears twice in this app: /api/fabric?op=place identifies the one
// flood zone a point is in (with its NFIP community and FIRM panel); op=flood
// here draws the zones around the view. Same service, same politeness gate
// ("fema-nfhl"), same source id.
//
//   /api/land?op=flood&bbox=w,s,e,n        FEMA NFHL layer 28 (flood hazard zones), a
//                                          regulatory map, not a forecast. Box at most
//                                          ~9 km, snapped to a 0.02 degree grid.
//   /api/land?op=wetlands&bbox=w,s,e,n     USFWS National Wetlands Inventory polygons with
//                                          their Cowardin names and the year of the imagery
//                                          each was mapped from (NWI Data_Source). Same box
//                                          rules.
//   /api/land?op=publiclands&bbox=w,s,e,n  USGS PAD-US 4.1 fee, easement, designation and
//                                          proclamation areas with manager, owner agency,
//                                          local owner, easement holder, public access and
//                                          GAP status. Box at most 2 degrees, snapped to
//                                          0.25; a box taller than 1.5 degrees keeps the
//                                          largest PADUS_WIDE_MAX units, coarser.
//   /api/land?op=elevation&lon=..&lat=..   USGS 3DEP ground elevation (EPQS) with the
//                                          source DEM resolution.
//
// FEMA resets a fair share of connections, so every ArcGIS call retries (see
// lib/server/arcgis.ts). These maps change on the scale of months, so each
// snapped box is cached for a day and the edge holds it for an hour.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { arcgisLayerInfo, arcgisQuery, codedDomains, envelope, truncated } from "@/lib/server/arcgis";
import { jsonError, polite, upstream } from "@/lib/server/upstream";
import { badRequest, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4, retrying } from "@/lib/server/net";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import {
  buildFloodZones,
  buildPublicLands,
  buildWetlands,
  NWI_CAVEAT,
  nwiImagerySummary,
  PADUS_CATEGORIES,
  PADUS_FIELDS,
  parseEpqs,
  parseNwiSources,
  type ElevationReading,
  type NfhlProps,
  type NwiSource,
} from "@/lib/land/features";

export const maxDuration = 60;
export const OPTIONS = options;

// 3DEP / EPQS sits behind CloudFront, whose IPv6 path reset connections in probing (lib/server/net.ts).
preferIpv4();

const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";
const NWI = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0";
/** NWI mapping projects: the imagery year, date, scale and type each quad was drawn from. */
const NWI_SOURCE = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Data_Source/MapServer/0";
const PADUS = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name_PADUS/FeatureServer/0";
const EPQS = "https://epqs.nationalmap.gov/v1/json";

const DAY = 24 * 3600_000;
/**
 * Answer within the route's 60 s even when an upstream is slow: past this the
 * caller gets a 502 that says so, and the fetch finishes in the background and
 * is cached for the next request.
 */
const LAND_DEADLINE = { deadlineMs: 50_000 };

/** When a value `ageMs` old was fetched. */
const fetchedAt = (ageMs: number) => new Date(Date.now() - ageMs).toISOString();

/** Said on every box answer: the box is what was asked, and nothing outside it. */
const BOX_CAVEAT = "Only the returned `bbox` was loaded; outside it nothing is loaded, which is not the same as nothing being there.";

type Bbox = [number, number, number, number];

/** Clamp to `span` degrees around the centre and snap outward to a `grid` degree grid. */
function snapBbox(v: Bbox, span: number, grid: number): Bbox {
  let [w, s, e, n] = v;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  w = Math.max(w, cx - span / 2, -180);
  e = Math.min(e, cx + span / 2, 180);
  s = Math.max(s, cy - span / 2, -90);
  n = Math.min(n, cy + span / 2, 90);
  const f = (x: number) => Number((Math.floor(x / grid) * grid).toFixed(4));
  const c = (x: number) => Number((Math.ceil(x / grid) * grid).toFixed(4));
  return [f(w), f(s), c(e), c(n)];
}

function parseBbox(raw: string | null, span: number, grid: number): Bbox | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  if (v[0] >= v[2] || v[1] >= v[3]) return null;
  return snapBbox(v as Bbox, span, grid);
}

interface OpResult {
  data: unknown;
  meta: Record<string, unknown>;
  ttlS: number;
  provenance: Provenance[];
  caveats?: string[];
}

async function opFlood(bbox: Bbox): Promise<OpResult> {
  const r = await cached("nfhl:" + bbox.join(","), DAY, async () => {
    const fc = await arcgisQuery<NfhlProps>(
      "fema-nfhl",
      NFHL,
      {
        where: "1=1",
        ...envelope(bbox),
        outFields: "FLD_AR_ID,FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH,LEN_UNIT,V_DATUM,DFIRM_ID,STUDY_TYP",
        returnGeometry: "true",
        // ~3 m generalisation: the ungeneralised answer for 2 x 2 km of downtown San Antonio was 136 kB.
        maxAllowableOffset: "0.00003",
        geometryPrecision: "6",
      },
      { gate: "fema-nfhl", minIntervalMs: 400, timeoutMs: 18_000, tries: 3 },
    );
    return { features: buildFloodZones(fc.features), truncated: truncated(fc) };
  }, LAND_DEADLINE);
  const caveats = [
    "A regulatory flood map (FIRM), not a forecast: it says nothing about whether anything is flooding now.",
    "The absence of a zone is not a finding of no flood risk: FEMA has not mapped everywhere, and zone D means no FEMA analysis.",
    BOX_CAVEAT,
  ];
  if (r.value.truncated) caveats.push("FEMA's record limit was hit; ask for a smaller box for every zone.");
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: {
      source: "FEMA National Flood Hazard Layer (layer 28, flood hazard zones)",
      caveat: "Regulatory flood map (FIRM), not a forecast.",
      bbox,
      truncated: r.value.truncated,
      cacheAge: r.age,
    },
    ttlS: 3600,
    provenance: [
      provenance(source("fema-nfhl"), {
        kind: "published",
        seriesId: "NFHL MapServer layer 28 (S_FLD_HAZ_AR, flood hazard zones)",
        upstreamUrl: NFHL,
        retrievedAt: fetchedAt(r.age),
        revision: "effective FIRM data; FEMA revises panels through map revisions and new studies",
        notes: [`bbox ${bbox.join(",")}`],
      }),
    ],
    caveats,
  };
}

/**
 * The NWI projects (quads) that touch a box, with their imagery dates. One small
 * query per box a day; past 20 s the wetlands go out undated and the lookup
 * finishes in the background for the next request.
 */
function nwiSources(bbox: Bbox): Promise<NwiSource[]> {
  return cached("nwi-src:" + bbox.join(","), DAY, async () => {
    const fc = await arcgisQuery(
      "usfws-nwi",
      NWI_SOURCE,
      {
        where: "1=1",
        ...envelope(bbox),
        outFields: "PROJECT_NAME,IMAGE_YR,IMAGE_DATE,IMAGE_SCALE,SOURCE_TYPE,EMULSION",
        returnGeometry: "true",
        maxAllowableOffset: "0.0005",
        geometryPrecision: "5",
      },
      { gate: "usfws-nwi", minIntervalMs: 300, timeoutMs: 15_000, tries: 2 },
    );
    return parseNwiSources(fc.features);
  }, { deadlineMs: 20_000 }).then((r) => r.value);
}

async function opWetlands(bbox: Bbox): Promise<OpResult> {
  // The wetlands and their mapping projects are cached apart, so a source lookup that failed
  // once is asked again next time instead of leaving a day of wetlands undated. A failed
  // lookup leaves the imagery date unknown; it never holds back the wetlands.
  const [r, sources] = await Promise.all([
    cached("nwi:" + bbox.join(","), DAY, async () => {
      const fc = await arcgisQuery(
        "usfws-nwi",
        NWI,
        {
          where: "1=1",
          ...envelope(bbox),
          outFields: [
            "Wetlands.OBJECTID",
            "Wetlands.ATTRIBUTE",
            "Wetlands.WETLAND_TYPE",
            "Wetlands.ACRES",
            "NWI_Wetland_Codes.SYSTEM_NAME",
            "NWI_Wetland_Codes.SUBSYSTEM_NAME",
            "NWI_Wetland_Codes.CLASS_NAME",
            "NWI_Wetland_Codes.WATER_REGIME_NAME",
          ].join(","),
          returnGeometry: "true",
          maxAllowableOffset: "0.00004",
          geometryPrecision: "6",
        },
        { gate: "usfws-nwi", minIntervalMs: 300, timeoutMs: 25_000, tries: 2 },
      );
      return { rows: fc.features, truncated: truncated(fc) };
    }, LAND_DEADLINE),
    nwiSources(bbox).catch(() => null),
  ]);
  const imagery = sources ? nwiImagerySummary(sources) : null;
  const retrievedAt = fetchedAt(r.age);
  const prov = [
    provenance(source("usfws-nwi"), { kind: "published", seriesId: "Wetlands MapServer layer 0 (with the NWI_Wetland_Codes join)", upstreamUrl: NWI, retrievedAt, notes: [`bbox ${bbox.join(",")}`] }),
  ];
  if (imagery) {
    prov.push(
      provenance(source("usfws-nwi"), {
        kind: "published",
        seriesId: "Data_Source MapServer layer 0 (mapping projects)",
        upstreamUrl: NWI_SOURCE,
        retrievedAt,
        notes: [imagery.years.length ? `imagery years in this box: ${imagery.years.join(", ")}` : "imagery year not recorded for the projects in this box"],
      }),
    );
  }
  const caveats = [
    `USFWS: ${NWI_CAVEAT}`,
    "A habitat inventory mapped from imagery that can be decades old, not a jurisdictional (Clean Water Act) delineation.",
    BOX_CAVEAT,
  ];
  if (!imagery) caveats.push("NWI's Data_Source layer did not answer, so the imagery year of these polygons is unknown this time (imageYears: null).");
  if (r.value.truncated) caveats.push("NWI's record limit was hit; ask for a smaller box for every polygon.");
  return {
    data: { type: "FeatureCollection", features: buildWetlands(r.value.rows, sources ?? []) },
    meta: {
      source: "USFWS National Wetlands Inventory (Wetlands and Data_Source layers)",
      // Years of the imagery the polygons in this box were drawn from; null when NWI's source layer did not answer.
      imageYears: imagery?.years ?? null,
      projects: imagery?.projects ?? null,
      caveat: NWI_CAVEAT,
      bbox,
      truncated: r.value.truncated,
      cacheAge: r.age,
    },
    ttlS: imagery ? 3600 : 600,
    provenance: prov,
    caveats,
  };
}

let padusDomains: Promise<Map<string, Map<string, string>>> | null = null;
function padusLookup(): Promise<Map<string, Map<string, string>>> {
  if (!padusDomains) {
    padusDomains = arcgisLayerInfo("padus", PADUS, "padus")
      .then(codedDomains)
      .catch((err) => {
        padusDomains = null;
        throw err;
      });
  }
  return padusDomains;
}

/** A box taller than this (degrees north-south) is the layer's wide view: fewer, coarser units. */
const PADUS_WIDE_SPAN = 1.5;
/** Units kept in a wide box, largest first (a 2 degree Front Range box holds more than 2,000). */
const PADUS_WIDE_MAX = 600;
/** Generalisation (degrees) per tier: ~50 m near, ~250 m wide. */
const PADUS_NEAR_OFFSET = 0.0005;
const PADUS_WIDE_OFFSET = 0.0025;
/** Response budget: Vercel refuses function bodies over 4.5 MB. */
const PADUS_MAX_BYTES = 3_000_000;

function padusQuery(bbox: Bbox, offset: number, maxRecords?: number) {
  return arcgisQuery(
    "padus",
    PADUS,
    {
      where: `Category IN (${PADUS_CATEGORIES.map((c) => `'${c}'`).join(",")})`,
      ...envelope(bbox),
      outFields: PADUS_FIELDS.join(","),
      returnGeometry: "true",
      maxAllowableOffset: String(offset),
      geometryPrecision: "5",
      // Largest first, so a capped answer keeps the biggest units.
      orderByFields: "GIS_Acres DESC",
      ...(maxRecords ? { resultRecordCount: String(maxRecords) } : {}),
    },
    { gate: "padus", minIntervalMs: 300, timeoutMs: 25_000, tries: 2 },
  );
}

async function opPublicLands(bbox: Bbox): Promise<OpResult> {
  const r = await cached("padus:" + bbox.join(","), DAY, async () => {
    // North-south extent: the east-west one grows with latitude for the same view.
    const wide = bbox[3] - bbox[1] > PADUS_WIDE_SPAN;
    // Units run from a city park to millions of acres. One generalisation per tier (~1/2000
    // of a near box, ~1/800 of a wide one), so a unit comes back the same from every box
    // and the browser can keep what it already drew.
    let offset = wide ? PADUS_WIDE_OFFSET : PADUS_NEAR_OFFSET;
    let max = wide ? PADUS_WIDE_MAX : undefined;
    const domainsP = padusLookup().catch(() => new Map<string, Map<string, string>>());
    let fc = await padusQuery(bbox, offset, max);
    const domains = await domainsP;
    let features = buildPublicLands(fc.features, domains, { box: bbox, minDeg: offset });
    let capped = (max != null && fc.features.length >= max) || truncated(fc);
    let generalised = false;
    if (JSON.stringify(features).length > PADUS_MAX_BYTES) {
      // One coarser retry with half the units rather than an answer the platform refuses.
      offset *= 2.5;
      max = Math.min(max ?? PADUS_WIDE_MAX, Math.max(100, Math.floor(fc.features.length / 2)));
      fc = await padusQuery(bbox, offset, max);
      features = buildPublicLands(fc.features, domains, { box: bbox, minDeg: offset });
      capped = true;
      generalised = true;
    }
    return { features, truncated: capped, decoded: domains.size > 0, wide, offset, max, generalised };
  }, LAND_DEADLINE);
  const caveats = [
    "Public access is PAD-US's code for each unit; it is not permission to enter.",
    "The land inside a proclamation boundary is not all public, and an easement's owner keeps the land (the holder has the rights the easement grants).",
    "Owners, managers and easement holders are as PAD-US publishes them; nothing is added or joined from another source.",
    BOX_CAVEAT,
  ];
  if (r.value.truncated) caveats.push(r.value.max ? `Only the largest ${r.value.max} units in this box are returned; ask for a smaller box for the rest.` : "PAD-US's record limit was hit; ask for a smaller box for every unit.");
  if (!r.value.decoded) caveats.push("PAD-US's coded-value domains did not load, so coded fields show their codes this time.");
  return {
    data: { type: "FeatureCollection", features: r.value.features },
    meta: {
      source: "USGS Gap Analysis Project, PAD-US 4.1 (doi:10.5066/P96WBCHS)",
      categories: PADUS_CATEGORIES,
      bbox,
      // true when units were left out: the wide-view cap (largest kept) or the service's own limit.
      truncated: r.value.truncated,
      maxUnits: r.value.max ?? null,
      generalisationDeg: r.value.offset,
      coarsenedForSize: r.value.generalised,
      domainsDecoded: r.value.decoded,
      cacheAge: r.age,
    },
    ttlS: 3600,
    provenance: [
      provenance(source("usgs-padus"), {
        kind: "published",
        seriesId: `Manager_Name_PADUS FeatureServer layer 0 (${PADUS_CATEGORIES.join(", ")})`,
        upstreamUrl: PADUS,
        retrievedAt: fetchedAt(r.age),
        notes: [`bbox ${bbox.join(",")}`, `generalised to ${r.value.offset}° (maxAllowableOffset)`],
      }),
    ],
    caveats,
  };
}

async function opElevation(lon: number, lat: number): Promise<OpResult> {
  const x = Number(lon.toFixed(5));
  const y = Number(lat.toFixed(5));
  const qs = new URLSearchParams({ x: String(x), y: String(y), units: "Meters", wkid: "4326", includeDate: "false" });
  let reading: ElevationReading;
  let ttlS = 24 * 3600;
  let age = 0;
  try {
    const r = await cached(`epqs:${x},${y}`, DAY, async () => {
      const text = await retrying(async () => {
        const res = await polite("epqs", 150, 30_000, () => upstream("usgs-epqs", `${EPQS}?${qs}`, { timeoutMs: 15_000 }));
        return res.text();
      });
      let j: Parameters<typeof parseEpqs>[2];
      try {
        j = JSON.parse(text);
      } catch {
        throw new NoValue(text);
      }
      return parseEpqs(x, y, j);
    });
    reading = r.value;
    age = r.age;
  } catch (err) {
    if (!(err instanceof NoValue)) throw err;
    // Outside 3DEP coverage (and over open water) EPQS answers 200 with a plain-text
    // "Call failed. [...]". Relay it as no value; not held in memory, briefly at the edge.
    reading = { lon: x, lat: y, note: `EPQS returned no value: ${err.message.replace(/\s+/g, " ").trim().slice(0, 80)}` };
    ttlS = 600;
  }
  const notes: string[] = [];
  if (reading.resolutionM != null) notes.push(`source DEM resolution ${reading.resolutionM} m`);
  if (reading.note) notes.push(reading.note);
  return {
    data: reading,
    meta: { source: "USGS 3DEP Elevation Point Query Service", units: "metres", cacheAge: age },
    ttlS,
    provenance: [
      provenance(source("usgs-epqs"), {
        kind: "published",
        seriesId: reading.rasterId != null ? `raster ${reading.rasterId}` : undefined,
        upstreamUrl: `${EPQS}?${qs}`,
        retrievedAt: fetchedAt(age),
        notes: notes.length ? notes : undefined,
      }),
    ],
    caveats:
      reading.metres == null
        ? ["EPQS has no value here: it covers the United States (3DEP), and returns none outside that coverage and over some open water."]
        : ["Bare-earth elevation in metres above the DEM's vertical datum (NAVD88 in the conterminous US)."],
  };
}

/** EPQS answered, but with text instead of a JSON value. */
class NoValue extends Error {}

function respond(r: OpResult) {
  return ok(r.data, { meta: r.meta, provenance: r.provenance, caveats: r.caveats, ttlS: r.ttlS });
}

/** A query parameter as a finite number; a missing or blank one is null, never 0 (Number(null) is 0). */
function numParam(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const BBOX_HELP = "bbox=w,s,e,n required, west < east and south < north, e.g. bbox=-98.50,29.41,-98.47,29.44";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "flood": {
        const b = parseBbox(q.get("bbox"), 0.08, 0.02);
        if (!b) return badRequest(BBOX_HELP);
        return respond(await opFlood(b));
      }
      case "wetlands": {
        const b = parseBbox(q.get("bbox"), 0.08, 0.02);
        if (!b) return badRequest(BBOX_HELP);
        return respond(await opWetlands(b));
      }
      case "publiclands": {
        const b = parseBbox(q.get("bbox"), 2, 0.25);
        if (!b) return badRequest(BBOX_HELP);
        return respond(await opPublicLands(b));
      }
      case "elevation": {
        const lon = numParam(q.get("lon"));
        const lat = numParam(q.get("lat"));
        if (lon == null || lat == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return badRequest("lon and lat required, e.g. lon=-98.47&lat=29.465");
        return respond(await opElevation(lon, lat));
      }
      default:
        return badRequest("unknown op: flood | wetlands | publiclands | elevation");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
