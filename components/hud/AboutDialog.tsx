"use client";
// What this is, what it is not, and where every signal comes from.

import { useState } from "react";
import { Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LAYERS } from "@/lib/layers";

export default function AboutButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "flex w-full items-center gap-2.5 rounded px-3 py-2.5 text-left text-[13px] text-foreground/85 hover:bg-accent hover:text-primary"
            : "hud-btn"
        }
        title="About, data sources and rules"
        aria-label={compact ? undefined : "About, data sources and rules"}
      >
        <Info className={compact ? "size-4 shrink-0" : "size-3.5"} />
        {compact && "About & data sources"}
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
                <li>Public infrastructure, public land and public events: aircraft, ships, satellites, earthquakes, open-data cameras, rocket launches, the water systems communities depend on (rivers, lakes, reservoirs, aquifers, drought), the economy in aggregate (harbours and border crossings, jobs, wages, home values and rents by county), public companies, banks and federal award recipients as their regulators publish them, and hazards and land: wildfires, satellite fire hotspots, weather and disaster alerts, flood zones, wetlands (with the year of the imagery they were mapped from), public and protected lands with their owners, managers and easement holders.</li>
                <li>No face recognition, no person tracking, no search for named individuals, no licence plates, no phone signals. No code path identifies a person from a face, a track, a licence plate or a phone signal, and no search goes from a person&apos;s or company&apos;s name to what they own or operate.</li>
                <li>Parcels, addresses and ownership appear as each public source publishes them, with nothing added. Search looks only at names and published identifiers (callsign, registration, MMSI, NORAD id, fire id, ticker, place names), never at owner, operator, manager or easement-holder fields.</li>
                <li>Every severity is its publisher&apos;s own (NWS, GDACS, FIRMS confidence, WFIGS containment). Anything the source did not rate says &ldquo;not rated by source&rdquo; and is never drawn as calm. FEMA flood zones are a regulatory map, not a forecast. The hazard layers are not a warning service; follow official channels in an emergency.</li>
                <li>Camera positions are operator-published and coarse; no camera orientation is ever drawn because none is published.</li>
                <li>The traffic layer is a labelled simulation on real roads. The turbidity layer is a labelled estimate: Dogliotti (2015) physics run in your browser on real Sentinel-2 pixels, the teacher that TurbidityVision distils, not the distilled model and not a measurement. Every other layer relays a public feed or dataset as it was published; nothing is invented.</li>
                <li>The weather layer samples live current conditions on a coarse grid around your view (temperature colour, wind barbs) — it is a sampling of now, not a forecast and not global coverage. The sports layer plots games at their venues as geocoded from the stadium name; scores and statuses are the feed&apos;s as-reported, and venues still being located are counted, not placed.</li>
                <li>The satellites layer propagates public CelesTrak elements with SGP4. Pass predictions use the standard horizon-search approach (as in Gpredict and Look4Sat, whose design informed this implementation) and are approximate: they degrade as elements age, and they need an observer location you set yourself.</li>
                <li>Water-quality screens compare a gauge&apos;s latest reading with cited EPA freshwater thresholds and print the formula; the community water report prints its weights and the terms it lacked. None of it is advice on whether water is safe to drink.</li>
                <li>Home values, rents, jobs and wages are county, metro and state aggregates from Zillow Research and the BLS; the Home values layer is labelled ESTIMATE because Zillow&apos;s indexes are models of a typical home, and the mortgage-against-wages line prints its formula. None of it is investment or lending advice.</li>
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
                <span className="hud-kbd">Esc</span> leave a measure tool, then deselect · drag to orbit · scroll to zoom · middle-drag to tilt
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
