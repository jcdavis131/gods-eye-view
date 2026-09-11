"use client";

import { Switch } from "@/components/ui/switch";
import { LAYERS } from "@/lib/layers";
import { useGlobe } from "@/lib/store/globe";
import { timeAgo } from "@/lib/globe/geo";
import { useEffect, useState } from "react";

/** `embedded`: render as a block inside the mobile sheet instead of pinned to the left edge. */
export default function LayerPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const setLayer = useGlobe((s) => s.setLayer);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className={embedded ? "pointer-events-auto w-full" : "pointer-events-auto absolute left-3 top-[76px] z-30 max-h-[calc(100vh-190px)] w-[268px] max-w-[calc(100vw-24px)] overflow-y-auto [scrollbar-width:thin]"}>
      <div className="hud-panel">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="hud-label">Signal layers</span>
          <span className="text-[9px] text-muted-foreground">
            {Object.values(layers).filter(Boolean).length}/{LAYERS.length} ON
          </span>
        </div>
        <ul className="divide-y divide-border/60">
          {LAYERS.map((l) => {
            const on = layers[l.id];
            const st = status[l.id];
            return (
              <li key={l.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="hud-dot" style={{ color: l.color, opacity: on ? 1 : 0.35 }} />
                  <button
                    type="button"
                    onClick={() => setLayer(l.id, !on)}
                    className="hud-display flex-1 text-left text-[13px] font-semibold tracking-wider"
                    style={{ color: on ? l.color : "var(--muted-foreground)" }}
                    title={l.description}
                  >
                    {l.label}
                  </button>
                  {l.simulated && (
                    <span className="rounded border border-warn/50 px-1 text-[8px] tracking-widest text-warn">
                      SIMULATED
                    </span>
                  )}
                  {l.estimate && (
                    <span className="rounded border border-warn/50 px-1 text-[8px] tracking-widest text-warn" title={l.estimate}>
                      ESTIMATE
                    </span>
                  )}
                  <span className="min-w-[44px] text-right text-[12px] tabular-nums text-foreground/90">
                    {on && st ? st.count.toLocaleString() : "—"}
                  </span>
                  <Switch
                    size="sm"
                    checked={on}
                    onCheckedChange={(checked) => setLayer(l.id, checked)}
                    aria-label={`Toggle ${l.label}`}
                  />
                </div>
                {on && (
                  <div className="mt-1 flex items-center justify-between gap-2 pl-4 text-[9px] text-muted-foreground">
                    <span className="truncate">
                      {st?.error ? (
                        <span className="text-alert">ERR {st.error.slice(0, 60)}</span>
                      ) : st?.note ? (
                        st.note
                      ) : (
                        l.attribution
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {st?.loading ? <span className="blink text-primary">SYNC</span> : timeAgo(st?.fetchedAt)}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
