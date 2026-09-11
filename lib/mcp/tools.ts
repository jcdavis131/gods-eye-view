// MCP tool definitions for God's Eye View. Each tool is a thin, typed front
// on one of this app's own JSON routes: the handler builds the exact
// /api/... URL and relays whatever the route answered, so data logic lives in
// one place (the routes) and the MCP layer cannot drift from the HTTP API.
//
// Kept pure: no Next, no filesystem, and fetch is injected through
// ToolCtx.fetchJson so tests can assert the URL each tool asks for. Relative
// imports only (no "@/") so scripts/mcp-stdio.mjs can compile this directory
// on its own with tsc and run it outside Next.

import { z } from "zod";

/** What a route answered. `body` is the parsed JSON (or a string when the route did not send JSON). */
export interface JsonReply {
  status: number;
  body: unknown;
  /** The absolute URL that was fetched, for citations. */
  url: string;
}

export type FetchJson = (pathWithQuery: string) => Promise<JsonReply>;

export interface ToolCtx {
  fetchJson: FetchJson;
}

export type JsonObject = Record<string, unknown>;

/** What a tool handler returns: the route's JSON (verbatim, plus `note` when we had to add one) and the HTTP status it came with. */
export interface ToolReply {
  status: number;
  payload: JsonObject;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Validate `input` against `inputSchema` (throws ZodError) and call the route. */
  run(input: unknown, ctx: ToolCtx): Promise<ToolReply>;
}

/** Added to the payload when a route answers 404: the server this MCP points at is older than the tool list. */
export const NOT_DEPLOYED_NOTE = "this route is not deployed on this server";

/** Character budget for one tool result before feature lists are halved (LLM context is the scarce resource). */
export const MAX_RESULT_CHARS = 400_000;

/** Default base URL for the stdio server and the Python client; the HTTP route uses its own origin. */
export const DEFAULT_BASE_URL = "http://localhost:3000";

type Param = string | number | boolean | undefined | null;

/**
 * Build "?a=1&b=x" from an ordered record. Undefined / null / empty values are
 * skipped. Commas and colons stay readable (bbox=w,s,e,n, site ids) because
 * the routes split on them and the URL is also the citation a reader sees.
 */
export function qs(params: Record<string, Param>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    const enc = encodeURIComponent(String(v)).replace(/%2C/gi, ",").replace(/%3A/gi, ":");
    parts.push(`${k}=${enc}`);
  }
  return parts.length ? "?" + parts.join("&") : "";
}

/** Coerce whatever the route sent into an object so we can attach a note without losing the payload. */
export function asObject(body: unknown): JsonObject {
  if (body && typeof body === "object" && !Array.isArray(body)) return body as JsonObject;
  return { data: body };
}

interface FeatureLike {
  geometry?: unknown;
  [k: string]: unknown;
}

function featuresOf(payload: JsonObject): FeatureLike[] | null {
  const data = payload.data;
  if (data && typeof data === "object" && Array.isArray((data as { features?: unknown }).features)) {
    return (data as { features: FeatureLike[] }).features;
  }
  return null;
}

function withFeatures(payload: JsonObject, features: FeatureLike[]): JsonObject {
  return { ...payload, data: { ...(payload.data as JsonObject), features } };
}

function addNote(payload: JsonObject, note: string): JsonObject {
  const prev = typeof payload.note === "string" && payload.note ? payload.note + " " : "";
  return { ...payload, note: prev + note };
}

/**
 * Replace polygon geometry with null on every feature of a FeatureCollection.
 * County and country outlines are megabytes; a model reading numbers does not
 * need them and can ask for `geometry: true` when it does.
 */
export function stripGeometry(payload: JsonObject): JsonObject {
  const feats = featuresOf(payload);
  if (!feats || !feats.some((f) => f.geometry)) return payload;
  return addNote(
    withFeatures(
      payload,
      feats.map((f) => ({ ...f, geometry: null })),
    ),
    "geometry omitted (pass geometry: true to include polygons, or call the HTTP route directly).",
  );
}

