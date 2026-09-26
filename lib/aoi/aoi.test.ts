// The drawn-area tools: inside tests, the watch, the exports and the land
// report's arithmetic. Polygons here are plain squares so each share has a
// known answer; the line layer is HIFLD's captured Austin payload.

import { describe, expect, it } from "vitest";
import type { LayerFeature, LayerId } from "@/lib/layers/types";
import { buildFloodZones } from "@/lib/land/features";
import { buildTransmission, type Row } from "@/lib/infra/features";
import transmission from "@/lib/infra/fixtures/transmission-austin.json";
import { featureInside, lengthInside, metres, pointInPolygon, sampleGrid, type Ring } from "./geometry";
import { featuresInside, insideCsv, insideGeoJson, newWatch, watchCsv, watchStep } from "./area";
import { areaReport, reportText } from "./report";

const sq = (w: number, s: number, e: number, n: number): Ring => [[w, s], [e, s], [e, n], [w, n]];
const point = (layer: LayerId, id: string, lon: number, lat: number, extra: Partial<LayerFeature["properties"]> = {}): LayerFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat, 0] },
  properties: { id, layer, name: id, source: "test", ...extra },
});

describe("geometry", () => {
  const ring = sq(0, 0, 1, 1);
  it("finds points, lines and polygons that touch the area", () => {
    expect(featureInside(point("dams", "in", 0.5, 0.5), ring)).toBe(true);
    expect(featureInside(point("dams", "out", 1.5, 0.5), ring)).toBe(false);
    const crossing: LayerFeature = { type: "Feature", geometry: { type: "LineString", coordinates: [[-1, 0.5], [2, 0.5]] }, properties: { id: "l", layer: "rail", name: "l", source: "t" } };
    expect(featureInside(crossing, ring)).toBe(true);
    const around: LayerFeature = { type: "Feature", geometry: { type: "Polygon", coordinates: [sq(-5, -5, 5, 5).concat([[-5, -5]])] }, properties: { id: "p", layer: "flood", name: "p", source: "t" } };
    expect(featureInside(around, ring)).toBe(true);
  });
  it("respects polygon holes", () => {
    const poly = [sq(0, 0, 10, 10), sq(4, 4, 6, 6)];
    expect(pointInPolygon(5, 5, poly)).toBe(false);
    expect(pointInPolygon(2, 2, poly)).toBe(true);
  });
  it("measures the part of a line inside the area to within a step", () => {
    const small = sq(-98, 30, -97.9, 30.1);
    const full = metres([-98.2, 30.05], [-97.7, 30.05]);
    const inside = lengthInside([[-98.2, 30.05], [-97.7, 30.05]], small);
    const expected = metres([-98, 30.05], [-97.9, 30.05]);
    expect(Math.abs(inside - expected)).toBeLessThan(2 * 200);
    expect(inside).toBeLessThan(full);
  });
  it("samples a grid inside the area", () => {
    const g = sampleGrid(sq(-98, 30, -97.9, 30.1), 2500);
    expect(g.points.length).toBeGreaterThan(2000);
    expect(g.points.length).toBeLessThanOrEqual(2600);
    expect(g.spacingM).toBeGreaterThan(150);
    expect(g.spacingM).toBeLessThan(250);
  });
});

describe("featuresInside and the exports", () => {
  const ring = sq(0, 0, 1, 1);
  const fs = [
    point("dams", "a", 0.2, 0.2, { details: { "NID id": "TX1", "hazard potential": "High" } }),
    point("dams", "b", 3, 3),
    point("satellites", "iss", 0.5, 0.5),
    point("traffic", "car", 0.5, 0.5, { simulated: true }),
    point("flood", "box", 0.5, 0.5, { kind: "loaded-box" }),
  ];
  it("leaves out orbits, simulations and map furniture", () => {
    const g = featuresInside(fs, ring);
    expect(g).toEqual([{ layer: "dams", features: [fs[0]] }]);
  });
  it("writes GeoJSON with the area and CSV with one row per feature", () => {
    const g = featuresInside(fs, ring);
    const gj = insideGeoJson(ring, g, "2026-09-26T00:00:00.000Z");
    expect(gj.features[0].properties).toEqual({ role: "drawn area" });
    expect((gj.features[0].geometry as { coordinates: number[][][] }).coordinates[0]).toHaveLength(5);
    expect(gj.features[1].properties).toMatchObject({ layer: "dams", id: "a", "NID id": "TX1" });
    const csv = insideCsv(g).split("\r\n");
    expect(csv[0]).toBe("layer,id,name,kind,lon,lat,source,observed_at,details");
    expect(csv[1]).toBe("dams,a,a,,0.2,0.2,test,,NID id: TX1; hazard potential: High");
  });
});

