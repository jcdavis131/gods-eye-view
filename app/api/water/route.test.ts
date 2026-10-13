// /api/water?op=impaired with fetch replaced by EPA ATTAINS answers captured
// 2026-10-13 (lib/water/fixtures): the where clause and named fields asked
// for, the grid box, the cap note, and that a failed layer reads unknown, not
// none. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import lines from "@/lib/water/fixtures/attains-1-baltimore.json";
import areas from "@/lib/water/fixtures/attains-2-baltimore.json";

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
}));

const { GET } = await import("./route");

const calls: string[] = [];
let answer: (url: string) => Response | null = () => null;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  answer = () => null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      calls.push(u);
      const r = answer(u);
      if (!r) throw new Error(`unexpected request ${u}`);
      return r;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

type Body = { data: { features: Array<{ properties: { name: string; details: Record<string, unknown> } }> }; bbox: number[]; coverage: Array<{ id: string; state: string; count: number | null }>; caveats: string[] };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/water?${qs}`));
  return { status: res.status, body: (await res.json()) as Body };
}
const ATT = "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/ATTAINS_Assessment/FeatureServer";

describe("op=impaired", () => {
  it("asks both ATTAINS layers for impaired units only, named fields, in the snapped box", async () => {
    answer = (u) => (u.startsWith(`${ATT}/1/query?`) ? json(lines) : u.startsWith(`${ATT}/2/query?`) ? json(areas) : null);
    const { status, body } = await get("op=impaired&bbox=-76.62,39.26,-76.58,39.30");
    expect(status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const u of calls) {
      const p = new URL(u).searchParams;
      expect(p.get("where")).toBe("isimpaired='Y'");
      expect(p.get("outFields")).toBe("assessmentunitidentifier,assessmentunitname,state,organizationname,reportingcycle,ircategory,overallstatus,on303dlist,hastmdl,waterbodyreportlink,cyclestatus");
      expect(p.get("resultRecordCount")).toBe("2000");
      expect(JSON.parse(p.get("geometry")!)).toEqual({ xmin: -76.62, ymin: 39.26, xmax: -76.58, ymax: 39.3 });
    }
    expect(body.bbox).toEqual([-76.62, 39.26, -76.58, 39.3]);
    expect(body.data.features).toHaveLength(7);
    expect(body.coverage).toEqual([
      expect.objectContaining({ id: "lines", state: "covered", count: 2 }),
      expect.objectContaining({ id: "areas", state: "covered", count: 5 }),
    ]);
    expect(body.caveats.join(" ")).toMatch(/not the same as clean/);
  });

  it("reads a failed layer as unknown, not none, and refuses a bad box without asking", async () => {
    answer = (u) => (u.startsWith(`${ATT}/1/query?`) ? json(lines) : u.startsWith(`${ATT}/2/query?`) ? new Response("busy", { status: 404 }) : null);
    const { status, body } = await get("op=impaired&bbox=-76.62,39.26,-76.58,39.30");
    expect(status).toBe(200);
    expect(body.coverage.find((c) => c.id === "areas")).toMatchObject({ state: "error", count: null });
    expect(body.caveats.join(" ")).toMatch(/area layer did not answer this time; impaired lakes, estuaries and watersheds here are unknown, not absent/);
    calls.length = 0;
    expect((await get("op=impaired&bbox=-76.58,39.26,-76.62,39.30")).status).toBe(400);
    expect((await get("op=impaired&bbox=,39.26,-76.58,39.30")).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("says when a layer hit the record limit", async () => {
    answer = (u) => (u.startsWith(`${ATT}/1/query?`) ? json({ ...lines, properties: { exceededTransferLimit: true } }) : u.startsWith(`${ATT}/2/query?`) ? json(areas) : null);
    const { body } = await get("op=impaired&bbox=-76.62,39.26,-76.58,39.30");
    expect(body.coverage.find((c) => c.id === "lines")?.state).toBe("partial");
    expect(body.caveats.join(" ")).toMatch(/lines: the first 2,000 in this box; zoom in/);
  });
});
