// Environmental permits: EPA ECHO's Clean Water Act (NPDES) and Clean Air
// Act facilities, and the U.S. Army Corps of Engineers' regulatory actions
// (Section 10/404 permits, nationwide permit verifications, Section 408
// permissions, jurisdictional determinations) from its public ORM search.
// Plain functions, shared by /api/permits?op=environmental and the layer,
// tested on captured payloads.
//
// A small permittee can be a person, and a Corps applicant string is often
// "<person>-<organisation>". So a feature's name is the permit or action
// number and its type ("NPDES TXR1509LI", "SWG-1993-01047 · Letter of
// Permission"); the facility or project name EPA and the Corps publish is in
// the dossier only, never searched; the Corps applicant is never kept.
// Compliance is ECHO's own words, and a facility ECHO gives no status for
// says "not reported by ECHO", never "no violation".

import { str, type Bbox } from "@/lib/zoning/features";
import { clip, finite } from "./features";

export type EnvProgram = "npdes" | "air" | "usace";

export interface EnvRecord {
  id: string;
  program: EnvProgram;
  lon: number;
  lat: number;
  /** Permit, source or DA number, as published. */
  number: string;
  /** Permit or action type, as published. */
  type?: string;
  /** The facility or project name as EPA or the Corps publishes it (dossier only). */
  facility?: string;
  status?: string;
  /** ECHO's compliance words; "not reported by ECHO" when it gives none. */
  compliance?: string;
  date?: string;
  dateLabel?: string;
  address?: string;
  url?: string;
  published: Record<string, string>;
}

type Row = Record<string, unknown>;

function put(out: Record<string, string>, label: string, v: unknown): void {
  const s = typeof v === "number" ? String(v) : str(v);
  if (s) out[label] = s;
}

function lonLat(lon: unknown, lat: unknown): [number, number] | null {
  const x = finite(lon);
  const y = finite(lat);
  if (x == null || y == null || Math.abs(x) > 180 || Math.abs(y) > 90 || (x === 0 && y === 0)) return null;
  return [x, y];
}

/** ECHO's MM/DD/YYYY as YYYY-MM-DD. */
export function echoDate(v: unknown): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(v) ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

function joinAddress(...parts: unknown[]): string | undefined {
  const s = parts.map(str).filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
  return s || undefined;
}

// ------------------------------------------------------------------ EPA ECHO

export const ECHO = "https://echodata.epa.gov/echo";
/** ECHO's column ids for get_qid (from its metadata service): name, ids, address, location, permit, status, compliance. */
export const CWA_QCOLUMNS = "1,2,3,4,5,7,8,12,24,25,28,51,54,57,59,60,97,98,101,121";
export const AIR_QCOLUMNS = "1,2,3,4,5,7,8,9,23,24,25,27,28,29,44,45,48,50,54,84,103";

export function echoFacilitiesUrl(program: "npdes" | "air", b: Bbox): string {
  const [w, s, e, n] = b;
  const svc = program === "npdes" ? "cwa_rest_services" : "air_rest_services";
  const q = new URLSearchParams({ output: "JSON", p_c1lon: String(w), p_c1lat: String(s), p_c2lon: String(e), p_c2lat: String(n), p_act: "Y" });
  return `${ECHO}/${svc}.get_facilities?${q.toString()}`;
}

export function echoQidUrl(program: "npdes" | "air", qid: string): string {
  const svc = program === "npdes" ? "cwa_rest_services" : "air_rest_services";
  const q = new URLSearchParams({ output: "JSON", qid, pageno: "1", qcolumns: program === "npdes" ? CWA_QCOLUMNS : AIR_QCOLUMNS });
  return `${ECHO}/${svc}.get_qid?${q.toString()}`;
}

/** The query id and row count get_facilities answers (the rows come from get_qid). */
export function echoQuery(j: unknown): { qid: string; rows: number } | null {
  const r = (j as { Results?: { QueryID?: unknown; QueryRows?: unknown; Error?: unknown } })?.Results;
  const qid = str(r?.QueryID);
  const rows = finite(r?.QueryRows);
  if (!qid || rows == null) return null;
  return { qid, rows };
}

