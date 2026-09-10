"use client";
// The globe itself. Creates the Cesium viewer with a keyless imagery stack,
// wires picking / hover / follow / cinematic drift, mirrors camera and clock
// state into the store, and reacts to operator preferences.

import { useEffect, useRef } from "react";
import type * as CesiumNS from "cesium";
import { loadCesium, setViewer } from "@/lib/globe/cesium";
import { addBaseImagery, addNightLights, setGoogleTiles, setTerrain } from "@/lib/globe/imagery";
import { allRenderers, getRenderer } from "@/lib/globe/registry";
import type { PickId } from "@/lib/globe/renderer";
import { cinematicTick, followTick } from "@/lib/globe/camera";
import { useGlobe } from "@/lib/store/globe";
import { useSettings } from "@/lib/store/settings";
import type { ViewState } from "@/lib/layers/types";

function isPickId(v: unknown): v is PickId {
  return !!v && typeof v === "object" && "layer" in v && "id" in v;
}

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let viewer: CesiumNS.Viewer | undefined;
    const cleanups: Array<() => void> = [];

    (async () => {
      const C = await loadCesium();
      if (disposed || !containerRef.current) return;

      // No Ion account is needed for the baseline experience. Blank the
      // default token so nothing reaches ion.cesium.com unless the operator
      // adds a token in settings.
      C.Ion.defaultAccessToken = "";

      viewer = new C.Viewer(containerRef.current, {
        baseLayer: false,
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        vrButton: false,
        shouldAnimate: true,
        msaaSamples: 4,
        creditContainer: creditRef.current ?? undefined,
        contextOptions: { webgl: { powerPreference: "high-performance" } },
      });
      setViewer(viewer);
      const scene = viewer.scene;
      const globe = scene.globe;
      const prefs = useSettings.getState().prefs;
      const keys = useSettings.getState().keys;

      // Look & feel
      globe.baseColor = C.Color.fromCssColorString("#02060a");
      globe.enableLighting = true;
      globe.lightingFadeOutDistance = 1.2e5;
      globe.lightingFadeInDistance = 3.5e5;
      globe.nightFadeOutDistance = 1.2e5;
      globe.nightFadeInDistance = 3.5e5;
      globe.showGroundAtmosphere = prefs.atmosphere;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show =prefs.atmosphere;
      scene.fog.enabled = true;
      scene.postProcessStages.fxaa.enabled = true;
      scene.highDynamicRange = false;
      scene.screenSpaceCameraController.minimumZoomDistance = 120;
      scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
      scene.screenSpaceCameraController.enableCollisionDetection = true;
      viewer.clock.clockRange = C.ClockRange.UNBOUNDED;
      viewer.clock.clockStep = C.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      viewer.clock.shouldAnimate = true;

      addBaseImagery(viewer);
      const night = prefs.nightLights ? addNightLights(viewer) : null;
      let nightLayer: CesiumNS.ImageryLayer | null = night;

      void setGoogleTiles(viewer, keys.GOOGLE_MAPS_API_KEY, prefs.googleTiles).then((r) => {
        if (r.active) useGlobe.getState().pushLog({ level: "info", text: "Google Photorealistic 3D Tiles online" });
        else if (r.error) useGlobe.getState().pushLog({ level: "warn", text: `Google tiles: ${r.error}` });
      });
      void setTerrain(viewer, keys.CESIUM_ION_TOKEN, prefs.terrain).then((r) => {
        if (r.active) useGlobe.getState().pushLog({ level: "info", text: "Cesium World Terrain online" });
        else if (r.error) useGlobe.getState().pushLog({ level: "warn", text: `Terrain: ${r.error}` });
      });

      // Opening move: from deep space down to a tilted continental view.
      viewer.camera.setView({
        destination: C.Cartesian3.fromDegrees(-97.7, 10, 32_000_000),
        orientation: { heading: 0, pitch: C.Math.toRadians(-90), roll: 0 },
      });
      viewer.camera.flyTo({
        destination: C.Cartesian3.fromDegrees(-97.7, 8, 9_500_000),
        orientation: { heading: 0, pitch: C.Math.toRadians(-72), roll: 0 },
        duration: 5,
        easingFunction: C.EasingFunction.QUADRATIC_OUT,
      });

      // Camera state -> store (throttled)
      const ellipsoid = scene.globe.ellipsoid;
      const centerScratch = new C.Cartesian2();
      let lastViewPush = 0;
      const pushView = (force = false) => {
        const now = performance.now();
        if (!force && now - lastViewPush < 250) return;
        lastViewPush = now;
        const canvas = scene.canvas;
        centerScratch.x = canvas.clientWidth / 2;
        centerScratch.y = canvas.clientHeight / 2;
        const hit = viewer!.camera.pickEllipsoid(centerScratch, ellipsoid);
        const camCarto = viewer!.camera.positionCartographic;
        const carto = hit ? C.Cartographic.fromCartesian(hit) : camCarto;
        const rect = viewer!.camera.computeViewRectangle(ellipsoid);
        const view: ViewState = {
          lon: C.Math.toDegrees(carto.longitude),
          lat: C.Math.toDegrees(carto.latitude),
          height: camCarto.height,
          heading: C.Math.toDegrees(viewer!.camera.heading),
          pitch: C.Math.toDegrees(viewer!.camera.pitch),
          bbox: rect
            ? [
                C.Math.toDegrees(rect.west),
                C.Math.toDegrees(rect.south),
                C.Math.toDegrees(rect.east),
                C.Math.toDegrees(rect.north),
              ]
            : undefined,
        };
        useGlobe.getState().setView(view);
      };
      viewer.camera.percentageChanged = 0.01;
      const offChanged = viewer.camera.changed.addEventListener(() => pushView());
      const offMoveEnd = viewer.camera.moveEnd.addEventListener(() => pushView(true));
      cleanups.push(offChanged, offMoveEnd);
      pushView(true);

      // Clock -> store (2 Hz)
      let lastClockPush = 0;
      const offTick = viewer.clock.onTick.addEventListener((clock) => {
        const now = performance.now();
        if (now - lastClockPush < 500) return;
        lastClockPush = now;
        const offsetMs = C.JulianDate.toDate(clock.currentTime).getTime() - Date.now();
        const s = useGlobe.getState();
        if (Math.abs(s.clock.offsetMs - offsetMs) > 400 || s.clock.multiplier !== clock.multiplier) {
          s.setClock({ offsetMs, multiplier: clock.multiplier, animate: clock.shouldAnimate });
        }
      });
      cleanups.push(offTick);

      // Per-frame: advance renderers, follow target, cinematic drift
      let lastInput = performance.now();
      let lastFrame = performance.now();
      const markInput = () => {
        lastInput = performance.now();
      };
      const canvas = scene.canvas;
      for (const ev of ["pointerdown", "wheel", "keydown", "touchstart"]) {
        canvas.addEventListener(ev, markInput, { passive: true });
        cleanups.push(() => canvas.removeEventListener(ev, markInput));
      }
      window.addEventListener("keydown", markInput);
      cleanups.push(() => window.removeEventListener("keydown", markInput));

      const offPreUpdate = scene.preUpdate.addEventListener(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        const t = C.JulianDate.toDate(viewer!.clock.currentTime).getTime();
        for (const r of allRenderers()) r.tick(t);
        const st = useGlobe.getState();
        if (st.following) {
          followTick();
        } else if (
          useSettings.getState().prefs.cinematic &&
          now - lastInput > 12_000 &&
          !st.settingsOpen &&
          !st.searchOpen
        ) {
          cinematicTick(dt);
        }
      });
      cleanups.push(offPreUpdate);

      // Picking
      const handler = new C.ScreenSpaceEventHandler(canvas);
      handler.setInputAction((e: CesiumNS.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = scene.pick(e.position) as { id?: unknown } | undefined;
        const id = picked?.id;
        const st = useGlobe.getState();
        if (isPickId(id)) {
          const feature = getRenderer(id.layer)?.getFeature(id.id) ?? null;
          st.select({ layer: id.layer, id: id.id }, feature);
        } else {
          st.select(null);
        }
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      let lastHoverPick = 0;
      handler.setInputAction((e: CesiumNS.ScreenSpaceEventHandler.MotionEvent) => {
        const now = performance.now();
        if (now - lastHoverPick < 70) return;
        lastHoverPick = now;
        const picked = scene.pick(e.endPosition) as { id?: unknown } | undefined;
        const id = picked?.id;
        const st = useGlobe.getState();
        if (isPickId(id)) {
          if (!st.hover || st.hover.id !== id.id || st.hover.layer !== id.layer) {
            st.setHover({ layer: id.layer, id: id.id });
          }
          canvas.style.cursor = "pointer";
        } else if (st.hover) {
          st.setHover(null);
          canvas.style.cursor = "";
        }
      }, C.ScreenSpaceEventType.MOUSE_MOVE);
      cleanups.push(() => handler.destroy());

      // Store -> renderers (selection / hover highlight)
      const unsubSel = useGlobe.subscribe((s, prev) => {
        if (s.selected !== prev.selected) {
          for (const r of allRenderers()) {
            r.setSelected(s.selected && s.selected.layer === r.layer ? s.selected.id : null);
          }
        }
        if (s.hover !== prev.hover) {
          for (const r of allRenderers()) {
            r.setHover(s.hover && s.hover.layer === r.layer ? s.hover.id : null);
          }
        }
      });
      cleanups.push(unsubSel);

      // Preferences -> scene
      const unsubPrefs = useSettings.subscribe((s, prev) => {
        if (!viewer || viewer.isDestroyed()) return;
        const p = s.prefs;
        const q = prev.prefs;
        if (p.atmosphere !== q.atmosphere) {
          if (scene.skyAtmosphere) scene.skyAtmosphere.show =p.atmosphere;
          globe.showGroundAtmosphere = p.atmosphere;
        }
        if (p.nightLights !== q.nightLights) {
          if (p.nightLights && !nightLayer) nightLayer = addNightLights(viewer);
          else if (!p.nightLights && nightLayer) {
            viewer.imageryLayers.remove(nightLayer, true);
            nightLayer = null;
          }
        }
        if (p.labels !== q.labels) {
          for (const r of allRenderers()) r.setLabelsEnabled(p.labels);
        }
        if (p.googleTiles !== q.googleTiles || s.keys.GOOGLE_MAPS_API_KEY !== prev.keys.GOOGLE_MAPS_API_KEY) {
          void setGoogleTiles(viewer, s.keys.GOOGLE_MAPS_API_KEY, p.googleTiles).then((r) => {
            const log = useGlobe.getState().pushLog;
            if (r.active) log({ level: "info", text: "Google Photorealistic 3D Tiles online" });
            else if (r.error) log({ level: "warn", text: `Google tiles: ${r.error}` });
          });
        }
        if (p.terrain !== q.terrain || s.keys.CESIUM_ION_TOKEN !== prev.keys.CESIUM_ION_TOKEN) {
          void setTerrain(viewer, s.keys.CESIUM_ION_TOKEN, p.terrain).then((r) => {
            const log = useGlobe.getState().pushLog;
            if (r.active) log({ level: "info", text: "Cesium World Terrain online" });
            else if (r.error) log({ level: "warn", text: `Terrain: ${r.error}` });
          });
        }
      });
      cleanups.push(unsubPrefs);

      useGlobe.getState().setReady(true);
      useGlobe.getState().pushLog({ level: "info", text: "Globe online. Keyless imagery stack: Esri World Imagery + NASA Black Marble." });
    })();

    return () => {
      disposed = true;
      for (const c of cleanups.splice(0)) c();
      useGlobe.getState().setReady(false);
      setViewer(null);
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <div
        ref={creditRef}
        className="absolute bottom-2 left-3 z-10 max-w-[38vw] overflow-hidden whitespace-nowrap"
      />
    </div>
  );
}
