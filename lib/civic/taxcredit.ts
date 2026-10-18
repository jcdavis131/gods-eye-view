// Housing phase 2 (round 8): HUD's Difficult Development Areas titled 2026 and
// HUD's Low-Income Housing Tax Credit property database, from HUD's eGIS
// organisation on ArcGIS Online (CORS *), as two parts of the housing layer
// (/api/civic?op=housing&bbox=&part=dda,lihtc). Pure: the layers, the field
// allow-lists, the queries, the features and the click lines.
//
// LIHTC carries an owner and contact block (CONTACT, COMPANY, CO_ADD, CO_CTY,
// CO_ST, CO_ZIP, CO_TEL) and geocoder bookkeeping; none of it is ever asked
// for (LIHTC_FIELDS is an allow-list and a test denies the rest). A project of
// fewer than five units (4,211 projects, 2,221 of them one unit) is a
// household's home, so its point and street address would say where a private
// person lives: the rule is in the upstream where (N_UNITS >= 5), so such a row
// never reaches the server, and no answer counts withheld projects. HUD's own
// layer description says to map a property only where its geocode level
// (LVL2KX) is R (interpolated rooftop) or 4 (ZIP+4 centroid); the other levels
// are block-group, tract or ZIP centroids, so those projects are counted in the
// note and not drawn at a centroid as if it were the address.
//
// HUD's LIHTC data dictionary ("DD_Low Income Tax Credit Program") is on
// huduser.gov, which answers a keyless request with a WAF challenge
// (2026-10-17); the layer has no coded-value domains. So every coded field is
// shown as "HUD code N", never a guessed meaning, and 8888 and 9999 in the year
// fields are shown as HUD's codes, never as years.

import type { MultiPolygon, Point, Polygon } from "geojson";
import type { LayerFeature } from "@/lib/layers/types";
import { HUD_ORG } from "./housing";

/** "Difficult_Development_Areas_2026" (2,902 areas on 2026-10-17: 2,615 metro ZCTAs, 287 non-metro counties). */
export const DDA_LAYER = `${HUD_ORG}/Difficult_Development_Areas_2026/FeatureServer/0`;
/** "LIHTC" layer 0, Low_Income_Housing_Tax_Credit_Properties (50,566 projects on 2026-10-17). */
export const LIHTC_LAYER = `${HUD_ORG}/LIHTC/FeatureServer/0`;

export const DDA_FIELDS = ["ZCTA5", "DDA_CODE", "DDA_TYPE", "DDA_NAME"] as const;
/** The only LIHTC fields ever asked for. Never CONTACT, COMPANY, CO_*, STD_*, DPV*, C1P*, MSG*, APT_*. */
export const LIHTC_FIELDS = ["HUD_ID", "PROJECT", "PROJ_ADD", "PROJ_CTY", "PROJ_ST", "PROJ_ZIP", "N_UNITS", "LI_UNITS", "YR_PIS", "YR_ALLOC", "NON_PROF", "CREDIT", "TYPE", "TRGT_POP", "BOND", "DDA", "QCT", "CURCNTY", "LVL2KX"] as const;
/** Fields that must never be asked of the LIHTC layer: the owner and contact block and the geocoder's address bookkeeping. */
export const LIHTC_DENY = /^(CONTACT|COMPANY|CO_|STD_|DPV|DPBC|C1P|MSG|APT_|ADDR_TYPE|URB_OUT|ZIP_CLASS)/;

/** Cam's decision 1 (pending): a project of fewer than this many units is a household's home and is never drawn. */
export const LIHTC_MIN_UNITS = 5;
/** The upstream where: a smaller or unknown-size project never reaches the server. */
export const LIHTC_WHERE = `N_UNITS >= ${LIHTC_MIN_UNITS}`;
/** HUD's layer description: map an address only where LVL2KX is R or 4. */
export const LIHTC_MAP_LEVELS: Readonly<Record<string, string>> = { R: "interpolated rooftop", "4": "ZIP+4 centroid" };
/** HUD's other LVL2KX codes, as the layer description names them (not drawn). */
export const LIHTC_CENTROID_LEVELS: Readonly<Record<string, string>> = { B: "block group centroid", T: "census tract centroid", "2": "ZIP+2 centroid", Z: "ZIP5 centroid", "5": "ZIP5 centroid" };

