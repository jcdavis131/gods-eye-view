// The newsroom's server side: reads the Atlas's own live feeds through the
// readers and caches the layers already use, plus the headline wire and the
// published model rundown, and hands the answers to the pure builders in
// lib/news/facts.ts and lib/news/wire.ts. Route handlers only.
//
//   NWS Severe/Extreme alerts and USGS M4.5+ quakes   lib/live/fetch.ts liveFeed (the /api/live cache entry)
//   NIFC WFIGS current fires                           lib/hazards/sources.ts wfigs (the /api/hazards cache entry)
//   Launch Library 2 upcoming launches                 the same URL and cache key /api/launches uses (15 requests an hour)
//   GFZ Kp, NASA DONKI flares                          lib/space/sources.ts spaceWeather (the /api/space cache entry)
//   FRED series                                        lib/economy/sources.ts fred (cached an hour)
//   Release calendar                                   lib/releases/calendar.ts (bundled rules, no network)
//   Open-Meteo                                         current conditions at the lead quake and the lead fire
//   Outlet RSS feeds                                   lib/news/wire.ts WIRE_OUTLETS
//   NEWS_RUNDOWN_URL                                   the rundown the local model publishes (optional)
//
// Every feed is waited on for at most FEED_DEADLINE_MS; one that is late or
// fails is named in `failed` and its facts are missing, not absent.

import { cached, type Cached } from "@/lib/server/cache";
import type { SourceId } from "@/lib/provenance/sources";
import { polite, upstream, upstreamJson } from "@/lib/server/upstream";
import { ALERTS_URL, QUAKES_URL, liveFeed } from "@/lib/live/fetch";
import { WFIGS_INCIDENTS_URL, WFIGS_PERIMETERS_URL, wfigs } from "@/lib/hazards/sources";
import { buildWildfire } from "@/lib/hazards/features";
import { spaceWeather } from "@/lib/space/sources";
import { fred } from "@/lib/economy/sources";
import { upcomingReleases } from "@/lib/releases/calendar";
import {
  alertFacts,
  flareFacts,
  indicatorFacts,
  kpFacts,
  launchFacts,
  quakeFacts,
  releaseFacts,
  weatherFacts,
  wildfireFacts,
  wireFacts,
  type Fact,
  type Ll2Launch,
  type OpenMeteoPoint,
} from "./facts";
import { freshWire, parseFeed, WIRE_OUTLETS, type WireItem } from "./wire";

const MIN = 60_000;
/** Longest the facts op waits on any one feed. */
export const FEED_DEADLINE_MS = 25_000;
/** The facts set is rebuilt at most this often. */
export const FACTS_TTL_MS = 2 * MIN;
export const WIRE_TTL_MS = 10 * MIN;
export const RUNDOWN_TTL_MS = 2 * MIN;

/**
 * Exactly the URL and cache key app/api/launches/route.ts uses, so the news
 * desk and the launches layer share one Launch Library request (a test
 * checks the route still says the same).
 */
export const LL2_UPCOMING_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=30&mode=detailed&hide_recent_previous=false";
export const LL2_UPCOMING_KEY = "ll2:upcoming";

/** FRED series the money desk reads (all in lib/economy/sources.ts FRED_SERIES). */
export const NEWS_FRED_SERIES = ["MORTGAGE30US", "UNRATE", "DCOILWTICO"] as const;

export const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

const fetchedAt = (ageMs: number, now = Date.now()) => new Date(now - ageMs).toISOString();

class LateError extends Error {}

/** Resolve within `ms` or reject: a slow feed never holds the whole desk. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new LateError(`${what} did not answer within ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface NewsFacts {
  facts: Fact[];
  /** Feeds that failed or were late, by source id, with the reason. */
  failed: Array<{ source: string; error: string }>;
  /** Source ids that answered. */
  answered: string[];
  /** When this set was assembled. */
  assembledAt: string;
}

/** Open-Meteo `current` at up to four points, one answer per point in order. */
async function openMeteoAt(points: Array<{ lat: number; lon: number }>): Promise<{ url: string; value: OpenMeteoPoint[]; age: number }> {
  const lats = points.map((p) => p.lat.toFixed(2)).join(",");
  const lons = points.map((p) => p.lon.toFixed(2)).join(",");
  const url = `${OPEN_METEO_BASE}?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto&forecast_days=1`;
  const r = await cached(`news:openmeteo:${lats}|${lons}`, 10 * MIN, () => upstreamJson<OpenMeteoPoint | OpenMeteoPoint[]>("open-meteo", url, { timeoutMs: 12_000 }));
  return { url, value: Array.isArray(r.value) ? r.value : [r.value], age: r.age };
}

