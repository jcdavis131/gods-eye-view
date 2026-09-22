// Place fabric API: every construct a point sits inside, from the smallest to
// the largest, with the relations the unit systems define between them.
//
//   /api/fabric?op=stack&lon=-97.74&lat=30.27               attributes only
//   /api/fabric?op=stack&lon=-97.74&lat=30.27&geometry=1    plus generalised outlines (the globe layer asks for these)
//   /api/fabric?op=stack&lon=-97.74&lat=30.27&format=csv    one row per construct
//   /api/fabric?op=field&kind=huc8&bbox=-100,28,-94,33      every unit of one kind in a box, with outlines
//   /api/fabric?op=field&pov=hydrologic&h=400000&bbox=...   the kind that emerges for a point of view at a camera height
//   /api/fabric?op=downstream&lon=-97.74&lat=30.27          the HUC-12 chain from the point toward the sea, one time-boxed leg
//   /api/fabric?op=downstream&from=120902050307             the next leg, from a truncated leg's `next`
//   /api/fabric?op=outlines&huc12=120902050306,...          outlines and centroids for up to 100 HUC-12s
//
// Upstreams, all keyless and asked in parallel: Census TIGERweb (state,
// county, place, tract, ZCTA, school, congressional and state legislative
// districts, metro area, urban area, tribal land, census division and
// region), USGS Watershed Boundary Dataset (HUC-2 to HUC-12 with the
// downstream HUC), EPA level III/IV ecoregions, FEMA National Flood Hazard
// Layer (zone, community, FIRM panel), NWS (forecast office, zone, time zone),
// USGS 3DEP elevation; plus the bundled Natural Earth country and the bundled
// EPA / FEMA / Federal Reserve regional lists. One failing upstream never
// fails the call: it is listed in `failed` and in the caveats.
//
// The point is snapped to a 0.001° grid (about 100 m) so nearby callers share
// a cache entry; `point` in the payload is the snapped point that was asked.
// Places and public boundaries only; nothing here is about a person.

import type { NextRequest } from "next/server";
import { fetchDownstream, fetchField, huc12Outlines, OUTLINE_BATCH, type DownstreamResult, type FieldResult } from "@/lib/fabric/fetch";
import { fetchFabric } from "@/lib/fabric/fetch";
import { clampFieldBbox, FIELD_POVS, FIELD_SPECS, isFieldKind, kindForScale, type BBox, type FieldPov } from "@/lib/fabric/field";
import { FABRIC_COLUMNS, fabricRows } from "@/lib/fabric/graph";
import type { Fabric } from "@/lib/fabric/types";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { cacheDelete, cached } from "@/lib/server/cache";
import { badRequest, csv, notFound, ok, options } from "@/lib/server/respond";
import { jsonError } from "@/lib/server/upstream";

export const maxDuration = 60;

const TTL_S = 6 * 3600;
const OPS = ["stack", "field", "downstream", "outlines"] as const;
const FIELD_TTL_S = 24 * 3600;
const DOWNSTREAM_TTL_S = 7 * 24 * 3600;

export const OPTIONS = options;

