"use client";
// The Area panel: the Measure tool's drawn area as an area of interest.
//   Inside   what the loaded layers hold inside it, by layer, with GeoJSON and CSV
//   Watch    what arrives in it and what leaves, among the layers that come and go
//   Report   the land report, every figure with its arithmetic
// Nothing here fetches: it reads what the globe already holds, so it is only as
// complete as the layers that are on (the panel says which are missing).

import { useEffect, useMemo, useState } from "react";
import { Binoculars, ClipboardCopy, Download, FileText, Link2, ScanSearch, X } from "lucide-react";
import { useGlobe } from "@/lib/store/globe";
import { useArea, areaRing, answeringLayers, areaInView } from "@/lib/aoi/store";
import { featuresInside, insideCsv, insideGeoJson, watchCsv, watchStep, WATCH_LAYERS, type InsideGroup } from "@/lib/aoi/area";
import { areaReport, reportText, type AreaReport } from "@/lib/aoi/report";
import { measureShape, fmtArea } from "@/lib/globe/measure";
import { allFeatures } from "@/lib/globe/registry";
import { flyToSelection } from "@/lib/globe/camera";
import { copyShareLink } from "@/lib/globe/share";
import { downloadText } from "@/lib/explore/export";
import { LAYER_BY_ID } from "@/lib/layers";
import type { LayerId } from "@/lib/layers/types";

const ACCENT = "#7DD3FC";
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const labels = Object.fromEntries(Object.values(LAYER_BY_ID).map((l) => [l!.id, l!.label])) as Partial<Record<LayerId, string>>;

function Tab({ id, label }: { id: "inside" | "watch" | "report"; label: string }) {
  const tab = useArea((s) => s.tab);
  const setTab = useArea((s) => s.setTab);
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`flex-1 border px-2 py-1 text-[10px] uppercase tracking-widest ${tab === id ? "border-[#7DD3FC]/70 bg-[#7DD3FC]/10 text-[#7DD3FC]" : "border-border text-foreground/75 hover:bg-accent hover:text-primary"}`}
    >
      {label}
    </button>
  );
}

