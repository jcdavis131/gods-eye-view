"use client";
// Three first steps for the active lens, each a tap away. Shown once per
// lens; the X remembers the dismissal.

import { ArrowRight, X } from "lucide-react";
import { PERSONA_BY_ID } from "@/lib/personas/registry";
import { useLens } from "@/lib/personas/store";
import { setPanel } from "@/lib/personas/actions";

export default function StartHere() {
  const id = useLens((s) => s.personaId);
  const dismissed = useLens((s) => s.dismissedSteps);
  const dismiss = useLens((s) => s.dismissSteps);
  const setPickerOpen = useLens((s) => s.setPickerOpen);
  if (!id || dismissed.includes(id)) return null;
  const p = PERSONA_BY_ID[id];
  return (
    <section className="hud-panel pointer-events-auto w-full" aria-label="Start here">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="hud-label" style={{ color: p.color }}>
          Start here · {p.title}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPickerOpen(true)} className="whitespace-nowrap text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
            change lens
          </button>
          <button type="button" onClick={() => dismiss(id)} className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Dismiss start here">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <ol className="divide-y divide-border/60">
        {p.steps.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => s.panel && setPanel(s.panel, true)}
              disabled={!s.panel}
              className="flex w-full items-start gap-3 px-3 py-2 text-left text-[11px] leading-snug text-foreground/90 hover:bg-accent disabled:cursor-default"
            >
              <span className="hud-display mt-0.5 shrink-0 text-[13px] font-semibold" style={{ color: p.color }}>
                {i + 1}
              </span>
              <span className="flex-1">{s.text}</span>
              {s.panel && <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
