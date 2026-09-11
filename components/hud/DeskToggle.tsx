"use client";
// Toggle between the HUD and desk mode. The integrator places it in the
// TopBar action group. Also binds the `D` key (not while typing).

import { useEffect } from "react";
import { LayoutPanelLeft } from "lucide-react";
import { useDesk } from "@/lib/desk/store";

export default function DeskToggle() {
  const mode = useDesk((s) => s.mode);
  const toggleMode = useDesk((s) => s.toggleMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "d" && e.key !== "D") return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      useDesk.getState().toggleMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const on = mode === "desk";
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-pressed={on}
      className={`flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider hover:bg-accent hover:text-primary ${on ? "text-primary" : "text-foreground/80"}`}
      title={on ? "Back to the HUD (D)" : "Desk mode: light, dense table + chart + report workspace (D)"}
    >
      <LayoutPanelLeft className="size-3.5" />
      <span className="sr-only">Desk</span>
      <span className="hud-kbd hidden 2xl:inline">D</span>
    </button>
  );
}
