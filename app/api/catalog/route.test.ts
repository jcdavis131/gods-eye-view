// /api/catalog: static, no upstream call; sources expanded from the registry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LAYER_IDS } from "@/lib/layers/types";
import { COLLECTIONS, catalogued } from "@/lib/catalog/collections";
import { GET } from "./route";

const fetchSpy = vi.fn(async () => {
  throw new Error("the catalogue makes no request");
});
beforeEach(() => vi.stubGlobal("fetch", fetchSpy));
afterEach(() => vi.unstubAllGlobals());

async function get(qs = "") {
  const res = GET(new NextRequest(`http://localhost/api/catalog${qs ? `?${qs}` : ""}`));
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, unknown> & { data: Record<string, unknown> } };
}

describe("/api/catalog", () => {
  it("lists every collection with its sources expanded, and the layers not yet catalogued", async () => {
    const { status, headers, body } = await get();
    expect(status).toBe(200);
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(headers.get("cache-control")).toContain("s-maxage=3600");
    const d = body.data as { collections: Array<{ id: string; sources: Array<{ publisher: string; license: string }>; globe: string }>; uncatalogued: string[] };
    expect(d.collections.map((c) => c.id)).toEqual(COLLECTIONS.map((c) => c.id));
    const nrhp = d.collections.find((c) => c.id === "nrhp-listed")!;
    expect(nrhp.sources[0].publisher).toMatch(/National Park Service/);
    expect(nrhp.sources[0].license.length).toBeGreaterThan(5);
    expect(nrhp.globe).toBe("/?layers=historic");
    expect(d.uncatalogued).toEqual(LAYER_IDS.filter((l) => !catalogued().includes(l)));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers one id, or 404 with the list of ids", async () => {
    const one = await get("id=nrhp-listed");
    expect(one.status).toBe(200);
    expect((one.body.data.collection as { id: string }).id).toBe("nrhp-listed");
    const miss = await get("id=nope");
    expect(miss.status).toBe(404);
    expect((miss.body.details as { ids: string[] }).ids).toContain("fws-crithab");
  });

  it("answers a layer's collections, and refuses a layer id that does not exist", async () => {
    const ok = await get("layer=contaminants");
    expect(ok.status).toBe(200);
    expect((ok.body.data.collections as Array<{ id: string }>).map((c) => c.id)).toEqual(["emef-sems", "emef-tri", "emef-rcra", "emef-acres", "tri-releases", "npl-boundaries", "npl-status"]);
    expect((await get("layer=relief")).body.data.collections).toEqual([]);
    expect((await get("layer=nope")).status).toBe(400);
  });
});
