// Shapes of an imported places bundle (scripts/places-model-import.mjs copies
// one into lib/insights/data/<bundle>/) and of the Insight that
// lib/insights/build.ts assembles from it for the /insights pages.
//
// The bundle types name only the fields this side reads. The producer
// (vector-places places.export) writes more; nothing here depends on it.
// Every number an Insight prints is a `value` read from the evidence's
// `numbers` table, addressed by its key: a published cell, or an estimate
// computed from published cells whose formula the page prints. Every
// published cell behind it is a provenance tuple that the importer resolved
// to a hashed upstream file.

import type { Provenance } from "@/lib/provenance/types";
import type { ChartSpec } from "./render/spec";

// ---------------------------------------------------------------- the bundle

export interface ManifestFile {
  sha256: string;
  bytes: number;
}

export interface SourceEntry {
  url: string;
  sha256: string;
  bytes: number;
  last_modified: string | null;
  etag: string | null;
  fetched_at: string;
  /** The producer's registry id: bls_ces_sm_data, qcew_msa_area, omb_list1_2023, census_cbsa_est2025, ... */
  source: string;
}

export interface ManifestFinding {
  chart: string;
  evidence: string;
  panel: string;
  template: string;
}

export interface BundleManifest {
  bundle: string;
  release: string;
  rules_version: number;
  status: string;
  panels: Record<string, string>;
  files: Record<string, ManifestFile>;
  findings: Record<string, ManifestFinding>;
  inputs: Record<string, ManifestFile>;
  sources: Record<string, SourceEntry>;
}

/** One entry of evidence.numbers. `provenance` holds series_id|year|period|value|footnote|url|sha256|last_modified tuples. */
export interface EvidenceNumber {
  kind: "growth" | "rank" | "count" | "median" | "change" | "cell" | "registered" | "probability";
  value: number | null;
  formula?: string;
  provenance: string[];
  over?: string[];
  metros?: string[];
  subject?: string;
  null_reason?: string;
  registered?: { file: string; path: string; sha256: string; bytes: number };
  /** A universe count: the pre-registered size it must equal. */
  registered_n?: number;
  /** A probability: (m / n)^k, exact, as a reduced fraction of decimal integers, and the arithmetic written out. */
  k?: number;
  m?: number;
  n?: number;
  not_beaten?: string[];
  exact?: { numerator: string; denominator: string };
  arithmetic?: string;
}

export interface MetroRef {
  cbsa: string;
  label: string;
  title: string;
  reason?: string;
}

/**
 * A template slot. A template that carries the unit ("grew {a}%", "from
 * {v0}k") takes a bare number (num); a slot that prints its own unit
 * (signedPct, "+36.0%") is never followed by one. sentence.ts fill() refuses
 * either mismatch, so a sentence prints exactly one % per number.
 */
export type Slot =
  | { format: "year"; number: string; value: number; period?: string }
  | { format: "num"; number: string; value: number; digits?: number }
  | { format: "signedPct"; number: string; value: number; digits: number }
  | { format: "ordinal"; number: string; value: number }
  | { format: "list"; number?: string; metros: MetroRef[] }
  /** A place: prints its short label. */
  | ({ format?: undefined } & MetroRef)
  /** A whole number with no format (the universe line's slots), printed as written, like the producer's str.format. */
  | { format?: undefined; number: string; value: number };

export interface Clause {
  id: string;
  text: string;
  printed: boolean;
  /** Slot names, in the order the text uses them. */
  slots: string[];
}

export interface Caveat {
  id: string;
  text: string;
  printed: boolean;
  slots?: Record<string, Slot>;
  reason?: string;
  /** The robustness row and window a caveat reads (the recency caveat: R, 2022->2025). */
  row?: string;
  window?: string;
}

export interface Precondition {
  name: string;
  gates: string;
  pass: boolean;
  threshold: string;
  value: number | boolean | null;
  number?: string;
  metros?: string[];
  window?: string;
  caveat?: string;
  reason?: string;
}

/** A template choice with its registered alternatives: the chart title and subtitle ladders. */
export interface Rung {
  id: string;
  text: string;
}

export interface EvidenceSet {
  axis: string;
  row: string;
  window?: string;
  formula: string;
  /** The set's members: the metros with a value; each carries its value and series ids. */
  members: Record<string, unknown>;
  /** The universe's metros left out of the set, each with its reason. */
  excluded?: Record<string, string>;
  /** A universe set: the cells it ranks on, by end ("t0": [[2019, "M13"]]). */
  periods?: Record<string, Array<[number, string]>>;
  /** A universe set: the last metro in and the first one out, keyed rank_<n>. */
  cutoff?: Record<string, { cbsa: string; title: string; value: number }>;
}