describe("watchStep", () => {
  const ring = sq(0, 0, 1, 1);
  const on = new Set<LayerId>(["aircraft", "earthquakes"]);
  it("takes a silent baseline, then reports arrivals and departures", () => {
    const w = newWatch();
    expect(watchStep(w, [point("aircraft", "a1", 0.5, 0.5)], ring, on, 1)).toEqual([]);
    const e2 = watchStep(w, [point("aircraft", "a1", 1.5, 0.5), point("aircraft", "a2", 0.4, 0.4)], ring, on, 2);
    expect(e2.map((e) => `${e.kind}:${e.id}`).sort()).toEqual(["arrived:a2", "left:a1"]);
    expect(w.log).toHaveLength(2);
    expect(watchCsv(w.log).split("\r\n")[0]).toBe("time,event,layer,id,name");
  });
  it("never reports a layer switched off as everything leaving, nor its return as arrivals", () => {
    const w = newWatch();
    watchStep(w, [point("aircraft", "a1", 0.5, 0.5)], ring, on, 1);
    expect(watchStep(w, [], ring, new Set<LayerId>(["earthquakes"]), 2)).toEqual([]);
    expect(watchStep(w, [point("aircraft", "a1", 0.5, 0.5), point("aircraft", "a3", 0.6, 0.6)], ring, on, 3)).toEqual([]);
    expect(watchStep(w, [point("aircraft", "a1", 0.5, 0.5)], ring, on, 4).map((e) => `${e.kind}:${e.id}`)).toEqual(["left:a3"]);
  });
  it("ignores layers that do not come and go", () => {
    const w = newWatch();
    watchStep(w, [], ring, new Set<LayerId>(["dams"]), 1);
    expect(watchStep(w, [point("dams", "d", 0.5, 0.5)], ring, new Set<LayerId>(["dams"]), 2)).toEqual([]);
  });
});

describe("areaReport", () => {
  const ring = sq(-98, 30, -97.98, 30.02);
  // A zone AE square covering the west half of the drawn area, and a minimal-hazard X over the rest.
  const zones = buildFloodZones([
    { geometry: { type: "Polygon", coordinates: [[[-98.1, 29.9], [-97.99, 29.9], [-97.99, 30.1], [-98.1, 30.1], [-98.1, 29.9]]] }, properties: { FLD_AR_ID: "1", FLD_ZONE: "AE", SFHA_TF: "T" } },
    { geometry: { type: "Polygon", coordinates: [[[-97.99, 29.9], [-97.9, 29.9], [-97.9, 30.1], [-97.99, 30.1], [-97.99, 29.9]]] }, properties: { FLD_AR_ID: "2", FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" } },
  ]);
  it("gives a polygon layer's share by class with its sample arithmetic", () => {
    const r = areaReport({ ring, areaM2: 4_000_000, features: zones, answering: new Set<LayerId>(["flood"]), on: { flood: true } });
    const flood = r.sections.find((s) => s.title.startsWith("Flood"))!;
    const ae = flood.lines.find((l) => l.label.startsWith("1 % annual-chance"))!;
    const pct = Number(ae.value.split(" %")[0]);
    expect(pct).toBeGreaterThan(47);
    expect(pct).toBeLessThan(53);
    expect(ae.formula).toMatch(/^\d+ of \d+ loaded samples = \d+ %/);
    expect(r.samples).toBeGreaterThan(2000);
  });
  it("counts samples outside the loaded box as not loaded, never as none", () => {
    const box: LayerFeature = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-98.1, 29.9], [-97.99, 29.9], [-97.99, 30.1], [-98.1, 30.1], [-98.1, 29.9]]] }, properties: { id: "flood:loaded-box", layer: "flood", name: "Loaded area", kind: "loaded-box", source: "this app" } };
    const r = areaReport({ ring, areaM2: 4_000_000, features: [...zones, box], answering: new Set<LayerId>(["flood"]), on: { flood: true } });
    const flood = r.sections.find((s) => s.title.startsWith("Flood"))!;
    expect(flood.notes?.some((n) => /outside the box this layer loaded/.test(n))).toBe(true);
    // Every loaded sample is in the AE half.
    expect(flood.lines[0].value.startsWith("100 %")).toBe(true);
  });
  it("lists layers that are off or have no answer instead of reporting zero", () => {
    const r = areaReport({ ring, areaM2: 4_000_000, features: [], answering: new Set<LayerId>(), on: { wetlands: true, landcover: true }, labels: { wetlands: "Wetlands" } });
    expect(r.sections.map((s) => s.title)).toEqual(["Drawn area"]);
    expect(r.missing).toEqual(expect.arrayContaining(["flood: off (switch it on to include it)", "Wetlands: no answer yet, or it failed"]));
    expect(r.missing.some((m) => m.startsWith("landcover: a picture"))).toBe(true);
  });
  it("sums line length inside the area by class, on HIFLD's Austin lines", () => {
    const lines = buildTransmission(transmission.features as Row[] as never);
    const big: Ring = sq(-98, 30, -97, 31);
    const r = areaReport({ ring: big, areaM2: 1e10, features: lines, answering: new Set<LayerId>(["transmission"]), on: { transmission: true } });
    const t = r.sections.find((s) => s.title.startsWith("Transmission"))!;
    expect(t.lines.length).toBeGreaterThan(0);
    expect(t.lines[0].formula).toMatch(/200 m steps/);
    expect(reportText(r, "test")).toContain("Transmission lines (HIFLD archive)");
  });
});
