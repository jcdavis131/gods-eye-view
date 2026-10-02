// The counts and ranks a finding prints or is gated on, recomputed on this
// side from the evidence's own comparison sets, so a count that disagrees
// with the values beside it is a refusal rather than a printed claim.
//
// The evidence states each count twice: as a number (its value and the
// metros it names) and implicitly, through the sets it runs over (each
// member's growth_pct, and the universe's metros each set leaves out). The
// producer computed the first from the second; nothing on this side checked
// that, so an export whose counts said 0 while a member's values beat the
// subject on both axes built with "no major metro beat {subject} on both"
// (the A1 verifier's Savannah and Tampa variants). recomputeSpec reads the
// sets and checks every number of one specification window against them:
//
//   - each member's growth_pct is the evidence number of that metro and axis
//     where the evidence has one (the main specification has one per chart
//     row), and the subject is a member of both sets;
//   - the subject's rank on each axis: 1 + the members with a strictly larger
//     value (competition rank);
//   - publishable: the metros in both sets;
//   - beat_on_both and beat_on_either: the members of both sets, the subject
//     aside, with a strictly larger value on both axes / on at least one;
//   - rank_min: 1 + the members of both sets with a strictly larger minimum;
//   - not_publishable_could_beat_both: each metro of the universe that is not
//     in both sets, checked on each axis it has a value on (an evidence
//     number of that metro and axis with a finite value): it could beat the
//     subject on both if it has no axis, or a strictly larger value on every
//     axis it has. Each entry of the number's checks[] must say exactly that,
//     with the values of the evidence numbers it names.
//
// anchorMainToChart ties the main specification's sets to the chart: its
// universe is the chart's rows, each row's x and y are the evidence numbers
// of that metro's office and goods-and-logistics growth and its bubble that
// metro's total nonfarm change, and a row is in both sets exactly when it is
// plotted.
//
// setPeriodProblems ties every set to its key: the row, window and axis it
// says it is, and the cells each end reads (its periods) are the ones its
// window label names, so the window a page prints is the one the members'
// growth was recomputed over (the A3 verifier's E1 renamed to 2031 over 2024
// cells).
//
// recomputeFromCells goes one step further down, to the published cells:
// every growth, change and cell number the evidence holds, and every set
// member's growth, is recomputed from the cells it reads (the number's own
// provenance tuples; a member's series in the cells table at the set's
// periods), summing the published text exactly. Each reads exactly the
// registered parts of its metro (sentence.ts axisParts) at every period of
// both ends, and the value must agree to 1e-9, relative. The main universe's
// values are its members' total nonfarm cells. So a value moved by hand,
// with the cells it cites left alone, is a refusal however consistently the
// rest of the evidence was moved with it (the A3 verifier's Dallas +4).
//
// recomputeCoverage checks a row that keeps the main peers (the definition,
// end-year and sub-period rows) against the main universe: its sets cover
// exactly main:universe's metros.
//
// recomputePeers checks a peers row ranked like the universe (P2, P3) against
// that ranking: as many metros as it registers, and for a row no larger than
// the universe, exactly the largest of it; for a larger row (P3), the whole
// universe and its first metro out. The ranking past the universe's cutoff is
// not in the evidence, so which metros fill the rest of P3 is not checked.
//
// Pure, over the evidence alone. Each function returns the problems it found
// (empty when everything agrees); the build refuses on any.

import { byteCompare, canonicalJson } from "./render/spec";
import { axisParts, rowAxes } from "./sentence";
import { MONTHS } from "./sources";
import type { Evidence, EvidenceNumber, EvidenceSet } from "./types";

/** One entry of not_publishable_could_beat_both's checks[], as the producer writes it. */
interface CouldBeatCheck {
  metro: string;
  has: Record<string, { number: string; value: number }>;
  missing: string[];
  beats_on: string[];
  could_beat_both: boolean;
  subject: Record<string, { number: string; value: number }>;
}

const finiteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const sorted = (xs: Iterable<string>): string[] => [...xs].sort(byteCompare);

/** The value a set gives a member, or null when the member carries none. */
function memberValue(set: EvidenceSet, cbsa: string): number | null {
  const m = set.members[cbsa] as { growth_pct?: unknown } | undefined;
  return m && finiteNumber(m.growth_pct) ? m.growth_pct : null;
}

/** The two comparison sets of a specification window, office-type axis first, read from its publishable count. */
export function windowSets(ev: Evidence, prefix: string): { axes: [string, string]; sets: [EvidenceSet, EvidenceSet]; keys: [string, string] } | string {
  const pub = ev.numbers[`${prefix}.publishable`];
  if (!pub) return `${prefix}: the evidence has no publishable count`;
  const over = pub.over ?? [];
  if (over.length !== 2) return `${prefix}: the publishable count runs over ${over.length} sets, not two`;
  const sets = over.map((k) => ev.sets[k]);
  if (sets.some((s) => !s)) return `${prefix}: set ${over.find((k) => !ev.sets[k])} is not in the evidence`;
  for (const [k, s] of over.map((k, i) => [k, sets[i]] as const)) {
    if (k !== `${prefix}:${s.axis}`) return `${prefix}: set ${k} is not the window's ${s.axis} set`;
  }
  return { axes: [sets[0].axis, sets[1].axis], sets: [sets[0], sets[1]], keys: [over[0], over[1]] };
}

