// Housing phase 2 (round 8): DDA outlines and LIHTC points from captures made 2026-10-17 with the
// route's own query (housingBoxParams + the part's fields and where), copied unmodified:
//   hud-dda-austin.json      DDA in the Austin box -97.9,30.1,-97.6,30.4 (8 metro ZCTAs)
//   hud-dda-ct-box.json      DDA in -73.2,41.6,-72.9,41.9: Northwest Hills Planning Region (NM) and a Waterbury ZCTA
//   hud-dda-sussex-box.json  DDA in -75.6,38.6,-75.3,38.9: Sussex County, DE (NM)
//   hud-lihtc-austin.json    LIHTC in the Austin box, where N_UNITS >= 5 (134 rows: 118 R, 1 '4', 15 T)
//   hud-lihtc-ct-box.json    LIHTC in the Connecticut box (10 rows)
// and one labelled mutation, hud-lihtc-small.sentinel.json (an Austin row with N_UNITS set to 1).
//   hud-lihtc-address-names.json  11 whole rows picked by HUD_ID from the national pull of
//     2026-10-17 (where N_UNITS >= 5, LIHTC_FIELDS, f=geojson; round8/lihtc-oracle.mjs), the rows unmodified, the wrapper's exceededTransferLimit dropped:
//     names that are, or carry, their own PROJ_ADD
import { describe, expect, it } from "vitest";
import ddaAustin from "./fixtures/hud-dda-austin.json";
import ddaCt from "./fixtures/hud-dda-ct-box.json";
import ddaSussex from "./fixtures/hud-dda-sussex-box.json";
import lihtcAustin from "./fixtures/hud-lihtc-austin.json";
import lihtcCt from "./fixtures/hud-lihtc-ct-box.json";
import lihtcAddressNames from "./fixtures/hud-lihtc-address-names.json";
import sentinel from "./fixtures/hud-lihtc-small.sentinel.json";
import { buildDda, buildLihtc, housingPartsPref, LIHTC_DENY, LIHTC_FIELDS, LIHTC_MIN_UNITS, LIHTC_WHERE, lihtcBin, lihtcAddressKeys, lihtcLabel, lihtcNameIsAddress, lihtcStripAddress, lihtcYear, parseHousingParts } from "./taxcredit";

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
    expect(z.properties.details!.area).toBe("metro ZIP code area 78701 (Austin-Round Rock-San Marcos, TX MSA)");
    expect(z.properties.details!.designation).toBe("Difficult Development Area, titled 2026 by HUD");
  });
  it("names a non-metro county DDA as HUD does, and draws Connecticut's planning-region DDA", () => {
    const sx = buildDda(f(ddaSussex));
    expect(sx[0].properties.details!.area).toBe("non-metro county or county equivalent: Sussex County");
    const ct = buildDda(f(ddaCt));
    const nw = ct.find((x) => (x.properties.extra as { code: string }).code === "NCNTY09160N09160")!;
    expect(nw.properties.details!.area).toBe("non-metro county or county equivalent: Northwest Hills Planning Region");
    expect(nw.properties.details!.connecticut).toMatch(/planning regions/);
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
    expect(coded.properties.details!["placed in service"]).toBe("HUD code 8888 (HUD's code, not a year)");
    for (const x of b.features) {
      expect(x.properties.details!["placed in service"]).not.toBe("8888");
      expect(x.properties.details!["nonprofit sponsor (NON_PROF)"] ?? "HUD code").toMatch(/^HUD code/);
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

describe("a LIHTC project HUD named by its street address", () => {
  // Real rows: TXA19890030 in the Austin capture has PROJECT "1220 E 52ND ST" equal to its PROJ_ADD;
  // CTA19880015 in the Connecticut capture is "26 & 30 MAUD STREET" at PROJ_ADD "26 MAUD ST".
  const byId = (fc: unknown, id: string) => buildLihtc(f(fc)).features.find((x) => (x.properties.extra as { hudId: string }).hudId === id)!;
  const rowOf = (fc: unknown, id: string) => f(fc).find((r) => r.properties?.HUD_ID === id)!.properties!;

  it("is labelled by its HUD id, and its address is not found by the palette", async () => {
    const { matchScore } = await import("@/lib/search/allowlist");
    const row = rowOf(lihtcAustin, "TXA19890030");
    expect(row.PROJECT).toBe(row.PROJ_ADD);
    const x = byId(lihtcAustin, "TXA19890030");
    expect(x.properties.name).toBe("LIHTC project · HUD id TXA19890030");
    for (const q of ["1220 e 52nd st", "1220", "52nd st"]) expect(matchScore(x.properties, q), q).toBe(0);
    expect(matchScore(x.properties, "txa19890030")).toBeGreaterThan(0);
    // the address stays in the dossier, shown on click, never searched
    expect(x.properties.details?.address).toMatch(/^1220 E 52ND ST, /);
  });

  it("catches a house-number range plus street that is not the address verbatim", async () => {
    const { matchScore } = await import("@/lib/search/allowlist");
    const row = rowOf(lihtcCt, "CTA19880015");
    expect([row.PROJECT, row.PROJ_ADD]).toEqual(["26 & 30 MAUD STREET", "26 MAUD ST"]);
    const x = byId(lihtcCt, "CTA19880015");
    expect(x.properties.name).toBe("LIHTC project · HUD id CTA19880015");
    expect(matchScore(x.properties, "maud")).toBe(0);
  });

  it("keeps every other published name in both captures", () => {
    for (const fc of [lihtcAustin, lihtcCt]) {
      for (const x of buildLihtc(f(fc)).features) {
        const id = (x.properties.extra as { hudId: string }).hudId;
        if (id === "TXA19890030" || id === "CTA19880015") continue;
        expect(x.properties.name, id).toBe(String(rowOf(fc, id).PROJECT).trim());
      }
    }
    expect(byId(lihtcAustin, "TXA0000X064").properties.name).toBe("PATHWAYS AT MANCHACA VILLAGE");
  });

  it("folds case, punctuation, whitespace and street words; a number or a street alone is a name", () => {
    expect(lihtcNameIsAddress("  1220  e. 52nd street ", "1220 E 52ND ST")).toBe(true);
    expect(lihtcNameIsAddress("524-526 WEST 159TH STREET", "524 W 159TH ST")).toBe(true);
    expect(lihtcNameIsAddress("99 RUTGERS 608", "99 RUTGERS AVE")).toBe(true);
    expect(lihtcNameIsAddress("2301 FIRST AVENUE", "335 E 118TH ST")).toBe(true);
    expect(lihtcNameIsAddress("1610 ASSOC", "1610 ST JOHNS PL")).toBe(false);
    expect(lihtcNameIsAddress("2021 APTS", "312 W 121ST ST")).toBe(false);
    expect(lihtcNameIsAddress("76TH ST APTS", "417 E 76TH ST")).toBe(false);
    expect(lihtcNameIsAddress("PATHWAYS AT NORTH LOOP", "2300 W. NORTH LOOP BLVD.")).toBe(false);
    expect(lihtcLabel("X1", null, "1 MAIN ST")).toBe("LIHTC project · HUD id X1");
  });

  it("folds every non-alphanumeric character, and '+', '&', AND, '-' and '/' join a range", () => {
    expect(lihtcNameIsAddress("803-28TH ST", "803 28TH ST")).toBe(true);
    expect(lihtcNameIsAddress("407 + 409 SYKES AVE", "407 409 SYKES AVE")).toBe(true);
    expect(lihtcNameIsAddress("12 and 14 Elm St.", "12 ELM ST")).toBe(true);
    expect(lihtcNameIsAddress("12/14 ELM STREET", null)).toBe(true);
    expect(lihtcNameIsAddress("51ST + KING DRIVE APARTMENTS", "5049 S KING DR")).toBe(false);
    expect(lihtcAddressKeys("400 WEST 59TH STREET")).toEqual([["400", "W", "59TH"]]);
    expect(lihtcAddressKeys("407-409 SYKES AVE")).toEqual([["407", "SYKES"], ["409", "SYKES"]]);
    expect(lihtcAddressKeys("CENTRE STREET")).toEqual([]);
  });
});

describe("a LIHTC project whose name carries its own street address (rule 4)", () => {
  // Real rows from the national pull: every one keeps its PROJECT verbatim in the fixture.
  const rows = f(lihtcAddressNames);
  const built = buildLihtc(rows).features;
  const label = (id: string) => built.find((x) => (x.properties.extra as { hudId: string }).hudId === id)?.properties.name;
  const row = (id: string) => rows.find((r) => r.properties?.HUD_ID === id)!.properties!;

  it("cuts the address out where a name is left, and labels by HUD id where none is", () => {
    expect(Object.fromEntries(built.map((x) => [(x.properties.extra as { hudId: string }).hudId, x.properties.name]))).toEqual({
      WAA00000117: "LIHTC project · HUD id WAA00000117", // "803-28TH ST" at "803 28TH ST"
      MAB20100065: "VILLAGE AT", // "VILLAGE AT 815 MAIN ST"
      NYC20030105: "JEFFERSON CLUSTER", // "JEFFERSON CLUSTER (116 JEFFERSON AVE)"
      NYC19979002: "ONE COLUMBUS PLACE", // "ONE COLUMBUS PLACE (400 WEST 59TH STREET)"
      NYA19940325: "WEST SALT SPRINGS", // "WEST SALT SPRINGS 1540 E GENESEE ST"
      LAA20130017: "THE CORONA", // "THE CORONA (FORMERLY 1854 NORTH STREET)"
      NYC20171047: "PP TC RS, LLC", // "PP 38 SIXTH AVENUE TC RS, LLC"
      CAA20200065: "UPTOWN NEWPORT I (NORTH)", // "UPTOWN NEWPORT I (NORTH) - 4301 JAMBOREE" at 4301 JAMBOREE ROAD
      NYA19940160: "GFI", // "GFI/ 74 WARBURTON" at 74 WARBURTON AVE
      MNA19929002: "LIHTC project · HUD id MNA19929002", // "2 RIVERS APARTMENTS (FKA PARK AVE APTS)": rule 2 errs toward replacing
    });
    // NCA19919005 "407 + 409 SYKES AVE" is at a tract centroid (not drawn); its label would be the HUD id
    expect(row("NCA19919005").LVL2KX).toBe("T");
    expect(label("NCA19919005")).toBeUndefined();
    expect(lihtcLabel("NCA19919005", String(row("NCA19919005").PROJECT), String(row("NCA19919005").PROJ_ADD))).toBe("LIHTC project · HUD id NCA19919005");
  });

  it("leaves no drawn label containing its PROJ_ADD's house number plus street, and the palette never finds it", async () => {
    const { matchScore } = await import("@/lib/search/allowlist");
    const words = (s: unknown) => ` ${String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
    for (const x of built) {
      const id = (x.properties.extra as { hudId: string }).hudId;
      const r = row(id);
      const keys = lihtcAddressKeys(String(r.PROJ_ADD));
      expect(keys.length, id).toBeGreaterThan(0);
      // not even the house number survives in these labels (the HUD id label carries only the id)
      for (const k of keys) expect(words(x.properties.name), id).not.toContain(` ${k[0]} `);
      expect(matchScore(x.properties, String(r.PROJ_ADD).toLowerCase()), id).toBe(0);
      expect(matchScore(x.properties, keys[0].join(" ").toLowerCase()), id).toBe(0);
      expect(x.properties.details?.address?.startsWith(`${String(r.PROJ_ADD).trim()}, `), id).toBe(true);
    }
  });

  it("keeps a name with no address in it, and cuts a range with its numbers", () => {
    expect(lihtcStripAddress("PATHWAYS AT MANCHACA VILLAGE", "3000 MANCHACA RD")).toBeNull();
    expect(lihtcLabel("X", "SYKES HOMES 407 + 409 SYKES AVE", "407-409 SYKES AVE")).toBe("SYKES HOMES");
    expect(lihtcLabel("X", "AT 12 MAIN ST", "12 MAIN ST")).toBe("LIHTC project · HUD id X");
    expect(lihtcLabel("X", "MAIN ST LOFTS (12 MAIN ST)", "12 MAIN ST")).toBe("MAIN ST LOFTS");
  });
});
