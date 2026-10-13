// How the picture layers' tiles are specified: height gates, keys and the
// hosts they load from (each host must be a DIRECT_SOURCES entry, which the
// CSP test walks). Pure specs; nothing is drawn.
import { describe, expect, it } from "vitest";
import { inHeightGate } from "./tiles";
import { TILE_Z, WETLANDS_PICTURE } from "./terrainStyles";
import { wetlandsStyle } from "./landStyles";
import { DIRECT_SOURCES } from "@/lib/terrain/products";
import { WETLANDS_MAX_HEIGHT_M } from "@/lib/layers/wetlands";

const hosts = () => new Set(DIRECT_SOURCES.map((d) => d.host));

describe("wetlands raster", () => {
  it("draws only above the height where the clickable polygons stop loading", () => {
    expect(WETLANDS_PICTURE.minHeight).toBe(WETLANDS_MAX_HEIGHT_M);
    expect(WETLANDS_PICTURE.maxHeight).toBeUndefined();
    expect(inHeightGate(WETLANDS_PICTURE, 9_000)).toBe(false);
    expect(inHeightGate(WETLANDS_PICTURE, 50_000)).toBe(true);
    expect(wetlandsStyle.tiles?.({})).toEqual([WETLANDS_PICTURE]);
  });

  it("is a class raster at about 100 m, under the hazard pictures, from a registered host", () => {
    expect(WETLANDS_PICTURE.nearest).toBe(true);
    expect(WETLANDS_PICTURE.maximumLevel).toBe(11);
    expect(WETLANDS_PICTURE.z).toBe(TILE_Z.wetlands);
    expect(hosts().has(new URL(WETLANDS_PICTURE.url.replace(/\{\w+\}/g, "0")).host)).toBe(true);
  });
});

describe("critical habitat", () => {
  it("draws FWS's final and proposed caches as two sparse pictures, to level 14, from a registered host", async () => {
    const { crithabStyle } = await import("./terrainStyles");
    const specs = crithabStyle.tiles?.({}) ?? [];
    expect(specs.map((s) => s.key)).toEqual(["crithab:final", "crithab:proposed"]);
    for (const s of specs) {
      expect(s.sparse).toBe(true);
      expect(s.maximumLevel).toBe(14);
      expect(s.maxHeight).toBeUndefined();
      expect(hosts().has(new URL(s.url.replace(/\{\w+\}/g, "0")).host)).toBe(true);
    }
    expect(specs[1].url).toContain("usfws_critical_habitat_proposed");
  });
});

describe("historic imagery", () => {
  it("draws nothing until the release index answered, then the release in the meta, keyed by it", async () => {
    const { waybackStyle } = await import("./terrainStyles");
    expect(waybackStyle.tiles?.({})).toBeNull();
    const a = waybackStyle.tiles?.({ meta: { waybackRelease: 63116, waybackDate: "2026-09-24" } }) ?? [];
    const b = waybackStyle.tiles?.({ meta: { waybackRelease: 23001, waybackDate: "2020-01-08" } }) ?? [];
    expect(a[0].key).toBe("wayback:63116");
    expect(b[0].key).toBe("wayback:23001");
    expect(a[0].url).toContain("/tile/63116/{z}/{y}/{x}");
    expect(a[0]).toMatchObject({ maximumLevel: 19, sparse: true });
    expect(a[0].credit).toContain("Esri, Vantor, Earthstar Geographics, and the GIS User Community");
    expect(hosts().has(new URL(a[0].url.replace(/\{\w+\}/g, "0")).host)).toBe(true);
  });
});

describe("historic topo maps", () => {
  it("draws nothing until an edition is resolved, then that edition, keyed by it, from level 11 to 16", async () => {
    const { topoStyle } = await import("./terrainStyles");
    expect(topoStyle.tiles?.({})).toBeNull();
    expect(topoStyle.tiles?.({ meta: { topoYear: 1700 } })).toBeNull();
    const a = topoStyle.tiles?.({ meta: { topoYear: 1895 } }) ?? [];
    const b = topoStyle.tiles?.({ meta: { topoYear: 1956 } }) ?? [];
    expect(a[0].key).toBe("topo:1895");
    expect(b[0].key).toBe("topo:1956");
    expect(a[0].url).toContain("DateCurrent%3D1895");
    expect(a[0]).toMatchObject({ floorLevel: 11, maximumLevel: 16, alpha: 1 });
    expect(a[0].sparse).toBeUndefined();
    expect(a[0].z).toBeGreaterThan(TILE_Z.wayback);
    expect(a[0].z).toBeLessThan(TILE_Z.relief);
    expect(a[0].credit).toContain("Historical Topographic Map Collection courtesy of the U.S. Geological Survey, Esri");
    expect(hosts().has(new URL(a[0].url.replace(/\{\w+\}/g, "0")).host)).toBe(true);
  });
});