/** National counts read 2026-10-17 (returnCountOnly and LVL2KX statistics), quoted in the caveat. */
export const LIHTC_COUNTS = { all: 50566, atLeastFive: 45765, small: 4211, oneUnit: 2221, unknownUnits: 590, noGeocode: 2367, mappable: 40239 } as const;

export const DDA_EDGE = "#8B5CF6";
export const LIHTC_COLOR = "#115E59";
/** Point sizes by low-income units: 5-24, 25-99, 100-249, 250 and more. */
export const LIHTC_UNIT_BREAKS = [25, 100, 250] as const;
export const LIHTC_UNIT_LABELS = ["5 to 24", "25 to 99", "100 to 249", "250 or more"] as const;
export const LIHTC_POINT_SIZES = [5, 7, 9, 11] as const;

export const HOUSING_PARTS = ["dda", "lihtc"] as const;
export type HousingPart = (typeof HOUSING_PARTS)[number];

/** part= on op=housing: one or both of dda, lihtc, comma-joined; null when absent; "bad" for anything else (hcv and qct are the default, not parts). */
export function parseHousingParts(v: string | null): HousingPart[] | null | "bad" {
  if (v == null) return null;
  const xs = v.split(",").map((x) => x.trim());
  if (!xs.length || xs.some((x) => !(HOUSING_PARTS as readonly string[]).includes(x))) return "bad";
  return HOUSING_PARTS.filter((p) => xs.includes(p));
}

/** Permalink hp= / pref housingParts: the chips' parts, comma-joined in a fixed order. */
export function housingPartsPref(v: unknown): HousingPart[] {
  const s = typeof v === "string" ? v : "";
  return HOUSING_PARTS.filter((p) => s.split(",").includes(p));
}

export const DDA_YEAR_NOTE =
  "HUD's DDA year is stated three ways: the service says 2026 (Difficult_Development_Areas_2026), its data was last edited 2025-09-22, and the layer description says 'Date of Coverage: 2023-2024 Last Updated: 10-2023'. huduser.gov answered a keyless request with a WAF challenge (2026-10-17), so it is labelled 'titled 2026 by HUD', as the QCT list is.";
export const HOUSING_TAX_CREDIT_CAVEAT = `HUD's Difficult Development Areas, titled 2026 by HUD (the layer's own text says 2023-2024; HUD's page could not be read keyless), are metro ZIP code areas and non-metro counties with high costs relative to income, where tax-credit projects can get a larger basis. HUD's LIHTC database lists projects allocated through 2021 and placed in service through 2022, at the address the state agency reported. Projects of fewer than five units (4,211 of 50,566 nationally) and projects with no unit count (590) are never drawn, because a small project is a household's home. Projects HUD located only to a ZIP, tract or block-group centroid are counted, not drawn, as HUD's layer description asks. HUD has no administrative authority over the program; the states administer it.`;
export const LIHTC_CODE_NOTE =
  "HUD's LIHTC data dictionary is on huduser.gov, which did not answer keyless (2026-10-17), and the layer has no coded-value domains: coded fields are shown as HUD's codes, never a guessed meaning, and 8888 or 9999 in a year field is HUD's code, not a year.";
export const CT_TAX_CREDIT_NOTE = "Connecticut: HUD's non-metro DDAs there are planning regions (NCNTY09160, Northwest Hills); its LIHTC rows carry the old county codes (CURCNTY 003, 009, 013).";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);

/** A LIHTC year field: a year, or HUD's code shown as a code. */
export function lihtcYear(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^(19[89]\d|20[0-4]\d)$/.test(s)) return s;
  return `HUD code ${s} (HUD's code, not a year)`;
}
const code = (v: unknown): string | null => {
  const s = str(v);
  return s ? `HUD code ${s}` : null;
};

