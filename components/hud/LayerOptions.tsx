"use client";
// Controls under a data layer's row (not a picture's opacity, which is
// TileControls): the National Risk Index hazard picker and its legend, and
// the "Landmarks only" chip on Historic places.

import type { LayerId } from "@/lib/layers/types";
import { useSettings } from "@/lib/store/settings";
import { NRI_CLASSES, NRI_COLORS, NRI_HAZARDS, NRI_HAZARD_CODES, NRI_NO_RATING_EDGE, parseNriPick } from "@/lib/hazards/nri";
import { isPlacesMeasure, PLACES_BIN_COLORS, PLACES_DEFAULT_MEASURE, PLACES_MEASURES, SOCIAL_NEEDS, type PlacesMeasure } from "@/lib/civic/places";

/** Layers with controls here. */
export const OPTION_LAYERS = new Set<LayerId>(["riskindex", "historic", "health"]);

function RiskPicker() {
  const pick = parseNriPick(useSettings((s) => s.prefs.nriHazard));
  const setPref = useSettings((s) => s.setPref);
  return (
    <>
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 uppercase tracking-widest">Hazard</span>
        <select
          value={pick}
          onChange={(e) => setPref("nriHazard", e.target.value)}
          className="min-w-0 flex-1 border border-border bg-transparent px-1 py-0.5 text-foreground"
          aria-label="National Risk Index: composite or one hazard"
        >
          <option value="composite" className="bg-background">
            Composite (all 18 hazards)
          </option>
          {[...NRI_HAZARD_CODES].sort((a, b) => NRI_HAZARDS[a].localeCompare(NRI_HAZARDS[b])).map((h) => (
            <option key={h} value={h} className="bg-background">
              {NRI_HAZARDS[h]}
            </option>
          ))}
        </select>
      </label>
      <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {NRI_CLASSES.map((c) => (
          <li key={c} className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="inline-block size-2 shrink-0 border border-black/40" style={{ background: NRI_COLORS[c] }} aria-hidden />
            {c}
          </li>
        ))}
        <li className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="inline-block size-2 shrink-0 border border-dashed" style={{ borderColor: NRI_NO_RATING_EDGE }} aria-hidden />
          no rating or not in the index (never low)
        </li>
      </ul>
      <div>FEMA&apos;s rating words: a percentile among all US counties (or tracts), not a likelihood. Click a county for the 18 hazards, expected annual loss, social vulnerability as published in the index and resilience.</div>
    </>
  );
}

function LandmarksChip() {
  const on = useSettings((s) => s.prefs.nhlOnly);
  const setPref = useSettings((s) => s.setPref);
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setPref("nhlOnly", !on)}
        className={`border px-2 py-0.5 text-[10px] uppercase tracking-widest ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-foreground/80 hover:bg-accent"}`}
      >
        Landmarks only
      </button>
      <div>National Historic Landmarks as NPS flags them (Is_NHL), with the same exclusions: listed only, no restricted addresses.</div>
    </>
  );
}

function MeasurePicker() {
  const raw = useSettings((s) => s.prefs.placesMeasure);
  const setPref = useSettings((s) => s.setPref);
  const pick: PlacesMeasure = isPlacesMeasure(raw) ? raw : PLACES_DEFAULT_MEASURE;
  const entries = Object.entries(PLACES_MEASURES) as Array<[PlacesMeasure, (typeof PLACES_MEASURES)[PlacesMeasure]]>;
  const cats = [...new Set(entries.map(([, m]) => m.category))];
  return (
    <>
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 uppercase tracking-widest">Measure</span>
        <select
          value={pick}
          onChange={(e) => setPref("placesMeasure", e.target.value)}
          className="min-w-0 flex-1 border border-border bg-transparent px-1 py-0.5 text-foreground"
          aria-label="CDC PLACES measure"
        >
          {cats.map((c) => (
            <optgroup key={c} label={c}>
              {entries
                .filter(([, m]) => m.category === c)
                .map(([id, m]) => (
                  <option key={id} value={id} className="bg-background">
                    {m.short} ({m.year}){SOCIAL_NEEDS.includes(id) ? ", optional module: not every state" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {PLACES_BIN_COLORS.map((c, i) => (
          <li key={c} className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="inline-block size-2 shrink-0 border border-black/40" style={{ background: c }} aria-hidden />
            quintile {i + 1}
          </li>
        ))}
        <li className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="inline-block size-2 shrink-0 border border-dashed" style={{ borderColor: NRI_NO_RATING_EDGE }} aria-hidden />
          not published
        </li>
      </ul>
      <div>{PLACES_MEASURES[pick].name}. Counties: age-adjusted, national quintiles; tracts below 100 km: crude, quintiles of the tracts in view. Model-based estimates, not counts.</div>
    </>
  );
}

export default function LayerOptions({ id }: { id: LayerId }) {
  if (!OPTION_LAYERS.has(id)) return null;
  return <div className="mt-1.5 space-y-1 pl-4 text-[10px] text-muted-foreground md:text-[9px]">{id === "riskindex" && <RiskPicker />}{id === "historic" && <LandmarksChip />}{id === "health" && <MeasurePicker />}</div>;
}
