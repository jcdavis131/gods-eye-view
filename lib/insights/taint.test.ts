// No producer text reaches a printed surface: a canary harness.
//
// Every string the bundle carries is a candidate route for producer words
// onto the page. Each case here appends a canary to one string of a deep copy
// of the committed bundle (or renames one key everywhere it is referenced,
// the way a consistent export would) and builds; the build must either refuse
// or print the canary nowhere: not in the insight the page renders from, the
// SVG of any canvas (the social and OG cards are these SVGs rasterised), the
// CSV, the JSON download, the JSON-LD, the feed or the data table.
//
// The always-on cases are A2's leak list: the 44 places the harness found
// printing a canary before A3 (metro labels and titles, the headline's
// connectives, the chart's source records, the source entries' dates and
// hashes, the registered numbers' citations, the precondition fields). With
// INSIGHTS_TAINT=1 the harness runs over every string pattern of the bundle
// and every object key (about 1,200 builds, minutes, not for every run).

import { describe, expect, it } from "vitest";
import { buildInsight } from "./build";
import { insightCsv, insightJson } from "./downloads";
import { insightsFeedDoc } from "./feed";
import { insightJsonLd } from "./jsonld";
import type { LoadedBundle } from "./load";
import { CANVAS_IDS } from "./render/canvas";
import { renderSvg } from "./render/render";
import { chartTable } from "./render/table";
import { BASE } from "./testFixtures";
import type { Insight } from "./types";

const CANARY = "QZXQ";
const F = BASE.findings[0];
type Path = Array<string | number>;
type Docs = { manifest: unknown; methods: unknown; evidence: unknown; chart: unknown };

/** Everything a reader or a crawler can be shown, as one string. */
function surfaces(i: Insight): string {
  return [
    JSON.stringify(i),
    ...CANVAS_IDS.map((c) => renderSvg(i.spec, c, "dark")),
    insightCsv(i, { all: true }),
    JSON.stringify(insightJson(i, { all: true })),
    JSON.stringify(insightJsonLd(i)),
    JSON.stringify(insightsFeedDoc([i], { self: "https://example.org/feed", home: "https://example.org/" })),
    JSON.stringify(chartTable(i.spec)),
  ].join("\n");
}

function docs(): Docs {
  return { manifest: structuredClone(BASE.manifest), methods: structuredClone(BASE.methods), evidence: structuredClone(F.evidence), chart: structuredClone(F.chart) };
}

function bundleOf(d: Docs): LoadedBundle {
  return { ...BASE, manifest: d.manifest as LoadedBundle["manifest"], methods: d.methods as LoadedBundle["methods"], findings: [{ ...F, evidence: d.evidence as never, chart: d.chart }] };
}

/** The bundle with the canary appended to the string at `path` ("evidence", "headline", "end"). */
function canaried(path: Path): LoadedBundle {
  const d = docs() as unknown as Record<string, unknown>;
  let o = d as Record<string | number, unknown>;
  for (const seg of path.slice(0, -1)) o = o[seg] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (typeof o[last] !== "string") throw new Error(`${path.join(" / ")} is not a string`);
  o[last] = `${o[last] as string}${CANARY}`;
  return bundleOf(d as unknown as Docs);
}

/** "refused", or "clean" when it builds and prints no canary, or "LEAK". */
function outcome(b: LoadedBundle): "refused" | "clean" | "LEAK" {
  let i: Insight;
  try {
    i = buildInsight(b, "C1-raw");
  } catch {
    return "refused";
  }
  return surfaces(i).includes(CANARY) ? "LEAK" : "clean";
}

