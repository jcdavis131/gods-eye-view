// Esri World Imagery Wayback: every published release of the World Imagery
// basemap since 2014-02-20, as its own tile set. Pure: the release index
// parser, the tile template, and which release a link or a preference means.
//
// The index (waybackconfig.json) is read by /api/terrain?op=wayback and held
// a day; the tiles are loaded by the browser straight from Esri, never
// proxied or cached here (the item's licence: "not intended to be used to
// export tiles for offline"). A release date is when Esri published that
// version of the basemap, not when its pixels were captured.

export const WAYBACK_CONFIG = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";
export const WAYBACK_HOST = "wayback.maptiles.arcgis.com";
export const WAYBACK_MAX_ZOOM = 19;
/** The Wayback item's own attribution (ArcGIS item ab83ada1bd3145978eecfb115aaa10c3, accessInformation, 2026-10-12). */
export const WAYBACK_ATTRIBUTION = "Esri, Vantor, Earthstar Geographics, and the GIS User Community";

export const WAYBACK_CAVEAT =
  "Esri World Imagery as published on each release date, 2014-02-20 onward. A release date is not a capture date: pixels can be years older, and an area that did not change shows the same image across releases. This is not pre-2014 aerial history.";

/** The tile template of one release: Esri's WMTS REST path, {z}/{y}/{x}. */
export function waybackTiles(release: number): string {
  return `https://${WAYBACK_HOST}/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${release}/{z}/{y}/{x}`;
}

export interface WaybackRelease {
  /** Esri's release number (the {release} in the tile path). */
  release: number;
  /** Release date, YYYY-MM-DD, from the item title "World Imagery (Wayback YYYY-MM-DD)". */
  date: string;
}

/**
 * waybackconfig.json -> releases, newest first. An entry whose key is not a release number
 * or whose title carries no date is dropped, never guessed.
 */
export function parseWaybackConfig(j: unknown): WaybackRelease[] {
  if (!j || typeof j !== "object" || Array.isArray(j)) return [];
  const out: WaybackRelease[] = [];
  for (const [k, v] of Object.entries(j as Record<string, { itemTitle?: unknown }>)) {
    if (!/^\d{1,9}$/.test(k)) continue;
    const m = typeof v?.itemTitle === "string" ? v.itemTitle.match(/\(Wayback (\d{4})-(\d{2})-(\d{2})\)/) : null;
    if (!m) continue;
    const [, y, mo, d] = m;
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) continue;
    out.push({ release: Number(k), date: `${y}-${mo}-${d}` });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.release - a.release));
}

/** A release id from a link or a preference: a positive whole number, else null. */
export function parseReleaseId(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 && v < 1e9 ? v : null;
  if (typeof v !== "string" || !/^\d{1,9}$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return n > 0 ? n : null;
}

/**
 * The release to draw: the one asked for when Esri lists it, else the newest, saying that
 * it fell back (`fallback`: an id was asked for that the index does not hold).
 */
export function resolveRelease(list: WaybackRelease[], wanted: unknown): { release: WaybackRelease | null; fallback: boolean } {
  if (!list.length) return { release: null, fallback: false };
  const id = parseReleaseId(wanted);
  if (id == null) return { release: list[0], fallback: false };
  const hit = list.find((r) => r.release === id);
  return hit ? { release: hit, fallback: false } : { release: list[0], fallback: true };
}

/** Releases grouped by year, newest year first (the picker's optgroups). */
export function releasesByYear(list: WaybackRelease[]): Array<{ year: string; releases: WaybackRelease[] }> {
  const by = new Map<string, WaybackRelease[]>();
  for (const r of list) {
    const y = r.date.slice(0, 4);
    if (!by.has(y)) by.set(y, []);
    by.get(y)!.push(r);
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([year, releases]) => ({ year, releases }));
}
