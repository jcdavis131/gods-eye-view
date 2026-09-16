import { describe, expect, it } from "vitest";
import { MANIFEST } from "./registry";
import {
  parseComparePair,
  parseCountyParam,
  parseMetroParam,
  parseStateParam,
  scopeBriefPath,
  scopeCentroid,
  scopeId,
  scopeLensBriefPath,
  scopeName,
  scopePath,
  scopeShortName,
} from "./scope";

// lib/series/collect.ts SERIES_ID_RE, copied rather than imported so a change
// there shows up here as a failure instead of silently redefining the contract.
const SERIES_ID_RE = /^[a-z0-9][a-zA-Z0-9:_.\-]{2,120}$/;

describe("parseCountyParam", () => {
  it("accepts a five-digit FIPS the manifest knows", () => {
    const s = parseCountyParam("48453");
    expect(s?.kind).toBe("county");
    expect(s?.id).toBe("48453");
    expect(s?.kind === "county" && s.provisional).toBe(false);
    expect(s?.kind === "county" && s.ref?.name).toBe("Travis County");
  });

  it("rejects anything that is not a five-digit county code", () => {
    for (const bad of ["4845", "484533", "48453x", "", " 48453", "48-453"]) expect(parseCountyParam(bad), bad).toBeNull();
    expect(parseCountyParam(undefined)).toBeNull();
    expect(parseCountyParam(null)).toBeNull();
    expect(parseCountyParam(["48", "453"])).toBeNull();
    expect(parseCountyParam(48453)).toBeNull();
  });

  it("rejects the SSCCC state form", () => {
    for (const bad of ["48000", "06000", "00000"]) expect(parseCountyParam(bad), bad).toBeNull();
  });

  it("rejects a code whose state prefix is not a state", () => {
    expect(parseCountyParam("99001")).toBeNull();
    expect(parseCountyParam("03001")).toBeNull();
  });

  it("accepts an unknown but structurally valid county while the manifest is a seed", () => {
    const s = parseCountyParam("48001");
    if (MANIFEST.countiesComplete) {
      // After the pull the manifest is the authority, so this is either a real
      // county with a ref or an exact 404.
      expect(s === null || (s.kind === "county" && s.provisional === false)).toBe(true);
      return;
    }
    expect(s).not.toBeNull();
    expect(s?.kind === "county" && s.provisional).toBe(true);
    expect(s?.kind === "county" && s.ref).toBeNull();
    expect(scopeCentroid(s!)).toBeNull();
    expect(scopeName(s!)).toBe("FIPS 48001, TX");
  });
});

describe("parseMetroParam", () => {
  it("accepts a published CBSA and nothing else", () => {
    const s = parseMetroParam("41700");
    expect(s?.kind).toBe("metro");
    expect(s?.kind === "metro" && s.ref.name).toContain("San Antonio");
    expect(parseMetroParam("99999")).toBeNull();
    expect(parseMetroParam("4170")).toBeNull();
    expect(parseMetroParam(undefined)).toBeNull();
  });
});

describe("parseStateParam", () => {
  it("canonicalises to upper case", () => {
    const s = parseStateParam("tx");
    expect(s?.kind).toBe("state");
    expect(s?.id).toBe("TX");
    expect(s?.kind === "state" && s.ref.name).toBe("Texas");
    expect(scopePath(s!)).toBe("/state/TX");
  });

  it("rejects a non-state", () => {
    for (const bad of ["ZZ", "T", "TXX", "4", ""]) expect(parseStateParam(bad), bad).toBeNull();
    expect(parseStateParam(["T", "X"])).toBeNull();
  });
});

describe("scope identity and paths", () => {
  const county = parseCountyParam("48453")!;
  const metro = parseMetroParam("41700")!;
  const state = parseStateParam("TX")!;

  it("produces ids that are legal series ids", () => {
    expect(scopeId(county)).toBe("county:48453");
    expect(scopeId(metro)).toBe("metro:41700");
    expect(scopeId(state)).toBe("state:TX");
    for (const s of [county, metro, state]) expect(SERIES_ID_RE.test(scopeId(s)), scopeId(s)).toBe(true);
  });

  it("builds the three path families", () => {
    expect(scopePath(county)).toBe("/place/48453");
    expect(scopePath(metro)).toBe("/metro/41700");
    expect(scopePath(state)).toBe("/state/TX");
    expect(scopeBriefPath(county)).toBe("/place/48453/brief");
    expect(scopeLensBriefPath(metro, "housing")).toBe("/metro/41700/brief/housing");
  });

  it("round-trips a path back through the parser", () => {
    const back = [
      [scopePath(county), parseCountyParam],
      [scopeBriefPath(county), parseCountyParam],
      [scopePath(metro), parseMetroParam],
      [scopeBriefPath(metro), parseMetroParam],
      [scopePath(state), parseStateParam],
      [scopeBriefPath(state), parseStateParam],
    ] as const;
    for (const [path, parse] of back) {
      const segment = path.split("/")[2];
      const again = parse(segment);
      expect(again, path).not.toBeNull();
      expect(scopePath(again!)).toBe(path.replace(/\/brief$/, ""));
    }
  });

  it("names and places each scope", () => {
    expect(scopeName(county)).toBe("Travis County, TX");
    expect(scopeShortName(county)).toBe("Travis County");
    expect(scopeName(state)).toBe("Texas");
    expect(scopeShortName(metro)).toBe("San Antonio, TX");
    expect(scopeCentroid(county)).toEqual({ lon: -97.78, lat: 30.33 });
    expect(scopeCentroid(state)?.lon).toBeLessThan(0);
  });
});

describe("parseComparePair", () => {
  it("parses the bare county form", () => {
    const pair = parseComparePair("48453-vs-06037");
    expect(pair).not.toBeNull();
    expect(pair?.map(scopeId)).toEqual(["county:48453", "county:06037"]);
  });

  it("parses the prefixed form", () => {
    const pair = parseComparePair("metro.41700-vs-metro.19100");
    expect(pair?.map(scopeId)).toEqual(["metro:41700", "metro:19100"]);
    expect(parseComparePair("state.tx-vs-state.ca")?.map(scopeId)).toEqual(["state:TX", "state:CA"]);
    expect(parseComparePair("county.48453-vs-state.TX")?.map(scopeId)).toEqual(["county:48453", "state:TX"]);
  });

  it("still reads the colon form, which scopeId writes and links must not", () => {
    // A colon inside a path segment never reaches the page — the router 404s
    // first — so parsing keeps accepting it for hand-built and stored ids while
    // lib/places/links.ts emits only the dot form. See the sideToken test.
    expect(parseComparePair("metro:41700-vs-metro:19100")?.map(scopeId)).toEqual(["metro:41700", "metro:19100"]);
    expect(parseComparePair("metro.41700-vs-metro:19100")?.map(scopeId)).toEqual(["metro:41700", "metro:19100"]);
  });

  it("refuses a self-pair, a bad side and a malformed pair", () => {
    expect(parseComparePair("48453-vs-48453")).toBeNull();
    expect(parseComparePair("state.tx-vs-state.TX")).toBeNull();
    expect(parseComparePair("48453-vs-99999")).toBeNull();
    expect(parseComparePair("metro.99999-vs-metro.41700")).toBeNull();
    expect(parseComparePair("48453")).toBeNull();
    expect(parseComparePair("48453-vs-06037-vs-36061")).toBeNull();
    expect(parseComparePair("port.1401-vs-48453")).toBeNull();
    expect(parseComparePair(undefined)).toBeNull();
  });
});