/**
 * Keep a result under MAX_RESULT_CHARS by halving the feature list (or a
 * top-level data array) until it fits, and say how many were dropped. Never
 * edits values; only shortens lists.
 */
export function boundPayload(payload: JsonObject, maxChars = MAX_RESULT_CHARS): JsonObject {
  let out = payload;
  let size = JSON.stringify(out).length;
  if (size <= maxChars) return out;
  const feats = featuresOf(out);
  const total = feats ? feats.length : Array.isArray(out.data) ? (out.data as unknown[]).length : 0;
  if (!total) return out;
  let keep = total;
  while (size > maxChars && keep > 1) {
    keep = Math.ceil(keep / 2);
    out = feats ? withFeatures(payload, feats.slice(0, keep)) : { ...payload, data: (payload.data as unknown[]).slice(0, keep) };
    size = JSON.stringify(out).length;
  }
  return addNote(out, `truncated to the first ${keep} of ${total} items to stay under ${maxChars} characters; narrow the box or call the HTTP route for the full set.`);
}

interface RelayOptions {
  /** Drop polygon geometry unless the caller asked for it. */
  dropGeometry?: boolean;
}

/** Fetch a route and normalise its answer into a ToolReply. */
export async function relay(ctx: ToolCtx, path: string, opts: RelayOptions = {}): Promise<ToolReply> {
  const r = await ctx.fetchJson(path);
  let payload = asObject(r.body);
  if (r.status === 404) payload = addNote(payload, NOT_DEPLOYED_NOTE);
  else if (r.status >= 400) payload = addNote(payload, `route answered HTTP ${r.status}`);
  if (opts.dropGeometry) payload = stripGeometry(payload);
  payload = boundPayload(payload);
  return { status: r.status, payload };
}

/**
 * A fetchJson over the real network for a base URL. Timeouts are generous
 * because the report ops fan out to several upstreams on a cold cache.
 */
export function httpFetchJson(baseUrl = DEFAULT_BASE_URL, fetchImpl: typeof fetch = fetch, timeoutMs = 55_000): FetchJson {
  const base = baseUrl.replace(/\/+$/, "");
  return async (pathWithQuery) => {
    const url = base + (pathWithQuery.startsWith("/") ? pathWithQuery : "/" + pathWithQuery);
    const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "non-JSON reply", text: text.slice(0, 2000) };
    }
    return { status: res.status, body, url };
  };
}

// ---- shared field schemas -------------------------------------------------

const lon = z.number().min(-180).max(180).describe("Longitude in decimal degrees (WGS84, east positive).");
const lat = z.number().min(-90).max(90).describe("Latitude in decimal degrees (WGS84, north positive).");
const bbox = z
  .array(z.number())
  .length(4)
  .refine(([w, s, e, n]) => w < e && s < n && Math.abs(w) <= 180 && Math.abs(e) <= 180 && Math.abs(s) <= 90 && Math.abs(n) <= 90, "bbox must be [west, south, east, north] with west<east and south<north")
  .describe("[west, south, east, north] in decimal degrees. The route snaps it outward to a grid so nearby callers share a cache entry.");
const countyFips = z.string().regex(/^\d{5}$/, "5-digit county FIPS, e.g. 48453").describe("5-digit county FIPS (state 2 + county 3), e.g. 48453 for Travis County, TX.");
const areaFips = z
  .string()
  .regex(/^(\d{5}|US000)$/, "SSCCC for a county, SS000 for a state, US000 for the nation")
  .describe("5-digit county FIPS (48453), a state as SS000 (48000) or US000 for the nation.");
