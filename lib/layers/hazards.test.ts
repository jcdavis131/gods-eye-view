import { describe, expect, it } from "vitest";
import type { LayerFeature } from "./types";
import type { HazardAlertExtra } from "@/lib/hazards/features";
import { hazardsLayer, stepAside } from "./hazards";

const feature = (id: string, extra: HazardAlertExtra): LayerFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { id, layer: "hazards", name: id, source: extra.source, extra },
});

const ALL = [
  feature("nws-extreme", { source: "NWS", severity: "Extreme", event: "Tornado Warning", drawnAs: "polygon" }),
  feature("nws-severe", { source: "NWS", severity: "Severe", event: "Flash Flood Warning", drawnAs: "counties" }),
  feature("nws-moderate", { source: "NWS", severity: "Moderate", event: "Flood Watch", drawnAs: "polygon" }),
  feature("nws-minor", { source: "NWS", severity: "Minor", event: "Frost Advisory", drawnAs: "polygon" }),
  feature("nws-unrated", { source: "NWS", event: "Special Weather Statement", drawnAs: "polygon" }),
  feature("gdacs-green-dup", { source: "GDACS", severity: "Green", event: "earthquake", drawnAs: "point", alsoInUsgs: true }),
  feature("gdacs-orange-dup", { source: "GDACS", severity: "Orange", event: "earthquake", drawnAs: "point", alsoInUsgs: true }),
  feature("gdacs-red-flood", { source: "GDACS", severity: "Red", event: "flood", drawnAs: "point" }),
  feature("eonet", { source: "EONET", event: "volcano", drawnAs: "point" }),
];
const ids = (fs: LayerFeature[]) => fs.map((f) => f.properties.id);

describe("hazards stepping aside for overlapping layers", () => {
  it("draws everything while Earthquakes and Live warnings are both off", () => {
    const r = stepAside(ALL, { earthquakes: false, alerts: false });
    expect(r.features).toHaveLength(ALL.length);
    expect(r.quakesHidden + r.leftToLive).toBe(0);
    expect(stepAside(ALL, undefined).features).toHaveLength(ALL.length);
  });

  it("leaves only Severe and Extreme NWS alerts to Live warnings, never an unrated or lower one", () => {
    const r = stepAside(ALL, { alerts: true });
    expect(r.leftToLive).toBe(2);
    expect(ids(r.features)).not.toContain("nws-extreme");
    expect(ids(r.features)).not.toContain("nws-severe");
    expect(ids(r.features)).toEqual(expect.arrayContaining(["nws-moderate", "nws-minor", "nws-unrated", "gdacs-red-flood", "eonet"]));
  });

  it("leaves only Green GDACS quakes USGS also has to Earthquakes", () => {
    const r = stepAside(ALL, { earthquakes: true });
    expect(r.quakesHidden).toBe(1);
    expect(ids(r.features)).not.toContain("gdacs-green-dup");
    expect(ids(r.features)).toContain("gdacs-orange-dup");
  });

  it("partitions: what is kept and what is left add back up to the whole", () => {
    const r = stepAside(ALL, { earthquakes: true, alerts: true });
    expect(r.features.length + r.quakesHidden + r.leftToLive).toBe(ALL.length);
  });

  it("re-runs when either overlapping layer is toggled", () => {
    expect(hazardsLayer.dependsOn).toEqual(["earthquakes", "alerts"]);
  });
});