/** "N (a, b)" for a problem message. */
function listed(n: unknown, metros: string[]): string {
  return `${JSON.stringify(n)}${metros.length ? ` (${metros.join(", ")})` : ""}`;
}

/**
 * Every count and rank of one specification window (`prefix`, e.g.
 * "P2:2019->2025") recomputed from its sets and compared with the evidence
 * numbers under that prefix. Numbers the window does not carry are skipped;
 * the publishable count and the subject's place in both sets are required.
 */
export function recomputeSpec(ev: Evidence, prefix: string, subject: string): string[] {
  const problems: string[] = [];
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return [w];
  const { axes, sets } = w;
  const num = (key: string): EvidenceNumber | undefined => ev.numbers[key];

  // Members' values: each a finite growth, and the evidence's own number for that metro and axis where it has one.
  for (const [i, set] of sets.entries()) {
    for (const cbsa of Object.keys(set.members)) {
      const v = memberValue(set, cbsa);
      if (v === null) {
        problems.push(`${prefix}: member ${cbsa} of the ${axes[i]} set has no finite growth_pct`);
        continue;
      }
      const n = num(`${prefix}.${cbsa}.${axes[i]}.growth_pct`);
      if (n && n.value !== v) problems.push(`${prefix}: ${cbsa}'s ${axes[i]} growth is ${JSON.stringify(n.value)} in the evidence numbers, ${v} in its set`);
    }
  }
  const universe = sorted(new Set([...Object.keys(sets[0].members), ...Object.keys(sets[0].excluded ?? {})]));
  const universeB = sorted(new Set([...Object.keys(sets[1].members), ...Object.keys(sets[1].excluded ?? {})]));
  if (canonicalJson(universe) !== canonicalJson(universeB)) problems.push(`${prefix}: its two sets cover different metros`);
  for (const set of sets) {
    const both = Object.keys(set.members).filter((c) => Object.hasOwn(set.excluded ?? {}, c));
    if (both.length) problems.push(`${prefix}: ${both.join(", ")} is both a member of the ${set.axis} set and left out of it`);
  }

  const inBoth = sorted(Object.keys(sets[0].members).filter((c) => Object.hasOwn(sets[1].members, c)));
  const pub = num(`${prefix}.publishable`) as EvidenceNumber;
  if (pub.value !== inBoth.length) problems.push(`${prefix}: the publishable count is ${JSON.stringify(pub.value)}, the sets have ${inBoth.length} metros in both`);

  const s = [memberValue(sets[0], subject), memberValue(sets[1], subject)];
  if (s[0] === null || s[1] === null || !inBoth.includes(subject)) {
    problems.push(`${prefix}: the subject ${subject} is not a member of both sets`);
    return problems;
  }
  const [s0, s1] = s as [number, number];
  const value = (i: 0 | 1, c: string) => memberValue(sets[i], c) as number;

  // The subject's own growth and rank on each axis.
  for (const i of [0, 1] as const) {
    const g = num(`${prefix}.${subject}.${axes[i]}.growth_pct`);
    if (g && g.value !== s[i]) problems.push(`${prefix}: the subject's ${axes[i]} growth is ${JSON.stringify(g.value)} in the evidence numbers, ${s[i]} in its set`);
    const r = num(`${prefix}.${subject}.${axes[i]}.rank`);
    if (r) {
      const rank = 1 + Object.keys(sets[i].members).filter((c) => value(i, c) > (s[i] as number)).length;
      if (r.value !== rank) problems.push(`${prefix}: the subject's ${axes[i]} rank is ${JSON.stringify(r.value)} in the evidence, ${rank} recomputed from its set`);
    }
  }

  // Beat on both, beat on either, the rank of the minimum.
  const others = inBoth.filter((c) => c !== subject);
  const count = (key: string, metros: string[]) => {
    const n = num(key);
    if (!n) return;
    const named = sorted(n.metros ?? []);
    if (n.value !== metros.length || canonicalJson(named) !== canonicalJson(metros)) {
      problems.push(`${prefix}: ${key.slice(prefix.length + 1)} is ${listed(n.value, named)} in the evidence, ${listed(metros.length, metros)} recomputed from the sets`);
    }
  };
  count(`${prefix}.${subject}.beat_on_both`, others.filter((c) => value(0, c) > s0 && value(1, c) > s1));
  count(`${prefix}.${subject}.beat_on_either`, others.filter((c) => value(0, c) > s0 || value(1, c) > s1));
  const rm = num(`${prefix}.${subject}.rank_min`);
  if (rm) {
    const rank = 1 + others.filter((c) => Math.min(value(0, c), value(1, c)) > Math.min(s0, s1)).length;
    if (rm.value !== rank) problems.push(`${prefix}: the subject's rank_min is ${JSON.stringify(rm.value)} in the evidence, ${rank} recomputed from the sets`);
  }

  // The metros that are not in both sets, each checked on the axes it has.
  const np = num(`${prefix}.${subject}.not_publishable_could_beat_both`);
  if (np) {
    const outside = universe.filter((c) => !inBoth.includes(c));
    const could: string[] = [];
    const checks = ((np as { checks?: unknown }).checks ?? []) as CouldBeatCheck[];
    const byMetro = new Map(checks.map((c) => [c.metro, c]));
    if (byMetro.size !== checks.length || canonicalJson(sorted(byMetro.keys())) !== canonicalJson(outside)) {
      problems.push(`${prefix}: not_publishable_could_beat_both checks ${JSON.stringify(sorted(checks.map((c) => c.metro)))}, the metros not in both sets are ${JSON.stringify(outside)}`);
    }
    for (const c of outside) {
      const has: Record<string, { number: string; value: number }> = {};
      for (const a of axes) {
        const key = `${prefix}.${c}.${a}.growth_pct`;
        const v = num(key)?.value;
        if (finiteNumber(v)) has[a] = { number: key, value: v };
      }
      const had = axes.filter((a) => has[a]);
      const beatsOn = had.filter((a) => has[a].value > (a === axes[0] ? s0 : s1));
      const canBeat = had.length === 0 || beatsOn.length === had.length;
      if (canBeat) could.push(c);
      const ch = byMetro.get(c);
      if (!ch) continue;
      const want = {
        has,
        missing: axes.filter((a) => !has[a]),
        beats_on: beatsOn,
        could_beat_both: canBeat,
        subject: { [axes[0]]: { number: `${prefix}.${subject}.${axes[0]}.growth_pct`, value: s0 }, [axes[1]]: { number: `${prefix}.${subject}.${axes[1]}.growth_pct`, value: s1 } },
      };
      const got = { has: ch.has ?? {}, missing: sorted(ch.missing ?? []), beats_on: sorted(ch.beats_on ?? []), could_beat_both: ch.could_beat_both, subject: ch.subject ?? {} };
      const wantSorted = { ...want, missing: sorted(want.missing), beats_on: sorted(want.beats_on) };
      if (canonicalJson(got) !== canonicalJson(wantSorted)) {
        problems.push(`${prefix}: the not-publishable check of ${c} says ${canonicalJson(got)}, the evidence numbers it names say ${canonicalJson(wantSorted)}`);
      }
    }
    const named = sorted(np.metros ?? []);
    if (np.value !== could.length || canonicalJson(named) !== canonicalJson(could)) {
      problems.push(`${prefix}: not_publishable_could_beat_both is ${listed(np.value, named)} in the evidence, ${listed(could.length, could)} recomputed from the sets and the metros' own numbers`);
    }
  }
  return problems;
}

