// The upstream files a places bundle reads, by the producer's registry id
// (manifest.json sources[*].source), as lib/provenance SourceRefs, and the
// files that shape who is compared rather than a plotted value.
//
// Every SourceRef here is this side's: the publisher, programme name, home
// URL and license a citation prints are never read from the bundle. The chart
// sidecar carries a source record on each provenance entry; build.ts requires
// it to be CES_SM below, word for word, and prints CES_SM. The rest are named
// here because no sidecar record carries them: the OMB delineation that
// defines the metros, the QCEW county totals that weight the fail-closed
// check, and the Census population estimates that pick row P1's peers. They
// live with the insights rather than in the shared lib/provenance/sources.ts
// registry because only a bundle cites them.
//
// What the bundle does say about a file (its URL, sha256, size,
// Last-Modified and fetch time) is checked against a fixed form before any
// of it prints (sourceEntryProblems): a URL of the shape its registry id
// fetches, 64 hex characters, an HTTP date, an ISO 8601 UTC time. Those are
// facts about a file, not words, and a value outside its form refuses. A
// CES file's name is words (sm.data.54.TotalNonFarm.All), so its URL is one
// of the names registered here (CES_SM_FILES), not a shape: a consistent
// rename to sm.data.54.NoMetroBeatAustin.OnBoth used to print.

import { SOURCES } from "@/lib/provenance/sources";
import type { SourceRef } from "@/lib/provenance/types";
import type { TemplateId } from "./sentence";
import type { SourceEntry } from "./types";

export const CES_SM: SourceRef = {
  id: "bls-ces-sm",
  name: "Current Employment Statistics, State and Metro Area",
  publisher: "U.S. Bureau of Labor Statistics",
  url: "https://download.bls.gov/pub/time.series/sm/",
  license: "public domain",
};

export const OMB_DELINEATION: SourceRef = {
  id: "omb-cbsa-delineation",
  name: "Core based statistical areas, metropolitan divisions and combined statistical areas, July 2023 (list 1)",
  publisher: "U.S. Office of Management and Budget, published by the U.S. Census Bureau",
  url: "https://www.census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html",
  license: "public domain",
};

export const CENSUS_CBSA_POPEST: SourceRef = {
  id: "census-popest-cbsa",
  name: "Metropolitan and Micropolitan Statistical Area population estimates, Vintage 2025 (cbsa-est2025-alldata)",
  publisher: "U.S. Census Bureau",
  url: "https://www.census.gov/programs-surveys/popest.html",
  license: "public domain",
};

/**
 * A file that decides who is compared. Nothing about what it covers is
 * written here: build.ts reads the year from the file's own URL in the
 * manifest (`url`, whose first group is the year), checks it against the
 * year in the producer's registry id where there is one, and against the
 * evidence where the evidence names it (the delineation's composition, the
 * fail-closed weights' year, P1's ranking), then fills `role` with it.
 */
export interface ShapingRule {
  /** The producer's registry id. */
  id: string;
  ref: SourceRef;
  /** True when the chart's own rows depend on it; false when only a robustness row does. */
  chart: boolean;
  /** The sentence the page prints for it (sentence.ts), filled by build.ts. */
  role: TemplateId;
  /** The manifest URL, whole; group 1 is the year the file describes. */
  url: RegExp;
}

export const SHAPING: ShapingRule[] = [
  {
    id: "omb_list1_2023",
    ref: OMB_DELINEATION,
    chart: true,
    role: "C1.shaping.omb",
    url: /^https:\/\/www2\.census\.gov\/programs-surveys\/metro-micro\/geographies\/reference-files\/(\d{4})\/delineation-files\/list1_\1\.xlsx$/,
  },
  { id: "qcew_county_total", ref: SOURCES["bls-qcew"], chart: false, role: "C1.shaping.qcew_county", url: /^https:\/\/data\.bls\.gov\/cew\/data\/api\/(\d{4})\/a\/industry\/10\.csv$/ },
  {
    id: "census_cbsa_est2025",
    ref: CENSUS_CBSA_POPEST,
    chart: false,
    role: "C1.shaping.census_p1",
    url: /^https:\/\/www2\.census\.gov\/programs-surveys\/popest\/datasets\/\d{4}-(\d{4})\/metro\/totals\/cbsa-est\1-alldata\.csv$/,
  },
];

/**
 * The month OMB issued each year's delineation the list1 file holds (OMB Bulletin 23-01, July 21, 2023). The
 * Universe section prints it ("OMB's July 2023 delineation"); the producer's composition id must name this month.
 */
export const OMB_DELINEATION_MONTH: Readonly<Record<string, string>> = { "2023": "jul" };

