// Shared cleaning and privacy rules for parcel records. Every adapter's
// normalize() uses these helpers and ends in finalize(), so the rules below
// hold for every source, not source by source:
//
//  - Blanks are missing. ArcGIS services send "", " ", runs of spaces, the
//    literal string "NULL" and placeholder text; all become undefined. A
//    blank never becomes 0: Number("") and Number(null) are both 0.
//  - A year of 0 and an area of 0 are "not recorded", not a year or an area.
//    A value of 0 is kept and shown as published (it is often an exempt
//    parcel), with the exemption beside it when the source carries one.
//  - An owner field that holds a placeholder instead of a name ("CURRENT
//    OWNER", "CONFIDENTIAL") means the source is withholding the owner. The
//    owner is shown as withheld and the mailing address is dropped with it,
//    since a withheld owner's mailing address is the thing being protected.
//  - A record the source flags confidential is treated the same way.

import type { ParcelOwner, ParcelRecord, ParcelValue } from "./types";

/** Owner-field placeholders that mean "withheld", compared upper-case with spaces collapsed. */
export const OWNER_MASKS: ReadonlySet<string> = new Set([
  "CURRENT OWNER",
  "CURRENT CO-OWNER",
  "CURRENT COOWNER",
  "CONFIDENTIAL",
  "CONFIDENTIAL OWNER",
  "REDACTED",
  "OWNER WITHHELD",
  "NAME WITHHELD",
  "WITHHELD",
]);

/** Values that stand for "nothing here" in these services. */
const BLANKS: ReadonlySet<string> = new Set(["NULL", "<NULL>", "NONE"]);

/** A trimmed string with whitespace runs collapsed; blank, "NULL" and the extra placeholders are undefined. */
export function text(v: unknown, placeholders: readonly string[] = []): string | undefined {
  if (v == null) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  const u = s.toUpperCase();
  if (BLANKS.has(u)) return undefined;
  if (placeholders.some((p) => p.toUpperCase() === u)) return undefined;
  return s;
}

/**
 * A finite number, or undefined. Accepts numbers and numeric strings with
 * thousands separators or padding ("  86,794,159"); a blank string is
 * undefined, never 0.
 */
export function amount(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[,\s$]/g, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** A positive number (areas): 0 and negatives are "not recorded". */
export function positive(v: unknown): number | undefined {
  const n = amount(v);
  return n != null && n > 0 ? n : undefined;
}

/** A plausible year as a string; 0, blanks and anything outside 1600–2100 are undefined. */
export function year(v: unknown): string | undefined {
  const n = amount(typeof v === "string" ? v.replace(/\.0+$/, "") : v);
  if (n == null || !Number.isInteger(n) || n < 1600 || n > 2100) return undefined;
  return String(n);
}

/** ArcGIS epoch milliseconds -> ISO date (YYYY-MM-DD), or undefined. */
export function epochDate(v: unknown): string | undefined {
  const n = amount(v);
  if (n == null) return undefined;
  const d = new Date(n);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
}

/** "20250701" -> "2025-07-01"; anything else as published (trimmed), or undefined. */
export function ymd(v: unknown): string | undefined {
  const s = text(v);
  if (!s) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s;
}

/** Join the non-blank parts with a separator. */
export function join(parts: unknown[], sep = " "): string | undefined {
  const kept = parts.map((p) => text(p)).filter((p): p is string => !!p);
  return kept.length ? kept.join(sep) : undefined;
}

/**
 * An address line as published, tidied: whitespace collapsed, no space before
 * a comma, and empty comma segments (", ,") removed. Nothing is reordered,
 * abbreviated or expanded.
 */
export function addressLine(v: unknown): string | undefined {
  const s = text(v);
  if (!s) return undefined;
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Whether an owner string is a placeholder that means the name is withheld. */
export function isOwnerMask(name: string | undefined): boolean {
  if (!name) return false;
  return OWNER_MASKS.has(name.replace(/\s+/g, " ").trim().toUpperCase());
}

/** A value line, or nothing when the source sent no number. */
export function value(label: string, v: unknown): ParcelValue | undefined {
  const n = amount(v);
  return n == null ? undefined : { label, amount: n };
}

/** Value lines with the missing ones left out; undefined when none are left. */
export function values(year: string | undefined, items: Array<ParcelValue | undefined>, note?: string): ParcelRecord["values"] {
  const kept = items.filter((x): x is ParcelValue => !!x);
  if (!kept.length) return undefined;
  return { ...(year ? { year } : {}), items: kept, ...(note ? { note } : {}) };
}

/** Owner names as published: blanks dropped, duplicates of the first kept once. */
export function ownerNames(...names: unknown[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const s = text(n);
    if (s && !out.some((o) => o.toUpperCase() === s.toUpperCase())) out.push(s);
  }
  return out;
}

/** A published owner, or "not published" when the source's owner fields are all blank. */
export function publishedOwner(
  names: string[],
  opts: { role?: "owner" | "taxpayer"; careOf?: unknown; dba?: unknown; blankReason?: string } = {},
): ParcelOwner {
  if (!names.length) return { status: "not-published", reason: opts.blankReason ?? "the source's owner field is blank for this parcel" };
  const careOf = text(opts.careOf);
  const dba = text(opts.dba);
  return {
    status: "published",
    names,
    role: opts.role ?? "owner",
    ...(careOf && !names.some((n) => n.toUpperCase() === careOf.toUpperCase()) ? { careOf } : {}),
    ...(dba ? { dba } : {}),
  };
}

export const MASK_REASON = "withheld by the source: its owner field holds a placeholder instead of a name";
export const CONFIDENTIAL_REASON = "withheld by the source: it flags this record confidential";

/**
 * The shared privacy pass every adapter's record goes through last.
 * `confidential` is the source's own confidentiality flag for the record.
 */
export function finalize(r: ParcelRecord, opts: { confidential?: boolean } = {}): ParcelRecord {
  const out: ParcelRecord = { ...r };
  const masked = out.owner.status === "published" && out.owner.names.some(isOwnerMask);
  if (opts.confidential || masked) {
    out.owner = { status: "withheld", reason: opts.confidential ? CONFIDENTIAL_REASON : MASK_REASON };
    if (out.mailing || out.ownerAddress || out.taxpayer) {
      out.mailingNote = "not shown: the source withholds this owner, and the mailing address is withheld with the name";
    }
    delete out.mailing;
    delete out.ownerAddress;
    delete out.taxpayer;
    delete out.ownedSince;
  }
  // Empty containers carry nothing.
  if (out.otherIds && !Object.keys(out.otherIds).length) delete out.otherIds;
  if (out.notes && !out.notes.length) delete out.notes;
  for (const k of Object.keys(out) as Array<keyof ParcelRecord>) if (out[k] === undefined) delete out[k];
  return out;
}

/** Other identifiers with the blank ones left out. */
export function ids(entries: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    const s = text(v);
    if (s) out[k] = s;
  }
  return out;
}

/** An area line, or undefined when the source's number is missing or 0. */
export function area(v: unknown, unit: "acres" | "sq ft", basis: string): ParcelRecord["area"] {
  const n = positive(v);
  return n == null ? undefined : { value: n, unit, basis };
}

/** A sale line, or undefined when there is neither a date nor a price. */
export function sale(date: string | undefined, price: unknown, reference?: string): ParcelRecord["lastSale"] {
  const p = amount(price);
  if (!date && p == null) return undefined;
  return { ...(date ? { date } : {}), ...(p != null ? { price: p } : {}), ...(reference ? { reference } : {}) };
}
