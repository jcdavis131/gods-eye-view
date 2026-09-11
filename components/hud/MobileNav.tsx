"use client";
// Phone bottom bar: a horizontally scrollable strip of panel toggles. Each
// chip is a 44 px touch target; the active ones light up. The strip snaps so
// a flick lands on whole chips.

import { Activity, Bell, CalendarDays, Compass, Droplets, Landmark, Layers, Link2, Table2 } from "lucide-react";
import type { ComponentType } from "react";
import { useGlobe } from "@/lib/store/globe";
import { useIndicators } from "@/lib/indicators/store";
import { useReleases } from "@/lib/releases/store";
import { useWatchlists } from "@/lib/watch/store";
import { useScreener } from "@/lib/screener/store";
import { useMobile } from "@/lib/mobile/store";
import { copyShareLink } from "@/lib/globe/share";

interface Chip {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onPress: () => void;
}

export default function MobileNav() {
  const layersOpen = useMobile((s) => s.layersOpen);
  const toggleLayers = useMobile((s) => s.toggleLayers);
  const waterOpen = useGlobe((s) => s.waterReportOpen);
  const marketOpen = useGlobe((s) => s.marketReportOpen);
  const indOpen = useIndicators((s) => s.open);
  const toggleInd = useIndicators((s) => s.toggle);
  const screenOpen = useScreener((s) => s.open);
  const toggleScreen = useScreener((s) => s.toggle);
  const relOpen = useReleases((s) => s.releasesOpen);
  const setRelOpen = useReleases((s) => s.setReleasesOpen);
  const watchOpen = useWatchlists((s) => s.open);
  const setWatchOpen = useWatchlists((s) => s.setOpen);
  const setExploreOpen = useGlobe((s) => s.setExploreOpen);

  const chips: Chip[] = [
    { id: "layers", label: "Layers", icon: Layers, active: layersOpen, onPress: toggleLayers },
    {
      id: "water",
      label: "Water",
      icon: Droplets,
      active: waterOpen,
      onPress: () => {
        const st = useGlobe.getState();
        if (!waterOpen) {
          st.setLayer("water", true);
          st.setLayer("groundwater", true);
        }
        st.setWaterReportOpen(!waterOpen);
      },
    },
    {
      id: "market",
      label: "Market",
      icon: Landmark,
      active: marketOpen,
      onPress: () => {
        const st = useGlobe.getState();
        if (!marketOpen) {
          st.setLayer("realestate", true);
          st.setLayer("commerce", true);
          st.setLayer("trade", true);
        }
        st.setMarketReportOpen(!marketOpen);
      },
    },
    { id: "signals", label: "Signals", icon: Activity, active: indOpen, onPress: toggleInd },
    { id: "screen", label: "Screen", icon: Table2, active: screenOpen, onPress: toggleScreen },
    { id: "releases", label: "Releases", icon: CalendarDays, active: relOpen, onPress: () => setRelOpen(!relOpen) },
    { id: "watch", label: "Watch", icon: Bell, active: watchOpen, onPress: () => setWatchOpen(!watchOpen) },
    { id: "explore", label: "Explore", icon: Compass, active: false, onPress: () => setExploreOpen(true) },
    { id: "share", label: "Share", icon: Link2, active: false, onPress: () => void copyShareLink() },
  ];

  return (
    <nav className="hud-panel pointer-events-auto mobile-nav" aria-label="Panels">
      <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-1">
        {chips.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onPress}
              aria-pressed={c.active}
              className={`flex min-h-[48px] min-w-[68px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 px-2 text-[9px] uppercase tracking-wider ${
                c.active ? "text-primary" : "text-foreground/75"
              }`}
            >
              <Icon className="size-4" />
              {c.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
