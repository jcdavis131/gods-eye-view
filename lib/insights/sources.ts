// The upstream files a places bundle reads, by the producer's registry id
// (manifest.json sources[*].source), as lib/provenance SourceRefs, and the
// files that shape who is compared rather than a plotted value.
//
// The CES files cite the source record the chart sidecar carries
// (bls-ces-sm). The rest are named here because no sidecar record carries
// them: the OMB delineation that defines the metros, the QCEW county totals
// that weight the fail-closed check, and the Census population estimates
// that pick row P1's peers. They live with the insights rather than in the
// shared lib/provenance/sources.ts registry because only a bundle cites them.

import { SOURCES } from "@/lib/provenance/sources";
import type { SourceRef } from "@/lib/provenance/types";
import type { TemplateId } from "./sentence";

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
  /** The manifest URL's shape; group 1 is the year the file describes. */
  url: RegExp;
}

export const SHAPING: ShapingRule[] = [
  { id: "omb_list1_2023", ref: OMB_DELINEATION, chart: true, role: "C1.shaping.omb", url: /\/reference-files\/(\d{4})\/delineation-files\/list1_\1\.xlsx$/ },
  { id: "qcew_county_total", ref: SOURCES["bls-qcew"], chart: false, role: "C1.shaping.qcew_county", url: /\/cew\/data\/api\/(\d{4})\/a\/industry\/10\.csv$/ },
  { id: "census_cbsa_est2025", ref: CENSUS_CBSA_POPEST, chart: false, role: "C1.shaping.census_p1", url: /\/popest\/datasets\/\d{4}-(\d{4})\/metro\/totals\/cbsa-est\1-alldata\.csv$/ },
];

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
export function sourceRefById(id: string, ces: SourceRef | null): SourceRef | null {
  switch (id) {
    case "bls_ces_sm_data":
    case "bls_ces_sm_data_alt":
      return ces;
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
