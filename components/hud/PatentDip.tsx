"use client";
// Patent-motion layer transition: when any layer toggles, the globe viewport
// performs the plate dip — a 2s vertical drift (up 10px and back) with the
// patent ease, masking the Cesium renderer's hard show/hide cut underneath.
// The animation class is re-triggered via reflow (no remount: Cesium must
// never unmount). prefers-reduced-motion disables the dip in CSS.

import { useEffect, useRef } from "react";
import { useGlobe } from "@/lib/store/globe";

export default function PatentDip({ children }: { children: React.ReactNode }) {
  const layers = useGlobe((s) => s.layers);
  const wrapRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // initial defaults: no dip on first paint
    }
    const el = wrapRef.current;
    if (!el) return;
    el.classList.remove("patent-dip");
    void el.offsetWidth; // reflow restarts the keyframe animation
    el.classList.add("patent-dip");
  }, [layers]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {children}
    </div>
  );
}
