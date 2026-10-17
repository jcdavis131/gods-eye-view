// The two county bakes (scripts/bake-hazard-history.mjs): the pure functions on real captured
// slices (lib/hazards/fixtures/spc-head.csv is SPC's first 2,001 bytes from a range request, cut
// mid-line; lsus-county.slice.csv is USGS's CSV header, its first 40 rows, the 8 Connecticut rows,
// the 6 changed 2010 counties and Travis, a labelled slice), and the committed outputs themselves.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import counties from "@/lib/places/data/counties.json";
import spcCommitted from "./data/spc-tornado-county.json";
import lsCommitted from "./data/landslide-county.json";
import { bakeLandslide, bakeSpc, csvLine, LANDSLIDE_RENAMES, parseCsv, SPC_RENAMES } from "./bake";

const refs = (counties as { rows: Array<{ geoid: string; name: string; stusab: string }> }).rows.map((r) => ({ geoid: r.geoid, name: r.name, stusab: r.stusab }));
const fx = (n: string) => readFileSync(path.resolve(__dirname, "fixtures", n), "utf8");

describe("csv", () => {
  it("splits quoted fields and strips the BOM", () => {
    expect(csvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(csvLine('"say ""hi""",x')).toEqual(['say "hi"', "x"]);
    const { header, rows } = parseCsv("﻿COUNTY,ST\nTravis County,TX\n");
    expect(header).toEqual(["COUNTY", "ST"]);
    expect(rows).toEqual([["Travis County", "TX"]]);
  });
});

describe("SPC bake", () => {
  it("counts the head slice per county and year, and drops the line the range request cut", () => {
    const b = bakeSpc(fx("spc-head.csv"), refs, "Fri, 24 Apr 2026 19:12:11 GMT");
    expect(b.meta.malformedLines).toBe(1);
    expect(b.meta.rows).toBe(17);
    // 1950-10-01, OK (stf 40), f1 = 25: Ellis County, OK.
    expect(b.counties["40025"]).toEqual([[1950, 1]]);
    expect(b.meta.lastModified).toBe("Fri, 24 Apr 2026 19:12:11 GMT");
    expect(b.meta.what).toMatch(/derivation, not an upstream file/);
  });

  it("is a pure function of its input (byte-identical on rerun)", () => {
    const a = JSON.stringify(bakeSpc(fx("spc-head.csv"), refs, "x", "y"));
    expect(JSON.stringify(bakeSpc(fx("spc-head.csv"), refs, "x", "y"))).toBe(a);
  });

  it("the committed bake: 73,458 rows, Travis 71, 611 with no county, Dade on Miami-Dade, unmatched codes listed", () => {
    const m = spcCommitted.meta;
    expect(m.rows).toBe(73458);
    expect(m.noCounty).toBe(611);
    expect(m.stateSegmentRows).toBe(670);
    expect(m.countyCodes).toBe(3058);
    expect(m.lastModified).toBe("Fri, 24 Apr 2026 19:12:11 GMT");
    const c = spcCommitted.counties as unknown as Record<string, Array<[number, number]>>;
    expect(c["48453"].reduce((s, [, n]) => s + n, 0)).toBe(71);
    expect(c["12025"]).toBeUndefined();
    expect(c["12086"].some(([y]) => y < 1997)).toBe(true);
    expect(c["46113"]).toBeUndefined();
    expect(m.legacyCt).toEqual(["09001", "09003", "09005", "09007", "09009", "09011", "09013", "09015"]);
    expect(m.unmatched).toContain("21022");
    expect(m.unmatched).toHaveLength(15);
    for (const k of Object.keys(c)) expect(refs.some((r) => r.geoid === k), k).toBe(true);
  });

  it("pins the rename table at the two Census-documented changes, each cited", () => {
    expect(SPC_RENAMES.map((r) => [r.from, r.to])).toEqual([
      ["12025", "12086"],
      ["46113", "46102"],
    ]);
    for (const r of SPC_RENAMES) expect(r.citation).toMatch(/^https:\/\/www\.census\.gov\/programs-surveys\/geography\/technical-documentation\/county-changes\.(1990|2010)\.html$/);
  });
});

describe("landslide bake", () => {
  it("joins the slice by exact name, applies the three renames, and lists the rest", () => {
    const b = bakeLandslide(fx("lsus-county.slice.csv"), refs, null);
    expect(b.meta.rows).toBe(55);
    expect(b.meta.renamed.map((r) => r.to).sort()).toEqual(["02158", "22059", "46102"]);
    expect(b.meta.unmatched.map((u) => `${u.st} ${u.county}`).sort()).toEqual([
      "AK Petersburg Census Area",
      "AK Valdez-Cordova Census Area",
      "CT Fairfield County",
      "CT Hartford County",
      "CT Litchfield County",
      "CT Middlesex County",
      "CT New Haven County",
      "CT New London County",
      "CT Tolland County",
      "CT Windham County",
      "VA Bedford city",
    ]);
    expect(b.counties["48453"]).toEqual([2590.915166, 936.4637326, 0.361441295, 1, 0.001067847]);
    expect(b.counties["01001"]?.[2]).toBe(0.609689515);
  });

  it("the committed bake: 3,207 exact, 3 renamed, 11 unmatched, 3,210 rows, CC0", () => {
    const m = lsCommitted.meta;
    expect([m.rows, m.exact, m.renamed.length, m.unmatched.length]).toEqual([3221, 3207, 3, 11]);
    expect(Object.keys(lsCommitted.counties)).toHaveLength(3210);
    expect(m.licence).toBe("CC0 1.0");
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const k of ["09110", "09190", "02063", "02066", "02195"]) expect((lsCommitted.counties as Record<string, unknown>)[k], k).toBeUndefined();
  });

  it("pins the rename table at three Census-documented name changes", () => {
    expect(LANDSLIDE_RENAMES).toHaveLength(3);
    for (const r of LANDSLIDE_RENAMES) expect(r.citation).toMatch(/county-changes\.2010\.html$/);
  });
});
