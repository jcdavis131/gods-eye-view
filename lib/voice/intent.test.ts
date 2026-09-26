import { describe, expect, it } from "vitest";
import { parseIntent } from "./intent";
import { resolveLayer } from "./commands";

const layerOf = (text: string) => parseIntent(text)?.args as { layer?: string; on?: boolean; place?: string } | undefined;

describe("voice words for the hazards and land layers", () => {
  it("hears each layer by its plain names", () => {
    expect(layerOf("show me wildfires")).toMatchObject({ layer: "wildfire", on: true });
    expect(layerOf("show active fires")).toMatchObject({ layer: "fires" });
    expect(layerOf("show hotspots")).toMatchObject({ layer: "fires" });
    expect(layerOf("show hazard alerts")).toMatchObject({ layer: "hazards" });
    expect(layerOf("show volcanoes")).toMatchObject({ layer: "hazards" });
    expect(layerOf("show flood zones over Houston")).toMatchObject({ layer: "flood", place: "houston" });
    expect(layerOf("hide wetlands")).toMatchObject({ layer: "wetlands", on: false });
    expect(layerOf("show public lands")).toMatchObject({ layer: "publiclands" });
  });

  it("keeps warnings with Live warnings, whose id is alerts, and floods with surface water", () => {
    expect(layerOf("show live warnings")).toMatchObject({ layer: "alerts" });
    expect(layerOf("show warnings")).toMatchObject({ layer: "alerts" });
    expect(layerOf("show alerts")).toMatchObject({ layer: "alerts" });
    expect(resolveLayer("alerts")).toBe("alerts");
    expect(layerOf("show floods")).toMatchObject({ layer: "water" });
  });
});

describe("voice words for the terrain & soils layers", () => {
  it("hears each picture layer by its plain names, before the fire and flood words they share", () => {
    expect(layerOf("show wildfire hazard")).toMatchObject({ layer: "firehazard", on: true });
    expect(layerOf("show fire hazard over colorado springs")).toMatchObject({ layer: "firehazard", place: "colorado springs" });
    expect(layerOf("show wildfires")).toMatchObject({ layer: "wildfire" });
    expect(layerOf("show sea level rise over galveston")).toMatchObject({ layer: "sealevel", place: "galveston" });
    expect(layerOf("show hillshade")).toMatchObject({ layer: "relief" });
    expect(layerOf("show contour lines")).toMatchObject({ layer: "contours" });
    expect(layerOf("hide soils")).toMatchObject({ layer: "soils", on: false });
    expect(layerOf("show land cover")).toMatchObject({ layer: "landcover" });
    expect(layerOf("show slope")).toMatchObject({ layer: "slope" });
    expect(resolveLayer("nlcd")).toBe("landcover");
  });
});
