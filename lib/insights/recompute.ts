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
// of that metro's office and goods-and-logistics growth, and a row is in
// both sets exactly when it is plotted.
//
// Pure, over the evidence alone. Each function returns the problems it found
// (empty when everything agrees); the build refuses on any.

import { byteCompare, canonicalJson } from "./render/spec";
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
