// /api/hazards?op=nri with FEMA's answers replaced by captures from 2026-10-16
// (lib/hazards/fixtures, unmodified): named fields, the county box snapped as
// op=areas snaps it, attribute rows only for counties, tract polygons paged on
// FEMA's exceededTransferLimit, and the required FEMA statement. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import cty from "@/lib/hazards/fixtures/nri-cty-sanantonio.json";
import trPage from "@/lib/hazards/fixtures/nri-tr-page.json";
import tr from "@/lib/hazards/fixtures/nri-tr-sanantonio.json";

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
}));

const { GET } = await import("./route");

const calls: string[] = [];
let answer: (url: string) => unknown = () => null;
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const body = answer(String(url));
      if (body == null) throw new Error(`unexpected request ${url}`);
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const NRI = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services";
type Body = { data: { level?: string; rows?: Array<Record<string, unknown>>; features?: unknown[] }; bbox: number[]; count: number; capped: boolean; caveats: string[]; provenance: Array<{ source: { id: string } }> };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/hazards?${qs}`));
  return { status: res.status, body: (await res.json()) as Body };
}

describe("op=nri", () => {
  it("asks county attribute rows only, named fields, in the box op=areas would snap to", async () => {
    answer = (u) => (u.startsWith(`${NRI}/National_Risk_Index_Counties/FeatureServer/0/query?`) ? cty : null);
    const { status, body } = await get("op=nri&bbox=-98.9,29.1,-98.1,29.9");
    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
    const p = new URL(calls[0]).searchParams;
    expect(p.get("returnGeometry")).toBe("false");
    expect(p.get("outFields")).toContain("TRND_RISKR");
    expect(p.get("outFields")).not.toContain("*");
    expect(JSON.parse(p.get("geometry")!)).toEqual({ xmin: -99, ymin: 29, xmax: -98, ymax: 30 });
    expect(body.bbox).toEqual([-99, 29, -98, 30]);
    expect(body.data.level).toBe("county");
    expect(body.count).toBe(13);
    expect(body.data.rows!.find((r) => r.STCOFIPS === "48029")).toMatchObject({ COUNTY: "Bexar", RISK_RATNG: "Relatively High" });
    expect(body.provenance[0].source.id).toBe("fema-nri");
    expect(body.caveats.join(" ")).toContain("is not endorsed by FEMA");
    expect(body.caveats.join(" ")).toContain("Census Community Resilience Estimate");
  });

  it("pages tracts while FEMA says the answer was cut, and stops when it is not", async () => {
    answer = (u) => {
      if (!u.startsWith(`${NRI}/National_Risk_Index_Census_Tracts/FeatureServer/0/query?`)) return null;
      return new URL(u).searchParams.get("resultOffset") === "0" ? trPage : tr;
    };
    const { status, body } = await get("op=nri&level=tract&bbox=-98.55,29.40,-98.45,29.50");
    expect(status).toBe(200);
    expect(calls.map((u) => new URL(u).searchParams.get("resultOffset"))).toEqual(["0", "2000"]);
    expect(new URL(calls[0]).searchParams.get("f")).toBe("geojson");
    expect(body.capped).toBe(false);
    expect(body.count).toBe(5 + 73);
  });

  it("refuses a bad level or box without asking", async () => {
    answer = () => cty;
    expect((await get("op=nri&level=state&bbox=-99,29,-98,30")).status).toBe(400);
    expect((await get("op=nri&bbox=-98,29,-99,30")).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
