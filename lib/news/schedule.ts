// The broadcast clock: a 30-minute wheel of segments at fixed offsets from
// the top and the bottom of the UTC hour. The playhead is a function of UTC
// time alone, so every viewer sees the same segment at the same moment, with
// no server state and no session.
//
// A news segment whose feeds have nothing in force keeps its slot (moving the
// others would put two viewers whose caches differ on different segments) and
// plays a short card that says why: "nothing to report" when its feeds
// answered with nothing, "standing by" when they did not answer.
//
// Pure: callers pass `now`.

import type { Fact, FactKind } from "./facts";
import type { PersonaId } from "./personas";

export const WHEEL_S = 1800;

export type SegmentId = "top" | "planet-watch" | "bumper-1" | "liftoff" | "money-desk" | "bumper-2" | "the-wire" | "sign-off";

export const SEGMENT_IDS = ["top", "planet-watch", "bumper-1", "liftoff", "money-desk", "bumper-2", "the-wire", "sign-off"] as const satisfies readonly SegmentId[];

export interface WheelSegment {
  id: SegmentId;
  title: string;
  kind: "news" | "bumper";
  /** Seconds after the top or bottom of the hour (UTC). */
  startS: number;
  durS: number;
  anchor: PersonaId;
  /** Fact kinds the segment reports. Empty for bumpers. */
  factKinds: FactKind[];
  blurb: string;
}

export const WHEEL: WheelSegment[] = [
  { id: "top", title: "Top of the Half Hour", kind: "news", startS: 0, durS: 240, anchor: "plume", factKinds: ["alert-count", "quake", "wildfire", "launch", "wire"], blurb: "The lead items from every desk." },
  { id: "planet-watch", title: "Planet Watch", kind: "news", startS: 240, durS: 360, anchor: "brack", factKinds: ["quake", "alert-count", "alert", "wildfire", "weather"], blurb: "Earthquakes, severe weather warnings and wildfires, from the agencies that publish them." },
  { id: "bumper-1", title: "At the Desk", kind: "bumper", startS: 600, durS: 60, anchor: "plume", factKinds: [], blurb: "The anchors, between segments." },
  { id: "liftoff", title: "Liftoff", kind: "news", startS: 660, durS: 300, anchor: "ledgerly", factKinds: ["launch", "kp", "flare"], blurb: "Launches in the next two days and space weather." },
  { id: "money-desk", title: "Money Desk", kind: "news", startS: 960, durS: 300, anchor: "ledgerly", factKinds: ["indicator", "release"], blurb: "Latest published economic series and the week's release calendar." },
  { id: "bumper-2", title: "At the Desk", kind: "bumper", startS: 1260, durS: 60, anchor: "brack", factKinds: [], blurb: "The anchors, between segments." },
  { id: "the-wire", title: "The Wire", kind: "news", startS: 1320, durS: 420, anchor: "plume", factKinds: ["wire"], blurb: "Headlines from public broadcasters' and wires' own feeds, each credited to its outlet." },
  { id: "sign-off", title: "Sign-off", kind: "bumper", startS: 1740, durS: 60, anchor: "plume", factKinds: [], blurb: "Who we are and where the facts came from." },
];

/** Which feeds stand behind each fact kind (source ids in lib/provenance/sources.ts), to tell "nothing to report" from "did not answer". */
export const KIND_SOURCES: Record<FactKind, string[]> = {
  quake: ["usgs-earthquakes"],
  alert: ["nws-api"],
  "alert-count": ["nws-api"],
  wildfire: ["nifc-wfigs"],
  launch: ["launch-library-2"],
  kp: ["gfz-kp"],
  flare: ["nasa-donki"],
  indicator: ["fred"],
  release: [],
  weather: ["open-meteo"],
  wire: ["wire-npr", "wire-bbc", "wire-dw", "wire-abc-au", "wire-aljazeera", "wire-france24", "wire-un-news"],
};