export interface Evidence {
  finding_id: string;
  release: string;
  rules_version: number;
  panel: string;
  status: string;
  subject: string;
  template: string;
  headline: {
    id: string;
    primary: boolean;
    join: string;
    end: string;
    clauses: Clause[];
    slots: Record<string, Slot>;
    method_line: { id: string; text: string };
    never_used: string[];
    rule?: { H3b?: { gating_rows?: string[] } };
  };
  random_peer: {
    id: string;
    text: string;
    printed: boolean;
    slots: Record<string, Slot>;
    grid: Record<string, { number: string; value: number }>;
    rule: { k: number; k_grid: number[]; rule: string };
  };
  caveats: Caveat[];
  chart: {
    sidecar: string;
    title: { id: string; text: string; slots: Record<string, Slot>; ladder?: Rung[] };
    universe_line: { id: string; text: string; slots: Record<string, Slot> };
    dek: { id: string; text: string; slots: Record<string, Slot>; ladder?: Rung[]; caveat?: string };
    subject_note: { id: string; text: string; slots: Record<string, Slot> } | null;
    rows: Record<string, { x: string; y: string; size: string }>;
    plotted: number;
    medians: Record<string, { number: string; value: number }>;
    labels: { requested: Array<{ id: string; label: string; why: string }>; max: number; canvases: string[]; priority: string[]; rule: string };
    not_published: MetroRef[];
    fail_closed: Array<{ cbsa: string; title: string; qcew_code: string; members_without_2019_weight: string[] }>;
  };
  numbers: Record<string, EvidenceNumber>;
  sets: Record<string, EvidenceSet>;
  preconditions: Precondition[];
  suppressed: Array<{ clause: string; reason: string; preconditions: Precondition[] }>;
  sources: Record<string, SourceEntry>;
  /** Every cell the evidence read, by source key, series and "year|period": "value|footnote". */
  cells?: Record<string, Record<string, Record<string, string>>>;
}

export interface RobustnessWindow {
  n: number;
  subject: string;
  publishable: { number: string; value: number };
  axes: Record<string, { growth_pct: { number: string; value: number }; rank: { number: string; value: number } }> | null;
  rank_min?: { number: string; value: number };
  beat_on_both?: { number: string; value: number; metros: Array<{ id: string; title: string }> };
  beat_on_either?: { number: string; value: number; metros: Array<{ id: string; title: string }> };
}

export interface RobustnessRow {
  kind: "definition" | "end_year" | "peers" | "disclosure" | "cross_source";
  /** The clauses this row gates; empty when it is reported only. */
  gates: string[];
  registered: Record<string, unknown> & { rule?: string; largest_n?: number; ranked_by?: string; window?: { t0: number; t1: number | string }; source_ids?: string[] };
  windows: Record<string, RobustnessWindow>;
}

export interface Methods {
  release: string;
  status: string;
  panel_a: {
    finding: string;
    is: string[];
    is_not: string[];
    method_line: string;
    headline: { clauses: Record<string, boolean>; h3b_gates: { registered: string; rows: string[] } };
  };
  panel_b: { status: string; text: string; gate: Array<{ name: string; rule: string; status: string }> };
  robustness: { gating: Record<string, string[]>; rows: Record<string, RobustnessRow> };
  status_line: { id: string; slots: { status: string; panel_a: string; panel_b: string } };
}

// ---------------------------------------------------------------- the insight

/** One published cell behind a printed number, with the file it was read from and its citation. */
export interface CellCitation {
  seriesId: string;
  period: string;
  /** The value as published (its text), and the footnote code, empty when none. */
  value: string;
  footnote: string;
  /** The upstream file, its sha256 and Last-Modified header as the evidence tuple and the manifest record them. */
  url: string;
  sha256: string;
  lastModified: string;
  provenance: Provenance;
  /** citation() of the cell, then the file's sha256 and Last-Modified. */
  citation: string;
}

/** A printed number, how it was computed, and the cells it reads. */
export interface ArithmeticRow {
  /** Where it is printed: "Headline", "Caveat: recency", "Random peer", "Chart title", ... */
  where: string;
  slot: string;
  /** Exactly the characters printed in the sentence. */
  printed: string;
  /** The evidence.numbers key. */
  number: string;
  kind: EvidenceNumber["kind"];
  formula: string;
  /** For a probability: the exact arithmetic, e.g. "(147 / 148)^10 = 4711653532607691047049 / 5042166166892418433024". */
  arithmetic?: string;
  /** Comparison sets a rank, count, median or probability runs over. */
  over: string[];
  cells: CellCitation[];
  /** For a registered number: the pre-registration it cites. */
  registered?: string;
}

