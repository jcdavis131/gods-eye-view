import { describe, expect, it } from "vitest";
import { classify, findEndpoints, knownOutage, probeTarget } from "./endpoint-sweep.mjs";

const json = (o: unknown) => Buffer.from(JSON.stringify(o));
const PNG = Buffer.from("89504e470d0a1a0a0000", "hex");

describe("endpoint sweep", () => {
  it("finds ArcGIS services and tile templates in source text, not plain links", () => {
    const text = [
      'export const A = "https://x.gov/arcgis/rest/services/Foo/MapServer";',
      'const T = "https://t.org/carto/{z}/{x}/{y}.png";',
      "const U = `https://h.gov/a/${id}/{z}/{x}/{y}`;",
      'const L = "https://www.example.gov/about";',
    ].join("\n");
    expect(findEndpoints(text)).toEqual([
      "https://x.gov/arcgis/rest/services/Foo/MapServer",
      "https://t.org/carto/{z}/{x}/{y}.png",
      "https://h.gov/a/${id}/{z}/{x}/{y}",
    ]);
  });

  it("asks an ArcGIS service for its root (keeping a layer number) and fills tile templates", () => {
    expect(probeTarget("https://x.gov/arcgis/rest/services/Foo/FeatureServer/3/query?where=1")).toEqual({
      kind: "arcgis",
      url: "https://x.gov/arcgis/rest/services/Foo/FeatureServer/3?f=json",
    });
    expect(probeTarget("https://t.org/{z}/{x}/{y}.png")).toEqual({ kind: "tile", url: "https://t.org/6/14/24.png" });
    expect(probeTarget("https://i.gov/ImageServer/exportImage?bbox={westProjected},{southProjected},{eastProjected},{northProjected}").kind).toBe("arcgis");
    expect(probeTarget("https://h.gov/a/${id}/{z}").kind).toBeNull();
    expect(probeTarget("https://h.gov/tile/{release}/{z}/{y}/{x}")).toMatchObject({ kind: null, why: "unfilled {release}" });
    expect(probeTarget("https://developers.google.com/maps/documentation/tile/get-api-key").kind).toBeNull();
  });

  it("calls an ArcGIS error inside HTTP 200 dead (the Wetlands_Raster_v5 case)", () => {
    const v5 = json({ error: { code: 404, message: "Service not found", details: [] } });
    expect(classify("arcgis", 200, "application/json", v5)).toMatchObject({ verdict: "DEAD" });
    expect(classify("arcgis", 200, "application/json", json({ name: "Wetlands_Raster" }))).toMatchObject({ verdict: "OK" });
    expect(classify("arcgis", 503, "text/html", Buffer.from("<html>"))).toMatchObject({ verdict: "DEAD" });
    expect(classify("arcgis", 200, "text/html", Buffer.from("<html>"))).toMatchObject({ verdict: "ODD" });
  });

  it("wants an image body from a tile, and reads an empty 404 as no tile here", () => {
    expect(classify("tile", 200, "image/png", PNG)).toMatchObject({ verdict: "OK" });
    expect(classify("tile", 200, "text/html", Buffer.from("<html>error</html>"))).toMatchObject({ verdict: "ODD" });
    expect(classify("tile", 404, "", Buffer.alloc(0))).toMatchObject({ verdict: "EMPTY" });
    expect(classify("tile", 500, "text/plain", Buffer.from("x"))).toMatchObject({ verdict: "DEAD" });
  });

  it("matches a known outage by substring", () => {
    const known = [{ match: "geopub.epa.gov/arcgis/rest/services/EMEF/", since: "2026-10-18", note: "" }];
    expect(knownOutage("https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer?f=json", known)).toBe(known[0]);
    expect(knownOutage("https://other.gov/MapServer?f=json", known)).toBeNull();
  });
});
