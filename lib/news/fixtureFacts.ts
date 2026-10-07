// Test helper: the full fact set built from the fixtures captured 2026-10-07,
// as lib/news/sources.ts would build it from the live feeds at that moment.
// Imported by tests only.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAlerts, parseQuakes, type NwsAlertCollection } from "@/lib/live/live";
import { buildWildfire } from "@/lib/hazards/features";
import { parseKp } from "@/lib/space/weather";
import { upcomingReleases } from "@/lib/releases/calendar";
import { alertFacts, flareFacts, indicatorFacts, kpFacts, launchFacts, quakeFacts, releaseFacts, weatherFacts, wildfireFacts, wireFacts, type Fact, type PulseLike } from "./facts";
import { freshWire, parseFeed, WIRE_OUTLETS } from "./wire";
import nws from "./fixtures/nws-alerts-severe.json";
import usgs from "./fixtures/usgs-4.5_day.json";
import perims from "./fixtures/wfigs-perimeters.json";
import incidents from "./fixtures/wfigs-incidents.json";
import ll2 from "./fixtures/ll2-upcoming.json";
import gfz from "./fixtures/gfz-kp.json";
import donki from "./fixtures/donki-flr.json";
import meteo from "./fixtures/open-meteo-current.json";
import manifest from "./fixtures/manifest.json";

export const FIXTURE_DIR = path.join(__dirname, "fixtures");
export const CAPTURED_AT = manifest.capturedAt;
export const CAPTURED_MS = Date.parse(manifest.capturedAt);

function pulse(id: string, label: string, unit: string): PulseLike {
  const rows = readFileSync(path.join(FIXTURE_DIR, `fred-${id}.csv`), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  const ok = rows.filter((r) => r[1] !== "" && r[1] !== ".");
  const last = ok[ok.length - 1];
  const prev = ok[ok.length - 2];
  return { id, label, unit, date: last[0], value: Number(last[1]), prev: Number(prev[1]), prevDate: prev[0] };
}

/** Every fact the fixtures support, in the order lib/news/sources.ts assembles them. */
export function fixtureFacts(): Fact[] {
  const ra = CAPTURED_AT;
  type Rows = Parameters<typeof buildWildfire>[0];
  const facts: Fact[] = [
    ...alertFacts(parseAlerts(nws as NwsAlertCollection), ra, "https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe"),
    ...quakeFacts(parseQuakes(usgs as Parameters<typeof parseQuakes>[0]), ra, "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"),
    ...wildfireFacts(buildWildfire((perims as { features: Rows }).features, (incidents as { features: Rows }).features).features, ra, "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services"),
    ...launchFacts(ll2, ra, CAPTURED_MS),
    ...kpFacts({ kp: parseKp(gfz).kp }, ra, "https://kp.gfz.de/app/json/"),
    ...flareFacts({ flares: donki.map((f) => ({ id: f.flrID, classType: f.classType, begin: f.beginTime, peak: f.peakTime, end: f.endTime, location: f.sourceLocation, region: f.activeRegionNum ?? undefined, link: f.link })) }, ra, "https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR"),
    ...indicatorFacts([pulse("MORTGAGE30US", "30-year fixed mortgage rate", "%"), pulse("UNRATE", "unemployment rate", "%"), pulse("DCOILWTICO", "WTI crude oil", "$ per barrel")], ra),
    ...releaseFacts(upcomingReleases(CAPTURED_MS, CAPTURED_MS + 7 * 86_400_000), ra),
    ...wireFacts(freshWire(WIRE_OUTLETS.flatMap((o) => parseFeed(readFileSync(path.join(FIXTURE_DIR, `rss-${o.id}.xml`), "utf8"), o)), CAPTURED_MS), ra),
  ];
  const lead = [facts.find((f) => f.kind === "quake"), facts.find((f) => f.kind === "wildfire")].filter((f): f is Fact => !!f?.place);
  facts.push(...weatherFacts(meteo, lead, ra, "https://api.open-meteo.com/v1/forecast"));
  return facts;
}
