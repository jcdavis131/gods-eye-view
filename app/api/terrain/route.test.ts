// /api/terrain with fetch replaced: the tile op passes the publisher's image
// through with an edge cache line and refuses anything that is not an image;
// the point op answers from payloads captured from USFS, MRLC and 3DEP on
// 2026-09-26; bad parameters never reach an upstream. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import whpNw from "@/lib/terrain/fixtures/whp-identify-nw.json";
import nlcdDt from "@/lib/terrain/fixtures/nlcd-gfi-dt.json";
import slopeNw from "@/lib/terrain/fixtures/slope-identify-nw.json";

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
}));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/terrain?${qs}`);
const calls: string[] = [];
let answer: (url: string) => Response = () => new Response("unset", { status: 500 });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return answer(String(url));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("op=tile", () => {
  it("passes a rendered PNG through with CORS and a long edge cache, asking 3DEP for the tile's projected box", async () => {
    answer = () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } });
    const res = await GET(req("op=tile&product=slope&z=15&x=7420&y=13575"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("bbox=-10962904.34,3434162.81,-10961681.35,3435385.80");
  });

  it("refuses an answer that is not an image (ArcGIS answers errors with a 200 and JSON)", async () => {
    answer = () => new Response(JSON.stringify({ error: { code: 500, message: "Error exporting image" } }), { status: 200, headers: { "content-type": "application/json" } });
    const res = await GET(req("op=tile&product=floodmap&z=15&x=7418&y=13579"));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/instead of an image/);
  }, 15_000);

  it("never reaches an upstream for a product, zoom or tile it does not serve", async () => {
    for (const qs of [
      "op=tile&product=https://example.com&z=15&x=1&y=1",
      "op=tile&product=slope&z=3&x=1&y=1",
      "op=tile&product=contours&z=18&x=1&y=1",
      "op=tile&product=slope&z=10&x=5000&y=1",
      "op=tile&product=slope&z=10&x=1.5&y=1",
      "op=tile&product=slope&z=10&x=&y=1",
      "op=nope",
    ]) {
      expect((await GET(req(qs))).status, qs).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("op=point", () => {
  it("answers the WHP class with the service's own class table and its caveat", async () => {
    answer = () => Response.json(whpNw);
    const j = (await (await GET(req("op=point&product=firehazard&lon=-98.75&lat=29.65"))).json()) as {
      data: { class: { code: number; label: string }; classes: unknown[] };
      provenance: Array<{ source: { id: string } }>;
      caveats: string[];
    };
    expect(j.data.class).toMatchObject({ code: 2, label: "Low" });
    expect(j.data.classes).toHaveLength(7);
    expect(j.provenance[0].source.id).toBe("usfs-whp");
    expect(j.caveats[0]).toMatch(/not an explicit map of wildfire threat or risk/);
  });

  it("answers the NLCD class and the 3DEP slope", async () => {
    answer = () => Response.json(nlcdDt);
    const lc = (await (await GET(req("op=point&product=landcover&lon=-98.4936&lat=29.4241"))).json()) as { data: { class: { code: number } } };
    expect(lc.data.class.code).toBe(24);
    answer = () => Response.json(slopeNw);
    const sl = (await (await GET(req("op=point&product=slope&lon=-98.75&lat=29.65"))).json()) as { data: { degrees: number } };
    expect(sl.data.degrees).toBe(11);
  });

  it("says there is no class rather than inventing one", async () => {
    answer = () => Response.json({ objectId: 0, name: "Pixel", value: "NoData" });
    const j = (await (await GET(req("op=point&product=firehazard&lon=-40&lat=30"))).json()) as { data: { class: unknown }; caveats: string[] };
    expect(j.data.class).toBeNull();
    expect(j.caveats.join(" ")).toMatch(/has no class here/);
  });

  it("needs a known product and a real point", async () => {
    expect((await GET(req("op=point&product=soils&lon=1&lat=1"))).status).toBe(400);
    expect((await GET(req("op=point&product=slope&lon=&lat=1"))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("op=products", () => {
  it("lists every picture with its delivery, and the terrain attribution", async () => {
    const j = (await (await GET(req("op=products"))).json()) as { data: { products: Array<{ id: string; delivery: string }>; terrainAttribution: string[] } };
    const ids = j.data.products.map((p) => `${p.id}:${p.delivery}`);
    expect(ids).toEqual(expect.arrayContaining(["slope:route", "contours:route", "landcover:route", "floodmap:route", "relief:direct", "soils:direct", "firehazard:direct", "sealevel:direct", "terrain:direct"]));
    expect(j.data.terrainAttribution.length).toBeGreaterThan(5);
  });
});
