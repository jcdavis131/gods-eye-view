// The fact builders on payloads captured from the real feeds on 2026-10-07
// (lib/news/fixtures/manifest.json lists each URL and capture time).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAlerts, parseQuakes, type NwsAlertCollection } from "@/lib/live/live";
import { buildWildfire } from "@/lib/hazards/features";
import { parseKp, type SpaceWeather } from "@/lib/space/weather";
import { upcomingReleases } from "@/lib/releases/calendar";
import { SOURCES } from "@/lib/provenance/sources";
import {
  alertFacts,
  factIndex,
  firstAreas,
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
  type PulseLike,
} from "./facts";
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

const FIX = path.join(__dirname, "fixtures");
const CAPTURED = Date.parse(manifest.capturedAt);
const RA = manifest.capturedAt;

/** Builders must not read the clock: make Date.now throw while they run. */
function noClock<T>(fn: () => T): T {
  const spy = vi.spyOn(Date, "now").mockImplementation(() => {
    throw new Error("a fact builder read the clock");
  });
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

/** Every fact carries a stable id, a registered source and only finite numbers and non-blank words. */
function wellFormed(facts: Fact[]) {
  for (const f of facts) {
    expect(f.id, f.id).toMatch(/^[a-z][a-z0-9-]*:/);
    expect(SOURCES[f.provenance.source.id as keyof typeof SOURCES], f.id).toBeDefined();
    for (const v of Object.values(f.numbers)) expect(Number.isFinite(v), f.id).toBe(true);
    for (const v of Object.values(f.headline_fields)) expect(v.trim().length, f.id).toBeGreaterThan(0);
    if (f.place) {
      expect(Math.abs(f.place.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(f.place.lon)).toBeLessThanOrEqual(180);
      expect(f.place.name.length).toBeGreaterThan(0);
    }
  }
  expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
}

describe("quakeFacts", () => {
  const quakes = parseQuakes(usgs as Parameters<typeof parseQuakes>[0]);
  const facts = noClock(() => quakeFacts(quakes, RA, "https://earthquake.usgs.gov/x"));

  it("keeps USGS's ids, magnitudes and places, strongest first", () => {
    wellFormed(facts);
    expect(facts[0].id).toBe("quake:aka2026tuxgky");
    expect(facts[0].numbers).toEqual({ magnitude: 5.5, depthKm: 87.6 });
    expect(facts[0].headline_fields).toEqual({ place: "92 km NNW of Aleneva, Alaska", pagerAlert: "green" });
    expect(facts[0].place).toEqual({ name: "92 km NNW of Aleneva, Alaska", lat: 58.802, lon: -153.609 });
    expect(facts.map((f) => f.numbers.magnitude)).toEqual([...facts.map((f) => f.numbers.magnitude)].sort((a, b) => b - a));
    expect(facts[0].provenance).toMatchObject({ kind: "published", seriesId: "aka2026tuxgky", retrievedAt: RA });
  });
  it("leaves out a PAGER level USGS did not publish, and never relays the tsunami flag", () => {
    const kuril = facts.find((f) => f.id === "quake:us6000u0nb")!;
    expect(kuril.headline_fields).toEqual({ place: "Kuril Islands" });
    for (const f of facts) expect(Object.keys(f.headline_fields)).not.toContain("tsunami");
  });
  it("is the same answer twice", () => {
    expect(quakeFacts(quakes, RA, "u")).toEqual(quakeFacts(quakes, RA, "u"));
  });
});

describe("alertFacts", () => {
  const alerts = parseAlerts(nws as NwsAlertCollection);
  const facts = noClock(() => alertFacts(alerts, RA, "https://api.weather.gov/alerts/active"));

  it("counts every alert, and places only those with an outline", () => {
    wellFormed(facts);
    const count = facts.find((f) => f.kind === "alert-count")!;
    expect(count.id).toBe("alerts:count");
    expect(count.numbers.inForce).toBe(7);
    expect(count.headline_fields.commonestEvent).toBe("Flood Warning");
    expect(count.numbers.commonestEventCount).toBe(4);
    expect(count.provenance.kind).toBe("snapshot");
    const placed = facts.filter((f) => f.kind === "alert");
    // Three alerts came without a polygon; the fixture has no zone outlines, so they are counted, not placed.
    expect(placed).toHaveLength(4);
    for (const f of placed) expect(f.place).not.toBeNull();
  });
  it("keeps NWS's words: event, areas, sender, its ratings and the expiry", () => {
    const f = facts.find((x) => x.kind === "alert")!;
    expect(f.headline_fields.event).toBe("Flood Warning");
    expect(f.headline_fields.severity).toBe("Severe");
    expect(f.headline_fields.urgency).toBe("Immediate");
    expect(f.headline_fields.certainty).toBe("Observed");
    expect(f.headline_fields.expires).toMatch(/^2026-10-0\dT\d\d:\d\d:00\.000Z$/);
    expect(f.id.startsWith("alert:urn:oid:")).toBe(true);
  });
  it("names at most three areas, as NWS lists them", () => {
    expect(firstAreas("A; B; C; D")).toBe("A; B; C");
    expect(firstAreas(" A ;; B")).toBe("A; B");
  });
  it("answers nothing for no alerts (no count of zero is invented)", () => {
    expect(alertFacts([], RA, "u")).toEqual([]);
  });
});

describe("wildfireFacts", () => {
  type Rows = Parameters<typeof buildWildfire>[0];
  const built = buildWildfire((perims as { features: Rows }).features, (incidents as { features: Rows }).features);
  const facts = noClock(() => wildfireFacts(built.features, RA, "https://services3.arcgis.com/x"));

  it("takes wildfires only (the complex is not type WF), still burning first, then by size", () => {
    wellFormed(facts);
    expect(facts.map((f) => f.headline_fields.name)).not.toContain("ROWE CREEK COMPLEX");
    const open = facts.filter((f) => (f.numbers.containedPct ?? 0) < 100);
    expect(facts.slice(0, open.length)).toEqual(open);
    expect(facts[0].headline_fields.name).toBe("LITTLE GIANT");
    expect(facts[0].numbers.acres).toBe(172904);
    expect(facts[0].numbers.containedPct).toBe(93);
  });
  it("places a fire by its incident point or its outline, named by WFIGS's county and state", () => {
    const cw = facts.find((f) => f.headline_fields.name === "0445 CROSSWHITE")!;
    expect(cw.place!.name).toMatch(/County, OR$/);
    expect(cw.headline_fields.sizeBasis).toBe("perimeter");
    expect(cw.provenance.notes).toContain("NIFC: not a legal document, no warranty");
  });
});

describe("launchFacts", () => {
  const facts = noClock(() => launchFacts(ll2, RA, CAPTURED));

  it("keeps launches with a NET in the next 48 hours, soonest first, with LL2's own precision", () => {
    wellFormed(facts);
    expect(facts.map((f) => f.headline_fields.name)).toEqual(["Nuri | NeonSat-2 to 6", "Falcon 9 Block 5 | SDA Tranche 1 Transport Layer A"]);
    expect(facts[0]).toMatchObject({
      id: "launch:e0741415-6c63-4236-9736-24a6c04485bc",
      time: "2026-10-07T03:25:00.000Z",
      place: { name: "Naro Space Center, South Korea", lat: 34.431867, lon: 127.535069 },
    });
    expect(facts[0].headline_fields).toMatchObject({ provider: "Korea Aerospace Research Institute", rocket: "KSLV-2 Nuri", status: "Go for Launch", netPrecision: "Minute" });
  });
  it("answers nothing for a missing list", () => {
    expect(launchFacts(null, RA, CAPTURED)).toEqual([]);
    expect(launchFacts({ results: [{ id: "x", name: "No date" }] }, RA, CAPTURED)).toEqual([]);
  });
});

describe("space weather facts", () => {
  const kp = parseKp(gfz).kp;
  const flares: SpaceWeather["flares"] = donki.map((f) => ({ id: f.flrID, classType: f.classType, begin: f.beginTime, peak: f.peakTime, end: f.endTime, location: f.sourceLocation, region: f.activeRegionNum ?? undefined, link: f.link }));

  it("reports GFZ's latest Kp and the day's highest, with the NOAA G-scale only where Kp reaches it", () => {
    const facts = noClock(() => kpFacts({ kp }, RA, "https://kp.gfz.de/app/json/"));
    wellFormed(facts);
    const last = kp[kp.length - 1];
    expect(facts[0].id).toBe(`kp:${last.time}`);
    expect(facts[0].numbers.kp).toBeCloseTo(last.kp, 2);
    expect(facts[0].headline_fields.gScale).toBeUndefined();
    const max = facts.find((f) => f.id.startsWith("kp-max24:"));
    if (max) expect(max.numbers.kp).toBeGreaterThanOrEqual(facts[0].numbers.kp);
    expect(kpFacts({ kp: [] }, RA, "u")).toEqual([]);
  });
  it("lists M and X flares only, strongest first", () => {
    const facts = noClock(() => flareFacts({ flares }, RA, "https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR"));
    wellFormed(facts);
    expect(facts.map((f) => f.headline_fields.classType)).toEqual(["M1.8", "M1.4", "M1.0"]);
    expect(facts[0].time).toBe("2026-10-06T08:05:00.000Z");
    expect(flareFacts({ flares: null }, RA, "u")).toEqual([]);
  });
});

describe("economy facts", () => {
  function pulse(id: string, label: string, unit: string): PulseLike {
    const rows = readFileSync(path.join(FIX, `fred-${id}.csv`), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
    const ok = rows.filter((r) => r[1] !== "" && r[1] !== ".");
    const last = ok[ok.length - 1];
    const prev = ok[ok.length - 2];
    return { id, label, unit, date: last[0], value: Number(last[1]), prev: Number(prev[1]), prevDate: prev[0] };
  }
  it("keeps FRED's latest and previous values with their dates", () => {
    const items = [pulse("UNRATE", "unemployment rate", "%"), null];
    const facts = noClock(() => indicatorFacts(items, RA));
    wellFormed(facts);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ id: "fred:UNRATE:2026-09-01", numbers: { value: 4.2, prev: 4.1 }, headline_fields: { date: "2026-09-01", prevDate: "2026-08-01", unit: "%" } });
    expect(facts[0].provenance).toMatchObject({ seriesId: "UNRATE", period: "2026-09-01", kind: "published" });
  });
  it("gives approximate releases a window and an estimate's provenance, never a single date", () => {
    const occ = upcomingReleases(CAPTURED, CAPTURED + 7 * 86_400_000);
    const facts = noClock(() => releaseFacts(occ, RA));
    wellFormed(facts);
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) {
      expect(f.headline_fields.earliest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.headline_fields.latest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (f.headline_fields.precision === "approximate") {
        expect(f.provenance.kind).toBe("estimate");
        expect(f.provenance.method).toMatch(/release calendar rule/);
      }
    }
  });
});

describe("weatherFacts", () => {
  it("attaches Open-Meteo's current values to the fact it was asked for, labelled as model output", () => {
    const at: Fact[] = [
      { id: "quake:a", kind: "quake", headline_fields: {}, numbers: {}, place: { name: "A", lat: 58.8, lon: -153.61 }, time: null, link: null, provenance: { source: SOURCES["usgs-earthquakes"], retrievedAt: RA, kind: "published" } },
      { id: "fire:b", kind: "wildfire", headline_fields: {}, numbers: {}, place: { name: "B", lat: 48.02, lon: -120.85 }, time: null, link: null, provenance: { source: SOURCES["nifc-wfigs"], retrievedAt: RA, kind: "snapshot" } },
    ];
    const facts = noClock(() => weatherFacts(meteo, at, RA, "https://api.open-meteo.com/v1/forecast"));
    wellFormed(facts);
    expect(facts).toHaveLength(2);
    expect(facts[0].id).toBe("wx:quake:a:2026-10-06T18:45");
    expect(facts[0].numbers.tempC).toBe(-2.2);
    expect(facts[1].numbers).toMatchObject({ tempC: 13.8, humidityPct: 39, windMs: 0.4 });
    expect(facts[0].headline_fields.basis).toMatch(/model/);
    expect(facts[0].place).toEqual(at[0].place);
    expect(weatherFacts([], at, RA, "u")).toEqual([]);
  });
});

describe("wireFacts", () => {
  it("relays each headline verbatim with its outlet and nothing else", () => {
    const bbc = WIRE_OUTLETS.find((o) => o.id === "bbc")!;
    const items = freshWire(parseFeed(readFileSync(path.join(FIX, "rss-bbc.xml"), "utf8"), bbc), CAPTURED);
    const facts = noClock(() => wireFacts(items, RA));
    wellFormed(facts);
    expect(facts.length).toBeGreaterThan(0);
    for (const f of facts) {
      expect(Object.keys(f.headline_fields).sort()).toEqual(["outlet", "title"]);
      expect(f.headline_fields.outlet).toBe("BBC News");
      expect(f.numbers).toEqual({});
      expect(f.place).toBeNull();
      expect(f.provenance.source.id).toBe("wire-bbc");
    }
    expect(facts.map((f) => f.headline_fields.title)).toContain("Tear gas in Paris and Marseille as school protests grow across France");
  });
});

describe("factIndex", () => {
  it("indexes by id", () => {
    const facts = quakeFacts(parseQuakes(usgs as Parameters<typeof parseQuakes>[0]), RA, "u");
    expect(factIndex(facts).get("quake:aka2026tuxgky")?.numbers.magnitude).toBe(5.5);
  });
});
