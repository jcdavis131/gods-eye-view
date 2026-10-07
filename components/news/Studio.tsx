"use client";
// The live studio: runs the clock, fetches the rundown, the wire and the
// schedule, and hands StudioView what is on air at this moment.
//
// Nothing is carried from one tick to the next but the fetched data: every
// tick asks lib/news/playback.ts what is on air at the current time, so a tab
// that slept picks up on the right line as soon as it wakes. The clock is
// the device's, corrected only when the server's differs by more than
// lib/news/playback.ts's OFFSET_IGNORE_MS.
//
// Console API for inspection: window.atlas.news.{now(), state(), shift(ms),
// offset()}. shift() moves this tab's studio clock (for screenshots of other
// segments); it never touches another viewer's.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { chooseOffset, needsRundown, onAir, rundownUrl, type ClockSample } from "@/lib/news/playback";
import { playhead } from "@/lib/news/schedule";
import { StudioView } from "./StudioView";
import type { RundownData, ScheduleData, WireData } from "./types";

/** Ticks per second while motion is on (mouth shapes step about every 70 ms); captions alone need far fewer. */
const FRAME_MS = 80;
const REDUCED_FRAME_MS = 250;
const WIRE_REFRESH_MS = 5 * 60_000;
const RUNDOWN_CHECK_MS = 2000;
const RETRY_MS = [5000, 15_000, 30_000, 60_000];
/**
 * Wait this long after :00 and :30 before asking for the new turn's rundown.
 * A clock a little ahead of the server's would otherwise ask before the
 * server has turned, and the last turn's answer would sit in the edge cache
 * under the new turn's key for a minute. Longer than OFFSET_IGNORE_MS.
 */
const TURN_GRACE_MS = 3000;

let offsetMs = 0;
let shiftMs = 0;
function studioNow(): number {
  return Date.now() + offsetMs + shiftMs;
}

interface Envelope<T> {
  data: T;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ data: T; res: Response; sentMs: number; receivedMs: number }> {
  const sentMs = Date.now();
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  const receivedMs = Date.now();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as Envelope<T>;
  return { data: body.data, res, sentMs, receivedMs };
}

