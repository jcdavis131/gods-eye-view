// The names an insight prints for a metro, from Atlas's own metro registry
// (lib/places/data/metros.json through lib/places/registry.ts), keyed by CBSA.
//
// A bundle carries a label and a title beside every CBSA it names (its slots,
// its lists, its chart rows, the robustness rows' metros). Those strings are
// the producer's, so build.ts never prints them: it looks the CBSA up here,
// refuses the finding when the bundle's string is not the registry's, and
// prints the registry's. A label the producer got wrong, or a "label" that
// is a sentence ("Austin (unbeaten on both)", "Houston" on Beaumont's CBSA),
// is a refusal, and could not have printed even if a check were missed.
//
// The title is the registry's name as it stands (the OMB delineation title,
// "Austin-Round Rock-San Marcos, TX"). The label is its first principal city
// by one fixed rule: the part before ", ", then before "--" and "/", then
// before the first "-", unless the city's own name has a hyphen
// (HYPHENATED_CITIES). QCEW names a metro by its own area code, "C" and the
// CBSA's first four digits, and titles it with " MSA" after the name.

import { metroByCbsa } from "@/lib/places/registry";
import type { MetroRef } from "./types";

/** First principal cities whose own name carries a hyphen, which the label keeps whole. */
export const HYPHENATED_CITIES: readonly string[] = ["Winston-Salem"];

/** The short label of a metro title: its first principal city ("Austin-Round Rock-San Marcos, TX" -> "Austin"). */
export function shortLabel(title: string): string {
  const place = title.split(", ")[0];
  const first = place.split("--")[0].split("/")[0];
  for (const city of HYPHENATED_CITIES) if (first === city || first.startsWith(`${city}-`)) return city;
  return first.split("-")[0].trim();
}

/** The metro's names from Atlas's registry, or null when the registry has no such CBSA. */
export function metroName(cbsa: string): MetroRef | null {
  if (!/^\d{5}$/.test(cbsa)) return null;
  const m = metroByCbsa(cbsa);
  return m ? { cbsa, label: shortLabel(m.name), title: m.name } : null;
}

/** BLS QCEW's area code for a metro: "C" and the CBSA's first four digits; null for a CBSA that does not end in 0. */
export function qcewCode(cbsa: string): string | null {
  return /^\d{4}0$/.test(cbsa) ? `C${cbsa.slice(0, 4)}` : null;
}

/** The CBSA a QCEW area code names, or null when it is not one. */
export function cbsaOfQcew(code: string): string | null {
  const m = /^C(\d{4})$/.exec(code);
  return m ? `${m[1]}0` : null;
}

/** The title QCEW gives a metro: the registry's name with " MSA" after it. */
export function qcewTitle(m: MetroRef): string {
  return `${m.title} MSA`;
}
