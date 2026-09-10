"use client";
// Generic, primitive-based renderer for one data layer.
//
// Every layer's GeoJSON goes through the same LayerRenderer: point features
// become billboards (oriented glyphs) or point primitives, optional per-feature
// polylines are drawn, labels appear on hover/selection (or for everything when
// the layer is small), and a LayerStyle may supply a time-dependent position
// so satellites / simulated cars / launch vehicles move without re-fetching.
//
// Primitives are used instead of Entities because a few thousand entities
// updating every frame would crawl; PointPrimitiveCollection and
// BillboardCollection are designed for exactly this.

import type * as CesiumNS from "cesium";
import type { LineString } from "geojson";
import { getCesium } from "./cesium";
import { getGlow, getIcon, iconKey, type IconKind } from "./icons";
import { DEG } from "./geo";
import type { LayerCollection, LayerFeature, LayerId } from "@/lib/layers/types";

export type LonLatAlt = [lon: number, lat: number, alt: number];

export interface StyledLine {
  positions: LonLatAlt[];
  color?: string;
  width?: number;
  /** 0..1 alpha */
  alpha?: number;
  dashed?: boolean;
  glow?: boolean;
}

export interface LayerStyle {
  color: string;
  /** Return a glyph kind for a billboard, or null to draw a plain point. */
  icon?: (f: LayerFeature) => IconKind | null;
  iconSize?: number;
  pointSize?: (f: LayerFeature) => number;
  colorFor?: (f: LayerFeature) => string;
  label?: (f: LayerFeature) => string;
  /** Show labels for every feature while the layer has at most this many. */
  labelMax?: number;
  /** Dynamic position at mission time (ms). Return null to hide the feature. */
  position?: (f: LayerFeature, timeMs: number) => LonLatAlt | null;
  headingAt?: (f: LayerFeature, timeMs: number) => number | undefined;
  /** Polylines drawn for every feature (e.g. launch trajectories, road network). */
  lines?: (f: LayerFeature, timeMs: number) => StyledLine[] | null;
  /** Polylines drawn only for the selected feature (e.g. an orbit). */
  selectedLines?: (f: LayerFeature, timeMs: number) => StyledLine[] | null;
  /** Record a position history and draw it as a trail for the selected feature. */
  trail?: boolean;
  /** Refresh cadence for dynamic positions in ms. 0 = every frame. */
  tickMs?: number;
  /** Scale glyphs down when far away. [near, nearScale, far, farScale] */
  scaleByDistance?: [number, number, number, number];
  /** Fade glyphs when far away. [near, nearAlpha, far, farAlpha] */
  translucencyByDistance?: [number, number, number, number];
  /** Extra per-feature gate for labels (on top of hover / selection / labelMax). */
  labelWhen?: (f: LayerFeature, timeMs: number) => boolean;
}

export interface PickId {
  layer: LayerId;
  id: string;
}

interface Item {
  feature: LayerFeature;
  point?: CesiumNS.PointPrimitive;
  billboard?: CesiumNS.Billboard;
  label?: CesiumNS.Label;
  lines: CesiumNS.Polyline[];
  history: Array<[t: number, lon: number, lat: number, alt: number]>;
  lastHistoryAt: number;
  pos?: CesiumNS.Cartesian3;
  color: string;
}

const colorCache = new Map<string, CesiumNS.Color>();
function cssColor(hex: string, alpha?: number): CesiumNS.Color {
  const C = getCesium();
  const key = alpha == null ? hex : `${hex}@${alpha}`;
  let c = colorCache.get(key);
  if (!c) {
    c = C.Color.fromCssColorString(hex);
    if (alpha != null) c = c.withAlpha(alpha);
    colorCache.set(key, c);
  }
  return c;
}

const LABEL_FONT = "12px Geist Mono, JetBrains Mono, Consolas, monospace";
const MAX_HISTORY = 240;

export class LayerRenderer {
  readonly layer: LayerId;
  readonly style: LayerStyle;
  private readonly viewer: CesiumNS.Viewer;
  private readonly points: CesiumNS.PointPrimitiveCollection;
  private readonly billboards: CesiumNS.BillboardCollection;
  private readonly labels: CesiumNS.LabelCollection;
  private readonly polylines: CesiumNS.PolylineCollection;
  private readonly fx: CesiumNS.BillboardCollection;
  private readonly items = new Map<string, Item>();
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private selectedLines: CesiumNS.Polyline[] = [];
  private trailLine: CesiumNS.Polyline | null = null;
  private glow: CesiumNS.Billboard | null = null;
  private lastTick = 0;
  private lastTime = 0;
  private _show = true;
  private labelsEnabled = true;
  private destroyed = false;

