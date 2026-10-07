// The news studio, as a pure view: everything it shows comes in as props,
// so it renders the same on the server (before the clock is known), in tests
// and in the browser. components/news/Studio.tsx feeds it the clock and the
// data. Layout is fixed-size where things change (clock, captions, lower
// third, source card), so nothing moves when a line or a fetch lands.

import Link from "next/link";
import { memo } from "react";
import { blinkClosed, gazeFor, SEATS, visemeAt, type Viseme } from "@/lib/news/anchorMotion";
import { insetView } from "@/lib/news/mapInset";
import { NETWORK_NAME } from "@/lib/news/network";
import { DISCLOSURE, PERSONAS, type PersonaId } from "@/lib/news/personas";
import { countdown, upNext, utcHm, utcHms, type OnAir } from "@/lib/news/playback";
import type { RundownSegment } from "@/lib/news/rundown";
import { WHEEL } from "@/lib/news/schedule";
import { factRows, KIND_LABEL, sourceCard, utcStamp } from "@/lib/news/sourceCard";
import { FIGURES } from "./Anchors";
import { MapInset } from "./MapInset";
import type { Fact, RundownData, ScheduleData, WireData } from "./types";

export interface StudioViewProps {
  /** The studio's clock (ms), or null before the page has mounted. */
  nowMs: number | null;
  air: OnAir | null;
  rundown: RundownData | null;
  wire: WireData | null;
  schedule: ScheduleData | null;
  /** Idle motion, blinks, lip movement, the ticker's scroll and the map's zoom. False for reduced motion. */
  animate: boolean;
  /** Why a fetch failed, shown where its data would be. */
  errors?: { rundown?: string; wire?: string };
}

/** How long the last line stays up after the segment's lines are done, before the card shows what is next. */
const CAPTION_LINGER_MS = 4000;

// ---------------------------------------------------------------- top of the page

export function DisclosureBanner() {
  return (
    <aside role="note" aria-label="Disclosure" className="border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-[12px] leading-snug text-[var(--bright)]">
      <strong className="mr-1 font-semibold uppercase tracking-wider text-[var(--warn)]">Disclosure.</strong>
      {DISCLOSURE.fictional} {DISCLOSURE.scripts} {DISCLOSURE.check}
    </aside>
  );
}

export function TopBar({ nowMs }: { nowMs: number | null }) {
  return (
    <header className="flex items-center gap-3">
      <Link href="/" prefetch={false} className="text-[11px] text-muted-foreground underline-offset-4 hover:text-[var(--bright)] hover:underline">
        ← Atlas
      </Link>
      <h1 className="news-network-bug m-0 font-display text-[15px] font-black tracking-[0.18em] text-[var(--bright)]">{NETWORK_NAME}</h1>
      <span className="news-live-bug inline-flex items-center gap-1.5 bg-[#c8102e] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.2em] text-white">
        <span className="news-live-dot size-1.5 rounded-full bg-white" aria-hidden="true" />
        LIVE
      </span>
      <p className="m-0 ml-auto font-mono text-[13px] tabular-nums text-[var(--bright)]">
        <time dateTime={nowMs == null ? undefined : new Date(nowMs).toISOString()} aria-label="Studio clock, UTC">
          {nowMs == null ? "--:--:--" : utcHms(nowMs)}
        </time>{" "}
        <span className="text-[10px] text-muted-foreground">UTC</span>
      </p>
    </header>
  );
}

// ---------------------------------------------------------------- the stage

function anchorPose(id: PersonaId, air: OnAir | null, nowMs: number | null, animate: boolean): { viseme: Viseme; blink: boolean; gaze: -1 | 0 | 1; speaking: boolean } {
  const cue = air?.at?.speaking ?? null;
  const speaking = !!cue && cue.anchor === id;
  let viseme: Viseme = "rest";
  if (speaking) viseme = animate ? visemeAt(cue!.text, air!.at!.progress) : "etc";
  return {
    viseme,
    blink: animate && nowMs != null && blinkClosed(id, nowMs),
    gaze: gazeFor(id, air?.speaker ?? null),
    speaking,
  };
}

/** Seat centres in the stage's 960 x 540 drawing. */
const SEAT_X: Record<PersonaId, number> = { brack: 230, plume: 480, ledgerly: 730 };

