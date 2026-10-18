// CMS hospital star ratings on the HIFLD hospital click (round 8). CMS's
// Hospital General Information (Care Compare, Provider Data Catalog dataset
// xubh-q36u) has no coordinates, no CORS and no-store caching, and HIFLD's
// hospital layer carries no CMS certification number (ID is HIFLD's own,
// STATE_ID a state licence number; 0 of Texas's 467 CCNs match either), so the
// two are joined once, in a bake, by the only key they share: the street
// address and ZIP code, exactly, after a fixed normalisation, and only where
// exactly one CMS row and exactly one HIFLD row (any status) share the key.
// A key two hospitals share (a long-term-care unit inside a general hospital)
// is never attached, so no tenant ever shows its host's rating.
//
// Pure and import-free with only erasable TypeScript (node runs it by type
// stripping for scripts/bake-cms-hospitals.mjs; vitest and the infra route
// import it). The click lines are here too.

export const CMS_DATASET = "xubh-q36u";
export const CMS_QUERY = `https://data.cms.gov/provider-data/api/1/datastore/query/${CMS_DATASET}/0`;
export const CMS_METASTORE = `https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/${CMS_DATASET}?show-reference-ids=false`;
export const CMS_PAGE = 1500;
/** The only CMS columns asked for: never facility_name (HIFLD labels the hospital), telephone_number (a contact) or countyparish. */
export const CMS_PROPERTIES = ["facility_id", "address", "zip_code", "state", "hospital_type", "hospital_ownership", "emergency_services", "meets_criteria_for_birthing_friendly_designation", "hospital_overall_rating", "hospital_overall_rating_footnote"] as const;
export const CMS_DENY = /telephone|facility_name|countyparish/;

export const HIFLD_JOIN_URL = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Hospitals_RAPT/FeatureServer/6";
export const HIFLD_JOIN_FIELDS = ["ID", "ADDRESS", "ZIP", "STATUS"] as const;

/** One page of the CMS datastore query, the named columns only. */
export function cmsPageUrl(offset: number): string {
  return `${CMS_QUERY}?limit=${CMS_PAGE}&offset=${offset}&${CMS_PROPERTIES.map((p) => `properties[]=${p}`).join("&")}`;
}

