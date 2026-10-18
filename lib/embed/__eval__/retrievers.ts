// Test-only retrievers for the blind search eval (writeups/eye-embeddings-2026-10-16/search-eval).
// Nothing in the shipped palette imports this file: the palette still has letters plus, behind
// ?semantic=1, meaning with RECORD_TAU. These three arms exist so the blind set can compare them
// on the same record text before any of them is wired in.
//
//   embedRanker  cosine of the query vector to each record vector, the palette's arm, but with no
//                tau: the eval pools the top-n and picks tau afterwards on the blind set only.
//   Bm25         Okapi BM25 over the same record text, with the tokenizer the records eval used for
//                its word-overlap arm (DESIGN runs 1-4), so the two lexical arms are comparable.
//   rrf          reciprocal-rank fusion of any ranked lists (the hybrid is rrf([bm25, embed])).
//
// Documents are distinct (card, record text) pairs, as in DESIGN run 3 onwards: thousands of
// loaded records share a text (617 RCRA rows have one), and a pool of top-10 identical texts
// would judge one record ten times. Each doc keeps its loaded count `n` for reporting.
//
// Pure apart from the embedder it is given; no dependency beyond the repo's own embed code.

import { queryText, receivedRecordText } from "@/lib/catalog/recordText";
import { dot, type Embedder } from "@/lib/embed/types";

export interface Doc {
  /** `${card}\t${text}`: unique per distinct (card, record text). */
  id: string;
  card: string;
  text: string;
  /** How many loaded records carry this text. */
  n: number;
}

export interface Hit {
  id: string;
  score: number;
}

export const docId = (card: string, text: string) => `${card}\t${text}`;

/** Collapse corpus rows ({card, embedText, n}) to distinct (card, text) docs, summing n. */
export function distinctDocs(rows: ReadonlyArray<{ card: string; embedText: string; n: number }>): Doc[] {
  const m = new Map<string, Doc>();
  for (const r of rows) {
    const id = docId(r.card, r.embedText);
    const had = m.get(id);
    if (had) had.n += r.n;
    else m.set(id, { id, card: r.card, text: r.embedText, n: r.n });
  }
  return [...m.values()];
}

// ---------------------------------------------------------------- tokenizer

/** The records eval's stop list (run-records-eval-run3.mts), unchanged so BM25 matches the word-overlap arm. */
export const STOP: ReadonlySet<string> = new Set(
  "a an and the of in on to for or with at by from is are be that this still need needs no yes".split(" "),
);

/**
 * Lower case, split on anything not a-z or 0-9, drop one-letter tokens and STOP words, fold one
 * trailing "s". Note what this cannot do: "no" and "yes" are stop words, so "helipad: No" and
 * "helipad: Yes" tokenize alike, and BM25 is as blind to that polarity as word overlap was.
 */
export function tokenize(s: string, stop: ReadonlySet<string> = STOP): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !stop.has(w))
    .map((w) => w.replace(/s$/, ""));
}

// ---------------------------------------------------------------- BM25

export interface Bm25Params {
  /** Term-frequency saturation. 1.2 is the usual default; not tuned here. */
  k1: number;
  /** Length normalisation. 0.75 is the usual default; not tuned here. */
  b: number;
}

export const BM25_DEFAULTS: Bm25Params = { k1: 1.2, b: 0.75 };

/**
 * Okapi BM25 with the Lucene idf, log(1 + (N - df + 0.5) / (df + 0.5)), which stays positive for
 * terms in more than half the docs (field labels such as "state" are in most of a card's texts).
 * Scores are only comparable within one query.
 */
export class Bm25 {
  private readonly tf: Array<Map<string, number>>;
  private readonly len: number[];
  private readonly avgLen: number;
  private readonly idf = new Map<string, number>();
  private readonly postings = new Map<string, number[]>();

