// The rundown: what the anchors read this half hour, segment by segment, with
// every line naming the facts it states.
//
// Two writers produce one: the local model (qwen3:8b on the operator's box,
// published every ~30 minutes to NEWS_RUNDOWN_URL) and the template writer in
// lib/news/template.ts. The model's rundown is used only when all of these
// hold, otherwise the template's is:
//
//   1. it is fresh: generated less than two hours ago (and not in the future),
//      and not past its own `expires`;
//   2. it parses against RundownSchema;
//   3. every fact id it names exists in the current facts;
//   4. every line passes the claim check below.
//
// The claim check is mechanical and deliberately strict. In each line, every
// number must be one the cited facts carry (as published, or rounded to the
// precision written), and every capitalised word that does not start a
// sentence must appear in the cited facts' words or their sources' names, or
// be on a short list (the anchors' names, the segment titles, month and day
// names, agency acronyms). A line that cites no facts may carry no number and
// no such proper noun: banter has no facts in it. A claim written entirely in
// lower-case words with no number cannot be caught this way; the model's
// instructions forbid it and the template writer never makes one.
//
// Pure: callers pass `now`.

import { z } from "zod";
import { factIndex, type Fact, type FactPlace } from "./facts";
import { PERSONA_IDS, PERSONAS, type PersonaId } from "./personas";
import { SEGMENT_IDS, WHEEL, type SegmentId } from "./schedule";

/** A published rundown older than this is stale. */
export const RUNDOWN_MAX_AGE_MS = 2 * 3600_000;
/** A generatedAt this far ahead of `now` is a clock error, not a fresh rundown. */
const FUTURE_SLACK_MS = 5 * 60_000;

const Place = z.object({ name: z.string().min(1).max(200), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

export const LineSchema = z.object({
  anchor: z.enum(PERSONA_IDS),
  text: z.string().min(1).max(600),
  factIds: z.array(z.string().min(1).max(300)).max(12),
});

export const SegmentSchema = z.object({
  id: z.enum(SEGMENT_IDS),
  title: z.string().min(1).max(120),
  anchor: z.enum(PERSONA_IDS),
  lines: z.array(LineSchema).min(1).max(40),
  /** The fact ids this segment's source card lists. */
  facts: z.array(z.string().min(1).max(300)).max(60),
  /** Where the globe looks during the segment; null for none. */
  location: Place.nullable(),
});

export const RundownSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  writer: z.enum(["qwen3:8b", "template"]),
  expires: z.iso.datetime({ offset: true }),
  segments: z.array(SegmentSchema).min(1).max(16),
});

export type RundownLine = z.infer<typeof LineSchema>;
export type RundownSegment = z.infer<typeof SegmentSchema>;
export type Rundown = z.infer<typeof RundownSchema>;

// ---------------------------------------------------------------- the claim check

/** Words that may be capitalised mid-sentence without a fact behind them. */
const ALWAYS_ALLOWED = new Set(
  [
    ...Object.values(PERSONAS).flatMap((p) => [...p.name.split(" "), p.shortName]),
    ...WHEEL.flatMap((s) => s.title.split(/[\s-]+/)),
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "utc", "gmt", "i", "i'm", "i've", "i'll", "i'd", "atlas", "earth", "sun",
    "usgs", "nws", "noaa", "nasa", "nifc", "fred", "gfz", "donki", "pager", "kp", "celsius", "open-meteo", "launch", "library",
  ].map((w) => w.toLowerCase()),
);

const DIGITS = /\d[\d,]*(?:\.\d+)?/g;

