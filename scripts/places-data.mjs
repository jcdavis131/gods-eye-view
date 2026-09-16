// Builds the offline place manifest: the three tables under lib/places/data
// that turn a county FIPS, a CBSA code or a USPS abbreviation into an
// identity - name, state, centroid, membership, neighbours - with zero
// network calls at request time.
//
//   node scripts/places-data.mjs --offline   states.json + metros.json, no network at all
//   node scripts/places-data.mjs             the full pull: counties, CBSA membership,
//                                            adjacency and Zillow region ids (needs egress)
//
// Why two modes. States (52) and metros (393) are derivable from what the
// repo already holds: the state table is public knowledge and lives inline
// below, and every metro is a row of lib/economy/data/msa_index.json. Both
// therefore ship COMPLETE and no build ever needs a host with egress to have
// them. Counties are not derivable: there is no county list anywhere in the
// repo or in node_modules, and the development sandbox refuses CONNECT, so
// counties.json ships as a SEED with complete:false and says so in its meta.
// While it is incomplete, lib/places/scope.ts validates a county URL
// structurally against the complete state table rather than 404ing the ~3,200
// real counties the seed cannot name.
//
// Nothing here stamps a timestamp unless it actually pulled something, so
// --offline is byte-idempotent (run it twice, git diff is empty) and it
// preserves whatever an earlier network pull wrote into metros.json.
//
// URL, layer and file shapes per the TIGERweb ArcGIS REST service directory,
// the Census county adjacency file and Zillow's public CSVs; unverified in
// sandbox. If a layer id has moved, change the constant here and print the
// service directory rather than guessing in two places.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const OFFLINE = args.includes("--offline");
const OUT_DIR = path.resolve("lib/places/data");
const MSA_INDEX = path.resolve("lib/economy/data/msa_index.json");
const UA = "embedding-atlas/0.1 (+https://github.com/jcdavis131/gods-eye-view; open-source globe)";

const TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2023/State_County/MapServer";
const COUNTY_LAYER = 13; // 1:20M generalized counties; matches TIGER_LAYER.county["20M"] in lib/economy/sources.ts
// CBSA polygons live in their own TIGERweb service. The layer id is the one
// thing in this script that cannot be checked without egress, so it is a
// named constant and it is recorded verbatim into MANIFEST.cbsaMethod.
const CBSA_SERVICE = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2023/CBSA/MapServer";
const CBSA_LAYER = 0;
const ADJACENCY_URL = "https://www2.census.gov/geo/docs/reference/county_adjacency2023.txt";
const ZILLOW_METRO_CSV = "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";

// The 50 states, DC and Puerto Rico. lon/lat is an approximate geographic
// centre, used only for hub ordering and as a last-resort fallback point; two
// decimals is deliberate, because a centroid precise to the metre would imply
// a precision this table does not have.
const STATES = [
  ["01", "AL", "Alabama", -86.83, 32.79],
  ["02", "AK", "Alaska", -152.0, 64.0],
  ["04", "AZ", "Arizona", -111.66, 34.29],
  ["05", "AR", "Arkansas", -92.44, 34.9],
  ["06", "CA", "California", -119.45, 37.18],
  ["08", "CO", "Colorado", -105.55, 38.99],
  ["09", "CT", "Connecticut", -72.73, 41.62],
  ["10", "DE", "Delaware", -75.51, 38.99],
  ["11", "DC", "District of Columbia", -77.02, 38.9],
  ["12", "FL", "Florida", -81.69, 28.63],
  ["13", "GA", "Georgia", -83.44, 32.65],
  ["15", "HI", "Hawaii", -156.37, 20.25],
  ["16", "ID", "Idaho", -114.66, 44.39],
  ["17", "IL", "Illinois", -89.2, 40.07],
  ["18", "IN", "Indiana", -86.28, 39.91],
  ["19", "IA", "Iowa", -93.5, 42.07],
  ["20", "KS", "Kansas", -98.38, 38.48],
  ["21", "KY", "Kentucky", -85.3, 37.53],
  ["22", "LA", "Louisiana", -91.96, 31.07],
  ["23", "ME", "Maine", -69.24, 45.37],
  ["24", "MD", "Maryland", -76.79, 39.04],
  ["25", "MA", "Massachusetts", -71.8, 42.26],
  ["26", "MI", "Michigan", -85.41, 44.35],
  ["27", "MN", "Minnesota", -94.31, 46.28],
  ["28", "MS", "Mississippi", -89.66, 32.74],
  ["29", "MO", "Missouri", -92.48, 38.37],
  ["30", "MT", "Montana", -109.65, 47.05],
  ["31", "NE", "Nebraska", -99.68, 41.53],
  ["32", "NV", "Nevada", -116.65, 39.33],
  ["33", "NH", "New Hampshire", -71.58, 43.69],
  ["34", "NJ", "New Jersey", -74.66, 40.19],
  ["35", "NM", "New Mexico", -106.11, 34.42],
  ["36", "NY", "New York", -75.5, 42.95],
  ["37", "NC", "North Carolina", -79.39, 35.54],
  ["38", "ND", "North Dakota", -100.47, 47.45],
  ["39", "OH", "Ohio", -82.79, 40.29],
  ["40", "OK", "Oklahoma", -97.51, 35.58],
  ["41", "OR", "Oregon", -120.56, 43.94],
  ["42", "PA", "Pennsylvania", -77.8, 40.87],
  ["44", "RI", "Rhode Island", -71.56, 41.68],
  ["45", "SC", "South Carolina", -80.9, 33.86],
  ["46", "SD", "South Dakota", -100.23, 44.45],
  ["47", "TN", "Tennessee", -86.35, 35.86],
  ["48", "TX", "Texas", -99.34, 31.49],
  ["49", "UT", "Utah", -111.68, 39.33],
  ["50", "VT", "Vermont", -72.66, 44.07],
  ["51", "VA", "Virginia", -78.87, 37.52],
  ["53", "WA", "Washington", -120.44, 47.38],
  ["54", "WV", "West Virginia", -80.61, 38.64],
  ["55", "WI", "Wisconsin", -89.74, 44.62],
  ["56", "WY", "Wyoming", -107.55, 42.99],
  ["72", "PR", "Puerto Rico", -66.47, 18.22],
].map(([fips, usps, name, lon, lat]) => ({ fips, usps, name, lon, lat }));

