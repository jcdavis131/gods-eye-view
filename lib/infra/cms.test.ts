// CMS star ratings on the hospital click (round 8): the join on labelled slices of the build's own
// answers (2026-10-17), the click lines, the record-text invariance and the committed bake.
//   cms-tx.json             37 CMS Hospital General Information rows (results only; the query named no
//                           telephone or facility name), mostly Texas: the shared address 2813 S MAYHILL
//                           RD, Denton (two CMS rows, one HIFLD row), rated and not-rated matches,
//                           unmatched rows, and the one match whose HIFLD row is not OPEN (050854, CA)
//   rapt-tx.slice.json      the HIFLD rows sharing a key with them, plus 3500 GASTON AVENUE, 3RD AND
//                           4TH FLOORS (same ZIP and house number as CMS's 3500 GASTON AVE)
//   cms-hospitals.bake.json this bake's own output on the two slices (labelled derived)
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import cmsSlice from "./fixtures/cms-tx.json";
import raptSlice from "./fixtures/rapt-tx.slice.json";
import committed from "./data/cms-hospitals.json";
import box from "./fixtures/hosp-box-austin.json";
import { bakeCms, cmsDetails, cmsExtra, cmsPageUrl, cmsRating, CMS_DENY, CMS_PROPERTIES, joinKey, normAddress, type CmsBake, type CmsRow, type HifldJoinRow } from "./cms";
import { buildHospitals } from "./hospitals";

const cms = (cmsSlice as { results: CmsRow[] }).results;
const hifld = (raptSlice as { features: Array<{ attributes: HifldJoinRow }> }).features.map((f) => f.attributes);
const info = { cmsModified: "2026-07-22", hifldDataLastEdit: "2026-04-22" };
const bake = bakeCms(cms, hifld, info);

describe("the CMS query", () => {
  it("names its columns and never the telephone, the facility name or the county", () => {
    expect(CMS_PROPERTIES.filter((p) => CMS_DENY.test(p))).toEqual([]);
    expect(cmsPageUrl(1500)).not.toMatch(/telephone|facility_name|countyparish/);
    for (const r of cms) expect(Object.keys(r).filter((k) => CMS_DENY.test(k))).toEqual([]);
  });
});

describe("the join", () => {
  it("normalises the street words and keys on address + ZIP5", () => {
    expect(normAddress("1108 Ross Clark Circle")).toBe("1108 ROSS CLARK CIR");
    expect(joinKey("801 West Fifth Street", "78701-1234")).toBe("801 W FIFTH ST|78701");
    expect(joinKey("", "78701")).toBeNull();
  });
  it("attaches a one-to-one exact match", () => {
    const one = Object.entries(bake.rows)[0];
    expect(one[1][0]).toMatch(/^\d{6}$|^[0-9A-Z]{6}$/);
    expect(bake.meta.attached).toBeGreaterThan(20);
  });
  it("never attaches a shared address, and lists it with both sides' ids", () => {
    const sh = bake.meta.sharedAddress.find((x) => x[0] === "2813 S MAYHILL RD|76208")!;
    expect(sh[1]).toEqual(["450895", "670347"]);
    expect(sh[2]).toEqual(["0075076208"]);
    expect(bake.rows["0075076208"]).toBeUndefined();
  });
  it("does not attach on the house number alone", () => {
    // CMS 450021 at 3500 GASTON AVE attaches to the HIFLD row with that exact address; the HIFLD row at
    // "3500 GASTON AVENUE, 3RD AND 4TH FLOORS" (same ZIP and house number, another unit) gets nothing.
    const c = cms.find((r) => r.address === "3500 GASTON AVE")!;
    const [hid] = Object.entries(bake.rows).find(([, e]) => e[0] === c.facility_id)!;
    expect(joinKey(hifld.find((h) => h.ID === hid)!.ADDRESS, "75246")).toBe("3500 GASTON AVE|75246");
    expect(bake.rows["0074575246"]).toBeUndefined();
  });
  it("stores CMS's Not Available as null with the footnote, never 0", () => {
    expect(cmsRating("Not Available")).toBeNull();
    expect(cmsRating("0")).toBeNull();
    expect(cmsRating("4")).toBe(4);
    const nr = Object.values(bake.rows).find((e) => e[1] == null)!;
    expect(nr[2]).toBeTruthy();
    expect(Object.values(bake.rows).every((e) => e[1] !== 0)).toBe(true);
  });
  it("is byte-identical on a rerun, and the committed derived fixture is its output", () => {
    expect(JSON.stringify(bakeCms(cms, hifld, info))).toBe(JSON.stringify(bake));
    const derived = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures", "cms-hospitals.bake.json"), "utf8")) as { note: string; bake: CmsBake };
    expect(derived.note).toMatch(/^DERIVED/);
    expect(derived.bake).toEqual(JSON.parse(JSON.stringify(bake)));
  });
});

