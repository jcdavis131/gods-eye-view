# Embedding Atlas data API

Keyless, CORS-open JSON and CSV over the same public sources the globe draws: USGS, NOAA, TWDB and the Drought Monitor for water; BLS QCEW, Zillow, BTS, the World Port Index, the World Bank and FRED for jobs, homes and trade; NIFC, NASA FIRMS, NWS, GDACS and EONET for hazards (`/api/hazards`); FEMA, USFWS, USGS PAD-US and 3DEP for land (`/api/land`); GFZ and NASA DONKI for space weather (`/api/space`). Every number carries provenance. This guide is for people calling it from a notebook, a script or their own page.

Machine-readable description: [`/api/openapi`](https://eye.jcamd.com/api/openapi) (also `public/openapi.json` in the repo).

```bash
curl "https://eye.jcamd.com/api/water?op=report&lon=-98.49&lat=29.42"
curl "https://eye.jcamd.com/api/economy?op=areas&bbox=-98.5,29.8,-97,31&format=csv" -o travis.csv
```

## The envelope

Every JSON response has the same top-level shape:

```jsonc
{
  "source": "BLS QCEW + Zillow ZHVI + Zillow ZORI + Census TIGERweb",   // short human label (older scripts read this)
  "asOf": { "qcew": "2026 Q1", "zhvi": "2026-07-31", "zori": "2026-07-31" }, // route-specific fields sit here...
  "level": "county", "bbox": [-99, 29, -97, 32], "cacheAge": 1830912,        // ...beside the reserved ones below
  "data": { "type": "FeatureCollection", "features": [ ... ] },            // the payload; shape depends on op
  "provenance": [ { ... }, { ... } ],                                       // one record per upstream release used
  "generatedAt": "2026-09-11T14:02:11.412Z",                                // when this response was assembled
  "caveats": [ "..." ]                                                      // only when there is something to say
}
```

Reserved names: `data`, `provenance`, `generatedAt`, `caveats`. Everything else at the top level is route-specific metadata (`source`, `cacheAge`, `bbox`, `asOf`, `globe`, ...). Field names never change or disappear between versions; new ones are added.

Errors are JSON too: `400 { "error": "bbox=w,s,e,n required" }` for a bad parameter (the message says what a valid call looks like), `502 { "error", "upstream", "status" }` when an upstream did not answer. Both carry the CORS headers.

## Provenance

```jsonc
{
  "source": {
    "id": "bls-qcew",                                      // stable id (lib/provenance/sources.ts)
    "name": "Quarterly Census of Employment and Wages",
    "publisher": "U.S. Bureau of Labor Statistics",
    "url": "https://www.bls.gov/cew/",
    "license": "public domain"
  },
  "seriesId": "area 48453, all ownerships, all industries", // upstream series / file / site:parameter when one exists
  "upstreamUrl": "https://data.bls.gov/cew/data/api/2026/1/area/48453.csv",
  "period": "2026-Q1",                                     // what the value describes: ISO date, 2026-07, 2026-Q1, 2024, from/to
  "releasedAt": "2026-08-27",                              // when the upstream published it, when known
  "retrievedAt": "2026-09-11T13:31:40.500Z",               // when this server fetched it (cache age subtracted)
  "kind": "published",                                     // published | estimate | snapshot
  "revision": "quarterly files are revised when the next quarter is published; annual revisions follow",
  "notes": [ "..." ]
}
```

`kind` is the field to read first:

- `published` — relayed as the upstream serves it. Cite the upstream.
- `estimate` — computed here from published values. `method` holds the arithmetic that ran, with the inputs, e.g. `price-to-rent = $412,000 / ($1,850 × 12) = 18.6`. The `source` is the publisher of the main input; other inputs are named in `notes`. Cite it as an estimate by Embedding Atlas from those sources.
- `snapshot` — our own observation of a live feed (aircraft, ship and satellite counts). Not reproducible upstream.

Where a call knows the exact identifiers they are in `seriesId`: a FRED series id (`MORTGAGE30US`), a Zillow file name, a QCEW area code, a USGS `site:parameter` (`USGS-08180800:00060`), a BTS dataset id, a Sentinel-2 scene id. Where it does not (a bbox of many gauges) the record names the collection and parameter codes and the count is in `notes`.

`op=report` (both routes) attaches provenance twice: each section (`home`, `rent`, `jobs`, ... / `drought`, `reservoirs`, `gauges`, ...) has `provenance` next to its prose `basis`, and the report has a de-duplicated `provenance` union plus `citations`, one line per record. The HUD's report panels have "Copy citation" and "Copy provenance JSON" buttons that copy exactly these.

## Citation format

`citation(p)` in `lib/provenance/types.ts` renders one plain-text line per record, Chicago-ish, the same in the API (`citations`), the CSV footer and the HUD:

```
U.S. Bureau of Labor Statistics. Quarterly Census of Employment and Wages. series area 48453, all ownerships, all industries. period 2026-Q1. https://data.bls.gov/cew/data/api/2026/1/area/48453.csv. accessed 2026-09-11.
Zillow Research. Zillow Home Value Index (ZHVI). series County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv. period 2026-07. https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv. accessed 2026-09-11.
Zillow Research. Zillow Home Value Index (ZHVI). https://www.zillow.com/research/data/. accessed 2026-09-11. estimate computed by Embedding Atlas: price-to-rent = $412,000 / ($1,850 × 12) = 18.6.
```

Segments: publisher, source name, `series <id>` if any, `period <p>` if any, `released <date>` if known, the upstream URL (or the source landing page), `accessed <date>`, and for estimates the method. Accessed dates are the retrieval date, which is what a reader needs to reproduce a revisable series.

## CSV

Tabular ops answer `format=csv` (or `Accept: text/csv`):

| Route | Ops with CSV | One row per |
| --- | --- | --- |
| `/api/economy` | `areas`, `sectors`, `ports`, `border`, `countries`, `pulse` (`&series=1` for long format) | area, sector, port, crossing, country, series (or observation) |
| `/api/water` | `gauges`, `wells`, `nwps`, `twdb`, `history`, `matchup` | (site, parameter) reading, well reading, NWPS gauge, reservoir, day, observation |

Rules: RFC 4180 (CRLF, quoted only where needed, doubled quotes), UTF-8, header row first, stable `snake_case` columns listed under `x-csv-columns` in the OpenAPI document. A value the upstream withheld is an empty cell, never `0` or `null`. After the data come `#` comment lines: `generated_at`, one `source:` citation per provenance record, any `caveat:` lines. `Content-Disposition: inline; filename="economy-areas-county-....csv"` names the file.

Other ops (`report`, `context`, `partners`, `drought`) answer `400` to `format=csv` with the list of ops that offer it.

### pandas one-liners

```python
import pandas as pd
BASE = "https://eye.jcamd.com"

# counties in a box, one row each, with QCEW and Zillow joins
areas = pd.read_csv(f"{BASE}/api/economy?op=areas&bbox=-98.5,29.8,-97,31&format=csv", comment="#")

# every US land border crossing, latest month of each measure
border = pd.read_csv(f"{BASE}/api/economy?op=border&format=csv", comment="#")

# national pulse as a long time series (one row per observation)
pulse = pd.read_csv(f"{BASE}/api/economy?op=pulse&format=csv&series=1", comment="#", parse_dates=["date"])
mortgage = pulse[pulse.id == "MORTGAGE30US"].set_index("date")["value"]

# latest gauge readings in a box, then pivot to one row per site
g = pd.read_csv(f"{BASE}/api/water?op=gauges&bbox=-98.6,29.2,-98.2,29.6&format=csv", comment="#", parse_dates=["time"])
wide = g.pivot_table(index=["site", "name"], columns="parameter", values="value")

# a year of daily flow for one site
q = pd.read_csv(f"{BASE}/api/water?op=history&site=USGS-08180800&param=00060&format=csv", comment="#", parse_dates=["date"]).set_index("date")["value"]

# the citations that came with a CSV
import urllib.request
text = urllib.request.urlopen(f"{BASE}/api/water?op=twdb&format=csv").read().decode()
citations = [l[2:] for l in text.splitlines() if l.startswith("# source: ")]
```

JSON works just as well with `requests`; the envelope's `provenance` list is the same records as the CSV footer:

```python
import requests
r = requests.get(f"{BASE}/api/economy", params={"op": "report", "lon": -97.75, "lat": 30.3}).json()
print(r["data"]["home"]["summary"])
print("\n".join(r["data"]["citations"]))
```

## Caching

Responses carry `Cache-Control: public, max-age=0, s-maxage=<ttl>, stale-while-revalidate=<ttl>`: your browser revalidates each time, the CDN edge answers repeats within the TTL and serves stale while it refreshes. The server also holds each upstream table in memory; `cacheAge` (ms) says how old the table behind a response is, and `provenance[].retrievedAt` is already adjusted for it.

TTLs follow upstream cadence:

| Data | Edge TTL | Server table |
| --- | --- | --- |
| USGS latest continuous, NWPS | 5 min | 5 min |
| USGS wells, TWDB | 30 min | 1 h / 30 min |
| USGS history / matchup | 1 h | 1 h |
| Drought Monitor | 1 h | 6 h |
| Economy areas, sectors, ports, border | 1–6 h | 6 h (QCEW, Zillow) / 24 h (BTS ports) |
| Countries, partners | 12–24 h | 24 h |
| Pulse (FRED + BTS) | 30 min | 1 h / 6 h |
| Reports | 5–15 min | built from the tables above |
| Wildfires (WFIGS) | 5 min | 5 min |
| Fire hotspots (FIRMS) | 10 min (2 min while a file is missing) | 30 min per 24 h file; the box selection 10 min |
| Hazard alerts (NWS, GDACS, EONET) | 2 min (1 min while a source is down) | 2 min (NWS), 10 min (GDACS), 30 min (EONET) |
| Flood zones, wetlands, public lands | 1 h (wetlands 10 min while NWI's imagery layer is missing) | 1 day per snapped box |
| Elevation (EPQS) | 1 day (10 min for a "no value" answer) | 1 day per point |
| Space weather, ISS stream | 15 min (2 min while a source is down) | 15 min, 30 min |

Bounding boxes are snapped outward (water: 0.5° grid, 4° max span; economy: 1° grid, 18° max span; fire hotspots: 1° grid, up to the whole globe; flood zones and wetlands: 0.02° grid, 0.08° max span; public lands: 0.25° grid, 2° max span), so two callers a few kilometres apart share one entry. The snapped box comes back in `bbox`.

## Rate limits and courtesy

There is no key and no quota on this API. Behind it, the server rate-gates each upstream (one request per 150–400 ms per upstream, backing off for 30–60 s after a 429) and answers from cache whenever it can, so a burst from you becomes at most one upstream call per table. Please still:

- send a `User-Agent` that identifies your project;
- fetch tables once and keep them (the CSV is a file; save it);
- prefer the coarser ops (`areas&level=state`, `pulse`) for polling, and keep polling of the 5-minute ops to that cadence;
- keep the upstreams' terms: USGS, NOAA, BLS, BTS, Census, USDM and Natural Earth are public domain; Zillow data is free for public use with attribution to Zillow Research; the World Bank is CC BY 4.0; FRED relays series under their original publishers' terms.

If you need more than the edge and the cache can give, run the app yourself (`npm run dev`); every source is keyless.

## Vintages and revisions, per source

A number you fetch today may not be the number the same query returns next month. `provenance[].revision` says so per record; the specifics:

**BLS QCEW** (`bls-qcew`). Each quarter is first published about five months after it ends and is revised when the next quarter is released; a full annual revision follows. County totals can also be suppressed (`suppressed: true`, values null) in one quarter and disclosed in the next. `period` is the quarter (`2026-Q1`); re-fetching the same quarter later can give revised values, and there is no vintage API. Save what you fetched, with the `retrievedAt`.

**Zillow ZHVI / ZORI** (`zillow-zhvi`, `zillow-zori`). Zillow republishes the entire history every month and the model is re-estimated, so earlier months move a little each release (and occasionally a lot when the methodology changes). `period` is the last month column of the file at fetch time. Zillow keeps no public vintage archive; the file name plus `retrievedAt` is the vintage.

**FRED** (`fred`). FRED serves the latest vintage of every series. Series that are revised (retail sales `RSXFS`, trade balance `BOPGSTB`, housing starts `HOUST`, permits `PERMIT`, unemployment `UNRATE` after benchmark revisions) will differ from what was first released. For the as-first-published value use ALFRED (`https://alfred.stlouisfed.org/`), which the provenance `revision` note points to; `MORTGAGE30US` (Freddie Mac PMMS) and `DCOILWTICO` are not revised.

**BTS Border Crossing Entry Data** (`bts-border`). The most recent month is often incomplete when first posted and is filled in the following release; `period` is the latest month present. Year-over-year figures in `yoyPct` compare the latest month with the same month a year earlier as both stand today.

**BTS Port Performance** (`bts-ports`). Annual, `period` is the reporting year; prior years are occasionally restated when a port authority corrects its submission.

**BTS Supply Chain and Freight Indicators** (`bts-supply-chain`). Mixed cadence (weekly, monthly); the underlying series are revised by their original publishers and BTS refreshes the table, so treat them like FRED.

**World Bank WDI / WITS** (`worldbank-wdi`, `worldbank-wits`). Each value carries its own year (`mrnev=1`, most recent non-empty); countries report late and restate, so the latest year differs by country and the value for a given year can change between WDI editions.

**USGS Water Data** (`usgs-water`). Continuous and daily values are *provisional* until approved, and approved values can differ (shifts, corrections, removed readings). `revision` carries the approval flag the response saw (`Provisional`, `Approved`, or `mixed: ...`). A daily mean in `op=history` for last week is provisional; the same day next year may be approved and slightly different.

**NOAA NWPS** (`noaa-nwps`). Observations are live and superseded within the hour; forecasts change every cycle. Treat any value as a snapshot at `retrievedAt`.

**TWDB** (`twdb`). Daily conservation-pool figures; capacity tables are revised after a survey, which changes percent full for the same storage. `period` is the reservoir timestamp.

**US Drought Monitor** (`usdm`). Released Thursdays for the week ending the previous Tuesday and never revised; the feature service we read carries only the class, not the week, so the record says so in `notes` rather than inventing a date.

**NGA World Port Index, Natural Earth** (`nga-wpi`, `natural-earth`). Bundled copies; `retrievedAt` is the day the copy was taken (`wpiPulled`, `nePulled` at the top level of those responses).

**Hazard feeds** (`nifc-wfigs`, `nasa-firms`, `nws-api`, `gdacs`, `nasa-eonet`). Snapshots of live feeds (`kind: "snapshot"`): perimeters are redrawn, alerts updated and cancelled, events closed, and FIRMS's 24 h files are rewritten as new passes arrive, so the same call later answers differently and nothing is kept here. A FIRMS record carries the file's `Last-Modified` as `releasedAt`. Every hazards answer says in `caveats` that it is not a warning service; a source that did not answer is named there and its events are missing, not absent.

**FEMA NFHL** (`fema-nfhl`). The effective regulatory flood map; FEMA revises panels through map revisions and new studies, so a zone can change between fetches. A regulatory map, not a forecast, and a box with no zone is not a finding of no risk.

**USFWS NWI** (`usfws-nwi`). Each polygon is as old as the imagery its mapping project was drawn from; `imageYears` (and each feature's `mapped from`) says which years, and `null` means NWI's source layer did not answer, not that the year is unknown to NWI.

**USGS PAD-US** (`usgs-padus`). Version 4.1 (doi:10.5066/P96WBCHS), relayed as published, owners and easement holders included; a later version replaces it. Public-access codes are PAD-US's, not permission to enter.

**USGS EPQS** (`usgs-epqs`). The 3DEP DEM that covers the point answers; `resolutionM` says which resolution it was, and 3DEP replaces DEMs as new lidar arrives. Outside 3DEP coverage there is no value, never a guessed one.

**GFZ Kp and NASA DONKI** (`gfz-kp`, `nasa-donki`). GFZ marks recent Kp values preliminary (`status: "pre"`) and replaces them with definitive ones later; the provenance `revision` says `preliminary` while any value in the answer is. DONKI calls itself experimental research information and points to NOAA SWPC as the official source.

**Estimates** (`kind: "estimate"`). Deterministic given their inputs; the inputs are the records next to them. Re-running with revised inputs gives a different estimate, and `method` shows exactly which numbers went in.

## Adding an op or a route

`lib/server/respond.ts` has the pieces: `ok(data, { meta, provenance, caveats, ttlS })` for the envelope, `csv(rows, { columns, filename, provenance, caveats, ttlS })` for the CSV branch, `badRequest`, `options` for OPTIONS, `parseFormat(req)`. Build provenance with the helpers in `lib/economy/provenance.ts` / `lib/water/provenance.ts` (or `provenance(source(id), {...})` from `lib/provenance/types.ts`), add any new source to `lib/provenance/sources.ts` first, write the flattener as a pure function with a test, and add the op to the `op` enum in `public/openapi.json` (a test checks that the enum and the route's `case` labels agree).
