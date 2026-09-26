import { describe, expect, it } from "vitest";
import type { MultiPolygon, Polygon } from "geojson";
import {
  buildFloodZones,
  buildPublicLands,
  buildWetlands,
  floodZoneMeaning,
  NWI_CAVEAT,
  nwiImagerySummary,
  parseEpqs,
  parseNwiSources,
  pointInRing,
  trimParts,
  type FloodZoneExtra,
  type PublicLandExtra,
  type WetlandExtra,
} from "./features";

const square: Polygon = { type: "Polygon", coordinates: [[[-120, 40], [-119.9, 40], [-119.9, 40.1], [-120, 40]]] };

// ---------------------------------------------------------------- FEMA NFHL

describe("buildFloodZones", () => {
  it("drops FEMA's -9999 'none' sentinel instead of showing it as an elevation", () => {
    const [f] = buildFloodZones([{ geometry: square, properties: { FLD_AR_ID: "48029C_1", FLD_ZONE: "AE", SFHA_TF: "T", STATIC_BFE: -9999, DEPTH: -9999, LEN_UNIT: "Feet" } }]);
    const x = f.properties.extra as FloodZoneExtra;
    expect(x.bfe).toBeUndefined();
    expect(x.depth).toBeUndefined();
    expect(f.properties.name).toBe("Zone AE");
    expect(f.properties.details?.["base flood elevation"]).toBeUndefined();
    expect(x.hazard).toBe("sfha");
  });

  it("shows a published base flood elevation with its unit and datum", () => {
    const [f] = buildFloodZones([{ geometry: square, properties: { FLD_ZONE: "AE", STATIC_BFE: 634.5, LEN_UNIT: "Feet", V_DATUM: "NAVD88", DFIRM_ID: "48029C" } }]);
    expect(f.properties.name).toBe("Zone AE · BFE 634.5 feet");
    expect(f.properties.details?.["base flood elevation"]).toBe("634.5 feet NAVD88");
    // No FLD_AR_ID: the id is built from the FIRM database and the row, never left empty.
    expect(f.properties.id).toBe("nfhl:48029C:0");
  });

  it("treats zone D as undetermined (no FEMA analysis), not as minimal hazard", () => {
    const [d, x] = buildFloodZones([
      { geometry: square, properties: { FLD_AR_ID: "1", FLD_ZONE: "D" } },
      { geometry: square, properties: { FLD_AR_ID: "2", FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" } },
    ]);
    expect((d.properties.extra as FloodZoneExtra).hazard).toBe("undetermined");
    expect(d.properties.details?.meaning).toBe("possible but undetermined flood hazard: no FEMA analysis");
    expect((x.properties.extra as FloodZoneExtra).hazard).toBe("minimal");
    expect(floodZoneMeaning("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD")).toMatch(/^0\.2 % annual-chance/);
  });

  it("skips rows with no polygon", () => {
    expect(buildFloodZones([{ geometry: null, properties: { FLD_ZONE: "AE" } }])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- NWI

describe("wetlands and their imagery year", () => {
  const quad = (name: string, w: number, yr: number) => ({
    geometry: { type: "Polygon" as const, coordinates: [[[w, 29.25], [w + 0.125, 29.25], [w + 0.125, 29.375], [w, 29.375], [w, 29.25]]] },
    properties: { PROJECT_NAME: name, IMAGE_YR: yr, IMAGE_DATE: "03/83", IMAGE_SCALE: 58000, SOURCE_TYPE: "CIR" },
  });
  const wet = (lon: number) => ({
    geometry: { type: "Polygon" as const, coordinates: [[[lon, 29.3], [lon + 0.001, 29.3], [lon + 0.001, 29.301], [lon, 29.3]]] },
    properties: { "Wetlands.ATTRIBUTE": "PEM1A", "Wetlands.OBJECTID": lon, "Wetlands.WETLAND_TYPE": "Freshwater Emergent Wetland" },
  });

  it("gives each wetland its mapping project's imagery year, or says it was not found", () => {
    const sources = parseNwiSources([quad("Southton", -98.5, 1983), quad("Losoya", -98.375, 2010)]);
    const built = buildWetlands([wet(-98.45), wet(-98.3), wet(-97)], sources);
    expect(built[0].properties.details?.["mapped from"]).toBe("1983 imagery (Southton, CIR 1:58,000, 03/83)");
    expect((built[0].properties.extra as WetlandExtra).imageYear).toBe(1983);
    expect((built[1].properties.extra as WetlandExtra).imageYear).toBe(2010);
    expect(built[2].properties.details?.["mapped from"]).toBe("imagery date not found in NWI's source layer");
    expect(built[0].properties.details?.["usfws caveat"]).toBe(NWI_CAVEAT);
    expect(built[0].properties.name).toBe("Freshwater Emergent Wetland · PEM1A");
    expect(nwiImagerySummary(sources).years).toEqual([1983, 2010]);
  });

  it("reads NWI's 0 year as not recorded rather than as year 0", () => {
    const [s] = parseNwiSources([quad("Nowhere", -98.5, 0)]);
    expect(s.year).toBeUndefined();
    expect(nwiImagerySummary([s]).years).toEqual([]);
  });

  it("tests points against a ring with the even-odd rule", () => {
    const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    expect(pointInRing(1, 1, ring)).toBe(true);
    expect(pointInRing(3, 1, ring)).toBe(false);
  });
});

// ---------------------------------------------------------------- PAD-US

describe("public and protected lands", () => {
  it("brings easements through with their holder, keeping the holder type's published code", () => {
    const domains = new Map([
      ["Category", new Map([["Easement", "Easement"]])],
      ["Own_Type", new Map([["DIST", "Regional Agency Special District"]])],
      ["Pub_Access", new Map([["OA", "Open Access"]])],
    ]);
    const [f] = buildPublicLands(
      [{ geometry: square, properties: { OBJECTID: 1, Category: "Easement", Unit_Nm: "Palo Alto College", Own_Type: "DIST", Loc_Own: "DIST", EsmtHldr: "Alamo Community College District", EHoldTyp: "DIST", Pub_Access: "OA", GIS_Acres: 161 } }],
      domains,
    );
    const d = f.properties.details!;
    expect(d["easement holder"]).toBe("Alamo Community College District");
    expect(d["easement holder type"]).toBe("DIST (Regional Agency Special District)");
    expect(d["local owner"]).toBe("DIST");
    expect(d["public access"]).toBe("open access");
    expect(String(d.note)).toMatch(/owner keeps the land/);
    // Only what the style and note need rides in `extra`; the rest travels once, as dossier lines.
    expect(Object.keys(f.properties.extra as PublicLandExtra).sort()).toEqual(["access", "acres", "category"]);
  });

  it("says access is unknown when PAD-US has no code, and leaves an unknown coded value as its code", () => {
    const [f] = buildPublicLands([{ geometry: square, properties: { OBJECTID: 2, Category: "Fee", Mang_Name: "ZZZ" } }], new Map());
    expect((f.properties.extra as PublicLandExtra).access).toBe("unknown");
    expect(f.properties.details?.["public access"]).toBe("unknown (not reported to PAD-US)");
    expect(f.properties.details?.manager).toBe("ZZZ");
    expect(f.properties.details?.["easement holder"]).toBeUndefined();
  });

  it("trims parts outside the box or smaller than the generalisation, and says how many", () => {
    const part = (x: number, y: number, d: number) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
    const g: MultiPolygon = { type: "MultiPolygon", coordinates: [part(0.1, 0.1, 0.5), part(0.2, 0.2, 0.0001), part(5, 5, 0.5)] };
    const t = trimParts(g, [0, 0, 1, 1], 0.0025);
    expect(t.dropped).toBe(2);
    expect((t.geometry as MultiPolygon).coordinates).toHaveLength(1);
    const specks: MultiPolygon = { type: "MultiPolygon", coordinates: [part(0.2, 0.2, 0.0001), part(0.3, 0.3, 0.0002)] };
    const s = trimParts(specks, [0, 0, 1, 1], 0.0025);
    // The largest part in the box is always kept, and it is the larger of the two specks.
    expect((s.geometry as MultiPolygon).coordinates).toHaveLength(1);
    expect((s.geometry as MultiPolygon).coordinates[0][0][0][0]).toBe(0.3);
    const [f] = buildPublicLands([{ geometry: g, properties: { OBJECTID: 9, Category: "Designation", Unit_Nm: "Coastal" } }], new Map(), { box: [0, 0, 1, 1], minDeg: 0.0025 });
    expect(String(f.properties.details?.outline)).toMatch(/^2 of its 3 parts not drawn/);
  });
});

// ---------------------------------------------------------------- USGS EPQS

describe("parseEpqs", () => {
  it("reads the string value EPQS sends, with the DEM resolution", () => {
    expect(parseEpqs(-98.47, 29.465, { value: "221.37", resolution: 1, rasterId: 7 })).toEqual({ lon: -98.47, lat: 29.465, metres: 221.37, resolutionM: 1, rasterId: 7 });
  });
  it("turns the -1000000 'no data' sentinel into no value, never a depth", () => {
    const r = parseEpqs(-90, 25, { value: -1000000, resolution: null });
    expect(r.metres).toBeUndefined();
    expect(r.resolutionM).toBeUndefined();
  });
});
