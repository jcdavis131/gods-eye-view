// /api/zoning with every upstream replaced by payloads captured from the
// services themselves (lib/zoning/fixtures): which city answers a point, the
// state and caveats each answer carries, and what the districts op says about
// cities it does not draw. No network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import tigerHouston from "@/lib/zoning/fixtures/tiger-houston.json";
import tigerBellaire from "@/lib/zoning/fixtures/tiger-bellaire.json";
import seattlePoint from "@/lib/zoning/fixtures/seattle-point.json";
import chicagoPoint from "@/lib/zoning/fixtures/chicago-point.json";
import nycPoint from "@/lib/zoning/fixtures/nyc-point.json";
import nycPluto from "@/lib/zoning/fixtures/nyc-pluto.json";
import nycZtldb from "@/lib/zoning/fixtures/nyc-ztldb.json";
import seattleOutlines from "@/lib/zoning/fixtures/seattle-outlines.json";

type Fc = { features: Array<{ id?: number | string; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }> };
const asRows = (j: unknown): Fc => (Array.isArray(j) ? { features: j.map((r) => ({ geometry: null, properties: r as Record<string, unknown> })) } : (j as Fc));

const place = (geoid: string, name: string): Fc => ({ features: [{ geometry: null, properties: { GEOID: geoid, NAME: name } }] });

const calls: string[] = [];
let placeAnswer: Fc = place("5363000", "Seattle city");

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
}));

vi.mock("@/lib/civic/request", () => ({
  runRows: async (_name: string, req: { kind: string; layer?: string; url?: string; params?: Record<string, string> }) => {
    const url = req.kind === "arcgis" ? req.layer! : req.url!;
    calls.push(url);
    const r = (fc: Fc) => ({ features: fc.features, truncated: false });
    if (url.includes("tigerWMS_Current/MapServer/28")) return r(placeAnswer);
    if (url.includes("Current_Land_Use_Zoning_Detail_2")) return r(req.params?.returnGeometry === "true" ? asRows(seattleOutlines) : asRows(seattlePoint));
    if (url.includes("dj47-wfun")) return r(asRows(chicagoPoint));
    if (url.includes("/nyzd/")) return r(asRows(nycPoint));
    if (url.includes("/MAPPLUTO/")) return r(asRows(nycPluto));
    if (url.includes("fdkv-4t4z")) return r(asRows(nycZtldb));
    throw new Error(`unexpected request ${url}`);
  },
}));

const { GET } = await import("./route");

async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/zoning?${qs}`));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { data: Record<string, unknown>; caveats?: string[]; provenance: Array<{ source: { id: string } }> } };
}

beforeEach(() => {
  calls.length = 0;
});

describe("/api/zoning?op=point", () => {
  it("answers Seattle's district with the TIGERweb place and the city's source", async () => {
    placeAnswer = place("5363000", "Seattle city");
    const { status, body } = await get("op=point&lon=-122.3325&lat=47.6067");
    expect(status).toBe(200);
    expect(body.state).toBe("district");
    expect(body.data).toMatchObject({ state: "district", city: "seattle", code: "DOC1 U/450-U", ordinance: "125291" });
    expect(body.provenance.map((p) => p.source.id)).toEqual(["census-tigerweb", "seattle-zoning"]);
    expect(body.caveats?.[0]).toMatch(/not a zoning verification letter/);
  });

  it("tells Houston it has no zoning ordinance without asking any zoning service", async () => {
    placeAnswer = asRows(tigerHouston);
    const { body } = await get("op=point&lon=-95.3698&lat=29.7604");
    expect(body.data).toMatchObject({ state: "no-ordinance", city: "houston" });
    expect(calls.every((u) => u.includes("tigerWMS"))).toBe(true);
  });

  it("does not tell Bellaire, inside Houston's box, that it has no zoning", async () => {
    placeAnswer = asRows(tigerBellaire);
    const { body } = await get("op=point&lon=-95.4588&lat=29.7058");
    expect(body.data).toMatchObject({ state: "not-covered" });
    expect(String(body.data.note)).toContain("Bellaire city");
    expect(body.caveats?.join(" ")).toMatch(/says nothing about whether zoning applies/);
  });

  it("adds New York's tax-lot overlays through the BBL, and cites the ZTLDB", async () => {
    placeAnswer = place("3651000", "New York city");
    const { body } = await get("op=point&lon=-73.9857&lat=40.7484");
    expect(body.data).toMatchObject({ code: "C6-4.5", lot: { bbl: "1008350041" }, overlays: ["special district MiD"] });
    expect(body.provenance.map((p) => p.source.id)).toEqual(["census-tigerweb", "nyc-dcp-zoning", "nyc-ztldb"]);
  });

  it("carries the City of Chicago's disclaimer verbatim on a Chicago answer", async () => {
    placeAnswer = place("1714000", "Chicago city");
    const { body } = await get("op=point&lon=-87.6305&lat=41.8842");
    expect(body.data).toMatchObject({ code: "DC-16" });
    expect(body.caveats).toContain(
      "This site provides applications using data that has been modified for use from its original source, www.cityofchicago.org, the official website of the City of Chicago. The City of Chicago makes no claims as to the content, accuracy, timeliness, or completeness of any of the data provided at this site. The data provided at this site is subject to change at any time. It is understood that the data provided at this site is being used at one's own risk.",
    );
  });

  it("refuses a missing or blank coordinate rather than reading it as 0", async () => {
    expect((await get("op=point&lon=-122.3&lat=")).status).toBe(400);
    expect((await get("op=point&lat=47.6")).status).toBe(400);
  });
});

describe("/api/zoning?op=districts and coverage", () => {
  it("draws Seattle's outlines for a Seattle box and says what was loaded", async () => {
    const { status, body } = await get("op=districts&bbox=-122.3375,47.6,-122.3225,47.615");
    expect(status).toBe(200);
    expect(body.bbox).toEqual([-122.3375, 47.6, -122.3225, 47.615]);
    expect((body.data.features as unknown[]).length).toBeGreaterThan(5);
    expect(body.sources).toEqual([expect.objectContaining({ city: "seattle" })]);
    expect(body.failed).toEqual([]);
  });

  it("names San Francisco as point-only and asks it nothing", async () => {
    const { body } = await get("op=districts&bbox=-122.42,37.77,-122.40,37.79");
    expect((body.data.features as unknown[]).length).toBe(0);
    expect(body.pointOnly).toEqual([expect.objectContaining({ city: "sanfrancisco" })]);
    expect(calls).toEqual([]);
  });

  it("lists every wired city, Houston as having no zoning ordinance", async () => {
    const { body } = await get("op=coverage");
    const cities = body.data as unknown as Array<{ id: string; point: boolean; outlines: boolean; zoning: string }>;
    expect(cities.map((c) => c.id)).toContain("seattle");
    expect(cities.find((c) => c.id === "houston")).toMatchObject({ point: false, outlines: false, zoning: "no zoning ordinance" });
    expect(cities.find((c) => c.id === "sanfrancisco")).toMatchObject({ point: true, outlines: false });
  });

  it("rejects an unknown op and a malformed box", async () => {
    expect((await get("op=nope")).status).toBe(400);
    expect((await get("op=districts&bbox=1,2,3")).status).toBe(400);
  });
});
