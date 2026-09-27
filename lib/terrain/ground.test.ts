import { describe, expect, it } from "vitest";
import clayPoint from "./fixtures/sda-saclay-point.json";
import clayMapunit from "./fixtures/sda-saclay-mapunit.json";
import whpNw from "./fixtures/whp-identify-nw.json";
import { groundClickWanted, groundDetails, groundFeature, groundId, isGroundSelection, partsFor } from "./ground";
import { parseComponents, parseSoilPoint, soilAnswer } from "./soil";
import { parseWhpIdentify } from "./classes";

describe("which ground questions a click asks", () => {
  it("asks only the layers that are on, each once, elevation for relief and contours together", () => {
    expect(partsFor({})).toEqual([]);
    expect(partsFor({ soils: true, aircraft: true })).toEqual(["soils"]);
    expect(partsFor({ relief: true, contours: true, landcover: true })).toEqual(["landcover", "elevation"]);
  });

  it("only below 150 km and only with a ground layer on, so a click from orbit still deselects", () => {
    expect(groundClickWanted({ soils: true }, 20_000)).toBe(true);
    expect(groundClickWanted({ soils: true }, 2_000_000)).toBe(false);
    expect(groundClickWanted({ flood: true, water: true }, 2_000)).toBe(false);
  });
});

describe("the ground dossier", () => {
  const soil = soilAnswer(parseSoilPoint(clayPoint)!, parseComponents(clayMapunit));

  it("reads the soil, the class and the point as published", () => {
    const d = groundDetails({
      lon: -98.45,
      lat: 29.28,
      parts: { soils: { loading: false, data: soil }, firehazard: { loading: false, data: parseWhpIdentify(whpNw) } },
    });
    expect(d["soil map unit"]).toBe("San Antonio clay loam, 1 to 3 percent slopes (SaB)");
    expect(d["farmland class (NRCS)"]).toBe("All areas are prime farmland");
    expect(d["NCCPI (main soil, 0 to 1)"]).toBe("0.455 (Moderate inherent productivity)");
    expect(d["main soil"]).toBe("San Antonio, 100 % of the map unit");
    expect(d["soil survey"]).toBe("Bexar County, Texas, saved 9/4/2025 2:58:52 PM");
    expect(d["wildfire hazard potential"]).toBe("Low (class 2 of WHP 2023)");
    expect(d.point).toBe("29.28000, -98.45000");
  });

  it("says what is loading, what failed and what the source has no value for, never a number it did not send", () => {
    const d = groundDetails({
      lon: -40,
      lat: 30,
      parts: {
        soils: { loading: false, data: null },
        landcover: { loading: true },
        slope: { loading: false, error: "3dep 503" },
        elevation: { loading: false, data: { note: "EPQS returned no value" } },
        firehazard: { loading: false, data: null },
      },
    });
    expect(d["soil map unit"]).toMatch(/none mapped here/);
    expect(d["land cover"]).toMatch(/^asking MRLC/);
    expect(d.slope).toMatch(/did not answer: 3dep 503/);
    expect(d["ground elevation"]).toMatch(/no 3DEP value/);
    expect(d["wildfire hazard potential"]).toMatch(/no class here/);
  });

  it("is a point feature on the first layer asked, named after the soil when there is one, and travels as its point", () => {
    const f = groundFeature({ lon: -98.45, lat: 29.28, seq: 1, layer: "soils", parts: { soils: { loading: false, data: soil } } });
    expect(f.geometry).toEqual({ type: "Point", coordinates: [-98.45, 29.28] });
    expect(f.properties).toMatchObject({ id: groundId(-98.45, 29.28), layer: "soils", kind: "ground", name: "Ground here · San Antonio clay loam, 1 to 3 percent slopes", source: "NRCS SSURGO" });
    expect(isGroundSelection({ id: f.properties.id })).toBe(true);
    expect(isGroundSelection({ id: "nfhl:48029C:0" })).toBe(false);
  });
});

describe("the geology part of the ground dossier", () => {
  it("asks Macrostrat when the Geology picture is on", () => {
    expect(partsFor({ geology: true })).toEqual(["geology"]);
    expect(groundClickWanted({ geology: true }, 20_000)).toBe(true);
  });

  it("reads the most detailed unit with its age, lithology and map, and names the coarser ones", async () => {
    const { parseMacrostrat } = await import("@/lib/infra/geology");
    const pikes = (await import("@/lib/infra/fixtures/macrostrat-pikes-peak.json")).default;
    const d = groundDetails({ lon: -104.95, lat: 38.85, parts: { geology: { loading: false, data: parseMacrostrat(pikes) } } });
    expect(d["geologic unit"]).toBe("Rocks of Pikes Peak Batholith (1000-m.y. age group)");
    expect(d["geologic age"]).toBe("Mesoproterozoic (1,000 to 1,600 million years)");
    expect(d["geologic map"]).toMatch(/State Geologic Map Compilation/);
    expect(d["on coarser maps"]).toBe("Mesoproterozoic plutonic: granite; Paleoproterozoic crystalline metamorphic rocks");
  });

  it("says when there is no unit, and when Macrostrat did not answer", async () => {
    const { parseMacrostrat } = await import("@/lib/infra/geology");
    const empty = (await import("@/lib/infra/fixtures/macrostrat-empty.json")).default;
    expect(groundDetails({ lon: -150, lat: 0, parts: { geology: { loading: false, data: parseMacrostrat(empty) } } }).geology).toMatch(/no mapped unit/);
    expect(groundDetails({ lon: 0, lat: 0, parts: { geology: { loading: false, error: "macrostrat 502" } } }).geology).toMatch(/did not answer: macrostrat 502/);
  });
});
