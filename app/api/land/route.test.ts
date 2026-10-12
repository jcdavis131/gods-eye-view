// /api/land with fetch replaced by payloads captured from the publishers on
// 2026-10-12 (lib/land/fixtures): what each op asks the upstream for (named
// fields only, never an address), what it answers, and that a lookup that
// fails leaves values missing rather than guessed. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import nwiWetlands from "@/lib/land/fixtures/nwi-wetlands-mitchell.json";
import nwiCodes from "@/lib/land/fixtures/nwi-codes-mitchell.json";
import nwiSource from "@/lib/land/fixtures/nwi-source-mitchell.json";
import nrhpPoints from "@/lib/land/fixtures/nrhp-points-dc.json";
import nrhpBoundaries from "@/lib/land/fixtures/nrhp-polygons-dc.json";
import chFinalBarton from "@/lib/land/fixtures/crithab-0-barton.json";
import chProposedBarton from "@/lib/land/fixtures/crithab-2-barton.json";
import chFinalPecos from "@/lib/land/fixtures/crithab-0-pecos.json";
import chProposedPecos from "@/lib/land/fixtures/crithab-2-pecos.json";

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

describe("op=historic", () => {
  const nps = (u: string) => {
    if (u.includes("/nrhp_locations/MapServer/0/query")) return json(nrhpPoints);
    if (u.includes("/nrhp_locations/MapServer/1/query")) return json(nrhpBoundaries);
    return null;
  };

  it("asks NPS for listed properties only, by named fields, never the address", async () => {
    answer = nps;
    const { status, body } = await get("op=historic&bbox=-77.04,38.88,-77.02,38.90");
    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
    const q = calls[0];
    expect(param(q, "where")).toBe("STATUS='Listed'");
    const fields = param(q, "outFields")!.split(",");
    expect(fields).toEqual(["OBJECTID", "NRIS_Refnum", "RESNAME", "ResType", "City", "County", "State", "Is_NHL", "CertDate", "NARA_URL"]);
    expect(fields).not.toContain("Address");
    expect(fields).not.toContain("*");
    expect(param(q, "resultRecordCount")).toBe("2000");
    expect(body.data.features).toHaveLength(60);
    expect(body.points).toBe(60);
    expect(body.boundaries).toBeUndefined();
    expect(body.caveats?.join(" ")).toMatch(/NHPA section 304 \/ ARPA/);
    expect(body.caveats?.join(" ")).toMatch(/not a substitute for Section 106/);
  });

  it("adds the boundaries with polygons=1, and keeps the points when the boundary layer fails", async () => {
    answer = nps;
    const both = await get("op=historic&bbox=-77.04,38.88,-77.02,38.90&polygons=1");
    expect(both.body.data.features).toHaveLength(78);
    expect(both.body.boundaries).toBe(18);
    const q1 = calls.find((u) => u.includes("/MapServer/1/query"))!;
    expect(param(q1, "outFields")).not.toContain("Address");
    expect(param(q1, "where")).toBe("STATUS='Listed'");

    answer = (u) => (u.includes("/MapServer/1/query") ? new Response("down", { status: 503 }) : nps(u));
    const half = await get("op=historic&bbox=-77.04,38.88,-77.02,38.90&polygons=1");
    expect(half.status).toBe(200);
    expect(half.body.data.features).toHaveLength(60);
    expect(half.body.boundaries).toBeNull();
    expect(half.body.caveats?.join(" ")).toMatch(/boundary layer did not answer/);
  });

  it("clamps the box to 0.12 degrees on a 0.02 grid and refuses a bad one without asking NPS", async () => {
    answer = nps;
    const { body } = await get("op=historic&bbox=-77.5,38.5,-76.5,39.5");
    const [w, s, e, n] = body.bbox as number[];
    expect(e - w).toBeLessThanOrEqual(0.12 + 0.02 + 1e-9);
    expect(n - s).toBeLessThanOrEqual(0.12 + 0.02 + 1e-9);
    for (const v of [w, s, e, n]) expect(Math.abs(v / 0.02 - Math.round(v / 0.02))).toBeLessThan(1e-6);
    expect(w).toBeLessThanOrEqual(-77.06);
    expect(e).toBeGreaterThanOrEqual(-76.94);
    calls.length = 0;
    const bad = await get("op=historic&bbox=1,2,3");
    expect(bad.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("op=crithab", () => {
  const fws = (place: "barton" | "pecos") => (u: string) => {
    if (u.includes("/USFWS_Critical_Habitat/FeatureServer/0/query")) return json(place === "barton" ? chFinalBarton : chFinalPecos);
    if (u.includes("/USFWS_Critical_Habitat/FeatureServer/2/query")) return json(place === "barton" ? chProposedBarton : chProposedPecos);
    return null;
  };

  it("asks both FWS layers at the point for named fields and no geometry, and reads a final designation", async () => {
    answer = fws("barton");
    const { status, body } = await get("op=crithab&lon=-97.7713&lat=30.2638");
    expect(status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const u of calls) {
      expect(param(u, "returnGeometry")).toBe("false");
      expect(param(u, "outFields")).toBe("comname,sciname,listing_status,status,fedreg,pubdate");
      expect(param(u, "geometry")).toBe("-97.7713,30.2638");
    }
    const d = body.data as unknown as { final: Array<Record<string, string>>; proposed: unknown[] };
    expect(d.final).toEqual([{ common: "Austin blind Salamander", scientific: "Eurycea waterlooensis", listing: "Endangered", designation: "Final", fedreg: "78FR51328 51379", published: "2013-08-20" }]);
    expect(d.proposed).toEqual([]);
    expect(body.caveats?.join(" ")).toMatch(/not species range or occurrence/);
  });

  it("labels a proposed designation as proposed", async () => {
    answer = fws("pecos");
    const { body } = await get("op=crithab&lon=-104.30215&lat=33.17766");
    const d = body.data as unknown as { final: unknown[]; proposed: Array<Record<string, string>> };
    expect(d.final).toEqual([]);
    expect(d.proposed).toEqual([expect.objectContaining({ common: "Pecos pupfish", listing: "Proposed Threatened", designation: "Proposed", published: "2024-11-22" })]);
  });

  it("names a layer that failed as unknown, not absent, and refuses a point without lon and lat", async () => {
    answer = (u) => (u.includes("/FeatureServer/2/query") ? new Response("down", { status: 503 }) : fws("barton")(u));
    const { status, body } = await get("op=crithab&lon=-97.7713&lat=30.2638");
    expect(status).toBe(200);
    expect((body.data as unknown as { proposed: unknown }).proposed).toBeNull();
    expect(body.caveats?.join(" ")).toMatch(/proposed critical habitat layer did not answer/);
    calls.length = 0;
    expect((await get("op=crithab&lon=-97.7")).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