// ---------------------------------------------------------------- files

/** One row per line: a 3,000-row table stays reviewable in a diff. */
function writeTable(file, meta, rows) {
  const body = rows.map((r) => "    " + JSON.stringify(r)).join(",\n");
  const text = `{\n  "meta": ${JSON.stringify(meta, null, 2).replace(/\n/g, "\n  ")},\n  "rows": [\n${body}\n  ]\n}\n`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, file), text);
  console.log(`wrote ${file}: ${rows.length} rows`);
}

function readTable(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- network

const gates = new Map();
async function polite(name, minIntervalMs) {
  const g = gates.get(name) ?? { next: 0 };
  gates.set(name, g);
  const now = Date.now();
  const slot = Math.max(now, g.next);
  g.next = slot + minIntervalMs;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function get(name, url, { accept = "application/json", retries = 3, minIntervalMs = 150, timeoutMs = 60_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await polite(name, minIntervalMs);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept }, signal: ctl.signal });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return accept.includes("json") ? await r.json() : await r.text();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Every feature of an ArcGIS layer, paged by resultOffset until the server stops adding rows. */
async function pageAll(service, layer, params, pageSize = 2000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const qs = new URLSearchParams({ where: "1=1", f: "json", outSR: "4326", ...params, resultOffset: String(offset), resultRecordCount: String(pageSize) });
    const j = await get("tigerweb", `${service}/${layer}/query?${qs}`);
    if (j.error) throw new Error("TIGERweb: " + (j.error.message ?? "error"));
    const feats = j.features ?? [];
    out.push(...feats);
    console.log(`  ${service.split("/").slice(-2)[0]}/${layer}: ${out.length} features`);
    if (feats.length === 0 || (!j.exceededTransferLimit && feats.length < pageSize)) break;
  }
  return out;
}

// ---------------------------------------------------------------- geometry

/**
 * Even-odd ray casting over every ring of an esriJSON polygon. Holes need no
 * special case: a point inside a hole crosses its boundary an extra time and
 * flips back out.
 */
