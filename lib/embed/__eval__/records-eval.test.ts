// The records-by-meaning eval as a regression guard on RECORD_TAU (the palette's "By meaning"
// threshold). It reads three files beside it:
//
//   records-queries.json  hand-written queries and judgements (v3: 89 real queries, 37 controls;
//                         every v2 query unchanged plus queries and controls for bia-lar and
//                         wrc-communities), written by the eval agent before any v3 query was
//                         scored, labelled "not user queries". Its sha256 is pinned below, so
//                         editing it after seeing scores fails the test.
//   records-corpus.json   record text only ({card, embedText, source, retrievedAt, n}): 4,067
//                         real records from the 18 record-vector cards, the captured fixtures
//                         plus the 2026-10-17 keyless pulls, as 1,145 rows with a count (one row
//                         per card, text, source and retrieval time; 1,132 distinct card and text
//                         pairs). No ids or vectors, and no person's name. One reviewed name field
//                         is embedded: bia-lar's LARNAME (BIA land area names, never a person's;
//                         Cam's call, 2026-10-17), beside its BIA region under a card-scoped
//                         label (DESIGN 7.3a, run 4).
//   records-results.json  the per-query output of the run these numbers come from.
//
// This is a regression guard, not the evidence for lifting ?semantic=1: the same agent wrote the
// queries and chose tau on them, so tau passes by construction. Lifting the flag waits on a blind
// query set judged against the bars in the eval's DESIGN (P >= 0.65, R@8 >= 0.45, empty <= 0.30,
// zero control rows). Cost: the pinned weights plus 4,067 record embeds, about 0.15 s and 150 MB.
//
// When a card joins RECORD_VECTOR_CARDS, the coverage test fails and its message says what to do
// (NEW_CARD_STEPS). The eval's scripts and DESIGN are in the writeups folder named there.
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
const QUERIES_SHA256 = "28159658766af83f766c9c5ddcd7b6de4202350caea7cbb3c50016e568792a8f";
const RECORDS = 4067;
/** What to do when the corpus and RECORD_VECTOR_CARDS disagree (printed by the coverage test). */
const NEW_CARD_STEPS = [
  "The records eval must be re-run for the new card set (writeups/eye-embeddings-2026-10-16/records-eval, DESIGN.md, latest \"Run N\"):",
  "1. Pull real records for each missing card with the latest pull-records-runN.mts: its captured fixtures (recordFixtures()) plus keyless live boxes through the route's own builder. Save text only.",
  "2. Append them to records-corpus.json as {card, embedText, source, retrievedAt, n} rows (drop the rows of any extra card), and update RECORDS.",
  "3. Write queries.v(N+1).json: every earlier query unchanged, plus collection and value queries and controls for the new card. Write the judgements before scoring, sha256 it, make it read-only, copy it byte for byte to records-queries.json and update QUERIES_SHA256.",
  "4. Re-run the sweep at every tau (run-records-eval-runN.mts). If RECORD_TAU still has no control row and passes the DESIGN 7.2 bars, re-pin MEASURED and records-results.json; if not, report the numbers and change RECORD_TAU only to the lowest step that passes.",
  "5. Append \"Run N+1\" to DESIGN.md.",
].join("\n");
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

// Measured 2026-10-17 on the files above (DESIGN "Run 4 (7.3a)": run 3's corpus with the bia-lar
// and wrc-communities record text rebuilt from the same rows). P is precision over the
// queries that showed anything, R is recall@8 (relevant shown / min(8, relevant)) over all 89 real
// queries, empty is the share of real queries that showed nothing. A deliberate change to tau, the
// weights or the record text updates this table.
const MEASURED: Record<string, { P: number; R: number; empty: number }> = {
  "0.4": { P: 0.758, R: 0.647, empty: 0.157 },
  "0.6": { P: 0.863, R: 0.222, empty: 0.652 },
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

  it("the query set is the pre-registered v3 one", () => {
    expect(createHash("sha256").update(rawQ).digest("hex")).toBe(QUERIES_SHA256);
  });

  it("the corpus is every record-vector card, 4,067 records", () => {
    const inCorpus = new Set(corpus.map((r) => r.card));
    const missing = [...RECORD_VECTOR_CARDS].filter((c) => !inCorpus.has(c)).sort();
    const extra = [...inCorpus].filter((c) => !RECORD_VECTOR_CARDS.has(c)).sort();
    expect({ missing, extra }, `records-corpus.json and RECORD_VECTOR_CARDS disagree (missing from the corpus: ${missing.join(", ") || "none"}; in the corpus but no longer record-vector cards: ${extra.join(", ") || "none"}).\n${NEW_CARD_STEPS}`).toEqual({ missing: [], extra: [] });
    expect(rows.length).toBe(RECORDS);
    expect(index.size).toBe(RECORDS);
  });

  it("every real query has a relevant record loaded, and no control has one", () => {
    for (const q of queries) {
      const nRel = rows.filter((r) => grade(q, r) === 2).length;
      if (q.kind === "control") expect(nRel, q.id).toBe(0);
      else expect(nRel, q.id).toBeGreaterThan(0);
    }
  });

  // Run 3 (18 cards) found no tau step that passes. Run 4 (DESIGN 7.3a: category words in the
  // bia-lar and wrc-communities record text) still finds none: at 0.4, 6 of the 37 controls show a
  // row ("wildfire perimeters" on a WRC community, four tribal controls on BIA land areas, "evacuation
  // zones" on an NFHL zone), and the first step with none, 0.55, fails recall and empty. This test
  // fails until that is decided (DESIGN "Run 4 (7.3a)"); it is not relaxed here.
  it("controls (nothing relevant loaded) show no record at RECORD_TAU", () => {
    const leaks = queries
      .filter((q) => q.kind === "control")
      .map((q) => {
        const text = queryText(q.q);
        const v = text ? model.embed(text) : null;
        return { q, hits: v ? index.search(v, K, RECORD_TAU) : [] };
      })
      .filter((x) => x.hits.length > 0)
      .map(({ q, hits }) => `${q.id} "${q.q}" -> ${rowOf.get(featureKey(hits[0].feature))!.card} ${hits[0].score.toFixed(3)} (${hits.length} row${hits.length === 1 ? "" : "s"})`);
    expect(leaks, `controls showing a row at RECORD_TAU ${RECORD_TAU}`).toEqual([]);
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
