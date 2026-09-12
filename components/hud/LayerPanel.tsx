"use client";

import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { LAYERS } from "@/lib/layers";
import type { LayerDefinition, LayerId } from "@/lib/layers/types";
import { useGlobe, type LayerStatus } from "@/lib/store/globe";
import { timeAgo } from "@/lib/globe/geo";
import { useEffect, useState } from "react";

function LayerRow({
  l,
  on,
  st,
  setLayer,
}: {
  l: LayerDefinition;
  on: boolean;
  st: LayerStatus | undefined;
  setLayer: (id: LayerId, on: boolean) => void;
}) {
  const toggle = (checked: boolean) => setLayer(l.id, checked);
  return (
    <li className="flex min-h-[48px] flex-col justify-center px-3 py-2 md:min-h-0">
      <div className="flex items-center gap-2">
        <span className="hud-dot shrink-0" style={{ color: l.color, opacity: on ? 1 : 0.35 }} />
        <button
          type="button"
          onClick={() => setLayer(l.id, !on)}
          className="hud-display min-w-0 flex-1 text-left text-[14px] font-semibold tracking-wider md:text-[13px]"
          style={{ color: on ? l.color : "var(--muted-foreground)" }}
          title={l.description}
        >
          {l.label}
        </button>
        {l.simulated && (
          <span className="shrink-0 rounded border border-warn/50 px-1 text-[8px] tracking-widest text-warn">
            SIMULATED
          </span>
        )}
        {l.estimate && (
          <span className="shrink-0 rounded border border-warn/50 px-1 text-[8px] tracking-widest text-warn" title={l.estimate}>
            ESTIMATE
          </span>
        )}
        <span className="min-w-[44px] shrink-0 text-right text-[13px] tabular-nums text-foreground/90 md:text-[12px]">
          {on && st ? st.count.toLocaleString() : "—"}
        </span>
        {/* Mobile gets the full-size switch; desktop keeps the compact one. */}
        <Switch
          size="default"
          checked={on}
          onCheckedChange={toggle}
          aria-label={`Toggle ${l.label}`}
          className="shrink-0 md:hidden"
        />
        <Switch
          size="sm"
          checked={on}
          onCheckedChange={toggle}
          aria-label={`Toggle ${l.label}`}
          className="hidden shrink-0 md:block"
        />
      </div>
      {on && (
        <div className="mt-1 flex items-center justify-between gap-2 pl-4 text-[10px] text-muted-foreground md:text-[9px]">
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
}

export default function LayerPanel() {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const setLayer = useGlobe((s) => s.setLayer);
  const [, tick] = useState(0);
  // Mobile only: the panel starts collapsed to its header bar.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const onCount = Object.values(layers).filter(Boolean).length;
  const row = (l: LayerDefinition) => (
    <LayerRow key={l.id} l={l} on={!!layers[l.id]} st={status[l.id]} setLayer={setLayer} />
  );
  const groups = [
    {
      key: "live",
      label: "Live",
      layers: LAYERS.filter((l) => layers[l.id] && !l.simulated && !l.estimate),
    },
    {
      key: "sim",
      label: "Simulated",
      layers: LAYERS.filter((l) => layers[l.id] && (!!l.simulated || !!l.estimate)),
    },
    { key: "off", label: "Off", layers: LAYERS.filter((l) => !layers[l.id]) },
  ];

  return (
    <aside className="pointer-events-auto absolute left-3 top-[76px] z-30 w-[268px] max-w-[calc(100vw-24px)]">
      <div className="hud-panel">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between border-b border-border px-3 py-2.5 text-left md:pointer-events-none md:py-2"
        >
          <span className="hud-label">Signal layers</span>
          <span className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground md:text-[9px]">
              {onCount}/{LAYERS.length} ON
            </span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform md:hidden ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
        {/* Desktop: the original flat list, always open. */}
        <ul className="hidden divide-y divide-border/60 md:block">{LAYERS.map(row)}</ul>
        {/* Mobile: grouped list, collapsed to the header bar by default. */}
        <div className={`max-h-[62vh] overflow-y-auto md:hidden ${expanded ? "" : "hidden"}`}>
          {groups.map(
            (g) =>
              g.layers.length > 0 && (
                <div key={g.key}>
                  <div className="border-b border-border/50 bg-background/70 px-3 pb-1 pt-2.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {g.label}
                  </div>
                  <ul className="divide-y divide-border/60">{g.layers.map(row)}</ul>
                </div>
              ),
          )}
        </div>
      </div>
    </aside>
  );
}