export function echoFacilities(j: unknown): Row[] {
  const f = (j as { Results?: { Facilities?: unknown } })?.Results?.Facilities;
  return Array.isArray(f) ? (f as Row[]) : [];
}

const NOT_REPORTED = "not reported by ECHO";

function npdes(r: Row): Omit<EnvRecord, "id"> | null {
  const ll = lonLat(r.FacLong, r.FacLat);
  const number = str(r.SourceID);
  if (!ll || !number) return null;
  const published: Record<string, string> = {};
  put(published, "covered by general permit", r.MasterExternalPermitNmbr);
  put(published, "facility type", r.CWPFacilityTypeIndicator);
  put(published, "major or minor", str(r.CWPMajorMinorStatusFlag) === "M" ? "major" : str(r.CWPMajorMinorStatusFlag) === "N" ? "minor" : undefined);
  put(published, "significant noncompliance", r.CWPSNCStatus);
  put(published, "quarters in noncompliance (of the last 12)", r.CWPQtrsWithNC);
  put(published, "penalties (ECHO)", r.CWPTotalPenalties);
  put(published, "effective", echoDate(r.CWPEffectiveDate));
  put(published, "EPA registry id", r.RegistryID);
  return {
    lon: ll[0],
    lat: ll[1],
    program: "npdes",
    number,
    type: str(r.CWPPermitTypeDesc),
    facility: str(r.CWPName),
    status: str(r.CWPPermitStatusDesc),
    compliance: str(r.CWPStatus) ?? NOT_REPORTED,
    date: echoDate(r.CWPExpirationDate),
    dateLabel: "permit expires",
    address: joinAddress(r.CWPStreet, r.CWPCity, r.CWPState, r.CWPZip),
    url: `https://echo.epa.gov/detailed-facility-report?fid=${encodeURIComponent(str(r.RegistryID) ?? number)}`,
    published,
  };
}

function air(r: Row): Omit<EnvRecord, "id"> | null {
  const ll = lonLat(r.FacLong, r.FacLat);
  const number = str(r.SourceID);
  if (!ll || !number) return null;
  const published: Record<string, string> = {};
  put(published, "programs", r.AIRPrograms);
  put(published, "universe", r.AIRUniverse);
  put(published, "classification", r.AIRClassification);
  put(published, "high priority violation", r.AIRHpvStatus);
  put(published, "quarters with violations", r.AIRQtrsWithViol);
  put(published, "recent violations", r.AIRRecentViolCnt);
  put(published, "last evaluation", echoDate(r.AIRLastEvalDate));
  put(published, "penalties (ECHO)", r.AIRPenalties);
  put(published, "major source", r.AIRMajorFlag);
  put(published, "EPA registry id", r.RegistryID);
  return {
    lon: ll[0],
    lat: ll[1],
    program: "air",
    number,
    type: "Clean Air Act facility",
    facility: str(r.AIRName),
    status: str(r.AIRStatus),
    compliance: str(r.AIRComplStatus) ?? NOT_REPORTED,
    address: joinAddress(r.AIRStreet, r.AIRCity, r.AIRState, r.AIRZip),
    url: str(r.RegistryID) ? `https://echo.epa.gov/detailed-facility-report?fid=${encodeURIComponent(str(r.RegistryID)!)}` : undefined,
    published,
  };
}

// ------------------------------------------------------------------ USACE ORM

export const ORM = "https://permits.ops.usace.army.mil/orm-public-api/permits/search";
/** The search answers at most this many actions; its `total` is the national count, not the box's. */
export const ORM_MAX = 300;

export function ormUrl(b: Bbox): string {
  const [w, s, e, n] = b;
  return `${ORM}?da=true&max=${ORM_MAX}&bbox=${w},${s},${e},${n}`;
}

