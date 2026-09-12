"use client";

import { Search, Settings2, Crosshair, Home, Droplets, Compass, Link2, Landmark, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { copyShareLink } from "@/lib/globe/share";
import { useNow } from "@/lib/hooks/useNow";
import { useGlobe } from "@/lib/store/globe";
import { formatDistance, formatLatLon } from "@/lib/globe/geo";
import { homeView } from "@/lib/globe/camera";
import { isLive } from "@/lib/globe/clock";
import { LAYERS } from "@/lib/layers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import VoiceControl from "./VoiceControl";
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
      {/* brand */}
      <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-3 px-3 py-2">
        <div>
          <div className="hud-display whitespace-nowrap text-[15px] font-semibold leading-none text-primary sm:text-[17px]">
            God&apos;s Eye View
          </div>
          <div className="hud-label mt-1 hidden text-[9px] sm:block">
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
        {/* Mobile keeps just the status dot: the tagline and ONLINE text are
            what wrapped and ghosted over each other at phone widths. */}
        <span
          className={`hud-dot sm:hidden ${ready ? "text-primary" : "text-warn blink"}`}
          style={{ color: ready ? undefined : "var(--warn)" }}
          role="img"
          aria-label={ready ? "Online" : "Booting"}
        />
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
      <div className="hud-panel pointer-events-auto flex shrink-0 items-center gap-1 p-1">
        <VoiceControl />
        <button
          type="button"
          onClick={() => setExploreOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
          title="Curated places, guided tour, exports"
        >
          <Compass className="size-3.5" />
          <span className="hidden sm:inline">Explore</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Search flights, ships, satellites, places (Ctrl+K)"
        >
          <Search className="size-3.5" />
          Search
          <span className="hud-kbd">⌘K</span>
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
          Water
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
          Market
        </button>
        <button
          type="button"
          onClick={() => void copyShareLink()}
          className="hidden items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary md:flex"
          title="Copy a link to exactly this view, layers, clock and selection"
        >
          <Link2 className="size-3.5" />
          Share
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
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center px-2 py-2 text-foreground/80 hover:text-primary"
                aria-label="More actions"
              >
                <Menu className="size-4" />
              </button>
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