export interface Playhead {
  segment: WheelSegment;
  index: number;
  /** Seconds into the segment. */
  offsetS: number;
  remainingS: number;
  /** When this turn of the wheel began (the last :00 or :30 UTC). */
  wheelStartedAt: string;
  segmentStartedAt: string;
  next: WheelSegment;
  nextStartsAt: string;
}

/** Where the wheel is at `nowMs`, from UTC time alone. */
export function playhead(nowMs: number): Playhead {
  const nowS = Math.floor(nowMs / 1000);
  const into = ((nowS % WHEEL_S) + WHEEL_S) % WHEEL_S;
  const wheelStartS = nowS - into;
  let index = WHEEL.findIndex((s) => into >= s.startS && into < s.startS + s.durS);
  if (index < 0) index = WHEEL.length - 1;
  const segment = WHEEL[index];
  const next = WHEEL[(index + 1) % WHEEL.length];
  const nextStartS = index + 1 < WHEEL.length ? wheelStartS + next.startS : wheelStartS + WHEEL_S;
  return {
    segment,
    index,
    offsetS: into - segment.startS,
    remainingS: segment.startS + segment.durS - into,
    wheelStartedAt: new Date(wheelStartS * 1000).toISOString(),
    segmentStartedAt: new Date((wheelStartS + segment.startS) * 1000).toISOString(),
    next,
    nextStartsAt: new Date(nextStartS * 1000).toISOString(),
  };
}

export type SlotStatus = "on" | "empty" | "standing-by";

export interface Slot {
  segment: WheelSegment;
  startsAt: string;
  endsAt: string;
  status: SlotStatus;
  /** How many facts the segment has to work with. */
  facts: number;
  /** What the card says when the segment does not play. */
  note?: string;
}

/**
 * A segment's status: on (it has facts), empty (its feeds answered with
 * nothing in force), or standing-by (it has no facts and at least one of its
 * feeds did not answer, so "nothing" is not known). Bumpers are always on.
 */
export function slotStatus(seg: WheelSegment, facts: Fact[], failedSources: ReadonlySet<string>): { status: SlotStatus; facts: number; note?: string } {
  if (seg.kind === "bumper") return { status: "on", facts: 0 };
  const n = facts.filter((f) => seg.factKinds.includes(f.kind)).length;
  if (n > 0) return { status: "on", facts: n };
  const down = [...new Set(seg.factKinds.flatMap((k) => KIND_SOURCES[k]))].filter((s) => failedSources.has(s));
  if (down.length) return { status: "standing-by", facts: 0, note: `${seg.title} is standing by: ${down.join(", ")} did not answer, so its items are missing, not absent.` };
  return { status: "empty", facts: 0, note: `${seg.title} has nothing to report this half hour: its feeds answered with nothing in force.` };
}

export interface Schedule {
  wheelS: number;
  /** The server's clock when this was computed. A client computes its own playhead from WHEEL and UTC. */
  serverNow: string;
  playhead: Playhead;
  /** This turn of the wheel, in order, with each slot's wall-clock times. */
  slots: Slot[];
  /** News segments that will not play this turn, and why. */
  skipped: Array<{ id: SegmentId; title: string; status: Exclude<SlotStatus, "on">; note: string }>;
}

export function scheduleFor(nowMs: number, facts: Fact[], failedSources: Iterable<string>): Schedule {
  const ph = playhead(nowMs);
  const failed = new Set(failedSources);
  const start = Date.parse(ph.wheelStartedAt);
  const slots: Slot[] = WHEEL.map((seg) => ({
    segment: seg,
    startsAt: new Date(start + seg.startS * 1000).toISOString(),
    endsAt: new Date(start + (seg.startS + seg.durS) * 1000).toISOString(),
    ...slotStatus(seg, facts, failed),
  }));
  return {
    wheelS: WHEEL_S,
    serverNow: new Date(nowMs).toISOString(),
    playhead: ph,
    slots,
    skipped: slots.filter((s) => s.status !== "on").map((s) => ({ id: s.segment.id, title: s.segment.title, status: s.status as Exclude<SlotStatus, "on">, note: s.note! })),
  };
}
