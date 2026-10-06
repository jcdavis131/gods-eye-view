// The names an insight prints for a metro come from Atlas's registry, keyed
// by CBSA, by one fixed label rule; the bundle's own strings are only
// compared with them (build.ts registryMetro).

import { describe, expect, it } from "vitest";
import { allCbsa } from "@/lib/places/registry";
import { InsightRefused, registryMetro } from "./build";
import { cbsaOfQcew, metroName, qcewCode, qcewTitle, shortLabel } from "./metros";
import { BASE } from "./testFixtures";
import type { BubbleSpec } from "./render/spec";

const refuse = (reason: string): never => {
  throw new InsightRefused("C1-raw", reason);
};

describe("metro names from Atlas's registry", () => {
  it("labels a metro by its first principal city, keeping a hyphenated city whole", () => {
    expect(shortLabel("Austin-Round Rock-San Marcos, TX")).toBe("Austin");
    expect(shortLabel("New York-Newark-Jersey City, NY-NJ")).toBe("New York");
    expect(shortLabel("Nashville-Davidson--Murfreesboro--Franklin, TN")).toBe("Nashville");
    expect(shortLabel("Louisville/Jefferson County, KY-IN")).toBe("Louisville");
    expect(shortLabel("Winston-Salem, NC")).toBe("Winston-Salem");
    expect(shortLabel("Tampa-St. Petersburg-Clearwater, FL")).toBe("Tampa");
  });

  it("names every chart row of the committed bundle exactly as the producer did", () => {
    for (const d of (BASE.findings[0].chart as BubbleSpec).data) expect(metroName(d.id), d.id).toEqual({ cbsa: d.id, label: d.label, title: d.fullLabel });
    expect(allCbsa().every((c) => metroName(c) !== null)).toBe(true);
  });

  it("has no name for a CBSA the registry does not hold, or for anything that is not a CBSA", () => {
    expect(metroName("99990")).toBeNull();
    expect(metroName("Austin")).toBeNull();
    expect(metroName("1242")).toBeNull();
  });

  it("maps QCEW area codes to CBSAs and back, and titles them as QCEW does", () => {
    expect(qcewCode("12420")).toBe("C1242");
    expect(qcewCode("12421")).toBeNull();
    expect(cbsaOfQcew("C4522")).toBe("45220");
    expect(cbsaOfQcew("45220")).toBeNull();
    expect(qcewTitle(metroName("45220")!)).toBe("Tallahassee, FL MSA");
    for (const m of BASE.findings[0].evidence.chart.fail_closed) expect(qcewCode(m.cbsa), m.cbsa).toBe(m.qcew_code);
  });

  it("refuses a bundle label or title that is not the registry's, and fills one the bundle leaves out", () => {
    expect(() => registryMetro("the test", { cbsa: "12420", label: "Austin (unbeaten on both)" }, refuse)).toThrow(/labels 12420 "Austin \(unbeaten on both\)"; Atlas's metro registry labels it "Austin"/);
    expect(() => registryMetro("the test", { cbsa: "13140", label: "Houston" }, refuse)).toThrow(/labels 13140 "Houston"; Atlas's metro registry labels it "Beaumont"/);
    expect(() => registryMetro("the test", { cbsa: "99990" }, refuse)).toThrow(/names the metro "99990", which Atlas's metro registry does not have/);
    expect(registryMetro("the test", { cbsa: "13140" }, refuse)).toEqual({ cbsa: "13140", label: "Beaumont", title: "Beaumont-Port Arthur, TX" });
  });
});
