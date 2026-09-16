import { beforeEach, describe, expect, it } from "vitest";
import { closeAllPanels, openPanels, useMobile } from "./store";
import { useGlobe } from "@/lib/store/globe";
import { useIndicators } from "@/lib/indicators/store";
import { useReleases } from "@/lib/releases/store";
import { useWatchlists } from "@/lib/watch/store";
import { useScreener } from "@/lib/screener/store";

describe("mobile panel bookkeeping", () => {
  beforeEach(() => closeAllPanels());

  it("starts with nothing open", () => {
    expect(openPanels()).toEqual([]);
  });

  it("lists every open panel across the stores", () => {
    useMobile.getState().setLayersOpen(true);
    useGlobe.getState().setMarketReportOpen(true);
    useIndicators.getState().setOpen(true);
    useReleases.getState().setReleasesOpen(true);
    useWatchlists.getState().setOpen(true);
    useScreener.getState().setOpen(true);
    useGlobe.getState().select({ layer: "water", id: "x" });
    expect(openPanels()).toEqual(["layers", "market", "indicators", "releases", "watch", "screener", "info"]);
  });

  it("closeAllPanels clears all of them and the selection", () => {
    useMobile.getState().setLayersOpen(true);
    useGlobe.getState().setWaterReportOpen(true);
    useGlobe.getState().select({ layer: "water", id: "x" });
    closeAllPanels();
    expect(openPanels()).toEqual([]);
    expect(useGlobe.getState().selected).toBeNull();
  });

  it("toggles the sheet height", () => {
    expect(useMobile.getState().sheet).toBe("half");
    useMobile.getState().toggleSheet();
    expect(useMobile.getState().sheet).toBe("tall");
    useMobile.getState().toggleSheet();
    expect(useMobile.getState().sheet).toBe("half");
  });
});
