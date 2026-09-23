# Constructs: the world laid over the world

The other layers show the physical world: aircraft, ships, gauges, wells, harbours, bank offices. The **constructs** layer shows the frames people and scientists lay over that ground: the county that governs a block, the districts that vote for it, the watershed it drains through, the ecoregion it belongs to, the flood zone it was mapped into, the office that forecasts its weather, the federal regions that answer for it.

A point is where all of those frames meet, so **the point is the join key**. Every point of view on the globe connects to every other through the constructs they share.

## On the globe

Switch on **Constructs** (Layers panel, `?layers=constructs`, or say "show constructs" / "show jurisdictions"). Around the camera target, every construct floats as a node in a rising spiral. The smallest (flood zone, tract) sits nearest the ground and the largest (census region, country) sits highest. Each node:

- is coloured by its **point of view**: civic (who governs it), representation (who speaks for it), service (who serves it), statistical (how it is counted), hydrologic (where its water goes), ecological (what grows there), hazard (what threatens it), federal (which federal office answers for it), world;
- has a tether down to the point it was asked about;
- has its outline drawn at the node's height, so the stack reads as nested shells.

Select a construct and its outline brightens, with a dashed footprint dropped onto the ground. The info panel then shows:

- **Relations**: which constructs it is inside or contains, and where its water drains to.
- **Inside, joined by location**: every feature loaded on the globe right now that falls inside the construct's outline, grouped by layer. For example, the 40 USGS gauges and the two public companies inside Travis County, or the wells in a HUC-8. Click one to fly to it.

Select any other object (a gauge, a well, a company, an aircraft) while the layer is on, and its panel lists **Inside these constructs**. That is the same join run in the other direction.

The white **Here** node at the ground lists the whole stack by point of view, with links to the water and market reports for the same point and the JSON and CSV behind it.

## Emergence: constructs that take their state from the physical twin

A construct has no sensors of its own. What it knows is what the physical layers put inside it. Two things make that visible.

**The construct field** (Layers → *Construct field*, `?layers=field`) tiles the whole view with one kind of construct, from one point of view, and floats it as a plate above the globe. The kind **emerges from the zoom**: the hydrologic view is water regions (HUC-2) from orbit, then subregions, basins, subbasins, watersheds, and subwatersheds (HUC-12) over a county. The civic view goes state, county, city. Representation goes state, congressional district, state senate, state house. Statistical goes state, metro, county, tract. Ecological goes level III, then level IV. Service goes state, then school district. The ladder is in `lib/fabric/fieldScale.ts`.

Every unit's **heat** is recomputed in the browser every four seconds from the physical features loaded inside its outline: gauges, wells, aircraft, ships, earthquakes, harbours, crossings, company headquarters, bank offices, cameras. Heat is the count or the density per 1,000 km², square-root scaled against the busiest unit in view (`lib/fabric/emergence.ts`, `components/globe/EmergenceBridge.tsx`). A unit's column of light rises with its heat, its outline and its ground wash warm from slate through cyan and gold to orange, and the busiest six carry a label. When an aircraft crosses into a district, the district changes. Only units whose vitals changed are redrawn. The Layers panel picks the point of view, what drives the heat (every physical signal, or one layer), and count versus density. Select a unit for its emergent state, its rank in view, and every loaded feature inside it.

**Condition, not just presence.** Counting what is inside a unit says where the instruments are. Pick *streamflow vs normal for today* as the heat and the field shows what the units are doing instead. Every loaded USGS gauge's latest flow is placed among the percentiles of daily-mean discharge that USGS publishes for today's calendar day (the Water Data Statistics API, `observationNormals` by day of year, 5th to 95th). Between published percentiles the placement is linear. Below the 5th it reads 2.5 and above the 95th it reads 97.5, because the tails are not published. A tie (a dry creek where p10 = p25 = p50 = 0) sits in the middle of the tie. Each unit takes the median of its rated gauges and the WaterWatch class of that median: much below normal (red), below (amber), normal (green), above (cyan), much above (blue). Its column rises with the distance from the median, either way, and to the top when an NWS forecast point inside is at minor flood or worse. A gauge without a percentile table is left out, never assumed normal. Comparing an instantaneous reading with daily means is an estimate, and the panel says so. Choosing the measure switches the gauges on. Select a unit to see its gauges split by class.

