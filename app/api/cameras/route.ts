// Public camera proxies. Only open-data feeds from public infrastructure
// operators: no private webcams, no aggregation of people.
//
//   /api/cameras?source=tfl     Transport for London JamCams (~900, open data, no key)
//   /api/cameras?source=nyc     NYC DOT traffic cameras (~900, public API, no key)
//   /api/cameras?source=windy&lat&lon&radius   Windy Webcams v3 (key required)
//
// TfL's raw payload is 1.1 MB of nested "additionalProperties"; it is trimmed
// to the fields the layer uses. Everything else is passed through untouched.

import type { NextRequest } from "next/server";
import { cached } from "@/lib/server/cache";
import { jsonError, keyFrom, num, proxied, upstreamJson } from "@/lib/server/upstream";

interface TflPlace {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties: Array<{ key: string; value: string; modified: string }>;
}

export interface TrimmedCam {
  id: string;
  name: string;
  lat: number;
  lon: number;
  imageUrl?: string;
  videoUrl?: string;
  available?: boolean;
  view?: string;
  area?: string;
  updated?: string;
}

interface NycCam {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  area: string;
  isOnline: string;
  imageUrl: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const source = q.get("source") ?? "tfl";
  try {
    if (source === "tfl") {
      const r = await cached("cams:tfl", 10 * 60_000, async () => {
        const places = await upstreamJson<TflPlace[]>("tfl", "https://api.tfl.gov.uk/Place/Type/JamCam", {
          timeoutMs: 40_000,
        });
        return places.map((p): TrimmedCam => {
          const props = Object.fromEntries(p.additionalProperties.map((a) => [a.key, a.value]));
          const modified = p.additionalProperties.find((a) => a.key === "imageUrl")?.modified;
          return {
            id: p.id,
            name: p.commonName,
            lat: p.lat,
            lon: p.lon,
            imageUrl: props.imageUrl,
            videoUrl: props.videoUrl,
            available: props.available === "true",
            view: props.view,
            updated: modified,
          };
        });
      });
      return proxied(r.value, { source: "tfl", cacheAge: r.age, trimmed: true });
    }

    if (source === "nyc") {
      const r = await cached("cams:nyc", 10 * 60_000, async () => {
        const cams = await upstreamJson<NycCam[]>("nyctmc", "https://webcams.nyctmc.org/api/cameras", {
          timeoutMs: 40_000,
        });
        return cams.map(
          (c): TrimmedCam => ({
            id: c.id,
            name: c.name,
            lat: c.latitude,
            lon: c.longitude,
            imageUrl: c.imageUrl,
            available: c.isOnline === "true",
            area: c.area,
          }),
        );
      });
      return proxied(r.value, { source: "nyc", cacheAge: r.age, trimmed: true });
    }

    if (source === "windy") {
      const key = keyFrom(req, "WINDY_WEBCAMS_KEY");
      if (!key) return Response.json({ error: "WINDY_WEBCAMS_KEY not set" }, { status: 400 });
      const lat = num(q.get("lat"), 0, -90, 90);
      const lon = num(q.get("lon"), 0, -180, 180);
      const radius = num(q.get("radius"), 100, 1, 250);
      const ck = `cams:windy:${lat.toFixed(1)}:${lon.toFixed(1)}:${Math.round(radius)}`;
      const r = await cached(ck, 5 * 60_000, () =>
        upstreamJson(
          "windy",
          `https://api.windy.com/webcams/api/v3/webcams?lang=en&limit=50&nearby=${lat},${lon},${radius}&include=images,location,player,urls`,
          { headers: { "x-windy-api-key": key } },
        ),
      );
      return proxied(r.value, { source: "windy", cacheAge: r.age });
    }

    return Response.json({ error: `unknown source ${source}` }, { status: 400 });
  } catch (err) {
    return jsonError(err);
  }
}

// Upstreams here can take tens of seconds (Overpass, Launch Library); keep the
// serverless function alive long enough on Vercel.
export const maxDuration = 60;