async function assembleFacts(): Promise<NewsFacts> {
  const now = Date.now();
  const failed: NewsFacts["failed"] = [];
  const answered: string[] = [];
  const facts: Fact[] = [];
  const settle = async <T>(sourceId: string, p: Promise<T>): Promise<T | null> => {
    try {
      const v = await within(p, FEED_DEADLINE_MS, sourceId);
      answered.push(sourceId);
      return v;
    } catch (e) {
      failed.push({ source: sourceId, error: errText(e) });
      return null;
    }
  };

  const [live, fires, ll2, space, pulse, wire] = await Promise.all([
    settle("nws-api+usgs-earthquakes", liveFeed({ deadlineMs: FEED_DEADLINE_MS })),
    settle("nifc-wfigs", wfigs()),
    settle("launch-library-2", cached(LL2_UPCOMING_KEY, 15 * MIN, () => upstreamJson("launchlibrary", LL2_UPCOMING_URL, { timeoutMs: 40_000 }))),
    settle("gfz-kp+nasa-donki", spaceWeather()),
    settle("fred", Promise.all(NEWS_FRED_SERIES.map((id) => fred(id).catch(() => null))).then((xs) => ({ value: xs, age: 0 }))),
    settle("wire", wireFeed()),
  ]);

  if (live) {
    // liveFeed answers even when one of its two feeds failed; split them back out.
    answered.splice(answered.indexOf("nws-api+usgs-earthquakes"), 1);
    const ra = fetchedAt(live.age, now);
    for (const f of live.value.failed) failed.push({ source: f.source, error: f.error });
    if (!live.value.failed.some((f) => f.source === "nws-api")) {
      answered.push("nws-api");
      facts.push(...alertFacts(live.value.alerts, ra, ALERTS_URL));
    }
    if (!live.value.failed.some((f) => f.source === "usgs-earthquakes")) {
      answered.push("usgs-earthquakes");
      facts.push(...quakeFacts(live.value.quakes, ra, QUAKES_URL));
    }
  } else {
    const f = failed.find((x) => x.source === "nws-api+usgs-earthquakes")!;
    failed.splice(failed.indexOf(f), 1, { source: "nws-api", error: f.error }, { source: "usgs-earthquakes", error: f.error });
  }
  if (fires) {
    const built = buildWildfire(fires.value.perims, fires.value.incidents);
    facts.push(...wildfireFacts(built.features, fetchedAt(fires.age, now), `${WFIGS_PERIMETERS_URL} + ${WFIGS_INCIDENTS_URL}`));
  }
  if (ll2) facts.push(...launchFacts(ll2.value as { results?: Ll2Launch[] }, fetchedAt(ll2.age, now), now));
  if (space) {
    const ra = fetchedAt(space.age, now);
    answered.splice(answered.indexOf("gfz-kp+nasa-donki"), 1);
    const w = space.value;
    if (w.failed.includes("GFZ Kp")) failed.push({ source: "gfz-kp", error: "GFZ Kp did not answer" });
    else {
      answered.push("gfz-kp");
      facts.push(...kpFacts(w, ra, "https://kp.gfz.de/app/json/"));
    }
    if (w.flares == null) failed.push({ source: "nasa-donki", error: "DONKI flares did not answer" });
    else {
      answered.push("nasa-donki");
      facts.push(...flareFacts(w, ra, `DONKI FLR ${w.flaresFrom}..`));
    }
  } else {
    const f = failed.find((x) => x.source === "gfz-kp+nasa-donki")!;
    failed.splice(failed.indexOf(f), 1, { source: "gfz-kp", error: f.error }, { source: "nasa-donki", error: f.error });
  }
  if (pulse) {
    const got = pulse.value.filter((x) => x != null);
    if (!got.length) {
      answered.splice(answered.indexOf("fred"), 1);
      failed.push({ source: "fred", error: "no FRED series answered" });
    } else facts.push(...indicatorFacts(pulse.value, new Date(now).toISOString()));
  }
  // The release calendar is bundled: it always answers.
  facts.push(...releaseFacts(upcomingReleases(now, now + 7 * 86_400_000), new Date(now).toISOString()));
  answered.push("release-calendar");
  if (wire) {
    answered.splice(answered.indexOf("wire"), 1);
    for (const o of wire.value.outlets) {
      if (o.ok) answered.push(o.sourceId);
      else failed.push({ source: o.sourceId, error: o.error ?? "did not answer" });
    }
    facts.push(...wireFacts(wire.value.items, fetchedAt(wire.age, now)));
  } else {
    const f = failed.find((x) => x.source === "wire")!;
    failed.splice(failed.indexOf(f), 1, ...WIRE_OUTLETS.map((o) => ({ source: o.sourceId, error: f.error })));
  }

  // Weather at the lead quake and the lead fire: what it is like where the story is.
  const lead = [facts.find((f) => f.kind === "quake"), facts.find((f) => f.kind === "wildfire")].filter((f): f is Fact => !!f?.place);
  if (lead.length) {
    try {
      const wx = await within(openMeteoAt(lead.map((f) => f.place!)), 15_000, "open-meteo");
      answered.push("open-meteo");
      facts.push(...weatherFacts(wx.value, lead, fetchedAt(wx.age, now), wx.url));
    } catch (e) {
      failed.push({ source: "open-meteo", error: errText(e) });
    }
  }
  return { facts, failed, answered, assembledAt: new Date(now).toISOString() };
}

