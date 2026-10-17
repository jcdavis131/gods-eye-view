// An in-memory vector index of the records loaded on the globe, built on
// demand in the browser from each feature's record text
// (properties.extra.embedText, written by recordText in the route builders).
// Features without record text are skipped. Nothing is persisted: the index
// is rebuilt per session from what is loaded, so it can never outlive the
// records' freshness. Pure apart from the embedder it is given.

import { receivedRecordText } from "@/lib/catalog/recordText";
import type { LayerFeature } from "@/lib/layers/types";
import { dot, type Embedder } from "./types";

/**
 * At most this many record vectors (1 KB each, so about 20 MB). Chosen, not measured: real
 * loaded-feature counts per session have not been recorded. Past it, the oldest entries go.
 */
export const RECORD_INDEX_CAP = 20_000;

export const featureKey = (f: LayerFeature) => `${f.properties.layer}:${f.properties.id}`;

export interface RecordHit {
  feature: LayerFeature;
  score: number;
}

export class RecordIndex {
  private readonly vecs = new Map<string, { text: string; v: Float32Array; f: LayerFeature }>();

  constructor(
    readonly embedder: Embedder,
    private readonly cap = RECORD_INDEX_CAP,
  ) {}

  get size(): number {
    return this.vecs.size;
  }

  /** Make the index hold exactly the given features' record vectors (re-embedding only new or changed text). */
  sync(features: Iterable<LayerFeature>): void {
    const seen = new Set<string>();
    for (const f of features) {
      const text = receivedRecordText(f.properties);
      if (!text) continue;
      const k = featureKey(f);
      seen.add(k);
      const had = this.vecs.get(k);
      if (had && had.text === text) {
        had.f = f;
        continue;
      }
      const v = this.embedder.embed(text);
      if (!v) continue;
      this.vecs.delete(k);
      this.vecs.set(k, { text, v, f });
      if (this.vecs.size > this.cap) this.vecs.delete(this.vecs.keys().next().value!);
    }
    for (const k of [...this.vecs.keys()]) if (!seen.has(k)) this.vecs.delete(k);
  }

  /** Records with cosine >= tau to the query vector, best first, skipping `exclude` keys. */
  search(q: Float32Array, k: number, tau: number, exclude: ReadonlySet<string> = new Set()): RecordHit[] {
    const hits: RecordHit[] = [];
    for (const [key, e] of this.vecs) {
      if (exclude.has(key)) continue;
      const s = dot(q, e.v);
      if (s >= tau) hits.push({ feature: e.f, score: s });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
