"use client";
// Phone header: one row with the brand, the online dot, the clock state, and
// the two actions that must stay reachable without opening a sheet (search,
// settings). Everything else lives in MobileNav at the bottom of the screen.

import { Search, Settings2 } from "lucide-react";
import { useGlobe } from "@/lib/store/globe";
import { useReleases } from "@/lib/releases/store";
import { isLive } from "@/lib/globe/clock";
import VoiceControl from "./VoiceControl";

export default function MobileTopBar() {
  const ready = useGlobe((s) => s.ready);
  const clock = useGlobe((s) => s.clock);
  const setSearchOpen = useGlobe((s) => s.setSearchOpen);
  const setSettingsOpen = useGlobe((s) => s.setSettingsOpen);
  const vintage = useReleases((s) => s.vintage);
  const live = isLive(clock.offsetMs);
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-30 p-2"
      style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
    >
      <div className="hud-panel pointer-events-auto flex items-center gap-2 px-3 py-1.5">
        <span className={`hud-dot shrink-0 ${ready ? "text-primary" : "text-warn blink"}`} style={{ color: ready ? undefined : "var(--warn)" }} aria-label={ready ? "online" : "booting"} />
        <div className="hud-display min-w-0 truncate text-[13px] font-semibold leading-none text-primary">God&apos;s Eye View</div>
        <span className={`shrink-0 rounded px-1 text-[9px] tracking-widest ${live ? "bg-primary/15 text-primary" : "bg-warn/15 text-warn"}`}>
          {live ? "LIVE" : clock.offsetMs < 0 ? "REPLAY" : "FORWARD"}
        </span>
        {vintage && <span className="shrink-0 rounded bg-warn/15 px-1 text-[9px] tracking-widest text-warn">V {vintage}</span>}
        <div className="ml-auto flex shrink-0 items-center">
          <VoiceControl compact />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex size-9 items-center justify-center text-foreground/80 hover:text-primary"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex size-9 items-center justify-center text-foreground/80 hover:text-primary"
            aria-label="Settings and keys"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
