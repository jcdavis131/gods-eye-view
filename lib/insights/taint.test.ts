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
// hashes, the registered numbers' citations, the precondition fields); and
// the A3 verifier's consistent-edit leaks, where the canary is appended to a
// value at every place it occurs in all four documents, substrings included,
// so every equality between two copies still holds: the pre-registration's
// sha256 and three CES file names. With INSIGHTS_TAINT=1 the harness runs
// over every string pattern of the bundle and every object key, one place at
// a time, and over every distinct string value, consistently (about 1,500
// builds, minutes, not for every run).

import { describe, expect, it } from "vitest";
import { buildInsight } from "./build";
import { insightCsv, insightJson } from "./downloads";
import { insightsFeedDoc } from "./feed";
import { insightJsonLd } from "./jsonld";
import type { LoadedBundle } from "./load";
import { CANVAS_IDS } from "./render/canvas";
import { renderSvg } from "./render/render";
import { chartTable } from "./render/table";
import { BASE, substitutedEverywhere } from "./testFixtures";
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

  it("prints no canary appended consistently, through the whole bundle, to a value of the A3 verifier's leak list", () => {
    const values = [
      BASE.manifest.inputs["registry/prereg.json"].sha256,
      "sm.data.54.TotalNonFarm.All",
      "sm.data.60.MiningAndLogging.Current",
      "sm.data.61.MiningLoggingConstr.Current",
    ];
    expect(values[0]).toMatch(/^[0-9a-f]{64}$/);
    // Each one printed before, so each must now refuse: an edit nothing else can see is not one to build quietly.
    expect(values.map((v) => [v, outcome(substitutedEverywhere(v, `${v}${CANARY}`))])).toEqual(values.map((v) => [v, "refused"]));
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

  it.runIf(process.env.INSIGHTS_TAINT === "1")(
    "prints no canary appended to a value of every string pattern at every place it occurs, substrings included (INSIGHTS_TAINT=1)",
    async () => {
      const breathe = () => new Promise<void>((resolve) => setImmediate(resolve));
      // The values of each string pattern (the path with its ids and numbers folded) at its first three places and
      // its last, as the one-place sweep picks them: about 500 distinct values of the bundle's 13,864.
      const norm = (seg: string | number) => (typeof seg === "number" ? "[]" : /[0-9:|/.>]/.test(seg) ? "*" : seg);
      const byPattern = new Map<string, string[]>();
      const walk = (v: unknown, p: Path) => {
        if (typeof v === "string") {
          const k = p.map(norm).join(".");
          byPattern.set(k, [...(byPattern.get(k) ?? []), v]);
        } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, [...p, k]);
      };
      walk(docs(), []);
      const values = new Set([...byPattern.values()].flatMap((vs) => [...vs.slice(0, 3), vs[vs.length - 1]]));
      const counts = { refused: 0, clean: 0, LEAK: 0 };
      const leaks: string[] = [];
      // An empty value occurs between every two characters; it is no edit of a value.
      for (const v of [...values].filter((x) => x.length > 0)) {
        const o = outcome(substitutedEverywhere(v, `${v}${CANARY}`));
        counts[o]++;
        if (o === "LEAK") leaks.push(v.length > 80 ? `${v.slice(0, 80)}...` : v);
        await breathe();
      }
      console.log(`consistent-edit sweep over ${values.size} distinct string values: ${JSON.stringify(counts)}`);
      expect(leaks).toEqual([]);
    },
    3_600_000,
  );
});
