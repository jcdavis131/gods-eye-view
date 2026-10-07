// The playback engine: which line of the rundown is on air at a given moment.
//
// Everything here is a function of the wall clock and the rundown, with no
// state carried between calls. The studio asks "what is on air at nowMs?"
// on every tick, so a tab that slept for twenty minutes lands on the right
// segment and the right line the moment it wakes, and two viewers whose
// clocks agree see the same line at the same moment.
//
// A segment's slot is fixed by the wheel (lib/news/schedule.ts). Its lines
// are laid out from the slot's start:
//
//   lead-in  LEAD_IN_MS of studio before the first line;
//   lines    one after another, each lasting its spoken length (estimated
//            from the text here; real audio durations replace the estimate
//            through `durationOf`), with a pause between lines;
//   recap    in a news segment with time left over, the lines that state
//            facts are read again, verbatim and flagged as a recap, while
//            whole lines still fit (nothing new is said);
//   hold     the desk until the next segment.
//
// When the lines are longer than the slot, estimated lines are read faster,
// down to MIN_RATE of their natural length; lines that still do not fit are
// dropped from the end (and counted), so a segment always ends when the wheel
// says it does. Lines with a real audio duration are never sped up.
//
// Pure: callers pass `nowMs`. Nothing here reads the clock.

import type { Rundown, RundownLine, RundownSegment } from "./rundown";
import type { PersonaId } from "./personas";
import { playhead, WHEEL, WHEEL_S, type Playhead, type SegmentId, type WheelSegment } from "./schedule";

/** Studio before the first line of a segment. */
export const LEAD_IN_MS = 1200;
/** The shortest pause between two lines. */
export const GAP_MS = 700;
/** The longest pause between two lines when a segment has time to spare. */
export const GAP_MAX_MS = 2600;
/** Desk time kept free at the end of every segment, before the next one. */
export const TAIL_MS = 2000;
/** Pause before a recap starts. */
export const RECAP_PAUSE_MS = 4000;
/** Estimated lines are never read faster than this fraction of their natural length. */
export const MIN_RATE = 0.65;

// Spoken length from text: about 16 characters a second (roughly 170 words a
// minute, a newsreader's pace), plus a beat at each sentence end and a
// shorter one at each comma, colon, semicolon or dash.
const BASE_MS = 350;
const PER_CHAR_MS = 62;
const SENTENCE_MS = 280;
const CLAUSE_MS = 120;
const MIN_LINE_MS = 1200;
const MAX_LINE_MS = 40_000;