/**
 * A row that keeps the main specification's peers (sentence.ts
 * robustnessRegistered, universe "main": the definition, end-year and
 * sub-period rows) against the main universe: each of its window's two sets
 * covers, members and the excluded alike, exactly the metros of
 * main:universe. Its counts are recomputed from its own sets
 * (recomputeSpec), so without this a metro dropped from both sets, with
 * every count moved to match, built: the A3 verifier's R 2022->2025 without
 * Tallahassee, which beats the subject on both, printed a recency caveat
 * naming Beaumont alone, and E1 without Houston held the H3b gate over 149
 * metros.
 */
export function recomputeCoverage(ev: Evidence, prefix: string): string[] {
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return [w];
  const u = ev.sets["main:universe"];
  if (!u) return [`${prefix}: the evidence has no main:universe to check its metros against`];
  const want = sorted(Object.keys(u.members));
  const wanted = new Set(want);
  const problems: string[] = [];
  for (const [i, set] of w.sets.entries()) {
    const covered = sorted(new Set([...Object.keys(set.members), ...Object.keys(set.excluded ?? {})]));
    const has = new Set(covered);
    const out = want.filter((c) => !has.has(c));
    const extra = covered.filter((c) => !wanted.has(c));
    if (out.length || extra.length) {
      const said = [out.length ? `${out.join(", ")} left out` : "", extra.length ? `${extra.join(", ")} not in it` : ""].filter(Boolean).join("; ");
      problems.push(`${prefix}: its ${w.axes[i]} set covers ${covered.length} metros, not the ${want.length} of the main universe it keeps: ${said}`);
    }
  }
  return problems;
}

/**
 * The main specification's sets against the chart: the universe is the
 * chart's rows, each row reads that metro's evidence numbers for the two
 * axes, and a row is a member of both sets exactly when it has both values.
 * `x` and `y` name the axes the chart plots horizontally and vertically.
 */
