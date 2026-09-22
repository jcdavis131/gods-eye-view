// Shared contract for every data layer in Embedding Atlas.
//
// A layer is a plain module in lib/layers/<name>.ts that exports a
// LayerDefinition: metadata + a fetch() that resolves to GeoJSON. The globe
// never talks to an upstream API directly; it only ever sees FeatureCollections
// produced here, so every signal on screen is inspectable in one place.

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ApiKeyId } from "@/lib/store/settings";

export type LayerId =
  | "aircraft"
  | "ships"
  | "satellites"
  | "earthquakes"
  | "cameras"
  | "traffic"
  | "launches"
  | "water"
  | "groundwater"
  | "turbidity"
  | "trade"
  | "commerce"
  | "realestate"
  | "companies"
  | "banks"
  | "spending"
  | "occupations"
  | "weather"
  | "sports"
  | "constructs"
  | "field";

export const LAYER_IDS: LayerId[] = [
  "aircraft",
  "ships",
  "satellites",
  "earthquakes",
  "cameras",
  "traffic",
  "launches",
  "water",
  "groundwater",
  "turbidity",
  "trade",
  "commerce",
  "realestate",
  "companies",
  "banks",
  "spending",
  "occupations",
  "weather",
  "sports",
  "constructs",
  "field",
];

/** Properties every feature carries, whatever the layer. */
export interface BaseProps {
  /** Stable id inside the layer: ICAO24 hex, MMSI, NORAD id, USGS event id, ... */
  id: string;
  layer: LayerId;
  /** Display name: callsign, vessel name, satellite name, place string, ... */
  name: string;
  /** Sub-type used for icon / colour choice: aircraft type, ship class, sat group, ... */
  kind?: string;
  /** Degrees true. Leave undefined when the upstream says "unknown" (never invent one). */
  heading?: number;
  /** Metres above the WGS84 ellipsoid. 0 for surface objects. */
  altitude?: number;
  /** Metres per second over ground. */
  speed?: number;
  /** Epoch ms of the underlying observation, when the upstream provides one. */
  observedAt?: number;
  /** Human readable upstream name shown in the HUD. */
  source: string;
  /** true ONLY for the traffic simulation layer. Simulated features are never counted as live. */
  simulated?: boolean;
  /** Key/value pairs rendered verbatim in the info panel. */
  details?: Record<string, string | number | boolean | null | undefined>;
  /** Cameras: a still image URL that refreshes upstream. */
  imageUrl?: string;
  /** Layer specific opaque payload (e.g. OMM elements for satellites). */
  extra?: unknown;
  /** Label / pick anchor for a polygon feature, [lon, lat] (Census internal point, country label point). */
  anchor?: [number, number];
}

export type LayerFeature<G extends Geometry = Geometry> = Feature<G, BaseProps>;
export type LayerCollection = FeatureCollection<Geometry, BaseProps>;

export interface ViewState {
  /** Camera target on the ellipsoid, degrees. */
  lon: number;
  lat: number;
  /** Camera height above the ellipsoid, metres. */
  height: number;
  heading: number;
  pitch: number;
  /** Visible extent [west, south, east, north] in degrees when the horizon is not in view. */
  bbox?: [number, number, number, number];
}

export interface FetchContext {
  keys: Partial<Record<ApiKeyId, string>>;
  view: ViewState;
  /** Epoch ms of the wall clock at fetch time. */
  now: number;
  /** Epoch ms of the mission clock (wall clock + timeline offset). */
  missionTime?: number;
  signal?: AbortSignal;
  /** Free-form layer options coming from the settings store (e.g. satellite groups). */
  options: Record<string, unknown>;
}

export interface FetchResult {
  collection: LayerCollection;
  /** Which upstream actually answered (a layer may have several). */
  source: string;
  fetchedAt: number;
  /** Short operator note shown next to the layer, e.g. coverage caveats. */
  note?: string;
  meta?: Record<string, unknown>;
}

export interface LayerDefinition {
  id: LayerId;
  label: string;
  description: string;
  /** Hex colour used for primitives, chips and the HUD. */
  color: string;
  /** How often the layer re-fetches while enabled. */
  updateIntervalMs: number;
  defaultEnabled: boolean;
  /** Re-fetch when the coarse view key changes (aircraft, traffic). */
  viewDependent?: boolean;
  /** Custom view key for view-dependent layers; defaults to viewKey(). */
  viewKey?: (view: ViewState) => string;
  /** Marks the whole layer as a simulation (traffic). Shown loudly in the UI. */
  simulated?: boolean;
  /** Re-fetch when the mission clock moves to another day (satellite scenes). */
  timeDependent?: boolean;
  /** Short caption for estimate layers: what the numbers are and are not. */
  estimate?: string;
  attribution: string;
  fetch: (ctx: FetchContext) => Promise<FetchResult>;
}

/**
 * Coarse key for view-dependent layers. Changes only when the camera target
 * moves ~0.5 degrees or the height changes bucket, so panning a little does
 * not trigger a new upstream request.
 */
export function viewKey(view: ViewState): string {
  const lon = Math.round(view.lon * 2) / 2;
  const lat = Math.round(view.lat * 2) / 2;
  const bucket = Math.round(Math.log2(Math.max(view.height, 1000) / 1000));
  return `${lon},${lat},${bucket}`;
}

export function emptyCollection(): LayerCollection {
  return { type: "FeatureCollection", features: [] };
}
