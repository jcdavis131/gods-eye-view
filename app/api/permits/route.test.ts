// /api/permits with every upstream replaced by payloads captured from the
// portals themselves (lib/permits/fixtures): what each op answers, which
// coverage state every city in the box gets, and that a failure is named as
// missing, not absent. No network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import chicagoPermits from "@/lib/permits/fixtures/permits-chicago.json";
import denverPermits from "@/lib/permits/fixtures/permits-denver.json";
import nycLicences from "@/lib/permits/fixtures/licences-nycdcwp.json";
import nysla from "@/lib/permits/fixtures/licences-nysla.json";
import cwaQuery from "@/lib/permits/fixtures/echo-npdes-query.json";
import cwaRows from "@/lib/permits/fixtures/echo-npdes-rows.json";
import airQuery from "@/lib/permits/fixtures/echo-air-query.json";
import airRows from "@/lib/permits/fixtures/echo-air-rows.json";
import orm from "@/lib/permits/fixtures/usace-orm.json";

type F = { geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null };
const asRows = (j: unknown): F[] => (Array.isArray(j) ? j.map((r) => ({ geometry: null, properties: r as Record<string, unknown> })) : (j as { features: F[] }).features);

const calls: string[] = [];
let failHosts: string[] = [];

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
  cacheDelete: () => {},
}));

vi.mock("@/lib/civic/request", () => ({
  runRows: async (_name: string, req: { kind: string; layer?: string; url?: string }) => {
    const url = req.kind === "arcgis" ? req.layer! : req.url!;
    calls.push(url);
    if (failHosts.some((h) => url.includes(h))) throw new Error(`${new URL(url).host} 503`);
    if (url.includes("ydr8-5enu")) return { features: asRows(chicagoPermits), truncated: false };
    if (url.includes("RESIDENTIALCONSTPERMIT")) return { features: asRows(denverPermits), truncated: false };
    if (url.includes("w7w3-xahh")) return { features: asRows(nycLicences), truncated: false };
    if (url.includes("9s3h-dpkz")) return { features: asRows(nysla), truncated: false };
    throw new Error(`unexpected request ${url}`);
  },
  civicJson: async (_name: string, url: string) => {
    calls.push(url);
    if (failHosts.some((h) => url.includes(h))) throw new Error(`${new URL(url).host} 503`);
    if (url.includes("cwa_rest_services.get_facilities")) return cwaQuery;
    if (url.includes("cwa_rest_services.get_qid")) return cwaRows;
    if (url.includes("air_rest_services.get_facilities")) return airQuery;
    if (url.includes("air_rest_services.get_qid")) return airRows;
    if (url.includes("orm-public-api")) return orm;
    throw new Error(`unexpected request ${url}`);
  },
}));

const { GET } = await import("./route");

type Body = Record<string, unknown> & { data: { features: Array<{ properties: Record<string, unknown> }> }; caveats?: string[]; coverage: Array<{ name: string; state: string; count: number; reason?: string }> };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/permits?${qs}`));
  return { status: res.status, body: (await res.json()) as Body, res };
}

beforeEach(() => {
  calls.length = 0;
  failHosts = [];
});

describe("/api/permits?op=building", () => {
  it("answers Chicago's permits with the city's disclaimer and a covered state", async () => {
    const { status, body } = await get("op=building&bbox=-87.64,41.8775,-87.62,41.8925");
    expect(status).toBe(200);
    expect(body.data.features.length).toBe(20);
    expect(body.days).toBe(30);
    expect(body.coverage).toEqual([expect.objectContaining({ name: "Chicago", state: "covered", count: 20 })]);
    expect(body.caveats?.join(" ")).toContain("The City of Chicago makes no claims");
  });

  it("names Dallas as stale without asking anyone", async () => {
    const { body } = await get("op=building&bbox=-96.805,32.7675,-96.785,32.7825");
    expect(body.data.features).toEqual([]);
    expect(body.coverage).toEqual([expect.objectContaining({ name: "Dallas", state: "stale" })]);
    expect(calls).toEqual([]);
  });

  it("shows Denver's residential permits and names the commercial layer's token", async () => {
    const { body } = await get("op=building&bbox=-105,39.7325,-104.98,39.7475");
    expect(body.coverage.map((c) => [c.name, c.state])).toEqual([
      ["Denver", "covered"],
      ["Denver (commercial)", "token-required"],
    ]);
  });

  it("names a city that failed as missing, and holds the answer briefly", async () => {
    failHosts = ["data.cityofchicago.org"];
    const { body, res } = await get("op=building&bbox=-87.64,41.8775,-87.62,41.8925");
    expect(body.coverage).toEqual([expect.objectContaining({ name: "Chicago", state: "error" })]);
    expect(body.caveats?.join(" ")).toMatch(/missing from this answer, not absent/);
    expect(res.headers.get("cache-control")).toContain("s-maxage=120");
  });

  it("rejects a days window outside 7 to 90 and a malformed box", async () => {
    expect((await get("op=building&bbox=-87.64,41.8775,-87.62,41.8925&days=365")).status).toBe(400);
    expect((await get("op=building&bbox=-87.64,41.8775")).status).toBe(400);
  });
});

describe("/api/permits?op=licences", () => {
  it("answers New York's two registries with the home-business heuristic counted", async () => {
    const { status, body } = await get("op=licences&bbox=-73.9925,40.7425,-73.9775,40.7525");
    expect(status).toBe(200);
    expect(body.coverage.map((c) => c.name).sort()).toEqual(["New York City premises licences", "New York State liquor licences"]);
    expect(body.withheld).toBe(3);
    expect(JSON.stringify(body.data)).not.toContain("[removed from this fixture");
    expect(body.caveats?.join(" ")).toMatch(/heuristic/);
  });
});

describe("/api/permits?op=environmental", () => {
  it("answers ECHO's two programs and the Corps, never relaying the Corps' national total", async () => {
    const { status, body } = await get("op=environmental&bbox=-95.2,29.7,-95,29.8");
    expect(status).toBe(200);
    const byName = Object.fromEntries(body.coverage.map((c) => [c.name, c]));
    expect(byName["EPA ECHO, Clean Water Act (NPDES)"]).toMatchObject({ state: "partial", count: 25 });
    expect(byName["EPA ECHO, Clean Air Act"]).toMatchObject({ state: "partial", count: 25 });
    expect(byName["U.S. Army Corps of Engineers, ORM"]).toMatchObject({ state: "covered", count: 25 });
    expect(JSON.stringify(body)).not.toContain("109678");
  });

  it("keeps the other programs when ECHO fails", async () => {
    failHosts = ["echodata.epa.gov"];
    const { body } = await get("op=environmental&bbox=-95.2,29.7,-95,29.8");
    expect(body.coverage.filter((c) => c.state === "error").length).toBe(2);
    expect(body.data.features.length).toBe(25);
  });

  it("rejects an unknown op", async () => {
    expect((await get("op=coverage")).status).toBe(400);
  });
});