/** The street-word abbreviations of the join (the same table the design's measurement used). */
export const ADDRESS_WORDS: Readonly<Record<string, string>> = {
  STREET: "ST",
  AVENUE: "AVE",
  ROAD: "RD",
  DRIVE: "DR",
  BOULEVARD: "BLVD",
  HIGHWAY: "HWY",
  PARKWAY: "PKWY",
  LANE: "LN",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  FREEWAY: "FWY",
  SUITE: "STE",
  CIRCLE: "CIR",
  COURT: "CT",
  PLACE: "PL",
  EXPRESSWAY: "EXPY",
  TRAIL: "TRL",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

/** An address for the join: upper case, punctuation to spaces, the street words abbreviated. */
export function normAddress(a: unknown): string {
  const s = (typeof a === "string" ? a : "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ADDRESS_WORDS[w] ?? w)
    .join(" ");
}

/** The join key: the normalised address and the 5-digit ZIP. Null when either is empty. */
export function joinKey(address: unknown, zip: unknown): string | null {
  const a = normAddress(address);
  const z = String(zip ?? "")
    .trim()
    .slice(0, 5);
  return a && /^\d{5}$/.test(z) ? `${a}|${z}` : null;
}

export type CmsRow = { [K in (typeof CMS_PROPERTIES)[number]]?: unknown };
export type HifldJoinRow = { ID?: unknown; ADDRESS?: unknown; ZIP?: unknown; STATUS?: unknown };

/** [ccn, rating 1-5 or null, rating footnote or null, CMS hospital type, ownership, emergency services, birthing-friendly] */
export type CmsEntry = [string, number | null, string | null, string | null, string | null, string | null, string | null];
export const CMS_COLUMNS = ["ccn", "rating", "ratingFootnote", "cmsType", "ownership", "emergency", "birthingFriendly"] as const;

export interface CmsBake {
  meta: {
    what: string;
    source: string;
    credit: string;
    licence: string;
    url: string;
    metastore: string;
    cmsModified: string | null;
    hifldUrl: string;
    hifldDataLastEdit: string | null;
    joinRule: string;
    cmsRows: number;
    cmsDistinctCcn: number;
    hifldRows: number;
    attached: number;
    attachedOpen: number;
    attachedOpenRated: number;
    attachedClosed: number;
    sharedKeys: number;
    /** Keys shared by more than one row on either side: [key, CMS CCNs, HIFLD IDs]; never attached. */
    sharedAddress: Array<[string, string[], string[]]>;
    unattachedByCmsType: Record<string, number>;
    ratings: Record<string, number>;
    sha256: { cms: string | null; hifld: string | null };
    generatedBy: string;
  };
  columns: typeof CMS_COLUMNS;
  rows: Record<string, CmsEntry>;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const sortKeys = <V>(o: Record<string, V>): Record<string, V> => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/** CMS's overall rating: 1-5, or null for "Not Available" (CMS's own word) and anything else. */
export function cmsRating(v: unknown): number | null {
  const t = s(v);
  return t && /^[1-5]$/.test(t) ? Number(t) : null;
}

/**
 * The join. A CMS row attaches to a HIFLD hospital when their keys are equal and each side has
 * exactly one row with that key; any key with two or more rows on either side goes to
 * meta.sharedAddress with both sides' ids and is never attached. Output keyed by HIFLD ID, sorted.
 */
export function bakeCms(
  cms: readonly CmsRow[],
  hifld: readonly HifldJoinRow[],
  info: { cmsModified: string | null; hifldDataLastEdit: string | null; sha256?: { cms: string | null; hifld: string | null } },
): CmsBake {
  const ci = new Map<string, CmsRow[]>();
  const hi = new Map<string, HifldJoinRow[]>();
  for (const r of cms) {
    const k = joinKey(r.address, r.zip_code);
    if (!k) continue;
    const l = ci.get(k);
    if (l) l.push(r);
    else ci.set(k, [r]);
  }
  for (const r of hifld) {
    const k = joinKey(r.ADDRESS, r.ZIP);
    if (!k || !s(r.ID)) continue;
    const l = hi.get(k);
    if (l) l.push(r);
    else hi.set(k, [r]);
  }
  const rows: Record<string, CmsEntry> = {};
  const shared: Array<[string, string[], string[]]> = [];
  const attachedCcn = new Set<string>();
  let open = 0;
  let openRated = 0;
  let closed = 0;
  for (const [k, cs] of ci) {
    const hs = hi.get(k);
    if (!hs) continue;
    if (cs.length !== 1 || hs.length !== 1) {
      shared.push([k, cs.map((c) => String(c.facility_id ?? "")).sort(), hs.map((h) => String(h.ID ?? "")).sort()]);
      continue;
    }
    const c = cs[0];
    const h = hs[0];
    const ccn = s(c.facility_id);
    if (!ccn) continue;
    const rating = cmsRating(c.hospital_overall_rating);
    rows[String(h.ID).trim()] = [ccn, rating, rating == null ? s(c.hospital_overall_rating_footnote) : null, s(c.hospital_type), s(c.hospital_ownership), s(c.emergency_services), s(c.meets_criteria_for_birthing_friendly_designation)];
    attachedCcn.add(ccn);
    if (s(h.STATUS) === "OPEN") {
      open++;
      if (rating != null) openRated++;
    } else closed++;
  }
  const unattached: Record<string, number> = {};
  const ratings: Record<string, number> = {};
  for (const c of cms) {
    const r = cmsRating(c.hospital_overall_rating);
    const rk = r == null ? "not available" : String(r);
    ratings[rk] = (ratings[rk] ?? 0) + 1;
    if (!attachedCcn.has(String(c.facility_id ?? ""))) {
      const t = s(c.hospital_type) ?? "(none)";
      unattached[t] = (unattached[t] ?? 0) + 1;
    }
  }
  shared.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    meta: {
      what: "A derivation, not an upstream file: CMS Hospital General Information joined to HIFLD's hospitals (FEMA RAPT copy) by exact normalised street address + 5-digit ZIP, attached only where exactly one row on each side shares the key. Keyed by HIFLD ID.",
      source: "Centers for Medicare & Medicaid Services, Hospital General Information (Provider Data Catalog xubh-q36u); HIFLD hospitals via FEMA RAPT",
      credit: "Centers for Medicare & Medicaid Services, Care Compare (Hospital General Information)",
      licence: "no licence stated (metastore license: null); US federal work",
      url: CMS_QUERY,
      metastore: CMS_METASTORE,
      cmsModified: info.cmsModified,
      hifldUrl: HIFLD_JOIN_URL,
      hifldDataLastEdit: info.hifldDataLastEdit,
      joinRule: "key = address upper-cased, every non-alphanumeric to a space, words abbreviated by ADDRESS_WORDS (STREET to ST, NORTH to N, ...), then '|' and the first five digits of the ZIP; attached only where exactly one CMS row and exactly one HIFLD row (any status) share the key; a house-number-only key is not used",
      cmsRows: cms.length,
      cmsDistinctCcn: new Set(cms.map((c) => String(c.facility_id ?? ""))).size,
      hifldRows: hifld.length,
      attached: Object.keys(rows).length,
      attachedOpen: open,
      attachedOpenRated: openRated,
      attachedClosed: closed,
      sharedKeys: shared.length,
      sharedAddress: shared,
      unattachedByCmsType: sortKeys(unattached),
      ratings: sortKeys(ratings),
      sha256: info.sha256 ?? { cms: null, hifld: null },
      generatedBy: "scripts/bake-cms-hospitals.mjs",
    },
    columns: CMS_COLUMNS,
    rows: sortKeys(rows),
  };
}

export const CMS_RATINGS_CAVEAT =
  "CMS's overall hospital star rating as Care Compare published it (dataset modified 2026-07-22), joined to HIFLD's hospital by exact street address and ZIP code because HIFLD carries no CMS certification number; about one CMS hospital in four could not be matched that way, and hospitals sharing an address are never matched. CMS rates acute-care and critical-access hospitals that report enough measures; many are not rated. A rating summarizes reported measures; it is not a measure of a hospital's emergency capacity.";

export interface CmsExtra {
  ccn: string;
  rating: number | null;
  ratingFootnote: string | null;
  cmsType: string | null;
  ownership: string | null;
  emergency: string | null;
  birthingFriendly: string | null;
}

export function cmsExtra(e: CmsEntry): CmsExtra {
  return { ccn: e[0], rating: e[1], ratingFootnote: e[2], cmsType: e[3], ownership: e[4], emergency: e[5], birthingFriendly: e[6] };
}

/**
 * The click lines: one of three states, always naming the match rule. `modified` is the CMS
 * dataset's own modified date from the bake. A HIFLD CLOSED hospital with a match says both.
 */
export function cmsDetails(x: CmsExtra | null, hifldStatus: string | null, modified: string | null): Record<string, string> {
  const when = modified ? `Care Compare, dataset modified ${modified}` : "Care Compare";
  if (!x) return { "CMS star rating": "no unambiguous CMS match at this address (the CMS list is joined by street address and ZIP; HIFLD carries no CMS number)" };
  const d: Record<string, string> = {
    "CMS star rating":
      x.rating != null
        ? `${x.rating} of 5 (${when}; matched to this HIFLD record by street address and ZIP)`
        : `CMS lists this hospital but has not rated it${x.ratingFootnote ? ` (footnote ${x.ratingFootnote})` : ""} (${when}; matched by street address and ZIP)`,
    "CMS certification number": x.ccn,
  };
  if (x.cmsType) d["CMS hospital type"] = x.cmsType;
  if (x.ownership) d["CMS ownership"] = x.ownership;
  if (x.emergency) d["CMS emergency services"] = x.emergency;
  if (x.birthingFriendly) d["CMS birthing-friendly"] = x.birthingFriendly;
  if (hifldStatus && hifldStatus.toUpperCase() !== "OPEN") d["CMS and HIFLD"] = "HIFLD lists it closed; CMS still lists it";
  return d;
}