export interface RobustnessSummary {
  id: string;
  kind: RobustnessRow["kind"];
  /** What the row changes, from its registered entry. */
  change: string;
  window: string;
  /** Per axis, office-type first: label, printed growth, printed rank, evidence keys. */
  axes: Array<{ axis: string; label: string; growth: string; rank: string; numbers: [string, string] }>;
  beatOnBoth: { count: string; names: string[]; number: string } | null;
  /** "149 of 150": the evidence's publishable count over the size of the row's universe, both read from the evidence. */
  publishable: string;
  /** The evidence count behind the numerator and the sets whose universe is the denominator. */
  denominator: { number: string; sets: string[] };
  /** The clauses this row gates (empty: reported only). */
  gates: string[];
  /** The distinct upstream files this row's numbers read, and any file that chose its peer set, as citations. */
  sources: string[];
}

/** An upstream file that shapes who is compared rather than a plotted value: the metro delineation, the P1 peer ranking. */
export interface ShapingSource {
  /** The producer's registry id. */
  id: string;
  /** What it decides, as printed on the page. */
  role: string;
  url: string;
  /** ISO 8601 for what the file describes ("2023-07", "2025"). */
  coverage: string;
  /** Whether the chart's own rows depend on it (the universe), or only a robustness row. */
  chart: boolean;
  provenance: Provenance;
  citation: string;
}

/** An upstream file the chart's rows were read from, once, with the years actually read from it. */
export interface FileCitation {
  url: string;
  provenance: Provenance;
  /** The distinct years the chart reads from this file, ascending. */
  years: number[];
  citation: string;
}

export interface Insight {
  /** The finding id in the bundle ("C1-raw"). */
  id: string;
  slug: string;
  bundle: string;
  release: string;
  rulesVersion: number;
  status: string;
  panel: string;
  /** The headline sentence, from the registered templates. */
  headline: string;
  /**
   * The headline as a page's description, a card's and a Report's: when the
   * H3b clause prints, followed by the recency caveat, which precondition
   * h3b.recency_caveat_prints says prints with it wherever it prints.
   */
  description: string;
  /** The chart's own title (sidecar headline), from its template. */
  chartTitle: string;
  /**
   * Whether the H3b clause prints, which it does only when its gate held.
   * When it does not, its words appear nowhere in the insight (build.ts
   * refuses one that carries them) and the page names it only by its id.
   */
  h3bPrinted: boolean;
  dek: string;
  universe: string;
  subject: MetroRef;
  spec: ChartSpec;
  /** The registered window, from the evidence's registered numbers. */
  window: { t0: number; t1: number };
  /** The date the numbers are as of (sidecar asOf). */
  asOf: string;
  /** The latest retrieval time among the chart's provenance records: the bundle's own stamp, never a clock. */
  retrievedAt: string;
  caveats: Array<{ id: string; text: string }>;
  /** The random-peer sentence, when it prints. */
  randomPeer: string | null;
  /** The random-peer probability at each k of the registered grid, as printed, with its evidence key and exact arithmetic. */
  randomPeerGrid: Array<{ k: number; printed: string; number: string; arithmetic: string }>;
  notPrinted: Array<{ id: string; reason: string }>;
  methodLine: string;
  statusNote: string;
  methodNote: string[];
  is: string[];
  isNot: string[];
  panelB: { text: string; gate: Array<{ name: string; rule: string; status: string }> };
  preconditions: Precondition[];
  arithmetic: ArithmeticRow[];
  robustness: RobustnessSummary[];
  /** The evidence's formula behind each robustness column, once per formula, with the rows it computes. */
  robustnessFormulas: Array<{ column: string; rows: string[]; formula: string }>;
  notPublished: MetroRef[];
  failClosed: Array<{ cbsa: string; title: string }>;
  /** The chart's provenance records (one per published cell, plus the estimates), de-duplicated. */
  provenance: Provenance[];
  /** Each upstream file the chart reads, once, with its sha256 and Last-Modified. */
  files: FileCitation[];
  /** The files that shape the universe or a peer set. */
  shaping: ShapingSource[];
  /** The chart's sources as citations: each file once, then each estimate with its method. */
  citations: string[];
  /** sha256 of the bundle files this insight was built from. */
  hashes: { manifest: string; chart: string; evidence: string; methods: string };
  /** Content address for feed ids: changes when the chart or the evidence changes, and only then. */
  contentId: string;
}
