"use client";
// Community water report for the place under the camera. Every number on it
// comes from features the water layers currently hold; the stress estimate
// prints its own formula and inputs.

import { useEffect, useMemo, useState } from "react";
import { Droplets, RefreshCw, X } from "lucide-react";
import { useGlobe } from "@/lib/store/globe";
import { buildWaterReport, type ReportItem, type ReportSection, type WaterReport } from "@/lib/water/report";
import { getRenderer } from "@/lib/globe/registry";
import { flyToSelection } from "@/lib/globe/camera";
import { formatLatLon } from "@/lib/globe/geo";
import type { LayerId } from "@/lib/layers/types";

function useReport(open: boolean): { report: WaterReport | null; refresh: () => void } {
  const view = useGlobe((s) => s.view);
  const status = useGlobe((s) => s.status);
  const [nonce, setNonce] = useState(0);
  const [report, setReport] = useState<WaterReport | null>(null);
  const stamps = `${status.water?.fetchedAt ?? 0}|${status.groundwater?.fetchedAt ?? 0}|${status.turbidity?.fetchedAt ?? 0}`;
  const target = `${view.lon.toFixed(2)},${view.lat.toFixed(2)}`;
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      const v = useGlobe.getState().view;
      setReport(buildWaterReport(v.lon, v.lat));
    }, 600);
    return () => clearTimeout(id);
  }, [open, stamps, target, nonce]);
  return { report, refresh: () => setNonce((n) => n + 1) };
}

const FLAG: Record<NonNullable<ReportItem["flag"]>, string> = {
  ok: "text-primary",
  watch: "text-warn",
  poor: "text-alert",
};

function selectItem(item: ReportItem) {
  const r = getRenderer(item.layer as LayerId);
  const f = r?.getFeature(item.id);
  if (!f) return;
  const sel = { layer: item.layer as LayerId, id: item.id };
  useGlobe.getState().select(sel, f);
  flyToSelection(sel);
}

function Section({ s }: { s: ReportSection }) {
  return (
    <section className="border-t border-border/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="hud-label">{s.title}</span>
        <span className="text-[9px] text-muted-foreground">
          {s.radiusKm ? `≤ ${s.radiusKm} km · ` : ""}
          {s.loaded ? `${s.n}` : "off"}
        </span>
      </div>
      <p className={`mt-0.5 text-[11px] leading-snug ${s.loaded ? "text-foreground/90" : "text-muted-foreground"}`}>{s.summary}</p>
      {s.items.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {s.items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => selectItem(it)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 text-left text-[10px] leading-tight hover:bg-accent"
                title="Select on the globe"
              >
                <span className="truncate">
                  <span className={`${it.flag ? FLAG[it.flag] : "text-foreground/80"}`}>{it.name}</span>
                  <span className="text-muted-foreground"> · {it.value}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{it.distanceKm.toFixed(0)} km</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[9px] leading-snug text-muted-foreground/80">{s.basis}</p>
    </section>
  );
}

export default function WaterReportPanel() {
  const open = useGlobe((s) => s.waterReportOpen);
  const setOpen = useGlobe((s) => s.setWaterReportOpen);
  const { report, refresh } = useReport(open);
  const stressColor = useMemo(() => {
    const sc = report?.stress.score;
    if (sc == null) return "var(--muted-foreground)";
    if (sc < 0.25) return "var(--primary)";
    if (sc < 0.5) return "#79C7FF";
    if (sc < 0.75) return "var(--warn)";
    return "var(--alert)";
  }, [report]);
  if (!open) return null;

  return (
    <div className="hud-panel pointer-events-auto flex max-h-[min(62vh,720px)] flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="hud-label" style={{ color: "#3B9DFF" }}>
            <Droplets className="mr-1 inline size-3" />
            Community water report
          </div>
          <div className="hud-display truncate text-[15px] font-semibold leading-tight text-foreground">
            {report ? formatLatLon(report.lat, report.lon) : "reading layers…"}
          </div>
          <div className="text-[9px] text-muted-foreground">
            around the camera target · estimates with the arithmetic shown
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={refresh}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Recompute"
            title="Recompute for the current view"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {report && (
        <div className="min-h-0 overflow-y-auto">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 px-3 py-2">
            <div className="hud-display text-[30px] font-semibold leading-none tabular-nums" style={{ color: stressColor }}>
              {report.stress.score == null ? "—" : `${Math.round(report.stress.score * 100)}`}
              {report.stress.score != null && <span className="text-[12px]">%</span>}
            </div>
            <div className="min-w-0">
              <div className="hud-label">Supply stress (estimate)</div>
              <div className="text-[12px] capitalize" style={{ color: stressColor }}>
                {report.stress.label}
              </div>
              <div className="truncate text-[9px] text-muted-foreground" title={report.stress.formula}>
                {report.stress.formula}
              </div>
            </div>
          </div>
          {report.stress.terms.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-3 px-3 pb-2 text-[9px] text-muted-foreground">
              {report.stress.terms.map((t) => (
                <li key={t.name} className="flex justify-between gap-2 tabular-nums">
                  <span>
                    {t.name} <span className="opacity-60">w {t.weight}</span>
                  </span>
                  <span title={t.input}>{t.value.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <Section s={report.drought} />
          <Section s={report.reservoirs} />
          <Section s={report.gauges} />
          <Section s={report.wells} />
          <Section s={report.turbidity} />
          <div className="border-t border-border/60 px-3 py-2 text-[9px] leading-snug text-warn/90">
            {report.caveats.map((c) => (
              <p key={c}>· {c}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
