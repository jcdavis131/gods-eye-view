// Hazards API: live wildfires, satellite fire detections and hazard alerts,
// every upstream keyless. CORS open and edge-cached like /api/water, with the
// shared envelope (lib/server/respond.ts): `data`, `provenance`,
// `generatedAt`, `caveats`, and the route's own counts beside them.
//
//   /api/hazards?op=wildfire              NIFC WFIGS current perimeters (containment,
//                                         perimeter capture time) and incident points for
//                                         fires with no perimeter yet. US only.
//   /api/hazards?op=fires&bbox=w,s,e,n    NASA FIRMS hotspots of the last 24 h (VIIRS
//                                         S-NPP, VIIRS NOAA-20, MODIS) inside the box,
//                                         binned to at most `max` rows (default 5000)
//                                         keeping the brightest detection per cell.
//   /api/hazards?op=alerts                NWS active alerts (polygon, or the counties the
//                                         alert lists), current GDACS events (quakes the
//                                         USGS 24 h feed also has carry alsoInUsgs; none
//                                         is dropped) and NASA EONET open volcano events.
//                                         Severities as published. NWS alerts the live
//                                         feed behind Live warnings outlined carry
//                                         liveOutlined (none is dropped either).
//   /api/hazards?op=nri&bbox=w,s,e,n[&level=county|tract]
//                                         FEMA National Risk Index (December 2025): composite
//                                         risk, expected annual loss, social vulnerability,
//                                         community resilience and the 18 hazard ratings, as
//                                         FEMA publishes them. level=county (box at most 18
//                                         degrees, snapped to 1, as op=areas): attribute rows only, joined
//                                         by FIPS onto the county outlines the globe draws;
//                                         level=tract (box at most 0.4 degrees, snapped to
//                                         0.05): NRI's tract polygons, paged by 2,000. Held a
//                                         week; answers or fails within 45 s.
//   /api/hazards?op=nri&fips=48453        One county (5 digits) or tract (11 digits) by FIPS,
//                                         the same named fields, no geometry; 404 "not in the
//                                         index" when FEMA has no row. For a click answer and
//                                         the MCP social_vulnerability pairing. Held a week.
//
// FIRMS confidence stays on each instrument's own scale: VIIRS low / nominal /
// high, MODIS 0–100 %. Nothing here merges or rescales them.
//
// The alerts op waits at most SOURCE_DEADLINE_MS on each source and answers
// with the ones that made it; a slow GDACS never costs the NWS warnings.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, notFound, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4 } from "@/lib/server/net";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import {
  buildEonetVolcanoes,
  buildGdacs,
  buildNwsAlerts,
  buildWildfire,
  flagQuakesInUsgs,
  FIRE_ROW_COLUMNS,
  markLiveOutlined,
  selectFires,
} from "@/lib/hazards/features";
import { ALERTS_URL as LIVE_ALERTS_URL, liveFeed } from "@/lib/live/fetch";
import { liveDrawnIds } from "@/lib/live/live";
import {
  countiesByGeoid,
  EONET_VOLCANOES_URL,
  eonetVolcanoes,
  firms,
  FIRMS_FILES,
  GDACS_RSS_URL,
  gdacs,
  NWS_ALERTS_URL,
  nwsAlerts,
  SOURCE_DEADLINE_MS,
  TIGER_COUNTY_20M,
  USGS_DAY_URL,
  usgsDay,
  WFIGS_INCIDENTS_URL,
  WFIGS_PERIMETERS_URL,
  wfigs,
} from "@/lib/hazards/sources";
import type { LayerFeature } from "@/lib/layers/types";
import { arcgisQuery, arcgisRowsCapped, envelope, truncated } from "@/lib/server/arcgis";
import { parseBbox as gridBbox, type Bbox as GridBbox } from "@/lib/civic/bbox";
import { snapBbox as countyBox } from "@/lib/economy/assemble";
import { NRI_CAVEATS, NRI_CITATION, NRI_COUNTIES, NRI_COUNTY_FIELDS, NRI_MAX_PAGES, NRI_PAGE, NRI_SOVI_NOTE, NRI_TERMS, NRI_TRACT_BOX_DEG, NRI_TRACT_FIELDS, NRI_TRACTS } from "@/lib/hazards/nri";

