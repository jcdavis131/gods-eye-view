"use client";
// Full-screen cockpit: the globe underneath, HUD chrome on top.

import dynamic from "next/dynamic";
import { useEffect } from "react";
import LayerHost from "@/components/globe/LayerHost";
import HudFrame from "./HudFrame";
import TopBar from "./TopBar";
import LayerPanel from "./LayerPanel";
import InfoPanel from "./InfoPanel";
import WaterReportPanel from "./WaterReportPanel";
import MarketReportPanel from "./MarketReportPanel";
import IndicatorsPanel from "./IndicatorsPanel";
import ReleasesPanel from "./ReleasesPanel";
import WatchlistPanel from "./WatchlistPanel";
import ScreenerPanel from "./ScreenerPanel";
import DeskLayout from "./DeskLayout";
import ExploreDialog from "./ExploreDialog";
import TourCaption from "./TourCaption";
import { applyShare, parseShare, startUrlSync } from "@/lib/globe/share";
import Timeline from "./Timeline";
import SettingsDialog from "./SettingsDialog";
import SearchCommand from "./SearchCommand";
import { useGlobe } from "@/lib/store/globe";
import { LAYERS } from "@/lib/layers";

const CesiumGlobe = dynamic(() => import("@/components/globe/CesiumGlobe"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-background">
      <div className="hud-label animate-pulse text-primary/70">ACQUIRING GLOBE…</div>
    </div>
  ),
});

export default function Cockpit() {
  const setLayer = useGlobe((s) => s.setLayer);
  const setSearchOpen = useGlobe((s) => s.setSearchOpen);
  const setSettingsOpen = useGlobe((s) => s.setSettingsOpen);
  const ready = useGlobe((s) => s.ready);
  const embed = useGlobe((s) => s.embed);

  // Default layers on at first boot, unless the link names its own set.
  useEffect(() => {
    const share = parseShare(window.location.search);
    if (share.embed) useGlobe.getState().setEmbed(true);
    if (share.layers) {
      for (const l of LAYERS) setLayer(l.id, share.layers.includes(l.id));
    } else {
      for (const l of LAYERS) if (l.defaultEnabled) setLayer(l.id, true);
    }
  }, [setLayer]);

  // Once the globe is up: apply the rest of the link (clock, report,
  // selection; the camera already flew there in CesiumGlobe's opening move)
  // and start mirroring the cockpit back into the address bar.
  useEffect(() => {
    if (!ready) return;
    const share = parseShare(window.location.search);
    applyShare(share, { fly: false });
    return startUrlSync();
  }, [ready]);

  // Console API for inspection: window.gev.{globe,settings,run,say,flyTo,layers,features}
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ runCommand, COMMANDS }, { parseIntent }, camera, registry, { useSettings }, cesium, { PRESETS }, exportsMod, share] =
        await Promise.all([
          import("@/lib/voice/commands"),
          import("@/lib/voice/intent"),
          import("@/lib/globe/camera"),
          import("@/lib/globe/registry"),
          import("@/lib/store/settings"),
          import("@/lib/globe/cesium"),
          import("@/lib/explore/presets"),
          import("@/lib/explore/export"),
          import("@/lib/globe/share"),
        ]);
      if (cancelled) return;
      (window as unknown as { gev: unknown }).gev = {
        globe: useGlobe,
        settings: useSettings,
        viewer: cesium.getViewer,
        layers: LAYERS,
        commands: COMMANDS.map((c) => c.name),
        run: runCommand,
        say: (text: string) => {
          const i = parseIntent(text);
          return i ? runCommand(i.command, i.args) : Promise.resolve("no intent parsed");
        },
        flyTo: camera.flyTo,
        features: registry.allFeatures,
        presets: PRESETS,
        exports: { gaugesCsv: exportsMod.gaugesCsv, chipsGeoJson: exportsMod.chipsGeoJson, areasCsv: exportsMod.areasCsv, tradeCsv: exportsMod.tradeCsv },
        shareUrl: share.shareUrl,
        applyShare: share.applyShare,
      };
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard: ⌘K / Ctrl+K search, comma settings, Escape deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!typing && e.key === ",") {
        setSettingsOpen(true);
      } else if (e.key === "Escape") {
        useGlobe.getState().select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen, setSettingsOpen]);

  return (
    <main className="relative h-full w-full select-none overflow-hidden bg-background">
      <CesiumGlobe />
      <LayerHost />
      <HudFrame />
      {embed ? (
        <EmbedBadge />
      ) : (
        <>
          <TopBar />
          <LayerPanel />
          <div className="desk-hud-only pointer-events-none absolute right-3 top-[76px] z-30 flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-2">
            <WaterReportPanel />
            <MarketReportPanel />
            <IndicatorsPanel />
            <ReleasesPanel />
            <WatchlistPanel />
            <InfoPanel />
          </div>
          <div className="pointer-events-none absolute bottom-16 right-3 z-30 max-w-[calc(100vw-24px)]">
            <ScreenerPanel />
          </div>
          <Timeline />
          <TourCaption />
          <SettingsDialog />
          <SearchCommand />
          <ExploreDialog />
          <DeskLayout />
        </>
      )}
    </main>
  );
}

/** Minimal chrome for ?embed=1: brand and a way out. Cesium's own credits stay. */
function EmbedBadge() {
  return (
    <a
      href={typeof window === "undefined" ? "/" : window.location.href.replace(/([?&])embed=1&?/, "$1").replace(/[?&]$/, "")}
      target="_blank"
      rel="noreferrer"
      className="hud-panel pointer-events-auto absolute left-3 top-3 z-30 flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-primary hover:text-foreground"
      title="Open the full cockpit"
    >
      God&apos;s Eye View
      <span className="text-muted-foreground">· open full view</span>
    </a>
  );
}
