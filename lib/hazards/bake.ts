// The two county hazard-history bakes (scripts/bake-hazard-history.mjs writes
// them to lib/hazards/data/; /api/hazards?op=history reads them). Pure and
// import-free with only erasable TypeScript, so node runs it by type
// stripping and vitest loads it directly.
//
//   spc-tornado-county.json  NOAA SPC's 1950-2025 tornado file, counted per
//                            county per year: one row of the file counts once
//                            for each county named in its f1..f4 columns.
//   landslide-county.json    USGS's county_analysis.csv (slope-relief
//                            landslide susceptibility, 2024), keyed by FIPS by
//                            an exact (ST, COUNTY) name join.
//
// Both are derivations of the upstream files, labelled as such in their meta,
// and both fail closed: a code or name that is not a current county is listed
// in meta, never guessed. The only remaps are the Census Bureau's own
// documented changes of name or code with no change of boundary (the rename
// tables below, each citing its Census page). The output is a pure function
// of the input bytes and the upstream Last-Modified: no clock, sorted keys.

export interface CountyRef {
  geoid: string;
  name: string;
  stusab: string;
}

export const SPC_URL = "https://www.spc.noaa.gov/wcm/data/1950-2025_actual_tornadoes.csv";
export const LANDSLIDE_CSV_URL = "https://www.sciencebase.gov/catalog/file/get/65ccea5bd34ef4b119cb3bac?name=county_analysis.csv";

export const CENSUS_CHANGES_2010 = "https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.2010.html";
export const CENSUS_CHANGES_1990 = "https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes.1990.html";

/** SPC county codes Census documents as a change of name or code only (same boundary). */
export const SPC_RENAMES: ReadonlyArray<{ from: string; to: string; what: string; citation: string }> = [
  { from: "12025", to: "12086", what: "Dade County, FL renamed Miami-Dade County (1997-07-22), new code", citation: CENSUS_CHANGES_1990 },
  { from: "46113", to: "46102", what: "Shannon County, SD renamed Oglala Lakota County (2015-05-01), new code", citation: CENSUS_CHANGES_2010 },
];

/** Landslide CSV names (2010 counties) Census documents as a change of name only (same boundary). */
export const LANDSLIDE_RENAMES: ReadonlyArray<{ st: string; county: string; to: string; what: string; citation: string }> = [
  { st: "AK", county: "Wade Hampton Census Area", to: "02158", what: "renamed Kusilvak Census Area (2015-07-01), new code", citation: CENSUS_CHANGES_2010 },
  { st: "SD", county: "Shannon County", to: "46102", what: "renamed Oglala Lakota County (2015-05-01), new code", citation: CENSUS_CHANGES_2010 },
  { st: "LA", county: "La Salle Parish", to: "22059", what: "spelling changed to LaSalle Parish, same code", citation: CENSUS_CHANGES_2010 },
];

/** Connecticut's legacy county FIPS, which current Census geography replaced with planning regions. */
export const CT_LEGACY = /^090(0[1-9]|1[0-5])$/;

/** Split one CSV line (RFC 4180 quotes). */
export function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Header + rows; the BOM is stripped, blank lines dropped, and a line with the wrong column count is counted, not read. */
export function parseCsv(text: string): { header: string[]; rows: string[][]; malformed: number } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = csvLine(lines[0] ?? "");
  const rows: string[][] = [];
  let malformed = 0;
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue;
    const r = csvLine(l);
    if (r.length !== header.length) {
      malformed++;
      continue;
    }
    rows.push(r);
  }
  return { header, rows, malformed };
}

const sortedObject = <V>(entries: Array<[string, V]>): Record<string, V> => Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export interface SpcBake {
  meta: {
    what: string;
    source: string;
    url: string;
    lastModified: string | null;
    sha256: string | null;
    rows: number;
    stateSegmentRows: number;
    noCounty: number;
    malformedLines: number;
    countyCodes: number;
    counties: number;
    firstYear: number | null;
    lastYear: number | null;
    renamed: Array<{ from: string; to: string; what: string; citation: string }>;
    legacyCt: string[];
    unmatched: string[];
    generatedBy: string;
  };
  columns: ["year", "tornadoes"];
  counties: Record<string, Array<[number, number]>>;
}

/**
 * SPC's tornado file per county per year. Each row (a tornado, or for a multi-state tornado one
 * state's segment, sn = 0) counts once for each county FIPS stf + f1..f4 it names; a row naming no
 * county (all f = 0) is counted in meta.noCounty. Codes not in `counties` are listed, never placed.
 */