export interface DdaExtra {
  kind: "dda";
  type: "SA" | "NM" | null;
  code: string | null;
}

type Raw = { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null };
const isPoly = (g: GeoJSON.Geometry | null): g is Polygon | MultiPolygon => !!g && (g.type === "Polygon" || g.type === "MultiPolygon");

/** The DDA outlines (violet dashes); one feature per metro ZCTA or non-metro DDA_CODE. */
export function buildDda(rows: readonly Raw[]): LayerFeature<Polygon | MultiPolygon>[] {
  const out: LayerFeature<Polygon | MultiPolygon>[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!isPoly(r.geometry)) continue;
    const p = r.properties ?? {};
    const ddaCode = str(p.DDA_CODE);
    const zcta = str(p.ZCTA5);
    const t = str(p.DDA_TYPE);
    const type = t === "SA" || t === "NM" ? t : null;
    // A metro DDA_CODE is shared by every ZCTA of its metro area (METRO12420M12420 for Austin's): a metro area is keyed by its ZCTA.
    const key = type === "SA" ? (zcta ?? ddaCode) : (ddaCode ?? zcta);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const name = str(p.DDA_NAME);
    const details: Record<string, string> = {
      designation: "Difficult Development Area, titled 2026 by HUD",
      area:
        type === "SA"
          ? `metro ZIP code area ${zcta ?? "(not published)"}${name ? ` (${name})` : ""}`
          : type === "NM"
            ? `non-metro county or county equivalent${name ? `: ${name}` : ""}`
            : `area type not published${name ? `: ${name}` : ""}`,
      "HUD DDA code": ddaCode ?? "not published",
      "what this is": "a LIHTC designation: areas with high construction, land and utility costs relative to area median income, where a tax-credit project can get a larger basis; not a measure of conditions",
      source: "HUD Difficult Development Areas (titled 2026)",
    };
    if (ddaCode?.startsWith("NCNTY09") || zcta?.startsWith("06")) details.connecticut = "HUD's non-metro DDAs in Connecticut are planning regions";
    const extra: DdaExtra = { kind: "dda", type, code: ddaCode };
    out.push({
      type: "Feature",
      geometry: r.geometry,
      properties: { id: `housing:dda:${key}`, layer: "housing", name: type === "SA" && zcta ? `DDA ZIP ${zcta}` : `DDA ${name ?? key}`, kind: "dda", source: "HUD Difficult Development Areas (titled 2026)", details, extra },
    });
  }
  return out;
}

export interface LihtcExtra {
  kind: "lihtc";
  hudId: string;
  units: number;
  liUnits: number | null;
  /** 0-3: 5-24, 25-99, 100-249, 250+ low-income units (total units when LI_UNITS is not published). */
  bin: number;
  level: string;
}

export function lihtcBin(n: number): number {
  let b = 0;
  while (b < LIHTC_UNIT_BREAKS.length && n >= LIHTC_UNIT_BREAKS[b]) b++;
  return b;
}

