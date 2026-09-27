"use client";
// Controls under a picture layer's row in the layer panel: its opacity, the
// sea level rise scenario, and the class legend the publisher's own service
// lists (WHP, NLCD, NOAA's sea level rise), so a colour on the globe can be
// read without leaving the panel.

import { useSettings } from "@/lib/store/settings";
import type { LayerId } from "@/lib/layers/types";
import { NLCD_CLASSES, SLR_LEGEND, WHP_CLASSES } from "@/lib/terrain/classes";
import { SLR_DEFAULT_FT, SLR_FEET, isSlrFeet } from "@/lib/terrain/products";

/** Layers that draw a tiled picture (their own, or the FEMA map under flood zones). */
export const PICTURE_LAYERS = new Set<LayerId>(["relief", "slope", "contours", "soils", "firehazard", "landcover", "sealevel", "flood", "geology"]);

const DEFAULT_ALPHA: Partial<Record<LayerId, number>> = {
  relief: 0.55,
  slope: 0.6,
  contours: 0.9,
  soils: 0.9,
  firehazard: 0.65,
  landcover: 0.7,
  sealevel: 0.75,
  flood: 0.8,
  geology: 0.55,
};

function Swatches({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
      {items.map((c) => (
        <li key={c.label} className="flex items-center gap-1 text-[9px] text-muted-foreground" title={c.label}>
          <span className="inline-block size-2 shrink-0 border border-black/40" style={{ background: c.color }} aria-hidden />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function TileControls({ id }: { id: LayerId }) {
  const alpha = useSettings((s) => s.prefs.tileAlpha?.[id]);
  const ft = useSettings((s) => s.prefs.seaLevelFt);
  const setPref = useSettings((s) => s.setPref);
  if (!PICTURE_LAYERS.has(id)) return null;
  const value = alpha ?? DEFAULT_ALPHA[id] ?? 0.8;
  const setAlpha = (v: number) => {
    const cur = useSettings.getState().prefs.tileAlpha ?? {};
    setPref("tileAlpha", { ...cur, [id]: v });
  };
  return (
    <div className="mt-1.5 space-y-1 pl-4 text-[10px] text-muted-foreground md:text-[9px]">
      <label className="flex items-center gap-2">
        <span className="w-14 shrink-0 uppercase tracking-widest">{id === "flood" ? "FEMA map" : "Opacity"}</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => setAlpha(Number(e.target.value))}
          className="h-3 min-w-0 flex-1 accent-[var(--primary)]"
          aria-label={`${id} picture opacity`}
        />
        <span className="w-8 shrink-0 text-right tabular-nums text-foreground/80">{Math.round(value * 100)}%</span>
      </label>
      {id === "sealevel" && (
        <label className="flex items-center gap-2">
          <span className="w-14 shrink-0 uppercase tracking-widest">Scenario</span>
          <select
            value={isSlrFeet(ft) ? ft : SLR_DEFAULT_FT}
            onChange={(e) => setPref("seaLevelFt", Number(e.target.value))}
            className="min-w-0 flex-1 border border-border bg-transparent px-1 py-0.5 text-foreground"
            aria-label="Sea level rise scenario, feet above MHHW"
          >
            {SLR_FEET.map((f) => (
              <option key={f} value={f} className="bg-background">
                {f} ft above MHHW
              </option>
            ))}
          </select>
        </label>
      )}
      {id === "firehazard" && <Swatches items={WHP_CLASSES} />}
      {id === "sealevel" && <Swatches items={SLR_LEGEND} />}
      {id === "landcover" && <Swatches items={NLCD_CLASSES.filter((c) => !/AK only/.test(c.label))} />}
      {id === "slope" && <div>USGS&apos;s colours: yellow to red is steeper; click the ground for the slope in degrees.</div>}
      {id === "soils" && <div>Map units outlined with their symbols; click the ground for the soil.</div>}
    </div>
  );
}
