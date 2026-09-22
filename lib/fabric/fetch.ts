// Server side of the place fabric: ask every upstream about one point in
// parallel, parse what answered, list what did not, assemble the stack.
// Used by /api/fabric; the parsing and ordering live in parse.ts / graph.ts.

import { cached } from "@/lib/server/cache";
import { polite, upstreamJson } from "@/lib/server/upstream";
import type { SourceId } from "@/lib/provenance/sources";
import countriesJson from "@/lib/economy/data/countries.json";
import { bboxContains, geojsonRings, ringsBbox, ringsContain, roundRings, type BBox } from "./geo";
import { assembleFabric } from "./graph";
import {
  countryNodes,
  federalNodes,
  parseEcoregions,
  parseElevation,
  parseNfhl,
  parseNws,
  parseTiger,
  parseWbd,
  TIGER_COARSE,
  TIGER_FINE,
  type CountryIn,
  type IdentifyResponse,
  type NwsNamed,
  type NwsPoints,
} from "./parse";
import type { ConstructEdge, ConstructNode, Fabric } from "./types";

export const TIGER_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";
export const WBD_URL = "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer";
export const ECO_URL = "https://geodata.epa.gov/arcgis/rest/services/ORD/USEPA_Ecoregions_Level_III_and_IV/MapServer";
export const NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
export const NWS_URL = "https://api.weather.gov";
export const EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

/**
 * An ArcGIS identify URL for one point. `offset` is maxAllowableOffset in
 * degrees (server-side generalisation); omit it for attributes only.
 */
export function identifyUrl(base: string, lon: number, lat: number, layers: number[], offset?: number): string {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    layers: `all:${layers.join(",")}`,
    tolerance: "0",
    mapExtent: `${lon - 0.5},${lat - 0.5},${lon + 0.5},${lat + 0.5}`,
    imageDisplay: "400,400,96",
    returnGeometry: offset != null ? "true" : "false",
    f: "json",
  });
  if (offset != null) q.set("maxAllowableOffset", String(offset));
  return `${base}/identify?${q.toString()}`;
}

async function identify(name: string, url: string, timeoutMs: number): Promise<IdentifyResponse> {
  const j = await polite(name, 100, 30_000, () => upstreamJson<IdentifyResponse>(name, url, { timeoutMs }));
  if (j.error) throw new Error(`${name}: ${j.error.message ?? "identify failed"}`);
  return j;
}

interface CountryIndexEntry {
  c: CountryIn;
  rings: number[][][];
  bbox: BBox;
}
let countryIndex: CountryIndexEntry[] | null = null;

/** The Natural Earth country under a point, from the bundled 1:110m table. */
export function countryAt(lon: number, lat: number): { country: CountryIn; rings: number[][][] } | null {
  if (!countryIndex) {
    countryIndex = [];
    for (const c of (countriesJson as unknown as { features: CountryIn[] }).features) {
      const rings = geojsonRings(c.geometry);
      const bbox = ringsBbox(rings);
      if (bbox) countryIndex.push({ c, rings, bbox });
    }
  }
  for (const e of countryIndex) if (bboxContains(e.bbox, lon, lat) && ringsContain(e.rings, lon, lat)) return { country: e.c, rings: roundRings(e.rings, 3) };
  return null;
}

/** Is the point plausibly served by the US-only upstreams (50 states, PR, territories)? */
export function inUsReach(lon: number, lat: number): boolean {
  return (lat >= 17 && lat <= 72 && lon >= -180 && lon <= -64) || (lat >= 13 && lat <= 21 && lon >= 144 && lon <= 146.5) || (lat >= -15 && lat <= -10 && lon >= -172 && lon <= -168);
}

export interface FabricOptions {
  geometry: boolean;
}

interface Part {
  nodes: ConstructNode[];
  edges: ConstructEdge[];
  elevationM?: number;
  /** Further sources this part answered for (the federal lists ride on TIGERweb's state). */
  also?: SourceId[];
}

/** How long one upstream's answer for a point is kept. Boundaries change yearly at most. */
const PART_TTL_MS = 6 * 3600_000;

/**
 * After an upstream fails, callers skip it for this long and report it as
 * missing straight away, so one hung service (FEMA's is intermittently slow)
 * does not add its whole timeout to every stack until it recovers.
 */
const COOL_DOWN_MS = 5 * 60_000;
const coolDown = new Map<SourceId, { until: number; error: string }>();

