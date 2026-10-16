"use client";
// Patent-motion globe plate: thin ink frame with FIG. corner labels and a
// live fact caption. Dark-variant grammar: cream linework on the ink ground.
// Pointer-events-none; purely presentational. The caption shows the hovered
// legend row's live fact, falling back to the layers-live summary (real data).

import { useGlobe } from "@/lib/store/globe";
import { LAYERS } from "@/lib/layers";
import { timeAgo } from "@/lib/globe/geo";

function fallbackCaption(layers: Record<string, boolean>, status: ReturnType<typeof useGlobe.getState>["status"]): string {
  const on = LAYERS.filter((l) => layers[l.id]);
  let latest = 0;
  for (const l of on) {
    const f = status[l.id]?.fetchedAt ?? 0;
    if (f > latest) latest = f;
  }
  const ago = latest > 0 ? timeAgo(latest) : "—";
  return `${on.length} LAYERS LIVE · SYNCED ${ago}`;
}

export default function PatentFrame() {
  const layers = useGlobe((s) => s.layers);
  const status = useGlobe((s) => s.status);
  const captionFact = useGlobe((s) => s.captionFact);
  const embed = useGlobe((s) => s.embed);
  if (embed) return null;
  const caption = captionFact ?? fallbackCaption(layers, status);
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {/* thin patent plate, just inside the HUD corner brackets */}
      <div className="patent-plate absolute inset-[10px]" />
      {/* corner labels on the plate edges */}
      <div className="patent-corner absolute left-[18px] top-[14px]">
        <span className="patent-fig">FIG. 1</span>
      </div>
      <div className="patent-corner absolute right-[18px] top-[14px]">LIVE EARTH SYSTEM</div>
      <div className="patent-corner absolute bottom-[14px] left-[18px]">EMBEDDING ATLAS</div>
      <div className="patent-caption absolute bottom-[14px] right-[18px]">{caption}</div>
    </div>
  );
}
