// /api/civic?op=health with data.cdc.gov replaced by answers captured 2026-10-16
// (lib/civic/fixtures; the whole-measure pull trimmed to seven Northeast states, values as
// CDC sent them): what each level asks, the compact rows, the national breaks, a county
// that fails reading unknown, and bad parameters never reaching CDC. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import northeast from "@/lib/civic/fixtures/places-county-diabetes-northeast-trimmed.json";
import tracts from "@/lib/civic/fixtures/places-tract-09110-diabetes.json";
import travis from "@/lib/civic/fixtures/places-county-48453-all.json";

vi.mock("@/lib/server/cache", () => ({
  cached: async <T,>(_k: string, _ttl: number, produce: () => Promise<T>) => ({ value: await produce(), age: 0, hit: false }),
}));

const { GET } = await import("./route");

const calls: string[] = [];
let answer: (url: string) => Response | null = () => null;
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const r = answer(String(url));
      if (!r) throw new Error(`unexpected ${url}`);
      return r;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

type Body = { data: { rows?: Array<Record<string, unknown>>; values?: unknown[] }; count: number; breaks?: number[]; coverage?: Array<{ county: string; state: string; count: number | null }>; caveats: string[] };
async function get(qs: string) {
  const res = await GET(new NextRequest(`http://localhost/api/civic?${qs}`));
  return { status: res.status, body: (await res.json()) as Body };
}

describe("op=health", () => {
  it("level=county: one whole-measure pull, compact rows, national quintile breaks", async () => {
    answer = (u) => (u.startsWith("https://data.cdc.gov/resource/swc5-untb.json?") ? json(northeast) : null);
    const { status, body } = await get("op=health&level=county&measure=DIABETES");
    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
    const q = new URL(calls[0]).searchParams;
    expect(q.get("measureid")).toBe("DIABETES");
    expect(q.get("datavaluetypeid")).toBe("AgeAdjPrv");
    expect(body.count).toBe(135);
    expect(body.data.rows!.find((r) => r.fips === "09110")).toEqual({ fips: "09110", name: "Capitol", state: "CT", value: 9.2, low: 8.4, high: 10, year: 2023, population: 975328 });
    expect(body.breaks).toHaveLength(4);
    expect(body.caveats.join(" ")).toMatch(/not counts of diagnosed people/);
  });

  it("level=tract: one countyfips query per county, and a county that fails is unknown, not missing", async () => {
    answer = (u) => {
      if (!u.startsWith("https://data.cdc.gov/resource/cwsq-ngmh.json?")) return null;
      const where = new URL(u).searchParams.get("$where") ?? "";
      return where.includes("countyfips='09110'") ? json(tracts) : new Response("{}", { status: 400 });
    };
    const { status, body } = await get("op=health&level=tract&measure=DIABETES&counties=09120,09110");
    expect(status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const u of calls) expect(u).not.toContain("within_box");
    expect(body.count).toBe(246);
    expect(body.coverage).toEqual([
      { county: "09110", state: "covered", count: 246 },
      { county: "09120", state: "error", count: null },
    ]);
    expect(body.caveats.join(" ")).toMatch(/09120 this time: its tracts are unknown/);
  });

  it("level=place: every measure for one county", async () => {
    answer = (u) => (new URL(u).searchParams.get("locationid") === "48453" ? json(travis) : null);
    const { status, body } = await get("op=health&level=place&fips=48453");
    expect(status).toBe(200);
    expect(body.data.values).toHaveLength(33);
  });

  it("refuses an unknown measure, a seventh county or a bad FIPS without asking", async () => {
    answer = () => json([]);
    for (const qs of ["op=health&measure=HAPPINESS", "op=health&level=tract&measure=DIABETES&counties=1,2", "op=health&level=tract&measure=DIABETES&counties=01001,01003,01005,01007,01009,01011,01013", "op=health&level=place&fips=4845", "op=svi"]) {
      expect((await get(qs)).status, qs).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});
