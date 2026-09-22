// Place fabric API: every construct a point sits inside, from the smallest to
// the largest, with the relations the unit systems define between them.
//
//   /api/fabric?op=stack&lon=-97.74&lat=30.27               attributes only
//   /api/fabric?op=stack&lon=-97.74&lat=30.27&geometry=1    plus generalised outlines (the globe layer asks for these)
//   /api/fabric?op=stack&lon=-97.74&lat=30.27&format=csv    one row per construct
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
import { fetchFabric } from "@/lib/fabric/fetch";
import { FABRIC_COLUMNS, fabricRows } from "@/lib/fabric/graph";
import type { Fabric } from "@/lib/fabric/types";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { cacheDelete, cached } from "@/lib/server/cache";
import { badRequest, csv, ok, options } from "@/lib/server/respond";
import { jsonError } from "@/lib/server/upstream";

export const maxDuration = 60;

const TTL_S = 6 * 3600;
const OPS = ["stack"] as const;

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