export const maxDuration = 60;
export const OPTIONS = options;

// earthquake.usgs.gov (the GDACS quake marking) reset over IPv6 in probing (lib/server/net.ts).
preferIpv4();

type Bbox = [number, number, number, number];

/** Snap outward to a one-degree grid so nearby callers share a cache entry. */
function parseBbox(raw: string | null): Bbox | null {
  const v = (raw ?? "").split(",").map(Number);
  if (v.length !== 4 || !v.every(Number.isFinite)) return null;
  const [w, s, e, n] = v;
  if (w >= e || s >= n) return null;
  return [Math.max(-180, Math.floor(w)), Math.max(-90, Math.floor(s)), Math.min(180, Math.ceil(e)), Math.min(90, Math.ceil(n))];
}

/** When a value `ageMs` old at `now` was fetched. */
const fetchedAt = (ageMs: number, now = Date.now()) => new Date(now - ageMs).toISOString();

/** "Fri, 26 Sep 2026 06:12:00 GMT" (a Last-Modified header) as ISO, or undefined when it does not parse. */
function httpDate(s: string | undefined): string | undefined {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const NOT_A_WARNING_SERVICE =
  "These layers relay what their publishers post, minutes to hours late; they are not a warning service. Follow official channels and local authorities in an emergency.";

interface OpResult {
  data: unknown;
  meta: Record<string, unknown>;
  ttlS: number;
  provenance: Provenance[];
  caveats?: string[];
}

async function opWildfire(): Promise<OpResult> {
  const r = await wfigs();
  const built = buildWildfire(r.value.perims, r.value.incidents);
  const retrievedAt = fetchedAt(r.age);
  const caveats = [
    "NIFC: these data are not legal documents; no warranty of accuracy, reliability or completeness.",
    "The current services keep a fire until it is declared contained, controlled or out, so a 100 %-contained fire can still be listed.",
    "A perimeter's age is its capture time (poly_PolygonDateTime); where WFIGS publishes none the perimeter says so rather than borrowing the record's edit time.",
    NOT_A_WARNING_SERVICE,
  ];
  if (r.value.truncated) caveats.push("WFIGS hit its record limit; some fires may be missing.");
  return {
    data: { type: "FeatureCollection", features: built.features },
    meta: {
      source: "NIFC WFIGS (Current Interagency Fire Perimeters, Current Wildland Fire Incident Locations)",
      perimeters: built.perimeters,
      pointsWithoutPerimeter: built.points,
      truncated: r.value.truncated,
      cacheAge: r.age,
    },
    ttlS: 300,
    provenance: [
      provenance(source("nifc-wfigs"), { kind: "snapshot", seriesId: "WFIGS_Interagency_Perimeters_Current", upstreamUrl: WFIGS_PERIMETERS_URL, retrievedAt }),
      provenance(source("nifc-wfigs"), { kind: "snapshot", seriesId: "WFIGS_Incident_Locations_Current", upstreamUrl: WFIGS_INCIDENTS_URL, retrievedAt }),
    ],
    caveats,
  };
}

async function opFires(bbox: Bbox, max: number): Promise<OpResult> {
  const set = await firms();
  // Keyed on the files present, so a selection made while one file was late is not served once it lands.
  const r = await cached(`firms:sel:${set.files}:${bbox.join(",")}:${max}`, 10 * 60_000, async () => selectFires(set.tables, bbox, max));
  const retrievedAt = fetchedAt(set.age);
  const binned = r.value.cellDeg != null;
  const caveats = [
    "A hotspot is a hot pixel seen from orbit, not a confirmed fire: gas flares, volcanoes and hot industrial roofs appear too.",
    "Confidence is on each instrument's own scale (VIIRS low / nominal / high, MODIS 0-100 %); the two are never merged or rescaled.",
    NOT_A_WARNING_SERVICE,
  ];
  if (binned) caveats.push(`More than ${max} detections in the box: binned to cells of ${r.value.cellDeg!.toFixed(4)}°, each row the brightest detection (max FRP) with the count it stands for in \`detections\`.`);
  for (const f of set.failed) caveats.push(`${f} did not answer in time; its detections are missing, not absent.`);
  return {
    data: r.value.rows,
    meta: {
      source: "NASA FIRMS (VIIRS S-NPP, VIIRS NOAA-20, MODIS), last 24 h",
      columns: FIRE_ROW_COLUMNS,
      confidence: "VIIRS: low | nominal | high. MODIS: 0-100 %. Separate scales, never merged.",
      files: set.tables.map((t) => ({ product: t.product, detections: t.n, version: t.version })),
      failed: set.failed,
      lastModified: set.lastModified,
      bbox,
      total: r.value.total,
      returned: r.value.rows.length,
      cellDeg: r.value.cellDeg,
      cacheAge: set.age,
    },
    ttlS: set.failed.length ? 120 : 600,
    provenance: FIRMS_FILES.filter((f) => set.files.split(",").includes(f.id)).map((f) =>
      provenance(source("nasa-firms"), {
        kind: "snapshot",
        seriesId: f.product,
        upstreamUrl: f.url,
        releasedAt: httpDate(set.lastModified[f.id]),
        retrievedAt,
        notes: ["global 24 h near-real-time file, cut to the box here"],
      }),
    ),
    caveats,
  };
}

interface AlertsCounts {
  nws?: {
    alerts: number;
    drawnAsPolygon: number;
    drawnAsCounties: number;
    notDrawn: number;
    cacheAge: number;
    /** Whether the live feed Live warnings draws answered with its NWS alerts in time to mark them. */
    liveChecked?: boolean;
    /** Alerts marked liveOutlined. */
    liveOutlined?: number;
    /** Age of the live feed answer used for the marks, ms; null when it was not checked. */
    liveCacheAge?: number | null;
  };
  gdacs?: { events: number; quakesAlsoInUsgs: number; usgsChecked: boolean; via: string[]; failed: string[]; lists: Record<string, number | undefined>; truncated: boolean; cacheAge: number };
  eonet?: { volcanoes: number; cacheAge: number };
}

async function opAlerts(): Promise<OpResult> {
  // The feed Live warnings draws (/api/live), through the same cache entry and
  // TTL, read alongside the sources: it marks which NWS alerts that layer
  // outlines. Bounded like a source; late or failed, nothing is marked, so the
  // layer leaves nothing to Live warnings.
  const liveP = liveFeed({ deadlineMs: SOURCE_DEADLINE_MS }).catch(() => null);
  const r = await cached("hazards:alerts", 2 * 60_000, async () => {
    // Each source answers within SOURCE_DEADLINE_MS or is reported in `failed` (see lib/hazards/sources.ts).
    const [nws, gd, eo, usgs] = await Promise.allSettled([nwsAlerts(), gdacs(), eonetVolcanoes(), usgsDay()]);
    const features: LayerFeature[] = [];
    const failed: string[] = [];
    const counts: AlertsCounts = {};
    let usgsAge: number | null = null;
    if (nws.status === "fulfilled") {
      const alerts = nws.value.value;
      const needed = alerts.filter((a) => !a.geometry).flatMap((a) => a.counties);
      const counties = await countiesByGeoid(needed).catch(() => new Map());
      const built = buildNwsAlerts(alerts, counties);
      features.push(...built.features);
      counts.nws = { alerts: alerts.length, drawnAsPolygon: built.drawnPolygon, drawnAsCounties: built.drawnCounties, notDrawn: built.undrawn, cacheAge: nws.value.age };
    } else failed.push("NWS");
    let truncated = false;
    if (gd.status === "fulfilled") {
      const g = gd.value.value;
      let events = g.events;
      let alsoInUsgs = 0;
      if (usgs.status === "fulfilled") {
        ({ events, flagged: alsoInUsgs } = flagQuakesInUsgs(g.events, usgs.value.quakes));
        usgsAge = usgs.value.age;
      }
      features.push(...buildGdacs(events));
      truncated = g.truncated;
      counts.gdacs = {
        events: events.length,
        quakesAlsoInUsgs: alsoInUsgs,
        usgsChecked: usgs.status === "fulfilled",
        via: g.via,
        failed: g.failed,
        lists: g.counts,
        truncated: g.truncated,
        cacheAge: gd.value.age,
      };
    } else failed.push("GDACS");
    if (eo.status === "fulfilled") {
      const v = buildEonetVolcanoes(eo.value.value);
      features.push(...v);
      counts.eonet = { volcanoes: v.length, cacheAge: eo.value.age };
    } else failed.push("EONET");
    if (!features.length && failed.length === 3) throw new Error("NWS, GDACS and EONET all failed");
    return { features, counts, failed, truncated, usgsAge };
  });
  const v = r.value;
  const live = await liveP;
  const outlined = live ? liveDrawnIds(live.value) : null;
  // Marked per request on copies: the cached features are never mutated, and the marks follow the live feed's own refreshes.
  const marked = markLiveOutlined(v.features, outlined);
  const counts: AlertsCounts = v.counts.nws
    ? { ...v.counts, nws: { ...v.counts.nws, liveChecked: outlined != null, liveOutlined: marked.marked, liveCacheAge: outlined != null && live ? live.age : null } }
    : v.counts;
  // Each source's own age when the answer was assembled, plus the answer's age now.
  const now = Date.now();
  const at = (sourceAge: number) => fetchedAt(r.age + sourceAge, now);
  const prov: Provenance[] = [];
  if (v.counts.nws) {
    prov.push(provenance(source("nws-api"), { kind: "snapshot", upstreamUrl: NWS_ALERTS_URL, retrievedAt: at(v.counts.nws.cacheAge) }));
    if (v.counts.nws.drawnAsCounties) {
      prov.push(
        provenance(source("census-tigerweb"), {
          kind: "published",
          seriesId: "Generalized_ACS2023 State_County layer 13 (1:20M counties)",
          upstreamUrl: TIGER_COUNTY_20M,
          retrievedAt: at(v.counts.nws.cacheAge),
          notes: ["county outlines for NWS alerts that carry no polygon, by the SAME codes they list"],
        }),
      );
    }
  }
  if (v.counts.gdacs) {
    const g = v.counts.gdacs;
    // The RSS feed is the list of record; without it the citation falls back to GDACS's landing page.
    prov.push(provenance(source("gdacs"), { kind: "snapshot", upstreamUrl: g.via.includes("RSS") ? GDACS_RSS_URL : undefined, retrievedAt: at(g.cacheAge), notes: [`lists that answered: ${g.via.join(", ")}`] }));
  }
  if (v.counts.eonet) prov.push(provenance(source("nasa-eonet"), { kind: "snapshot", upstreamUrl: EONET_VOLCANOES_URL, retrievedAt: at(v.counts.eonet.cacheAge) }));
  if (v.counts.nws && outlined != null && live) {
    prov.push(
      provenance(source("nws-api"), {
        kind: "snapshot",
        upstreamUrl: LIVE_ALERTS_URL,
        retrievedAt: fetchedAt(live.age, now),
        notes: ["the Severe and Extreme feed Live warnings draws (/api/live); used only to mark the alerts that layer outlines (liveOutlined)"],
      }),
    );
  }
  if (v.usgsAge != null) {
    prov.push(provenance(source("usgs-earthquakes"), { kind: "snapshot", upstreamUrl: USGS_DAY_URL, retrievedAt: at(v.usgsAge), notes: ["used only to mark GDACS quakes the Earthquakes layer also draws"] }));
  }
  const caveats = [
    "Severities are each publisher's own: NWS severity, GDACS alert level (an estimate of humanitarian impact). Anything unrated says \"not rated by source\".",
    "An NWS alert drawn as counties covers every county it lists; NWS issued it for forecast zones inside them. Alerts with neither a polygon nor a known county are counted in counts.nws.notDrawn, not drawn.",
    NOT_A_WARNING_SERVICE,
  ];
  if (v.counts.nws) {
    caveats.push(
      outlined != null
        ? "liveOutlined marks an NWS alert the Live warnings feed (/api/live) outlined; the Hazard alerts layer leaves only those to Live warnings, and only while that layer is on and drawing them. Nothing is dropped here."
        : "The Live warnings feed did not answer in time or its NWS request failed, so no alert is marked liveOutlined and the Hazard alerts layer leaves none to it.",
    );
  }
  for (const f of v.failed) caveats.push(`${f} did not answer within ${SOURCE_DEADLINE_MS / 1000} s; its events are missing, not absent.`);
  if (v.truncated) caveats.push("GDACS's lists may be incomplete this time (the RSS feed, the only uncapped list, did not answer, or a capped list came back full).");
  return {
    data: { type: "FeatureCollection", features: marked.features },
    meta: {
      source: "NWS alerts/active + GDACS (RSS, EVENTS4APP, SEARCH) + NASA EONET (volcanoes)",
      counts,
      failed: v.failed,
      truncated: v.truncated,
      deadlineS: SOURCE_DEADLINE_MS / 1000,
      trimmed: true,
      cacheAge: r.age,
    },
    ttlS: v.failed.length ? 60 : 120,
    provenance: prov,
    caveats,
  };
}

const WEEK_MS = 7 * 24 * 3600_000;
const NRI_GATE = { gate: "fema-nri", minIntervalMs: 250, timeoutMs: 25_000, tries: 2 };
/** Two pages at two tries of 25 s each would outlast the function's 60 s; the answer lands in the cache regardless. */
const NRI_DEADLINE_MS = 45_000;

/**
 * FEMA NRI for a box. Counties: attribute rows only (the browser joins them by FIPS onto the
 * county outlines it already draws), one page and a second when the first is cut at 2,000.
 * Tracts: NRI's own polygons, paged by 2,000 up to NRI_MAX_PAGES; a box still cut there says so.
 */
async function opNri(b: GridBbox, level: "county" | "tract"): Promise<OpResult> {
  const layer = level === "county" ? NRI_COUNTIES : NRI_TRACTS;
  const r = await cached(`nri:${level}:${b.join(",")}`, WEEK_MS, async () => {
    const rows: Array<Record<string, unknown>> = [];
    const features: Array<{ type: "Feature"; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }> = [];
    let cut = false;
    for (let page = 0; page < (level === "county" ? 2 : NRI_MAX_PAGES); page++) {
      const base = {
        where: "1=1",
        ...envelope(b),
        orderByFields: level === "county" ? "STCOFIPS" : "TRACTFIPS",
        resultRecordCount: String(NRI_PAGE),
        resultOffset: String(page * NRI_PAGE),
      };
      if (level === "county") {
        const j = await arcgisRowsCapped<Record<string, unknown>>("fema-nri", layer, { ...base, outFields: NRI_COUNTY_FIELDS.join(","), returnGeometry: "false" }, NRI_GATE);
        rows.push(...j.rows);
        cut = j.exceeded;
      } else {
        const fc = await arcgisQuery("fema-nri", layer, { ...base, outFields: NRI_TRACT_FIELDS.join(","), returnGeometry: "true", geometryPrecision: "5", maxAllowableOffset: "0.0005" }, NRI_GATE);
        for (const f of fc.features) features.push({ type: "Feature", geometry: f.geometry, properties: f.properties as Record<string, unknown> });
        cut = truncated(fc);
      }
      if (!cut) break;
    }
    return { rows, features, cut };
  }, { deadlineMs: NRI_DEADLINE_MS });
  const caveats = [...NRI_CAVEATS, NRI_SOVI_NOTE, NRI_TERMS, NRI_CITATION];
  caveats.push("Ratings are FEMA's words, verbatim. 'Not Applicable', 'Insufficient Data', 'No Rating' and 'Data Unavailable' are not a class and never mean low.");
  if (level === "county") caveats.push("Counties come as attribute rows only: join them by STCOFIPS onto your own county outlines (the globe uses Census TIGERweb's current counties, which share NRI's Connecticut planning regions, 09110-09190).");
  if (r.value.cut) caveats.push(`FEMA's answer for this box was still cut at ${(level === "county" ? 2 : NRI_MAX_PAGES) * NRI_PAGE} records: ask a smaller box for every ${level}.`);
  const retrievedAt = new Date(Date.now() - r.age).toISOString();
  return {
    data: level === "county" ? { level, rows: r.value.rows } : { type: "FeatureCollection", features: r.value.features },
    meta: { source: "FEMA National Risk Index (December 2025)", level, bbox: b, count: level === "county" ? r.value.rows.length : r.value.features.length, capped: r.value.cut, cacheAge: r.age },
    ttlS: 86_400,
    provenance: [
      provenance(source("fema-nri"), {
        kind: "published",
        seriesId: `${level === "county" ? "National_Risk_Index_Counties" : "National_Risk_Index_Census_Tracts"} FeatureServer layer 0, ${level === "county" ? "attributes" : "polygons simplified to 0.0005 degrees"}`,
        upstreamUrl: layer,
        retrievedAt,
        notes: [`bbox ${b.join(",")}`],
      }),
    ],
    caveats,
  };
}

/**
 * One NRI row by FIPS: the county layer by STCOFIPS (5 digits) or the tract layer by TRACTFIPS
 * (11 digits), attributes only. Null when FEMA publishes no row (the route answers 404).
 */
async function opNriFips(fips: string): Promise<OpResult | null> {
  const county = fips.length === 5;
  const layer = county ? NRI_COUNTIES : NRI_TRACTS;
  const r = await cached(
    `nri:fips:${fips}`,
    WEEK_MS,
    async () => {
      const j = await arcgisRowsCapped<Record<string, unknown>>(
        "fema-nri",
        layer,
        { where: `${county ? "STCOFIPS" : "TRACTFIPS"}='${fips}'`, outFields: (county ? NRI_COUNTY_FIELDS : NRI_TRACT_FIELDS).join(","), returnGeometry: "false" },
        NRI_GATE,
      );
      return { row: j.rows[0] ?? null };
    },
    { deadlineMs: 30_000 },
  );
  if (!r.value.row) return null;
  return {
    data: { level: county ? "county" : "tract", fips, row: r.value.row },
    meta: { source: "FEMA National Risk Index (December 2025)", level: county ? "county" : "tract", cacheAge: r.age },
    ttlS: 86_400,
    provenance: [
      provenance(source("fema-nri"), {
        kind: "published",
        seriesId: `${county ? "National_Risk_Index_Counties" : "National_Risk_Index_Census_Tracts"} FeatureServer layer 0, ${county ? "STCOFIPS" : "TRACTFIPS"}='${fips}', attributes`,
        upstreamUrl: layer,
        retrievedAt: new Date(Date.now() - r.age).toISOString(),
      }),
    ],
    caveats: [...NRI_CAVEATS, NRI_SOVI_NOTE, NRI_TERMS, NRI_CITATION, "Ratings are FEMA's words, verbatim. 'Not Applicable', 'Insufficient Data', 'No Rating' and 'Data Unavailable' are not a class and never mean low."],
  };
}

function respond(r: OpResult) {
  return ok(r.data, { meta: r.meta, provenance: r.provenance, caveats: r.caveats, ttlS: r.ttlS });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "wildfire":
        return respond(await opWildfire());
      case "fires": {
        const b = parseBbox(q.get("bbox") ?? "-180,-90,180,90");
        if (!b) return badRequest("bbox=w,s,e,n required, west < east and south < north, e.g. bbox=-125,32,-114,42");
        const max = Math.round(Math.min(8000, Math.max(500, Number(q.get("max") ?? 5000) || 5000)));
        return respond(await opFires(b, max));
      }
      case "alerts":
        return respond(await opAlerts());
      case "nri": {
        const fips = q.get("fips");
        if (fips != null) {
          if (!/^(\d{5}|\d{11})$/.test(fips)) return badRequest("fips=<5-digit county or 11-digit tract FIPS>, e.g. fips=48453");
          const r = await opNriFips(fips);
          return r ? respond(r) : notFound(`not in the index: FEMA's National Risk Index has no ${fips.length === 5 ? "county" : "tract"} row for FIPS ${fips}`);
        }
        const level = q.get("level") ?? "county";
        if (level !== "county" && level !== "tract") return badRequest("level=county | tract");
        // Counties: the box /api/economy?op=areas snaps the same bbox to (18 degrees, 1 degree grid), so a client
        // joining onto those outlines has a row asked for every outline it drew.
        const raw = gridBbox(q.get("bbox"), 360, 0.0001);
        const b = level === "county" ? (raw ? countyBox(raw) : null) : gridBbox(q.get("bbox"), NRI_TRACT_BOX_DEG, 0.05);
        if (!b) return badRequest("bbox=w,s,e,n required, west < east and south < north, e.g. bbox=-99,29,-98,30");
        return respond(await opNri(b, level));
      }
      default:
        return badRequest(`unknown op: wildfire | fires | alerts | nri (FIRMS files: ${FIRMS_FILES.map((f) => f.id).join(", ")})`);
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
