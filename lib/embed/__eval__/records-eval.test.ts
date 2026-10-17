// The records-by-meaning eval as a regression guard on RECORD_TAU (the palette's "By meaning"
// threshold). It reads three files beside it:
//
//   records-queries.json  hand-written queries and judgements (v2: 69 real queries, 26 controls),
//                         written by the eval agent before any v2 query was scored, labelled
//                         "not user queries". Its sha256 is pinned below, so editing it after
//                         seeing scores fails the test.
//   records-corpus.json   record text only ({card, embedText, source, retrievedAt, n}): 3,178
//                         real records from the 16 record-vector cards, the captured fixtures
//                         plus the 2026-10-17 keyless pulls, as 780 distinct rows with a count.
//                         No names, ids or vectors: recordText never emits a name.
//   records-results.json  the per-query output of the run these numbers come from.
//
// This is a regression guard, not the evidence for lifting ?semantic=1: the same agent wrote the
// queries and chose tau on them, so tau passes by construction. Lifting the flag waits on a blind
// query set judged against the bars in the eval's DESIGN (P >= 0.65, R@8 >= 0.45, empty <= 0.30,
// zero control rows). Cost: the pinned weights plus 3,178 record embeds, about 0.1 s and 150 MB.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { potionNode } from "@/lib/embed/loadNode";
import { RecordIndex, featureKey } from "@/lib/embed/recordIndex";
import { RECORD_TAU } from "@/lib/embed/recordTau";
import { queryText } from "@/lib/catalog/recordText";
import { RECORD_VECTOR_CARDS } from "@/lib/catalog/embedFields";
import type { LayerFeature } from "@/lib/layers/types";

const DIR = path.join(process.cwd(), "lib/embed/__eval__");
const QUERIES_SHA256 = "c439e9f35ba04351363eae2ee1be4e4b536f55e7d89775eda7eff7bfa67e9c45";
/** RECORD_ROWS in the palette. */
const K = 8;

type Rule = { card: string; field?: string; values?: string[]; prefixes?: string[]; grade: number };
type Query = { id: string; kind: "collection" | "value" | "control"; q: string; judge: Rule[] };
type Row = { card: string; embedText: string; n: number };

const rawQ = readFileSync(path.join(DIR, "records-queries.json"));
const queries: Query[] = JSON.parse(rawQ.toString()).queries;
const corpus: Row[] = JSON.parse(readFileSync(path.join(DIR, "records-corpus.json"), "utf8"));

function fields(t: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of t.split("; ")) {
    const i = part.indexOf(": ");
    if (i > 0 && !m.has(part.slice(0, i))) m.set(part.slice(0, i), part.slice(i + 2));
  }
  return m;
}

/** A record's grade for a query: the highest rule that matches its card and, if given, a published value. */
function grade(q: Query, r: Row): number {
  let g = 0;
  const f = fields(r.embedText);
  for (const rule of q.judge) {
    if (rule.card !== r.card) continue;
    if (rule.field) {
      const v = f.get(rule.field);
      if (v == null || !(rule.values?.includes(v) || rule.prefixes?.some((p) => v.startsWith(p)))) continue;
    }
    g = Math.max(g, rule.grade);
  }
  return g;
}

// Measured 2026-10-17 on the files above (DESIGN "Run 2 (16 cards)"). P is precision over the
// queries that showed anything, R is recall@8 (relevant shown / min(8, relevant)) over all 69 real
// queries, empty is the share of real queries that showed nothing. A deliberate change to tau, the
// weights or the record text updates this table.
const MEASURED: Record<string, { P: number; R: number; empty: number }> = {
  "0.4": { P: 0.73, R: 0.627, empty: 0.145 },
  "0.6": { P: 0.83, R: 0.223, empty: 0.638 },
};
const TOL = 0.02;

describe("records by meaning (hand-written eval, labelled as such)", () => {
  const model = potionNode();
  const rows = corpus.flatMap((r) => Array.from({ length: r.n }, () => r));
  const feats = rows.map((r, i) => ({ type: "Feature", geometry: null, properties: { layer: r.card, id: String(i), name: "", extra: { embedText: r.embedText } } }) as unknown as LayerFeature);
  const rowOf = new Map(feats.map((f, i) => [featureKey(f), rows[i]]));
  const index = new RecordIndex(model);
  index.sync(feats);

  const run = (q: Query, tau: number) => {
    const text = queryText(q.q);
    const v = text ? model.embed(text) : null;
    const hits = v ? index.search(v, K, tau) : [];
    const rel = hits.filter((h) => grade(q, rowOf.get(featureKey(h.feature))!) === 2).length;
    const nRel = rows.filter((r) => grade(q, r) === 2).length;
    return { shown: hits.length, rel, recall: nRel ? rel / Math.min(K, nRel) : 0 };
  };

  it("the query set is the pre-registered v2 one", () => {
    expect(createHash("sha256").update(rawQ).digest("hex")).toBe(QUERIES_SHA256);
  });

  it("the corpus is every record-vector card, 3,178 records", () => {
    expect(new Set(corpus.map((r) => r.card))).toEqual(RECORD_VECTOR_CARDS);
    expect(rows.length).toBe(3178);
    expect(index.size).toBe(3178);
  });

  it("every real query has a relevant record loaded, and no control has one", () => {
    for (const q of queries) {
      const nRel = rows.filter((r) => grade(q, r) === 2).length;
      if (q.kind === "control") expect(nRel, q.id).toBe(0);
      else expect(nRel, q.id).toBeGreaterThan(0);
    }
  });

  it("controls (nothing relevant loaded) show no record at RECORD_TAU", () => {
    const leaks = queries.filter((q) => q.kind === "control").filter((q) => run(q, RECORD_TAU).shown > 0).map((q) => q.q);
    expect(leaks).toEqual([]);
  });

  it("real queries: precision, recall@8 and empty match the measured run at RECORD_TAU", () => {
    const m = MEASURED[String(RECORD_TAU)];
    expect(m, `no measured row for RECORD_TAU ${RECORD_TAU}`).toBeDefined();
    const real = queries.filter((q) => q.kind !== "control").map((q) => run(q, RECORD_TAU));
    const shown = real.filter((r) => r.shown > 0);
    const precision = shown.reduce((s, r) => s + r.rel / r.shown, 0) / shown.length;
    const recall = real.reduce((s, r) => s + r.recall, 0) / real.length;
    const empty = 1 - shown.length / real.length;
    expect(Math.abs(precision - m.P), `P ${precision.toFixed(3)}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(recall - m.R), `R ${recall.toFixed(3)}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(empty - m.empty), `empty ${empty.toFixed(3)}`).toBeLessThanOrEqual(TOL);
  });
});
