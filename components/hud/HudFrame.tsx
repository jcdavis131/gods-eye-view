"use client";
// Non-interactive HUD chrome: scanlines, vignette, corner brackets, reticle.

import { useSettings } from "@/lib/store/settings";
import { useGlobe } from "@/lib/store/globe";

export default function HudFrame() {
  const scanlines = useSettings((s) => s.prefs.scanlines);
  const following = useGlobe((s) => s.following);
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {scanlines && <div className="scanlines absolute inset-0" />}
      <div className="vignette absolute inset-0" />
      {/* corner brackets */}
      <div className="hud-corner left-3 top-3 border-l border-t" />
      <div className="hud-corner right-3 top-3 border-r border-t" />
      <div className="hud-corner bottom-3 left-3 border-b border-l" />
      <div className="hud-corner bottom-3 right-3 border-b border-r" />
      {/* reticle */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`reticle ${following ? "reticle-lock" : ""}`}>
          <span className="reticle-tick reticle-n" />
          <span className="reticle-tick reticle-s" />
          <span className="reticle-tick reticle-e" />
          <span className="reticle-tick reticle-w" />
        </div>
      </div>
    </div>
  );
}
