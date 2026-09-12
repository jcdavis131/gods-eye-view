"use client";
// What this is, what it is not, and where every signal comes from.

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LAYERS } from "@/lib/layers";

export default function AboutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-primary"
        title="About, data sources and rules"
      >
        <Info className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hud-panel max-h-[88vh] w-[min(640px,calc(100vw-24px))] overflow-y-auto rounded-none p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="hud-display text-lg text-primary">Embedding Atlas</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              A spy satellite simulator in your browser, except the data is real. Open source, MIT.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4 text-[11px] leading-relaxed">
            <section>
              <div className="hud-label mb-1">Rules of engagement</div>
              <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                <li>Only public infrastructure and public events: aircraft, ships, satellites, earthquakes, open-data cameras, rocket launches, the water systems communities depend on (rivers, lakes, reservoirs, aquifers, drought), and the economy in aggregate: harbours and border crossings, jobs and wages by county, home values and rents by county.</li>
                <li>No face recognition, no person tracking, no search for named individuals. Nothing here identifies a human being.</li>
                <li>Camera positions are operator-published and coarse; no camera orientation is ever drawn because none is published.</li>
                <li>The traffic layer is a labelled simulation on real roads. The turbidity layer is a labelled estimate: Dogliotti (2015) physics run in your browser on real Sentinel-2 pixels, the teacher that TurbidityVision distils, not the distilled model and not a measurement. Every other layer is a live public feed; nothing is invented.</li>
                <li>Water-quality screens compare a gauge&apos;s latest reading with cited EPA freshwater thresholds and print the formula; the community water report prints its weights and the terms it lacked. None of it is advice on whether water is safe to drink.</li>
                <li>Home values, rents, jobs and wages are county, metro and state aggregates from Zillow Research and the BLS. No parcels, no addresses, no owners, no listings; the Home values layer is labelled ESTIMATE because Zillow&apos;s indexes are models of a typical home, and the mortgage-against-wages line prints its formula. None of it is investment or lending advice.</li>
                <li>API keys you enter stay in this browser and only reach this app&apos;s own /api routes or the vendor SDK they belong to.</li>
              </ul>
            </section>
            <section>
              <div className="hud-label mb-1">Signal sources</div>
              <ul className="space-y-1">
                {LAYERS.map((l) => (
                  <li key={l.id} className="flex gap-2">
                    <span className="hud-dot mt-1.5 shrink-0" style={{ color: l.color }} />
                    <span>
                      <span className="hud-display text-[12px]" style={{ color: l.color }}>
                        {l.label}
                      </span>
                      {l.simulated && <span className="ml-2 text-[9px] tracking-widest text-warn">SIMULATED</span>}
                      {l.estimate && <span className="ml-2 text-[9px] tracking-widest text-warn">ESTIMATE</span>}
                      <span className="text-muted-foreground"> · {l.attribution}</span>
                      <div className="text-foreground/75">{l.description}</div>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <div className="hud-label mb-1">Globe</div>
              <p className="text-foreground/80">
                CesiumJS with Esri World Imagery and NASA Black Marble night lights, no account required. Add a Google Maps
                key for Photorealistic 3D Tiles or a Cesium ion token for world terrain in Settings.
              </p>
            </section>
            <section>
              <div className="hud-label mb-1">Keyboard</div>
              <p className="text-muted-foreground">
                <span className="hud-kbd">⌘K</span> search · <span className="hud-kbd">,</span> settings ·{" "}
                <span className="hud-kbd">Esc</span> deselect · drag to orbit · scroll to zoom · middle-drag to tilt
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
