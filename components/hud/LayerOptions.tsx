"use client";
// Controls under a data layer's row (not a picture's opacity, which is
// TileControls): the National Risk Index hazard picker and its legend.

import type { LayerId } from "@/lib/layers/types";
import { useSettings } from "@/lib/store/settings";
import { NRI_CLASSES, NRI_COLORS, NRI_HAZARDS, NRI_HAZARD_CODES, NRI_NO_RATING_EDGE, parseNriPick } from "@/lib/hazards/nri";

/** Layers with controls here. */
export const OPTION_LAYERS = new Set<LayerId>(["riskindex"]);

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

export default function LayerOptions({ id }: { id: LayerId }) {
  if (!OPTION_LAYERS.has(id)) return null;
  return <div className="mt-1.5 space-y-1 pl-4 text-[10px] text-muted-foreground md:text-[9px]">{id === "riskindex" && <RiskPicker />}</div>;
}