function Inside({ groups }: { groups: InsideGroup[] }) {
  const [openLayer, setOpenLayer] = useState<LayerId | null>(null);
  const total = groups.reduce((s, g) => s + g.features.length, 0);
  if (!groups.length) return <div className="px-3 py-2 text-[11px] text-muted-foreground">Nothing loaded inside the area. Switch layers on, or move the camera over it so they load it.</div>;
  return (
    <div className="px-3 py-2">
      <div className="text-[11px] text-foreground">
        {total.toLocaleString("en-US")} loaded feature{total === 1 ? "" : "s"} touch the area
      </div>
      <ul className="mt-1 space-y-0.5">
        {groups.map((g) => (
          <li key={g.layer}>
            <button
              type="button"
              onClick={() => setOpenLayer(openLayer === g.layer ? null : g.layer)}
              className="flex w-full items-center justify-between gap-2 text-left text-[11px] text-foreground/85 hover:text-primary"
              aria-expanded={openLayer === g.layer}
            >
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-1.5 rounded-full" style={{ background: LAYER_BY_ID[g.layer]?.color }} aria-hidden />
                {labels[g.layer] ?? g.layer}
              </span>
              <span className="tabular-nums text-muted-foreground">{g.features.length.toLocaleString("en-US")}</span>
            </button>
            {openLayer === g.layer && (
              <ul className="mb-1 ml-3 mt-0.5 max-h-40 space-y-0.5 overflow-y-auto border-l border-border/60 pl-2">
                {g.features.slice(0, 50).map((f) => (
                  <li key={f.properties.id}>
                    <button
                      type="button"
                      onClick={() => {
                        useGlobe.getState().select({ layer: g.layer, id: f.properties.id }, f);
                        flyToSelection({ layer: g.layer, id: f.properties.id });
                      }}
                      className="w-full truncate text-left text-[10px] text-foreground/75 hover:text-primary"
                      title={f.properties.name}
                    >
                      {f.properties.name}
                    </button>
                  </li>
                ))}
                {g.features.length > 50 && <li className="text-[9px] text-muted-foreground">+ {g.features.length - 50} more in the export</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Watch({ inView }: { inView: boolean }) {
  const watching = useArea((s) => s.watching);
  const since = useArea((s) => s.watchSince);
  const log = useArea((s) => s.watch.log);
  useArea((s) => s.tick);
  const start = useArea((s) => s.startWatch);
  const stop = useArea((s) => s.stopWatch);
  const on = useGlobe((s) => s.layers);
  const watched = [...WATCH_LAYERS].filter((l) => on[l]);
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (watching ? stop() : start())}
          className="flex items-center gap-1.5 border border-[#7DD3FC]/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#7DD3FC] hover:bg-[#7DD3FC]/10"
        >
          <Binoculars className="size-3" />
          {watching ? "Stop watching" : "Watch this area"}
        </button>
        {log.length > 0 && (
          <button type="button" onClick={() => downloadText(`area-watch-${stamp()}.csv`, watchCsv(log), "text/csv")} className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary">
            <Download className="size-3" /> CSV
          </button>
        )}
      </div>
      <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
        Reports what arrives and what leaves among {watched.length ? watched.map((l) => labels[l] ?? l).join(", ") : "the layers that come and go (switch on aircraft, ships, earthquakes, fires or alerts)"}. The first pass sets the baseline silently; a layer switched off is not counted as leaving.
        {watching && !inView && <span className="block text-warn">Paused: bring the area into view, since the layers only load what is near the camera.</span>}
        {watching && since && <span className="block">Watching since {new Date(since).toLocaleTimeString()}.</span>}
      </div>
      {log.length > 0 && (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
          {log.map((e, i) => (
            <li key={`${e.at}:${e.layer}:${e.id}:${i}`} className="flex items-baseline gap-1.5 text-[10px]">
              <span className="shrink-0 tabular-nums text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              <span className={`shrink-0 uppercase tracking-widest ${e.kind === "arrived" ? "text-[#7DD3FC]" : "text-muted-foreground"}`}>{e.kind === "arrived" ? "in" : "out"}</span>
              <button type="button" onClick={() => flyToSelection({ layer: e.layer, id: e.id })} className="truncate text-left text-foreground/80 hover:text-primary" title={`${labels[e.layer] ?? e.layer}: ${e.name}`}>
                {e.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Report({ report, onBuild, where }: { report: AreaReport | null; onBuild: () => void; where: string }) {
  if (!report)
    return (
      <div className="px-3 py-2">
        <button type="button" onClick={onBuild} className="flex items-center gap-1.5 border border-[#7DD3FC]/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#7DD3FC] hover:bg-[#7DD3FC]/10">
          <FileText className="size-3" /> Build the land report
        </button>
        <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
          From the layers that are on: flood zones, wetlands and public lands as shares of the area (sampled on a grid), line lengths inside it, and counts of points, each with its arithmetic.
        </div>
      </div>
    );
  return (
    <div className="px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <button type="button" onClick={onBuild} className="text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary">Rebuild</button>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(reportText(report, where))} className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary">
          <ClipboardCopy className="size-3" /> Copy as text
        </button>
        <button type="button" onClick={() => downloadText(`land-report-${stamp()}.json`, JSON.stringify({ where, ...report }, null, 2), "application/json")} className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary">
          <Download className="size-3" /> JSON
        </button>
      </div>
      <div className="text-[9px] text-muted-foreground">
        {report.samples.toLocaleString("en-US")} samples on a {Math.round(report.spacingM)} m grid
      </div>
      {report.sections.map((s) => (
        <section key={s.title} className="mt-1.5">
          <div className="hud-label">{s.title}</div>
          <div className="text-[9px] text-muted-foreground">{s.source}</div>
          <ul className="space-y-0.5">
            {s.lines.map((l) => (
              <li key={`${s.title}:${l.label}`} className="text-[10px] leading-snug">
                <span className="text-foreground/85">{l.label}</span>: <span className="tabular-nums text-foreground">{l.value}</span>
                {l.formula && <div className="text-[9px] text-muted-foreground">{l.formula}</div>}
              </li>
            ))}
          </ul>
          {s.notes?.map((n) => (
            <div key={n} className="text-[9px] leading-snug text-muted-foreground/80">
              {n}
            </div>
          ))}
        </section>
      ))}
      {report.missing.length > 0 && (
        <section className="mt-1.5">
          <div className="hud-label">Not included</div>
          <ul>
            {report.missing.map((m) => (
              <li key={m} className="text-[9px] leading-snug text-muted-foreground">
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function AreaPanel() {
  const open = useArea((s) => s.open);
  const setOpen = useArea((s) => s.setOpen);
  const tab = useArea((s) => s.tab);
  const watching = useArea((s) => s.watching);
  const shape = useGlobe((s) => s.measure.shape);
  const view = useGlobe((s) => s.view);
  const ring = useMemo(() => areaRing(shape), [shape]);
  const [groups, setGroups] = useState<InsideGroup[]>([]);
  // The report is kept with the ring it was built for, so a redrawn area never shows an old one.
  const [built, setBuilt] = useState<{ ring: unknown; report: AreaReport } | null>(null);
  const report = built && built.ring === ring ? built.report : null;
  const inView = ring ? areaInView(ring, view) : false;

  // What is inside, refreshed as layers update.
  useEffect(() => {
    if (!open || !ring) return;
    const run = () => setGroups(featuresInside(allFeatures(), ring));
    run();
    const id = setInterval(run, 3000);
    return () => clearInterval(id);
  }, [open, ring]);

  // The watch: one step every 5 s while the area is in view.
  useEffect(() => {
    if (!open || !ring || !watching) return;
    const step = () => {
      const g = useGlobe.getState();
      if (!areaInView(ring, g.view)) return;
      const st = useArea.getState();
      watchStep(st.watch, allFeatures(), ring, answeringLayers(g.layers, g.status), Date.now());
      st.bump();
    };
    step();
    const id = setInterval(step, 5000);
    return () => clearInterval(id);
  }, [open, ring, watching]);

  if (!open || !ring || !shape) return null;
  const m = measureShape(shape);
  const centre = ring.reduce((a, [x, y]) => [a[0] + x / ring.length, a[1] + y / ring.length], [0, 0]);
  const where = `centre ${centre[1].toFixed(4)}, ${centre[0].toFixed(4)}; ${ring.length} corners`;

  const build = () => {
    const g = useGlobe.getState();
    setBuilt({ ring, report: areaReport({ ring, areaM2: m.areaM2 ?? 0, features: allFeatures(), answering: answeringLayers(g.layers, g.status), on: g.layers, labels }) });
  };

  return (
    <div className="hud-panel pointer-events-auto">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="hud-label" style={{ color: ACCENT }}>
            <ScanSearch className="mr-1 inline size-3" />
            Area
          </div>
          <div className="hud-display truncate text-[15px] font-semibold leading-tight text-foreground">{m.areaM2 != null ? fmtArea(m.areaM2) : "drawn area"}</div>
          <div className="text-[9px] text-muted-foreground">What the loaded layers hold inside the drawn area. Redraw it with Measure → Area.</div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button type="button" onClick={() => void copyShareLink()} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Copy a link to this area" title="Copy link (carries the area)">
            <Link2 className="size-3.5" />
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close the area panel">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex gap-1 px-3 pt-2">
        <Tab id="inside" label="Inside" />
        <Tab id="watch" label="Watch" />
        <Tab id="report" label="Report" />
      </div>
      {tab === "inside" && (
        <>
          <Inside groups={groups} />
          <div className="flex gap-2 px-3 pb-2">
            <button
              type="button"
              onClick={() => downloadText(`area-${stamp()}.geojson`, JSON.stringify(insideGeoJson(ring, groups), null, 1), "application/geo+json")}
              className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              <Download className="size-3" /> GeoJSON
            </button>
            <button type="button" onClick={() => downloadText(`area-${stamp()}.csv`, insideCsv(groups), "text/csv")} className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary">
              <Download className="size-3" /> CSV
            </button>
          </div>
        </>
      )}
      {tab === "watch" && <Watch inView={inView} />}
      {tab === "report" && <Report report={report} onBuild={build} where={where} />}
    </div>
  );
}
