"use client";
// Cinematic camera moves used by the UI, search and voice commands.

import { getCesium, getViewer } from "./cesium";
import { getRenderer } from "./registry";
import { FOLLOW_RANGE } from "./styles";
import { useGlobe, type Selection } from "@/lib/store/globe";

export interface FlyOptions {
  height?: number;
  pitchDeg?: number;
  headingDeg?: number;
  durationS?: number;
}

/** Fly to a lon/lat with a cinematic tilted approach. */
export function flyTo(lon: number, lat: number, opts: FlyOptions = {}) {
  const viewer = getViewer();
  if (!viewer) return;
  const C = getCesium();
  stopFollowing();
  const height = opts.height ?? 120_000;
  const pitch = C.Math.toRadians(opts.pitchDeg ?? -55);
  const heading = C.Math.toRadians(opts.headingDeg ?? 0);
  // Approach from the south so the tilt reveals the target.
  const offsetLat = lat - (height / 6_371_000) * (180 / Math.PI) * Math.cos(-pitch) * 0.9;
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(lon, Math.max(-89, offsetLat), height),
    orientation: { heading, pitch, roll: 0 },
    duration: opts.durationS ?? 3.2,
    easingFunction: C.EasingFunction.QUADRATIC_IN_OUT,
  });
}

/** Fly to a feature by selection, then optionally follow it. */
export function flyToSelection(sel: Selection, follow = false) {
  const viewer = getViewer();
  if (!viewer) return false;
  const C = getCesium();
  const r = getRenderer(sel.layer);
  const pos = r?.getPosition(sel.id);
  const feature = r?.getFeature(sel.id);
  if (!pos || !feature) return false;
  useGlobe.getState().select(sel, feature);
  const range = FOLLOW_RANGE[sel.layer];
  const carto = C.Cartographic.fromCartesian(pos);
  if (follow) {
    startFollowing();
    return true;
  }
  stopFollowing();
  viewer.camera.flyToBoundingSphere(new C.BoundingSphere(pos, range / 4), {
    duration: 2.4,
    offset: new C.HeadingPitchRange(0, C.Math.toRadians(-45), range),
  });
  void carto;
  return true;
}

let followState: { key: string } | null = null;

export function startFollowing() {
  const viewer = getViewer();
  const { selected } = useGlobe.getState();
  if (!viewer || !selected) return;
  const C = getCesium();
  const r = getRenderer(selected.layer);
  const pos = r?.getPosition(selected.id);
  if (!pos) return;
  const range = FOLLOW_RANGE[selected.layer];
  viewer.camera.lookAt(pos, new C.HeadingPitchRange(viewer.camera.heading, C.Math.toRadians(-40), range));
  followState = { key: `${selected.layer}:${selected.id}` };
  useGlobe.getState().setFollowing(true);
}

export function stopFollowing() {
  const viewer = getViewer();
  if (viewer) {
    const C = getCesium();
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }
  followState = null;
  if (useGlobe.getState().following) useGlobe.getState().setFollowing(false);
}

/** Per-frame follow update. Keeps the operator's orbit offset while the target moves. */
export function followTick() {
  const viewer = getViewer();
  const { following, selected } = useGlobe.getState();
  if (!viewer || !following || !selected) {
    if (followState) stopFollowing();
    return;
  }
  const key = `${selected.layer}:${selected.id}`;
  if (!followState || followState.key !== key) {
    startFollowing();
    return;
  }
  const C = getCesium();
  const pos = getRenderer(selected.layer)?.getPosition(selected.id);
  if (!pos) return;
  viewer.camera.lookAtTransform(C.Transforms.eastNorthUpToFixedFrame(pos));
}

/** Slow orbital drift for the idle cinematic mode. */
export function cinematicTick(dtSeconds: number) {
  const viewer = getViewer();
  if (!viewer) return;
  const C = getCesium();
  const h = viewer.camera.positionCartographic.height;
  if (h < 1_500_000) return;
  viewer.camera.rotate(C.Cartesian3.UNIT_Z, -0.012 * dtSeconds);
}

export function homeView(durationS = 4) {
  const viewer = getViewer();
  if (!viewer) return;
  const C = getCesium();
  stopFollowing();
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(-97.7, 18, 14_000_000),
    orientation: { heading: 0, pitch: C.Math.toRadians(-88), roll: 0 },
    duration: durationS,
  });
}