  constructor(
    readonly docs: ReadonlyArray<Doc>,
    readonly params: Bm25Params = BM25_DEFAULTS,
  ) {
    this.tf = docs.map((d) => {
      const m = new Map<string, number>();
      for (const t of tokenize(d.text)) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    this.len = docs.map((_, i) => [...this.tf[i].values()].reduce((s, x) => s + x, 0));
    this.avgLen = this.len.reduce((s, x) => s + x, 0) / Math.max(1, docs.length);
    this.tf.forEach((m, i) => {
      for (const t of m.keys()) {
        const p = this.postings.get(t);
        if (p) p.push(i);
        else this.postings.set(t, [i]);
      }
    });
    const N = docs.length;
    for (const [t, p] of this.postings) this.idf.set(t, Math.log(1 + (N - p.length + 0.5) / (p.length + 0.5)));
  }

  /** Docs with score > 0, best first, at most `n`; ties broken by doc order (stable). */
  search(q: string, n: number): Hit[] {
    const { k1, b } = this.params;
    const terms = [...new Set(tokenize(q))];
    const score = new Map<number, number>();
    for (const t of terms) {
      const idf = this.idf.get(t);
      const p = this.postings.get(t);
      if (idf == null || !p) continue;
      for (const i of p) {
        const f = this.tf[i].get(t)!;
        const s = (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * this.len[i]) / this.avgLen));
        score.set(i, (score.get(i) ?? 0) + s);
      }
    }
    return [...score]
      .sort((x, y) => y[1] - x[1] || x[0] - y[0])
      .slice(0, n)
      .map(([i, s]) => ({ id: this.docs[i].id, score: s }));
  }
}

// ---------------------------------------------------------------- embedding

/**
 * The palette's meaning arm over distinct docs, without tau: every doc is ranked by cosine.
 * Record text goes through receivedRecordText and the query through queryText, as in the palette,
 * so an over-long or empty query returns no hits rather than a different embedding.
 */
export function embedRanker(embedder: Embedder, docs: ReadonlyArray<Doc>) {
  const vecs: Array<{ id: string; v: Float32Array }> = [];
  for (const d of docs) {
    const t = receivedRecordText({ extra: { embedText: d.text } });
    const v = t ? embedder.embed(t) : null;
    if (v) vecs.push({ id: d.id, v });
  }
  return {
    size: vecs.length,
    search(q: string, n: number): Hit[] {
      const t = queryText(q);
      const qv = t ? embedder.embed(t) : null;
      if (!qv) return [];
      return vecs
        .map((e, i) => ({ id: e.id, score: dot(qv, e.v), i }))
        .sort((x, y) => y.score - x.score || x.i - y.i)
        .slice(0, n)
        .map(({ id, score }) => ({ id, score }));
    },
  };
}

// ---------------------------------------------------------------- fusion and pooling

/** The usual RRF constant (Cormack et al. 2009); not tuned here. */
export const RRF_K = 60;

/**
 * Reciprocal-rank fusion: each doc scores sum over lists of 1 / (k + rank), rank from 1. A doc
 * missing from a list gets nothing from it. Ties broken by first appearance across the lists.
 */
export function rrf(lists: ReadonlyArray<ReadonlyArray<Hit>>, n: number, k: number = RRF_K): Hit[] {
  const score = new Map<string, number>();
  const first = new Map<string, number>();
  let seq = 0;
  for (const list of lists)
    list.forEach((h, r) => {
      score.set(h.id, (score.get(h.id) ?? 0) + 1 / (k + r + 1));
      if (!first.has(h.id)) first.set(h.id, seq++);
    });
  return [...score]
    .sort((x, y) => y[1] - x[1] || first.get(x[0])! - first.get(y[0])!)
    .slice(0, n)
    .map(([id, s]) => ({ id, score: s }));
}

/** Depth each arm feeds into RRF before fusion. */
export const FUSION_DEPTH = 50;

/** The three arms over one corpus, and the judging pool (union of each arm's top `depth`). */
export function retrievers(embedder: Embedder, docs: ReadonlyArray<Doc>) {
  const bm25 = new Bm25(docs);
  const embed = embedRanker(embedder, docs);
  const hybrid = (q: string, n: number) => rrf([bm25.search(q, FUSION_DEPTH), embed.search(q, FUSION_DEPTH)], n);
  return {
    bm25: (q: string, n: number) => bm25.search(q, n),
    embed: (q: string, n: number) => embed.search(q, n),
    hybrid,
    /** Distinct doc ids in any arm's top `depth` (10 for the blind eval), in first-seen order: bm25, embed, hybrid. */
    pool(q: string, depth = 10): string[] {
      const ids = new Set<string>();
      for (const arm of [bm25.search(q, depth), embed.search(q, depth), hybrid(q, depth)]) for (const h of arm) ids.add(h.id);
      return [...ids];
    },
  };
}
