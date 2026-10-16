# Catalogued collections as place towers (spec)

eye's catalogued collections can be counted per place and handed to
vector-places (the county and metro-year place embedding) as candidate towers.
This page is the spec. One export is built: NPL. The vector-places repository
is not changed from here; it converts the JSON on its side.

## Contract

Each export is a committed JSON file written by its own script and served
as-is by `/api/catalog?op=place-export&collection=<card id>` (MCP tool
`place_export`). Nothing is pulled at request time.

- `places`: 5-digit county FIPS, from `lib/places/data/counties.json` (TIGERweb ACS2023, 3,222 counties, pulled 2026-10-01).
- `meta.years`, `meta.features`, and `value[place][year][feature]`.
- `nullPlaces`: counties whose value is unknown (null for every feature and year), each with its reason. vector-places sets mask = 0 for these.
- `meta.zero_vs_missing` and `meta.zeroRule`: when a county absent from `places` and `nullPlaces` has a true 0. Only a complete-census source may say so.
- `meta.source`: layer URL, query, every page's URL and response sha256, fetch time, `Last-Modified` when sent (null otherwise, never invented), and the service's own data edit date.
- `siteIds` (or the source's record ids): what each count was made from, so any number can be re-derived.
- A completeness check the script runs before writing (for NPL: the distinct ids read equal the service's `returnCountOnly`).

On the vector-places side this maps to the `places/fetch/table.py` npz shape: `years[Y]`, `places[P]`, `features[F]`, `value[Y,P,F]` with NaN where masked, `mask`, `reason`, and the file provenance. A tower module follows `places/towers/t6_banking.py` (`ID`, `NAME`, `TABLE`, `features()`), its source entry follows `sources/registry.json`, and it must earn its place on the bench like any other tower (coverage of at least 0.5 observed).

## Built: T-npl (`npl-status`)

`scripts/export-npl-county.mjs` -> `lib/catalog/data/npl-county.json`.

- Source: EPA's Superfund National Priorities List (NPL) Sites with Status Information, FeatureServer/0, keyless. Every row, paginated; one row per site (distinct `Site_EPA_ID` checked). 1,840 sites on 2026-10-16, equal to the service's own count.
- Features, per county and year 2015-2025:
  - `npl_active`: listed by December 31 and not deleted by then;
  - `npl_listed_in_year`, `npl_deleted_in_year`;
  - `npl_construction_complete_cum`: construction-completion date by December 31.
- Dates are EPA's MM/DD/YYYY strings, read strictly. A site with no listing date (proposed, not listed) is never active.
- County join: `(State, County)` by normalised name, failing closed. The County string is matched whole first, so a single county whose name has "and" in it (Lewis and Clark, MT; King and Queen, VA) is one county; only when the whole string fails is it split into a list, on commas and slashes only. A site EPA lists in several counties ("Kern, Los Angeles, San Bernardino") is not placed in one. A bare "Baltimore", "St. Louis" or "Roanoke" can be the county or the independent city, so it is not placed either. Connecticut's rows name legacy counties, which ACS2023 replaced with planning regions, so they do not match.
- Zero vs missing: the NPL list is complete for the United States, so a county with no site has a true 0. A county that an unplaced site could be in is null instead:
  - for a multi-county site or a county-or-city name, the counties named;
  - when the name matched nothing, every county of the state. This also applies to a multi-county list where any one name matched nothing: the whole state is null, not just the named counties.
- Null counts on 2026-10-16 (110 counties): 39 `join:unmatched_site_in_state` (all 9 of Connecticut's planning regions; all 30 of Alaska's boroughs and census areas, from one "Outer Ketchikan" site), 65 `join:multi_county` (30 multi-county sites), 6 `join:ambiguous_county_or_city` (Baltimore, St. Louis, Roanoke, county and city each). Seven sites are in territories outside `counties.json` (American Samoa, Guam, Micronesia, Northern Marianas, Virgin Islands) and are not in the export. 1,773 of 1,840 sites are placed, in 729 counties.
- Site points: each matched site's own point is compared with its county's centroid, and those over 150 km away are listed in `meta.farMatches` (one on 2026-10-16, in the Aleutians). They are kept: the check only flags them.

Proposed derived feature: `npl_active_per_100k`, computed in vector-places from its own population tower, with `derived:zero_denominator` as the reason where the denominator is 0.

## Spec only (not built)

| Candidate | Source state | Tower form | Blocker |
|---|---|---|---|
| UST releases and facilities (`ust-releases-county`, `ust-facilities-county`) | EPA UST Finder, a 2018-2021 state-records composite (tribal to October 2025), county names, no FIPS | Static per-place values: `place_ust_release_count`, `place_ust_open_count`, `place_ust_facility_count`. Not a year series, and nothing is carried across years. | The county-name join, with the same fail-closed rule. A state with gaps in UST Finder's coverage gets mask = 0, not 0. |
| FUDS properties (`fuds-properties`) | USACE FY2024 inventory, current state, a point per property | Possibly `fuds_properties[p]` from the FY2024 snapshot only | Needs a point-in-county join (not done: `counties.json` has centroids, not outlines). The properties layer's year field is a data year, not a history. |
| Impaired waters (`attains-impaired`) | Per state and reporting cycle; no county field, and units cross counties | None this round | Placing a unit in a county would need an areal or length apportionment, which is a modelling choice and not a published value. |
| Protected areas (`padus-units`) | PAD-US 4.1, current state | `place_padus_gap12_share` (share of area in GAP 1-2) | An area share is a derived geometry number; vector-places has to rule whether it counts as published. |

## Deferred

- A point-in-county join from each site's own coordinates. It would place NPL's multi-county, county-or-city and Connecticut sites, and FUDS properties. It needs county outlines, which `counties.json` does not carry.
- The UST, FUDS and PAD-US exports above.
- Importing these into vector-places is that repository's work.
