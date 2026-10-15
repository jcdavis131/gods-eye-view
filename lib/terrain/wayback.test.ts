// Esri's Wayback release index, from a trimmed copy of waybackconfig.json
// captured 2026-10-12 (five real entries of 197, unmodified).
import { describe, expect, it } from "vitest";
import config from "./fixtures/wayback-config-trimmed.json";
import { parseReleaseId, parseWaybackConfig, releasesByYear, resolveRelease, waybackTiles, WAYBACK_HOST } from "./wayback";

describe("the Wayback release index", () => {
  it("reads each release's date from its title, newest first", () => {
    expect(parseWaybackConfig(config)).toEqual([
      { release: 63116, date: "2026-09-24" },
      { release: 26334, date: "2026-08-05" },
      { release: 23001, date: "2020-01-08" },
      { release: 4230, date: "2014-03-26" },
      { release: 10, date: "2014-02-20" },
    ]);
  });

  it("drops an entry whose title carries no date or whose key is not a release number, never guessing", () => {
    const c = config as unknown as Record<string, { itemTitle: string }>;
    const edited = { ...c, "26334": { ...c["26334"], itemTitle: "World Imagery" }, latest: c["63116"] };
    expect(parseWaybackConfig(edited).map((r) => r.release)).toEqual([63116, 23001, 4230, 10]);
    expect(parseWaybackConfig(null)).toEqual([]);
    expect(parseWaybackConfig([])).toEqual([]);
  });

  it("draws the release asked for, or the newest, saying when a link's release is not listed", () => {
    const list = parseWaybackConfig(config);
    expect(resolveRelease(list, null)).toEqual({ release: { release: 63116, date: "2026-09-24" }, fallback: false });
    expect(resolveRelease(list, 23001)).toEqual({ release: { release: 23001, date: "2020-01-08" }, fallback: false });
    expect(resolveRelease(list, 999)).toEqual({ release: { release: 63116, date: "2026-09-24" }, fallback: true });
    expect(resolveRelease([], 23001)).toEqual({ release: null, fallback: false });
    expect(parseReleaseId("63116")).toBe(63116);
    expect(parseReleaseId("6311.6")).toBeNull();
  });

  it("groups the picker by year and builds Esri's own tile path", () => {
    expect(releasesByYear(parseWaybackConfig(config)).map((g) => [g.year, g.releases.length])).toEqual([["2026", 2], ["2020", 1], ["2014", 2]]);
    expect(waybackTiles(63116)).toBe(`https://${WAYBACK_HOST}/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/63116/{z}/{y}/{x}`);
  });
});
