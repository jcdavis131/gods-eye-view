import { describe, expect, it } from "vitest";
import { parseIntent } from "./intent";
import { resolveLayer } from "./commands";
import { AIRNOW_ENABLED } from "@/lib/air/airnow";

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

describe("voice words for the civic layers", () => {
  it("hears zoning, and zoning districts before the constructs' districts", () => {
    expect(layerOf("show zoning")).toMatchObject({ layer: "zoning", on: true });
    expect(layerOf("show zoning districts over Seattle")).toMatchObject({ layer: "zoning", place: "seattle" });
    expect(layerOf("show the zoning map")).toMatchObject({ layer: "zoning" });
    expect(layerOf("show districts")).toMatchObject({ layer: "constructs" });
  });
  it("hears building permits, licences and environmental permits apart", () => {
    expect(layerOf("show building permits in Chicago")).toMatchObject({ layer: "permits", place: "chicago" });
    expect(layerOf("show permits")).toMatchObject({ layer: "permits" });
    expect(layerOf("show environmental permits")).toMatchObject({ layer: "envpermits" });
    expect(layerOf("show army corps permits")).toMatchObject({ layer: "envpermits" });
    expect(layerOf("show business licenses")).toMatchObject({ layer: "licences" });
    expect(layerOf("hide liquor licences")).toMatchObject({ layer: "licences", on: false });
  });
});

describe("voice words for parcels", () => {
  it("hears parcels by their plain names without taking 'property' from home values", () => {
    expect(layerOf("show parcels")).toMatchObject({ layer: "parcels", on: true });
    expect(layerOf("show property lines over Austin")).toMatchObject({ layer: "parcels", place: "austin" });
    expect(layerOf("show lot lines")).toMatchObject({ layer: "parcels" });
    expect(layerOf("hide tax parcels")).toMatchObject({ layer: "parcels", on: false });
    expect(layerOf("show property values")).toMatchObject({ layer: "realestate" });
    expect(layerOf("show property")).toMatchObject({ layer: "realestate" });
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

describe("voice words for the infrastructure and geohazard layers", () => {
  it("hears each layer by its plain names", () => {
    expect(layerOf("show transmission lines")).toMatchObject({ layer: "transmission", on: true });
    expect(layerOf("show power lines over austin")).toMatchObject({ layer: "transmission", place: "austin" });
    expect(layerOf("show pipelines")).toMatchObject({ layer: "pipelines" });
    expect(layerOf("show power plants")).toMatchObject({ layer: "plants" });
    expect(layerOf("show nuclear plants")).toMatchObject({ layer: "plants" });
    expect(layerOf("show railroads")).toMatchObject({ layer: "rail" });
    expect(layerOf("show airports")).toMatchObject({ layer: "airports" });
    expect(layerOf("hide dams")).toMatchObject({ layer: "dams", on: false });
    expect(layerOf("show fault lines")).toMatchObject({ layer: "faults" });
    expect(layerOf("show landslides")).toMatchObject({ layer: "landslides" });
    expect(layerOf("show geology")).toMatchObject({ layer: "geology" });
    expect(layerOf("show townships")).toMatchObject({ layer: "plss" });
    // Air quality resolves only while AirNow is turned on (lib/air/airnow.ts).
    if (AIRNOW_ENABLED) expect(layerOf("show air quality over denver")).toMatchObject({ layer: "airquality", place: "denver" });
    else expect(layerOf("show air quality over denver")?.layer ?? null).toBeNull();
    expect(layerOf("show news events")).toMatchObject({ layer: "events" });
  });

  it("does not take words other layers own", () => {
    expect(layerOf("show planes")).toMatchObject({ layer: "aircraft" });
    expect(layerOf("show reservoirs")).toMatchObject({ layer: "water" });
    expect(layerOf("show wildfires")).toMatchObject({ layer: "wildfire" });
    expect(resolveLayer("dams")).toBe("dams");
  });
});
