// Place-level aggregates of catalogued collections, committed as files and
// served as-is by /api/catalog?op=place-export: candidate towers for
// vector-places (docs/place-towers.md). Nothing here pulls upstream; each file
// is written by its script with its own provenance and completeness check.
//
//   npl-status   scripts/export-npl-county.mjs -> lib/catalog/data/npl-county.json

import npl from "./data/npl-county.json";

export const PLACE_EXPORTS = ["npl-status"] as const;

const NPL_CAVEATS = [
  "Counts of distinct NPL sites (EPA IDs) per county and year, from EPA's NPL list with status dates. Active means listed by December 31 and not deleted by then; it is a regulatory status, not a measure of contamination.",
  "Zero vs missing: a county not in `places` and not in `nullPlaces` has 0 for every feature (the NPL list is complete for the United States). A county in `nullPlaces` is null: a site could be in it but EPA's county string did not place it in one county (multi-county sites, Baltimore, St. Louis and Roanoke county-or-city). When a site's county name matches nothing, every county of its state is null: all of Connecticut (legacy counties) and all of Alaska (one \"Outer Ketchikan\" site).",
  "Counties are joined by name to TIGERweb ACS2023 (lib/places/data/counties.json); a point-in-county join is not done yet.",
];

/** One export's payload and caveats, or null for an unknown collection. */
export function placeExport(collection: string): { data: unknown; caveats: string[] } | null {
  if (collection === "npl-status") return { data: npl, caveats: NPL_CAVEATS };
  return null;
}