  constructor(viewer: CesiumNS.Viewer, layer: LayerId, style: LayerStyle) {
    const C = getCesium();
    this.viewer = viewer;
    this.layer = layer;
    this.style = style;
    const scene = viewer.scene;
    this.polylines = scene.primitives.add(new C.PolylineCollection());
    this.points = scene.primitives.add(new C.PointPrimitiveCollection());
    this.fx = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.billboards = scene.primitives.add(new C.BillboardCollection({ scene }));
    this.labels = scene.primitives.add(new C.LabelCollection({ scene }));
  }

  get show() {
    return this._show;
  }
  set show(v: boolean) {
    this._show = v;
    this.points.show = v;
    this.billboards.show = v;
    this.labels.show = v;
    this.polylines.show = v;
    this.fx.show = v;
  }

  setLabelsEnabled(on: boolean) {
    this.labelsEnabled = on;
    this.refreshLabels();
  }

  get size() {
    return this.items.size;
  }

  getFeature(id: string): LayerFeature | undefined {
    return this.items.get(id)?.feature;
  }

  *features(): IterableIterator<LayerFeature> {
    for (const it of this.items.values()) yield it.feature;
  }

  /** Current world position of a feature (Cartesian3), if it has one. */
  getPosition(id: string): CesiumNS.Cartesian3 | undefined {
    return this.items.get(id)?.pos;
  }

  /** Replace the layer contents with a fresh collection, diffing by id. */
  update(collection: LayerCollection) {
    if (this.destroyed) return;
    const now = this.currentTimeMs();
    const seen = new Set<string>();
    for (const f of collection.features) {
      const id = f.properties.id;
      seen.add(id);
      const existing = this.items.get(id);
      if (existing) {
        existing.feature = f;
        this.applyStatic(existing, now);
      } else {
        const item: Item = {
          feature: f,
          lines: [],
          history: [],
          lastHistoryAt: 0,
          color: this.style.colorFor?.(f) ?? this.style.color,
        };
        this.items.set(id, item);
        this.applyStatic(item, now);
      }
    }
    for (const [id, item] of this.items) {
      if (!seen.has(id)) {
        this.removeItem(item);
        this.items.delete(id);
        if (this.selectedId === id) this.setSelected(null);
      }
    }
    this.refreshLabels();
    this.tick(now, true);
  }

  private currentTimeMs(): number {
    const C = getCesium();
    return C.JulianDate.toDate(this.viewer.clock.currentTime).getTime();
  }

  private lonLatAlt(item: Item, timeMs: number): LonLatAlt | null {
    const f = item.feature;
    if (this.style.position) return this.style.position(f, timeMs);
    if (f.geometry.type === "Point") {
      const [lon, lat, alt] = f.geometry.coordinates;
      return [lon, lat, alt ?? f.properties.altitude ?? 0];
    }
    if (f.geometry.type === "LineString") {
      const c = f.geometry.coordinates[0];
      return [c[0], c[1], c[2] ?? 0];
    }
    return null;
  }