// A LIHTC project's PROJECT is searchable (it is the feature's label), and HUD sometimes files
// the street address as the project's name, or inside it (the round-8 verifier counted 128 with
// PROJECT equal to PROJ_ADD nationally, and 14 drawn names carrying their whole PROJ_ADD, e.g.
// "JEFFERSON CLUSTER (116 JEFFERSON AVE)"). Both sides are folded first: every character that is
// not a letter or digit becomes a space, case is folded and street words abbreviated (STREET ->
// ST, WEST -> W), so "803-28TH ST" is "803 28TH ST" and "407 + 409 SYKES AVE" is "407 409 SYKES
// AVE": a run of house numbers joined by '-', '/', '&', '+' or AND is a range. The label is
// "LIHTC project · HUD id <HUD_ID>" when the name (1) equals PROJ_ADD; (2) begins with a house
// number or range, then up to five words ending in a street type ("2301 FIRST AVE", "125-145 ELM
// ST REHAB": what follows the street type does not make it less an address); or (3) begins with
// PROJ_ADD's own house number and the next word ("99 RUTGERS 608" at 99 RUTGERS AVE). (4)
// Otherwise, where the name contains PROJ_ADD's house number plus street (each number of a range,
// then the words up to the street type: "400 W 59TH" for 400 WEST 59TH STREET), that span is cut
// from the label, with the street type and whatever else of PROJ_ADD follows it word for word,
// any range numbers before it, and the brackets or dashes it leaves. If what remains is still a
// name (a word of two or more letters that is not a joiner such as AT or FORMERLY, and not an
// address by 1-3) it is the label ("VILLAGE AT", "JEFFERSON CLUSTER"); else the HUD id label is.
// A name that only carries a number ("1610 ASSOC", "2021 APTS") or a street without a house
// number ("76TH ST APTS") keeps its name. What this guarantees: no drawn label equals its own
// PROJ_ADD or contains its own PROJ_ADD's house number plus street (round8/lihtc-oracle.mjs runs
// every live row through buildLihtc). Not caught: another address inside a name ("79-95
// WOODRUFF" at 91 WOODRUFF AVE), or a street named without its house number.
const LIHTC_ADDR_WORDS: Record<string, string> = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW", STREET: "ST", STR: "ST", AVENUE: "AVE", AV: "AVE", ROAD: "RD", DRIVE: "DR", BOULEVARD: "BLVD", LANE: "LN", COURT: "CT", PLACE: "PL", PARKWAY: "PKWY", PKY: "PKWY", HIGHWAY: "HWY", CIRCLE: "CIR", TERRACE: "TER", TRAIL: "TRL", SQUARE: "SQ", ALLEY: "ALY" };
const LIHTC_STREET_TYPES = "ST|AVE|RD|DR|BLVD|LN|CT|PL|WAY|PKWY|HWY|CIR|TER|TRL|LOOP|PIKE|SQ|ROW|ALY";
const LIHTC_STREET_TYPE_SET = new Set(LIHTC_STREET_TYPES.split("|"));
/** A house number or a range of them, on folded text (the joiners are spaces by then, or AND). */
const LIHTC_HOUSE_NUMBERS = String.raw`\d+[A-Z]?(?:\s(?:AND\s)?\d+[A-Z]?(?=\s|$))*`;
const LIHTC_ADDRESS_START = new RegExp(String.raw`^${LIHTC_HOUSE_NUMBERS}\s(?:[NSEW]{1,2}\s)?(?:[A-Z0-9]+\s){0,4}(?:${LIHTC_STREET_TYPES})(?:\s|$)`);
const LIHTC_LEAD = new RegExp(String.raw`^(\d+)[A-Z]?(?:\s(?:AND\s)?\d+[A-Z]?(?=\s|$))*\s([A-Z0-9]+)`);
/** Words that do not make what is left of a name a name ("VILLAGE AT" is one; "AT" alone is not). */
const LIHTC_JOINERS = new Set(["A", "AN", "AND", "AT", "OF", "ON", "IN", "THE", "AKA", "FKA", "FORMERLY"]);
const LIHTC_CUT_SEP = String.raw`[-,;:/&+·–—]`;

type AddrTok = { w: string; start: number; end: number };
/** The folded words of a name or address, with where each sits in the original text. */
const addrToks = (s: string): AddrTok[] =>
  Array.from(s.matchAll(/[A-Za-z0-9]+/g), (m) => {
    const w = m[0].toUpperCase();
    return { w: LIHTC_ADDR_WORDS[w] ?? w, start: m.index, end: m.index + m[0].length };
  });
const addrFold = (s: string): string => addrToks(s).map((t) => t.w).join(" ");
const isHouseNumber = (w: string | undefined): boolean => !!w && /^\d+[A-Z]?$/.test(w);

