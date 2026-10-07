// How the anchors move: mouth shapes from the caption text, blinks, and
// where each anchor looks. Deterministic functions of the clock, so two tabs
// on the same line show the same mouth and tests need no browser.
//
// Visemes here come from letters, not audio: while a line is on air the
// mouth steps through the shapes of the letters at the reading position.
// N3 replaces this with shapes driven by the voice's audio.
//
// Pure: callers pass `nowMs` and the line's progress.

import type { PersonaId } from "./personas";

/**
 * Mouth shapes. `rest` is the closed, relaxed mouth between lines; the others
 * follow the usual cartoon set: MBP (lips pressed), AI (wide open), E (open,
 * stretched), O (round), U (small pucker, also W and Q), FV (top teeth on the
 * lower lip), L (tongue up, also T, D, N and TH) and etc (slightly open, the
 * other consonants).
 */
export type Viseme = "rest" | "MBP" | "AI" | "E" | "O" | "U" | "FV" | "L" | "etc";

export const VISEMES = ["rest", "MBP", "AI", "E", "O", "U", "FV", "L", "etc"] as const satisfies readonly Viseme[];

/** The mouth shape for one character of text. */
export function visemeForChar(ch: string): Viseme {
  const c = ch.toLowerCase();
  if ("mbp".includes(c)) return "MBP";
  if ("ai".includes(c)) return "AI";
  if (c === "e" || c === "y") return "E";
  if (c === "o") return "O";
  if ("uwq".includes(c)) return "U";
  if ("fv".includes(c)) return "FV";
  if ("ltdn".includes(c)) return "L";
  if (/[a-z0-9]/.test(c) || /\p{L}/u.test(c)) return "etc";
  return "rest";
}

/** Characters per mouth shape: one shape every ~70 ms at the reading rate. */
const CHARS_PER_SHAPE = 2;

/**
 * The mouth shape at `progress` (0..1) through `text`. Steps every couple of
 * characters, picks the most open shape in the step (so the mouth reads
 * clearly) and closes on spaces and punctuation.
 */
export function visemeAt(text: string, progress: number): Viseme {
  if (!text || !(progress >= 0) || progress >= 1) return "rest";
  const i = Math.floor(progress * text.length);
  const start = i - (i % CHARS_PER_SHAPE);
  const chunk = text.slice(start, start + CHARS_PER_SHAPE);
  let best: Viseme = "rest";
  for (const ch of chunk) {
    const v = visemeForChar(ch);
    if (OPENNESS[v] > OPENNESS[best]) best = v;
  }
  return best;
}

/** How open each shape is, 0..1 (for jaws and beaks that only open and close). */
export const OPENNESS: Record<Viseme, number> = { rest: 0, MBP: 0.02, FV: 0.15, U: 0.3, L: 0.4, etc: 0.45, E: 0.55, O: 0.75, AI: 1 };

// ---------------------------------------------------------------- blinks

/** Each anchor blinks on its own rhythm (ms between blinks before jitter), so the three never blink together. */
const BLINK_PERIOD_MS: Record<PersonaId, number> = { plume: 5200, brack: 3700, ledgerly: 4400 };
const BLINK_MS = 150;

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Whether `anchor`'s eyes are shut at `nowMs`: a short blink once a period, at a jittered point in it. */
export function blinkClosed(anchor: PersonaId, nowMs: number): boolean {
  const p = BLINK_PERIOD_MS[anchor];
  const k = Math.floor(nowMs / p);
  const at = (hash32(`${anchor}:${k}`) % (p - BLINK_MS));
  const t = nowMs - k * p;
  return t >= at && t < at + BLINK_MS;
}

// ---------------------------------------------------------------- gaze

/** Seats at the desk, left to right as the viewer sees them. */
export const SEATS: readonly PersonaId[] = ["brack", "plume", "ledgerly"];

/** Where an anchor looks: -1 to the viewer's left, 0 at the camera, 1 to the right. The speaker looks at the camera; the others look at the speaker. */
export function gazeFor(anchor: PersonaId, speaker: PersonaId | null): -1 | 0 | 1 {
  if (!speaker || anchor === speaker) return 0;
  const a = SEATS.indexOf(anchor);
  const s = SEATS.indexOf(speaker);
  return s < a ? -1 : 1;
}
