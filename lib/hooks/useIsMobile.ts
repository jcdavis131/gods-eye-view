"use client";
// Phone-sized viewport detection for the HUD layout switch. The server and the
// first client render both report "not mobile" so hydration matches; the real
// value arrives on the first effect and the layout re-renders once.

import { useSyncExternalStore } from "react";

/** Phones: below Tailwind `md`, or a short landscape viewport where pinned panels cannot fit. */
export const MOBILE_QUERY = "(max-width: 767px), (max-height: 480px)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