const addrLead = (folded: string): string | null => {
  const m = LIHTC_LEAD.exec(folded);
  return m ? `${m[1]} ${m[2]}` : null;
};

/** PROJ_ADD's house number plus street, once per number of a range: [["400", "W", "59TH"]]; none without a house number or a street word. */
export function lihtcAddressKeys(address: string | null): string[][] {
  const t = address ? addrToks(address).map((x) => x.w) : [];
  const nums: string[] = [];
  let i = 0;
  for (; i < t.length; i++) {
    if (isHouseNumber(t[i])) nums.push(t[i]);
    else if (!(t[i] === "AND" && nums.length && isHouseNumber(t[i + 1]))) break;
  }
  const street: string[] = [];
  for (; i < t.length && !LIHTC_STREET_TYPE_SET.has(t[i]); i++) street.push(t[i]);
  return nums.length && street.length ? nums.map((n) => [n, ...street]) : [];
}

/** Whether a LIHTC PROJECT name reads as a street address (rules 1-3: its own PROJ_ADD, or a house number plus street at its start). */
export function lihtcNameIsAddress(project: string, address: string | null): boolean {
  const p = addrFold(project);
  if (!p) return false;
  const a = address ? addrFold(address) : "";
  if (a && p === a) return true;
  if (LIHTC_ADDRESS_START.test(p)) return true;
  const lead = a ? addrLead(a) : null;
  return lead != null && addrLead(p) === lead;
}

/** What is left after a cut, tidied: empty brackets, doubled or dangling dashes and slashes, a dangling FORMERLY go. */
const tidyCut = (s: string): string => {
  let t = s;
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\(\s*(?:(?:formerly|aka|fka|a\/k\/a|f\/k\/a)\s*)*\)|\[\s*\]/gi, " ")
      .replace(new RegExp(`(${LIHTC_CUT_SEP})(?:\\s*${LIHTC_CUT_SEP})+`, "g"), "$1")
      .replace(/\s+/g, " ")
      .replace(new RegExp(`^(?:\\s|\\)|${LIHTC_CUT_SEP})+|(?:\\s|\\(|${LIHTC_CUT_SEP})+$`, "g"), "")
      .replace(/\s+(?:formerly|aka|fka|a\/k\/a|f\/k\/a)$/i, "");
  }
  return t.trim();
};

/** Rule 4: the name with every copy of PROJ_ADD's house number plus street cut out, or null when it carries none. */
export function lihtcStripAddress(project: string, address: string | null): string | null {
  const keys = lihtcAddressKeys(address);
  if (!keys.length || !address) return null;
  const at = addrToks(address).map((x) => x.w);
  // where PROJ_ADD's street words end (the key's last word), to follow the rest of it word for word
  let after = 0;
  while (after < at.length && (isHouseNumber(at[after]) || at[after] === "AND")) after++;
  after += keys[0].length - 1;
  let s = project;
  let cut = false;
  for (let guard = 0; guard < 8; guard++) {
    const nt = addrToks(s);
    let span: [number, number] | null = null;
    for (let i = 0; i < nt.length && !span; i++) {
      const k = keys.find((key) => i + key.length <= nt.length && key.every((w, j) => nt[i + j].w === w));
      if (!k) continue;
      let end = i + k.length;
      for (let ai = after; ai < at.length && end < nt.length && nt[end].w === at[ai]; ai++) end++;
      let start = i;
      while (start > 0 && (isHouseNumber(nt[start - 1].w) || (nt[start - 1].w === "AND" && start > 1 && isHouseNumber(nt[start - 2].w)))) start--;
      span = [nt[start].start, nt[end - 1].end];
    }
    if (!span) break;
    s = `${s.slice(0, span[0])} ${s.slice(span[1])}`;
    cut = true;
  }
  return cut ? tidyCut(s) : null;
}