export function anchorMainToChart(ev: Evidence, prefix: string, x: string, y: string): string[] {
  const problems: string[] = [];
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return [w];
  if (w.axes[0] !== x || w.axes[1] !== y) return [`${prefix}: its sets are ${w.axes.join(" and ")}, the chart plots ${x} against ${y}`];
  const universe = ev.sets[`${prefix.split(":")[0]}:universe`];
  const rows = sorted(Object.keys(ev.chart.rows));
  if (!universe || canonicalJson(sorted(Object.keys(universe.members))) !== canonicalJson(rows)) problems.push(`${prefix}: the chart's rows are not the members of the universe set`);
  const covered = sorted(new Set([...Object.keys(w.sets[0].members), ...Object.keys(w.sets[0].excluded ?? {})]));
  if (canonicalJson(covered) !== canonicalJson(rows)) problems.push(`${prefix}: the sets cover ${covered.length} metros, the chart has ${rows.length} rows`);
  for (const c of rows) {
    const r = ev.chart.rows[c];
    if (r.x !== `${prefix}.${c}.${x}.growth_pct` || r.y !== `${prefix}.${c}.${y}.growth_pct`) {
      problems.push(`chart row ${c} reads ${r.x} and ${r.y}, not ${prefix}'s ${x} and ${y} growth of ${c}`);
      continue;
    }
    // The bubble is the metro's own change in total nonfarm jobs over the window, not another metro's or another window's.
    if (r.size !== `${prefix}.${c}.total_nonfarm.change`) problems.push(`chart row ${c}'s bubble reads ${r.size}, not ${prefix}'s total nonfarm change of ${c}`);
    const vx = ev.numbers[r.x]?.value;
    const vy = ev.numbers[r.y]?.value;
    const member = Object.hasOwn(w.sets[0].members, c) && Object.hasOwn(w.sets[1].members, c);
    if (member !== (finiteNumber(vx) && finiteNumber(vy))) problems.push(`chart row ${c} has ${finiteNumber(vx) && finiteNumber(vy) ? "both values" : "a missing value"} but is ${member ? "" : "not "}a member of both sets`);
  }
  return problems;
}

/**
 * A median number against its one set: the middle member's value for an odd
 * count (and that member named), the mean of the two middle values for an
 * even one.
 */
