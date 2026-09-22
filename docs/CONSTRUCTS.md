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

## The API

```bash
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27"              # attributes
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27&geometry=1"   # plus generalised outlines
curl "https://eye.jcamd.com/api/fabric?op=stack&lon=-97.74&lat=30.27&format=csv"   # one row per construct
```

The MCP tool `place_fabric` wraps the same route. The county code, the point and the metro code it returns feed `sectors`, `county_history`, `banks`, `federal_spending`, `water_report` and `market_report`, so one call links an agent to every other report.

| Point of view | Constructs | Source |
| --- | --- | --- |
| Civic | state, county, incorporated place, tribal land | Census TIGERweb `tigerWMS_Current` |
| Representation | congressional district, state senate and house districts | Census TIGERweb |
| Service | school districts, NWS forecast office and zone, time zone | TIGERweb, api.weather.gov |
| Statistical | tract, ZIP code area, CDP, metro/micro area, CSA, urban area, census division and region | TIGERweb |
| Hydrologic | HUC-2 to HUC-12, with the downstream HUC-12 | USGS Watershed Boundary Dataset |
| Ecological | level III and IV ecoregions (level I and II as facts) | EPA |
| Hazard | effective flood zone, NFIP community, FIRM panel | FEMA National Flood Hazard Layer |
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
| `app/api/fabric/route.ts` | the envelope, CSV, caching |
| `lib/layers/constructs.ts`, `lib/globe/constructStyles.ts` | the spiral strata, tethers and floating outlines |
| `components/hud/ConstructAside.tsx` | the stack, relations, and the two-way join in the info panel |

## Where this goes next

Candidate layers and constructs, roughly in order of value per effort. Every one is keyless and published by an agency, in keeping with the project's ground rules.

1. **Pin a stack.** Click anywhere to pin a fabric at that point, keep several side by side, and compare two places construct by construct (`/compare` already exists for counties).
2. **Construct-scoped reports.** Run the water report, the screener and the series store over a construct's outline rather than a radius: "gauges in HUC-8 12090205", "companies in TX-10", "bank deposits in this school district".
3. **More hydrology.** NHDPlus flowlines, walked downstream from the ToHUC chain to the sea; dams (USACE National Inventory of Dams); principal aquifer polygons (USGS) as a construct under every well.
4. **More hazard.** Wildfire hazard potential (USFS), seismic design category (USGS), storm surge zones (NOAA SLOSH), and the NWS alerts active in the zone (`api.weather.gov/alerts/active?zone=`).
5. **More service.** Public water systems (EPA SDWIS service areas), electric utility and balancing authority territories (HIFLD / EIA), 911 PSAPs, hospital service areas.
6. **More land.** Protected areas (USGS PAD-US), federal land managers (BLM, USFS, NPS), NLCD land cover under the point, soil map unit (NRCS SSURGO).
7. **The world beyond the US.** Admin-1 and admin-2 units (geoBoundaries), HydroBASINS levels 1–12 and WWF terrestrial ecoregions, so the stack is complete outside the United States as well.
8. **Time.** Every boundary has a vintage: redistricting, annexations, new metro delineations. Keep the vintage on each node and let the mission clock pick it.
9. **A constructs graph view.** Draw the stack as a graph (nodes by point of view, `nests-in` / `drains-to` / `assigned-to` edges) in desk mode, next to the globe.