const iso3 = z.string().regex(/^[A-Za-z]{3}$/, "ISO 3166-1 alpha-3").describe("ISO 3166-1 alpha-3 country code, e.g. USA, MEX, CHN.");
const usgsSite = z.string().regex(/^USGS-\w+$/, "USGS-<site number>").describe("USGS monitoring location id with prefix, e.g. USGS-07032000 (Mississippi River at Memphis).");
const usgsParam = z
  .string()
  .regex(/^\d{5}$/, "5-digit USGS parameter code")
  .describe("USGS parameter code: 00060 discharge (ft3/s), 00065 gage height (ft), 00010 water temperature (degC), 00300 dissolved oxygen (mg/L), 00095 specific conductance (uS/cm), 00400 pH, 63680 turbidity (FNU), 00062/00054 reservoir elevation (ft) / storage (acre-ft).");
const seriesId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9:_.\-]+$/, "series ids use letters, digits, ':', '_', '.', '-'")
  .describe("Series id, namespaced with ':' e.g. fred:MORTGAGE30US, zhvi:county:48453, indicator:mississippi-memphis-stage, snapshot:port-vessels:USLAX.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/, "YYYY-MM-DD or ISO 8601 Z").describe("YYYY-MM-DD (or full ISO 8601 with Z).");
const ticker = z.string().regex(/^[A-Za-z.\-]{1,10}$/, "ticker symbol").describe("Exchange ticker, e.g. AAPL, BRK.B.");
const cik = z.string().regex(/^\d{1,10}$/, "SEC CIK digits").describe("SEC Central Index Key, digits only (leading zeros optional), e.g. 320193.");
const geometry = z.boolean().optional().describe("Include polygon geometry (large). Default false: geometry is set to null on each feature.");

function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<S>;
  handler: (input: z.infer<z.ZodObject<S>>, ctx: ToolCtx) => Promise<ToolReply>;
}): ToolDef {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema as unknown as z.ZodObject<z.ZodRawShape>,
    // async so a ZodError (or a handler's own check) rejects instead of throwing before a promise exists.
    run: async (input, ctx) => def.handler(def.inputSchema.parse(input ?? {}), ctx),
  };
}

const bboxStr = (b: number[]) => b.join(",");

const ENVELOPE = "Every route answers { ...meta, data } where meta carries source, asOf/period and cacheAge; routes that opt in add provenance[] (see resource gev://docs/API.md).";

// ---- the tools ------------------------------------------------------------

