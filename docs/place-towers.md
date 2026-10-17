# Catalogued collections as place towers

eye's catalogued collections can be counted per place and handed to
vector-places (the county and metro-year place embedding) as candidate towers.
This page is the spec and the record of what is built: NPL (a year series),
UST releases, UST facilities and FUDS properties (static snapshots). ATTAINS
and PAD-US are not built; the reasons are below. The vector-places repository
is not changed from here; it converts the JSON on its side.

## Contract

Each export is a committed JSON file written by its own script and served
as-is by `/api/catalog?op=place-export&collection=<card id>` (MCP tool
`place_export`). Nothing is pulled at request time.

- `places`: 5-digit county FIPS, from `lib/places/data/counties.json` (TIGERweb ACS2023, 3,222 counties, pulled 2026-10-01).
- `meta.form`: `series` (`meta.years`, `value[place][year][feature]`; NPL) or `static` (one snapshot dated by `meta.asOf`, `meta.years` null, `value[place][feature]`; UST, FUDS). Nothing static is carried across years. Every served response has it: the UST and FUDS files carry it, and `lib/catalog/placeExport.ts` adds it from `PLACE_EXPORT_FORM` where a file has none (`npl-county.json`, whose script and shas are unchanged).
- `meta.features`, in the order of the innermost value array.
- `nullPlaces`: counties whose value is unknown (null for every feature and year), each with its reason. vector-places sets mask = 0 for these.
- `nullCells` (static exports where a source leaves single fields null): `{ place: { feature: reason } }`; the value there is null, never 0.
- `meta.zero_vs_missing` and `meta.zeroRule`: when a county absent from `places` and `nullPlaces` has a true 0. Only a complete-census source may say so.
- `meta.source`: layer URL, query, every page's URL and response sha256, fetch time, `Last-Modified` when sent (null otherwise, never invented), and the service's own data edit date.
- `siteIds`, `sourceIds` or `propertyIds` (the source's record ids): what each count was made from, so any number can be re-derived.
- A completeness check the script runs before writing (the rows or distinct ids read equal the service's `returnCountOnly`).

County joins share `lib/places/countyJoin.ts` (UST and FUDS; NPL's script carries the same rule inline and is unchanged): a county name is matched whole first, lists are split on commas and slashes only, a bare name that is both a county and an independent city is not placed by name (both are its candidates; FUDS then lets the point decide between them), and a name that matches nothing fails closed. It also holds the point-in-county test (even-odd, holes counted, never the nearest county).

On the vector-places side a series maps to the `places/fetch/table.py` npz shape: `years[Y]`, `places[P]`, `features[F]`, `value[Y,P,F]` with NaN where masked, `mask`, `reason`, and the file provenance. A static export maps to table.py's per-place extras, `place_<feature>[P]` with `place_<feature>_mask`, and its reason per cell from `nullPlaces` and `nullCells`. A tower module follows `places/towers/t6_banking.py` (`ID`, `NAME`, `TABLE`, `features()`), its source entry follows `sources/registry.json`, and it must earn its place on the bench like any other tower (coverage of at least 0.5 observed).

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

## Built: T-ust (`ust-releases-county`, `ust-facilities-county`)

`scripts/export-ust-county.mjs` -> `lib/catalog/data/ust-releases-county.json` and `lib/catalog/data/ust-facilities-county.json`.

- Source: EPA UST Finder FeatureServer, keyless, layer 3 (Releases_by_County) and layer 2 (Facilities_by_County), every row: 3,220 each on 2026-10-16, equal to the service's own count. EPA last edited both layers on 2026-02-13. The point layers (0 and 1) are never requested: many sites are private homes. `POPULATION` is not exported (Puerto Rico's rows carry -99, and vector-places has its own population tower).
- Form: static. The service calls itself a national composite of state records as of 2018-2021, tribal records to October 2025. One value per county, not a year series.
- Features: releases `ust_release_count`, `ust_open_release_count`, `ust_nfa_release_count`; facilities `ust_facility_count`, `ust_open_tanks`, `ust_closed_tanks`, `ust_tos_tanks`. Each is the layer's own field, as published; nothing is derived (an "unknown status" count by subtraction stays out, as on the card).
- County join: the layers carry no FIPS. Each of the 3,222 counties is looked up by state and normalised name; a name must match one row and a row serves one county. Virginia's independent cities are mostly named bare in UST Finder ("Norton"), so "<X> city" takes the bare name only when the state has no "<X> County". Check: each county's Census internal point must fall in the polygon of the row its name matched (the layer's own outlines, about 100 m generalised, not exported). 3,208 do, 3 coastal points (Kodiak Island, Aransas, Island WA) fall in no polygon, 0 fall in another row's.
- Zero vs missing: `as-published`. Every county has a row, so no 0 comes from an absent row. A 0 is the layer's own and is kept and listed in `meta.publishedZeros` (9 release counts: Kalawao HI, Cleveland and Madison AR, Jefferson FL, Issaquena MS, and Camuy, Santa Isabel, Vieques and Culebra PR; 919 facility-layer zeros, 884 of them temporarily-out-of-service tanks). The composite is only as complete as each state's records, so vector-places may keep a published 0 or mask it; the export does not decide that.
- Null (2026-10-16): 11 `nullPlaces`, all `join:no_source_row`: Connecticut's 9 planning regions (UST Finder has the 8 legacy counties) and Chugach and Copper River, AK (UST Finder has their predecessor Valdez-Cordova). These 9 rows are listed in `meta.unusedSourceRows`; nothing is split or summed across geographies.
- Null cells (`nullCells`, `source:null_in_county_layer`), by state in `meta.counts.nullCellsByState` and explained in `meta.nullCellNote`:
  - open releases 505: all 120 of Kentucky's counties, plus 385 counties in 34 other states (Texas 58, Tennessee 37, Virginia 34, North Dakota 33, Arkansas 29, and fewer elsewhere, Puerto Rico 8 among them);
  - no-further-action releases 225: all 78 of Puerto Rico's, plus 147 elsewhere: 119 in Kentucky, 21 in Washington, Arkansas 2, and Florida, Hawaii, Idaho, Mississippi and Texas 1 each;
  - open tanks 80: Puerto Rico's 78 and two Georgia counties, 13123 (Gilmer) and 13125 (Glascock), which publish 0 facilities;
  - closed and temporarily-out-of-service tanks 118 each: Puerto Rico's 78, 38 California counties (Los Angeles among them) and the same two Georgia counties.
- What the release-status nulls most likely mean: the layer never publishes a 0 for `Open_Count` or `No_Further_Action_Count` (live, 2026-10-16: no row `= 0` in either, 505 and 225 `IS NULL`), so for many counties a null there is most likely a 0 the layer did not write. Of the 385 open-count nulls outside Kentucky, 359 are counties whose release count equals their no-further-action count, which leaves nothing open; where all three fields are published (2,614 counties), open plus no further action equals the release count in 2,456 and is never above it. Nine counties publish 0 releases with a null status count (Kalawao, HI among them), where the status can only be 0. Of the 147 no-further-action nulls outside Puerto Rico, 119 are Kentucky's (open is null there too) and 17 have open equal to the release count. The nulls are kept, not filled: filling them is vector-places' modelling choice. The missingness is not random (whole states, and in other states the counties where every release has one status), so it should not be treated as random. The evidence is in `meta.nullPattern`.
- Observed share of the 3,222 counties: release count 0.9966, open releases 0.8399, no-further-action 0.9268, facility count 0.9966, open tanks 0.9718, closed tanks 0.9600, out-of-service tanks 0.9600.

## Built: T-fuds (`fuds-properties`)

`scripts/export-fuds-county.mjs` -> `lib/catalog/data/fuds-county.json`.

- Source: USACE FUDS FeatureServer layer 1 (property points), keyless, every row: 10,123 on 2026-10-16, equal to the service's count; 14 are exact duplicates (Palau, identical in every requested field), so 10,109 properties. USACE last edited the layer on 2026-10-07; every row is FISCALYEAR 2024, which USACE calls preliminary. Requested: property number, STATUS, COUNTY, STATE, FISCALYEAR and the point. Never requested: CURRENTOWNER, FEATUREDESCRIPTION, FEATURENAME and the other name fields. The file has property numbers per county and no coordinates.
- Form: static, the FY2024 inventory. FISCALYEAR is the data year, not a history.
- Features: `fuds_properties` (properties USACE locates in the county), `fuds_properties_with_projects` (STATUS "with projects" or "with all projects at site closeout"), `fuds_properties_with_open_projects` (STATUS "with projects", not all at closeout). Eligibility is not a feature (463 null, three categories).
- County join, as NPL's: USACE's COUNTY string by name places a property (9,517). Its point is then only a check: 7,807 agree, 493 are in another county of the state (369 of them adjacent, which is what a large range or airfield whose point sits over the line looks like; kept, listed in `meta.pointDisagreements`), 231 are in no county of the state. The point places a property when it is in exactly one county of the property's state and the string is blank (21), names no county (105; this places Connecticut's legacy-county properties that have a point), or could name more than one: a name that is both a county and an independent city (ST LOUIS, FAIRFAX, RICHMOND, BALTIMORE) is ambiguous by name, and the point decides when it is in one of the two (51; e.g. B07MO0988, "ST LOUIS", goes to St. Louis city, 29510). A list of counties is decided the same way; none was on 2026-10-16. The 177 are split in `meta.counts.joinMethod.pointOnlyByNameReason`; where the point is in neither, those counties are null. Three single names one edit from exactly one county of the state are taken and listed (`meta.nearNames`: SCHUYKILL, BARNEWELL, WHICHITA). The outlines are TIGERweb Generalized_ACS2023 Counties 500K, the vintage of `counties.json`, fetched by the script and not committed.
- Out of scope: 138 properties in American Samoa, the Northern Marianas, Guam, Palau and the Virgin Islands, which are not in `counties.json`.
- Zero vs missing: `complete-census` for located properties. The FUDS inventory is USACE's complete list, so a county in neither `places` nor `nullPlaces` has 0, and that 0 means no property USACE locates in this county. It does not mean no FUDS property is there: 265 of the 9,971 in-scope properties (2.7%) have a state but no county string and no point in a county (`meta.unlocated`, by state: NC 51, TX 52, VA 43, LA 23, FL 16, WY 13, ID 11, NY 10, MD 10, and fewer elsewhere). USACE locates them in no county, so they are in no county's count, and a county's 0 does not rule them out. Cam approved this zero rule on 2026-10-16 (`meta.zeroRuleStatus`); the strict alternative is below and kept in `meta.counts.strictRule` for reference.
- Null (2026-10-16): 14 `nullPlaces`: 9 `join:unplaced_property_in_state` (all of Connecticut: 5 properties with a legacy county string and no point in a planning region), 3 `join:ambiguous_county_or_city` (two "BALTIMORE" properties whose points are in Anne Arundel: Baltimore County, Baltimore city and Anne Arundel), 2 `join:predecessor_county` (two Valdez-Cordova properties: Chugach and Copper River, Census's successors). The join places 9,697 of the 9,971 in-scope properties (`meta.counts.placed`), but 125 of those are in counties that another property nulled (Connecticut 49; Chugach and Copper River 43; Baltimore County, Baltimore city and Anne Arundel 33; listed per county in `meta.placedThenNulled`), so 9,572 are counted (`meta.counts.counted`, the property numbers in `propertyIds`). 1,638 counties have at least one, 1,570 have a true 0.
- Coverage: 0.9957 of counties observed. The strict alternative, NPL's rule applied to unlocated properties too (every county of a state with one null), gives 0.4050, with 27 states and Puerto Rico entirely null; it is reported in `meta.counts.strictRule` for reference. The shipped rule is the definitional one: the feature counts properties USACE locates in the county, and that list is complete. Cam approved it on 2026-10-16 (keep the zeros); the strict alternative stays in `meta.counts.strictRule` for reference.
- Not done: the 493 point disagreements were not checked one by one against USACE's property pages.

## Not built

| Candidate | Source state | Why not this round |
|---|---|---|
| Impaired waters (`attains-impaired`) | Per state and reporting cycle; no county field, and assessment units cross counties | Placing a unit in a county needs an areal or length apportionment, which is a modelling choice and not a published value. |
| Protected areas (`padus-units`) | PAD-US 4.1, current state, 647,844 units in the four categories | The proposed `place_padus_gap12_share` is an area share computed from geometry, a derived number; vector-places has to rule whether it counts as published before it is built. A count of units per county would mostly count easements and designations, and a unit crosses counties. |

## Deferred

- Re-running NPL with the shared join and the point-in-county test, which would place its Connecticut sites and multi-county sites by their points. Its script is unchanged in this round, so its committed file and shas are unchanged.
- ATTAINS and PAD-US, above.
- Importing these into vector-places is that repository's work: a tower module per export (`ID`, `NAME`, `TABLE`, `features()`), a source entry in `sources/registry.json` (UST `zero_vs_missing` "missing" with published zeros kept; FUDS "true_zero"), and the bench's coverage bar.

## Round 4 candidates (spec only; layers round 4, 2026-10-16)

Raised by the round-4 layers PR for the place-tower lane; nothing here is built by that PR.

| Candidate | Source state | Tower form | Zero vs missing |
|---|---|---|---|
| FEMA National Risk Index (`nri-counties`) | FEMA NRI, December 2025 (1.20.0), 3,232 county rows keyed by `STCOFIPS`; Connecticut in planning regions (09110-09190), the TIGER-current regime of `counties.json`, so no crosswalk | Static per-county attributes from one vintage: `RISK_SCORE`, `EAL_VALT`, `SOVI_SCORE`, `RESL_SCORE` and the 18 `*_RISKS` hazard scores. Not a year series; nothing carried across years. | `published-or-null`: a county absent from the 3,232 is null with reason `join:unmatched_county`; "Insufficient Data" (88 counties on the composite) is null with `source:insufficient_data`, never 0. `SOVI_*` is FEMA's (from the Census Community Resilience Estimate), not CDC SVI. |
| CDC PLACES (`places-county`) | PLACES 2025 release, data year 2023 (2022 for COLON_SCREEN, DENTAL, MAMMOUSE, SLEEP, TEETHLOST), `locationid` = county FIPS, CT in planning regions | Static per-county age-adjusted prevalence for the 40 measures, with each CI in provenance. One vintage; a second release makes a two-point series only if CDC's methods note says the releases are comparable. | `published-or-null`: a county absent for a measure (2,958 of 3,145 for most measures, 2,300 for the social-needs module) is null with `source:not_published`. |
| National Historic Landmarks per county (`nhl-listed`) | NPS `nrhp_locations` layer 0, `Is_NHL='X' AND STATUS='Listed'`, 1,196 points; `County`/`State` names, no FIPS | `place_nhl_count` from one current snapshot | A `(State, County)` name join failing closed, as T-npl; Connecticut's legacy county names leave its planning regions unmatched (null, not 0). Points carry no listing history for a series. |

## Round 5 candidates (spec only; layers round 5, 2026-10-17)

Raised by the round-5 layers PR for the place-tower lane; nothing here is built by that PR. The hospital and school zero rules need Cam's approval before the lane builds them (`meta.zeroRuleStatus: "pending Cam"`), as the FUDS rule did.

| Candidate | Source state | Tower form | Zero vs missing |
|---|---|---|---|
| CDC/ATSDR SVI (`svi-counties`) | SVI 2022 (ACS 2018-2022), 3,144 county rows keyed by `FIPS`; Connecticut in planning regions (09110-09190), the regime of `counties.json`, so no crosswalk; 0 counties with `RPL_THEMES < 0` on 2026-10-16 | Static per-county percentiles from one vintage: `RPL_THEMES`, `RPL_THEME1`-`RPL_THEME4`, `F_TOTAL`. Not a series: CDC ranks within each release, so a later SVI is a new vintage, not a second year, unless CDC's notes say the releases are comparable. | `published-or-null`: `-999` is null with reason `source:not_ranked`; a county in `counties.json` with no SVI row (the territories) is null with `source:not_in_release`. Never 0. This is not NRI's `SOVI_*` (Census Community Resilience Estimate); the two are separate features if both are built. |
| HIFLD hospitals (`hifld-hospitals`) | FEMA RAPT's copy of HIFLD, data edited 2026-04-22; 8,514 rows, 8,140 open, every row with a `COUNTYFIPS` (0 missing), Connecticut in planning regions | One static snapshot: open hospitals per county by the published `COUNTYFIPS` (not a spatial join), open general acute care, open critical access, and the published beds sum | Counts: a county with no open hospital is 0, because the inventory is national (pending Cam). Beds: null for a county where any open hospital has `BEDS = -999` (`nullCells`, `source:beds_not_published`), never a partial sum. |
| NCES public schools (`nces-public-schools`) | EDGE 2024-25, 101,110 schools keyed by the published `CNTY`; Connecticut in planning regions | One static snapshot (2024-25): operating public schools per county (Inactive and Future left out), by level (elementary, middle, high, other) and charter count. Enrollment is not in this spec: 1,865 schools report a negative `TOTAL`, so a county sum would be null for many counties or silently partial. | Counts: a county with no operating public school is 0, because the CCD directory is a census of public schools (pending Cam). |

## Round 6 candidates (spec only; layers round 6, 2026-10-17)

Raised by the round-6 layers PR for the place-tower lane; nothing here is built by that PR.

| Candidate | Source state | Tower form | Zero vs missing |
|---|---|---|---|
| FCC broadband (`fcc-bdc-counties`, tower `broadband-county`) | FCC Broadband Data Collection, December 2025, as Esri Policy Maps summarizes it (Esri Master License Agreement on the summary layer; figures the FCC's), 3,234 county rows keyed by `GEOID`; Connecticut only in its eight legacy counties (09001-09015), not the planning regions of `counties.json` | Static per-county values from one vintage: `UnservedBSLs/TotalBSLs`, `UnderservedBSLs/TotalBSLs`, `ServedBSLsFiber/TotalBSLs` (each a ratio of two published counts) and `UniqueProviders`. A series later only from the FCC's own semiannual files (D6-1), never by reading Esri's 6- and 12-month-previous columns as history. | `published-or-null`: Connecticut's nine planning regions are null with reason `join:legacy_ct_counties` (no crosswalk invented); a county in `counties.json` with no BDC row is null with `source:not_in_release`; a share with `TotalBSLs = 0` (none on 2026-10-17) is null, never 0. |
| USFS wildfire risk ranks (`wrc-counties`, tower `wrc-county`) | Wildfire Risk to Communities, 2nd edition (2024; boundary layers May 2025 on 2023 geography), CC0 1.0, 3,144 county rows keyed by `GEOID`; Connecticut in planning regions (09110-09190), so it joins directly; no territories | Static national ranks, 0-100 parsed from the published percent strings: `RISK_NATIO`, `BP_NATIONA`, `WHP_NATION`, `EA_HURISK1`, and `BUILDINGS1` (share of buildings in direct exposure). National ranks only: state ranks do not compare across states. | `published-or-null`: District of Columbia (11001, every rank blank) is null with `source:not_ranked`; territories in `counties.json` are null with `source:not_in_release`. Never 0. |
| BIA trust land (`bia-lar`) | BIA AIAN Land Area Representation, 335 land areas | **No tower.** LAR is not a county measure, and a "share of county in trust land" would be a spatial derivation from `GISACRES`, which BIA says not to use for survey. Revisit only with BIA's own county statistics. | n/a |
