"use client";

import { Search, Settings2, Crosshair, Home, Droplets, Compass, Link2, Landmark, Activity, CalendarDays, Bell, Table2 } from "lucide-react";
import { useIndicators } from "@/lib/indicators/store";
import { useReleases } from "@/lib/releases/store";
import { useWatchlists } from "@/lib/watch/store";
import { useScreener } from "@/lib/screener/store";
import DeskToggle from "./DeskToggle";
import { copyShareLink } from "@/lib/globe/share";
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
  const waterOpen = useGlobe((s) => s.waterReportOpen);
  const marketOpen = useGlobe((s) => s.marketReportOpen);
  const setExploreOpen = useGlobe((s) => s.setExploreOpen);
  const indOpen = useIndicators((s) => s.open);
  const toggleInd = useIndicators((s) => s.toggle);
  const relOpen = useReleases((s) => s.releasesOpen);
  const setRelOpen = useReleases((s) => s.setReleasesOpen);
  const vintage = useReleases((s) => s.vintage);
  const watchOpen = useWatchlists((s) => s.open);
  const setWatchOpen = useWatchlists((s) => s.setOpen);
  const screenOpen = useScreener((s) => s.open);
  const toggleScreen = useScreener((s) => s.toggle);
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
      {/* Widths: the actions strip is icon-only (titles + sr-only names) so twelve actions fit beside the clock; the subtitle and live contacts appear from 2xl, the clock readout from lg; the strip scrolls sideways before it ever clips. */}
      {/* brand */}
      <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-4 px-4 py-2">
        <div>
          <div className="hud-display whitespace-nowrap text-[17px] font-semibold leading-none text-primary">
            God&apos;s Eye View
          </div>
          <div className="hud-label mt-1 hidden whitespace-nowrap text-[9px] 2xl:block">
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
      <div className="hud-panel pointer-events-auto hidden shrink-0 items-center gap-5 whitespace-nowrap px-4 py-2 lg:flex">
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
            {vintage && (
              <span className="rounded bg-warn/15 px-1 text-[9px] tracking-widest text-warn" title="Data vintage pinned by the permalink (&v=)">
                VINTAGE {vintage}
              </span>
            )}
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
        <div className="hidden h-8 w-px bg-border 2xl:block" />
        <div className="hidden 2xl:block">
          <div className="hud-label">Live contacts</div>
          <div className="mt-0.5 text-[13px] tabular-nums text-primary">
            {liveCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="hud-panel pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap p-1 [scrollbar-width:none]">
        <VoiceControl />
        <button
          type="button"
          onClick={() => setExploreOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Curated places, guided tour, exports"
        >
          <Compass className="size-3.5" />
          <span className="sr-only">Explore</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Search flights, ships, satellites, places (Ctrl+K)"
        >
          <Search className="size-3.5" />
          <span className="sr-only">Search</span>
          <span className="hud-kbd hidden 2xl:inline">⌘K</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const st = useGlobe.getState();
            if (!waterOpen) {
              st.setLayer("water", true);
              st.setLayer("groundwater", true);
            }
            st.setWaterReportOpen(!waterOpen);
          }}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${
            waterOpen ? "text-primary" : "text-foreground/80"
          }`}
          title="Community water report for the current view"
        >
          <Droplets className="size-3.5" />
          <span className="sr-only">Water</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const st = useGlobe.getState();
            if (!marketOpen) {
              st.setLayer("realestate", true);
              st.setLayer("commerce", true);
              st.setLayer("trade", true);
            }
            st.setMarketReportOpen(!marketOpen);
          }}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${
            marketOpen ? "text-primary" : "text-foreground/80"
          }`}
          title="Market report for the current view: home values, rents, wages, jobs, trade gateways"
        >
          <Landmark className="size-3.5" />
          <span className="sr-only">Market</span>
        </button>
        <button
          type="button"
          onClick={toggleInd}
          aria-pressed={indOpen}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${indOpen ? "text-primary" : "text-foreground/80"}`}
          title="Named indicators with thresholds: river stages, freight, housing, energy, labour, trade"
        >
          <Activity className="size-3.5" />
          <span className="sr-only">Signals</span>
        </button>
        <button
          type="button"
          onClick={toggleScreen}
          aria-pressed={screenOpen}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${screenOpen ? "text-primary" : "text-foreground/80"}`}
          title="Screener: rank and filter counties, states, ports, crossings, countries"
        >
          <Table2 className="size-3.5" />
          <span className="sr-only">Screen</span>
        </button>
        <button
          type="button"
          onClick={() => setRelOpen(!relOpen)}
          aria-pressed={relOpen}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${relOpen ? "text-primary" : "text-foreground/80"}`}
          title="Release calendar, loaded vintages, movers since the last release"
        >
          <CalendarDays className="size-3.5" />
          <span className="sr-only">Releases</span>
        </button>
        <button
          type="button"
          onClick={() => setWatchOpen(!watchOpen)}
          aria-pressed={watchOpen}
          className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${watchOpen ? "text-primary" : "text-foreground/80"}`}
          title="Watchlists with rules, RSS/Atom feeds and webhooks"
        >
          <Bell className="size-3.5" />
          <span className="sr-only">Watch</span>
        </button>
        <DeskToggle />
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Copy a link to exactly this view, layers, clock and selection"
        >
          <Link2 className="size-3.5" />
          <span className="sr-only">Share</span>
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