/** The current facts, rebuilt at most every FACTS_TTL_MS. */
export function newsFacts(): Promise<Cached<NewsFacts>> {
  return cached("news:facts", FACTS_TTL_MS, assembleFacts, { deadlineMs: 55_000 });
}

// ---------------------------------------------------------------- the wire

export interface WireFeed {
  items: WireItem[];
  outlets: Array<{ id: string; outlet: string; sourceId: SourceId; feedUrl: string; ok: boolean; items: number; error?: string }>;
}

async function fetchWire(): Promise<WireFeed> {
  const now = Date.now();
  const results = await Promise.all(
    WIRE_OUTLETS.map(async (o) => {
      try {
        const res = await polite(`wire:${o.id}`, 1000, 5 * MIN, () => upstream(o.sourceId, o.feedUrl, { timeoutMs: 12_000, headers: { accept: "application/rss+xml, application/xml, text/xml" } }));
        const xml = (await res.text()).slice(0, 2_000_000);
        const items = parseFeed(xml, o);
        return { o, items, ok: true as const };
      } catch (e) {
        return { o, items: [] as WireItem[], ok: false as const, error: errText(e) };
      }
    }),
  );
  if (results.every((r) => !r.ok)) throw new Error("no outlet feed answered");
  const items = freshWire(results.flatMap((r) => r.items), now);
  return {
    items,
    outlets: results.map((r) => ({
      id: r.o.id,
      outlet: r.o.outlet,
      sourceId: r.o.sourceId,
      feedUrl: r.o.feedUrl,
      ok: r.ok,
      items: items.filter((i) => i.outletId === r.o.id).length,
      error: "error" in r ? r.error : undefined,
    })),
  };
}

/** The headline wire, every outlet, refetched at most every WIRE_TTL_MS. */
export function wireFeed(): Promise<Cached<WireFeed>> {
  return cached("news:wire", WIRE_TTL_MS, fetchWire, { deadlineMs: 20_000, coolMs: 2 * MIN });
}

// ---------------------------------------------------------------- the published model rundown

export type PublishedRundown =
  | { status: "unset" }
  | { status: "invalid-url"; error: string }
  | { status: "error"; error: string; url: string }
  | { status: "ok"; raw: unknown; url: string; fetchedAt: string };

/** Largest rundown file read, bytes. */
const MAX_RUNDOWN_BYTES = 512 * 1024;

/**
 * The rundown the local model publishes, from NEWS_RUNDOWN_URL (an https URL,
 * e.g. a public gist's raw link). Unset, unreachable, too large or not JSON:
 * the desk runs on the template writer and says why.
 */
export async function publishedRundown(env: Record<string, string | undefined> = process.env): Promise<PublishedRundown> {
  const url = env.NEWS_RUNDOWN_URL?.trim();
  if (!url) return { status: "unset" };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: "invalid-url", error: "NEWS_RUNDOWN_URL is not a URL" };
  }
  if (u.protocol !== "https:") return { status: "invalid-url", error: "NEWS_RUNDOWN_URL must be https" };
  try {
    const r = await cached(`news:rundown:${url}`, RUNDOWN_TTL_MS, async () => {
      const res = await upstream("news-rundown", url, { timeoutMs: 10_000 });
      const text = await res.text();
      if (text.length > MAX_RUNDOWN_BYTES) throw new Error(`rundown is ${text.length} bytes, over the ${MAX_RUNDOWN_BYTES} limit`);
      return JSON.parse(text) as unknown;
    }, { deadlineMs: 12_000, coolMs: MIN });
    return { status: "ok", raw: r.value, url, fetchedAt: fetchedAt(r.age) };
  } catch (e) {
    return { status: "error", error: errText(e), url };
  }
}
