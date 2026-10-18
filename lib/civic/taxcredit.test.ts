// Housing phase 2 (round 8): DDA outlines and LIHTC points from captures made 2026-10-17 with the
// route's own query (housingBoxParams + the part's fields and where), copied unmodified:
//   hud-dda-austin.json      DDA in the Austin box -97.9,30.1,-97.6,30.4 (8 metro ZCTAs)
//   hud-dda-ct-box.json      DDA in -73.2,41.6,-72.9,41.9: Northwest Hills Planning Region (NM) and a Waterbury ZCTA
//   hud-dda-sussex-box.json  DDA in -75.6,38.6,-75.3,38.9: Sussex County, DE (NM)
//   hud-lihtc-austin.json    LIHTC in the Austin box, where N_UNITS >= 5 (134 rows: 118 R, 1 '4', 15 T)
//   hud-lihtc-ct-box.json    LIHTC in the Connecticut box (10 rows)
// and one labelled mutation, hud-lihtc-small.sentinel.json (an Austin row with N_UNITS set to 1).
import { describe, expect, it } from "vitest";
import ddaAustin from "./fixtures/hud-dda-austin.json";
import ddaCt from "./fixtures/hud-dda-ct-box.json";
import ddaSussex from "./fixtures/hud-dda-sussex-box.json";
import lihtcAustin from "./fixtures/hud-lihtc-austin.json";
import lihtcCt from "./fixtures/hud-lihtc-ct-box.json";
import sentinel from "./fixtures/hud-lihtc-small.sentinel.json";
import { buildDda, buildLihtc, housingPartsPref, LIHTC_DENY, LIHTC_FIELDS, LIHTC_MIN_UNITS, LIHTC_WHERE, lihtcBin, lihtcYear, parseHousingParts } from "./taxcredit";

type Fc = { features: Array<{ geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }> };
const f = (x: unknown) => (x as Fc).features;

describe("the LIHTC query", () => {
  it("asks only the allow-list, never the owner or contact block, and only projects of five or more units", () => {
    expect(LIHTC_FIELDS.filter((x) => LIHTC_DENY.test(x))).toEqual([]);
    for (const x of ["CONTACT", "COMPANY", "CO_ADD", "CO_CTY", "CO_ST", "CO_ZIP", "CO_TEL", "STD_ADDR", "DPV", "C1PGRC", "MSGUSPS", "APT_NO"]) expect(LIHTC_DENY.test(x), x).toBe(true);
    expect(LIHTC_MIN_UNITS).toBe(5);
    expect(LIHTC_WHERE).toBe("N_UNITS >= 5");
    // The captures carry exactly the allow-list: nothing else came back.
    for (const r of f(lihtcAustin)) expect(Object.keys(r.properties ?? {}).sort()).toEqual([...LIHTC_FIELDS].sort());
  });
});

describe("part= and hp=", () => {
  it("parses one or both parts and refuses anything else (hcv and qct are the default, not parts)", () => {
    expect(parseHousingParts(null)).toBeNull();
    expect(parseHousingParts("dda")).toEqual(["dda"]);
    expect(parseHousingParts("lihtc,dda")).toEqual(["dda", "lihtc"]);
    expect(parseHousingParts("hcv")).toBe("bad");
    expect(parseHousingParts("dda,qct")).toBe("bad");
    expect(parseHousingParts("")).toBe("bad");
    expect(housingPartsPref("lihtc,junk")).toEqual(["lihtc"]);
    expect(housingPartsPref(undefined)).toEqual([]);
  });
});