const CELL = "SMU01138200000000001|2019|M13";
const CENSUS = "census/cbsa-est2025-alldata.csv";
/** A2's leak list: one string per place the harness found printing before A3. */
const A2_LEAKS: Path[] = [
  ["manifest", "sources", CENSUS, "fetched_at"],
  ["manifest", "sources", CENSUS, "last_modified"],
  ["manifest", "sources", CENSUS, "sha256"],
  ["methods", "robustness", "rows", "R", "windows", "2022->2025", "beat_on_both", "metros", 0, "title"],
  ["evidence", "caveats", 1, "slots", "subject", "label"],
  ["evidence", "caveats", 3, "slots", "metros", "metros", 0, "label"],
  ["evidence", "chart", "fail_closed", 0, "title"],
  ["evidence", "chart", "not_published", 0, "label"],
  ["evidence", "chart", "not_published", 0, "title"],
  ["evidence", "headline", "end"],
  ["evidence", "headline", "join"],
  ["evidence", "headline", "slots", "subject", "label"],
  ["evidence", "headline", "slots", "subject", "title"],
  ["evidence", "numbers", "R.windows.1.t0", "registered", "file"],
  ["evidence", "numbers", "R.windows.1.t0", "registered", "path"],
  ["evidence", "numbers", "R.windows.1.t0", "registered", "sha256"],
  ["evidence", "preconditions", 0, "name"],
  ["evidence", "preconditions", 0, "number"],
  ["evidence", "preconditions", 3, "subject"],
  ["evidence", "preconditions", 4, "rule"],
  ["evidence", "preconditions", 5, "window"],
  ["evidence", "preconditions", 15, "checked", 0],
  ["evidence", "preconditions", 26, "caveat"],
  ["evidence", "random_peer", "slots", "subject", "label"],
  ["evidence", "sources", "ces_sm/sm.data.54.TotalNonFarm.All", "fetched_at"],
  ["chart", "data", 0, "fullLabel"],
  ["chart", "data", 0, "label"],
  ...(["notes", "releasedAt", "retrievedAt"] as const).map((f): Path => (f === "notes" ? ["chart", "provenance", CELL, "notes", 0] : ["chart", "provenance", CELL, f])),
  ...(["license", "name", "publisher", "url"] as const).map((f): Path => ["chart", "provenance", CELL, "source", f]),
  ...(["bubble", "growth"] as const).flatMap((k): Path[] => [["chart", "provenance", k, "retrievedAt"], ...(["license", "name", "publisher", "url"] as const).map((f): Path => ["chart", "provenance", k, "source", f])]),
];

describe("no producer text reaches a printed surface", () => {
  it("prints no canary from any place of A2's leak list: each refuses or prints nothing of it", () => {
    expect(A2_LEAKS).toHaveLength(44);
    const leaks = A2_LEAKS.filter((p) => outcome(canaried(p)) === "LEAK").map((p) => p.join(" / "));
    expect(leaks).toEqual([]);
    // The places that print refuse; the precondition fields the table never printed build clean.
    expect(outcome(canaried(["evidence", "headline", "end"]))).toBe("refused");
    expect(outcome(canaried(["evidence", "preconditions", 4, "rule"]))).toBe("clean");
  });

  it.runIf(process.env.INSIGHTS_TAINT === "1")(
    "prints no canary from any string or any key of the bundle (INSIGHTS_TAINT=1)",
    async () => {
      // Minutes of synchronous builds would starve the worker's RPC with the runner; hand the loop back between builds.
      const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));
      const norm = (seg: string | number) => (typeof seg === "number" ? "[]" : /[0-9:|/.>]/.test(seg) ? "*" : seg);
      const strings = new Map<string, Path[]>();
      const keys = new Map<string, Set<string>>();
      const walk = (v: unknown, p: Path) => {
        if (typeof v === "string") {
          const k = p.map(norm).join(".");
          strings.set(k, [...(strings.get(k) ?? []), p]);
        } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            const pat = [...p, k].map(norm).join(".");
            const s = keys.get(pat) ?? new Set<string>();
            if (s.size < 3) s.add(k);
            keys.set(pat, s);
            walk(x, [...p, k]);
          }
        }
      };
      walk(docs(), []);
      const leaks: string[] = [];
      for (const paths of strings.values()) {
        for (const p of new Set([...paths.slice(0, 3), paths[paths.length - 1]])) {
          if (outcome(canaried(p)) === "LEAK") leaks.push(p.join(" / "));
          await breathe();
        }
      }
      const texts = Object.fromEntries(Object.entries(docs()).map(([k, v]) => [k, JSON.stringify(v)])) as Record<keyof Docs, string>;
      for (const key of new Set([...keys.values()].flatMap((s) => [...s]))) {
        const doc = (t: string) => JSON.parse(t.split(JSON.stringify(key)).join(JSON.stringify(key + CANARY)));
        const b = bundleOf({ manifest: doc(texts.manifest), methods: doc(texts.methods), evidence: doc(texts.evidence), chart: doc(texts.chart) });
        if (outcome(b) === "LEAK") leaks.push(`key ${JSON.stringify(key)}`);
        await breathe();
      }
      expect(leaks).toEqual([]);
    },
    1_800_000,
  );
});