function provenanceFor(f: Fabric, retrievedAt: string): Provenance[] {
  const notes: Partial<Record<string, string[]>> = {
    "census-tigerweb": ["tigerWMS_Current: current-vintage legal and statistical boundaries; area is land area"],
    "usgs-wbd": ["area is total area; ToHUC names the downstream HUC-12"],
    "fema-nfhl": ["effective flood zone where FEMA has a digital FIRM; absence of a zone is not a finding of no flood risk"],
    "natural-earth": ["1:110m country outlines bundled with this app; coarse near coasts and borders"],
    "federal-regions": ["assigned by state from published lists; split Reserve-district states are named as split"],
  };
  return f.answered.map((id) => provenance(source(id), { kind: "published", retrievedAt, notes: notes[id] }));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "stack";
  if (!(OPS as readonly string[]).includes(op)) return badRequest(`unknown op: ${OPS.join(" | ")}`, { op });
  if (op === "field") return field(q);
  if (op === "downstream") return downstream(q);
  if (op === "outlines") return outlines(q);
  const lon = Number(q.get("lon"));
  const lat = Number(q.get("lat"));
  if (!q.get("lon") || !q.get("lat") || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
    return badRequest("lon and lat are required degrees: /api/fabric?op=stack&lon=-97.74&lat=30.27");
  const geometry = q.get("geometry") === "1" || q.get("geometry") === "true";
  const format = q.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return badRequest("format is json | csv", { format });

  const sLon = Math.round(lon * 1000) / 1000;
  const sLat = Math.round(lat * 1000) / 1000;
  const key = `fabric:${sLon},${sLat}:${geometry ? 1 : 0}`;
  try {
    const r = await cached(key, TTL_S * 1000, () => fetchFabric(sLon, sLat, { geometry }));
    const fabric = r.value;
    // A partial stack is not kept whole: the next caller re-asks only the
    // upstreams that failed (each answer is cached on its own in fetchFabric).
    if (fabric.failed.length) cacheDelete(key);
    const retrievedAt = new Date(Date.now() - r.age).toISOString();
    const prov = provenanceFor(fabric, retrievedAt);
    const caveats = [
      fabric.coverage,
      ...fabric.failed.map((x) => `${x.source} did not answer (${x.error}); its constructs are missing from this stack.`),
      "Relations are only those the unit systems define (GEOID and HUC nesting, OMB metro delineation) or an agency publishes (NWS zone to office, state to federal region). Everything else in the stack shares the point and nothing more is claimed.",
    ];
    if (format === "csv")
      return csv(fabricRows(fabric), { columns: [...FABRIC_COLUMNS], filename: `fabric-${sLon}_${sLat}.csv`, provenance: prov, caveats, ttlS: TTL_S });
    return ok(fabric, {
      provenance: prov,
      caveats,
      ttlS: TTL_S,
      meta: {
        source: fabric.answered.join(", "),
        snapped: { lon: sLon, lat: sLat, grid: 0.001 },
        constructs: fabric.nodes.length,
        cacheAge: r.age,
        globe: `/?lat=${sLat}&lon=${sLon}&h=120000&layers=constructs`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

function parseBbox(raw: string | null): BBox | null {
  const b = (raw ?? "").split(",").map(Number);
  if (b.length !== 4 || b.some((x) => !Number.isFinite(x))) return null;
  const [w, so, e, n] = b;
  if (w >= e || so >= n || w < -180 || e > 180 || so < -90 || n > 90) return null;
  return [w, so, e, n];
}

async function field(q: URLSearchParams) {
  const bbox = parseBbox(q.get("bbox"));
  if (!bbox) return badRequest("bbox=west,south,east,north is required, e.g. /api/fabric?op=field&kind=county&bbox=-100,28,-94,33");
  let kind = q.get("kind") ?? "";
  const pov = q.get("pov");
  if (!kind && pov) {
    if (!(FIELD_POVS as readonly string[]).includes(pov)) return badRequest(`pov is ${FIELD_POVS.join(" | ")}`, { pov });
    const h = Number(q.get("h"));
    if (!Number.isFinite(h) || h <= 0) return badRequest("pov needs h, the camera height in metres");
    kind = kindForScale(pov as FieldPov, h);
  }
  if (!isFieldKind(kind)) return badRequest(`kind is ${Object.keys(FIELD_SPECS).join(" | ")} (or pass pov and h)`, { kind });
  const clamped = clampFieldBbox(kind, bbox);
  try {
    const r: FieldResult = await fetchField(kind, clamped);
    const retrievedAt = new Date().toISOString();
    const caveats = [
      `US only. The box was clamped to ${FIELD_SPECS[kind]!.maxSpanDeg} degrees for ${kind} and snapped to a grid; bbox in the payload is what was asked.`,
      "Outlines are generalised for display; do not use them for boundary decisions.",
    ];
    if (r.truncated) caveats.push("The upstream stopped at its record limit; units at the edge of the box may be missing.");
    if (r.units.some((u) => u.facts["area basis"])) caveats.push("Where the upstream publishes no area, areaKm2 is computed from the generalised outline.");
    return ok(r, { provenance: [provenance(source(r.source), { kind: "published", retrievedAt })], caveats, ttlS: FIELD_TTL_S, meta: { source: r.source, kind, units: r.units.length } });
  } catch (err) {
    return jsonError(err);
  }
}

async function downstream(q: URLSearchParams) {
  const from = q.get("from");
  let start: { lon: number; lat: number } | { from: string };
  if (from) {
    if (!/^\d{12}$/.test(from)) return badRequest("from is a 12-digit HUC-12 code (the `next` of a truncated walk)", { from });
    start = { from };
  } else {
    const lon = Number(q.get("lon"));
    const lat = Number(q.get("lat"));
    if (!q.get("lon") || !q.get("lat") || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
      return badRequest("lon and lat (or from=<HUC-12>) are required: /api/fabric?op=downstream&lon=-97.74&lat=30.27");
    start = { lon: Math.round(lon * 1000) / 1000, lat: Math.round(lat * 1000) / 1000 };
  }
  const key = `fabric-downstream:${"from" in start ? start.from : `${start.lon},${start.lat}`}`;
  try {
    const r = await cached(key, DOWNSTREAM_TTL_S * 1000, () => fetchDownstream(start));
    const d: DownstreamResult | null = r.value;
    if (!d) return notFound("no HUC-12 at this point (outside the US, or water WBD does not cover)", start);
    if (d.truncated) cacheDelete(key);
    const caveats = [
      "The chain follows WBD ToHUC from HUC-12 to HUC-12; it is the watershed sequence, not a traced river line.",
      "Outlines and centroids come from op=outlines, in batches of up to 100 HUC-12 codes.",
    ];
    if (d.truncated) caveats.push(`This leg stopped at its time budget (WBD is slow on a cold basin). Continue with op=downstream&from=${d.next}.`);
    return ok(d, {
      provenance: [provenance(source("usgs-wbd"), { kind: "published", retrievedAt: new Date(Date.now() - r.age).toISOString(), notes: ["ToHUC as published in WBD"] })],
      caveats,
      ttlS: d.truncated ? 0 : DOWNSTREAM_TTL_S,
      meta: { source: "usgs-wbd", hops: d.steps.length, terminal: d.terminal, next: d.next ?? null, cacheAge: r.age },
    });
  } catch (err) {
    return jsonError(err);
  }
}

async function outlines(q: URLSearchParams) {
  const codes = (q.get("huc12") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!codes.length || codes.some((c) => !/^\d{12}$/.test(c)) || codes.length > OUTLINE_BATCH)
    return badRequest(`huc12 is a comma list of 1 to ${OUTLINE_BATCH} twelve-digit codes`);
  try {
    const r = await huc12Outlines(codes);
    return ok(r, {
      provenance: [provenance(source("usgs-wbd"), { kind: "published", retrievedAt: new Date().toISOString(), notes: ["outlines generalised to 0.004 degrees; centroids computed from them"] })],
      caveats: ["Outlines are generalised for display; centroids are computed by Embedding Atlas from the generalised outline."],
      ttlS: DOWNSTREAM_TTL_S,
      meta: { source: "usgs-wbd", units: Object.keys(r.outlines).length },
    });
  } catch (err) {
    return jsonError(err);
  }
}