export function Stage({ air, nowMs, animate, children }: { air: OnAir | null; nowMs: number | null; animate: boolean; children?: React.ReactNode }) {
  const speaker = air?.speaker ?? null;
  const p = speaker ? PERSONAS[speaker] : null;
  const segTitle = air?.segment.title ?? "";
  return (
    <div className="news-stage relative aspect-video w-full overflow-hidden border border-[var(--hairline)] bg-[#070b11]">
      <svg viewBox="0 0 960 540" className="absolute inset-0 size-full" role="img" aria-label={`The studio: ${SEATS.map((id) => PERSONAS[id].name).join(", ")} at the desk${p ? `; ${p.name} has the floor` : ""}.`}>
        <defs>
          <linearGradient id="news-wall" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0d1a26" />
            <stop offset="1" stopColor="#060a10" />
          </linearGradient>
          <radialGradient id="news-spot" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#b4dcf2" stopOpacity="0.22" />
            <stop offset="1" stopColor="#b4dcf2" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="news-desk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3f6b4a" />
            <stop offset="1" stopColor="#1d3424" />
          </linearGradient>
        </defs>
        <rect width="960" height="540" fill="url(#news-wall)" />
        {/* a lattice of meridians and parallels behind the desk */}
        <g stroke="#b4dcf2" strokeOpacity="0.07" fill="none">
          {Array.from({ length: 13 }, (_, i) => (
            <path key={`m${i}`} d={`M${i * 80} 0 Q${i * 80 + (i - 6) * 14} 200 ${i * 80} 400`} />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <path key={`p${i}`} d={`M0 ${40 + i * 64} L960 ${40 + i * 64}`} />
          ))}
        </g>
        {SEATS.map((id) => {
          const pose = anchorPose(id, air, nowMs, animate);
          const Figure = FIGURES[id];
          return (
            <g key={id} transform={`translate(${SEAT_X[id] - 150} 150) scale(1.5)`} data-anchor={id} data-speaking={pose.speaking ? "true" : "false"}>
              {speaker === id && <ellipse cx="100" cy="130" rx="110" ry="120" fill="url(#news-spot)" />}
              <Figure {...pose} animate={animate} />
            </g>
          );
        })}
        {/* the desk */}
        <path d="M40 430 L920 430 L960 540 L0 540Z" fill="url(#news-desk)" />
        <rect x="40" y="424" width="880" height="10" rx="3" fill="#5c8a66" />
        <g fill="none" stroke="#2a4a33" strokeWidth="2" opacity="0.8">
          <path d="M120 470 Q140 440 132 430 M150 480 Q160 446 168 432 M808 476 Q820 444 812 430 M840 482 Q852 450 846 432" />
        </g>
      </svg>

      {children}

      {/* lower third: who has the floor and what segment this is */}
      <div className="absolute bottom-[6%] left-[3%] max-w-[70%]" aria-hidden={p ? undefined : "true"}>
        <div className="news-lower-third flex h-[clamp(34px,9vw,54px)] flex-col justify-center border-l-4 border-[var(--signal)] bg-[rgba(4,8,13,0.9)] px-2.5">
          <p className="m-0 truncate font-display text-[clamp(11px,2.2vw,17px)] font-bold leading-tight text-[var(--bright)]">{p?.name ?? " "}</p>
          <p className="m-0 truncate text-[clamp(9px,1.6vw,12px)] leading-tight text-[var(--primary)]">
            {p ? `${p.roleTitle} · ${segTitle}` : " "}
          </p>
        </div>
      </div>
      <p className="absolute bottom-[6%] right-[3%] m-0 bg-[rgba(4,8,13,0.75)] px-1.5 py-0.5 font-display text-[clamp(8px,1.4vw,11px)] font-black tracking-[0.2em] text-white/85" aria-hidden="true">
        {NETWORK_NAME}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- captions

/** What the caption box says right now. */
export function captionFor(air: OnAir | null, schedule: ScheduleData | null, errors?: StudioViewProps["errors"]): { who: string | null; text: string; recap: boolean } {
  if (!air) return { who: null, text: "Tuning in…", recap: false };
  if (air.status === "no-rundown") return { who: null, text: errors?.rundown ? `The rundown did not load (${errors.rundown}). Trying again…` : "Tuning in: fetching this half hour's rundown…", recap: false };
  if (air.status === "rundown-expired") return { who: null, text: "The desk is picking up the next rundown…", recap: false };
  if (air.status === "segment-missing") {
    const slot = schedule?.slots.find((s) => s.segment.id === air.segment.id);
    return { who: null, text: slot?.note ?? `${air.segment.title} is standing by.`, recap: false };
  }
  const at = air.at!;
  const c = at.caption;
  if (at.phase === "hold" && c && air.offsetMs - c.endMs > CAPTION_LINGER_MS) {
    const n = upNext(air.nowMs, 1)[0];
    return { who: null, text: `Up next at ${utcHm(n.startsAtMs)} UTC: ${n.segment.title} with ${PERSONAS[n.segment.anchor].shortName}.`, recap: false };
  }
  if (!c) return { who: null, text: `${air.segment.title}, with ${PERSONAS[air.segment.anchor].shortName}.`, recap: false };
  return { who: PERSONAS[c.anchor].shortName, text: c.text, recap: c.recap };
}

export function Captions({ caption }: { caption: { who: string | null; text: string; recap: boolean } }) {
  // Only the whole line goes into the live region, once per line; the mouth's letter-by-letter motion never does.
  return (
    <section aria-label="Captions" className="news-captions h-[10.5rem] overflow-y-auto border border-[var(--hairline)] bg-[rgba(4,8,13,0.92)] px-3 py-2 sm:h-[7.25rem]">
      <p aria-live="polite" aria-atomic="true" className="m-0 text-[15px] leading-[1.4] text-[var(--bright)] sm:text-[16px]">
        {caption.recap && <span className="mr-2 bg-white/10 px-1 text-[10px] font-bold tracking-widest text-[var(--warn)]">RECAP</span>}
        {caption.who && <span className="mr-1 font-bold uppercase tracking-wide text-[var(--signal)]">{caption.who}:</span>}
        {caption.text}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- ticker

export const Ticker = memo(function Ticker({ wire, animate, error }: { wire: WireData | null; animate: boolean; error?: string }) {
  const items = wire?.items ?? [];
  const down = wire?.outlets.filter((o) => !o.ok) ?? [];
  const item = (w: WireData["items"][number], linked: boolean) => (
    <li key={w.id} className="inline-flex shrink-0 items-baseline gap-1.5 pr-8">
      <span className="font-bold uppercase tracking-wide text-[var(--signal)]">{w.outlet}:</span>
      {linked ? (
        <a href={w.link} target="_blank" rel="noopener noreferrer" className="text-[var(--bright)] underline-offset-4 hover:underline focus-visible:underline">
          {w.title}
        </a>
      ) : (
        <span className="text-[var(--bright)]">{w.title}</span>
      )}
    </li>
  );
  return (
    <section aria-labelledby="news-wire-label" className="news-ticker flex h-9 items-stretch border border-[var(--hairline)] bg-[rgba(4,8,13,0.92)] text-[12px]">
      <h2 id="news-wire-label" className="m-0 flex shrink-0 items-center bg-[var(--signal)] px-2 text-[10px] font-black tracking-[0.2em] text-[var(--signal-foreground)]">
        WIRE<span className="sr-only">: headlines as each outlet published them, credited and linked</span>
      </h2>
      <div className="news-ticker-window relative flex min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden">
        {items.length ? (
          <div className={`news-ticker-track flex w-max items-center pl-3 ${animate ? "news-ticker-run" : ""}`} style={animate ? ({ "--ticker-s": `${Math.max(60, items.length * 9)}s` } as React.CSSProperties) : undefined}>
            <ul className="m-0 flex list-none items-center p-0">{items.map((w) => item(w, true))}</ul>
            {/* The second copy makes the loop seamless; screen readers and the keyboard skip it. */}
            {animate && (
              <ul className="m-0 flex list-none items-center p-0" aria-hidden="true">
                {items.map((w) => item({ ...w, id: `${w.id}:2` }, false))}
              </ul>
            )}
          </div>
        ) : (
          <p className="m-0 px-3 text-muted-foreground">{error ? `The wire did not load (${error}).` : wire ? "No headlines in the last 24 hours." : "Loading the wire…"}</p>
        )}
      </div>
      {down.length > 0 && <p className="sr-only">{down.map((o) => o.outlet).join(", ")} did not answer; their headlines are missing.</p>}
    </section>
  );
});

// ---------------------------------------------------------------- up next and the schedule

export function UpNextRail({ nowMs }: { nowMs: number | null }) {
  const rows = nowMs == null ? WHEEL.slice(1, 4).map((segment) => ({ segment, startsAtMs: null as number | null })) : upNext(nowMs, 3);
  return (
    <section aria-labelledby="news-upnext" className="border border-[var(--hairline)] bg-[var(--glass)] p-3">
      <h2 id="news-upnext" className="hud-label m-0 mb-2">Up next</h2>
      <ol className="m-0 list-none space-y-2 p-0">
        {rows.map((r) => (
          <li key={r.segment.id} className="flex items-baseline gap-2 text-[12px]">
            <span className="w-11 shrink-0 font-mono tabular-nums text-[var(--bright)]">{r.startsAtMs == null ? "--:--" : utcHm(r.startsAtMs)}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--bright)]">{r.segment.title}</span>
            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{r.startsAtMs == null || nowMs == null ? "" : `in ${countdown(r.startsAtMs - nowMs)}`}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2 text-[10px] text-muted-foreground">Times in UTC. The wheel repeats every half hour.</p>
    </section>
  );
}

function offsetLabel(startS: number): string {
  const m = Math.floor(startS / 60);
  return `:${String(m).padStart(2, "0")}`;
}

export const ScheduleSheet = memo(function ScheduleSheet({ currentId, turnStartMs, schedule }: { currentId: string | null; turnStartMs: number | null; schedule: ScheduleData | null }) {
  const status = new Map(schedule?.slots.map((s) => [s.segment.id, s]) ?? []);
  return (
    <section aria-labelledby="news-schedule" className="border border-[var(--hairline)] bg-[var(--glass)] p-3">
      <h2 id="news-schedule" className="hud-label m-0 mb-2">Schedule</h2>
      <p className="m-0 mb-2 text-[11px] text-muted-foreground">Every half hour, starting on the hour and the half hour (UTC).</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="py-1 pr-2 font-normal">Starts</th>
              <th scope="col" className="py-1 pr-2 font-normal">Segment</th>
              <th scope="col" className="py-1 pr-2 font-normal">With</th>
              <th scope="col" className="hidden py-1 font-normal sm:table-cell">What</th>
            </tr>
          </thead>
          <tbody>
            {WHEEL.map((s) => {
              const on = s.id === currentId;
              const st = status.get(s.id);
              return (
                <tr key={s.id} aria-current={on ? "true" : undefined} className={`border-t border-[var(--hairline)] align-top ${on ? "bg-[var(--signal)]/10" : ""}`}>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-[var(--bright)]">
                    {turnStartMs == null ? offsetLabel(s.startS) : utcHm(turnStartMs + s.startS * 1000)}
                  </td>
                  <td className="py-1.5 pr-2 text-[var(--bright)]">
                    {s.title}
                    {on && <span className="ml-1.5 text-[9px] font-bold tracking-widest text-[var(--signal)]">ON AIR</span>}
                    {st && st.status !== "on" && <span className="block text-[10px] text-[var(--warn)]">{st.status === "empty" ? "nothing to report" : "standing by"}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{s.kind === "bumper" ? "the desk" : PERSONAS[s.anchor].shortName}</td>
                  <td className="hidden py-1.5 text-muted-foreground sm:table-cell">{s.blurb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});

// ---------------------------------------------------------------- source card

function FactItem({ fact, lines, onAir }: { fact: Fact; lines: number[]; onAir: boolean }) {
  const p = fact.provenance;
  return (
    <li data-fact-id={fact.id} className={`border-t border-[var(--hairline)] py-2 ${onAir ? "border-l-2 border-l-[var(--signal)] pl-2" : ""}`}>
      <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">
        {KIND_LABEL[fact.kind]}
        {onAir && <span className="ml-2 text-[9px] tracking-widest text-[var(--signal)]">ON AIR NOW</span>}
      </p>
      <dl className="m-0 mt-1 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        {fact.place && (
          <>
            <dt className="text-muted-foreground">place</dt>
            <dd className="m-0 break-words text-[var(--bright)]">{fact.place.name}</dd>
          </>
        )}
        {fact.time && (
          <>
            <dt className="text-muted-foreground">time</dt>
            <dd className="m-0 text-[var(--bright)]">{utcStamp(fact.time)}</dd>
          </>
        )}
        {factRows(fact).map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="m-0 break-words text-[var(--bright)]">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground">
        Source:{" "}
        <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
          {p.source.name}
        </a>{" "}
        ({p.source.publisher}; {p.source.license}), {p.kind === "snapshot" ? "observed" : p.kind === "estimate" ? "estimated" : "published"}, retrieved {utcStamp(p.retrievedAt)}.
        {p.method && <> Method: {p.method}.</>}
        {fact.link && (
          <>
            {" "}
            <a href={fact.link} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              Original item
            </a>
            .
          </>
        )}
        {p.upstreamUrl && (
          <>
            {" "}
            <a href={p.upstreamUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
              Feed as read
            </a>
            .
          </>
        )}
        {lines.length > 0 && <> Stated in line{lines.length > 1 ? "s" : ""} {lines.join(", ")}.</>}
      </p>
    </li>
  );
}

export function SourcesCard({ segment, segmentTitle, rundown, currentFactIds }: { segment: RundownSegment | null; segmentTitle: string; rundown: RundownData | null; currentFactIds: string[] }) {
  const card = segment && rundown ? sourceCard(segment, rundown.facts) : null;
  return (
    <section aria-labelledby="news-sources" className="news-sources flex h-full min-h-0 flex-col border border-[var(--hairline)] bg-[var(--glass)] p-3">
      <h2 id="news-sources" className="hud-label m-0">Sources · {segmentTitle || "this segment"}</h2>
      <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground">
        Every fact the anchors state in this segment, as its publisher sent it. {rundown ? rundown.disclosure.writer : DISCLOSURE.scripts}
      </p>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto" tabIndex={0} aria-label="Facts behind this segment">
        {!rundown ? (
          <p className="m-0 py-2 text-[12px] text-muted-foreground">Loading the facts…</p>
        ) : !card || (!card.facts.length && !card.missing.length) ? (
          <p className="m-0 py-2 text-[12px] text-muted-foreground">No facts in this segment: the anchors are only talking among themselves.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {card.facts.map((c) => (
              <FactItem key={c.fact.id} fact={c.fact} lines={c.lines} onAir={currentFactIds.includes(c.fact.id)} />
            ))}
            {card.missing.map((id) => (
              <li key={id} className="border-t border-[var(--hairline)] py-2 text-[12px] text-[var(--warn)]">
                Fact {id} is cited but was not in this page&apos;s copy of the facts.
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the page

export function StudioView({ nowMs, air, rundown, wire, schedule, animate, errors }: StudioViewProps) {
  const seg = air?.rundownSegment ?? null;
  const current = air?.at?.caption?.factIds ?? [];
  const byId = new Map((rundown?.facts ?? []).map((f) => [f.id, f]));
  // The map looks at the line on air's place, else the segment's.
  const placed = [...current, ...(seg?.facts ?? [])].map((id) => byId.get(id)).filter((f): f is Fact => !!f);
  const view = insetView(placed);
  const caption = captionFor(air, schedule, errors);
  const turnStart = air ? Date.parse(air.playhead.wheelStartedAt) : null;
  return (
    <div className="news-studio mx-auto flex w-full max-w-[84rem] flex-col gap-3 px-3 py-3 sm:px-4">
      <TopBar nowMs={nowMs} />
      <DisclosureBanner />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Stage air={air} nowMs={nowMs} animate={animate}>
            <div className="absolute right-[2.5%] top-[4%] w-[34%] max-w-[17rem]">
              <MapInset view={view} animate={animate} />
            </div>
          </Stage>
          <Captions caption={caption} />
          <Ticker wire={wire} animate={animate} error={errors?.wire} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <UpNextRail nowMs={nowMs} />
          {/* On wide screens the card fills the rail beside the stage and scrolls inside it, so it never sets the row's height. */}
          <div className="relative h-[26rem] lg:h-auto lg:min-h-[16rem] lg:flex-1">
            <div className="h-full lg:absolute lg:inset-0">
              <SourcesCard segment={seg} segmentTitle={air?.segment.title ?? ""} rundown={rundown} currentFactIds={current} />
            </div>
          </div>
        </div>
      </div>
      <ScheduleSheet currentId={air?.segment.id ?? null} turnStartMs={turnStart} schedule={schedule} />
      <footer className="pb-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="m-0">
          {NETWORK_NAME} reads the Embedding Atlas&apos;s live feeds (USGS, NOAA National Weather Service, NIFC, Launch Library 2, GFZ, NASA DONKI, FRED, Open-Meteo) and the public RSS headlines of the outlets on the wire, each credited. Headlines are read as published and link to the outlet&apos;s own story; nothing is summarised.
        </p>
        <p className="m-0 mt-1">
          {DISCLOSURE.fictional} Not a warning service: follow official channels and local authorities in an emergency. Facts and their sources: <a className="text-primary underline underline-offset-4" href="/api/news?op=facts">/api/news?op=facts</a>.
        </p>
      </footer>
    </div>
  );
}