export function bakeSpc(text: string, counties: readonly CountyRef[], lastModified: string | null, sha256: string | null = null): SpcBake {
  const { header, rows, malformed } = parseCsv(text);
  const col = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`SPC file has no ${n} column`);
    return i;
  };
  const [yr, stf, sn] = [col("yr"), col("stf"), col("sn")];
  const fs = ["f1", "f2", "f3", "f4"].map(col);
  const known = new Set(counties.map((c) => c.geoid));
  const rename = new Map(SPC_RENAMES.map((r) => [r.from, r.to]));
  const perCounty = new Map<string, Map<number, Set<number>>>();
  const seenCodes = new Set<string>();
  let noCounty = 0;
  let segments = 0;
  let first: number | null = null;
  let last: number | null = null;
  rows.forEach((r, i) => {
    const year = Number(r[yr]);
    if (!Number.isInteger(year)) return;
    first = first == null ? year : Math.min(first, year);
    last = last == null ? year : Math.max(last, year);
    if (r[sn] === "0") segments++;
    const codes = fs.map((j) => r[j]).filter((f) => /^\d+$/.test(f) && Number(f) > 0);
    if (!codes.length) {
      noCounty++;
      return;
    }
    for (const f of codes) {
      const raw = `${r[stf].padStart(2, "0")}${f.padStart(3, "0")}`;
      seenCodes.add(raw);
      const code = rename.get(raw) ?? raw;
      let years = perCounty.get(code);
      if (!years) perCounty.set(code, (years = new Map()));
      let set = years.get(year);
      if (!set) years.set(year, (set = new Set()));
      set.add(i);
    }
  });
  const legacyCt = [...perCounty.keys()].filter((k) => CT_LEGACY.test(k)).sort();
  const unmatched = [...perCounty.keys()].filter((k) => !known.has(k) && !CT_LEGACY.test(k)).sort();
  const out = sortedObject(
    [...perCounty.entries()]
      .filter(([k]) => known.has(k))
      .map(([k, years]) => [k, [...years.entries()].sort((a, b) => a[0] - b[0]).map(([y, s]) => [y, s.size] as [number, number])] as [string, Array<[number, number]>]),
  );
  return {
    meta: {
      what: "A derivation, not an upstream file: rows of SPC's tornado file counted per county per year. A row is one tornado, or one state's segment of a multi-state tornado (sn = 0); it counts once in each county its f1..f4 name.",
      source: "NOAA/NWS Storm Prediction Center, 1950-2025 actual tornadoes (US federal work)",
      url: SPC_URL,
      lastModified,
      sha256,
      rows: rows.length,
      stateSegmentRows: segments,
      noCounty,
      malformedLines: malformed,
      countyCodes: seenCodes.size,
      counties: Object.keys(out).length,
      firstYear: first,
      lastYear: last,
      renamed: SPC_RENAMES.filter((r) => seenCodes.has(r.from)).map((r) => ({ ...r })),
      legacyCt,
      unmatched,
      generatedBy: "scripts/bake-hazard-history.mjs",
    },
    columns: ["year", "tornadoes"],
    counties: out,
  };
}

export const LANDSLIDE_COLUMNS = ["county_area", "susc_area", "prop_susc", "v2_ls_count", "v2_density"] as const;

export interface LandslideBake {
  meta: {
    what: string;
    source: string;
    doi: string;
    licence: string;
    url: string;
    published: string;
    sha256: string | null;
    rows: number;
    exact: number;
    renamed: Array<{ st: string; county: string; to: string; what: string; citation: string }>;
    unmatched: Array<{ st: string; county: string }>;
    malformedLines: number;
    generatedBy: string;
  };
  columns: typeof LANDSLIDE_COLUMNS;
  counties: Record<string, Array<number | null>>;
}

const num = (s: string | undefined): number | null => {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** USGS's county CSV keyed by FIPS: an exact (ST, COUNTY) match against `counties`, then the rename table; the rest are listed. */
export function bakeLandslide(text: string, counties: readonly CountyRef[], sha256: string | null = null): LandslideBake {
  const { header, rows, malformed } = parseCsv(text);
  const col = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`landslide CSV has no ${n} column`);
    return i;
  };
  const [cName, cSt] = [col("COUNTY"), col("ST")];
  const vals = LANDSLIDE_COLUMNS.map(col);
  const key = new Map(counties.map((c) => [`${c.stusab}|${c.name}`, c.geoid]));
  const renames = new Map(LANDSLIDE_RENAMES.map((r) => [`${r.st}|${r.county}`, r]));
  const out: Array<[string, Array<number | null>]> = [];
  const used = new Set<string>();
  const unmatched: Array<{ st: string; county: string }> = [];
  const renamed: LandslideBake["meta"]["renamed"] = [];
  let exact = 0;
  for (const r of rows) {
    const k = `${r[cSt]}|${r[cName]}`;
    let geoid = key.get(k);
    if (geoid) exact++;
    else {
      const rn = renames.get(k);
      if (rn) {
        geoid = rn.to;
        renamed.push({ ...rn });
      }
    }
    if (!geoid || used.has(geoid)) {
      unmatched.push({ st: r[cSt], county: r[cName] });
      continue;
    }
    used.add(geoid);
    out.push([geoid, vals.map((j) => num(r[j]))]);
  }
  return {
    meta: {
      what: "A derivation, not an upstream file: USGS's county_analysis.csv (2010 counties) keyed by current county FIPS by an exact state + county name match, plus Census-documented renames. Values as published.",
      source: "U.S. Geological Survey: Belair and others (2024), Slope-Relief Threshold Landslide Susceptibility Models for the United States and Puerto Rico",
      doi: "10.5066/P13KAGU3",
      licence: "CC0 1.0",
      url: LANDSLIDE_CSV_URL,
      published: "2024-08-22 (data release); ScienceBase sends the request time as Last-Modified, so the input is identified by its sha256",
      sha256,
      rows: rows.length,
      exact,
      renamed,
      unmatched,
      malformedLines: malformed,
      generatedBy: "scripts/bake-hazard-history.mjs",
    },
    columns: LANDSLIDE_COLUMNS,
    counties: sortedObject(out),
  };
}
