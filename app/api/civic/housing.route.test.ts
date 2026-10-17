// /api/civic?op=housing with HUD's answers replaced by captures from 2026-10-17
// (lib/civic/fixtures/hud-*, unmodified): named fields on both layers, the box clamped to 0.3
// degrees, nothing outside the allow-list reaching the answer, the place answer, a 404, and bad
// parameters never reaching HUD. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import hcvAustin from "@/lib/civic/fixtures/hud-hcv-austin.json";
import qctAustin from "@/lib/civic/fixtures/hud-qct-austin.json";
import hcvPlace from "@/lib/civic/fixtures/hud-hcv-place-48453002220.json";
import qctPlace from "@/lib/civic/fixtures/hud-qct-place-48453002220.json";
import { HCV_LAYER, QCT_LAYER } from "@/lib/civic/housing";

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

type Fc = { features: Array<{ properties: Record<string, unknown> }> };
type Body = { data: { hcv?: Fc; qct?: Fc } & Record<string, unknown>; bbox?: number[]; count?: number; suppressed?: number; caveats: string[]; provenance: Array<{ source: { id: string } }>; error?: string };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/civic?${qs}`));
  return { status: res.status, body: (await res.json()) as Body };
}

/** The fixtures carry an EANAME the route never asks for, to prove it never reaches the answer. */
const withExtra = (fc: unknown) => ({ ...(fc as object), features: (fc as Fc).features.map((f) => ({ ...f, properties: { ...f.properties, EANAME: "ZZLEAK" } })) });

describe("op=housing", () => {
  it("bbox: both layers asked with named fields, clamped to 0.3 degrees; only the allow-list comes back", async () => {
    answer = (u) => (u.startsWith(`${HCV_LAYER}/query?`) ? withExtra(hcvAustin) : u.startsWith(`${QCT_LAYER}/query?`) ? withExtra(qctAustin) : null);
    const { status, body } = await get("op=housing&bbox=-98.5,29.5,-97.0,31.0");
    expect(status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      const q = new URL(c).searchParams;
      expect(q.get("outFields")).not.toContain("*");
      expect(q.get("f")).toBe("geojson");
      const g = JSON.parse(q.get("geometry")!) as { xmin: number; xmax: number; ymin: number; ymax: number };
      expect(g.xmax - g.xmin).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(g.ymax - g.ymin).toBeLessThanOrEqual(0.3 + 1e-9);
    }
    expect(new URL(calls.find((c) => c.startsWith(HCV_LAYER))!).searchParams.get("outFields")).toBe("GEOID,HCV_PUBLIC,HCV_PUBLIC_PCT");
    expect(new URL(calls.find((c) => c.startsWith(QCT_LAYER))!).searchParams.get("outFields")).toBe("GEOID");
    expect(body.data.hcv!.features).toHaveLength(259);
    expect(body.data.qct!.features).toHaveLength(46);
    expect(JSON.stringify(body)).not.toContain("ZZLEAK");
    expect(Object.keys(body.data.hcv!.features[0].properties).sort()).toEqual(["GEOID", "HCV_PUBLIC", "HCV_PUBLIC_PCT"]);
    expect(body.suppressed).toBe(134);
    expect(body.caveats.join(" ")).toMatch(/tracts containing 10 or fewer voucher holders have been omitted/);
    expect(body.caveats.join(" ")).toMatch(/titled 2026/);
    expect(body.provenance.map((p) => p.source.id)).toEqual(["hud-egis", "hud-egis"]);
  });

  it("level=place: one tract's row and QCT membership", async () => {
    answer = (u) => (u.startsWith(`${HCV_LAYER}/query?`) ? hcvPlace : u.startsWith(`${QCT_LAYER}/query?`) ? qctPlace : null);
    const { status, body } = await get("op=housing&level=place&fips=48453002220");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ geoid: "48453002220", vouchers: 166, share: 20.1, status: "published", qct: true });
    for (const c of calls) expect(new URL(c).searchParams.get("where")).toBe("GEOID='48453002220'");
  });

  it("a tract in neither layer is a 404", async () => {
    answer = () => ({ features: [] });
    const { status, body } = await get("op=housing&level=place&fips=48453999999");
    expect(status).toBe(404);
    expect(body.error).toMatch(/not in either HUD layer/);
  });

  it("refuses bad parameters without asking HUD", async () => {
    answer = () => null;
    for (const qs of ["op=housing", "op=housing&bbox=1,2,3", "op=housing&bbox=-97,31,-98,30", "op=housing&level=place&fips=48453", "op=housing&level=county", "op=housing&level=place&fips=48453002220'"]) {
      const { status } = await get(qs);
      expect(status, qs).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});