Rules the field keeps: simulated vehicles (the traffic layer) never count; only point features count, because an area layer (counties, countries) is a construct of its own; the weather sampling grid and metro-centroid statistics are not things on the ground and do not count; and every place that shows a heat says it is what is loaded now, not a census of the ground. The layer carries an ESTIMATE tag for that reason.

**Where the water goes.** Water is the physical flow that links constructs. From the Here node, or any watershed, *Trace downstream* walks the Watershed Boundary Dataset's ToHUC links from the HUC-12 under the point to its terminal: ocean, closed basin, Canada or Mexico. It draws the path through each subwatershed's centre, with an arrow into the terminal and the subwatersheds' outlines on the ground. It then joins every loaded gauge and well along the way to it. Downtown Austin reaches Matagorda Bay in 29 subwatersheds; Denver reaches the Gulf in 217, down the South Platte, the Platte, the Missouri and the Mississippi. Say "where does the water go".

The walk reads a bundled national drainage table (`lib/fabric/data/huc12-tohuc.json`: 103,068 HUC-12s in 245 basins, pulled 2026-09-22, 2.6 MB; rebuild with `node scripts/wbd-data.mjs`, which resumes from `.tmp-wbd/`). The live WBD service answers cold queries in tens of seconds and often with a 502 or 504, so the table makes the walk instant. The outlines and names are still fetched live, in batches of 100, and the path fills in behind them. A basin missing from the table falls back to a live query. A leg that would not finish inside a serverless call stops with a `next` cursor, and the browser continues from there, so a long trace grows toward the sea instead of failing. The path joins watershed centres; it is the order the water takes through the watersheds, not the river's line, and the panel says so.

**What drains here.** Read backwards, the ToHUC links give a tree rather than a chain: every HUC-12 whose water passes through the unit under the point. *Trace upstream* (next to *Trace downstream*) builds that set from the bundled table in a few milliseconds. It then compacts it to its smallest cover of whole units. WBD codes nest, so wherever every HUC-12 of a HUC-10, HUC-8, HUC-6, HUC-4 or region is upstream, the whole unit stands in for them. Downtown Austin's catchment is 832 subwatersheds, drawn as 16 subbasins, 38 watersheds and 78 subwatersheds (90,411 km² of published WBD area). The Mississippi at the Gulf is 31,300 subwatersheds, drawn as 1,710 units from subregions down. The cover's outlines stream in coarse units first, up to 600. Beyond that only names and areas are asked for, so the area is complete even where the drawing is not.

Then the gauges inside the catchment, within a few degrees of the outlet, are read against normal for the day, together with any NWS forecast point in flood. That tells you what is coming down the river toward the point. The catchment is that of the subwatershed's outlet, not the exact point, and areas WBD marks as draining elsewhere (closed basins, non-contributing playas) are not in it. Say "what drains here".

## Live warnings: constructs that are born and die

Counties and watersheds change by the decade. An NWS warning is a construct that exists for hours: an area a forecaster drew around the people and places at risk (or the forecast zones they named), in force from its onset until it expires. The **Live warnings** layer (`?layers=alerts`) draws every alert NWS rates Severe or Extreme that way, in its hazard family's colour: tornado, flood, storm, wind, fire weather, winter, heat, marine, coastal. The outline breathes while the warning is in force and fades in its last hour. A warning is a hazard construct like a flood zone. Select it to join it to everything loaded inside it: under a flood warning, the gauges and how high their rivers are running against normal for the day. Select any gauge or camera and the warnings it sits in are listed with the other constructs. Warnings are never counted as physical signals in the field.

**Teleport** (top bar, the phone nav, or say "teleport") is the tour of what is unusual right now. It merges the live warnings with the past day's M4.5+ earthquakes and orders them by the agencies' own ratings: NWS severity, urgency and certainty, with warnings in force now ahead of ones that start later; USGS magnitude, PAGER alert and tsunami flag. The order is for a tour and is never shown as a score. Each hop frames the warning's extent (or the epicentre) and switches on what makes the place legible: the warning itself, the stack of constructs under the camera, and for a flood the gauges and the field lit by streamflow. Then it selects the warning. Autoplay moves on every 20 seconds; any touch pauses it.

**Civic & planning** is a lens (`?lens=civic`) that opens on the stack, the field and the physical layers that light it, over downtown Austin.

## The API

