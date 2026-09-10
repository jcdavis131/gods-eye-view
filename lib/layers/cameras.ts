// Layer 5: public cameras.
//
// Only cameras that public infrastructure operators publish as open data:
//   TfL JamCams (London)      no key   ~900 traffic cameras, JPEG refreshed every few minutes
//   NYC DOT traffic cameras   no key   ~900 cameras, live JPEG endpoint
//   Windy Webcams             key      public webcams worldwide, nearest 50 to the view
//
// Camera *positions* come from the operator. Camera *orientation* is not
// published by any of these feeds, so no view cone is drawn: a pose is only
// ever "coarse position, unknown bearing". Nothing here identifies people.

import type { Point } from "geojson";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature, ViewState } from "./types";
import { proxy } from "./aircraft";
import type { TrimmedCam } from "@/app/api/cameras/route";

interface WindyCam {
  webcamId: number;
  title: string;
  status: string;
  lastUpdatedOn?: string;
  images?: { current?: { preview?: string; thumbnail?: string; icon?: string } };
  location?: { city?: string; region?: string; country?: string; latitude: number; longitude: number };
  player?: { day?: string; live?: string };
  urls?: { detail?: string };
}

interface WindyResponse {
  total: number;
  webcams: WindyCam[];
}

function trimmedToFeature(c: TrimmedCam, operator: string, source: string): LayerFeature<Point> | null {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return null;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [c.lon, c.lat, 0] },
    properties: {
      id: `${source}:${c.id}`,
      layer: "cameras",
      name: c.name,
      kind: "traffic-cam",
      altitude: 0,
      observedAt: c.updated ? Date.parse(c.updated) || undefined : undefined,
      source,
      imageUrl: c.available === false ? undefined : c.imageUrl,
      details: {
        operator,
        area: c.area ?? null,
        view: c.view ?? null,
        status: c.available === false ? "offline" : "online",
        pose: "position from operator · bearing not published",
        "video stream": c.videoUrl ?? null,
      },
    },
  };
}

// Static open-data lists change rarely; remember them across view changes.
const staticCache: { at: number; features: LayerFeature<Point>[]; sources: string[] } = {
  at: 0,
  features: [],
  sources: [],
};

async function staticCameras(ctx: FetchContext): Promise<{ features: LayerFeature<Point>[]; sources: string[] }> {
  if (Date.now() - staticCache.at < 10 * 60_000 && staticCache.features.length) return staticCache;
  const features: LayerFeature<Point>[] = [];
  const sources: string[] = [];
  await Promise.all([
    proxy<TrimmedCam[]>("/api/cameras?source=tfl", ctx)
      .then((env) => {
        for (const c of env.data) {
          const f = trimmedToFeature(c, "Transport for London", "tfl");
          if (f) features.push(f);
        }
        sources.push("TfL");
      })
      .catch(() => {}),
    proxy<TrimmedCam[]>("/api/cameras?source=nyc", ctx)
      .then((env) => {
        for (const c of env.data) {
          const f = trimmedToFeature(c, "NYC DOT", "nyc");
          if (f) features.push(f);
        }
        sources.push("NYC DOT");
      })
      .catch(() => {}),
  ]);
  if (features.length) {
    staticCache.at = Date.now();
    staticCache.features = features;
    staticCache.sources = sources;
  }
  return { features, sources };
}

async function windyCameras(ctx: FetchContext): Promise<LayerFeature<Point>[]> {
  const radius = Math.min(250, Math.max(10, ctx.view.height / 1000));
  const env = await proxy<WindyResponse>(
    `/api/cameras?source=windy&lat=${ctx.view.lat.toFixed(2)}&lon=${ctx.view.lon.toFixed(2)}&radius=${Math.round(radius)}`,
    ctx,
  );
  const out: LayerFeature<Point>[] = [];
  for (const w of env.data.webcams ?? []) {
    const loc = w.location;
    if (!loc) continue;
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loc.longitude, loc.latitude, 0] },
      properties: {
        id: `windy:${w.webcamId}`,
        layer: "cameras",
        name: w.title,
        kind: "webcam",
        altitude: 0,
        observedAt: w.lastUpdatedOn ? Date.parse(w.lastUpdatedOn) || undefined : undefined,
        source: "windy",
        imageUrl: w.images?.current?.preview,
        details: {
          operator: "Windy Webcams (public webcam)",
          place: [loc.city, loc.region, loc.country].filter(Boolean).join(", "),
          status: w.status,
          pose: "position from provider · bearing not published",
          "windy page": w.urls?.detail ?? null,
        },
      },
    });
  }
  return out;
}

async function fetchCameras(ctx: FetchContext): Promise<FetchResult> {
  const { features, sources } = await staticCameras(ctx);
  let all = features;
  const srcs = [...sources];
  let note = "London (TfL) + New York (NYC DOT) · add WINDY_WEBCAMS_KEY for worldwide";
  if (ctx.keys.WINDY_WEBCAMS_KEY) {
    try {
      const w = await windyCameras(ctx);
      all = [...features, ...w];
      srcs.push("Windy");
      note = `${w.length} Windy webcams near view + TfL + NYC DOT`;
    } catch (err) {
      note = `Windy: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (all.length === 0) throw new Error("no camera source reachable");
  return {
    collection: { type: "FeatureCollection", features: all },
    source: srcs.join(" + "),
    fetchedAt: Date.now(),
    note,
  };
}

export const camerasLayer: LayerDefinition = {
  id: "cameras",
  label: "Public cams",
  description: "Open-data traffic cameras (TfL, NYC DOT) with live stills; Windy webcams with a key. Positions only, no bearings.",
  color: "#F5B849",
  updateIntervalMs: 5 * 60_000,
  defaultEnabled: false,
  viewDependent: true,
  viewKey: (v: ViewState) => `${Math.round(v.lon * 2) / 2},${Math.round(v.lat * 2) / 2}`,
  attribution: "TfL Open Data · NYC DOT · Windy.com",
  fetch: fetchCameras,
};
