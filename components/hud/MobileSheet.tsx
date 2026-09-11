"use client";
// Phone bottom sheet. Every open panel renders inside it, stacked, in one
// scroll container; the handle toggles between half and tall, the X closes
// everything. Panels keep their own markup; app/globals.css relaxes their
// desktop widths and inner max-heights under `.mobile-sheet`.

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { closeAllPanels, useMobile, useOpenPanels } from "@/lib/mobile/store";

const TITLES: Record<string, string> = {
  layers: "Layers",
  water: "Water report",
  market: "Market report",
  indicators: "Signals",
  releases: "Releases",
  watch: "Watchlist",
  screener: "Screener",
  info: "Selected",
};

export default function MobileSheet({ children }: { children: ReactNode }) {
  const open = useOpenPanels();
  const sheet = useMobile((s) => s.sheet);
  const toggleSheet = useMobile((s) => s.toggleSheet);
  const setSheet = useMobile((s) => s.setSheet);
  const drag = useRef<{ y: number; id: number } | null>(null);
  // Swipe on the handle row: up makes the sheet tall, down shrinks it, and a
  // second swipe down closes everything. A short tap still toggles.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (dy < -40) setSheet("tall");
    else if (dy > 40) {
      if (sheet === "tall") setSheet("half");
      else closeAllPanels();
    }
  };
  if (open.length === 0) return null;
  return (
    <section
      className={`mobile-sheet pointer-events-auto flex min-h-0 flex-col ${sheet === "tall" ? "mobile-sheet-tall" : "mobile-sheet-half"}`}
      aria-label="Open panels"
    >
      <div className="hud-panel flex touch-none items-center gap-2 px-2 py-1" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (drag.current = null)}>
        <button
          type="button"
          onClick={toggleSheet}
          className="flex h-8 flex-1 items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"
          aria-label={sheet === "tall" ? "Shrink panel" : "Expand panel"}
        >
          {sheet === "tall" ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          <span className="truncate">{open.map((id) => TITLES[id] ?? id).join(" · ")}</span>
        </button>
        <button
          type="button"
          onClick={closeAllPanels}
          className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Close all panels"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mobile-sheet-body flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pt-2">{children}</div>
    </section>
  );
}
