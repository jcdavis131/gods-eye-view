// The headline wire: titles from the public RSS feeds of outlets that publish
// them for syndication, each credited to its outlet and linked to the story.
//
// What is kept is the title, the link, the outlet and the publication time.
// Nothing else is read: no description, no article body, no image, no author.
// An anchor reads a wire item as the outlet's headline with its credit and
// never summarises, embellishes or quotes beyond the RSS title.
//
// Feeds probed 2026-10-07 (02:40 UTC) from the build machine, each with a real
// fetch; the terms each outlet states for its feeds, as read that day, are
// in the outlet's `license` in lib/provenance/sources.ts. Left out after the
// probe: CBC (www.cbc.ca/webfeed/rss/rss-world: HTTP/2 stream reset, then a
// 20 s timeout over HTTP/1.1), NHK World (the English news RSS path answers
// 404 and its JSON endpoint reset), PBS NewsHour (connection reset), RNZ
// (two items only) and The Guardian (its feeds page limits them to
// "personal, non-commercial purposes").
//
// Pure: parsing, cleaning, de-duplication and the 24-hour cut. The fetch is in
// lib/news/sources.ts.

import type { SourceId } from "@/lib/provenance/sources";

export interface WireOutlet {
  id: string;
  /** The credit an anchor reads and the page shows next to every headline. */
  outlet: string;
  feedUrl: string;
  sourceId: SourceId;
}

export const WIRE_OUTLETS: WireOutlet[] = [
  { id: "npr", outlet: "NPR", feedUrl: "https://feeds.npr.org/1001/rss.xml", sourceId: "wire-npr" },
  { id: "bbc", outlet: "BBC News", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", sourceId: "wire-bbc" },
  { id: "dw", outlet: "DW", feedUrl: "https://rss.dw.com/xml/rss-en-world", sourceId: "wire-dw" },
  { id: "abc", outlet: "ABC News (Australia)", feedUrl: "https://www.abc.net.au/news/feed/51120/rss.xml", sourceId: "wire-abc-au" },
  { id: "aljazeera", outlet: "Al Jazeera", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", sourceId: "wire-aljazeera" },
  { id: "france24", outlet: "France 24", feedUrl: "https://www.france24.com/en/rss", sourceId: "wire-france24" },
  { id: "unnews", outlet: "UN News", feedUrl: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", sourceId: "wire-un-news" },
];

export interface WireItem {
  /** "wire:" + a hash of the normalised link: stable across fetches. */
  id: string;
  title: string;
  link: string;
  outletId: string;
  outlet: string;
  /** ISO 8601; null when the feed gave no date that parses (such items are dropped by freshWire). */
  publishedAt: string | null;
}

/** Wire items older than this are dropped. */
export const WIRE_MAX_AGE_MS = 24 * 3600_000;

/** 32-bit FNV-1a as 7 base-36 characters: a short, stable id. Not a security hash. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…" };

/** XML/HTML entities to characters (named ones the feeds use, decimal and hex). Unknown names are left as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** The text of one element: CDATA unwrapped, entities decoded, any markup inside stripped, whitespace collapsed. */
function elementText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return null;
  let t = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(t);
  if (cdata) t = cdata[1];
  t = decodeEntities(t.replace(/<[^>]+>/g, " "));
  // Entities decoded twice in some feeds (&amp;apos;): decode once more only if what is left is still an entity.
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) t = decodeEntities(t);
  return t.replace(/\s+/g, " ").trim() || null;
}

/**
 * RSS / RFC 822 dates ("Wed, 07 Oct 2026 02:30:59 GMT", "Tue, 6 Oct 2026
 * 18:02:00 GMT", "Tue, 06 Oct 2026 18:45:00 -0400") and ISO 8601 (dc:date),
 * to ISO. Null when it does not parse.
 */
export function parseFeedDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(t) ? Date.parse(t) : NaN;
  if (Number.isFinite(iso)) return new Date(iso).toISOString();
  const m = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(GMT|UTC|UT|Z|[+-]\d{4}|[A-Z]{3})?$/.exec(t);
  if (!m) return null;
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mon = MONTHS.indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  const ZONES: Record<string, number> = { GMT: 0, UTC: 0, UT: 0, Z: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };
  let offMin = 0;
  const z = m[7] ?? "GMT";
  if (/^[+-]\d{4}$/.test(z)) offMin = (z[0] === "-" ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)));
  else if (z in ZONES) offMin = ZONES[z];
  else return null;
  const ms = Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - offMin * 60_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Only http(s) links, with the feed's tracking parameters left as published. */
function cleanLink(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(t) ? t : null;
}

/** Link normalised for de-duplication: scheme, host case, trailing slash, the query and the fragment do not make a different story. */
export function linkKey(link: string): string {
  try {
    const u = new URL(link);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return link.toLowerCase();
  }
}

/** Title normalised for de-duplication across outlets' feeds of the same outlet (case, punctuation, quotes). */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Parse one RSS 2.0 (or RDF / Atom) document into wire items for `outlet`. Items without a title or an http(s) link are skipped. */
export function parseFeed(xml: string, outlet: Pick<WireOutlet, "id" | "outlet">): WireItem[] {
  const out: WireItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = elementText(b, "title");
    let link = cleanLink(elementText(b, "link"));
    if (!link) {
      const href = /<link\b[^>]*\bhref="([^"]+)"/i.exec(b);
      link = cleanLink(href ? decodeEntities(href[1]) : null);
    }
    if (!title || !link) continue;
    const publishedAt = parseFeedDate(elementText(b, "pubDate") ?? elementText(b, "dc:date") ?? elementText(b, "published") ?? elementText(b, "updated"));
    out.push({ id: `wire:${shortHash(linkKey(link))}`, title, link, outletId: outlet.id, outlet: outlet.outlet, publishedAt });
  }
  return out;
}

/**
 * Items published in the 24 hours before `now` (and not more than ten minutes
 * after it: a clock a little ahead is tolerated, a date in the future is not),
 * de-duplicated by link and then by title within an outlet, newest first. An
 * item with no date is dropped: its age is unknown.
 */
export function freshWire(items: WireItem[], now: number, maxAgeMs = WIRE_MAX_AGE_MS): WireItem[] {
  const seenLink = new Set<string>();
  const seenTitle = new Set<string>();
  const out: WireItem[] = [];
  const sorted = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id));
  for (const it of sorted) {
    const t = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
    if (!Number.isFinite(t) || t < now - maxAgeMs || t > now + 10 * 60_000) continue;
    const lk = linkKey(it.link);
    const tk = `${it.outletId}|${titleKey(it.title)}`;
    if (seenLink.has(lk) || seenTitle.has(tk)) continue;
    seenLink.add(lk);
    seenTitle.add(tk);
    out.push(it);
  }
  return out;
}

/**
 * A wire for the air: newest first, at most `perOutlet` from any one outlet
 * so one busy feed does not drown the rest, `max` in all.
 */
export function wireRoundup(items: WireItem[], max = 12, perOutlet = 2): WireItem[] {
  const count = new Map<string, number>();
  const out: WireItem[] = [];
  for (const it of items) {
    const n = count.get(it.outletId) ?? 0;
    if (n >= perOutlet) continue;
    count.set(it.outletId, n + 1);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}
