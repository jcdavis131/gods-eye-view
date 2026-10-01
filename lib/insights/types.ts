// Shapes of an imported places bundle (scripts/places-model-import.mjs copies
// one into lib/insights/data/<bundle>/) and of the Insight that
// lib/insights/build.ts assembles from it for the /insights pages.
//
// The bundle types name only the fields this side reads. The producer
// (vector-places places.export) writes more; nothing here depends on it.
// Every number an Insight prints is a `value` read from the evidence's
// `numbers` table, addressed by its key, and every published cell behind it
// is a provenance tuple that the importer resolved to a hashed upstream file.

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
  /** The producer's registry id: bls_ces_sm_data, qcew_msa_area, ... */
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
  kind: "growth" | "rank" | "count" | "median" | "change" | "cell" | "registered";
  value: number | null;
  formula?: string;
  provenance: string[];
  over?: string[];
  metros?: string[];
  null_reason?: string;
  registered?: { file: string; path: string; sha256: string; bytes: number };
}

export interface MetroRef {
  cbsa: string;
  label: string;
  title: string;
  reason?: string;
}

/** A template slot. The template text carries the unit ("{a}%", "{v0}k"); the slot carries the number and how to print it. */
export type Slot =
  | { format: "year"; number: string; value: number; period?: string }
  | { format: "pct"; number: string; value: number; digits: number }
  | { format: "num"; number: string; value: number; digits?: number }
  | { format: "ordinal"; number: string; value: number }
  | { format: "list"; number?: string; metros: MetroRef[] }
  /** A place: prints its short label. */
  | ({ format?: undefined } & MetroRef)
  /** A whole number with no format (the chart title's slots), printed as written, like the producer's str.format. */
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
  reason?: string;
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
  };
  caveats: Caveat[];
  chart: {
    title: { id: string; text: string; slots: Record<string, Slot> };
    universe_line: { id: string; text: string; slots: Record<string, Slot> };
    dek: { id: string; text: string };
    rows: Record<string, { x: string; y: string; size: string }>;
    plotted: number;
    medians: Record<string, { number: string; value: number }>;
    labels: { ids: string[]; cap: number };
    not_published: MetroRef[];
    fail_closed: Array<{ cbsa: string; title: string; qcew_code: string; members_without_2019_weight: string[] }>;
  };
  numbers: Record<string, EvidenceNumber>;
  preconditions: Precondition[];
  suppressed: Array<{ clause: string; reason: string; preconditions: Precondition[] }>;
  sources: Record<string, SourceEntry>;
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
  gates_no_metro_beat_both: boolean;
  registered: Record<string, unknown> & { rule?: string; largest_n?: number; ranked_by?: string; window?: { t0: number; t1: number | string } };
  windows: Record<string, RobustnessWindow>;
}

export interface Methods {
  release: string;
  status: string;
  panel_a: { finding: string; is: string[]; is_not: string[]; method_line: string };
  panel_b: { status: string; text: string; gate: Array<{ name: string; rule: string; status: string }> };
  robustness: { gates: boolean; rows: Record<string, RobustnessRow> };
}

// ---------------------------------------------------------------- the insight

/** One published cell behind a printed number, with its citation. */
export interface CellCitation {
  seriesId: string;
  period: string;
  /** The value as published (its text), and the footnote code, empty when none. */
  value: string;
  footnote: string;
  provenance: Provenance;
  citation: string;
}

/** A printed number, how it was computed, and the cells it reads. */
export interface ArithmeticRow {
  /** Where it is printed: "headline" or a caveat id. */
  where: string;
  slot: string;
  /** Exactly the characters printed in the sentence. */
  printed: string;
  /** The evidence.numbers key. */
  number: string;
  kind: EvidenceNumber["kind"];
  formula: string;
  /** Comparison sets a rank, count or median runs over. */
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
  publishable: string;
  gates: boolean;
  /** The distinct upstream files this row's numbers read, as citations. */
  sources: string[];
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
  /** The chart's own title (sidecar headline), from its template. */
  chartTitle: string;
  dek: string;
  universe: string;
  subject: MetroRef;
  spec: ChartSpec;
  /** The date the numbers are as of (sidecar asOf). */
  asOf: string;
  /** The latest retrieval time among the chart's provenance records: the bundle's own stamp, never a clock. */
  retrievedAt: string;
  caveats: Array<{ id: string; text: string }>;
  notPrinted: Array<{ id: string; reason: string }>;
  methodLine: string;
  methodNote: string[];
  is: string[];
  isNot: string[];
  panelB: { text: string; gate: Array<{ name: string; rule: string; status: string }> };
  preconditions: Precondition[];
  arithmetic: ArithmeticRow[];
  robustness: RobustnessSummary[];
  notPublished: MetroRef[];
  failClosed: Array<{ cbsa: string; title: string }>;
  /** The chart's provenance records and their citations, de-duplicated. */
  provenance: Provenance[];
  citations: string[];
  /** sha256 of the bundle files this insight was built from. */
  hashes: { manifest: string; chart: string; evidence: string; methods: string };
  /** Content address for feed ids: changes when the chart or the evidence changes, and only then. */
  contentId: string;
}