describe("the click", () => {
  it("says the rating and the match rule, not rated with the footnote, or no match", () => {
    const rated = cmsDetails(cmsExtra(["450056", 3, null, "Acute Care Hospitals", "Voluntary non-profit - Private", "Yes", "Y"]), "OPEN", "2026-07-22");
    expect(rated["CMS star rating"]).toBe("3 of 5 (Care Compare, dataset modified 2026-07-22; matched to this HIFLD record by street address and ZIP)");
    const nr = cmsDetails(cmsExtra(["453310", null, "19", "Childrens", "Voluntary non-profit - Private", "Yes", null]), "OPEN", "2026-07-22");
    expect(nr["CMS star rating"]).toMatch(/^CMS lists this hospital but has not rated it \(footnote 19\)/);
    expect(cmsDetails(null, "OPEN", "2026-07-22")["CMS star rating"]).toMatch(/^no unambiguous CMS match at this address/);
  });
  it("says HIFLD lists it closed when the matched HIFLD row is not open", () => {
    const closedId = Object.keys(bake.rows).find((id) => hifld.some((h) => h.ID === id && h.STATUS !== "OPEN"))!;
    expect(closedId).toBe("0001792804");
    const d = cmsDetails(cmsExtra(bake.rows[closedId]), "CLOSED", "2026-07-22");
    expect(d["CMS and HIFLD"]).toBe("HIFLD lists it closed; CMS still lists it");
  });
});

describe("buildHospitals with the CMS join", () => {
  type Rows = Parameters<typeof buildHospitals>[0];
  const rows = (box as unknown as { features: Rows }).features;
  const lookup = { rows: (committed as unknown as CmsBake).rows, modified: (committed as unknown as CmsBake).meta.cmsModified };
  it("carries extra.cms only where the bake attached a row; the national tier never does", () => {
    const fs = buildHospitals(rows, false, lookup);
    const attached = fs.filter((f) => (f.properties.extra as { cms?: unknown }).cms);
    expect(attached).toHaveLength(6);
    for (const f of fs) expect(f.properties.details!["CMS star rating"]).toBeDefined();
    const short = buildHospitals(rows, true, lookup);
    expect(short.every((f) => !("cms" in (f.properties.extra as object)) && !f.properties.details!["CMS star rating"])).toBe(true);
  });
  it("leaves the embedded record text byte-identical with and without the CMS attachment", () => {
    const plain = buildHospitals(rows, false);
    const withCms = buildHospitals(rows, false, lookup);
    const text = (f: (typeof plain)[number]) => JSON.stringify((f.properties.extra as { embedText?: unknown }).embedText);
    expect(withCms.map(text)).toEqual(plain.map(text));
    expect(plain.every((f) => (f.properties.extra as { embedText?: unknown }).embedText != null)).toBe(true);
  });
});

describe("the committed bake (2026-10-17)", () => {
  const m = (committed as unknown as CmsBake).meta;
  it("reproduces the design's join figures", () => {
    expect([m.cmsRows, m.cmsDistinctCcn, m.hifldRows]).toEqual([5419, 5419, 8514]);
    expect([m.attached, m.attachedOpen, m.attachedOpenRated, m.attachedClosed, m.sharedKeys]).toEqual([4050, 4038, 2429, 12, 224]);
    expect(m.cmsModified).toBe("2026-07-22");
    expect(m.hifldDataLastEdit).toBe("2026-04-22");
    expect(m.sha256.cms).toMatch(/^[0-9a-f]{64}$/);
  });
});
