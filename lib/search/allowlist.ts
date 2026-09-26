// What the ⌘K palette (and nothing else) may match a query against.
//
// A feature is found by its name, its id, or one of the dossier fields on
// SEARCHABLE_DETAILS: published identifiers, categories and place names.
// Owner, operator, manager, easement-holder, bank, provider and recipient
// fields are never on the list, so the palette never goes from a person's
// name, or an owner's, to what they own through those fields. Institutions
// are found by the names their publishers give the feature, and some of
// those names carry the institution: an FDIC branch is "<bank> · <office>",
// so a bank's name lists the branches of it that are loaded (README, Ethics;
// CONTRIBUTING, ground rules). A new layer's identifier is added here
// explicitly; nothing is searchable by default. Pure, so the rule is tested
// without a globe.

import type { BaseProps } from "@/lib/layers/types";

/** Dossier keys (lower case) the palette searches besides a feature's name and id. */
export const SEARCHABLE_DETAILS: ReadonlySet<string> = new Set([
  // aircraft, ships, satellites
  "icao24",
  "callsign",
  "registration",
  "mmsi",
  "imo",
  "call sign",
  "norad id",
  "intl designator",
  "origin country",
  "destination",
  // launches
  "vehicle",
  "mission",
  "pad",
  "site",
  // sports: the feature name is the abbreviated score line ("DAL @ NYG"),
  // so the full team names and the league are what a query finds a game by
  "matchup",
  "league",
  // hazards, land, water, economy
  "fire id",
  "cowardin code",
  "zone",
  "port code",
  "locode",
  "local name",
  // companies, banks, constructs: identifiers and categories their publishers assign
  "ticker",
  "cik",
  "sector",
  "sic",
  "fdic cert",
  "code",
  // places
  "place",
  "area",
  "county",
  "state",
  "country",
  "venue",
  // Left off on purpose: a branch's "bank", a launch's "provider" and an
  // aircraft's "operator" name who runs the thing, so searching them would go
  // from that name to what it operates; a company's "HQ" is a street address,
  // and companies are found by name, ticker, CIK, sector, SIC and county.
]);

export function searchableDetail(key: string): boolean {
  return SEARCHABLE_DETAILS.has(key.toLowerCase());
}

/**
 * How well a feature matches a lower-cased query: 3 for an exact name or id,
 * 2 for a prefix of either, 1 for a name that contains it or an allowlisted
 * dossier value that does, 0 for no match. The outline of the box a land
 * layer loaded is map furniture, never a match.
 */
export function matchScore(p: BaseProps, needle: string): number {
  if (!needle || p.kind === "loaded-box") return 0;
  const name = p.name.toLowerCase();
  const id = p.id.toLowerCase();
  if (name === needle || id === needle) return 3;
  if (name.startsWith(needle) || id.startsWith(needle)) return 2;
  if (name.includes(needle)) return 1;
  for (const [k, v] of Object.entries(p.details ?? {})) {
    if (!searchableDetail(k)) continue;
    if ((typeof v === "string" || typeof v === "number") && String(v).toLowerCase().includes(needle)) return 1;
  }
  return 0;
}