/** How long a line takes to say, estimated from its text. */
export function estimateLineMs(text: string): number {
  const t = text.trim();
  if (!t) return MIN_LINE_MS;
  const sentences = (t.match(/[.!?]+(?=\s|$|["”’)])/g) ?? []).length;
  const clauses = (t.match(/[,;:—–]/g) ?? []).length;
  const ms = BASE_MS + t.length * PER_CHAR_MS + sentences * SENTENCE_MS + clauses * CLAUSE_MS;
  return Math.round(Math.min(MAX_LINE_MS, Math.max(MIN_LINE_MS, ms)));
}

export interface Cue {
  /** Stable within a segment: `<segment>:<line>` or `<segment>:<line>:recap`. */
  key: string;
  /** The line's index in the rundown segment. */
  lineIndex: number;
  anchor: PersonaId;
  text: string;
  factIds: string[];
  /** Milliseconds after the segment's start. */
  startMs: number;
  endMs: number;
  /** A fact line read a second time in the same slot. */
  recap: boolean;
}

export interface Timeline {
  segmentId: SegmentId;
  slotMs: number;
  cues: Cue[];
  /** Lines that did not fit in the slot even at MIN_RATE. */
  dropped: number;
  /** How fast estimated lines are read (1 = natural; MIN_RATE at most). */
  rate: number;
}

export interface LayoutOptions {
  /** A line's real length in ms (N3's audio), or undefined to estimate it from the text. */
  durationOf?: (line: RundownLine, index: number) => number | undefined;
  /** Read fact lines again with spare time (news segments; default true when the segment's lines cite facts). */
  recap?: boolean;
}

/** Lay a segment's lines out in a slot of `slotMs`. */
export function layoutSegment(segmentId: SegmentId, lines: RundownLine[], slotMs: number, opts: LayoutOptions = {}): Timeline {
  const n = lines.length;
  const fixed: boolean[] = [];
  const natural = lines.map((l, i) => {
    const real = opts.durationOf?.(l, i);
    const ok = typeof real === "number" && Number.isFinite(real) && real > 0;
    fixed.push(ok);
    return ok ? Math.round(real) : estimateLineMs(l.text);
  });
  const budget = Math.max(0, slotMs - LEAD_IN_MS - TAIL_MS);
  const end = LEAD_IN_MS + budget;
  const gapsTotal = GAP_MS * Math.max(0, n - 1);
  const total = natural.reduce((a, b) => a + b, 0) + gapsTotal;

  let rate = 1;
  let gap = GAP_MS;
  if (total > budget) {
    const fixedSum = natural.reduce((a, d, i) => a + (fixed[i] ? d : 0), 0);
    const flexSum = total - gapsTotal - fixedSum;
    if (flexSum > 0) rate = Math.max(MIN_RATE, Math.min(1, (budget - gapsTotal - fixedSum) / flexSum));
  } else if (n > 0) {
    gap = Math.min(GAP_MAX_MS, GAP_MS + (budget - total) / n);
  }
  // Floor when reading faster, so rounding never pushes the last line past the slot.
  const dur = natural.map((d, i) => (fixed[i] || rate === 1 ? d : Math.floor(d * rate)));

  const cues: Cue[] = [];
  let t = LEAD_IN_MS;
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    if (t + dur[i] > end) {
      // The first line always plays, cut at the slot's end; later lines that do not fit are dropped.
      if (i === 0) cues.push(cue(segmentId, i, l, t, Math.max(t + 1, end), false));
      dropped = n - cues.length;
      break;
    }
    cues.push(cue(segmentId, i, l, t, t + dur[i], false));
    t += dur[i] + gap;
  }

  const recap = opts.recap ?? lines.some((l) => l.factIds.length > 0);
  if (recap && dropped === 0 && cues.length) {
    const facts = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.factIds.length > 0);
    let r = cues[cues.length - 1].endMs + RECAP_PAUSE_MS;
    for (const { l, i } of facts) {
      if (r + dur[i] > end) break;
      cues.push(cue(segmentId, i, l, r, r + dur[i], true));
      r += dur[i] + gap;
    }
  }
  return { segmentId, slotMs, cues, dropped, rate };
}

function cue(seg: SegmentId, i: number, l: RundownLine, startMs: number, endMs: number, recap: boolean): Cue {
  return { key: `${seg}:${i}${recap ? ":recap" : ""}`, lineIndex: i, anchor: l.anchor, text: l.text, factIds: l.factIds, startMs, endMs, recap };
}

export type CuePhase = "lead-in" | "line" | "gap" | "hold";

export interface CueState {
  phase: CuePhase;
  /** The line being spoken, during "line". */
  speaking: Cue | null;
  /** The caption on screen: the line being spoken, or the last one during a pause or the hold. */
  caption: Cue | null;
  /** 0..1 through the line being spoken. */
  progress: number;
  /** The next line to start, if any. */
  next: Cue | null;
  /** Milliseconds until the phase or the line changes (for scheduling; never negative). */
  untilChangeMs: number;
}

/** Where `offsetMs` (ms after the segment's start) falls in a timeline. */
export function cueAt(tl: Timeline, offsetMs: number): CueState {
  const cues = tl.cues;
  if (!cues.length || offsetMs < cues[0].startMs) {
    return { phase: cues.length ? "lead-in" : "hold", speaking: null, caption: null, progress: 0, next: cues[0] ?? null, untilChangeMs: Math.max(0, (cues[0]?.startMs ?? tl.slotMs) - offsetMs) };
  }
  // Last cue that has started.
  let lo = 0;
  let hi = cues.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cues[mid].startMs <= offsetMs) lo = mid;
    else hi = mid - 1;
  }
  const c = cues[lo];
  const next = cues[lo + 1] ?? null;
  if (offsetMs < c.endMs) {
    return { phase: "line", speaking: c, caption: c, progress: (offsetMs - c.startMs) / (c.endMs - c.startMs), next, untilChangeMs: c.endMs - offsetMs };
  }
  if (next) return { phase: "gap", speaking: null, caption: c, progress: 1, next, untilChangeMs: next.startMs - offsetMs };
  return { phase: "hold", speaking: null, caption: c, progress: 1, next: null, untilChangeMs: Math.max(0, tl.slotMs - offsetMs) };
}

