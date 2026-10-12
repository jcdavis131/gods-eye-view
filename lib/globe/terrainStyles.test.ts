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