/** Every number a fact carries: its `numbers`, every digit run in its words, and the parts of every date and time in it. */
export function factNumbers(f: Fact): number[] {
  const out: number[] = [...Object.values(f.numbers)];
  const texts = [...Object.values(f.headline_fields), f.place?.name ?? "", f.time ?? ""];
  for (const t of texts) {
    for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
    const d = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(t);
    if (d && t.includes("T") && /Z$|[+-]\d{2}:?\d{2}$/.test(t)) {
      // An instant: its UTC parts too, since lines give times in UTC.
      const ms = Date.parse(t);
      if (Number.isFinite(ms)) {
        const u = new Date(ms);
        out.push(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
      }
    }
  }
  return out;
}

/** Every word a fact and its source carry, lower-cased. */
export function factWords(f: Fact): Set<string> {
  const texts = [...Object.values(f.headline_fields), f.place?.name ?? "", f.provenance.source.name, f.provenance.source.publisher];
  const out = new Set<string>();
  for (const t of texts) for (const w of t.split(/[^\p{L}\p{N}'’.-]+/u)) if (w) out.add(normWord(w));
  return out;
}

function decimals(token: string): number {
  const i = token.indexOf(".");
  return i < 0 ? 0 : token.length - i - 1;
}

/** Whether `token` (as written in a line) is one of `nums`, exactly or rounded to the precision written. */
export function numberSupported(token: string, nums: number[]): boolean {
  const t = Number(token.replace(/,/g, ""));
  if (!Number.isFinite(t)) return false;
  const d = decimals(token);
  const k = 10 ** d;
  // Tokens are unsigned (a line says "minus 2.2"), so compare magnitudes.
  return nums.some((v) => Math.abs(Math.round(Math.abs(v) * k) / k - t) < 1e-9);
}

/** Capitalised words that do not start a sentence or a quotation. */
export function properWords(text: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}][\p{L}\p{N}'’.-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[0];
    if (w[0] === w[0].toLowerCase()) continue;
    const before = text.slice(0, m.index).trimEnd();
    if (!before || /[.!?:;"“‘(—–]$/.test(before)) continue;
    out.push(w);
  }
  return out;
}

function normWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/^[.'’-]+|[.'’-]+$/g, "");
}

/** Problems with one line against the facts it cites (empty when it passes). */
export function checkLine(text: string, cited: Fact[]): string[] {
  const problems: string[] = [];
  const nums = cited.flatMap(factNumbers);
  for (const m of text.matchAll(DIGITS)) {
    const tok = m[0].replace(/[,.]+$/, "");
    if (!numberSupported(tok, nums)) problems.push(cited.length ? `number ${tok} is not in the cited facts` : `number ${tok} in a line that cites no facts`);
  }
  const words = new Set<string>();
  for (const f of cited) for (const w of factWords(f)) words.add(w);
  for (const w of properWords(text)) {
    const n = normWord(w);
    if (ALWAYS_ALLOWED.has(n) || words.has(n) || n.split(/[-.]/).every((p) => !p || ALWAYS_ALLOWED.has(p) || words.has(p))) continue;
    const shown = w.replace(/[.'’-]+$/, "");
    problems.push(cited.length ? `"${shown}" is not in the cited facts` : `"${shown}" in a line that cites no facts`);
  }
  return problems;
}

// ---------------------------------------------------------------- validation and selection

export interface RundownCheck {
  ok: boolean;
  problems: string[];
  rundown?: Rundown;
}

/** Schema, freshness, fact ids and the claim check, in that order; stops at the first stage that fails. */
export function checkRundown(raw: unknown, current: Fact[], now: number): RundownCheck {
  const parsed = RundownSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 10).map((i) => `schema: ${i.path.join(".") || "(root)"}: ${i.message}`) };
  const r = parsed.data;
  const gen = Date.parse(r.generatedAt);
  const exp = Date.parse(r.expires);
  if (gen > now + FUTURE_SLACK_MS) return { ok: false, problems: [`generatedAt ${r.generatedAt} is in the future`] };
  if (now - gen >= RUNDOWN_MAX_AGE_MS) return { ok: false, problems: [`stale: generated ${Math.round((now - gen) / 60_000)} min ago (limit ${RUNDOWN_MAX_AGE_MS / 60_000})`] };
  if (exp <= now) return { ok: false, problems: [`expired at ${r.expires}`] };
  const idx = factIndex(current);
  const missing = new Set<string>();
  for (const s of r.segments) {
    for (const id of s.facts) if (!idx.has(id)) missing.add(id);
    for (const l of s.lines) for (const id of l.factIds) if (!idx.has(id)) missing.add(id);
  }
  if (missing.size) return { ok: false, problems: [...missing].slice(0, 10).map((id) => `fact ${id} is not in the current facts`) };
  const problems: string[] = [];
  for (const s of r.segments) {
    s.lines.forEach((l, i) => {
      for (const p of checkLine(l.text, l.factIds.map((id) => idx.get(id)!))) problems.push(`${s.id} line ${i + 1}: ${p}`);
    });
  }
  if (problems.length) return { ok: false, problems: problems.slice(0, 20) };
  return { ok: true, problems: [], rundown: r };
}

/** The segment's source card (every fact its lines cite, then any it lists) and where the globe looks: the first cited fact with a place. */
export function hydrateSegment(s: RundownSegment, idx: Map<string, Fact>): RundownSegment {
  const ids: string[] = [];
  for (const l of s.lines) for (const id of l.factIds) if (!ids.includes(id)) ids.push(id);
  for (const id of s.facts) if (!ids.includes(id)) ids.push(id);
  let location: FactPlace | null = null;
  for (const id of ids) {
    const p = idx.get(id)?.place;
    if (p) {
      location = p;
      break;
    }
  }
  return { ...s, facts: ids, location };
}

export interface Selection {
  rundown: Rundown;
  chosen: "qwen3:8b" | "template";
  /** Why the published rundown was not used, when it was not. */
  rejected: string[];
}

/**
 * Use the published model rundown when it passes checkRundown, else the
 * template's. The chosen rundown's source cards and locations are rebuilt
 * from the current facts: nothing about a fact is taken from the published
 * file but its id.
 */
export function selectRundown(published: unknown | null, current: Fact[], now: number, template: Rundown, why?: string): Selection {
  const idx = factIndex(current);
  const hydrate = (r: Rundown): Rundown => ({ ...r, segments: r.segments.map((s) => hydrateSegment(s, idx)) });
  if (published == null) return { rundown: hydrate(template), chosen: "template", rejected: [why ?? "no published rundown"] };
  const c = checkRundown(published, current, now);
  if (!c.ok || !c.rundown) return { rundown: hydrate(template), chosen: "template", rejected: c.problems };
  if (c.rundown.writer !== "qwen3:8b") return { rundown: hydrate(template), chosen: "template", rejected: [`published rundown names writer ${c.rundown.writer}`] };
  return { rundown: hydrate(c.rundown), chosen: "qwen3:8b", rejected: [] };
}

/** Segment ids in wheel order, for writers. */
export function wheelOrder(): SegmentId[] {
  return WHEEL.map((s) => s.id);
}

export type { PersonaId };
