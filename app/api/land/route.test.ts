// /api/land with fetch replaced by payloads captured from the publishers on
// 2026-10-12 (lib/land/fixtures): what each op asks the upstream for (named
// fields only, never an address), what it answers, and that a lookup that
// fails leaves values missing rather than guessed. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import nwiWetlands from "@/lib/land/fixtures/nwi-wetlands-mitchell.json";
import nwiCodes from "@/lib/land/fixtures/nwi-codes-mitchell.json";
import nwiSource from "@/lib/land/fixtures/nwi-source-mitchell.json";

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

type Body = Record<string, unknown> & { data: { features: Array<{ properties: Record<string, unknown> & { details?: Record<string, unknown>; extra?: Record<string, unknown> } }> }; caveats?: string[]; provenance?: Array<{ seriesId?: string }> };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/land?${qs}`));
  return { status: res.status, body: (await res.json()) as Body };
}
const param = (url: string, k: string) => new URL(url).searchParams.get(k);

describe("op=wetlands", () => {
  const nwi = (u: string) => {
    if (u.includes("/Wetlands/MapServer/0/query")) return json(nwiWetlands);
    if (u.includes("/Wetlands/MapServer/1/query")) return json(nwiCodes);
    if (u.includes("/Data_Source/MapServer/3/query")) return json(nwiSource);
    return null;
  };

  it("asks layer 0 for plain fields (the prefixed join is a 400 since 2026) and names each code from table 1", async () => {
    answer = nwi;
    const { status, body } = await get("op=wetlands&bbox=-98.48,29.30,-98.46,29.32");
    expect(status).toBe(200);
    const q0 = calls.find((u) => u.includes("/Wetlands/MapServer/0/query"))!;
    expect(param(q0, "outFields")).toBe("OBJECTID,ATTRIBUTE,WETLAND_TYPE,ACRES");
    const q1 = calls.find((u) => u.includes("/Wetlands/MapServer/1/query"))!;
    expect(param(q1, "f")).toBe("json");
    expect(param(q1, "where")).toBe("ATTRIBUTE IN ('L2USAh','PEM1Ch','PUBFh','PUBHh','PUSAh','PUSCh','R4SBAx','R4SBC','R5UBH')");
    expect(body.data.features).toHaveLength(14);
    const lake = body.data.features.find((f) => f.properties.extra?.code === "L2USAh")!;
    expect(lake.properties.details).toMatchObject({ system: "Lacustrine", class: "Unconsolidated Shore", "water regime": "Temporary Flooded", "mapped from": "1983 imagery (Southton, CIR 1:58,000, 03/83)" });
    expect(body.codesDecoded).toBe(true);
    expect(body.imageYears).toEqual([1983]);
    expect(body.provenance?.map((p) => p.seriesId)).toEqual(expect.arrayContaining([expect.stringContaining("table 1")]));
  });

  it("still draws the polygons, undecoded, when the code table fails, and says so", async () => {
    answer = (u) => (u.includes("/Wetlands/MapServer/1/query") ? new Response("bad gateway", { status: 502 }) : nwi(u));
    const { status, body } = await get("op=wetlands&bbox=-98.48,29.30,-98.46,29.32");
    expect(status).toBe(200);
    expect(body.data.features).toHaveLength(14);
    expect(body.data.features[0].properties.extra?.system).toBeUndefined();
    expect(body.codesDecoded).toBe(false);
    expect(body.caveats?.join(" ")).toMatch(/code table did not answer/);
  });
});