/** The month names a delineation composition id ("msa_jul2023") may carry, as the page prints them. */
export const MONTHS: Record<string, { name: string; iso: string }> = {
  jan: { name: "January", iso: "01" },
  feb: { name: "February", iso: "02" },
  mar: { name: "March", iso: "03" },
  apr: { name: "April", iso: "04" },
  may: { name: "May", iso: "05" },
  jun: { name: "June", iso: "06" },
  jul: { name: "July", iso: "07" },
  aug: { name: "August", iso: "08" },
  sep: { name: "September", iso: "09" },
  oct: { name: "October", iso: "10" },
  nov: { name: "November", iso: "11" },
  dec: { name: "December", iso: "12" },
};

/** The SourceRef for a producer registry id, or null when this side has none (a refusal at build time). */
export function sourceRefById(id: string): SourceRef | null {
  switch (id) {
    case "bls_ces_sm_data":
    case "bls_ces_sm_data_alt":
      return CES_SM;
    case "qcew_msa_area":
    case "qcew_county_total":
      return SOURCES["bls-qcew"];
    case "omb_list1_2023":
      return OMB_DELINEATION;
    case "census_cbsa_est2025":
      return CENSUS_CBSA_POPEST;
    default:
      return null;
  }
}

/**
 * The CES SM flat files each registry id reads, by BLS's own file names under
 * https://download.bls.gov/pub/time.series/sm/ (vector-places
 * places/flagship/ces.py registers the same list, by supersector): total
 * nonfarm and the eight supersectors the panel's axes add, and the two the
 * alternative definitions add. A file name is printed (in every citation, the
 * arithmetic's cells, the CSV footer and the JSON-LD), so it is this side's,
 * whole: a file of any other name, or one of these under the other id,
 * refuses, rather than any letters in a name's last two segments.
 */
export const CES_SM_FILES: Readonly<Record<"bls_ces_sm_data" | "bls_ces_sm_data_alt", readonly string[]>> = {
  bls_ces_sm_data: [
    "sm.data.54.TotalNonFarm.All",
    "sm.data.60.MiningAndLogging.Current",
    "sm.data.61.MiningLoggingConstr.Current",
    "sm.data.62.Construction.Current",
    "sm.data.63.Manufacturing.Current",
    "sm.data.69.TransUtilities.Current",
    "sm.data.70.Information.Current",
    "sm.data.71.FinancialActivities.Current",
    "sm.data.72.ProfBusSrvc.Current",
  ],
  bls_ces_sm_data_alt: ["sm.data.66.TradeTransUtilities.Current", "sm.data.73.EduHealthSrvc.Current"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The URL every file of a registry id is fetched from, whole. */
function urlForm(id: string): RegExp | null {
  switch (id) {
    case "bls_ces_sm_data":
    case "bls_ces_sm_data_alt":
      return new RegExp(`^https://download\\.bls\\.gov/pub/time\\.series/sm/(?:${CES_SM_FILES[id].map(escapeRe).join("|")})$`);
    case "qcew_msa_area":
      return /^https:\/\/data\.bls\.gov\/cew\/data\/api\/\d{4}\/a\/area\/C\d{4}\.csv$/;
    default:
      return SHAPING.find((r) => r.id === id)?.url ?? null;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
/** An HTTP date (RFC 9110 IMF-fixdate), as a Last-Modified header carries it. */
export const HTTP_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
/** A fetch time: ISO 8601 in UTC, to the second. */
export const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** What is wrong with a source entry the page cites, against the fixed form of each field; empty when nothing is. */
export function sourceEntryProblems(entry: SourceEntry): string[] {
  const problems: string[] = [];
  const form = urlForm(entry.source);
  if (!sourceRefById(entry.source) || !form) problems.push(`its registry id ${JSON.stringify(entry.source)} is not one this side cites`);
  else if (!form.test(entry.url)) problems.push(`its URL ${JSON.stringify(entry.url)} is not one ${entry.source} fetches`);
  if (!HEX64.test(entry.sha256)) problems.push(`its sha256 ${JSON.stringify(entry.sha256)} is not 64 hex characters`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) problems.push(`its size ${JSON.stringify(entry.bytes)} is not a byte count`);
  if (entry.last_modified !== null && !HTTP_DATE.test(entry.last_modified)) problems.push(`its Last-Modified ${JSON.stringify(entry.last_modified)} is not an HTTP date`);
  if (!ISO_UTC.test(entry.fetched_at)) problems.push(`its fetch time ${JSON.stringify(entry.fetched_at)} is not an ISO 8601 UTC time`);
  return problems;
}

/** The date of an HTTP date, as ISO 8601 ("Fri, 18 Sep 2026 14:00:00 GMT" -> "2026-09-18"). */
export function isoDateOf(httpDate: string): string {
  if (!HTTP_DATE.test(httpDate)) throw new Error(`${JSON.stringify(httpDate)} is not an HTTP date`);
  return new Date(Date.parse(httpDate)).toISOString().slice(0, 10);
}
