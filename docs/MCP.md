# MCP server

Embedding Atlas exposes its keyless JSON API as a [Model Context Protocol](https://modelcontextprotocol.io) server so an agent (Claude Desktop, Claude Code, any MCP client) can pull the same water, economy, series, indicator and filings data a notebook can, with the same provenance fields. The MCP layer holds no data logic: every tool builds one `/api/...` URL and relays the route's JSON verbatim. When a route is missing on the server you point at (an older deployment), the tool answers the route's 404 plus `note: "this route is not deployed on this server"` instead of failing.

## Transports

| Transport | Where | How |
| --- | --- | --- |
| Streamable HTTP, stateless | `POST https://<host>/api/mcp` | JSON-RPC 2.0 in, JSON out (`enableJsonResponse`); no session id, no SSE stream, no auth. `GET /api/mcp` returns a JSON description with the tool manifest; `OPTIONS` answers CORS. Bodies over 1 MB are refused (413), non-JSON content types with 415. |
| stdio | `node scripts/mcp-stdio.mjs` | For local clients. Calls the HTTP API at `GEV_BASE_URL` (default `http://localhost:3000`). Compiles `lib/mcp` with tsc into `.tmp-mcp/` on first run (see the script header for why not `--experimental-strip-types`). |

Client setup and curl examples: [examples/README.md](../examples/README.md).

## Tools

Arguments are validated with zod before any request is made; a bad argument comes back as an `isError` result naming the field, not as a fetch. Every result is the route's JSON as `structuredContent` and as text. Polygon collections (`areas`, `countries`) have their geometry set to null unless `geometry: true`, and any result over 400,000 characters has its feature list halved until it fits, with a `note` saying how many items were dropped.

<!-- tools:start -->
| Tool | Arguments | Returns |
| --- | --- | --- |
| `water_report` | lon: number, lat: number | Server-built water report for a lon/lat: current US Drought Monitor class under the point, nearby USGS gauges (discharge ft3/s, stage ft, temperature degC, dissolved oxygen mg/L, conductance uS/cm, pH, turbidity FNU), NWS flood categories, Texas reservoirs (% full, acre-ft), groundwater wells (depth to water ft), and a water-stress estimate with its formula and caveats. No satellite turbidity term (that runs in a browser). Returns { source, county, globe (permalink), data: report }. |
| `market_report` | lon: number, lat: number | Server-built economy report for a lon/lat inside the US: county home value (Zillow ZHVI, USD, with yoy % and 5-year %), metro and national comparison, rent (ZORI, USD/month) and price-to-rent, an affordability estimate (mortgage payment vs county weekly wage, formula stated), jobs and average weekly wage (BLS QCEW, newest quarter), sector concentration with location quotients, ports and crossings within ~250 km, national pulse series (FRED + BTS) and a momentum index labelled as an estimate. Every route answers { ...meta, data } where meta carries source, asOf/period and cacheAge; routes that opt in add provenance[] (see resource gev://docs/API.md). |
| `areas` | bbox?: number[4], level?: county \| state, geometry?: boolean | GeoJSON FeatureCollection of US counties inside a bbox (or every state with level=state) joined with BLS QCEW employment, establishments and average weekly wage (USD, newest quarter, yoy %), Zillow ZHVI home value (USD, yoy %, 5y %) and ZORI rent (USD/month). Withheld QCEW cells stay null. Meta: asOf per source, polygons count, detail level. Geometry is nulled unless geometry=true. Boxes are clamped to 18 degrees and snapped to a 1 degree grid. |
| `sectors` | fips: string | BLS QCEW private-sector employment by 2-digit NAICS sector for one county (SSCCC), state (SS000) or the nation (US000): employment (persons), establishments, average weekly wage (USD) and location quotient vs the US (>1 means over-represented). Newest published quarter; period is in the payload. |
| `ports` | bbox: number[4], min?: large \| medium \| small \| all | GeoJSON points for NGA World Port Index harbours inside a bbox (min = large \| medium \| small \| all, default medium) with BTS Port Performance statistics where published: annual TEU, tonnage (short tons), vessel calls, dwell times (days). Meta says which BTS year and how many ports carry stats. |
| `border_crossings` | (none) | GeoJSON points for every US land border port of entry with 25 months of BTS Border Crossing Entry Data: monthly counts of trucks, containers (loaded/empty), buses, personal vehicles, pedestrians. Meta: asOf month, number of ports. |
| `countries` | geometry?: boolean | GeoJSON polygons (Natural Earth) for every country joined with World Bank WDI: GDP (current US$), exports and imports (% of GDP and current US$), trade/GDP, container port traffic (TEU), latest year per indicator. Geometry nulled unless geometry=true. Meta lists indicators that failed upstream. |
| `trade_partners` | iso3: string | World Bank WITS TradeStats: a country's top export and import partners for the latest available year, values in US$ thousands (meta.units). Partner ISO3 codes and names. |
| `pulse` | (none) | Latest observation and change for the national series the market report uses: FRED (30-year mortgage rate %, unemployment %, CPI, housing starts, industrial production, ...) and BTS Supply Chain Indicators (freight TSI, container imports TEU, ...). Each item: id, title, unit, latest value, previous, period, source. Meta lists ids that failed. |
| `gauges` | bbox: number[4], param?: string | USGS latest continuous readings for every monitoring location inside a bbox, one feature per site with its readings: discharge (ft3/s), gage height (ft), water temperature (degC), dissolved oxygen (mg/L), specific conductance (uS/cm), pH, turbidity (FNU), reservoir elevation (ft) and storage (acre-ft), each with its timestamp and approval status. Optional param code restricts to one parameter. Boxes are clamped to 4 degrees and snapped to 0.5 degrees. |
| `gauge_history` | site: string, param: string | USGS daily values for one site and parameter code over the last 365 days: [{ time (ISO date), value, unit, approval }]. Units follow the parameter (00060 ft3/s, 00065 ft, 63680 FNU, ...). |
| `series_list` | prefix?: string | Metadata for every series in this server's series store, optionally filtered by id prefix (e.g. 'indicator:', 'snapshot:port-vessels:', 'zhvi:county:'): id, title, unit, frequency, geo, tags, provenance. Use before series_get. Answers 404 with a note on servers without the series route. |
| `series_get` | id: string, from?: string, to?: string, rollup?: daily-mean \| daily-max \| daily-last | Points for one series id: { t: epoch ms UTC, v: number \| null } with unit, frequency and provenance. Optional from/to bound the window and rollup (daily \| weekly \| monthly) asks the route to aggregate. Null v means the upstream withheld or the feed was down; never interpolated. |
| `screen` | kind: county \| state \| port \| crossing \| country, query?: string, fields?: boolean | Rank and filter one entity set by its published metrics without loading polygons. query syntax: '<where> [SORT field [ASC\|DESC]] [LIMIT n] [OFFSET n]' with comparisons (home.yoyPct > 5, jobs.yoy.emp <= 0, state == TX), BETWEEN, IN (...), CONTAINS, AND/OR and parentheses; e.g. 'home.yoyPct > 5 AND jobs.yoy.emp < 0 SORT momentum DESC LIMIT 50'. Returns data.rows [{ id, name, geo [lon,lat], values {field: value} }], count, total, stats per field, fields[] with label/unit/estimate method, provenance[]. Pass fields: true to get the field registry for a kind instead of running a query. Values the upstream withheld are null and never match. |
| `indicators` | ids?: number[4], category?: freight \| housing \| water \| energy \| labour \| trade \| macro | Latest value, yoy change and threshold status (ok \| watch \| alert) for the named indicators (freight, housing, water, energy, labour, trade, macro), each with unit, period, whyItMatters, the threshold rules with citations, and provenance. Filter by comma-separated ids or one category. |
| `indicator_history` | id: string, from?: string, to?: string, limit?: integer | The series behind one indicator id (live upstream window merged with the stored indicator:<id> points): data is a Series { id, title, unit, frequency, points [{ t: epoch ms, v }], provenance } with a citation-ready upstream URL. Thresholds live on the indicator's meta (use indicators(ids: [id])). Optional from/to bound the window; limit caps points (newest kept, max 5000). |
| `release_calendar` | from?: string, to?: string | Scheduled publication dates for the upstream releases this app depends on (BLS QCEW, Zillow, BTS, FRED series, USGS ...) between from and to (default: next 45 days): { id, name, publisher, releaseAt ISO, period, url }. |
| `movers` | table: zillow \| qcew \| border \| ports, metric?: string, n?: integer, min?: number | Top n rows by change between the two latest vintages of one upstream table: zillow (metric zhviCounty \| zoriCounty \| zhviState ...), qcew (emp \| wage ...), border (Trucks \| Containers ...), ports (container ...). Each row: entity, previous and latest values with unit and period, change and % change. min drops rows whose latest value is below it (e.g. counties with fewer than 10,000 jobs). Default n = 20, max 200; the route names the valid metrics for a table when metric is omitted or wrong. |
| `county_history` | fips: string, years?: integer, lag?: integer | Backfilled research series for one county as data.series[]: QCEW employment and average weekly wage (USD, quarterly), Zillow ZHVI (USD) and ZORI (USD/month, monthly), momentum:county:<fips> (estimate, index -1..1, formula in provenance.method) and the affordability index, each a Series with points [{ t: epoch ms, v }] and provenance. years bounds the window (1..26, default 10); lag shifts the momentum inputs by months (0..12) for lead/lag studies. |
| `company` | ticker?: string, cik?: string | One public company by ticker or CIK from SEC EDGAR: name, CIK, SIC and description, state of incorporation, business address at the county/state level, latest 10-K / 10-Q facts (revenue, net income, employees, USD as reported) and filing URLs. Public filings only; no people, no private companies. |
| `companies_near` | bbox?: number[4], fips?: string | SEC-registered public companies whose business address falls inside a bbox or a county FIPS: ticker, name, CIK, SIC, exchange, and the county they sit in. GeoJSON points. Pass exactly one of bbox or fips. |
| `banks` | fips: string | FDIC Summary of Deposits for one county: bank offices with institution name, deposits (USD thousands, as of the SOD date), and the county totals. Institutions only; no account holders. |
| `federal_spending` | fips: string | USAspending.gov awards by place of performance for one county: totals by fiscal year and agency (USD obligated), top award types, with the query URL for citation. Aggregates only. |
| `place_fabric` | lon: number, lat: number, geometry?: boolean | The place fabric for a lon/lat: the human and scientific constructs the point is inside, smallest first, each with kind, point of view (civic, representation, service, statistical, hydrologic, ecological, hazard, federal, world), name, code and published area (km2). US points get state, county, city, census tract, ZIP code area, school district, congressional and state legislative districts, metro area, urban area, tribal land, census division and region (Census TIGERweb); HUC-2 to HUC-12 watersheds with the downstream HUC (USGS WBD); level III/IV ecoregions (EPA); flood zone, NFIP community and FIRM panel (FEMA NFHL); NWS forecast office, zone and time zone; elevation (USGS 3DEP); EPA and FEMA regions and Federal Reserve district. Elsewhere, the country. edges[] carry only relations the unit systems define (nests-in, drains-to, assigned-to) with their basis. Upstreams that failed are listed in failed[]. Use it to connect reports: the county code feeds sectors / county_history / banks / federal_spending, the point feeds water_report and market_report. Every route answers { ...meta, data } where meta carries source, asOf/period and cacheAge; routes that opt in add provenance[] (see resource gev://docs/API.md). |
| `openapi` | (none) | The OpenAPI 3 document for this server's /api routes (paths, parameters, response envelopes). Use it to call routes this tool list does not cover. |
<!-- tools:end -->

The table is generated from `toolManifest()` in `lib/mcp/server.ts`; `lib/mcp/server.test.ts` fails when it drifts. Regenerate with `node scripts/mcp-stdio.mjs --doc-table` and paste between the markers.

## Resources

- `gev://openapi.json`: `public/openapi.json`, the OpenAPI 3 document for the HTTP routes.
- `gev://docs/{name}`: every `docs/*.md` in the repository (this file included). Only bare `*.md` names resolve; nothing outside `docs/` is readable.

## Prompts

| Prompt | Arguments | Chains |
| --- | --- | --- |
| `county_due_diligence` | `fips` | sectors, county_history, companies_near, banks, federal_spending, indicators, pulse, release_calendar |
| `port_congestion_check` | `bbox`, `port?` | ports, series_list, series_get, indicators, movers, border_crossings |
| `water_stress_brief` | `lon`, `lat` | water_report, gauge_history, indicators, market_report |

Each prompt ends with the same instruction: cite every number with source, period and upstream URL from its provenance; say "estimate" wherever the payload does; no investment, lending or relocation advice.

## Security notes

- Read-only. Every tool is a GET against this app's own routes; annotations say `readOnlyHint: true`, `destructiveHint: false`.
- Keyless. No credentials are read, stored or forwarded. Optional operator keys (`x-gev-*` headers in the browser) never pass through MCP.
- Rate limits are inherited from the API: the routes cache in memory, gate concurrency per upstream and back off on 429. The MCP layer adds no fetches of its own beyond the one route call per tool call.
- CORS is open (`*`) like the rest of `/api`; the endpoint validates `Content-Type` and body size, and the Origin header is not restricted because nothing here is session- or cookie-bound.
- Stateless per request: a new `McpServer` and transport are created for each POST and closed after the response, so one client cannot affect another.
- No people. The tools return aggregates (counties, ports, countries) and public SEC/FDIC/USAspending records about institutions; nothing here identifies a private individual, and the prompts repeat the project's ethics guardrails.

## Environment

| Variable | Used by | Meaning |
| --- | --- | --- |
| `GEV_BASE_URL` | stdio server, HTTP route (optional), `examples/gev.py` | Base URL of the HTTP API the tools call. The route defaults to its own origin; the stdio server and the Python client default to `http://localhost:3000`. |

## Adding a tool

Append a `defineTool({...})` entry to `TOOLS` in `lib/mcp/tools.ts` with a zod input schema and a handler that calls `relay(ctx, "/api/...")`. Add its URL case to `lib/mcp/tools.test.ts`, its name to the snapshot in `lib/mcp/server.test.ts`, and regenerate this table. The HTTP route, the stdio server and the GET manifest pick it up with no further wiring.