/** The ORM record kinds, in the Corps' own terms where they are its program names. */
const VTYPE: Record<string, string> = {
  issued: "permit action",
  wrda: "WRDA Section 214 funded action",
  s408: "Section 408 permission",
  jds: "jurisdictional determination",
  nepa_ea: "NEPA environmental assessment",
};

/** ORM's YYYYMMDD (or MM/DD/YYYY) as YYYY-MM-DD. */
export function ormDate(v: unknown): string | undefined {
  const s = str(v) ?? "";
  const a = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (a) return `${a[1]}-${a[2]}-${a[3]}`;
  return echoDate(s);
}

function usace(f: { geometry: GeoJSON.Geometry | null; properties: Row | null }): Omit<EnvRecord, "id"> | null {
  const p = f.properties ?? {};
  const pt = f.geometry?.type === "Point" ? f.geometry.coordinates : null;
  const ll = pt ? lonLat(pt[0], pt[1]) : null;
  const number = str(p.daNumber) ?? str(p.identifier);
  if (!ll || !number) return null;
  const vtype = str(p.vtype);
  const published: Record<string, string> = {};
  put(published, "record kind (ORM)", vtype ? (VTYPE[vtype] ?? vtype) : undefined);
  put(published, "district", str(p.districtOfficeDescription) ?? str(p.district));
  put(published, "funding source", p.fundingSource);
  put(published, "public notice", ormDate(p.pnDate) ?? (str(p.publicNoticeDate) !== "N/A" ? str(p.publicNoticeDate) : undefined));
  put(published, "pending or final", p.pendingOrFinal);
  put(published, "EA action type", p.eaActionType);
  put(published, "determination type", p.jdType);
  put(published, "civil works project", p.civilWorksProjects);
  put(published, "regulatory permit", p.regulatoryPermitId);
  put(published, "review category", p.reviewCategory);
  put(published, "submitted", ormDate(p.initialSubmissionDate));
  put(published, "description", clip(p.locationDesc));
  const date = ormDate(p.vdate);
  return {
    lon: ll[0],
    lat: ll[1],
    program: "usace",
    number,
    type: str(p.permitType) ?? (vtype ? (VTYPE[vtype] ?? vtype) : undefined),
    // The applicant and a Section 408 request's requester are never kept: they embed personal
    // names ("<person>-<organisation>"). locationName is the project's place, or its id.
    facility: str(p.projectName) ?? (str(p.locationName) !== number ? str(p.locationName) : undefined),
    status: str(p.actionTaken) ?? str(p.status),
    date,
    dateLabel: date ? "action date" : undefined,
    url: str(p.ajdUrl),
    published,
  };
}

// ------------------------------------------------------------------ build

export interface EnvBuild {
  records: EnvRecord[];
}

export function buildNpdes(rows: Row[]): EnvRecord[] {
  return withIds(rows.map(npdes));
}

export function buildAir(rows: Row[]): EnvRecord[] {
  return withIds(rows.map(air));
}

export function buildUsace(features: Array<{ geometry: GeoJSON.Geometry | null; properties: Row | null }>): EnvRecord[] {
  const recs = withIds(features.map(usace));
  // Newest first: the service returns actions in no date order.
  return recs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

function withIds(recs: Array<Omit<EnvRecord, "id"> | null>): EnvRecord[] {
  const out: EnvRecord[] = [];
  const seen = new Map<string, number>();
  for (const r of recs) {
    if (!r) continue;
    const base = `${r.program}:${r.number}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ id: n ? `${base}#${n + 1}` : base, ...r });
  }
  return out;
}

/** The USACE search's FeatureCollection, or none. */
export function ormFeatures(j: unknown): Array<{ geometry: GeoJSON.Geometry | null; properties: Row | null }> {
  const f = (j as { results?: { features?: unknown } })?.results?.features;
  return Array.isArray(f) ? (f as Array<{ geometry: GeoJSON.Geometry | null; properties: Row | null }>) : [];
}

export const ENV_LABEL: Record<EnvProgram, string> = {
  npdes: "NPDES",
  air: "Air",
  usace: "USACE",
};
