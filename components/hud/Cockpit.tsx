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

  // Default layers on at first boot.
  useEffect(() => {
    for (const l of LAYERS) if (l.defaultEnabled) setLayer(l.id, true);
  }, [setLayer]);

  // Console API for inspection: window.gev.{globe,settings,run,say,flyTo,layers,features}
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ runCommand, COMMANDS }, { parseIntent }, camera, registry, { useSettings }, cesium] = await Promise.all([
        import("@/lib/voice/commands"),
        import("@/lib/voice/intent"),
        import("@/lib/globe/camera"),
        import("@/lib/globe/registry"),
        import("@/lib/store/settings"),
        import("@/lib/globe/cesium"),
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
      <TopBar />
      <LayerPanel />
      <div className="pointer-events-none absolute right-3 top-[76px] z-30 flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-2">
        <WaterReportPanel />
        <InfoPanel />
      </div>
      <Timeline />
      <SettingsDialog />
      <SearchCommand />
    </main>
  );
}
