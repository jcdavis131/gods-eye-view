"use client";

import { Search, Settings2, Crosshair, Home } from "lucide-react";
import { useNow } from "@/lib/hooks/useNow";
import { useGlobe } from "@/lib/store/globe";
import { formatDistance, formatLatLon } from "@/lib/globe/geo";
import { homeView } from "@/lib/globe/camera";
import { isLive } from "@/lib/globe/clock";
import { LAYERS } from "@/lib/layers";
import VoiceControl from "./VoiceControl";
import AboutButton from "./AboutDialog";

export function fmtUtc(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export default function TopBar() {
  const now = useNow(1000);
  const view = useGlobe((s) => s.view);
  const clock = useGlobe((s) => s.clock);
  const status = useGlobe((s) => s.status);
  const layers = useGlobe((s) => s.layers);
  const ready = useGlobe((s) => s.ready);
  const setSearchOpen = useGlobe((s) => s.setSearchOpen);
  const setSettingsOpen = useGlobe((s) => s.setSettingsOpen);
  const live = isLive(clock.offsetMs);
  const mission = now ? now + clock.offsetMs : 0;

  // Moving contacts only: aircraft, ships, satellites. Quakes and launch pads
  // are events/places, not contacts.
  const liveCount = LAYERS.reduce((n, l) => {
    if (!layers[l.id] || l.simulated) return n;
    if (l.id !== "aircraft" && l.id !== "ships" && l.id !== "satellites") return n;
    return n + (status[l.id]?.count ?? 0);
  }, 0);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
      {/* brand */}
      <div className="hud-panel pointer-events-auto flex items-center gap-4 px-4 py-2">
        <div>
          <div className="hud-display text-[17px] font-semibold leading-none text-primary">
            God&apos;s Eye View
          </div>
          <div className="hud-label mt-1 text-[9px]">
            spy satellite simulator · the data is real
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span
            className={`hud-dot ${ready ? "text-primary" : "text-warn blink"}`}
            style={{ color: ready ? undefined : "var(--warn)" }}
          />
          <span className="hud-label">{ready ? "ONLINE" : "BOOT"}</span>
        </div>
      </div>

      {/* clock + camera readout */}
      <div className="hud-panel pointer-events-auto hidden items-center gap-5 px-4 py-2 md:flex">
        <div>
          <div className="hud-label">Mission clock</div>
          <div className="mt-0.5 flex items-center gap-2 text-[13px] tabular-nums text-foreground">
            {fmtUtc(mission)}
            <span
              className={`rounded px-1 text-[9px] tracking-widest ${
                live ? "bg-primary/15 text-primary" : "bg-warn/15 text-warn"
              }`}
            >
              {live ? "LIVE" : clock.offsetMs < 0 ? "REPLAY" : "FORWARD"}
            </span>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="hud-label">Camera target</div>
          <div className="mt-0.5 text-[13px] tabular-nums">
            {formatLatLon(view.lat, view.lon)}
            <span className="ml-2 text-muted-foreground">ALT {formatDistance(view.height)}</span>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <div className="hud-label">Live contacts</div>
          <div className="mt-0.5 text-[13px] tabular-nums text-primary">
            {liveCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="hud-panel pointer-events-auto flex items-center gap-1 p-1">
        <VoiceControl />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Search flights, ships, satellites, places (Ctrl+K)"
        >
          <Search className="size-3.5" />
          Search
          <span className="hud-kbd">⌘K</span>
        </button>
        <button
          type="button"
          onClick={() => homeView()}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Home view"
        >
          <Home className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => useGlobe.getState().select(null)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Clear selection (Esc)"
        >
          <Crosshair className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Settings & API keys (,)"
        >
          <Settings2 className="size-3.5" />
          Keys
        </button>
        <AboutButton />
      </div>
    </header>
  );
}
