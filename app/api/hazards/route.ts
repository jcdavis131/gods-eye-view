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
//                                         Severities as published.
//
// FIRMS confidence stays on each instrument's own scale: VIIRS low / nominal /
// high, MODIS 0–100 %. Nothing here merges or rescales them.
//
// The alerts op waits at most SOURCE_DEADLINE_MS on each source and answers
// with the ones that made it; a slow GDACS never costs the NWS warnings.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, ok, options, withCors } from "@/lib/server/respond";
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
  selectFires,
} from "@/lib/hazards/features";
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
  nws?: { alerts: number; drawnAsPolygon: number; drawnAsCounties: number; notDrawn: number; cacheAge: number };
  gdacs?: { events: number; quakesAlsoInUsgs: number; usgsChecked: boolean; via: string[]; failed: string[]; lists: Record<string, number | undefined>; truncated: boolean; cacheAge: number };
  eonet?: { volcanoes: number; cacheAge: number };
}

async function opAlerts(): Promise<OpResult> {
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
  if (v.usgsAge != null) {
    prov.push(provenance(source("usgs-earthquakes"), { kind: "snapshot", upstreamUrl: USGS_DAY_URL, retrievedAt: at(v.usgsAge), notes: ["used only to mark GDACS quakes the Earthquakes layer also draws"] }));
  }
  const caveats = [
    "Severities are each publisher's own: NWS severity, GDACS alert level (an estimate of humanitarian impact). Anything unrated says \"not rated by source\".",
    "An NWS alert drawn as counties covers every county it lists; NWS issued it for forecast zones inside them. Alerts with neither a polygon nor a known county are counted in counts.nws.notDrawn, not drawn.",
    NOT_A_WARNING_SERVICE,
  ];
  for (const f of v.failed) caveats.push(`${f} did not answer within ${SOURCE_DEADLINE_MS / 1000} s; its events are missing, not absent.`);
  if (v.truncated) caveats.push("GDACS's lists may be incomplete this time (the RSS feed, the only uncapped list, did not answer, or a capped list came back full).");
  return {
    data: { type: "FeatureCollection", features: v.features },
    meta: {
      source: "NWS alerts/active + GDACS (RSS, EVENTS4APP, SEARCH) + NASA EONET (volcanoes)",
      counts: v.counts,
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
      default:
        return badRequest(`unknown op: wildfire | fires | alerts (FIRMS files: ${FIRMS_FILES.map((f) => f.id).join(", ")})`);
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
