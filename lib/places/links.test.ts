import { describe, expect, it } from "vitest";
import { MANIFEST, countyByFips, type CountyRef } from "./registry";
import { parseComparePair, parseCountyParam, parseMetroParam, parseStateParam, type PlaceScope } from "./scope";
import { SAME_STATE_MAX, graphCompleteness, linksFor, type LinkSets, type PlaceLink } from "./links";

// The seed manifest carries no adjacency and no CBSA membership, so the two
// groups that need the network pull are exercised through a scope whose ref
// is hand-built - exactly the shape countyByFips will return once
// scripts/places-data.mjs has run against a host with egress. Every geoid
// used is a real county the seed already names, so the links resolve.
function withRef(fips: string, extra: Partial<CountyRef>): PlaceScope {
  const base = countyByFips(fips);
  if (!base) throw new Error(`${fips} is missing from the seed manifest`);
  return { kind: "county", id: fips, ref: { ...base, ...extra }, provisional: false };
}

const travis = () => withRef("48453", { cbsa: "12420", adj: ["48491"] });

function allLinks(l: LinkSets): PlaceLink[] {
  return [...l.up, ...l.neighbours, ...l.sameState, ...l.sameMetro, ...l.compare, l.brief];
}

describe("linksFor, county", () => {
  it("builds a four-step breadcrumb ending at the county, every url site-relative", () => {
    const l = linksFor(travis());
    expect(l.breadcrumb.map((b) => b.name)).toEqual(["United States", "Texas", "Austin-Round Rock-San Marcos, TX", "Travis County"]);
    expect(l.breadcrumb).toHaveLength(4);
    expect(l.breadcrumb[l.breadcrumb.length - 1].url).toBe("/place/48453");
    for (const step of l.breadcrumb) expect(step.url.startsWith("/"), step.url).toBe(true);
  });

  it("links up to the metro and the state, and never emits a lens brief", () => {
    const l = linksFor(travis());
    expect(l.up.map((u) => u.href)).toContain("/metro/12420");
    expect(l.up.map((u) => u.href)).toContain("/state/TX");
    expect(l.brief.href).toBe("/place/48453/brief");
    expect(l.feeds).toEqual({ rss: "/place/48453/feed.xml", json: "/place/48453/feed.json" });
    for (const link of allLinks(l)) {
      expect(link.href.startsWith("/"), link.href).toBe(true);
      // /place/48453/brief is legal; /place/48453/brief/housing never is.
      expect(/\/brief\/[^/]+$/.test(link.href), link.href).toBe(false);
    }
  });

  it("excludes neighbours from the in-state list so no county is linked twice", () => {
    const l = linksFor(travis());
    expect(l.neighbours.map((n) => n.href)).toEqual(["/place/48491"]);
    const state = l.sameState.map((s) => s.href);
    expect(state).not.toContain("/place/48491");
    expect(state).not.toContain("/place/48453");
    expect(new Set(state).size).toBe(state.length);
  });

  it("caps the in-state list and orders it by the ranked map when one is supplied", () => {
    const ranked = new Map([
      ["48201", 2_400_000],
      ["48113", 1_700_000],
      ["48029", 900_000],
      ["48439", 1_100_000],
    ]);
    const l = linksFor(travis(), { ranked });
    expect(l.sameState.length).toBeLessThanOrEqual(SAME_STATE_MAX);
    expect(l.sameState.slice(0, 4).map((s) => s.href)).toEqual(["/place/48201", "/place/48113", "/place/48439", "/place/48029"]);
    expect(linksFor(travis(), { ranked, max: 2 }).sameState).toHaveLength(2);
  });

  it("falls back to manifest order when there is no ranking, so the block never disappears", () => {
    const l = linksFor(travis());
    expect(l.sameState.length).toBeGreaterThan(0);
    const labels = l.sameState.map((s) => s.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it("emits a compare link per neighbour that parses back through parseComparePair", () => {
    const l = linksFor(travis());
    expect(l.compare.length).toBeGreaterThan(0);
    for (const c of l.compare) {
      const pair = c.href.replace("/compare/", "");
      const parsed = parseComparePair(pair);
      expect(parsed, c.href).not.toBeNull();
      expect(parsed?.[0].id).toBe("48453");
    }
  });

  it("returns a usable block for a county the incomplete manifest cannot name", () => {
    // 48999 is structurally valid and absent from the seed: the provisional path.
    const scope = parseCountyParam("48999");
    expect(MANIFEST.countiesComplete).toBe(false);
    expect(scope?.kind === "county" && scope.provisional).toBe(true);
    const l = linksFor(scope!);
    expect(l.neighbours).toEqual([]);
    expect(l.sameMetro).toEqual([]);
    expect(l.up.length).toBeGreaterThan(0);
    expect(l.up.map((u) => u.href)).toContain("/state/TX");
    expect(l.brief.href).toBe("/place/48999/brief");
    expect(l.breadcrumb[l.breadcrumb.length - 1].url).toBe("/place/48999");
  });

  it("omits the metro and neighbour groups entirely while the manifest is a seed", () => {
    const l = linksFor(parseCountyParam("48453")!);
    expect(l.neighbours).toEqual([]);
    expect(l.sameMetro).toEqual([]);
    expect(l.sameState.length).toBeGreaterThan(0);
    expect(graphCompleteness().adjacency).toBe(false);
    expect(graphCompleteness().note).toMatch(/omitted rather than shown empty/);
  });
});

describe("linksFor, metro and state", () => {
  it("gives a metro its state, its briefs and compare pairs that parse", () => {
    const l = linksFor(parseMetroParam("12420")!);
    expect(l.breadcrumb.map((b) => b.name)).toEqual(["United States", "Texas", "Austin-Round Rock-San Marcos, TX"]);
    expect(l.up.map((u) => u.href)).toContain("/state/TX");
    expect(l.brief.href).toBe("/metro/12420/brief");
    expect(l.sameState.length).toBeGreaterThan(0);
    expect(l.sameState.length).toBeLessThanOrEqual(SAME_STATE_MAX);
    for (const c of l.compare) {
      expect(c.href.startsWith("/compare/metro.12420-vs-metro."), c.href).toBe(true);
      expect(parseComparePair(c.href.replace("/compare/", "")), c.href).not.toBeNull();
      // A colon in a path segment never reaches the page: the router 404s
      // first, so a link carrying one is dead on arrival however well it parses.
      expect(c.href.includes(":"), c.href).toBe(false);
    }
  });

  it("gives a state its counties, its metros and a two-step breadcrumb", () => {
    const l = linksFor(parseStateParam("tx")!);
    expect(l.breadcrumb).toHaveLength(2);
    expect(l.breadcrumb[1].url).toBe("/state/TX");
    expect(l.up.map((u) => u.href)).toEqual(["/state"]);
    expect(l.sameState.length).toBeGreaterThan(0);
    expect(l.sameMetro.length).toBeGreaterThan(0);
    expect(l.sameMetro.every((m) => m.href.startsWith("/metro/"))).toBe(true);
    for (const c of l.compare) expect(parseComparePair(c.href.replace("/compare/", "")), c.href).not.toBeNull();
    expect(l.feeds.rss).toBe("/state/TX/feed.xml");
  });
});