  private applyStatic(item: Item, timeMs: number) {
    const C = getCesium();
    const f = item.feature;
    item.color = this.style.colorFor?.(f) ?? this.style.color;
    const color = cssColor(item.color);
    const pick: PickId = { layer: this.layer, id: f.properties.id };
    const kind = this.style.icon?.(f) ?? null;
    const lineOnly = f.geometry.type === "LineString" && !kind;

    if (lineOnly) {
      // Pure polyline feature (roads, tracks): no marker, position = first vertex.
      if (item.point) {
        this.points.remove(item.point);
        item.point = undefined;
      }
      if (item.billboard) {
        this.billboards.remove(item.billboard);
        item.billboard = undefined;
      }
      const c = (f.geometry as LineString).coordinates[0];
      item.pos = C.Cartesian3.fromDegrees(c[0], c[1], c[2] ?? 0);
    } else if (kind) {
      if (item.point) {
        this.points.remove(item.point);
        item.point = undefined;
      }
      const size = this.style.iconSize ?? 28;
      if (!item.billboard) {
        item.billboard = this.billboards.add({
          id: pick,
          position: new C.Cartesian3(),
          width: size,
          height: size,
          verticalOrigin: C.VerticalOrigin.CENTER,
          horizontalOrigin: C.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        if (this.style.scaleByDistance) {
          const [n, ns, fa, fs] = this.style.scaleByDistance;
          item.billboard.scaleByDistance = new C.NearFarScalar(n, ns, fa, fs);
        }
        if (this.style.translucencyByDistance) {
          const [n, na, fa, fal] = this.style.translucencyByDistance;
          item.billboard.translucencyByDistance = new C.NearFarScalar(n, na, fa, fal);
        }
      }
      item.billboard.setImage(iconKey(kind, item.color, 32), getIcon(kind, item.color, 32));
    } else {
      if (item.billboard) {
        this.billboards.remove(item.billboard);
        item.billboard = undefined;
      }
      if (!item.point) {
        item.point = this.points.add({
          id: pick,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
        if (this.style.scaleByDistance) {
          const [n, ns, fa, fs] = this.style.scaleByDistance;
          item.point.scaleByDistance = new C.NearFarScalar(n, ns, fa, fs);
        }
        if (this.style.translucencyByDistance) {
          const [n, na, fa, fal] = this.style.translucencyByDistance;
          item.point.translucencyByDistance = new C.NearFarScalar(n, na, fa, fal);
        }
      }
      item.point.color = color;
      item.point.outlineColor = C.Color.BLACK.withAlpha(0.7);
      item.point.outlineWidth = 1;
      item.point.pixelSize = this.style.pointSize?.(f) ?? 6;
    }

    // Static polylines (trajectories, roads).
    for (const l of item.lines) this.polylines.remove(l);
    item.lines = [];
    const lines = this.style.lines?.(f, timeMs);
    if (lines) {
      for (const l of lines) item.lines.push(this.addLine(l, pick));
    }

    if (!this.style.position && !lineOnly) this.place(item, timeMs);
  }

  private addLine(l: StyledLine, id?: PickId): CesiumNS.Polyline {
    const C = getCesium();
    const flat: number[] = [];
    for (const p of l.positions) flat.push(p[0], p[1], p[2] ?? 0);
    const color = cssColor(l.color ?? this.style.color, l.alpha ?? 0.8);
    const material = l.dashed
      ? C.Material.fromType("PolylineDash", { color, dashLength: 12 })
      : l.glow
        ? C.Material.fromType("PolylineGlow", { color, glowPower: 0.2 })
        : C.Material.fromType("Color", { color });
    return this.polylines.add({
      positions: C.Cartesian3.fromDegreesArrayHeights(flat),
      width: l.width ?? 1.5,
      material,
      id,
    });
  }

  private place(item: Item, timeMs: number) {
    const C = getCesium();
    if (!item.point && !item.billboard && !item.label) return;
    const lla = this.lonLatAlt(item, timeMs);
    const visible = lla != null;
    if (item.point) item.point.show = visible;
    if (item.billboard) item.billboard.show = visible;
    if (item.label) item.label.show = visible && this.labelVisible(item);
    if (!lla) {
      item.pos = undefined;
      return;
    }
    const pos = C.Cartesian3.fromDegrees(lla[0], lla[1], lla[2], undefined, item.pos);
    item.pos = pos;
    if (item.point) item.point.position = pos;
    if (item.billboard) {
      item.billboard.position = pos;
      const heading =
        this.style.headingAt?.(item.feature, timeMs) ?? item.feature.properties.heading;
      if (heading != null && Number.isFinite(heading)) {
        item.billboard.alignedAxis = northAxis(pos);
        item.billboard.rotation = -heading * DEG;
      } else {
        item.billboard.alignedAxis = C.Cartesian3.ZERO;
        item.billboard.rotation = 0;
      }
    }
    if (item.label) item.label.position = pos;

    if (this.style.trail && timeMs - item.lastHistoryAt >= 4000) {
      const h = item.history;
      const last = h[h.length - 1];
      if (!last || last[1] !== lla[0] || last[2] !== lla[1] || last[3] !== lla[2]) {
        h.push([timeMs, lla[0], lla[1], lla[2]]);
        if (h.length > MAX_HISTORY) h.shift();
      }
      item.lastHistoryAt = timeMs;
    }
  }

  /** Advance dynamic features to mission time. Called every frame; throttled by style.tickMs. */
  tick(timeMs: number, force = false) {
    if (this.destroyed || !this._show) return;
    const cadence = this.style.tickMs ?? 1000;
    const jumped = Math.abs(timeMs - this.lastTime) > Math.max(cadence, 250) * 4;
    this.lastTime = timeMs;
    const due = force || jumped || cadence === 0 || timeMs - this.lastTick >= cadence;
    if (due) {
      this.lastTick = timeMs;
      if (this.style.position) {
        for (const item of this.items.values()) this.place(item, timeMs);
      }
    }
    this.occlude(force);
    this.updateSelectionFx(timeMs, due);
  }

  private lastOcclude = 0;

  /**
   * Depth testing is disabled on every marker so surface objects are never
   * swallowed by terrain; the price is that markers on the far side of the
   * planet would shine through it. This hides anything below the horizon.
   */
  private occlude(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastOcclude < 120) return;
    this.lastOcclude = now;
    const cam = this.viewer.scene.camera.positionWC;
    const occ = horizonOccluder(cam);
    for (const item of this.items.values()) {
      if (!item.pos) continue;
      const visible = occ(item.pos);
      if (item.point && item.point.show !== visible) item.point.show = visible;
      if (item.billboard && item.billboard.show !== visible) item.billboard.show = visible;
      if (item.label) {
        const want = visible && this.labelVisible(item);
        if (item.label.show !== want) item.label.show = want;
      }
      for (const l of item.lines) if (l.show !== visible) l.show = visible;
    }
    if (this.glow && this.selectedId) {
      const cur = this.items.get(this.selectedId);
      this.glow.show = !!cur?.pos && occ(cur.pos);
    }
  }

  private labelVisible(item: Item): boolean {
    const id = item.feature.properties.id;
    if (id === this.selectedId || id === this.hoverId) return true;
    if (!this.labelsEnabled) return false;
    if (this.style.labelWhen && !this.style.labelWhen(item.feature, this.lastTime || Date.now())) return false;
    return this.items.size <= (this.style.labelMax ?? 60);
  }

  private refreshLabels() {
    for (const item of this.items.values()) this.syncLabel(item);
  }

  private syncLabel(item: Item) {
    const C = getCesium();
    const wanted = this.labelVisible(item) && !!this.style.label;
    if (!wanted) {
      if (item.label) {
        this.labels.remove(item.label);
        item.label = undefined;
      }
      return;
    }
    const text = this.style.label!(item.feature);
    if (!item.label) {
      item.label = this.labels.add({
        text,
        position: item.pos ?? new C.Cartesian3(),
        font: LABEL_FONT,
        fillColor: cssColor(item.color),
        outlineColor: C.Color.BLACK.withAlpha(0.9),
        outlineWidth: 3,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new C.Cartesian2(14, -12),
        horizontalOrigin: C.HorizontalOrigin.LEFT,
        verticalOrigin: C.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: { layer: this.layer, id: item.feature.properties.id } satisfies PickId,
        show: !!item.pos,
      });
      if (item.pos) item.label.position = item.pos;
    } else {
      item.label.text = text;
      item.label.fillColor = cssColor(item.color);
    }
  }

  setHover(id: string | null) {
    if (this.hoverId === id) return;
    const prev = this.hoverId ? this.items.get(this.hoverId) : undefined;
    this.hoverId = id;
    if (prev) this.syncLabel(prev);
    const cur = id ? this.items.get(id) : undefined;
    if (cur) this.syncLabel(cur);
  }

  setSelected(id: string | null) {
    const C = getCesium();
    if (this.selectedId === id) return;
    const prev = this.selectedId ? this.items.get(this.selectedId) : undefined;
    this.selectedId = id;
    if (prev) this.syncLabel(prev);
    for (const l of this.selectedLines) this.polylines.remove(l);
    this.selectedLines = [];
    if (this.trailLine) {
      this.polylines.remove(this.trailLine);
      this.trailLine = null;
    }
    if (this.glow) {
      this.fx.remove(this.glow);
      this.glow = null;
    }
    const cur = id ? this.items.get(id) : undefined;
    if (!cur) return;
    this.syncLabel(cur);
    this.glow = this.fx.add({
      image: getGlow(cur.color, 64),
      width: 64,
      height: 64,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      position: cur.pos ?? C.Cartesian3.ZERO,
      show: !!cur.pos,
    });
    const t = this.currentTimeMs();
    const lines = this.style.selectedLines?.(cur.feature, t);
    if (lines) for (const l of lines) this.selectedLines.push(this.addLine(l));
    this.updateSelectionFx(t, true);
  }

  /** Rebuild the selected feature's orbit / trajectory lines (after time jumps). */
  refreshSelectedLines() {
    if (!this.selectedId) return;
    const cur = this.items.get(this.selectedId);
    if (!cur) return;
    for (const l of this.selectedLines) this.polylines.remove(l);
    this.selectedLines = [];
    const lines = this.style.selectedLines?.(cur.feature, this.currentTimeMs());
    if (lines) for (const l of lines) this.selectedLines.push(this.addLine(l));
  }

  private updateSelectionFx(timeMs: number, rebuildTrail: boolean) {
    const C = getCesium();
    if (!this.selectedId) return;
    const cur = this.items.get(this.selectedId);
    if (!cur) return;
    if (this.glow) {
      const pulse = 52 + 10 * Math.sin(performance.now() / 260);
      this.glow.width = pulse;
      this.glow.height = pulse;
      if (cur.pos) this.glow.position = cur.pos;
      else this.glow.show = false;
    }
    if (this.style.trail && rebuildTrail && cur.history.length > 1) {
      const flat: number[] = [];
      for (const h of cur.history) if (h[0] <= timeMs) flat.push(h[1], h[2], h[3]);
      if (cur.pos) {
        const carto = C.Cartographic.fromCartesian(cur.pos);
        flat.push(
          C.Math.toDegrees(carto.longitude),
          C.Math.toDegrees(carto.latitude),
          carto.height,
        );
      }
      if (flat.length >= 6) {
        const positions = C.Cartesian3.fromDegreesArrayHeights(flat);
        if (!this.trailLine) {
          this.trailLine = this.polylines.add({
            positions,
            width: 2,
            material: C.Material.fromType("PolylineGlow", {
              color: cssColor(cur.color, 0.9),
              glowPower: 0.25,
            }),
          });
        } else this.trailLine.positions = positions;
      }
    }
  }

  private removeItem(item: Item) {
    if (item.point) this.points.remove(item.point);
    if (item.billboard) this.billboards.remove(item.billboard);
    if (item.label) this.labels.remove(item.label);
    for (const l of item.lines) this.polylines.remove(l);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const p = this.viewer.scene.primitives;
    for (const c of [this.points, this.billboards, this.labels, this.polylines, this.fx]) {
      if (p.contains(c)) p.remove(c);
    }
    this.items.clear();
  }
}

// WGS84 radii; positions are scaled to the unit sphere for the horizon test.
const INV_A = 1 / 6378137.0;
const INV_C = 1 / 6356752.3142451793;

/**
 * Horizon culling in ellipsoid-scaled space (the same test Cesium uses for
 * terrain tiles): returns a predicate telling whether a world position is on
 * the camera-facing side of the planet.
 */
export function horizonOccluder(camera: CesiumNS.Cartesian3): (p: CesiumNS.Cartesian3) => boolean {
  const cx = camera.x * INV_A;
  const cy = camera.y * INV_A;
  const cz = camera.z * INV_C;
  const vhMagnitudeSquared = cx * cx + cy * cy + cz * cz - 1;
  return (p) => {
    const vtx = p.x * INV_A - cx;
    const vty = p.y * INV_A - cy;
    const vtz = p.z * INV_C - cz;
    const vtDotVc = -(vtx * cx + vty * cy + vtz * cz);
    if (vhMagnitudeSquared < 0) return !(vtDotVc > 0);
    if (vtDotVc <= vhMagnitudeSquared) return true;
    const vtMagSq = vtx * vtx + vty * vty + vtz * vtz;
    return !((vtDotVc * vtDotVc) / vtMagSq > vhMagnitudeSquared);
  };
}

let northMatrix: CesiumNS.Matrix4 | undefined;

/** Unit vector pointing to local north at a world position. */
export function northAxis(pos: CesiumNS.Cartesian3): CesiumNS.Cartesian3 {
  const C = getCesium();
  northMatrix = C.Transforms.eastNorthUpToFixedFrame(pos, undefined, northMatrix);
  const col = C.Matrix4.getColumn(northMatrix, 1, new C.Cartesian4());
  const n = new C.Cartesian3(col.x, col.y, col.z);
  return C.Cartesian3.normalize(n, n);
}
