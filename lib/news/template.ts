// The template writer: facts in, anchor lines out, the way lib/brief/sentence.ts
// writes the place brief. Every sentence the desk can say without the model is
// in this file. Each line interpolates fact fields and nothing else, carries
// the ids of the facts it states, and passes the claim check in
// lib/news/rundown.ts (a test runs every line through it).
//
// Times are read in UTC, with the date, because the desk has no idea where its
// viewers are; "tonight" and "this morning" are never said. A launch is read
// to the precision Launch Library gives, a release window as a window, a
// model's weather as a model's.
//
// Pure: the caller passes generatedAt; nothing reads the clock or a network,
// and the phrasing varies only with fact ids and the half hour.

import { num } from "@/lib/brief/format";
import type { Fact } from "./facts";
import { PERSONAS, RUNNING_BITS, DISCLOSURE, type PersonaId } from "./personas";
import { WHEEL, type WheelSegment } from "./schedule";
import type { Rundown, RundownLine, RundownSegment } from "./rundown";
import { shortHash } from "./wire";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "03:25 UTC" */
export function utcClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** "7 October" (UTC). */
export function utcDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "1 September 2026" from "2026-09-01" (a calendar date, not an instant). */
export function calendarDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ymd;
}

/** Grouped en-US number with at most `dp` decimals, trailing zeros dropped. */
export function figure(v: number, dp = 1): string {
  const k = 10 ** dp;
  const r = Math.round(v * k) / k;
  const s = num(r, dp);
  return dp > 0 && s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** An ALL-CAPS incident name read in title case ("LITTLE GIANT" -> "Little Giant"); mixed case is left as published. */
export function readName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

function pick<T>(options: T[], seed: string): T {
  return options[parseInt(shortHash(seed), 36) % options.length];
}

function line(anchor: PersonaId, text: string, facts: Fact[] = []): RundownLine {
  return { anchor, text, factIds: facts.map((f) => f.id) };
}

function unitWords(value: string, unit: string | undefined): string {
  if (unit === "%") return `${value} percent`;
  if (unit === "$ per barrel") return `${value} dollars a barrel`;
  return unit ? `${value} ${unit}` : value;
}

// ---------------------------------------------------------------- one sentence per fact kind

export function quakeLine(f: Fact): string {
  const h = f.headline_fields;
  const n = f.numbers;
  const at = f.time ? `, at ${utcClock(f.time)} on ${utcDay(f.time)}` : "";
  const depth = n.depthKm != null ? `, ${figure(n.depthKm)} kilometres deep` : "";
  const pager = h.pagerAlert ? ` USGS rates its PAGER impact alert ${h.pagerAlert}.` : "";
  // USGS writes "92 km NNW of Aleneva, Alaska" or "south of the Fiji Islands", or a bare region ("Kuril Islands").
  const where = /^[\d\p{Ll}]/u.test(h.place ?? "") ? h.place : `in ${h.place}`;
  return `USGS reports a magnitude ${figure(n.magnitude)} earthquake ${where}${at}${depth}.${pager}`;
}

export function alertCountLine(f: Fact): string {
  const n = f.numbers;
  const h = f.headline_fields;
  const most = n.commonestEventCount != null && h.commonestEvent ? ` The commonest is the ${h.commonestEvent}, with ${figure(n.commonestEventCount, 0)}.` : "";
  return `The National Weather Service has ${figure(n.inForce, 0)} ${n.inForce === 1 ? "alert" : "alerts"} rated Severe or Extreme in force.${most}`;
}

export function alertLine(f: Fact): string {
  const h = f.headline_fields;
  const areas = `${h.areas ?? "its area"}${h.moreAreas ? " and more areas" : ""}`;
  const until = h.expires ? `, until ${utcClock(h.expires)} on ${utcDay(h.expires)}` : "";
  const rating = [h.severity, h.urgency, h.certainty].filter(Boolean).map((s) => s!.toLowerCase());
  const rated = rating.length ? ` NWS rates it ${rating.length > 1 ? rating.slice(0, -1).join(", ") + " and " + rating[rating.length - 1] : rating[0]}.` : "";
  return `${h.sender ?? "The National Weather Service"} has a ${h.event} in effect for ${areas}${until}.${rated}`;
}

export function fireLine(f: Fact): string {
  const h = f.headline_fields;
  const n = f.numbers;
  const where = f.place ? ` in ${f.place.name}` : "";
  const basis = h.sizeBasis === "perimeter" ? "by its mapped perimeter" : "by its reported size";
  const contained = n.containedPct != null ? `is ${figure(n.containedPct, 0)} percent contained` : "has no containment reported";
  const crew = n.personnel != null && n.personnel > 0 ? `, with ${figure(n.personnel, 0)} personnel assigned` : "";
  return `The ${readName(h.name)} fire${where} covers ${figure(n.acres, 0)} acres ${basis} and ${contained}${crew}, according to NIFC.`;
}

/** NET read to Launch Library's precision. */
export function netPhrase(f: Fact): string {
  if (!f.time) return "with no date published";
  const p = (f.headline_fields.netPrecision ?? "").toLowerCase();
  if (p === "month") return `no earlier than sometime in ${MONTHS[new Date(f.time).getUTCMonth()]}`;
  if (p === "day" || p === "week") return `no earlier than ${utcDay(f.time)}, to within the ${p}`;
  if (p === "hour") return `no earlier than ${utcClock(f.time)} on ${utcDay(f.time)}, to within the hour`;
  return `no earlier than ${utcClock(f.time)} on ${utcDay(f.time)}`;
}

export function launchLine(f: Fact): string {
  const h = f.headline_fields;
  const who = h.provider ?? "A launch provider";
  const what = h.mission ?? h.name ?? "a mission";
  const on = h.rocket ? ` on a ${h.rocket}` : "";
  const from = h.location ? ` from ${h.location}` : "";
  const status = h.status ? ` Launch Library lists its status as ${h.status}.` : "";
  return `${who} is scheduled to launch ${what}${on}${from}, ${netPhrase(f)}.${status}`;
}

export function kpLine(f: Fact): string {
  const h = f.headline_fields;
  const value = figure(f.numbers.kp, 2);
  const g = h.gScale ? ` On NOAA's scale that is a ${h.gScale} geomagnetic storm.` : "";
  if (f.id.startsWith("kp-max24:")) return `The highest planetary Kp index of the past day was ${value}, ${h.status === "preliminary" ? "a preliminary value" : "a definitive value"}.${g}`;
  return `GFZ Potsdam's latest planetary Kp index is ${value}, ${h.status === "preliminary" ? "a preliminary value" : "a definitive value"}.${g}`;
}

export function flareLine(f: Fact): string {
  const h = f.headline_fields;
  const at = f.time ? ` that peaked at ${utcClock(f.time)} on ${utcDay(f.time)}` : "";
  const region = h.region ? `, from active region ${h.region}` : "";
  return `NASA's DONKI database logged an ${h.classType} solar flare${at}${region}.`;
}

export function indicatorLine(f: Fact): string {
  const h = f.headline_fields;
  const n = f.numbers;
  const value = unitWords(figure(n.value, 2), h.unit);
  const dir = n.prev == null ? "" : n.value > n.prev ? `, up from ${unitWords(figure(n.prev, 2), h.unit)}` : n.value < n.prev ? `, down from ${unitWords(figure(n.prev, 2), h.unit)}` : ", unchanged from the observation before";
  const prev = n.prev != null && n.value !== n.prev && h.prevDate ? ` on ${calendarDate(h.prevDate)}` : "";
  return `FRED's latest reading for the ${h.label} is ${value}, in the observation dated ${calendarDate(h.date)}${dir}${prev}.`;
}

export function releaseLine(f: Fact): string {
  const h = f.headline_fields;
  if (h.precision === "official" || h.earliest === h.latest)
    return `On the release calendar: ${h.title}, ${h.precision === "official" ? "scheduled for" : "expected around"} ${calendarDate(h.earliest)}${h.precision === "official" ? ", on the publisher's own schedule" : ", our estimate from its usual timing"}.`;
  return `On the release calendar: ${h.title}, expected between ${calendarDate(h.earliest)} and ${calendarDate(h.latest)}, our estimate from its usual timing.`;
}

export function weatherLine(f: Fact): string {
  const n = f.numbers;
  const about = f.headline_fields.about ?? "";
  const where = about.startsWith("quake:") ? "At the quake's location" : about.startsWith("fire:") ? "At the fire" : "There";
  const parts: string[] = [];
  if (n.tempC != null) parts.push(`${n.tempC < 0 ? "minus " : ""}${figure(Math.abs(n.tempC))} degrees Celsius`);
  if (n.humidityPct != null) parts.push(`humidity ${figure(n.humidityPct, 0)} percent`);
  if (n.windMs != null) parts.push(`wind ${figure(n.windMs)} metres per second`);
  if (n.precipMm != null && n.precipMm > 0) parts.push(`${figure(n.precipMm)} millimetres of precipitation`);
  return `${where}, Open-Meteo's weather model has ${parts.join(", ")}. That is a model estimate, not a station reading.`;
}

export function wireLine(f: Fact): string {
  return `From ${f.headline_fields.outlet}: "${f.headline_fields.title}"`;
}

// ---------------------------------------------------------------- segments

function byKind(facts: Fact[], kind: Fact["kind"]): Fact[] {
  return facts.filter((f) => f.kind === kind);
}

function emptyCard(seg: WheelSegment, failed: ReadonlySet<string>, sources: string[]): RundownLine {
  const down = sources.some((s) => failed.has(s));
  return line(seg.anchor, down ? `${seg.title} is standing by: its feeds did not answer in time, so its items are missing, not absent.` : `${seg.title} has nothing to report this half hour: its feeds answered with nothing in force.`);
}

function segment(seg: WheelSegment, lines: RundownLine[]): RundownSegment {
  return { id: seg.id, title: seg.title, anchor: seg.anchor, lines, facts: [], location: null };
}

const SEG = Object.fromEntries(WHEEL.map((s) => [s.id, s])) as Record<WheelSegment["id"], WheelSegment>;

function topSegment(facts: Fact[], failed: ReadonlySet<string>, seed: string): RundownSegment {
  const seg = SEG.top;
  const picks = [byKind(facts, "alert-count")[0], byKind(facts, "quake")[0], byKind(facts, "wildfire")[0], byKind(facts, "launch")[0]].filter((f): f is Fact => !!f);
  if (picks.length < 3) picks.push(...byKind(facts, "wire").slice(0, 3 - picks.length));
  const o = PERSONAS.plume;
  const open = pick([`Hello from the Atlas desk. I'm ${o.name}. ${o.catchphrases[0]}`, `This is the Atlas desk, and I'm ${o.name}. ${o.catchphrases[1]}`, `I'm ${o.name} at the Atlas desk. ${o.catchphrases[2]}`], seed + ":top");
  if (!picks.length) return segment(seg, [line("plume", open), emptyCard(seg, failed, ["usgs-earthquakes", "nws-api", "nifc-wfigs", "launch-library-2"])]);
  const lines = [line("plume", open)];
  for (const f of picks) lines.push(line("plume", sentenceFor(f), [f]));
  lines.push(line("plume", pick(["Tully, over to you at the map wall.", "Let's go to Tully at the map wall.", "First, Planet Watch. Tully?"], seed + ":toss")));
  return segment(seg, lines);
}

function sentenceFor(f: Fact): string {
  switch (f.kind) {
    case "quake":
      return quakeLine(f);
    case "alert-count":
      return alertCountLine(f);
    case "alert":
      return alertLine(f);
    case "wildfire":
      return fireLine(f);
    case "launch":
      return launchLine(f);
    case "kp":
      return kpLine(f);
    case "flare":
      return flareLine(f);
    case "indicator":
      return indicatorLine(f);
    case "release":
      return releaseLine(f);
    case "weather":
      return weatherLine(f);
    case "wire":
      return wireLine(f);
  }
}

function planetSegment(facts: Fact[], failed: ReadonlySet<string>, seed: string): RundownSegment {
  const seg = SEG["planet-watch"];
  const quakes = byKind(facts, "quake").slice(0, 3);
  const count = byKind(facts, "alert-count").slice(0, 1);
  const alerts = byKind(facts, "alert").slice(0, 2);
  const fires = byKind(facts, "wildfire").slice(0, 2);
  const wx = byKind(facts, "weather");
  const body = [...quakes, ...count, ...alerts, ...fires];
  const open = line("brack", pick(["Tully Brack, on the map.", "Let's get our paws on the data.", "Thanks, Odessa. Tully Brack, on the map."], seed + ":pw"));
  if (!body.length) return segment(seg, [open, emptyCard(seg, failed, ["usgs-earthquakes", "nws-api", "nifc-wfigs"])]);
  const lines = [open];
  for (const f of body) {
    lines.push(line("brack", sentenceFor(f), [f]));
    const w = wx.find((x) => x.headline_fields.about === f.id);
    if (w) lines.push(line("brack", weatherLine(w), [w]));
  }
  lines.push(line("brack", pick(["Back to you at the desk.", "Hold that stone. Back to you, Odessa.", "That's the map for now. Back to the desk."], seed + ":pw-close")));
  return segment(seg, lines);
}

function liftoffSegment(facts: Fact[], failed: ReadonlySet<string>, seed: string): RundownSegment {
  const seg = SEG.liftoff;
  const body = [...byKind(facts, "launch"), ...byKind(facts, "kp"), ...byKind(facts, "flare").slice(0, 2)];
  const open = line("ledgerly", pick(["Ears up. This is Liftoff.", "Mott Ledgerly with Liftoff. No earlier than, never exactly.", "Liftoff, from the space desk. Let's check the ledger."], seed + ":lo"));
  if (!body.length) return segment(seg, [open, emptyCard(seg, failed, ["launch-library-2", "gfz-kp", "nasa-donki"])]);
  return segment(seg, [open, ...body.map((f) => line("ledgerly", sentenceFor(f), [f]))]);
}

function moneySegment(facts: Fact[], failed: ReadonlySet<string>, seed: string): RundownSegment {
  const seg = SEG["money-desk"];
  const body = [...byKind(facts, "indicator"), ...byKind(facts, "release").slice(0, 4)];
  const open = line("ledgerly", pick(["Money Desk. Let's check the ledger.", "On the Money Desk, the latest published numbers.", "Money Desk, and a window is not a date."], seed + ":md"));
  if (!body.length) return segment(seg, [open, emptyCard(seg, failed, ["fred"])]);
  return segment(seg, [open, ...body.map((f) => line("ledgerly", sentenceFor(f), [f]))]);
}

function wireSegment(facts: Fact[], failed: ReadonlySet<string>, seed: string): RundownSegment {
  const seg = SEG["the-wire"];
  // Newest first, at most two from any one outlet so one busy feed does not drown the rest.
  const per = new Map<string, number>();
  const items = byKind(facts, "wire")
    .filter((f) => {
      const n = per.get(f.headline_fields.outlet) ?? 0;
      per.set(f.headline_fields.outlet, n + 1);
      return n < 2;
    })
    .slice(0, 10);
  const open = line("plume", pick(["The Wire: headlines from other newsrooms, read as they wrote them, each with its outlet.", "Now The Wire. These are other newsrooms' headlines, word for word, with the outlet named.", "The Wire. Headlines as their outlets published them; follow the links for the stories."], seed + ":wire"));
  if (!items.length) return segment(seg, [open, emptyCard(seg, failed, ["wire-npr", "wire-bbc", "wire-dw", "wire-abc-au", "wire-aljazeera", "wire-france24", "wire-un-news"])]);
  return segment(seg, [open, ...items.map((f) => line("plume", wireLine(f), [f])), line("plume", "Those are their headlines; the stories are theirs. The links are on the source card.")]);
}

function bumper(seg: WheelSegment, seed: string, offset: number): RundownSegment {
  const bits = RUNNING_BITS;
  const start = parseInt(shortHash(seed), 36) % bits.length;
  const bit = bits[(start + offset) % bits.length];
  return segment(seg, bit.lines.map((l) => line(l.anchor, l.text)));
}

function signOff(seed: string): RundownSegment {
  const seg = SEG["sign-off"];
  return segment(seg, [
    line("plume", "That's the half hour. Every line you heard came from the facts on the source cards, and each card links to its original source."),
    line("brack", pick(["Tully Brack, on the map.", "Hold that stone."], seed + ":so-b")),
    line("ledgerly", pick(["Ears up.", "Let's check the ledger, next half hour."], seed + ":so-l")),
    line("plume", "A reminder: the three of us are cartoon characters, and fixed templates wrote this script from those facts. Check the original sources before you rely on any of it."),
  ]);
}

/**
 * The template rundown for `facts`, generated at `generatedAt` (ISO). The
 * half hour it belongs to seeds the phrasing, so one half hour reads the same
 * on every request.
 */
export function templateRundown(facts: Fact[], generatedAt: string, failedSources: Iterable<string> = []): Rundown {
  const failed = new Set(failedSources);
  const t = Date.parse(generatedAt);
  const seed = String(Math.floor(t / 1_800_000));
  return {
    generatedAt,
    writer: "template",
    expires: new Date(t + 30 * 60_000).toISOString(),
    segments: [
      topSegment(facts, failed, seed),
      planetSegment(facts, failed, seed),
      bumper(SEG["bumper-1"], seed, 0),
      liftoffSegment(facts, failed, seed),
      moneySegment(facts, failed, seed),
      bumper(SEG["bumper-2"], seed, 1),
      wireSegment(facts, failed, seed),
      signOff(seed),
    ],
  };
}

export { DISCLOSURE };
