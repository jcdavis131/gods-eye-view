// A segment's source card: the facts its lines were written from, shown as
// the publishers sent them, each with where it came from and which lines
// state it. Values are never reworded: a field's name is made readable
// ("commonestEvent" -> "commonest event"), its value is shown as published.
//
// Pure.

import type { Fact } from "./facts";
import type { RundownSegment } from "./rundown";

/** A field name as words: camelCase and snake_case split, lower-cased. */
export function humanKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

/** "2026-10-06 16:48 UTC" for an ISO instant; the input unchanged when it is not one. */
export function utcStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || !/T\d{2}:\d{2}/.test(iso)) return iso;
  const d = new Date(t).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)} UTC`;
}

export interface FactRow {
  label: string;
  value: string;
}

/** The fact's words, then its numbers, as published. */
export function factRows(f: Fact): FactRow[] {
  const rows: FactRow[] = [];
  for (const [k, v] of Object.entries(f.headline_fields)) rows.push({ label: humanKey(k), value: v });
  for (const [k, v] of Object.entries(f.numbers)) rows.push({ label: humanKey(k), value: String(v) });
  return rows;
}

/** What kind of fact this is, for the card's heading. */
export const KIND_LABEL: Record<Fact["kind"], string> = {
  quake: "Earthquake",
  alert: "Weather alert",
  "alert-count": "Alert count",
  wildfire: "Wildfire",
  launch: "Launch",
  kp: "Geomagnetic index",
  flare: "Solar flare",
  indicator: "Economic series",
  release: "Release window",
  weather: "Model weather",
  wire: "Wire headline",
};

export interface CardFact {
  fact: Fact;
  /** 1-based numbers of the segment's lines that cite it. */
  lines: number[];
}

export interface SourceCard {
  facts: CardFact[];
  /** Ids the segment cites that are not in the facts the page has (shown as missing, never dropped silently). */
  missing: string[];
}

/** The card for a segment: its listed facts in order, each with the lines that cite it. */
export function sourceCard(seg: Pick<RundownSegment, "lines" | "facts">, facts: Fact[]): SourceCard {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ids: string[] = [];
  for (const l of seg.lines) for (const id of l.factIds) if (!ids.includes(id)) ids.push(id);
  for (const id of seg.facts) if (!ids.includes(id)) ids.push(id);
  const out: CardFact[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const f = byId.get(id);
    if (!f) {
      missing.push(id);
      continue;
    }
    const lines: number[] = [];
    seg.lines.forEach((l, i) => {
      if (l.factIds.includes(id)) lines.push(i + 1);
    });
    out.push({ fact: f, lines });
  }
  return { facts: out, missing };
}