function pointInRings(lon, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function bboxOf(rings) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

// ---------------------------------------------------------------- parsing

/** "Austin-Round Rock-San Marcos, TX" -> "austin|TX". Mirrors metroShortKey in lib/economy/sources.ts. */
function metroShortKey(name) {
  const m = name.match(/^([^,]+),\s*([A-Z]{2})/);
  if (!m) return name;
  return `${m[1].split(/[-/]/)[0].trim().toLowerCase()}|${m[2]}`;
}

/** "Kansas City, MO-KS" -> ["MO","KS"]. */
function statesOf(name) {
  const suffix = name.split(",").pop() ?? "";
  return suffix
    .trim()
    .split("-")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * The Census county adjacency file has been published both tab-delimited
 * (name, geoid, neighbour name, neighbour geoid, with continuation rows whose
 * first two cells are blank) and pipe-delimited with every cell populated.
 * Reading the 5-digit codes positionally out of each line handles both, and a
 * line carrying one code is a continuation of the county above it.
 */
function parseAdjacency(txt) {
  const adj = new Map();
  let current = null;
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const codes = line
      .split(/\t|\|/)
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter((c) => /^[0-9]{5}$/.test(c));
    if (codes.length === 0) continue;
    let neighbour;
    if (codes.length >= 2) {
      current = codes[0];
      neighbour = codes[1];
    } else {
      neighbour = codes[0];
    }
    if (!current || neighbour === current) continue;
    if (!adj.has(current)) adj.set(current, new Set());
    adj.get(current).add(neighbour);
  }
  // Adjacency is a symmetric relation; the file is not always symmetric about it.
  for (const [a, set] of [...adj]) {
    for (const b of set) {
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(b).add(a);
    }
  }
  return adj;
}

// ---------------------------------------------------------------- builders

function buildStates() {
  writeTable(
    "states.json",
    {
      source: "Hand-maintained table of the 50 states, the District of Columbia and Puerto Rico (FIPS, USPS, name, approximate centre).",
      complete: true,
      pulled: null,
      count: STATES.length,
      note: "Public knowledge, not a pull. Centroids are approximate to two decimals and are used for hub ordering and fallback points only.",
    },
    STATES,
  );
  return STATES;
}

function buildMetros(enrich) {
  const index = JSON.parse(fs.readFileSync(MSA_INDEX, "utf8"));
  const previous = new Map();
  for (const r of readTable("metros.json")?.rows ?? []) previous.set(r.cbsa, r);
  const rows = index
    .map((m) => {
      const prior = previous.get(m.id);
      const extra = enrich?.get(m.id);
      return {
        cbsa: m.id,
        name: m.name,
        short: metroShortKey(m.name),
        states: statesOf(m.name),
        counties: extra?.counties ?? prior?.counties ?? [],
        lon: m.lon,
        lat: m.lat,
        zillowRegionId: extra ? extra.zillowRegionId : (prior?.zillowRegionId ?? null),
        zillowMatchedBy: extra ? extra.zillowMatchedBy : (prior?.zillowMatchedBy ?? null),
      };
    })
    .sort((a, b) => a.cbsa.localeCompare(b.cbsa));
  const priorMeta = readTable("metros.json")?.meta ?? {};
  writeTable(
    "metros.json",
    {
      source: "lib/economy/data/msa_index.json (BLS OEWS metropolitan areas, with TIGERweb centroids).",
      complete: true,
      pulled: enrich ? new Date().toISOString().slice(0, 10) : (priorMeta.pulled ?? null),
      count: rows.length,
      matchedToZillow: rows.filter((r) => r.zillowRegionId).length,
      note: "Identity only. counties[] and zillowRegionId are filled by the network pull; they are empty and null in an offline build.",
    },
    rows,
  );
  return rows;
}

// ---------------------------------------------------------------- the pull

async function pullCounties() {
  const byFips = new Map(STATES.map((s) => [s.fips, s]));

  console.log("counties: TIGERweb layer " + COUNTY_LAYER);
  const feats = await pageAll(TIGER, COUNTY_LAYER, {
    outFields: "GEOID,NAME,STATE,CENTLAT,CENTLON",
    returnGeometry: "false",
    orderByFields: "GEOID",
  });
  const counties = [];
  for (const f of feats) {
    const a = f.attributes ?? {};
    const geoid = String(a.GEOID ?? "");
    const state = byFips.get(geoid.slice(0, 2));
    const lon = Number(a.CENTLON);
    const lat = Number(a.CENTLAT);
    if (!/^[0-9]{5}$/.test(geoid) || !state || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      console.warn("  skipped unusable county row " + JSON.stringify(a));
      continue;
    }
    counties.push({ geoid, name: String(a.NAME), stusab: state.usps, stateFips: state.fips, stateName: state.name, lon, lat, cbsa: null, adj: [] });
  }
  counties.sort((a, b) => a.geoid.localeCompare(b.geoid));

  console.log("cbsa: TIGERweb " + CBSA_SERVICE + " layer " + CBSA_LAYER);
  const cbsaFeats = await pageAll(CBSA_SERVICE, CBSA_LAYER, { outFields: "GEOID,NAME,BASENAME", returnGeometry: "true" });
  const polys = [];
  for (const f of cbsaFeats) {
    const rings = f.geometry?.rings;
    const geoid = String(f.attributes?.GEOID ?? "");
    if (!rings?.length || !/^[0-9]{5}$/.test(geoid)) continue;
    polys.push({ cbsa: geoid, name: String(f.attributes?.NAME ?? ""), rings, bbox: bboxOf(rings) });
  }
  for (const c of counties) {
    for (const p of polys) {
      if (c.lon < p.bbox[0] || c.lon > p.bbox[2] || c.lat < p.bbox[1] || c.lat > p.bbox[3]) continue;
      if (pointInRings(c.lon, c.lat, p.rings)) {
        c.cbsa = p.cbsa;
        break;
      }
    }
  }

  console.log("adjacency: " + ADJACENCY_URL);
  const adj = parseAdjacency(await get("census", ADJACENCY_URL, { accept: "text/plain" }));
  const known = new Set(counties.map((c) => c.geoid));
  for (const c of counties) c.adj = [...(adj.get(c.geoid) ?? [])].filter((g) => known.has(g)).sort();

  return { counties, cbsaCount: polys.length };
}

async function pullZillowMetros(metroNames) {
  console.log("zillow metros: " + ZILLOW_METRO_CSV);
  const csv = await get("zillow", ZILLOW_METRO_CSV, { accept: "text/csv,text/plain,*/*" });
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const iId = header.indexOf("RegionID");
  const iName = header.indexOf("RegionName");
  const iType = header.indexOf("RegionType");
  const byName = new Map();
  const byShort = new Map();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cells = splitCsvLine(line);
    if (cells.length < 3 || cells[iType] !== "msa") continue;
    const name = cells[iName];
    const id = cells[iId];
    if (!byName.has(name)) byName.set(name, id);
    if (!byShort.has(metroShortKey(name))) byShort.set(metroShortKey(name), id);
  }
  const out = new Map();
  for (const [cbsa, name] of metroNames) {
    const exact = byName.get(name);
    const short = byShort.get(metroShortKey(name));
    out.set(cbsa, {
      zillowRegionId: exact ?? short ?? null,
      zillowMatchedBy: exact ? "exact" : short ? "short" : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  buildStates();

  if (OFFLINE) {
    buildMetros(null);
    const seed = readTable("counties.json");
    console.log(`counties.json left alone: ${seed?.rows?.length ?? 0} rows, complete=${seed?.meta?.complete ?? "unknown"}`);
    return;
  }

  const { counties, cbsaCount } = await pullCounties();
  const existing = readTable("counties.json")?.rows ?? [];
  if (existing.length && counties.length < existing.length * 0.98) {
    throw new Error(`refusing to shrink counties.json from ${existing.length} to ${counties.length} (more than 2 percent below)`);
  }
  const withCbsa = counties.filter((c) => c.cbsa).length;
  if (withCbsa < 1100) {
    throw new Error(`refusing to write counties.json: only ${withCbsa} counties landed in a CBSA (expected at least 1100); check CBSA layer ${CBSA_LAYER}`);
  }

  const membership = new Map();
  for (const c of counties) if (c.cbsa) membership.set(c.cbsa, (membership.get(c.cbsa) ?? 0) + 1);
  console.log(`cbsa membership (${membership.size} CBSAs, ${withCbsa} counties):`);
  for (const [cbsa, n] of [...membership].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`  ${cbsa} ${n}`);

  const cbsaMethod = `point-in-polygon of each county's Census internal point (CENTLON/CENTLAT) against ${CBSA_SERVICE} layer ${CBSA_LAYER}, ${cbsaCount} CBSA polygons`;
  const pulled = new Date().toISOString().slice(0, 10);
  writeTable(
    "counties.json",
    {
      source: `TIGERweb ${TIGER} layer ${COUNTY_LAYER}; adjacency from ${ADJACENCY_URL}.`,
      complete: true,
      pulled,
      count: counties.length,
      withCbsa,
      cbsaMethod,
      note: "Places only: name, state, Census internal point, CBSA membership and neighbouring counties. No addresses, no parcels, no people.",
    },
    counties,
  );

  const index = JSON.parse(fs.readFileSync(MSA_INDEX, "utf8"));
  const zillow = await pullZillowMetros(index.map((m) => [m.id, m.name]));
  const inMetro = new Map();
  for (const c of counties) {
    if (!c.cbsa) continue;
    if (!inMetro.has(c.cbsa)) inMetro.set(c.cbsa, []);
    inMetro.get(c.cbsa).push(c.geoid);
  }
  const enrich = new Map();
  for (const m of index) {
    enrich.set(m.id, { ...(zillow.get(m.id) ?? { zillowRegionId: null, zillowMatchedBy: null }), counties: (inMetro.get(m.id) ?? []).sort() });
  }
  buildMetros(enrich);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