// ---------------------------------------------------------------- the rundown at a moment

export type RundownStatus = "ok" | "missing" | "expired";

/** Whether a rundown may be played at `nowMs`: present and not past its own `expires`. */
export function rundownStatus(r: Rundown | null | undefined, nowMs: number): RundownStatus {
  if (!r) return "missing";
  const exp = Date.parse(r.expires);
  if (!Number.isFinite(exp) || exp <= nowMs) return "expired";
  return "ok";
}

export type OnAirStatus = "playing" | "no-rundown" | "rundown-expired" | "segment-missing";

export interface OnAir {
  nowMs: number;
  playhead: Playhead;
  segment: WheelSegment;
  /** The rundown's segment for this slot, when the rundown has one and may be played. */
  rundownSegment: RundownSegment | null;
  timeline: Timeline | null;
  at: CueState | null;
  /** Milliseconds into the segment. */
  offsetMs: number;
  status: OnAirStatus;
  /** Who is on camera: the speaking anchor, else the last to speak, else the segment's anchor. */
  speaker: PersonaId;
}

const timelines = new WeakMap<RundownSegment, Map<string, Timeline>>();

function timelineFor(seg: RundownSegment, slotMs: number, opts: LayoutOptions): Timeline {
  // Memoised per rundown segment, so a 10 Hz tick does not lay the segment out ten times a second.
  // Only the default layout is memoised; a caller with real durations passes a fresh options object each change.
  if (opts.durationOf) return layoutSegment(seg.id, seg.lines, slotMs, opts);
  let m = timelines.get(seg);
  if (!m) timelines.set(seg, (m = new Map()));
  const k = `${slotMs}:${opts.recap ?? "auto"}`;
  let tl = m.get(k);
  if (!tl) m.set(k, (tl = layoutSegment(seg.id, seg.lines, slotMs, opts)));
  return tl;
}

/** What is on air at `nowMs` with `rundown`: the wheel's slot, the rundown's segment for it and the line. */
export function onAir(nowMs: number, rundown: Rundown | null | undefined, opts: LayoutOptions = {}): OnAir {
  const ph = playhead(nowMs);
  const offsetMs = nowMs - Date.parse(ph.segmentStartedAt);
  const base = { nowMs, playhead: ph, segment: ph.segment, offsetMs };
  const rs = rundownStatus(rundown, nowMs);
  if (rs !== "ok") return { ...base, rundownSegment: null, timeline: null, at: null, status: rs === "missing" ? "no-rundown" : "rundown-expired", speaker: ph.segment.anchor };
  const seg = rundown!.segments.find((s) => s.id === ph.segment.id) ?? null;
  if (!seg || !seg.lines.length) return { ...base, rundownSegment: seg, timeline: null, at: null, status: "segment-missing", speaker: ph.segment.anchor };
  const tl = timelineFor(seg, ph.segment.durS * 1000, opts);
  const at = cueAt(tl, offsetMs);
  return { ...base, rundownSegment: seg, timeline: tl, at, status: "playing", speaker: at.caption?.anchor ?? seg.anchor };
}

