// The newsroom's facts: what the anchors are allowed to say, one object per
// thing a public feed published.
//
// Every line an anchor reads (lib/news/template.ts, or the local model's
// rundown checked in lib/news/rundown.ts) names the fact ids it states, and a
// fact is built here from one upstream record with nothing added: the words
// are the publisher's words (`headline_fields`), the numbers are the
// publisher's numbers (`numbers`), and `provenance` says which feed and when.
// A field the upstream did not send is left out, never filled.
//
// Ids are stable across fetches because they come from the upstream's own ids
// (the USGS event id, the NWS alert id, the IRWIN id, the Launch Library id,
// the FRED series and date, the article link). The rundown written from an
// older fetch is checked against the current facts by id, so an id that moved
// with position or fetch time would reject every rundown.
//
// Pure: no clock, no network, no randomness. The caller passes `retrievedAt`
// and `now`; lib/news/sources.ts does the fetching.

import { provenance, type Provenance } from "@/lib/provenance/types";
import { source, type SourceId } from "@/lib/provenance/sources";
import { alertRank, type AlertItem, type QuakeItem } from "@/lib/live/live";
import { ringCentroid, geojsonRings } from "@/lib/fabric/geo";
import type { FireExtra } from "@/lib/hazards/features";
import type { LayerFeature } from "@/lib/layers/types";
import { gScale, type SpaceWeather } from "@/lib/space/weather";
import type { ReleaseOccurrence } from "@/lib/releases/calendar";
import { WIRE_OUTLETS, type WireItem } from "./wire";

export type FactKind = "quake" | "alert" | "alert-count" | "wildfire" | "launch" | "kp" | "flare" | "indicator" | "release" | "weather" | "wire";

export interface FactPlace {
  /** The place as the publisher names it ("63 km SSE of Sand Point, Alaska"), or as its own fields compose it ("Malheur County, OR"). */
  name: string;
  lat: number;
  lon: number;
}

export interface Fact {
  /** Stable across fetches: built from the upstream's own id. */
  id: string;
  kind: FactKind;
  /** Words as the publisher wrote them. Only fields the upstream sent. */
  headline_fields: Record<string, string>;
  /** Numbers as the publisher published them (a count of published items is the only thing computed here, and says so in provenance). */
  numbers: Record<string, number>;
  /** Where it is, or null for a fact with no place on the map (a national indicator, the Sun, a headline). */
  place: FactPlace | null;
  /** ISO time the thing happened, starts or was published; null when the upstream gives none. */
  time: string | null;
  /** The publisher's page for this one item, when it has one. */
  link: string | null;
  provenance: Provenance;
}

/** Words-only field map: drops undefined, null and blank values so an absent field stays absent. */
function fields(o: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
  return out;
}

