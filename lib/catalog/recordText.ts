// The only place text becomes embeddable (an EmbedInput). Three doors:
//
//   recordText(cardId, row)  a record's text, from its card's embedText fields
//   cardText(card)           a catalogue card's own prose
//   queryText(q)             what someone typed into a search
//
// plus receivedRecordText(props), which re-reads the record text our own route
// builders attached to a feature (properties.extra.embedText) after it crossed
// the wire. The embedder takes nothing else, so a field outside a card's
// embedText (a name, an owner, an address, free text) cannot reach it: a raw
// string does not compile.
//
// recordText reads only the card's embedText fields from the row a builder
// hands it (the builder passes its decoded values under the upstream field
// names, e.g. PAD-US Own_Type "Private" for "PVT"), and re-checks each field
// against DENY_FIELD at run time. A feature's name is never embedded, public
// or not: names stay with the palette's letter-by-letter match, which owns
// the label-by-id rules. Ids are matched by letters too, never embedded.

import type { EmbedInput } from "@/lib/embed/types";
import type { BaseProps } from "@/lib/layers/types";
import { EMBED_TEXT, embeddableField, fieldLabel, type CollectionId } from "./embedFields";

const MAX_VALUE_CHARS = 160;

function value(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, MAX_VALUE_CHARS) : null;
}

/**
 * A record's embeddable text: "<label>: <value>" for each of its card's embedText fields that
 * has a value, joined by "; ". Null when none has one (absent, never "null" or 0). Throws for an
 * unknown card or a field that is not embeddable (the catalogue test keeps that from shipping).
 */
export function recordText(cardId: CollectionId, row: Readonly<Record<string, unknown>>): EmbedInput | null {
  const fields: readonly string[] | undefined = EMBED_TEXT[cardId];
  if (!fields) throw new Error(`no collection "${cardId}"`);
  const parts: string[] = [];
  for (const f of fields) {
    if (!embeddableField(f)) throw new Error(`${cardId}: field ${f} may not be embedded`);
    const label = fieldLabel(cardId, f);
    if (!label) throw new Error(`${cardId}: no label for ${f}`);
    const v = value(row[f]);
    if (v != null) parts.push(`${label}: ${v}`);
  }
  return parts.length ? (parts.join("; ") as EmbedInput) : null;
}

/** What a builder adds to a feature's extra. */
export interface RecordEmbedExtra {
  embedText?: string;
}

/** `x` with the record text attached, or `x` unchanged when there is none. */
export function withEmbedText<T extends object>(x: T, text: EmbedInput | null): T & RecordEmbedExtra {
  return text == null ? x : { ...x, embedText: text };
}

/** The record text a route builder attached to a feature, after the wire. Only recordText writes that field. */
export function receivedRecordText(p: Pick<BaseProps, "extra">): EmbedInput | null {
  const x = p.extra;
  if (!x || typeof x !== "object") return null;
  const t = (x as RecordEmbedExtra).embedText;
  return typeof t === "string" && t.trim() ? (t as EmbedInput) : null;
}

export const QUERY_MIN = 2;
export const QUERY_MAX = 200;

/** A search query, trimmed; null when outside QUERY_MIN..QUERY_MAX characters. */
export function queryText(q: string): EmbedInput | null {
  const s = q.replace(/\s+/g, " ").trim();
  if (s.length < QUERY_MIN || s.length > QUERY_MAX) return null;
  return s as EmbedInput;
}