/** Whether a cut name is still a name: a word of two or more letters that is not a joiner, and not an address by rules 1-3. */
const isName = (s: string, address: string | null): boolean => addrToks(s).some((t) => /^[A-Z]{2,}$/.test(t.w) && !LIHTC_JOINERS.has(t.w)) && !lihtcNameIsAddress(s, address);

/** The feature's label: HUD's project name with its own address cut out (rule 4), or the HUD id when the name is missing or reads as an address. */
export function lihtcLabel(hudId: string, project: string | null, address: string | null): string {
  const fallback = `LIHTC project · HUD id ${hudId}`;
  if (!project || lihtcNameIsAddress(project, address)) return fallback;
  const cut = lihtcStripAddress(project, address);
  if (cut == null) return project;
  return isName(cut, address) ? cut : fallback;
}

/**
 * LIHTC points from the answer. A row is drawn only when it has a point, a HUD_ID, at least
 * LIHTC_MIN_UNITS units (the where already says so; a row that slips through anyway is dropped) and
 * a geocode level HUD says may be mapped (R or 4). Rows at a centroid level are counted, not drawn.
 * Only the allow-listed fields are read.
 */
export function buildLihtc(rows: readonly Raw[]): { features: LayerFeature<Point>[]; centroid: number; noPoint: number } {
  const out: LayerFeature<Point>[] = [];
  const seen = new Set<string>();
  let centroid = 0;
  let noPoint = 0;
  for (const r of rows) {
    const p = r.properties ?? {};
    const units = int(p.N_UNITS);
    if (units == null || units < LIHTC_MIN_UNITS) continue;
    const hudId = str(p.HUD_ID);
    if (!hudId || seen.has(hudId)) continue;
    if (!r.geometry || r.geometry.type !== "Point") {
      noPoint++;
      continue;
    }
    const level = str(p.LVL2KX);
    if (!level || !(level in LIHTC_MAP_LEVELS)) {
      centroid++;
      continue;
    }
    seen.add(hudId);
    const li = int(p.LI_UNITS);
    const addr = [str(p.PROJ_ADD), str(p.PROJ_CTY), [str(p.PROJ_ST), str(p.PROJ_ZIP)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const details: Record<string, string | null> = {
      "HUD id": hudId,
      address: addr || null,
      units: `${units.toLocaleString("en-US")} units, ${li == null ? "low-income units not published" : `${li.toLocaleString("en-US")} low-income`}`,
      "placed in service": lihtcYear(p.YR_PIS) ?? "not published",
      allocated: lihtcYear(p.YR_ALLOC) ?? "not published",
      "nonprofit sponsor (NON_PROF)": code(p.NON_PROF),
      "credit type (CREDIT)": code(p.CREDIT),
      "construction type (TYPE)": code(p.TYPE),
      "target population (TRGT_POP)": code(p.TRGT_POP),
      "tax-exempt bond (BOND)": code(p.BOND),
      "in a DDA at allocation (HUD's flag)": code(p.DDA),
      "in a QCT at allocation (HUD's flag)": code(p.QCT),
      "location (HUD's geocode level)": `${level}: ${LIHTC_MAP_LEVELS[level]}`,
      codes: "coded fields are HUD's codes; HUD's data dictionary could not be read keyless, so no meaning is guessed",
      source: "HUD LIHTC database (allocated through 2021, placed in service through 2022)",
    };
    const extra: LihtcExtra = { kind: "lihtc", hudId, units, liUnits: li, bin: lihtcBin(li ?? units), level };
    const [lon, lat] = r.geometry.coordinates;
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `housing:lihtc:${hudId}`,
        layer: "housing",
        // A tax-credit property's published name (an apartment complex's), never a person's: projects under five units are never asked for.
        // Never its address either: a name that reads as one is replaced (lihtcLabel).
        name: lihtcLabel(hudId, str(p.PROJECT), str(p.PROJ_ADD)),
        kind: "lihtc",
        source: "HUD LIHTC properties",
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v != null)) as Record<string, string>,
        extra,
      },
    });
  }
  return { features: out, centroid, noPoint };
}
