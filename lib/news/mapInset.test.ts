import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atlasPermalink, ESRI_IMAGERY_CREDIT, ESRI_IMAGERY_URL, insetView, TILE_PX, tilesFor, worldPx } from "./mapInset";

describe("imagery constants", () => {
  it("match the globe's own (lib/globe/imagery.ts imports Cesium, so they are copied)", () => {
    const src = readFileSync(path.join(__dirname, "../globe/imagery.ts"), "utf8");
    expect(src).toContain(`"${ESRI_IMAGERY_URL}"`);
    expect(src).toContain(`"${ESRI_IMAGERY_CREDIT}"`);
  });
});

describe("tile math", () => {
  it("puts lon/lat on the Web Mercator world", () => {
    expect(worldPx(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const ne = worldPx(180, 85.05112878, 1);
    expect(ne.x).toBeCloseTo(512, 6);
    expect(ne.y).toBeCloseTo(0, 3);
    // Latitude beyond the projection's edge is clamped, not NaN.
    expect(Number.isFinite(worldPx(10, 89.9, 3).y)).toBe(true);
  });

  it("covers the view with tiles centred on the point", () => {
    const tiles = tilesFor(-98.49, 29.42, 6, 400, 240);
    const c = worldPx(-98.49, 29.42, 6);
    for (const t of tiles) {
      const [z, ty, tx] = t.key.split("/").map(Number);
      expect(z).toBe(6);
      expect(t.left).toBe(Math.round(tx * TILE_PX - (c.x - 200)));
      expect(t.top).toBe(Math.round(ty * TILE_PX - (c.y - 120)));
      expect(t.url).toBe(`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/${ty}/${tx}`);
    }
    // Every pixel of the view is under a tile.
    for (const [x, y] of [[0, 0], [399, 0], [0, 239], [399, 239], [200, 120]]) {
      expect(tiles.some((t) => x >= t.left && x < t.left + TILE_PX && y >= t.top && y < t.top + TILE_PX)).toBe(true);
    }
  });

  it("wraps across the antimeridian and never asks for a row off the map", () => {
    const tiles = tilesFor(179.9, 0, 2, 600, 2000);
    for (const t of tiles) {
      const m = /tile\/2\/(\d+)\/(\d+)$/.exec(t.url)!;
      expect(Number(m[1])).toBeGreaterThanOrEqual(0);
      expect(Number(m[1])).toBeLessThan(4);
      expect(Number(m[2])).toBeGreaterThanOrEqual(0);
      expect(Number(m[2])).toBeLessThan(4);
    }
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });
});

describe("insetView and the Atlas link", () => {
  it("looks at the first fact with a place and links the globe there with its layer on", () => {
    const v = insetView([
      { kind: "alert-count", place: null },
      { kind: "quake", place: { name: "92 km NNW of Aleneva, Alaska", lat: 58.80213, lon: -153.60912 } },
      { kind: "wildfire", place: { name: "elsewhere", lat: 1, lon: 2 } },
    ]);
    expect(v.place?.name).toBe("92 km NNW of Aleneva, Alaska");
    expect(v.kind).toBe("quake");
    expect(v.zoom).toBe(5);
    expect(v.href).toBe("/?lat=58.8021&lon=-153.6091&h=900000&layers=earthquakes");
  });
  it("frames each placed kind with the layer that draws it", () => {
    const p = { name: "x", lat: 10, lon: 20 };
    expect(insetView([{ kind: "wildfire", place: p }]).href).toContain("layers=wildfire");
    expect(insetView([{ kind: "alert", place: p }]).href).toContain("layers=alerts");
    expect(insetView([{ kind: "launch", place: p }]).href).toContain("layers=launches");
    expect(insetView([{ kind: "weather", place: p }]).href).toContain("layers=weather");
  });
  it("falls back to the world view and the globe's home when nothing has a place", () => {
    expect(insetView([{ kind: "indicator", place: null }])).toMatchObject({ place: null, zoom: 1, href: "/" });
    expect(insetView([])).toMatchObject({ place: null, href: "/" });
  });
  it("writes the share.ts parameters the globe reads", () => {
    expect(atlasPermalink({ lat: 29.123456, lon: -98.5, h: 60000.4 })).toBe("/?lat=29.1235&lon=-98.5000&h=60000");
    expect(atlasPermalink({ lat: 0, lon: 0, layers: ["earthquakes", "alerts"] })).toBe("/?lat=0.0000&lon=0.0000&layers=earthquakes%2Calerts");
  });
});