```bash
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27"              # attributes
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27&geometry=1"   # plus generalised outlines
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27&format=csv"   # one row per construct
```

```bash
curl "https://eye.jcamd.com/api/fabric?op=field&kind=huc8&bbox=-100,28,-94,33"                  # every HUC-8 in a box
curl "https://eye.jcamd.com/api/fabric?op=field&pov=civic&h=400000&bbox=-100,28,-94,33"          # the kind that emerges at 400 km
curl "https://eye.jcamd.com/api/fabric?op=downstream&lon=-97.74&lat=30.27"                       # one leg of the walk to the sea
curl "https://eye.jcamd.com/api/fabric?op=outlines&huc12=120902050306,120902050307"              # outlines, centroids, names
curl "https://eye.jcamd.com/api/fabric?op=upstream&lon=-97.74&lat=30.27"                         # the catchment as whole WBD units
curl "https://eye.jcamd.com/api/fabric?op=units&codes=12,1209,12090205"                          # outlines, names, areas at any level
curl "https://eye.jcamd.com/api/water?op=normals&sites=08158000,08167000&date=09-23"             # daily flow percentiles per gauge
curl "https://eye.jcamd.com/api/live"                                                            # warnings and earthquakes, tour order
```

The MCP tools `place_fabric`, `construct_field`, `downstream`, `upstream`, `flow_normals` and `live_events` wrap the same routes. The county code, the point and the metro code it returns feed `sectors`, `county_history`, `banks`, `federal_spending`, `water_report` and `market_report`, so one call links an agent to every other report.

| Point of view | Constructs | Source |
| --- | --- | --- |
| Civic | state, county, incorporated place, tribal land | Census TIGERweb `tigerWMS_Current` |
| Representation | congressional district, state senate and house districts | Census TIGERweb |
| Service | school districts, NWS forecast office and zone, time zone | TIGERweb, api.weather.gov |
| Statistical | tract, ZIP code area, CDP, metro/micro area, CSA, urban area, census division and region | TIGERweb |
| Hydrologic | HUC-2 to HUC-12, with the downstream HUC-12 | USGS Watershed Boundary Dataset |
| Ecological | level III and IV ecoregions (level I and II as facts) | EPA |
| Hazard | effective flood zone, NFIP community, FIRM panel; live NWS warnings (Severe and Extreme) | FEMA National Flood Hazard Layer; api.weather.gov active alerts |
| Federal | EPA region, FEMA region, Federal Reserve district | published lists, bundled (`lib/fabric/regions.ts`) |
| World | country, continent | Natural Earth 1:110m, bundled |

Ground elevation comes from USGS 3DEP (EPQS). Outside the US, only the country and continent are known, and the payload says so.

## What it claims and what it does not

- **Relations are only the ones the unit systems define** (`nests-in`: a tract is in its county by GEOID, a HUC-12 is in its HUC-10 by code, a county is in its metro by the OMB delineation) **or that an agency publishes** (`assigned-to`: an NWS zone to its office, a state to its federal region; `drains-to`: WBD ToHUC). Anything else in the stack only shares the point. A county and a watershed that overlap here are not claimed to relate in any other way.
- **Split Reserve-district states are named as split.** Fourteen states are divided between two Federal Reserve districts by county. The bundled list does not say which side a county is on, so the node names both districts and no edge is drawn.
- **A missing flood zone is not a finding.** FEMA's service is intermittently slow. When it (or any upstream) fails, the stack lists it under `failed` and in `caveats`, and it is not retried for five minutes. A missing construct means the source did not answer, not that the construct does not exist.
- **The join uses generalised outlines and last-known positions.** A feature within roughly 200 m of an edge can land on either side. The panel says so.
- Places and public boundaries only. Nothing in the fabric is about a person, a parcel or an address.

## Code map

