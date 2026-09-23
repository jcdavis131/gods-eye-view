"use client";

import { Search, Settings2, Crosshair, Home, Droplets, Compass, Link2, Landmark, Menu, Activity, CalendarDays, Bell, Table2, Aperture, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useIndicators } from "@/lib/indicators/store";
import { useReleases } from "@/lib/releases/store";
import { useWatchlists } from "@/lib/watch/store";
import { useScreener } from "@/lib/screener/store";
import DeskToggle from "./DeskToggle";
import { useLens } from "@/lib/personas/store";
import { PERSONA_BY_ID } from "@/lib/personas/registry";
import { copyShareLink } from "@/lib/globe/share";
import { useNow } from "@/lib/hooks/useNow";
import { useGlobe } from "@/lib/store/globe";
import { formatDistance, formatLatLon } from "@/lib/globe/geo";
import { homeView } from "@/lib/globe/camera";
import { isLive } from "@/lib/globe/clock";
import { LAYERS } from "@/lib/layers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import VoiceControl from "./VoiceControl";
import { useTeleport } from "@/lib/live/teleportStore";
import AboutButton from "./AboutDialog";

export function fmtUtc(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

/** One row in the mobile overflow menu. */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded px-3 py-2.5 text-left text-[13px] ${
        active ? "text-primary" : "text-foreground/85"
      } hover:bg-accent hover:text-primary`}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
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
  const personaId = useLens((s) => s.personaId);
  const setPickerOpen = useLens((s) => s.setPickerOpen);
  const persona = personaId ? PERSONA_BY_ID[personaId] : null;
  const live = isLive(clock.offsetMs);
  const mission = now ? now + clock.offsetMs : 0;

  // Moving contacts only: aircraft, ships, satellites. Quakes and launch pads
  // are events/places, not contacts.
  const liveCount = LAYERS.reduce((n, l) => {
    if (!layers[l.id] || l.simulated) return n;
    if (l.id !== "aircraft" && l.id !== "ships" && l.id !== "satellites") return n;
    return n + (status[l.id]?.count ?? 0);
  }, 0);

  const [menuOpen, setMenuOpen] = useState(false);
  const toggleWater = () => {
    const st = useGlobe.getState();
    if (!waterOpen) {
      st.setLayer("water", true);
      st.setLayer("groundwater", true);
    }
    st.setWaterReportOpen(!waterOpen);
  };
  const toggleMarket = () => {
    const st = useGlobe.getState();
    if (!marketOpen) {
      st.setLayer("realestate", true);
      st.setLayer("commerce", true);
      st.setLayer("trade", true);
    }
    st.setMarketReportOpen(!marketOpen);
  };
  const closeMenu = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2 sm:gap-3 sm:p-3">
      {/* Widths: the actions strip is icon-only (titles + sr-only names) so twelve actions fit beside the clock; the subtitle and live contacts appear from 2xl, the clock readout from lg; the strip scrolls sideways before it ever clips. */}
      {/* brand */}
      <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4">
        <div>
          <div className="hud-display whitespace-nowrap text-[15px] font-semibold leading-none text-primary sm:text-[17px]">
            Embedding Atlas
          </div>
          <div className="hud-label mt-1 hidden whitespace-nowrap text-[9px] 2xl:block">
            spy satellite simulator · the data is real
          </div>
        </div>
        <div className="hidden h-8 w-px bg-border sm:block" />
        <div className="hidden items-center gap-2 sm:flex">
          <span
            className={`hud-dot ${ready ? "text-primary" : "text-warn blink"}`}
            style={{ color: ready ? undefined : "var(--warn)" }}
          />
          <span className="hud-label">{ready ? "ONLINE" : "BOOT"}</span>
        </div>
        {/* Narrow viewports keep just the status dot: the tagline and ONLINE
            text are what wrapped and ghosted over each other there. */}
        <span
          className={`hud-dot sm:hidden ${ready ? "text-primary" : "text-warn blink"}`}
          style={{ color: ready ? undefined : "var(--warn)" }}
          role="img"
          aria-label={ready ? "Online" : "Booting"}
        />
        {persona && (
          <>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <button type="button" onClick={() => setPickerOpen(true)} className="hud-label hidden whitespace-nowrap hover:text-primary sm:block" style={{ color: persona.color }} title="Change lens">
              lens · {persona.title}
            </button>
          </>
        )}
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
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Lens: who is looking (real estate, economist, trader, water, supply chain, public finance, explorer)"
        >
          <Aperture className="size-3.5" />
          <span className="sr-only">Lens</span>
        </button>
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
          onClick={() => {
            const t = useTeleport.getState();
            if (t.active) t.next();
            else void t.start();
          }}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Teleport: fly to wherever the world is doing something unusual right now (NWS warnings, earthquakes), strongest first"
        >
          <Zap className="size-3.5" />
          <span className="hidden lg:inline">Teleport</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Search flights, ships, satellites, places (Ctrl+K)"
        >
          <Search className="size-3.5" />
          <span className="sr-only">Search</span>
          <span className="hud-kbd hidden 2xl:inline">⌘K</span>
        </button>
        <button
          type="button"
          onClick={toggleWater}
          className={`hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary md:flex ${
            waterOpen ? "text-primary" : "text-foreground/80"
          }`}
          title="Community water report for the current view"
        >
          <Droplets className="size-3.5" />
          <span className="sr-only">Water</span>
        </button>
        <button
          type="button"
          onClick={toggleMarket}
          className={`hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary md:flex ${
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
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Copy a link to exactly this view, layers, clock and selection"
        >
          <Link2 className="size-3.5" />
          <span className="sr-only">Share</span>
        </button>
        <button
          type="button"
          onClick={() => homeView()}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Home view"
        >
          <Home className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => useGlobe.getState().select(null)}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Clear selection (Esc)"
        >
          <Crosshair className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Settings & API keys (,)"
        >
          <Settings2 className="size-3.5" />
          Keys
        </button>
        <span className="hidden md:contents">
          <AboutButton />
        </span>
        {/* Mobile overflow: every action that doesn't fit the bar. */}
        <div className="md:hidden">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              type="button"
              className="flex items-center px-2 py-2 text-foreground/80 hover:text-primary"
              aria-label="More actions"
            >
              <Menu className="size-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <MenuItem icon={Search} label="Search" onClick={closeMenu(() => setSearchOpen(true))} />
              <MenuItem icon={Droplets} label="Water report" onClick={closeMenu(toggleWater)} active={waterOpen} />
              <MenuItem icon={Landmark} label="Market report" onClick={closeMenu(toggleMarket)} active={marketOpen} />
              <MenuItem icon={Link2} label="Copy share link" onClick={closeMenu(() => void copyShareLink())} />
              <MenuItem icon={Home} label="Home view" onClick={closeMenu(() => homeView())} />
              <MenuItem icon={Crosshair} label="Clear selection" onClick={closeMenu(() => useGlobe.getState().select(null))} />
              <MenuItem icon={Settings2} label="Settings & keys" onClick={closeMenu(() => setSettingsOpen(true))} />
              <div className="mt-1 border-t border-border/60 pt-1">
                <AboutButton compact />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
