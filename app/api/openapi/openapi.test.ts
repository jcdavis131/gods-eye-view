// public/openapi.json must agree with the two routes it documents: every op
// in the `op` enum has a `case "<op>"` in the route, and every case in the
// route is documented. Also checks that the reserved placeholders exist and
// that every route handler under app/api has a documented path and that every
// $ref resolves.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const spec = JSON.parse(readFileSync(path.join(root, "public/openapi.json"), "utf8")) as {
  openapi: string;
  paths: Record<string, Record<string, { summary?: string; parameters?: Array<{ name?: string; $ref?: string; schema?: { enum?: string[] } }>; responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, unknown>; parameters: Record<string, unknown>; responses: Record<string, unknown>; headers: Record<string, unknown> };
};

function opsDocumented(route: string): string[] {
  const p = spec.paths[route].get.parameters!.find((x) => x.name === "op");
  return p?.schema?.enum ?? [];
}

function opsInRoute(file: string): string[] {
  const src = readFileSync(path.join(root, file), "utf8");
  return [...src.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]);
}

function refs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else refs(v, out);
    }
  }
  return out;
}

describe("public/openapi.json", () => {
  it("is OpenAPI 3.1 with the two documented routes", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/api/economy", "/api/water", "/api/openapi"]));
  });
  it("documents exactly the ops the economy route dispatches", () => {
    expect(new Set(opsDocumented("/api/economy"))).toEqual(new Set(opsInRoute("app/api/economy/route.ts")));
    expect(opsDocumented("/api/economy")).toContain("report");
  });
  it("documents exactly the ops the water route dispatches", () => {
    expect(new Set(opsDocumented("/api/water"))).toEqual(new Set(opsInRoute("app/api/water/route.ts")));
    expect(opsDocumented("/api/water")).toContain("history");
  });
  it("has a response schema tagged x-op for every documented op", () => {
    const schemas = spec.components.schemas as Record<string, { "x-op"?: string }>;
    const tagged = Object.values(schemas).map((s) => s["x-op"]).filter((x): x is string => !!x);
    for (const op of opsDocumented("/api/economy")) expect(tagged).toContain(op);
    for (const op of opsDocumented("/api/water")) expect(tagged).toContain(op);
  });
  it("lists the CSV columns the flatteners produce", async () => {
    const eco = await import("@/lib/economy/flatten");
    const wat = await import("@/lib/water/flatten");
    const s = spec.components.schemas as Record<string, { "x-csv-columns"?: string[] }>;
    expect(s.EconomyAreasResponse["x-csv-columns"]).toEqual([...eco.AREA_COLUMNS]);
    expect(s.EconomyPortsResponse["x-csv-columns"]).toEqual([...eco.PORT_COLUMNS]);
    expect(s.EconomyBorderResponse["x-csv-columns"]).toEqual([...eco.CROSSING_COLUMNS]);
    expect(s.EconomyCountriesResponse["x-csv-columns"]).toEqual([...eco.COUNTRY_COLUMNS]);
    expect(s.EconomySectorsResponse["x-csv-columns"]).toEqual([...eco.SECTOR_COLUMNS]);
    expect(s.EconomyPulseResponse["x-csv-columns"]).toEqual([...eco.PULSE_COLUMNS]);
    expect(s.WaterGaugesResponse["x-csv-columns"]).toEqual([...wat.GAUGE_COLUMNS]);
    expect(s.WaterWellsResponse["x-csv-columns"]).toEqual([...wat.WELL_COLUMNS]);
    expect(s.WaterNwpsResponse["x-csv-columns"]).toEqual([...wat.NWPS_COLUMNS]);
    expect(s.WaterTwdbResponse["x-csv-columns"]).toEqual([...wat.TWDB_COLUMNS]);
    expect(s.WaterHistoryResponse["x-csv-columns"]).toEqual([...wat.HISTORY_COLUMNS]);
    expect(s.WaterMatchupResponse["x-csv-columns"]).toEqual([...wat.MATCHUP_COLUMNS]);
  });
  it("documents every route handler under app/api", () => {
    const routes = readdirSync(path.join(root, "app", "api"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith("route.ts"))
      .map((f) => "/api/" + f.replace(/\/?route\.ts$/, "").replace(/\\/g, "/"))
      .map((f) => f.replace(/\/$/, ""));
    // Thin browser proxies for the live layers are not part of the practitioner API.
    const proxies = new Set(["/api/aircraft", "/api/cameras", "/api/earthquakes", "/api/geocode", "/api/launches", "/api/roads", "/api/satellites", "/api/ships", "/api/voice/elevenlabs"]);
    for (const r of routes) {
      if (proxies.has(r)) continue;
      expect(spec.paths[r], r).toBeDefined();
      for (const method of Object.values(spec.paths[r])) expect((method as { summary?: string }).summary ?? "").not.toContain("reserved");
    }
  });
  it("every $ref resolves to a component", () => {
    for (const ref of refs(spec)) {
      const m = ref.match(/^#\/components\/(schemas|parameters|responses|headers)\/(.+)$/);
      expect(m, ref).not.toBeNull();
      expect(spec.components[m![1] as keyof typeof spec.components][m![2]], ref).toBeDefined();
    }
  });
  it("the Provenance schema matches lib/provenance/types.ts", () => {
    const p = spec.components.schemas.Provenance as { required: string[]; properties: Record<string, unknown> };
    expect(p.required).toEqual(["source", "retrievedAt", "kind"]);
    expect(Object.keys(p.properties)).toEqual(["source", "seriesId", "upstreamUrl", "period", "releasedAt", "retrievedAt", "kind", "method", "revision", "notes"]);
  });
});