/** Every MCP tool, in the order they are listed to clients. Append here to add one; the manifest, docs table and tests follow. */
export const TOOLS: ToolDef[] = [
  defineTool({
    name: "water_report",
    title: "Community water report for a point",
    description:
      "Server-built water report for a lon/lat: current US Drought Monitor class under the point, nearby USGS gauges (discharge ft3/s, stage ft, temperature degC, dissolved oxygen mg/L, conductance uS/cm, pH, turbidity FNU), NWS flood categories, Texas reservoirs (% full, acre-ft), groundwater wells (depth to water ft), and a water-stress estimate with its formula and caveats. No satellite turbidity term (that runs in a browser). Returns { source, county, globe (permalink), data: report }.",
    inputSchema: z.object({ lon, lat }),
    handler: (i, ctx) => relay(ctx, "/api/water" + qs({ op: "report", lon: i.lon, lat: i.lat })),
  }),
  defineTool({
    name: "market_report",
    title: "Market report for a point",
    description:
      "Server-built economy report for a lon/lat inside the US: county home value (Zillow ZHVI, USD, with yoy % and 5-year %), metro and national comparison, rent (ZORI, USD/month) and price-to-rent, an affordability estimate (mortgage payment vs county weekly wage, formula stated), jobs and average weekly wage (BLS QCEW, newest quarter), sector concentration with location quotients, ports and crossings within ~250 km, national pulse series (FRED + BTS) and a momentum index labelled as an estimate. " +
      ENVELOPE,
    inputSchema: z.object({ lon, lat }),
    handler: (i, ctx) => relay(ctx, "/api/economy" + qs({ op: "report", lon: i.lon, lat: i.lat })),
  }),
  defineTool({
    name: "areas",
    title: "Counties in a box, or every state",
    description:
      "GeoJSON FeatureCollection of US counties inside a bbox (or every state with level=state) joined with BLS QCEW employment, establishments and average weekly wage (USD, newest quarter, yoy %), Zillow ZHVI home value (USD, yoy %, 5y %) and ZORI rent (USD/month). Withheld QCEW cells stay null. Meta: asOf per source, polygons count, detail level. Geometry is nulled unless geometry=true. Boxes are clamped to 18 degrees and snapped to a 1 degree grid.",
    inputSchema: z.object({
      bbox: bbox.optional().describe("Required for level=county. [west, south, east, north] in degrees."),
      level: z.enum(["county", "state"]).optional().describe("county (default, needs bbox) or state (all 50 + DC + PR, no bbox)."),
      geometry,
    }),
    handler: (i, ctx) => {
      const level = i.level ?? "county";
      if (level === "county" && !i.bbox) throw new Error("bbox is required for level=county (pass level: 'state' for all states)");
      const path = "/api/economy" + (level === "state" ? qs({ op: "areas", level: "state" }) : qs({ op: "areas", bbox: bboxStr(i.bbox!) }));
      return relay(ctx, path, { dropGeometry: !i.geometry });
    },
  }),
  defineTool({
    name: "sectors",
    title: "Private-sector NAICS mix for a county or state",
    description:
      "BLS QCEW private-sector employment by 2-digit NAICS sector for one county (SSCCC), state (SS000) or the nation (US000): employment (persons), establishments, average weekly wage (USD) and location quotient vs the US (>1 means over-represented). Newest published quarter; period is in the payload.",
    inputSchema: z.object({ fips: areaFips }),
    handler: (i, ctx) => relay(ctx, "/api/economy" + qs({ op: "sectors", fips: i.fips })),
  }),
  defineTool({
    name: "ports",
    title: "Harbours in a box with BTS volumes",
    description:
      "GeoJSON points for NGA World Port Index harbours inside a bbox (min = large | medium | small | all, default medium) with BTS Port Performance statistics where published: annual TEU, tonnage (short tons), vessel calls, dwell times (days). Meta says which BTS year and how many ports carry stats.",
    inputSchema: z.object({
      bbox,
      min: z.enum(["large", "medium", "small", "all"]).optional().describe("Smallest harbour size to include; default medium. Ports with BTS stats are always included."),
    }),
    handler: (i, ctx) => relay(ctx, "/api/economy" + qs({ op: "ports", bbox: bboxStr(i.bbox), min: i.min ?? "medium" })),
  }),
  defineTool({
    name: "border_crossings",
    title: "US land ports of entry",
    description:
      "GeoJSON points for every US land border port of entry with 25 months of BTS Border Crossing Entry Data: monthly counts of trucks, containers (loaded/empty), buses, personal vehicles, pedestrians. Meta: asOf month, number of ports.",
    inputSchema: z.object({}),
    handler: (_i, ctx) => relay(ctx, "/api/economy" + qs({ op: "border" })),
  }),
  defineTool({
    name: "countries",
    title: "Countries with World Bank indicators",
    description:
      "GeoJSON polygons (Natural Earth) for every country joined with World Bank WDI: GDP (current US$), exports and imports (% of GDP and current US$), trade/GDP, container port traffic (TEU), latest year per indicator. Geometry nulled unless geometry=true. Meta lists indicators that failed upstream.",
    inputSchema: z.object({ geometry }),
    handler: (i, ctx) => relay(ctx, "/api/economy" + qs({ op: "countries" }), { dropGeometry: !i.geometry }),
  }),
  defineTool({
    name: "trade_partners",
    title: "Top trading partners for a country",
    description: "World Bank WITS TradeStats: a country's top export and import partners for the latest available year, values in US$ thousands (meta.units). Partner ISO3 codes and names.",
    inputSchema: z.object({ iso3 }),
    handler: (i, ctx) => relay(ctx, "/api/economy" + qs({ op: "partners", iso3: i.iso3.toUpperCase() })),
  }),
  defineTool({
    name: "pulse",
    title: "National pulse series",
    description:
      "Latest observation and change for the national series the market report uses: FRED (30-year mortgage rate %, unemployment %, CPI, housing starts, industrial production, ...) and BTS Supply Chain Indicators (freight TSI, container imports TEU, ...). Each item: id, title, unit, latest value, previous, period, source. Meta lists ids that failed.",
    inputSchema: z.object({}),
    handler: (_i, ctx) => relay(ctx, "/api/economy" + qs({ op: "pulse" })),
  }),
  defineTool({
    name: "gauges",
    title: "Latest USGS gauge readings in a box",
    description:
      "USGS latest continuous readings for every monitoring location inside a bbox, one feature per site with its readings: discharge (ft3/s), gage height (ft), water temperature (degC), dissolved oxygen (mg/L), specific conductance (uS/cm), pH, turbidity (FNU), reservoir elevation (ft) and storage (acre-ft), each with its timestamp and approval status. Optional param code restricts to one parameter. Boxes are clamped to 4 degrees and snapped to 0.5 degrees.",
    inputSchema: z.object({ bbox, param: usgsParam.optional() }),
    handler: (i, ctx) => relay(ctx, "/api/water" + qs({ op: "gauges", bbox: bboxStr(i.bbox), param: i.param })),
  }),
  defineTool({
    name: "gauge_history",
    title: "365 days of daily means for one USGS site",
    description: "USGS daily values for one site and parameter code over the last 365 days: [{ time (ISO date), value, unit, approval }]. Units follow the parameter (00060 ft3/s, 00065 ft, 63680 FNU, ...).",
    inputSchema: z.object({ site: usgsSite, param: usgsParam }),
    handler: (i, ctx) => relay(ctx, "/api/water" + qs({ op: "history", site: i.site, param: i.param })),
  }),
  defineTool({
    name: "series_list",
    title: "List stored time series",
    description:
      "Metadata for every series in this server's series store, optionally filtered by id prefix (e.g. 'indicator:', 'snapshot:port-vessels:', 'zhvi:county:'): id, title, unit, frequency, geo, tags, provenance. Use before series_get. Answers 404 with a note on servers without the series route.",
    inputSchema: z.object({ prefix: z.string().max(200).optional().describe("Id prefix filter, e.g. 'indicator:'.") }),
    handler: (i, ctx) => relay(ctx, "/api/series" + qs({ op: "list", prefix: i.prefix })),
  }),
  defineTool({
    name: "series_get",
    title: "Read one time series",
    description:
      "Points for one series id: { t: epoch ms UTC, v: number | null } with unit, frequency and provenance. Optional from/to bound the window and rollup (daily | weekly | monthly) asks the route to aggregate. Null v means the upstream withheld or the feed was down; never interpolated.",
    inputSchema: z.object({
      id: seriesId,
      from: isoDate.optional(),
      to: isoDate.optional(),
      rollup: z.enum(["daily-mean", "daily-max", "daily-last"]).optional().describe("Reduce to one point per UTC day: mean, max or last sample. The store keeps sample cadence."),
    }),
    handler: (i, ctx) => relay(ctx, "/api/series" + qs({ op: "get", id: i.id, from: i.from, to: i.to, rollup: i.rollup })),
  }),
  defineTool({
    name: "screen",
    title: "Screen counties, states, ports, crossings or countries",
    description:
      "Rank and filter one entity set by its published metrics without loading polygons. query syntax: '<where> [SORT field [ASC|DESC]] [LIMIT n] [OFFSET n]' with comparisons (home.yoyPct > 5, jobs.yoy.emp <= 0, state == TX), BETWEEN, IN (...), CONTAINS, AND/OR and parentheses; e.g. 'home.yoyPct > 5 AND jobs.yoy.emp < 0 SORT momentum DESC LIMIT 50'. Returns data.rows [{ id, name, geo [lon,lat], values {field: value} }], count, total, stats per field, fields[] with label/unit/estimate method, provenance[]. Pass fields: true to get the field registry for a kind instead of running a query. Values the upstream withheld are null and never match.",
    inputSchema: z.object({
      kind: z.enum(["county", "state", "port", "crossing", "country"]).describe("Entity set to screen."),
      query: z.string().max(2000).optional().describe("Filter/sort expression in the screener syntax; required unless fields is true."),
      fields: z.boolean().optional().describe("true: return the field registry (key, label, unit, source, method) for kind and ignore query."),
    }),
    handler: (i, ctx) => {
      if (i.fields) return relay(ctx, "/api/screen" + qs({ kind: i.kind, fields: 1 }));
      if (!i.query) throw new Error("query is required (or pass fields: true for the field list)");
      return relay(ctx, "/api/screen" + qs({ kind: i.kind, q: i.query }));
    },
  }),
  defineTool({
    name: "indicators",
    title: "Latest named indicators with status",
    description:
      "Latest value, yoy change and threshold status (ok | watch | alert) for the named indicators (freight, housing, water, energy, labour, trade, macro), each with unit, period, whyItMatters, the threshold rules with citations, and provenance. Filter by comma-separated ids or one category.",
    inputSchema: z.object({
      ids: z.array(z.string().regex(/^[a-z0-9\-]+$/)).max(50).optional().describe("Indicator ids (kebab-case), e.g. ['mississippi-memphis-stage']."),
      category: z.enum(["freight", "housing", "water", "energy", "labour", "trade", "macro"]).optional(),
    }),
    handler: (i, ctx) => relay(ctx, "/api/indicators" + qs({ op: "latest", ids: i.ids?.join(","), category: i.category })),
  }),
  defineTool({
    name: "indicator_history",
    title: "History of one indicator",
    description:
      "The series behind one indicator id (live upstream window merged with the stored indicator:<id> points): data is a Series { id, title, unit, frequency, points [{ t: epoch ms, v }], provenance } with a citation-ready upstream URL. Thresholds live on the indicator's meta (use indicators(ids: [id])). Optional from/to bound the window; limit caps points (newest kept, max 5000).",
    inputSchema: z.object({
      id: z.string().regex(/^[a-z0-9\-]+$/, "kebab-case id").describe("Indicator id, e.g. mississippi-memphis-stage."),
      from: isoDate.optional(),
      to: isoDate.optional(),
      limit: z.number().int().min(1).max(5000).optional(),
    }),
    handler: (i, ctx) => relay(ctx, "/api/indicators" + qs({ op: "history", id: i.id, from: i.from, to: i.to, limit: i.limit })),
  }),
  defineTool({
    name: "release_calendar",
    title: "Upcoming data releases",
    description: "Scheduled publication dates for the upstream releases this app depends on (BLS QCEW, Zillow, BTS, FRED series, USGS ...) between from and to (default: next 45 days): { id, name, publisher, releaseAt ISO, period, url }.",
    inputSchema: z.object({ from: isoDate.optional(), to: isoDate.optional() }),
    handler: (i, ctx) => relay(ctx, "/api/releases" + qs({ op: "calendar", from: i.from, to: i.to })),
  }),
  defineTool({
    name: "movers",
    title: "Biggest movers since the last release",
    description:
      "Top n rows by change between the two latest vintages of one upstream table: zillow (metric zhviCounty | zoriCounty | zhviState ...), qcew (emp | wage ...), border (Trucks | Containers ...), ports (container ...). Each row: entity, previous and latest values with unit and period, change and % change. min drops rows whose latest value is below it (e.g. counties with fewer than 10,000 jobs). Default n = 20, max 200; the route names the valid metrics for a table when metric is omitted or wrong.",
    inputSchema: z.object({
      table: z.enum(["zillow", "qcew", "border", "ports"]).describe("Upstream table to rank."),
      metric: z.string().max(40).regex(/^[A-Za-z0-9_.\-]+$/, "metric name").optional().describe("Metric within the table; the route picks its default when omitted."),
      n: z.number().int().min(1).max(200).optional().describe("How many rows; default 20."),
      min: z.number().min(0).optional().describe("Minimum latest value to include a row."),
    }),
    handler: (i, ctx) => relay(ctx, "/api/releases" + qs({ op: "movers", table: i.table, metric: i.metric, n: i.n, min: i.min })),
  }),
  defineTool({
    name: "county_history",
    title: "Multi-year history for a county",
    description:
      "Backfilled research series for one county as data.series[]: QCEW employment and average weekly wage (USD, quarterly), Zillow ZHVI (USD) and ZORI (USD/month, monthly), momentum:county:<fips> (estimate, index -1..1, formula in provenance.method) and the affordability index, each a Series with points [{ t: epoch ms, v }] and provenance. years bounds the window (1..26, default 10); lag shifts the momentum inputs by months (0..12) for lead/lag studies.",
    inputSchema: z.object({
      fips: countyFips,
      years: z.number().int().min(1).max(26).optional().describe("Years of history to return; default 10."),
      lag: z.number().int().min(0).max(12).optional().describe("Months of lag applied to the momentum inputs; default 0."),
    }),
    handler: (i, ctx) => relay(ctx, "/api/economy/history" + qs({ op: "county", fips: i.fips, years: i.years, lag: i.lag })),
  }),
  defineTool({
    name: "company",
    title: "Public company from SEC filings",
    description:
      "One public company by ticker or CIK from SEC EDGAR: name, CIK, SIC and description, state of incorporation, business address at the county/state level, latest 10-K / 10-Q facts (revenue, net income, employees, USD as reported) and filing URLs. Public filings only; no people, no private companies.",
    inputSchema: z
      .object({ ticker: ticker.optional(), cik: cik.optional() })
      .refine((v) => !!v.ticker !== !!v.cik, "pass exactly one of ticker or cik"),
    handler: (i, ctx) => relay(ctx, "/api/companies" + qs({ op: "company", ticker: i.ticker?.toUpperCase(), cik: i.cik })),
  }),
  defineTool({
    name: "companies_near",
    title: "Public companies headquartered in a box or county",
    description: "SEC-registered public companies whose business address falls inside a bbox or a county FIPS: ticker, name, CIK, SIC, exchange, and the county they sit in. GeoJSON points. Pass exactly one of bbox or fips.",
    inputSchema: z.object({ bbox: bbox.optional(), fips: countyFips.optional() }).refine((v) => !!v.bbox !== !!v.fips, "pass exactly one of bbox or fips"),
    // Two ops upstream: near (bbox) and county (fips).
    handler: (i, ctx) => relay(ctx, "/api/companies" + (i.bbox ? qs({ op: "near", bbox: bboxStr(i.bbox) }) : qs({ op: "county", fips: i.fips }))),
  }),
  defineTool({
    name: "banks",
    title: "FDIC-insured bank offices in a county",
    description: "FDIC Summary of Deposits for one county: bank offices with institution name, deposits (USD thousands, as of the SOD date), and the county totals. Institutions only; no account holders.",
    inputSchema: z.object({ fips: countyFips }),
    handler: (i, ctx) => relay(ctx, "/api/finance" + qs({ op: "banks", fips: i.fips })),
  }),
  defineTool({
    name: "federal_spending",
    title: "Federal awards to a county",
    description: "USAspending.gov awards by place of performance for one county: totals by fiscal year and agency (USD obligated), top award types, with the query URL for citation. Aggregates only.",
    inputSchema: z.object({ fips: countyFips }),
    handler: (i, ctx) => relay(ctx, "/api/finance" + qs({ op: "spending", fips: i.fips })),
  }),
  defineTool({
    name: "openapi",
    title: "OpenAPI description of the HTTP API",
    description: "The OpenAPI 3 document for this server's /api routes (paths, parameters, response envelopes). Use it to call routes this tool list does not cover.",
    inputSchema: z.object({}),
    handler: (_i, ctx) => relay(ctx, "/api/openapi"),
  }),
];

/** Look a tool up by name. */
export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