async function withCoolDown(source: SourceId, run: () => Promise<Part>): Promise<Part> {
  const c = coolDown.get(source);
  if (c && c.until > Date.now()) throw new Error(`${c.error} (not retried for ${Math.ceil((c.until - Date.now()) / 60_000)} min)`);
  try {
    const part = await run();
    coolDown.delete(source);
    return part;
  } catch (err) {
    coolDown.set(source, { until: Date.now() + COOL_DOWN_MS, error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
    throw err;
  }
}

/**
 * Everything the fabric knows about one point. Never throws for an upstream
 * failure; lists it in `failed`. Each upstream's answer is cached on its own,
 * so a slow or failing service is retried next time without asking the ones
 * that already answered again.
 */
export async function fetchFabric(lon: number, lat: number, opts: FabricOptions): Promise<Fabric> {
  const g = opts.geometry;
  const nodes: ConstructNode[] = [];
  const edges: ConstructEdge[] = [];
  const answered: SourceId[] = [];
  const failed: { source: SourceId; error: string }[] = [];
  let elevationM: number | undefined;

  const country = countryAt(lon, lat);
  if (country) {
    nodes.push(...countryNodes(country.country, g ? country.rings : undefined));
    answered.push("natural-earth");
  }

  const tasks: Array<{ source: SourceId; run: () => Promise<Part> }> = [];
  if (inUsReach(lon, lat)) {
    tasks.push(
      {
        source: "census-tigerweb",
        run: async () => {
          const [fine, coarse] = await Promise.all([
            identify("tigerweb", identifyUrl(TIGER_URL, lon, lat, TIGER_FINE, g ? 0.002 : undefined), 20_000),
            identify("tigerweb", identifyUrl(TIGER_URL, lon, lat, TIGER_COARSE, g ? 0.02 : undefined), 20_000),
          ]);
          const got = [...parseTiger(fine), ...parseTiger(coarse)];
          const state = got.find((n) => n.kind === "state");
          const fed = state?.code ? federalNodes(state.code) : { nodes: [], edges: [] };
          return { nodes: [...got, ...fed.nodes], edges: fed.edges, also: fed.nodes.length ? ["federal-regions"] : [] };
        },
      },
      {
        source: "usgs-wbd",
        run: async () => {
          const [small, large] = await Promise.all([
            identify("usgs-wbd", identifyUrl(WBD_URL, lon, lat, [4, 5, 6], g ? 0.002 : undefined), 20_000),
            identify("usgs-wbd", identifyUrl(WBD_URL, lon, lat, [1, 2, 3], g ? 0.02 : undefined), 20_000),
          ]);
          const a = parseWbd(small);
          const b = parseWbd(large);
          return { nodes: [...a.nodes, ...b.nodes], edges: [...a.edges, ...b.edges] };
        },
      },
      {
        source: "epa-ecoregions",
        run: async () => ({ nodes: parseEcoregions(await identify("epa-ecoregions", identifyUrl(ECO_URL, lon, lat, [7, 11], g ? 0.01 : undefined), 15_000)), edges: [] }),
      },
      {
        source: "fema-nfhl",
        // Flood zones are a node only: their polygons are large and intricate.
        // The service is intermittently slow, so it gets the shortest leash.
        run: async () => ({ nodes: parseNfhl(await identify("fema-nfhl", identifyUrl(NFHL_URL, lon, lat, [3, 22, 28]), 10_000)), edges: [] }),
      },
      {
        source: "nws-api",
        run: async () => {
          const pts = await polite("nws", 100, 30_000, () =>
            upstreamJson<NwsPoints>("nws", `${NWS_URL}/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { timeoutMs: 12_000, headers: { accept: "application/geo+json" } }),
          );
          const zoneUrl = pts.properties?.forecastZone;
          const cwa = pts.properties?.cwa;
          const [zone, office] = await Promise.all([
            zoneUrl?.startsWith(NWS_URL) ? upstreamJson<NwsNamed>("nws", zoneUrl, { timeoutMs: 8_000 }).catch(() => null) : null,
            cwa ? upstreamJson<NwsNamed>("nws", `${NWS_URL}/offices/${encodeURIComponent(cwa)}`, { timeoutMs: 8_000 }).catch(() => null) : null,
          ]);
          return parseNws(pts, lon, lat, zone, office);
        },
      },
      {
        source: "usgs-epqs",
        run: async () => ({
          nodes: [],
          edges: [],
          elevationM: parseElevation(await upstreamJson<{ value?: string }>("usgs-epqs", `${EPQS_URL}?x=${lon}&y=${lat}&units=Meters&wkid=4326`, { timeoutMs: 12_000 })),
        }),
      },
    );
  }

  const settled = await Promise.allSettled(tasks.map((t) => cached(`fabric-part:${t.source}:${lon},${lat}:${g ? 1 : 0}`, PART_TTL_MS, () => withCoolDown(t.source, t.run))));
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      const part = s.value.value;
      nodes.push(...part.nodes);
      edges.push(...part.edges);
      if (part.elevationM != null) elevationM = part.elevationM;
      answered.push(tasks[i].source, ...(part.also ?? []));
    } else {
      failed.push({ source: tasks[i].source, error: s.reason instanceof Error ? s.reason.message.slice(0, 160) : String(s.reason) });
    }
  });

  return assembleFabric({ lon, lat, elevationM, nodes, edges, answered, failed });
}