/** A clock sample from a schedule answer; null when a cache served it and did not say how long it held it. */
function sampleFrom(serverNow: string, res: Response, sentMs: number, receivedMs: number): ClockSample | null {
  const age = res.headers.get("age");
  const cache = (res.headers.get("x-vercel-cache") ?? "").toUpperCase();
  if (age == null && (cache === "HIT" || cache === "STALE" || cache === "PRERENDER")) return null;
  const serverMs = Date.parse(serverNow);
  if (!Number.isFinite(serverMs)) return null;
  return { sentMs, receivedMs, serverMs, ageS: age == null ? 0 : Number(age) || 0 };
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Reduced motion as the browser reports it; false on the server (the first paint has no motion running yet anyway). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/** The studio clock: null on the server and before mount, then ticking; re-reads the time at once when the tab wakes. */
function useStudioClock(frameMs: number): [number | null, () => void] {
  const [now, setNow] = useState<number | null>(null);
  const tick = useCallback(() => setNow(studioNow()), []);
  useEffect(() => {
    // The first reading comes on the next task, not during the effect, so the server's placeholder paints first.
    const first = setTimeout(tick, 0);
    let raf = 0;
    let last = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const frame = (t: number) => {
      if (t - last >= frameMs) {
        last = t;
        tick();
      }
      raf = requestAnimationFrame(frame);
    };
    // Animation frames while visible (they stop on their own in a background tab); a slow timer otherwise keeps captions moving.
    if (frameMs < REDUCED_FRAME_MS && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
    else timer = setInterval(tick, frameMs);
    const wake = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearTimeout(first);
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    };
  }, [frameMs, tick]);
  return [now, tick];
}

export default function Studio() {
  const reduced = usePrefersReducedMotion();
  const [nowMs, tick] = useStudioClock(reduced ? REDUCED_FRAME_MS : FRAME_MS);
  const [rundown, setRundown] = useState<{ data: RundownData; turn: string } | null>(null);
  const [wire, setWire] = useState<WireData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [errors, setErrors] = useState<{ rundown?: string; wire?: string }>({});

  // ---- rundown: on mount, at each turn of the wheel, when it expires, and when the tab wakes
  const inflight = useRef(false);
  const failures = useRef(0);
  const retryAt = useRef(0);
  const current = useRef(rundown);
  useEffect(() => {
    current.current = rundown;
  }, [rundown]);
  const loadRundown = useCallback(async () => {
    const now = studioNow();
    if (inflight.current || now < retryAt.current) return;
    if (!needsRundown(current.current?.data.rundown, current.current?.turn ?? null, now)) return;
    const turn = playhead(now).wheelStartedAt;
    if (now - Date.parse(turn) < TURN_GRACE_MS) {
      retryAt.current = Date.parse(turn) + TURN_GRACE_MS;
      return;
    }
    inflight.current = true;
    try {
      const { data } = await getJson<RundownData>(rundownUrl(now));
      failures.current = 0;
      retryAt.current = 0;
      setRundown({ data, turn });
      setErrors((e) => ({ ...e, rundown: undefined }));
      // An edge copy from the last turn is already expired: wait a little before asking again.
      if (needsRundown(data.rundown, turn, studioNow())) retryAt.current = studioNow() + RETRY_MS[0];
    } catch (err) {
      retryAt.current = studioNow() + RETRY_MS[Math.min(failures.current, RETRY_MS.length - 1)];
      failures.current++;
      setErrors((e) => ({ ...e, rundown: err instanceof Error ? err.message : "failed" }));
    } finally {
      inflight.current = false;
    }
  }, []);

  // ---- schedule (slot statuses and the server's clock): on mount and once a turn
  const scheduleTurn = useRef<string | null>(null);
  const loadSchedule = useCallback(async () => {
    const turn = playhead(studioNow()).wheelStartedAt;
    if (scheduleTurn.current === turn) return;
    scheduleTurn.current = turn;
    try {
      const { data, res, sentMs, receivedMs } = await getJson<ScheduleData>("/api/news?op=schedule");
      setSchedule(data);
      const sample = sampleFrom(data.serverNow, res, sentMs, receivedMs);
      const next = chooseOffset([sample]);
      if (next !== offsetMs) {
        offsetMs = next;
        tick();
      }
    } catch {
      scheduleTurn.current = null;
    }
  }, [tick]);

  const loadWire = useCallback(async () => {
    try {
      const { data } = await getJson<WireData>("/api/news?op=wire");
      setWire(data);
      setErrors((e) => ({ ...e, wire: undefined }));
    } catch (err) {
      setErrors((e) => ({ ...e, wire: err instanceof Error ? err.message : "failed" }));
    }
  }, []);

  useEffect(() => {
    void loadSchedule();
    void loadRundown();
    void loadWire();
    const r = setInterval(() => {
      void loadRundown();
      void loadSchedule();
    }, RUNDOWN_CHECK_MS);
    const w = setInterval(() => void loadWire(), WIRE_REFRESH_MS);
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      void loadRundown();
      void loadSchedule();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(r);
      clearInterval(w);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [loadRundown, loadSchedule, loadWire]);

  const air = useMemo(() => (nowMs == null ? null : onAir(nowMs, rundown?.data.rundown ?? null)), [nowMs, rundown]);

  // ---- console API
  const latest = useRef({ air, rundown, wire, schedule });
  useEffect(() => {
    latest.current = { air, rundown, wire, schedule };
  });
  useEffect(() => {
    const w = window as unknown as { atlas?: Record<string, unknown> };
    w.atlas = {
      ...(w.atlas ?? {}),
      news: {
        now: () => studioNow(),
        offset: () => offsetMs,
        shift: (ms: number) => {
          shiftMs = Number.isFinite(ms) ? ms : 0;
          tick();
          void loadRundown();
          return studioNow();
        },
        state: () => {
          const { air: a, rundown: r } = latest.current;
          return {
            segment: a?.segment.id ?? null,
            status: a?.status ?? null,
            phase: a?.at?.phase ?? null,
            line: a?.at?.caption?.lineIndex ?? null,
            caption: a?.at?.caption?.text ?? null,
            speaker: a?.speaker ?? null,
            writer: r?.data.chosen ?? null,
            turn: r?.turn ?? null,
          };
        },
      },
    };
  }, [tick, loadRundown]);

  return <StudioView nowMs={nowMs} air={air} rundown={rundown?.data ?? null} wire={wire} schedule={schedule} animate={!reduced} errors={errors} />;
}
