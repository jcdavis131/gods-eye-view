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
 * A file that decides who is compared. `coverage` is what the file
 * describes, in ISO 8601: the July 2023 delineation, the 2019 annual county
 * totals, the 2025 population estimates (POPESTIMATE2025).
 */
export interface ShapingRule {
  /** The producer's registry id. */
  id: string;
  ref: SourceRef;
  coverage: string;
  /** True when the chart's own rows depend on it; false when only a robustness row does. */
  chart: boolean;
  role: string;
}

export const SHAPING: ShapingRule[] = [
  {
    id: "omb_list1_2023",
    ref: OMB_DELINEATION,
    coverage: "2023-07",
    chart: true,
    role: "Which metros there are and what they are called: a metro is a metropolitan statistical area of OMB's July 2023 delineation in the 50 states and DC, the geography CES rebuilds metro history on, and its member counties are the ones the fail-closed check reads.",
  },
  {
    id: "qcew_county_total",
    ref: SOURCES["bls-qcew"],
    coverage: "2019",
    chart: false,
    role: "The fail-closed check's weights: each member county's 2019 QCEW total covered employment; a metro with a member county that has none fails closed for twins.",
  },
  {
    id: "census_cbsa_est2025",
    ref: CENSUS_CBSA_POPEST,
    coverage: "2025",
    chart: false,
    role: "Row P1's peer set: the 150 largest metros by Census 2025 population (POPESTIMATE2025).",
  },
];

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