/** Number map: drops anything that is not a finite number (Number("") and Number(null) never get this far). */
function numbers(o: Record<string, number | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

function iso(ms: number | null | undefined): string | null {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function isoText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function prov(id: SourceId, fieldsIn: Omit<Provenance, "source" | "retrievedAt"> & { retrievedAt: string }): Provenance {
  return provenance(source(id), fieldsIn);
}

// ---------------------------------------------------------------- earthquakes (USGS, via lib/live)

/** USGS M4.5+ events of the past day, strongest first. */
export function quakeFacts(quakes: QuakeItem[], retrievedAt: string, upstreamUrl: string, max = 8): Fact[] {
  return [...quakes]
    .sort((a, b) => b.mag - a.mag || b.time - a.time)
    .slice(0, max)
    .map((q) => ({
      id: `quake:${q.id}`,
      kind: "quake" as const,
      // The tsunami flag is left out on purpose: USGS sets it for large events in oceanic regions, and it is not a tsunami warning.
      headline_fields: fields({ place: q.place, pagerAlert: q.alert ?? undefined }),
      numbers: numbers({ magnitude: q.mag, depthKm: q.depthKm }),
      place: { name: q.place, lat: q.lat, lon: q.lon },
      time: iso(q.time),
      link: q.url,
      provenance: prov("usgs-earthquakes", { kind: "published", seriesId: q.id, upstreamUrl, retrievedAt }),
    }));
}

// ---------------------------------------------------------------- NWS Severe / Extreme alerts (via lib/live)

/** The first `n` areas of an NWS areaDesc ("A; B; C; D" -> "A; B; C"), as NWS wrote them. */
export function firstAreas(areaDesc: string, n = 3): string {
  return areaDesc
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, n)
    .join("; ");
}

/**
 * The alerts the live feed outlined, strongest first (NWS's own severity,
 * urgency and certainty: lib/live/live.ts alertRank), plus one count fact.
 * An alert with no outline has no place to stand on and is counted, not
 * placed.
 */
export function alertFacts(alerts: AlertItem[], retrievedAt: string, upstreamUrl: string, max = 8): Fact[] {
  const out: Fact[] = [];
  const families = new Map<string, number>();
  for (const a of alerts) families.set(a.event, (families.get(a.event) ?? 0) + 1);
  if (alerts.length) {
    const top = [...families.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    out.push({
      // One count per answer, under one id: a rundown that quotes an older count fails the number check in lib/news/rundown.ts.
      id: "alerts:count",
      kind: "alert-count",
      headline_fields: fields({ commonestEvent: top[0][0], severities: "Severe or Extreme" }),
      numbers: numbers({ inForce: alerts.length, commonestEventCount: top[0][1] }),
      place: null,
      time: retrievedAt,
      link: null,
      provenance: prov("nws-api", {
        kind: "snapshot",
        upstreamUrl,
        retrievedAt,
        method: "count of the actual, not-cancelled alerts NWS rates Severe or Extreme in this answer",
      }),
    });
  }
  const placed = alerts
    .map((a) => ({ a, c: a.rings ? ringCentroid(a.rings) : null }))
    .filter((x): x is { a: AlertItem; c: [number, number] } => x.c != null)
    .sort((x, y) => alertRank(y.a) - alertRank(x.a) || (x.a.onset ?? "").localeCompare(y.a.onset ?? "") || x.a.id.localeCompare(y.a.id))
    // NWS can carry two messages with the same event, areas, sender and end (an update beside its original): read one.
    .filter((x, i, all) => all.findIndex((y) => alertKey(y.a) === alertKey(x.a)) === i)
    .slice(0, max);
  for (const { a, c } of placed) {
    const area = firstAreas(a.areaDesc);
    out.push({
      id: `alert:${a.id}`,
      kind: "alert",
      headline_fields: fields({
        event: a.event,
        areas: area,
        moreAreas: a.areaDesc.split(";").filter((s) => s.trim()).length > 3 ? "yes" : undefined,
        sender: a.sender,
        severity: a.severity,
        urgency: a.urgency,
        certainty: a.certainty,
        onset: isoText(a.onset) ?? undefined,
        expires: isoText(a.ends ?? a.expires) ?? undefined,
      }),
      numbers: {},
      place: { name: area || a.event, lat: round(c[1], 3), lon: round(c[0], 3) },
      time: isoText(a.onset),
      link: a.url,
      provenance: prov("nws-api", { kind: "published", seriesId: a.id, upstreamUrl, retrievedAt, notes: a.outline === "zones" ? ["outline built from the zones the alert names"] : undefined }),
    });
  }
  return out;
}

function alertKey(a: AlertItem): string {
  return [a.event, a.areaDesc, a.sender, a.ends ?? a.expires ?? ""].join("|");
}

function round(v: number, d: number): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

// ---------------------------------------------------------------- wildfires (NIFC WFIGS, via lib/hazards buildWildfire)

/** Two-letter state from WFIGS's "US-OR". */
function stateCode(s: string | number | boolean | null | undefined): string | undefined {
  return typeof s === "string" ? s.replace(/^US-/, "") : undefined;
}

/**
 * The largest wildfires (IRWIN type WF; prescribed burns are not news here)
 * from the features lib/hazards/features.ts buildWildfire made, still-burning
 * fires first, then by size.
 */
export function wildfireFacts(features: LayerFeature[], retrievedAt: string, upstreamUrl: string, max = 6): Fact[] {
  const rows = features
    .map((f) => ({ f, x: f.properties.extra as FireExtra | undefined }))
    .filter((r): r is { f: LayerFeature; x: FireExtra } => !!r.x && r.x.type === "WF" && r.x.acres != null);
  rows.sort((a, b) => Number((a.x.contained ?? 0) >= 100) - Number((b.x.contained ?? 0) >= 100) || (b.x.acres ?? 0) - (a.x.acres ?? 0) || a.f.properties.id.localeCompare(b.f.properties.id));
  const out: Fact[] = [];
  for (const { f, x } of rows.slice(0, max)) {
    const p = f.properties;
    const d = p.details ?? {};
    const g = f.geometry;
    let at: [number, number] | null = p.anchor ?? null;
    if (!at && g.type === "Point") at = [g.coordinates[0], g.coordinates[1]];
    if (!at && (g.type === "Polygon" || g.type === "MultiPolygon")) at = ringCentroid(geojsonRings(g));
    if (!at) continue;
    const state = stateCode(d.state);
    const county = typeof d.county === "string" ? d.county : undefined;
    const placeName = county && state ? `${county} County, ${state}` : (state ?? p.name);
    out.push({
      id: `fire:${p.id}`,
      kind: "wildfire",
      headline_fields: fields({ name: p.name, state, county, cause: typeof d.cause === "string" ? d.cause : undefined, sizeBasis: x.hasPerimeter ? "perimeter" : "reported" }),
      numbers: numbers({ acres: Math.round(x.acres!), containedPct: x.contained != null ? Math.round(x.contained) : undefined, personnel: typeof d.personnel === "number" ? d.personnel : undefined }),
      place: { name: placeName, lat: round(at[1], 3), lon: round(at[0], 3) },
      time: iso(x.perimeterAt ?? x.updatedAt ?? x.discoveredAt),
      link: null,
      provenance: prov("nifc-wfigs", { kind: "snapshot", seriesId: String(d["fire id"] ?? p.id), upstreamUrl, retrievedAt, notes: ["NIFC: not a legal document, no warranty"] }),
    });
  }
  return out;
}

// ---------------------------------------------------------------- launches (Launch Library 2)

export interface Ll2Launch {
  id: string;
  name: string;
  url?: string;
  status?: { name?: string; abbrev?: string } | null;
  net?: string;
  net_precision?: { name?: string; abbrev?: string } | null;
  window_start?: string;
  launch_service_provider?: { name?: string } | null;
  rocket?: { configuration?: { name?: string; full_name?: string } } | null;
  mission?: { name?: string; type?: string; orbit?: { name?: string; abbrev?: string } | null } | null;
  pad?: { name?: string; latitude?: number | string; longitude?: number | string; location?: { name?: string } | null } | null;
  webcast_live?: boolean;
}

/** Launch Library's coordinates come as strings or numbers; anything else is no place. */
function coord(v: number | string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Launches whose NET (no earlier than) time falls in [now - 6 h, now + 48 h],
 * soonest first. NET is Launch Library's own word; its precision is kept so a
 * launch only known to the day is never read out to the minute.
 */
export function launchFacts(list: { results?: Ll2Launch[] } | null | undefined, retrievedAt: string, now: number, max = 5): Fact[] {
  const out: Fact[] = [];
  const rows = (list?.results ?? [])
    .map((l) => ({ l, t: Date.parse(l.net ?? "") }))
    .filter((r) => Number.isFinite(r.t) && r.t >= now - 6 * 3600_000 && r.t <= now + 48 * 3600_000)
    .sort((a, b) => a.t - b.t || a.l.id.localeCompare(b.l.id));
  for (const { l, t } of rows) {
    const lat = coord(l.pad?.latitude);
    const lon = coord(l.pad?.longitude);
    out.push({
      id: `launch:${l.id}`,
      kind: "launch",
      headline_fields: fields({
        name: l.name,
        provider: l.launch_service_provider?.name,
        rocket: l.rocket?.configuration?.full_name ?? l.rocket?.configuration?.name,
        mission: l.mission?.name,
        missionType: l.mission?.type,
        orbit: l.mission?.orbit?.name,
        pad: l.pad?.name,
        location: l.pad?.location?.name,
        status: l.status?.name,
        netPrecision: l.net_precision?.name,
        webcastLive: l.webcast_live ? "yes" : undefined,
      }),
      numbers: {},
      place: lat != null && lon != null ? { name: l.pad?.location?.name ?? l.pad?.name ?? l.name, lat, lon } : null,
      time: new Date(t).toISOString(),
      link: l.url ?? null,
      provenance: prov("launch-library-2", { kind: "published", seriesId: l.id, upstreamUrl: l.url, retrievedAt }),
    });
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- space weather (GFZ Kp, NASA DONKI)

/** GFZ's latest Kp, and the highest Kp of the last 24 hours of values with the NOAA G-scale it maps to. */
export function kpFacts(sw: Pick<SpaceWeather, "kp"> | null, retrievedAt: string, upstreamUrl: string): Fact[] {
  const kp = sw?.kp ?? [];
  if (!kp.length) return [];
  const last = kp[kp.length - 1];
  const lastT = Date.parse(last.time);
  const day = kp.filter((k) => Number.isFinite(lastT) && Date.parse(k.time) > lastT - 24 * 3600_000);
  const max = day.reduce((m, k) => (k.kp > m.kp ? k : m), day[0] ?? last);
  const out: Fact[] = [
    {
      id: `kp:${last.time}`,
      kind: "kp",
      headline_fields: fields({ status: last.status === "pre" ? "preliminary" : last.status === "def" ? "definitive" : last.status, gScale: gScale(last.kp) ?? undefined, window: "3-hour" }),
      numbers: numbers({ kp: round(last.kp, 2) }),
      place: null,
      time: isoText(last.time),
      link: null,
      provenance: prov("gfz-kp", { kind: "published", seriesId: "Kp", period: last.time, upstreamUrl, retrievedAt, revision: last.status === "pre" ? "preliminary" : "definitive" }),
    },
  ];
  if (max && max.time !== last.time) {
    out.push({
      id: `kp-max24:${max.time}`,
      kind: "kp",
      headline_fields: fields({ status: max.status === "pre" ? "preliminary" : max.status === "def" ? "definitive" : max.status, gScale: gScale(max.kp) ?? undefined, window: "highest 3-hour value in the last 24 hours" }),
      numbers: numbers({ kp: round(max.kp, 2) }),
      place: null,
      time: isoText(max.time),
      link: null,
      provenance: prov("gfz-kp", { kind: "published", seriesId: "Kp", period: max.time, upstreamUrl, retrievedAt, revision: max.status === "pre" ? "preliminary" : "definitive" }),
    });
  }
  return out;
}

/** Flare class letter rank: X > M > C > B > A. */
function flareRank(cls: string | undefined): number {
  const m = /^([ABCMX])(\d+(?:\.\d+)?)/.exec(cls ?? "");
  if (!m) return -1;
  return "ABCMX".indexOf(m[1]) * 100 + Number(m[2]);
}

/** M- and X-class flares DONKI listed, strongest first. Weaker flares are not news. */
export function flareFacts(sw: Pick<SpaceWeather, "flares"> | null, retrievedAt: string, upstreamUrl: string, max = 3): Fact[] {
  return (sw?.flares ?? [])
    .filter((f) => /^[MX]/.test(f.classType ?? ""))
    .sort((a, b) => flareRank(b.classType) - flareRank(a.classType) || (b.peak ?? "").localeCompare(a.peak ?? ""))
    .slice(0, max)
    .map((f) => ({
      id: `flare:${f.id}`,
      kind: "flare" as const,
      headline_fields: fields({ classType: f.classType, sourceLocation: f.location, region: f.region != null ? String(f.region) : undefined }),
      numbers: {},
      place: null,
      time: isoText(f.peak ?? f.begin),
      link: f.link ?? null,
      provenance: prov("nasa-donki", { kind: "published", seriesId: f.id, upstreamUrl, retrievedAt, notes: ["DONKI: experimental research information; NOAA SWPC is the official US source"] }),
    }));
}

// ---------------------------------------------------------------- economy (FRED pulse, release calendar)

/** The fields of lib/economy/sources.ts PulseItem the facts read. */
export interface PulseLike {
  id: string;
  label: string;
  value: number;
  unit: string;
  date: string;
  prev: number | null;
  prevDate: string | null;
}

/** One fact per FRED series: the latest published value and the one before it, as FRED serves them. */
export function indicatorFacts(items: Array<PulseLike | null>, retrievedAt: string): Fact[] {
  return items
    .filter((p): p is PulseLike => !!p)
    .map((p) => ({
      id: `fred:${p.id}:${p.date}`,
      kind: "indicator" as const,
      headline_fields: fields({ series: p.id, label: p.label, unit: p.unit, date: p.date, prevDate: p.prevDate ?? undefined }),
      numbers: numbers({ value: p.value, prev: p.prev ?? undefined }),
      place: null,
      time: isoText(p.date),
      link: `https://fred.stlouisfed.org/series/${p.id}`,
      provenance: prov("fred", { kind: "published", seriesId: p.id, period: p.date, upstreamUrl: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${p.id}`, retrievedAt }),
    }));
}

/**
 * Release windows from the bundled calendar (lib/releases/calendar.ts) that
 * open in the next week. An approximate window is always a window: the
 * fact carries earliest and latest and never one date.
 */
export function releaseFacts(occ: ReleaseOccurrence[], retrievedAt: string, max = 6): Fact[] {
  return occ
    .filter((o) => o.entry.cadence !== "continuous" && o.entry.cadence !== "daily")
    .slice(0, max)
    .map((o) => ({
      id: `release:${o.entry.id}:${o.window.earliest}`,
      kind: "release" as const,
      headline_fields: fields({ title: o.entry.title, earliest: o.window.earliest, latest: o.window.latest, precision: o.precision, covers: o.entry.covers }),
      numbers: {},
      place: null,
      time: `${o.window.earliest}T00:00:00.000Z`,
      link: o.entry.scheduleUrl ?? null,
      provenance: prov(o.entry.sourceId, {
        kind: o.precision === "official" ? "published" : "estimate",
        seriesId: o.entry.seriesId,
        period: `${o.window.earliest}/${o.window.latest}`,
        retrievedAt,
        method: o.precision === "official" ? undefined : `release calendar rule ${o.entry.rule}, Embedding Atlas's own estimate of the window (lib/releases/calendar.ts)`,
      }),
    }));
}

// ---------------------------------------------------------------- weather at a story's place (Open-Meteo)

/** One Open-Meteo `current` answer. */
export interface OpenMeteoPoint {
  latitude?: number;
  longitude?: number;
  current?: { time?: string; temperature_2m?: number; relative_humidity_2m?: number; precipitation?: number; wind_speed_10m?: number; wind_direction_10m?: number };
  current_units?: Record<string, string>;
}

/**
 * Open-Meteo's current model conditions at the place of another fact (the
 * lead quake, the lead fire), one per answer, in the order asked. The values
 * are a weather model's analysis for that grid cell, not a station reading,
 * and the fact says so.
 */
export function weatherFacts(points: OpenMeteoPoint[], at: Fact[], retrievedAt: string, upstreamUrl: string): Fact[] {
  const out: Fact[] = [];
  at.forEach((f, i) => {
    const p = points[i];
    const c = p?.current;
    if (!f.place || !c?.time) return;
    const n = numbers({ tempC: c.temperature_2m, humidityPct: c.relative_humidity_2m, precipMm: c.precipitation, windMs: c.wind_speed_10m, windFromDeg: c.wind_direction_10m });
    if (!Object.keys(n).length) return;
    out.push({
      id: `wx:${f.id}:${c.time}`,
      kind: "weather",
      headline_fields: fields({ about: f.id, basis: "weather-model analysis for the grid cell, not a station reading", localTime: c.time }),
      numbers: n,
      place: f.place,
      time: null,
      link: null,
      provenance: prov("open-meteo", { kind: "published", upstreamUrl, retrievedAt, notes: ["Open-Meteo current conditions are model output for the grid cell"] }),
    });
  });
  return out;
}

// ---------------------------------------------------------------- the headline wire (lib/news/wire.ts)

/**
 * One fact per wire item: the outlet's title, verbatim, and its credit. Read
 * on air as the outlet's headline and nothing more.
 */
export function wireFacts(items: WireItem[], retrievedAt: string): Fact[] {
  const outlets = new Map(WIRE_OUTLETS.map((o) => [o.id, o]));
  const out: Fact[] = [];
  for (const it of items) {
    const o = outlets.get(it.outletId);
    if (!o) continue;
    out.push({
      id: it.id,
      kind: "wire",
      headline_fields: fields({ title: it.title, outlet: it.outlet }),
      numbers: {},
      place: null,
      time: it.publishedAt,
      link: it.link,
      provenance: prov(o.sourceId, { kind: "published", upstreamUrl: o.feedUrl, releasedAt: it.publishedAt ?? undefined, retrievedAt, notes: ["headline and link only; the article itself is the outlet's"] }),
    });
  }
  return out;
}

// ---------------------------------------------------------------- the whole set

export interface FactSet {
  facts: Fact[];
  /** Feeds that did not answer: their facts are missing, not absent. */
  failed: string[];
  retrievedAt: string;
}

/** Index facts by id. */
export function factIndex(facts: Fact[]): Map<string, Fact> {
  return new Map(facts.map((f) => [f.id, f]));
}

/** Facts of the given kinds, in the order the builders ranked them. */
export function ofKind(facts: Fact[], ...kinds: FactKind[]): Fact[] {
  return facts.filter((f) => kinds.includes(f.kind));
}
