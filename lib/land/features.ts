// Row -> feature builders for the three land layers (flood zones, wetlands,
// public & protected lands) and the elevation readout. Plain functions with
// no Cesium or React in them, shared by /api/land and the browser layers.
//
// Every label here is either the upstream's own value or its published
// definition: FEMA's zone meanings, the NWI Cowardin names that come back
// joined in the same query, PAD-US's coded-value domains read from the
// layer's metadata. Sentinels (-9999, -1000000) become undefined.

import type { MultiPolygon, Polygon } from "geojson";
import type { LayerFeature } from "@/lib/layers/types";

type Poly = Polygon | MultiPolygon;

function isPoly(g: GeoJSON.Geometry | null | undefined): g is Poly {
  return !!g && (g.type === "Polygon" || g.type === "MultiPolygon");
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function finite(v: unknown, sentinel?: number): number | undefined {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (sentinel != null && n <= sentinel) return undefined;
  return n;
}

// ---------------------------------------------------------------- FEMA NFHL

export interface FloodZoneExtra {
  zone: string;
  subtype?: string;
  /** Special Flood Hazard Area (the 1 % annual-chance floodplain), as FEMA flags it. */
  sfha?: boolean;
  /** Static base flood elevation, only where FEMA publishes one. */
  bfe?: number;
  /** Flood depth for AO zones. */
  depth?: number;
  unit?: string;
  datum?: string;
  dfirm?: string;
  studyType?: string;
  /** Hazard class used for colour; derived from the zone and subtype FEMA published. */
  hazard: "coastal" | "sfha" | "moderate" | "minimal" | "undetermined" | "water" | "other";
}

/** FEMA's own zone definitions (FEMA "Flood Zones", fema.gov/glossary/flood-zones). */
export function floodZoneMeaning(zone: string, subtype?: string): string {
  const z = zone.toUpperCase();
  if (z === "VE" || z === "V") return "coastal high-hazard area: 1 % annual-chance flood with storm-induced waves (base flood)";
  if (z === "AE" || z === "A" || z === "AH" || z === "AO" || z === "AR" || z === "A99") {
    const extra =
      z === "AO" ? " shallow flooding (sheet flow), depth given" :
      z === "AH" ? " shallow ponding, elevation given" :
      z === "AR" ? " temporarily increased risk while a levee is restored" :
      z === "A99" ? " to be protected by a federal flood-protection system under construction" :
      z === "A" ? " no base flood elevation determined" : "";
    return `1 % annual-chance flood (base flood, "100-year")${extra ? ";" + extra : ""}`;
  }
  if (z === "X") {
    const s = (subtype ?? "").toUpperCase();
    if (s.includes("0.2 PCT")) return "0.2 % annual-chance flood (\"500-year\") or 1 % with average depth under 1 ft";
    if (s.includes("LEVEE")) return "reduced flood risk due to a levee";
    if (s.includes("FUTURE")) return "1 % annual-chance flood under future conditions (a local study, not the regulatory base flood)";
    if (s.includes("MINIMAL")) return "area of minimal flood hazard (outside the 0.2 % annual-chance floodplain)";
    return subtype ? subtype.toLowerCase() : "outside the special flood hazard area";
  }
  if (z === "D") return "possible but undetermined flood hazard: no FEMA analysis";
  if (z === "OPEN WATER") return "open water";
  return subtype ? `${zone}: ${subtype.toLowerCase()}` : zone;
}

function floodHazard(zone: string, subtype: string | undefined, sfha: boolean | undefined): FloodZoneExtra["hazard"] {
  const z = zone.toUpperCase();
  if (z === "VE" || z === "V") return "coastal";
  if (sfha || z.startsWith("A")) return "sfha";
  if (z === "D") return "undetermined";
  if (z === "OPEN WATER") return "water";
  if (z === "X") {
    const s = (subtype ?? "").toUpperCase();
    if (s.includes("MINIMAL")) return "minimal";
    return "moderate";
  }
  return "other";
}

export interface NfhlProps {
  FLD_AR_ID?: string | null;
  FLD_ZONE?: string | null;
  ZONE_SUBTY?: string | null;
  SFHA_TF?: string | null;
  STATIC_BFE?: number | null;
  DEPTH?: number | null;
  LEN_UNIT?: string | null;
  V_DATUM?: string | null;
  DFIRM_ID?: string | null;
  STUDY_TYP?: string | null;
}

export function buildFloodZones(rows: Array<{ geometry: GeoJSON.Geometry | null; properties: NfhlProps }>): LayerFeature[] {
  const out: LayerFeature[] = [];
  rows.forEach((r, i) => {
    if (!isPoly(r.geometry)) return;
    const p = r.properties;
    const zone = str(p.FLD_ZONE) ?? "unknown";
    const subtype = str(p.ZONE_SUBTY);
    const sfha = p.SFHA_TF === "T" ? true : p.SFHA_TF === "F" ? false : undefined;
    const bfe = finite(p.STATIC_BFE, -9998);
    const depth = finite(p.DEPTH, -9998);
    const unit = str(p.LEN_UNIT);
    const datum = str(p.V_DATUM);
    const u = unit ? ` ${unit.toLowerCase()}` : "";
    const extra: FloodZoneExtra = {
      zone,
      subtype,
      sfha,
      bfe,
      depth,
      unit,
      datum,
      dfirm: str(p.DFIRM_ID),
      studyType: str(p.STUDY_TYP),
      hazard: floodHazard(zone, subtype, sfha),
    };
    const id = str(p.FLD_AR_ID) ?? `${extra.dfirm ?? "nfhl"}:${i}`;
    out.push({
      type: "Feature",
      geometry: r.geometry,
      properties: {
        id: `nfhl:${id}`,
        layer: "flood",
        name: `Zone ${zone}${bfe != null ? ` · BFE ${bfe}${u}` : ""}`,
        kind: extra.hazard,
        source: "FEMA NFHL",
        details: {
          zone,
          meaning: floodZoneMeaning(zone, subtype),
          subtype,
          "special flood hazard area": sfha,
          "base flood elevation": bfe != null ? `${bfe}${u}${datum ? " " + datum : ""}` : undefined,
          depth: depth != null ? `${depth}${u}` : undefined,
          "FIRM database": extra.dfirm,
          study: extra.studyType,
          "what this is": "FEMA's regulatory flood map (FIRM), not a forecast of any flood",
          "fema map service": "https://msc.fema.gov/portal/home",
        },
        extra,
      },
    });
  });
  return out;
}

// ---------------------------------------------------------------- USFWS NWI

/** USFWS's own caveat for NWI maps ("Wetlands Data Limitations, Exclusions and Precautions"). */
export const NWI_CAVEAT = "Wetlands or other mapped features may have changed since the date of the imagery and/or field work.";

/** One NWI mapping project (a quad) from the Data_Source layer: when and from what it was mapped. */
export interface NwiSource {
  project?: string;
  /** Year of the imagery the polygons were drawn from. */
  year?: number;
  /** Imagery date as NWI publishes it, e.g. "03/83". */
  date?: string;
  /** Imagery scale denominator, e.g. 58000 for 1:58,000. */
  scale?: number;
  /** CIR colour infrared, TC true colour, BW black and white, Scalable. */
  imageType?: string;
  /** Outer rings of the project area, [lon, lat]. */
  rings: number[][][];
}

export function parseNwiSources(rows: Array<{ geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }>): NwiSource[] {
  const out: NwiSource[] = [];
  for (const r of rows) {
    if (!isPoly(r.geometry)) continue;
    const p = r.properties;
    const polys = r.geometry.type === "Polygon" ? [r.geometry.coordinates] : r.geometry.coordinates;
    const year = finite(p.IMAGE_YR);
    out.push({
      project: str(p.PROJECT_NAME),
      // NWI uses 0 where the year is not recorded.
      year: year != null && year > 1900 ? year : undefined,
      date: str(p.IMAGE_DATE),
      scale: finite(p.IMAGE_SCALE, 0),
      imageType: str(p.SOURCE_TYPE) ?? str(p.EMULSION),
      rings: polys.map((poly) => poly[0]).filter((ring) => Array.isArray(ring) && ring.length > 2),
    });
  }
  return out;
}

/** Even-odd point-in-ring test on [lon, lat] pairs. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** "1983 imagery (Southton, CIR 1:58,000, 03/83)". */
export function nwiSourceText(s: NwiSource): string {
  const bits = [s.project, [s.imageType, s.scale ? `1:${s.scale.toLocaleString("en-US")}` : undefined].filter(Boolean).join(" ") || undefined, s.date].filter(Boolean);
  return `${s.year != null ? `${s.year} imagery` : "imagery of unrecorded year"}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

/** The mapping project whose area holds the middle of this polygon's outer ring, if any. */
function sourceFor(g: Poly, sources: NwiSource[]): NwiSource | undefined {
  const ring = (g.type === "Polygon" ? g.coordinates : g.coordinates[0])?.[0];
  if (!ring?.length) return undefined;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  const lon = (w + e) / 2;
  const lat = (s + n) / 2;
  return sources.find((src) => src.rings.some((r) => pointInRing(lon, lat, r)));
}

export interface WetlandExtra {
  /** Cowardin code, e.g. PEM1A. */
  code: string;
  type?: string;
  acres?: number;
  system?: string;
  subsystem?: string;
  cls?: string;
  regime?: string;
  /** Year of the imagery the polygon was drawn from (NWI Data_Source); undefined when not found. */
  imageYear?: number;
}

export function buildWetlands(
  rows: Array<{ id?: number | string; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }>,
  sources: NwiSource[] = [],
): LayerFeature[] {
  const out: LayerFeature[] = [];
  rows.forEach((r, i) => {
    if (!isPoly(r.geometry)) return;
    const p = r.properties;
    const code = str(p["Wetlands.ATTRIBUTE"]) ?? "unclassified";
    const src = sourceFor(r.geometry, sources);
    const x: WetlandExtra = {
      code,
      type: str(p["Wetlands.WETLAND_TYPE"]),
      acres: finite(p["Wetlands.ACRES"]),
      system: str(p["NWI_Wetland_Codes.SYSTEM_NAME"]),
      subsystem: str(p["NWI_Wetland_Codes.SUBSYSTEM_NAME"]),
      cls: str(p["NWI_Wetland_Codes.CLASS_NAME"]),
      regime: str(p["NWI_Wetland_Codes.WATER_REGIME_NAME"]),
      imageYear: src?.year,
    };
    const oid = str(p["Wetlands.OBJECTID"]) ?? str(r.id) ?? `${code}:${i}`;
    out.push({
      type: "Feature",
      geometry: r.geometry,
      properties: {
        id: `nwi:${oid}`,
        layer: "wetlands",
        name: x.type ? `${x.type} · ${code}` : code,
        kind: x.type ?? "wetland",
        source: "USFWS NWI",
        details: {
          type: x.type,
          "cowardin code": code,
          system: x.system,
          subsystem: x.subsystem,
          class: x.cls,
          "water regime": x.regime,
          acres: x.acres != null ? x.acres.toFixed(x.acres < 10 ? 2 : 1) : undefined,
          "mapped from": src ? nwiSourceText(src) : "imagery date not found in NWI's source layer",
          "what this is": "a wetland habitat mapped from that imagery, not a jurisdictional (Clean Water Act) delineation",
          "usfws caveat": NWI_CAVEAT,
          "nwi code guide": "https://www.fws.gov/program/national-wetlands-inventory/classification-codes",
        },
        extra: x,
      },
    });
  });
  return out;
}

/** Imagery years across the projects in a box, oldest first, and their names. */
export function nwiImagerySummary(sources: NwiSource[]): { years: number[]; projects: string[] } {
  const years = [...new Set(sources.map((s) => s.year).filter((y): y is number => y != null))].sort((a, b) => a - b);
  const projects = [...new Set(sources.map((s) => s.project).filter((p): p is string => !!p))].sort();
  return { years, projects };
}

// ---------------------------------------------------------------- USGS PAD-US

export type Access = "open" | "restricted" | "closed" | "unknown";

/**
 * What the style and the layer note need. Every other attribute travels once,
 * as a dossier line, so a 2 degree box does not carry each string twice.
 */
export interface PublicLandExtra {
  category: string;
  access: Access;
  acres?: number;
}

/** The PAD-US categories the route asks for: every one that draws a unit on land. */
export const PADUS_CATEGORIES = ["Fee", "Easement", "Designation", "Proclamation"] as const;

/**
 * The outFields the route asks PAD-US for, ownership included: the owner and
 * manager agencies, the local owner and the easement holder as PAD-US
 * publishes them. Fields outside this list (source bookkeeping, comments) stay
 * at the source.
 */
export const PADUS_FIELDS = [
  "OBJECTID",
  "Category",
  "Own_Type",
  "Own_Name",
  "Loc_Own",
  "Mang_Type",
  "Mang_Name",
  "Des_Tp",
  "Unit_Nm",
  "Loc_Nm",
  "State_Nm",
  "GIS_Acres",
  "Pub_Access",
  "GAP_Sts",
  "IUCN_Cat",
  "Date_Est",
  "EsmtHldr",
  "EHoldTyp",
] as const;

const ACCESS: Record<string, Access> = { OA: "open", RA: "restricted", XA: "closed", UK: "unknown" };

/**
 * Drop the parts of a multipolygon that lie wholly outside `box` or are
 * smaller than `minDeg` across, keeping at least the largest part that
 * touches the box. ArcGIS returns a unit whole, not clipped: the California
 * Coastal National Monument is some 20,000 islets along the whole state and
 * alone was 2.2 MB of a 2 degree Bay Area answer.
 */
export function trimParts(g: Poly, box: [number, number, number, number], minDeg: number): { geometry: Poly; dropped: number } {
  if (g.type !== "MultiPolygon") return { geometry: g, dropped: 0 };
  const [bw, bs, be, bn] = box;
  let best: { part: number[][][]; size: number } | null = null;
  const kept: number[][][][] = [];
  for (const part of g.coordinates) {
    const ring = part[0];
    if (!ring?.length) continue;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    if (e < bw || w > be || n < bs || s > bn) continue;
    const size = Math.max(e - w, n - s);
    if (!best || size > best.size) best = { part, size };
    if (size >= minDeg) kept.push(part);
  }
  if (!kept.length && best) kept.push(best.part);
  const dropped = g.coordinates.length - kept.length;
  return dropped ? { geometry: { type: "MultiPolygon", coordinates: kept }, dropped } : { geometry: g, dropped: 0 };
}

export function buildPublicLands(
  rows: Array<{ id?: number | string; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> }>,
  domains: Map<string, Map<string, string>>,
  /** Box asked for and the generalisation used: parts outside it or smaller than it are left out (see trimParts). */
  trim?: { box: [number, number, number, number]; minDeg: number },
): LayerFeature[] {
  // Coded values decode through the layer's own domains; an unknown code stays as the code.
  const label = (field: string, v: unknown): string | undefined => {
    const s = str(v);
    if (!s) return undefined;
    return domains.get(field)?.get(s) ?? s;
  };
  // EHoldTyp carries no domain on this service; PAD-US codes it from the same agency-type
  // list as Own_Type, so that label is shown beside the published code, never instead of it.
  const holderType = (v: unknown): string | undefined => {
    const code = str(v);
    if (!code) return undefined;
    const name = domains.get("Own_Type")?.get(code);
    return name && name !== code ? `${code} (${name})` : code;
  };
  const out: LayerFeature[] = [];
  rows.forEach((r, i) => {
    if (!isPoly(r.geometry)) return;
    const p = r.properties;
    const category = str(p.Category) ?? "Unknown";
    const accessCode = str(p.Pub_Access);
    const x: PublicLandExtra = {
      category,
      access: (accessCode && ACCESS[accessCode]) || "unknown",
      acres: finite(p.GIS_Acres),
    };
    const unit = str(p.Unit_Nm);
    const localName = str(p.Loc_Nm);
    const designation = label("Des_Tp", p.Des_Tp);
    const oid = str(p.OBJECTID) ?? str(r.id) ?? `${category}:${i}`;
    const accessText =
      x.access === "unknown" ? "unknown (not reported to PAD-US)" : label("Pub_Access", accessCode)?.toLowerCase() ?? x.access;
    const easement = category === "Easement";
    const t = trim ? trimParts(r.geometry, trim.box, trim.minDeg) : { geometry: r.geometry, dropped: 0 };
    out.push({
      type: "Feature",
      geometry: t.geometry,
      properties: {
        id: `padus:${oid}`,
        layer: "publiclands",
        name: unit ?? localName ?? designation ?? "protected area",
        kind: category.toLowerCase(),
        source: "USGS PAD-US 4.1",
        details: {
          category: label("Category", category),
          "public access": accessText,
          manager: label("Mang_Name", p.Mang_Name),
          "manager type": label("Mang_Type", p.Mang_Type),
          owner: label("Own_Name", p.Own_Name),
          "owner type": label("Own_Type", p.Own_Type),
          "local owner": str(p.Loc_Own),
          "easement holder": easement ? str(p.EsmtHldr) : undefined,
          "easement holder type": easement ? holderType(p.EHoldTyp) : undefined,
          designation,
          "local name": localName !== unit ? localName : undefined,
          state: label("State_Nm", p.State_Nm),
          acres: x.acres != null ? x.acres.toLocaleString("en-US") : undefined,
          "GAP status": label("GAP_Sts", p.GAP_Sts),
          "IUCN category": label("IUCN_Cat", p.IUCN_Cat),
          established: str(p.Date_Est),
          outline: t.dropped
            ? `${t.dropped.toLocaleString("en-US")} of its ${(t.dropped + (t.geometry.type === "MultiPolygon" ? t.geometry.coordinates.length : 1)).toLocaleString("en-US")} parts not drawn at this zoom (outside the loaded box, or under ~${Math.max(1, Math.round((trim!.minDeg * 111_320) / 10) * 10)} m across)`
            : undefined,
          note:
            category === "Proclamation"
              ? "an approved or proclamation boundary: the land inside is not all public"
              : category === "Designation"
                ? "a designation drawn over land it does not by itself own or open"
                : easement
                  ? "an easement: the owner keeps the land and the holder has the rights the easement grants; public access as PAD-US codes it"
                  : undefined,
        },
        extra: x,
      },
    });
  });
  return out;
}

// ---------------------------------------------------------------- USGS EPQS

export interface ElevationReading {
  lon: number;
  lat: number;
  /** Metres above the vertical datum of the 3DEP DEM; undefined where EPQS has no data. */
  metres?: number;
  /** Source DEM resolution in metres, as EPQS reports it. */
  resolutionM?: number;
  rasterId?: number;
  /** What EPQS said instead of a value (outside its coverage it answers 200 with plain text). */
  note?: string;
}

/** EPQS answers `value` as a string and uses -1000000 for "no data here". */
export function parseEpqs(lon: number, lat: number, j: { value?: string | number | null; resolution?: number | null; rasterId?: number | null }): ElevationReading {
  const v = finite(j.value, -999_999);
  return {
    lon,
    lat,
    metres: v,
    resolutionM: finite(j.resolution) ?? undefined,
    rasterId: finite(j.rasterId) ?? undefined,
  };
}
