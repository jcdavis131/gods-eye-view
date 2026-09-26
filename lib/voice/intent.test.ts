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
