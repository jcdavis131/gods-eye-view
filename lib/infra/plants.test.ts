// Power plants from the bundled snapshots (EIA-860M August 2026, Wikidata
// pulled 2026-09-26): what a box returns, what a planned-only plant says, and
// that the reporting entity never reaches a name or the search allowlist.

import { describe, expect, it } from "vitest";
import { searchableDetail } from "@/lib/search/allowlist";
import eiaJson from "./data/plants-eia860m.json";
import wdJson from "./data/nuclear-wikidata.json";
import { eiaPlants, fuelFamily, wikidataNuclear, type EiaSnapshot, type PlantExtra, type WikidataSnapshot } from "./plants";

const eia = eiaJson as unknown as EiaSnapshot;
const wd = wdJson as unknown as WikidataSnapshot;
const SA: [number, number, number, number] = [-98.8, 29.2, -98.3, 29.6];

describe("EIA-860M plants", () => {
  const sa = eiaPlants(eia, SA);
  it("returns every plant in the box, planned ones included", () => {
    expect(sa).toHaveLength(24);
    expect(sa.filter((f) => f.properties.kind === "planned")).toHaveLength(3);
  });
  it("sums a plant's nameplate MW as EIA lists it, with the reporting entity in the dossier only", () => {
    const b = sa.find((f) => f.properties.name === "V H Braunig")!;
    expect(b.properties.id).toBe("eia:3612");
    expect((b.properties.extra as PlantExtra).mw).toBe(1138);
    expect(b.properties.details?.["operating capacity"]).toBe("1,138 MW nameplate");
    expect(b.properties.details?.["reporting entity (EIA)"]).toBe("City of San Antonio - (TX)");
    expect(b.properties.name).not.toContain("City of San Antonio");
    expect(searchableDetail("reporting entity (EIA)")).toBe(false);
    expect(searchableDetail("EIA plant id")).toBe(true);
  });
  it("gives a planned-only plant no operating capacity and says so", () => {
    const planned = eiaPlants(eia, [-85.4, 34.2, -85.3, 34.3]).find((f) => f.properties.id === "eia:708")!;
    expect(planned.properties.kind).toBe("planned");
    expect((planned.properties.extra as PlantExtra).mw).toBeUndefined();
    expect(planned.properties.details?.["operating capacity"]).toBe("none yet (planned)");
    expect(planned.properties.details?.["planned capacity"]).toBe("57.5 MW nameplate");
  });
  it("applies a size floor to operating or planned capacity", () => {
    expect(eiaPlants(eia, SA, 500).map((f) => f.properties.name).sort()).toEqual(["Arthur Von Rosenberg", "J K Spruce", "O W Sommers", "V H Braunig"]);
  });
  it("counts a generator with no nameplate value without adding it as 0 MW", () => {
    const row = JSON.parse(JSON.stringify(eia.plants.find((r) => r[0] === 3612)));
    // The same plant with one more generator of that technology that EIA listed with no nameplate value.
    row[10][0][2] += 1;
    row[10][0][3] = 1;
    const [f] = eiaPlants({ ...eia, plants: [row] }, SA);
    expect((f.properties.extra as PlantExtra).mw).toBe(1138);
    expect(String(f.properties.details?.["operating generators"])).toContain("1 with no nameplate value");
  });
  it("names the colour family from the technology EIA publishes", () => {
    expect(fuelFamily("Nuclear")).toBe("nuclear");
    expect(fuelFamily("Hydroelectric Pumped Storage")).toBe("storage");
    expect(fuelFamily("Natural Gas Fired Combined Cycle")).toBe("gas");
    expect(fuelFamily("Petroleum Liquids")).toBe("oil");
    expect(fuelFamily("Solar Photovoltaic")).toBe("solar");
    expect(fuelFamily(undefined)).toBe("other");
  });
});

describe("Wikidata nuclear plants", () => {
  it("leaves out plants in the United States, which EIA covers", () => {
    expect(wd.plants.length).toBe(286);
    expect(wd.plants.some((p) => /United States/.test(p[4] ?? ""))).toBe(false);
  });
  it("shows status and capacity only where Wikidata has them", () => {
    const [z] = wikidataNuclear(wd, [34, 47, 35, 48]);
    expect(z.properties.name).toBe("Zaporizhzhia Nuclear Power Plant");
    expect(z.properties.details?.status).toBe("in partial operation");
    expect(z.properties.details?.["nameplate capacity"]).toBe("5,700 MW");
    const none = wd.plants.find((p) => p[5].length === 0)!;
    const [f] = wikidataNuclear(wd, [none[2] - 0.01, none[3] - 0.01, none[2] + 0.01, none[3] + 0.01]).filter((x) => x.properties.id === `wd:${none[0]}`);
    expect(f.properties.details?.status).toBe("not recorded in Wikidata");
  });
});
