// Small geometry helpers for the fabric: point-in-polygon over Esri-style
// ring lists, a bounding box, and coordinate rounding to keep payloads small.
// Pure; used on the server (country lookup) and in the browser (joining
// loaded features to a construct).

/** Even-odd point in polygon over every ring (outer rings and holes alike). */
export function ringsContain(rings: number[][][], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export type BBox = [west: number, south: number, east: number, north: number];

export function ringsBbox(rings: number[][][]): BBox | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

export function bboxContains(b: BBox, lon: number, lat: number): boolean {
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}

/** Round every coordinate to `digits` decimals (4 ≈ 11 m) and drop repeated vertices. */
export function roundRings(rings: number[][][], digits = 4): number[][][] {
  const k = 10 ** digits;
  const out: number[][][] = [];
  for (const ring of rings) {
    const r: number[][] = [];
    for (const p of ring) {
      const x = Math.round(p[0] * k) / k;
      const y = Math.round(p[1] * k) / k;
      const last = r[r.length - 1];
      if (!last || last[0] !== x || last[1] !== y) r.push([x, y]);
    }
    if (r.length >= 4) out.push(r);
  }
  return out;
}

/** GeoJSON Polygon / MultiPolygon coordinates flattened to a ring list. */
export function geojsonRings(geometry: { type: string; coordinates: unknown }): number[][][] {
  if (geometry.type === "Polygon") return geometry.coordinates as number[][][];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as number[][][][]).flat();
  return [];
}