export function recomputeMedian(ev: Evidence, key: string): string[] {
  const n = ev.numbers[key];
  if (!n || n.kind !== "median") return [`${key} is not an evidence median`];
  const over = n.over ?? [];
  const set = over.length === 1 ? ev.sets[over[0]] : undefined;
  if (!set) return [`${key}: a median runs over one evidence set, not ${JSON.stringify(over)}`];
  const vs = Object.keys(set.members)
    .map((c) => [c, memberValue(set, c)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== null)
    .sort((a, b) => a[1] - b[1] || byteCompare(a[0], b[0]));
  if (vs.length === 0) return [`${key}: its set has no member with a value`];
  const mid = Math.floor(vs.length / 2);
  const value = vs.length % 2 === 1 ? vs[mid][1] : (vs[mid - 1][1] + vs[mid][1]) / 2;
  if (n.value !== value) return [`${key} is ${JSON.stringify(n.value)} in the evidence, ${value} recomputed from ${over[0]}`];
  if (vs.length % 2 === 1 && n.metros && !vs.some(([c, v]) => v === value && (n.metros as string[]).includes(c))) return [`${key} names ${JSON.stringify(n.metros)}, not a member whose value is the median`];
  return [];
}

/**
 * A random-peer probability's m, n and not_beaten against the sets it runs
 * over: n is the members of both sets other than the subject, m those with a
 * strictly smaller value on both axes, not_beaten the rest.
 */
export function recomputeRandomPeer(ev: Evidence, key: string, prefix: string, subject: string): string[] {
  const p = ev.numbers[key];
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return [w];
  if (!p || canonicalJson(p.over ?? []) !== canonicalJson(w.keys)) return [`${key} does not run over ${prefix}'s two sets`];
  const s0 = memberValue(w.sets[0], subject);
  const s1 = memberValue(w.sets[1], subject);
  if (s0 === null || s1 === null) return [`${prefix}: the subject ${subject} is not a member of both sets`];
  const others = sorted(Object.keys(w.sets[0].members).filter((c) => c !== subject && Object.hasOwn(w.sets[1].members, c)));
  const beaten = others.filter((c) => (memberValue(w.sets[0], c) as number) < s0 && (memberValue(w.sets[1], c) as number) < s1);
  const notBeaten = others.filter((c) => !beaten.includes(c));
  if (p.n !== others.length || p.m !== beaten.length || canonicalJson(sorted(p.not_beaten ?? [])) !== canonicalJson(notBeaten)) {
    return [`${key}: m = ${p.m} of n = ${p.n}, not beaten ${JSON.stringify(sorted(p.not_beaten ?? []))} in the evidence; the sets give m = ${beaten.length} of n = ${others.length}, not beaten ${JSON.stringify(notBeaten)}`];
  }
  return [];
}

// ---------------------------------------------------------------- from the published cells

/** Relative agreement of a recomputed value with the evidence's. */
export const RELATIVE_TOLERANCE = 1e-9;

function agrees(got: number, want: number): boolean {
  if (got === want) return true;
  return Math.abs(got - want) <= RELATIVE_TOLERANCE * Math.max(Math.abs(got), Math.abs(want));
}

/** One published cell: a series at "year|period", its value as published. */
interface PublishedCell {
  series: string;
  at: string;
  value: string;
}

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** The decimal places of a published value, or null when it is not a plain decimal. */
function places(text: string): number | null {
  const m = DECIMAL.exec(text);
  return m ? (m[3] ?? "").length : null;
}

/** A published decimal as an exact integer count of 10^-scale units. */
function units(text: string, scale: number): bigint {
  const m = DECIMAL.exec(text) as RegExpExecArray;
  const frac = (m[3] ?? "").padEnd(scale, "0");
  const v = BigInt(`${m[2]}${frac}`);
  return m[1] ? -v : v;
}

/** The common scale of a set of published values, or a problem naming one that is not a decimal. */
function scaleOf(cells: PublishedCell[]): number | string {
  let scale = 0;
  for (const c of cells) {
    const p = places(c.value);
    if (p === null) return `${c.series} ${c.at} is ${JSON.stringify(c.value)}, not a published decimal`;
    scale = Math.max(scale, p);
  }
  return scale;
}

/** "SMU48124205000000001" -> its metro and supersector; "C1242:own5:1023:agglvl43" -> its metro and industry. */
export function partOf(series: string): { metro: string; part: string } | null {
  const ces = /^SMU\d{2}(\d{5})(\d{2})00000001$/.exec(series);
  if (ces) return { metro: ces[1], part: ces[2] };
  const qcew = /^(C\d{4}):own5:(\d{4}):agglvl43$/.exec(series);
  return qcew ? { metro: qcew[1], part: qcew[2] } : null;
}

/**
 * Whether a series list's parts are exactly the registered ones (MLC: 15, or
 * 10 and 20), or "incomplete" when a registered part has no series at all.
 */
function coversParts(parts: string[], registered: string[]): boolean | "incomplete" {
  const have = new Set(parts);
  if (have.size !== parts.length) return false;
  const want: string[] = [];
  for (const p of registered) {
    if (p !== "MLC") want.push(p);
    else if (have.has("15")) want.push("15");
    else if (have.has("10") && have.has("20")) want.push("10", "20");
    else if (have.has("10") || have.has("20")) return false;
    else return "incomplete";
  }
  if (want.some((p) => !have.has(p))) return "incomplete";
  return want.length === parts.length;
}

/**
 * (X_t1 / X_t0 - 1) x 100, X the sum over the parts of each part's mean over
 * its end's periods, from the published text: exact integer sums, one
 * division. Each series must have a cell at exactly the periods of both ends.
 */
function growthFromCells(cells: PublishedCell[], t0: string[], t1: string[]): { value: number } | string {
  const ends = new Set([...t0, ...t1]);
  const bySeries = new Map<string, Map<string, string>>();
  for (const c of cells) {
    if (!ends.has(c.at)) return `it reads ${c.series} ${c.at}, which is not a period of the window's ends (${[...ends].join(", ")})`;
    const m = bySeries.get(c.series) ?? new Map<string, string>();
    if (m.has(c.at)) return `it reads ${c.series} ${c.at} twice`;
    m.set(c.at, c.value);
    bySeries.set(c.series, m);
  }
  for (const [series, m] of bySeries) {
    if (m.size !== ends.size) return `it reads ${series} at ${m.size} of the ${ends.size} periods of the window's ends`;
  }
  const scale = scaleOf(cells);
  if (typeof scale === "string") return scale;
  const sum = (at: string[]) => [...bySeries.values()].reduce((s, m) => at.reduce((t, a) => t + units(m.get(a) as string, scale), s), BigInt(0));
  const s0 = sum(t0) * BigInt(t1.length);
  const s1 = sum(t1) * BigInt(t0.length);
  if (s0 <= BigInt(0)) return `its ${t0.join(", ")} sum is not positive`;
  return { value: (Number(s1 - s0) / Number(s0)) * 100 };
}

/** Every published cell of the evidence's cells table, by series and "year|period"; conflicting copies are a problem. */
function cellTable(ev: Evidence, problems: string[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const bySeries of Object.values(ev.cells ?? {})) {
    for (const [series, cells] of Object.entries(bySeries)) {
      const m = out.get(series) ?? new Map<string, string>();
      for (const [at, text] of Object.entries(cells)) {
        const value = text.split("|")[0];
        if (m.has(at) && m.get(at) !== value) problems.push(`the cells table has ${series} ${at} as both ${m.get(at)} and ${value}`);
        m.set(at, value);
      }
      out.set(series, m);
    }
  }
  return out;
}

const cellIndex = new WeakMap<Evidence, Map<string, { value: string; footnote: string }>>();

/** A published cell as the evidence's cells table holds it ("year|period" at), its value text and footnote code; null when the table has none. */
export function publishedCell(ev: Evidence, series: string, at: string): { value: string; footnote: string } | null {
  let index = cellIndex.get(ev);
  if (!index) {
    index = new Map();
    for (const bySeries of Object.values(ev.cells ?? {})) {
      for (const [s, cells] of Object.entries(bySeries)) {
        for (const [a, text] of Object.entries(cells)) {
          const [value, footnote = ""] = text.split("|");
          index.set(`${s}|${a}`, { value, footnote });
        }
      }
    }
    cellIndex.set(ev, index);
  }
  return index.get(`${series}|${at}`) ?? null;
}

/** Every series of the cells table that is metro `cbsa`'s CES supersector (or QCEW industry) `part`. */
export function seriesOfPart(ev: Evidence, cbsa: string, part: string): string[] {
  const out = new Set<string>();
  for (const bySeries of Object.values(ev.cells ?? {})) {
    for (const series of Object.keys(bySeries)) {
      const p = partOf(series);
      if (p && p.metro === cbsa && p.part === part) out.add(series);
    }
  }
  return sorted(out);
}

/**
 * The metros of both sets of a specification window that beat the subject on both axes (a strictly larger
 * value on each), recomputed from the sets; null when the window has no two sets or the subject is not a member
 * of both.
 */
export function beatOnBoth(ev: Evidence, prefix: string, subject: string): string[] | null {
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return null;
  const s0 = memberValue(w.sets[0], subject);
  const s1 = memberValue(w.sets[1], subject);
  if (s0 === null || s1 === null) return null;
  return sorted(
    Object.keys(w.sets[0].members).filter((c) => {
      if (c === subject || !Object.hasOwn(w.sets[1].members, c)) return false;
      const a = memberValue(w.sets[0], c);
      const b = memberValue(w.sets[1], c);
      return a !== null && b !== null && a > s0 && b > s1;
    }),
  );
}

/** The "year|Mmm" cells of a run of months as a window label words it ("Sep 2025-Aug 2026"), first to last; null when the words are not that form. */
export function monthsBetween(range: string): string[] | null {
  const m = /^([A-Z][a-z]{2}) (\d{4})-([A-Z][a-z]{2}) (\d{4})$/.exec(range);
  if (!m) return null;
  const month = (name: string): number => {
    const e = MONTHS[name.toLowerCase()];
    return e && e.name.slice(0, 3) === name ? Number(e.iso) : Number.NaN;
  };
  let y = Number(m[2]);
  let mo = month(m[1]);
  const endY = Number(m[4]);
  const endMo = month(m[3]);
  if (!Number.isInteger(mo) || !Number.isInteger(endMo)) return null;
  const out: string[] = [];
  while (y < endY || (y === endY && mo <= endMo)) {
    out.push(`${y}|M${String(mo).padStart(2, "0")}`);
    if (out.length > 120) return null;
    mo += 1;
    if (mo > 12) [y, mo] = [y + 1, 1];
  }
  return out.length ? out : null;
}

/**
 * The cells each end of a window label reads, as a set's periods list them: "2019->2025" the two years' annual
 * cells (M13 for CES, A for a QCEW row), "2019->mean(Sep 2025-Aug 2026)" the start year's annual cell and each
 * month of the run. Null for a label of neither form.
 */
export function windowPeriods(label: string, annual: "M13" | "A"): { t0: Array<[number, string]>; t1: Array<[number, string]> } | null {
  const years = /^(\d{4})->(\d{4})$/.exec(label);
  if (years) return { t0: [[Number(years[1]), annual]], t1: [[Number(years[2]), annual]] };
  const mean = /^(\d{4})->mean\((.+)\)$/.exec(label);
  const months = mean && annual === "M13" ? monthsBetween(mean[2]) : null;
  if (!mean || !months) return null;
  return { t0: [[Number(mean[1]), annual]], t1: months.map((at) => [Number(at.slice(0, 4)), at.slice(5)] as [number, string]) };
}

/**
 * Every comparison set against its key: the row, window and axis it says it is are its key's, its axis is one of
 * its row's two, and the cells each end reads (its periods) are the ones its window label names. Members are
 * recomputed from the cells at those periods (recomputeFromCells), so the window a robustness table prints and
 * the years a registered number states are the years of the cells the numbers read: "2019 to 2031" over 2024
 * cells is a refusal. `annual` gives the annual period code of a row's cells.
 */
export function setPeriodProblems(ev: Evidence, annual: (row: string) => "M13" | "A"): string[] {
  const problems: string[] = [];
  for (const [key, set] of Object.entries(ev.sets)) {
    if (key === "main:universe") continue;
    const m = /^([A-Za-z0-9]+):([^:]+):([a-z_]+)$/.exec(key);
    if (!m) {
      problems.push(`set ${key} is not a row, a window and an axis`);
      continue;
    }
    const [, row, label, axis] = m;
    if (set.row !== row || set.window !== label || set.axis !== axis) problems.push(`set ${key} says it is row ${JSON.stringify(set.row)}, window ${JSON.stringify(set.window ?? null)}, axis ${JSON.stringify(set.axis)}`);
    if (!rowAxes(row).includes(axis)) problems.push(`set ${key}'s axis ${axis} is not one of row ${row}'s (${rowAxes(row).join(", ")})`);
    const want = windowPeriods(label, annual(row));
    if (!want) problems.push(`set ${key}'s window ${JSON.stringify(label)} names no cells`);
    else if (canonicalJson(set.periods ?? null) !== canonicalJson(want)) problems.push(`set ${key} reads ${canonicalJson(set.periods ?? null)}, not the cells its window ${label} names, ${canonicalJson(want)}`);
  }
  return problems;
}

const atsOf = (ends: Array<[number, string]> | undefined): string[] => (ends ?? []).map(([y, p]) => `${y}|${p}`);

/**
 * Every growth, change and cell number of the evidence, every set member's
 * growth and the universe's values, recomputed from the published cells.
 * Returns the problems found.
 */
export function recomputeFromCells(ev: Evidence): string[] {
  const problems: string[] = [];
  const table = cellTable(ev, problems);
  const tuplesOf = (key: string, n: EvidenceNumber): PublishedCell[] | null => {
    const out: PublishedCell[] = [];
    for (const t of n.provenance ?? []) {
      const [series, year, period, value, footnote] = t.split("|");
      const at = `${year}|${period}`;
      // The value and the footnote the arithmetic prints for the cell are the cells table's.
      const cell = publishedCell(ev, series, at);
      if (table.get(series)?.get(at) !== value || cell?.footnote !== footnote) {
        problems.push(`${key} cites ${series} ${at} = ${value}|${footnote}, the cells table has ${JSON.stringify(cell ? `${cell.value}|${cell.footnote}` : null)}`);
        return null;
      }
      out.push({ series, at, value });
    }
    return out;
  };
  /** The two ends of a specification window, from its sets' periods. */
  const endsOf = (prefix: string, axis: string): { t0: string[]; t1: string[] } | null => {
    const set = ev.sets[`${prefix}:${axis}`];
    const t0 = atsOf(set?.periods?.t0);
    const t1 = atsOf(set?.periods?.t1);
    return set && t0.length && t1.length ? { t0, t1 } : null;
  };
  /** A growth from its cells against `value`, its series exactly the metro's registered parts. */
  const checkGrowth = (what: string, row: string, metro: string, axis: string, ends: { t0: string[]; t1: string[] }, cells: PublishedCell[], value: number | null) => {
    let registered: string[];
    try {
      registered = axisParts(row, axis);
    } catch (e) {
      problems.push(`${what}: ${(e as Error).message}`);
      return;
    }
    const parts: string[] = [];
    for (const s of new Set(cells.map((c) => c.series))) {
      const p = partOf(s);
      if (!p || p.metro !== metro) {
        problems.push(`${what} reads ${s}, which is not a series of ${metro}`);
        return;
      }
      parts.push(p.part);
    }
    parts.sort(byteCompare);
    const covered = coversParts(parts, registered);
    if (value === null) {
      if (covered === true) problems.push(`${what} is null, but its cells publish every part (${parts.join(", ")})`);
      return;
    }
    if (covered !== true) {
      problems.push(`${what} reads the parts ${parts.join(", ") || "(none)"}, not the registered ${registered.join(" + ")}`);
      return;
    }
    const g = growthFromCells(cells, ends.t0, ends.t1);
    if (typeof g === "string") problems.push(`${what}: ${g}`);
    else if (!agrees(g.value, value)) problems.push(`${what} is ${value}, its published cells give ${g.value}`);
  };

  for (const [key, n] of Object.entries(ev.numbers)) {
    if (n.kind === "growth") {
      const m = /^([A-Za-z0-9]+):([^.]+)\.([^.]+)\.([a-z_]+)\.growth_pct$/.exec(key);
      const ends = m ? endsOf(`${m[1]}:${m[2]}`, m[4]) : null;
      if (!m || !ends) {
        problems.push(`growth ${key} names no specification window with sets`);
        continue;
      }
      const cells = tuplesOf(key, n);
      if (cells) checkGrowth(key, m[1], m[3], m[4], ends, cells, typeof n.value === "number" ? n.value : null);
    } else if (n.kind === "change") {
      const m = /^([A-Za-z0-9]+):([^.]+)\.(\d{5})\.total_nonfarm\.change$/.exec(key);
      const ends = m ? endsOf(`${m[1]}:${m[2]}`, "office") : null;
      if (!m || !ends) {
        problems.push(`change ${key} names no specification window with sets`);
        continue;
      }
      const cells = tuplesOf(key, n);
      if (!cells) continue;
      const tnf = (at: string) => cells.filter((c) => c.at === at && partOf(c.series)?.metro === m[3] && partOf(c.series)?.part === "00");
      if (ends.t0.length !== 1 || ends.t1.length !== 1 || cells.length !== 2 || tnf(ends.t0[0]).length !== 1 || tnf(ends.t1[0]).length !== 1) {
        problems.push(`${key} does not read ${m[3]}'s total nonfarm cell at each end of the window, once`);
        continue;
      }
      const scale = scaleOf(cells);
      if (typeof scale === "string") {
        problems.push(`${key}: ${scale}`);
        continue;
      }
      const d = Number(units(tnf(ends.t1[0])[0].value, scale) - units(tnf(ends.t0[0])[0].value, scale)) / 10 ** scale;
      if (typeof n.value !== "number" || !agrees(d, n.value)) problems.push(`${key} is ${JSON.stringify(n.value)}, its published cells give ${d}`);
    } else if (n.kind === "cell") {
      const m = /^cell\.(SMU\d{17})\|(\d{4})\|(M\d{2})$/.exec(key);
      if (!m) {
        problems.push(`cell ${key} is not a cell key`);
        continue;
      }
      const cells = tuplesOf(key, n);
      if (cells && (cells.length !== 1 || cells[0].series !== m[1] || cells[0].at !== `${m[2]}|${m[3]}` || n.value !== Number(cells[0].value))) {
        problems.push(`${key} is ${JSON.stringify(n.value)}, not the one published cell it names`);
      }
    }
  }

  for (const [key, set] of Object.entries(ev.sets)) {
    if (key === "main:universe") {
      const at = atsOf(set.periods?.t0);
      for (const [cbsa, member] of Object.entries(set.members)) {
        const mm = member as { series?: string[]; value?: unknown };
        const series = mm.series ?? [];
        const p = series.length === 1 ? partOf(series[0]) : null;
        const cell = p && at.length === 1 ? table.get(series[0])?.get(at[0]) : undefined;
        if (!p || p.metro !== cbsa || p.part !== "00" || cell === undefined || Number(cell) !== mm.value) {
          problems.push(`main:universe gives ${cbsa} ${JSON.stringify(mm.value)}, not its total nonfarm cell at ${at.join(", ")} (${JSON.stringify(cell ?? null)})`);
        }
      }
      continue;
    }
    const m = /^([A-Za-z0-9]+):([^:]+):([a-z_]+)$/.exec(key);
    const ends = m ? endsOf(`${m[1]}:${m[2]}`, m[3]) : null;
    if (!m || !ends) {
      problems.push(`set ${key} has no window ends to recompute its members from`);
      continue;
    }
    for (const [cbsa, member] of Object.entries(set.members)) {
      const mm = member as { series?: string[]; growth_pct?: unknown };
      const cells: PublishedCell[] = [];
      for (const s of mm.series ?? []) {
        for (const at of [...ends.t0, ...ends.t1]) {
          const value = table.get(s)?.get(at);
          if (value !== undefined) cells.push({ series: s, at, value });
        }
      }
      checkGrowth(`${key} member ${cbsa}`, m[1], cbsa, m[3], ends, cells, typeof mm.growth_pct === "number" ? mm.growth_pct : NaN);
    }
  }
  return problems;
}

/**
 * A peers row ranked like the universe (CES total nonfarm at the universe's
 * period), against that ranking as the evidence holds it: the main universe's
 * members by value, each its own published cell (recomputeFromCells). The row
 * covers `largestN` metros; when that is no more than the universe, exactly
 * its largest, with no tie at the cutoff; when it is more, the whole universe
 * and the universe's first metro out.
 */
export function recomputePeers(ev: Evidence, prefix: string, largestN: number): string[] {
  const w = windowSets(ev, prefix);
  if (typeof w === "string") return [w];
  const covered = sorted(new Set([...Object.keys(w.sets[0].members), ...Object.keys(w.sets[0].excluded ?? {})]));
  if (covered.length !== largestN) return [`${prefix}: its sets cover ${covered.length} metros, but it registers the ${largestN} largest`];
  const u = ev.sets["main:universe"];
  if (!u) return [`${prefix}: the evidence has no main:universe ranking to check it against`];
  const ranked = Object.entries(u.members)
    .map(([c, m]) => [c, (m as { value?: unknown }).value] as const)
    .filter((e): e is readonly [string, number] => finiteNumber(e[1]))
    .sort((a, b) => b[1] - a[1] || byteCompare(a[0], b[0]));
  const n = ranked.length;
  const has = new Set(covered);
  if (largestN <= n) {
    if (largestN < n && !(ranked[largestN - 1][1] > ranked[largestN][1])) {
      return [`${prefix}: the ranking ties at its cutoff (${ranked[largestN - 1][0]} and ${ranked[largestN][0]} at ${ranked[largestN][1]}), so its ${largestN} largest are not one set`];
    }
    const want = new Set(ranked.slice(0, largestN).map(([c]) => c));
    const out = [...want].filter((c) => !has.has(c)).sort(byteCompare);
    const extra = covered.filter((c) => !want.has(c));
    if (out.length || extra.length) {
      const said = [out.length ? `${out.join(", ")} left out` : "", extra.length ? `${extra.join(", ")} not among them` : ""].filter(Boolean).join("; ");
      return [`${prefix}: its metros are not the ${largestN} largest by the universe's ranking: ${said}`];
    }
    return [];
  }
  const out = ranked.map(([c]) => c).filter((c) => !has.has(c));
  if (out.length) return [`${prefix}: it registers the ${largestN} largest but leaves out ${out.join(", ")}, of the universe's ${n} largest`];
  const first = u.cutoff?.[`rank_${n + 1}`]?.cbsa;
  if (!first || !has.has(first)) return [`${prefix}: it registers the ${largestN} largest but leaves out the universe's first metro out, rank_${n + 1} (${first ?? "none named"})`];
  return [];
}
