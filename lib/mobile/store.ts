// Mobile-only HUD state. On a phone the layer list is a sheet you open rather
// than a panel that is always on screen, and every open panel shares one
// bottom sheet, so this store knows which panels are open across the other
// stores and can close them all at once.

import { create } from "zustand";
import { useGlobe } from "@/lib/store/globe";
import { useIndicators } from "@/lib/indicators/store";
import { useReleases } from "@/lib/releases/store";
import { useWatchlists } from "@/lib/watch/store";
import { useScreener } from "@/lib/screener/store";

export type SheetHeight = "half" | "tall";

interface MobileState {
  /** The signal-layers list is open in the sheet. */
  layersOpen: boolean;
  setLayersOpen: (open: boolean) => void;
  toggleLayers: () => void;
  /** Sheet height; the handle toggles it. */
  sheet: SheetHeight;
  setSheet: (h: SheetHeight) => void;
  toggleSheet: () => void;
}

export const useMobile = create<MobileState>()((set) => ({
  layersOpen: false,
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  toggleLayers: () => set((s) => ({ layersOpen: !s.layersOpen })),
  sheet: "half",
  setSheet: (sheet) => set({ sheet }),
  toggleSheet: () => set((s) => ({ sheet: s.sheet === "half" ? "tall" : "half" })),
}));

/** Which panels are open right now, read from every store that owns one. */
export function openPanels(): string[] {
  const g = useGlobe.getState();
  const out: string[] = [];
  if (useMobile.getState().layersOpen) out.push("layers");
  if (g.waterReportOpen) out.push("water");
  if (g.marketReportOpen) out.push("market");
  if (useIndicators.getState().open) out.push("indicators");
  if (useReleases.getState().releasesOpen) out.push("releases");
  if (useWatchlists.getState().open) out.push("watch");
  if (useScreener.getState().open) out.push("screener");
  if (g.selected) out.push("info");
  return out;
}

/** Close every panel and drop the selection; the sheet disappears. */
export function closeAllPanels(): void {
  useMobile.getState().setLayersOpen(false);
  const g = useGlobe.getState();
  g.setWaterReportOpen(false);
  g.setMarketReportOpen(false);
  g.select(null);
  useIndicators.getState().setOpen(false);
  useReleases.getState().setReleasesOpen(false);
  useWatchlists.getState().setOpen(false);
  useScreener.getState().setOpen(false);
}

/**
 * Subscribe to the open state of every panel. Returns the list of open panel
 * ids; the sheet renders when it is non-empty.
 */
export function useOpenPanels(): string[] {
  const layers = useMobile((s) => s.layersOpen);
  const water = useGlobe((s) => s.waterReportOpen);
  const market = useGlobe((s) => s.marketReportOpen);
  const selected = useGlobe((s) => s.selected);
  const ind = useIndicators((s) => s.open);
  const rel = useReleases((s) => s.releasesOpen);
  const watch = useWatchlists((s) => s.open);
  const screen = useScreener((s) => s.open);
  const out: string[] = [];
  if (layers) out.push("layers");
  if (water) out.push("water");
  if (market) out.push("market");
  if (ind) out.push("indicators");
  if (rel) out.push("releases");
  if (watch) out.push("watch");
  if (screen) out.push("screener");
  if (selected) out.push("info");
  return out;
}