/**
 * Whether the studio should fetch the rundown again: it has none, its rundown
 * has expired, or the wheel has turned since it fetched (the template is
 * written per turn and a new model rundown may be out).
 */
export function needsRundown(r: Rundown | null | undefined, fetchedForTurn: string | null, nowMs: number): boolean {
  if (rundownStatus(r, nowMs) !== "ok") return true;
  return fetchedForTurn !== playhead(nowMs).wheelStartedAt;
}

/** The URL the studio fetches the rundown from: keyed by the turn, so every viewer in a half hour shares one cached answer and none gets the last turn's. */
export function rundownUrl(nowMs: number): string {
  return `/api/news?op=rundown&turn=${encodeURIComponent(playhead(nowMs).wheelStartedAt)}`;
}

// ---------------------------------------------------------------- the clock

export interface ClockSample {
  /** Local clock when the request was sent and when the answer arrived. */
  sentMs: number;
  receivedMs: number;
  /** The server's clock when it built the answer. */
  serverMs: number;
  /** The `Age` header in seconds when a cache served the answer, else 0. */
  ageS?: number;
}

/** Below this, a local clock is trusted as it is (sub-second jitter is not worth chasing). */
export const OFFSET_IGNORE_MS = 1500;
/** A sample whose round trip leaves more doubt than this is not used. */
export const MAX_UNCERTAINTY_MS = 5000;

/**
 * How far the local clock is behind the server's (add it to local time), from
 * one request: the server stamped the answer half a round trip before it
 * arrived, plus however long a cache held it. Null when the sample is too
 * uncertain to use.
 */
export function clockOffset(s: ClockSample): { offsetMs: number; uncertaintyMs: number } | null {
  const rtt = s.receivedMs - s.sentMs;
  if (!(rtt >= 0) || !Number.isFinite(s.serverMs)) return null;
  const age = Math.max(0, s.ageS ?? 0);
  // Age is whole seconds, so it adds up to a second of doubt.
  const uncertaintyMs = rtt / 2 + (age > 0 ? 1000 : 0);
  if (uncertaintyMs > MAX_UNCERTAINTY_MS) return null;
  const offsetMs = s.serverMs + age * 1000 - (s.sentMs + s.receivedMs) / 2;
  return { offsetMs: Math.round(offsetMs), uncertaintyMs: Math.round(uncertaintyMs) };
}

/** The correction to apply: the most certain sample's offset, or 0 when the local clock is within its doubt (or OFFSET_IGNORE_MS) of the server. */
export function chooseOffset(samples: Array<ClockSample | null | undefined>): number {
  let best: { offsetMs: number; uncertaintyMs: number } | null = null;
  for (const s of samples) {
    const o = s ? clockOffset(s) : null;
    if (o && (!best || o.uncertaintyMs < best.uncertaintyMs)) best = o;
  }
  if (!best) return 0;
  return Math.abs(best.offsetMs) <= Math.max(OFFSET_IGNORE_MS, best.uncertaintyMs) ? 0 : best.offsetMs;
}

// ---------------------------------------------------------------- the schedule as viewers see it

export interface UpNext {
  segment: WheelSegment;
  startsAtMs: number;
}

/** The next `count` segments after the one on air, with their start times. */
export function upNext(nowMs: number, count = 3): UpNext[] {
  const ph = playhead(nowMs);
  const turn = Date.parse(ph.wheelStartedAt);
  const out: UpNext[] = [];
  for (let k = 1; k <= count; k++) {
    const j = ph.index + k;
    const seg = WHEEL[j % WHEEL.length];
    const turns = Math.floor(j / WHEEL.length);
    out.push({ segment: seg, startsAtMs: turn + turns * WHEEL_S * 1000 + seg.startS * 1000 });
  }
  return out;
}

/** "HH:MM:SS" in UTC. */
export function utcHms(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

/** "HH:MM" in UTC. */
export function utcHm(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

/** "M:SS" (or "H:MM:SS") for a countdown; never negative. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