describe("buildDda", () => {
  it("draws Austin's metro ZCTAs one each, though they share one DDA_CODE", () => {
    const d = buildDda(f(ddaAustin));
    expect(d).toHaveLength(8);
    expect(new Set(f(ddaAustin).map((x) => x.properties?.DDA_CODE)).size).toBe(1);
    const z = d.find((x) => x.properties.name === "DDA ZIP 78701")!;
    expect(z.properties.details.area).toBe("metro ZIP code area 78701 (Austin-Round Rock-San Marcos, TX MSA)");
    expect(z.properties.details.designation).toBe("Difficult Development Area, titled 2026 by HUD");
  });
  it("names a non-metro county DDA as HUD does, and draws Connecticut's planning-region DDA", () => {
    const sx = buildDda(f(ddaSussex));
    expect(sx[0].properties.details.area).toBe("non-metro county or county equivalent: Sussex County");
    const ct = buildDda(f(ddaCt));
    const nw = ct.find((x) => (x.properties.extra as { code: string }).code === "NCNTY09160N09160")!;
    expect(nw.properties.details.area).toBe("non-metro county or county equivalent: Northwest Hills Planning Region");
    expect(nw.properties.details.connecticut).toMatch(/planning regions/);
  });
});

describe("buildLihtc", () => {
  it("draws only HUD's mappable geocode levels (R, 4) and counts the centroid ones", () => {
    const b = buildLihtc(f(lihtcAustin));
    expect(b.features).toHaveLength(119);
    expect(b.centroid).toBe(15);
    expect(b.noPoint).toBe(0);
    expect(b.features.every((x) => ["R", "4"].includes((x.properties.extra as { level: string }).level))).toBe(true);
  });
  it("drops a one-unit row that slipped past the where (the labelled sentinel), and counts nothing about it", () => {
    const b = buildLihtc(f(sentinel));
    expect(b.features).toEqual([]);
    expect(b).toEqual({ features: [], centroid: 0, noPoint: 0 });
  });
  it("shows HUD's codes as codes and 8888/9999 never as years", () => {
    expect(lihtcYear("1998")).toBe("1998");
    expect(lihtcYear("8888")).toBe("HUD code 8888 (HUD's code, not a year)");
    expect(lihtcYear("9999")).toBe("HUD code 9999 (HUD's code, not a year)");
    const b = buildLihtc(f(lihtcAustin));
    const coded = b.features.find((x) => f(lihtcAustin).some((r) => r.properties?.HUD_ID === (x.properties.extra as { hudId: string }).hudId && r.properties?.YR_PIS === "8888"))!;
    expect(coded.properties.details["placed in service"]).toBe("HUD code 8888 (HUD's code, not a year)");
    for (const x of b.features) {
      expect(x.properties.details["placed in service"]).not.toBe("8888");
      expect(x.properties.details["nonprofit sponsor (NON_PROF)"] ?? "HUD code").toMatch(/^HUD code/);
    }
  });
  it("sizes points by low-income units on fixed bins", () => {
    expect([5, 24, 25, 99, 100, 249, 250, 2000].map(lihtcBin)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it("draws Connecticut's properties (their old county codes are only a tower question)", () => {
    const b = buildLihtc(f(lihtcCt));
    expect(b.features.length).toBe(10);
  });
});

describe("the palette", () => {
  it("finds a LIHTC property by its HUD_ID, never by its street address; a DDA by its ZIP and HUD's code", async () => {
    const { matchScore } = await import("@/lib/search/allowlist");
    const b = buildLihtc(f(lihtcAustin));
    const x = b.features[0];
    const row = f(lihtcAustin).find((r) => r.properties?.HUD_ID === (x.properties.extra as { hudId: string }).hudId)!.properties!;
    expect(matchScore(x.properties, String(row.HUD_ID).toLowerCase())).toBeGreaterThan(0);
    expect(matchScore(x.properties, String(row.PROJ_ADD).toLowerCase())).toBe(0);
    const d = buildDda(f(ddaAustin)).find((y) => y.properties.name === "DDA ZIP 78701")!;
    expect(matchScore(d.properties, "78701")).toBeGreaterThan(0);
    expect(matchScore(d.properties, "metro12420m12420")).toBeGreaterThan(0);
  });
});
