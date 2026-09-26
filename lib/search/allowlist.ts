// What the ⌘K palette (and nothing else) may match a query against.
//
// A feature is found by its name, its id, or one of the dossier fields on
// SEARCHABLE_DETAILS: published identifiers and place names only. Owner,
// operator, manager, easement-holder, bank and recipient fields are never on
// the list, so there is no search from a person's or company's name to what
// they own or operate (README, Ethics; CONTRIBUTING, ground rules). A new
// layer's identifier is added here explicitly; nothing is searchable by
// default. Pure, so the rule is tested without a globe.

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
  // launches
  "vehicle",
  "mission",
  "pad",
  "site",
  // hazards, land, water, economy
  "fire id",
  "cowardin code",
  "zone",
  "port code",
  "locode",
  "local name",
  // companies, banks, constructs: identifiers their publishers assign
  "ticker",
  "cik",
  "fdic cert",
  "code",
  // places
  "place",
  "area",
  "county",
  "state",
  "country",
  "venue",
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