| File | Role |
| --- | --- |
| `lib/fabric/types.ts` | `ConstructNode`, `ConstructEdge`, `Fabric` |
| `lib/fabric/catalog.ts` | each kind's label, point of view and stack order; domain colours and questions |
| `lib/fabric/parse.ts` | one pure parser per upstream (TIGERweb, WBD, EPA, NFHL, NWS, EPQS, federal lists, countries) |
| `lib/fabric/graph.ts` | stack ordering, definition-based nesting, CSV rows |
| `lib/fabric/fetch.ts` | parallel upstream calls, per-upstream cache and cool-down |
| `lib/fabric/join.ts` | point-in-outline join used by the HUD |
| `lib/fabric/fieldScale.ts`, `lib/fabric/field.ts` | the scale ladder per point of view, bbox clamping, the field parser |
| `lib/fabric/emergence.ts`, `lib/fabric/emergenceState.ts`, `components/globe/EmergenceBridge.tsx` | vitals from the physical layers, heat, the live restyle loop |
| `lib/layers/field.ts`, `lib/globe/fieldStyles.ts`, `components/hud/FieldControls.tsx` | the floating plate, the columns of light, the controls |
| `lib/fabric/downstream.ts`, `lib/fabric/traceStore.ts`, `components/globe/TraceOverlay.tsx` | the resumable ToHUC walk, the trace state, the drawn path |
| `lib/fabric/condition.ts`, `lib/water/normals.ts`, `lib/fabric/normalsClient.ts` | daily flow percentiles, placing a flow among them, the browser's cache of them |
| `lib/fabric/upstream.ts`, `lib/fabric/upstreamStore.ts`, `components/globe/UpstreamOverlay.tsx` | the reversed ToHUC index, the minimal cover, the catchment state and drawing |
| `lib/live/live.ts`, `lib/live/fetch.ts`, `app/api/live/route.ts` | NWS alerts and USGS earthquakes: parsing, zone outlines, the tour order |
| `lib/layers/alerts.ts`, `lib/globe/alertStyles.ts` | warnings as short-lived hazard constructs |
| `lib/live/teleportStore.ts`, `components/hud/TeleportCaption.tsx` | Teleport: the hops, the landing, the card |
| `scripts/wbd-data.mjs`, `lib/fabric/data/huc12-tohuc.json` | the bundled national drainage table |
| `app/api/fabric/route.ts` | the envelope, CSV, caching |
| `lib/layers/constructs.ts`, `lib/globe/constructStyles.ts` | the spiral strata, tethers and floating outlines |
| `components/hud/ConstructAside.tsx` | the stack, relations, and the two-way join in the info panel |

## Where this goes next

Candidate layers and constructs, roughly in order of value per effort. Every one is keyless and published by an agency, in keeping with the project's ground rules.

1. **Pin a stack.** Click anywhere to pin a fabric at that point, keep several side by side, and compare two places construct by construct (`/compare` already exists for counties).
2. **Construct-scoped reports.** (The field's heat, its streamflow condition and the join are the first steps.) Run the water report, the screener and the series store over a construct's outline rather than a radius: "gauges in HUC-8 12090205", "companies in TX-10", "bank deposits in this school district".
3. **More hydrology.** NHDPlus flowlines, walked downstream from the ToHUC chain to the sea; dams (USACE National Inventory of Dams); principal aquifer polygons (USGS) as a construct under every well.
4. **More hazard.** Wildfire hazard potential (USFS), seismic design category (USGS), storm surge zones (NOAA SLOSH). (Live NWS warnings are in.)
5. **Constructs you can watch.** The watch system (`lib/watch/`) knows counties and gauges. A construct item kind would let a rule say "when the median streamflow in HUC-8 12090205 goes above the 90th percentile", "when a warning covers this district", or "when a gauge upstream of this point rises 20 % in a day".
6. **Presence.** LiveWorld lets the people watching the same camera talk to each other. The constructs equivalent is presence per construct: how many people are looking at this watershed or this warning right now. It needs a shared realtime store, which the app does not run yet.
7. **More service.** Public water systems (EPA SDWIS service areas), electric utility and balancing authority territories (HIFLD / EIA), 911 PSAPs, hospital service areas.
8. **More land.** Protected areas (USGS PAD-US), federal land managers (BLM, USFS, NPS), NLCD land cover under the point, soil map unit (NRCS SSURGO).
9. **The world beyond the US.** Admin-1 and admin-2 units (geoBoundaries), HydroBASINS levels 1–12 and WWF terrestrial ecoregions, so the stack is complete outside the United States as well.
10. **Time.** Every boundary has a vintage: redistricting, annexations, new metro delineations. Keep the vintage on each node and let the mission clock pick it.
11. **A constructs graph view.** Draw the stack as a graph (nodes by point of view, `nests-in` / `drains-to` / `assigned-to` edges) in desk mode, next to the globe.
