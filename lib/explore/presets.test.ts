import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYER_IDS } from "@/lib/layers/types";
import { PRESETS, PRESET_GROUPS, presetShare, presetTarget, type Preset } from "./presets";

describe("Explore presets", () => {
  it("have unique ids and real layers, and every one sits in a gallery group", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    const layers = new Set<string>(LAYER_IDS);
    for (const p of PRESETS) for (const l of p.layers) expect(layers.has(l), `${p.id} ${l}`).toBe(true);
    expect(PRESET_GROUPS.flatMap((g) => g.presets)).toHaveLength(PRESETS.length);
    expect(PRESET_GROUPS.find((g) => g.title === "Hazards & land")?.presets.map((p) => p.id)).toEqual([
      "largest-fire",
      "hazards-world",
      "sa-floodplain",
      "mitchell-lake",
      "government-canyon",
    ]);
    expect(PRESET_GROUPS.find((g) => g.title === "Terrain & soils")?.presets.map((p) => p.id)).toEqual([
      "brackenridge-contours",
      "bexar-soils",
      "front-range-whp",
      "galveston-slr",
    ]);
    expect(PRESET_GROUPS.find((g) => g.title === "Infrastructure, air & events")?.presets.map((p) => p.id)).toEqual([
      "round-rock-grid",
      "ship-channel-pipelines",
      "texas-power",
      "kansas-city-rail",
      "okc-sections",
      "bay-area-faults",
      "seattle-landslides",
      "highland-lakes-dams",
      "texas-airports",
      "pikes-peak-geology",
      "la-freeway-cams",
      "us-air-quality",
      "world-events",
    ]);
  });

  it("put each infrastructure preset below the height its first layer draws at", async () => {
    const { LAYER_BY_ID } = await import("@/lib/layers");
    const { tierFor, TRANSMISSION_TIERS, PIPELINE_TIERS, PLANT_TIERS, RAIL_TIERS, PLSS_TIERS, FAULT_TIERS, LANDSLIDE_TIERS, DAM_TIERS, AIRPORT_TIERS } = await import("@/lib/layers/infra");
    const tiers: Record<string, Parameters<typeof tierFor>[0]> = {
      transmission: TRANSMISSION_TIERS,
      pipelines: PIPELINE_TIERS,
      plants: PLANT_TIERS,
      rail: RAIL_TIERS,
      plss: PLSS_TIERS,
      faults: FAULT_TIERS,
      landslides: LANDSLIDE_TIERS,
      dams: DAM_TIERS,
      airports: AIRPORT_TIERS,
    };
    for (const p of PRESETS.filter((x) => x.group === "infrastructure")) {
      const first = p.layers[0];
      expect(LAYER_BY_ID[first], p.id).toBeDefined();
      if (tiers[first]) expect(tierFor(tiers[first], p.height), `${p.id} at ${p.height} m`).not.toBeNull();
    }
    expect(presetShare(PRESETS.find((p) => p.id === "pikes-peak-geology")!).ground).toEqual({ lon: -104.95, lat: 38.85 });
  });

  it("carry a terrain preset's ground point, terrain and scenario into its link", () => {
    const soils = presetShare(PRESETS.find((p) => p.id === "bexar-soils")!);
    expect(soils.ground).toEqual({ lon: -98.45, lat: 29.28 });
    expect(soils.layers).toContain("soils");
    expect(presetShare(PRESETS.find((p) => p.id === "front-range-whp")!).terrain).toBe(1.5);
    expect(presetShare(PRESETS.find((p) => p.id === "galveston-slr")!).slr).toBe(3);
  });
});

describe("presetTarget", () => {
  const fixed: Preset = { id: "t", title: "T", region: "R", blurb: "", lon: 1, lat: 2, height: 3000, layers: ["wildfire"] };
  afterEach(() => vi.unstubAllGlobals());

  it("is the fixed place for a preset that does not move", async () => {
    expect(await presetTarget(fixed)).toEqual(presetShare(fixed));
  });

  it("goes where a moving preset resolves to, and falls back to the fixed place when it cannot", async () => {
    const moving = { ...fixed, resolve: async () => ({ lon: 10, lat: 20, sel: { layer: "wildfire" as const, id: "wfigs:X" } }) };
    expect(await presetTarget(moving)).toMatchObject({ lon: 10, lat: 20, h: 3000, layers: ["wildfire"], sel: { layer: "wildfire", id: "wfigs:X" } });
    expect(await presetTarget({ ...fixed, resolve: async () => null })).toEqual(presetShare(fixed));
    expect(await presetTarget({ ...fixed, resolve: () => Promise.reject(new Error("down")) })).toEqual(presetShare(fixed));
  });

  it("resolves the largest fire to the WFIGS wildfire perimeter with the most acres, never a prescribed burn", async () => {
    const perim = (id: string, type: string, acres: number, lon: number, anchor?: [number, number]) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[lon, 40], [lon + 0.5, 40], [lon + 0.5, 40.5], [lon, 40]]] },
      properties: { id, layer: "wildfire", name: id, source: "NIFC WFIGS", anchor, extra: { type, acres, hasPerimeter: true } },
    });
    const features = [perim("rx", "RX", 90_000, -110), perim("big", "WF", 50_000, -120, [-119.8, 40.2]), perim("small", "WF", 900, -115)];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { type: "FeatureCollection", features } }), { status: 200 })));
    const p = PRESETS.find((x) => x.id === "largest-fire")!;
    const s = await presetTarget(p);
    expect(s.sel).toEqual({ layer: "wildfire", id: "big" });
    expect([s.lon, s.lat]).toEqual([-119.8, 40.2]);
    expect(s.layers).toEqual(p.layers);
  });
});
