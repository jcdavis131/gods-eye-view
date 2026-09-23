// LiveFeed API: where the world is doing something unusual right now.
//
//   /api/live     NWS active alerts rated Severe or Extreme (with the polygon
//                  the forecaster drew, or the outlines of the zones the alert
//                  names), the past day's M4.5+ earthquakes, and both merged
//                  into one list in tour order (severity, urgency and
//                  certainty as NWS rates them; magnitude and PAGER alert as
//                  USGS publishes them).
//
// The alerts layer draws the warnings as short-lived constructs; Teleport flies
// through the items. Cached five minutes; a failing feed leaves the other.

import { cached, cacheDelete } from "@/lib/server/cache";
import { ok, options } from "@/lib/server/respond";
import { jsonError } from "@/lib/server/upstream";
import { provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { fetchLive } from "@/lib/live/fetch";

export const maxDuration = 60;
export const OPTIONS = options;

const TTL_S = 300;

export async function GET() {
  try {
    const r = await cached("live", TTL_S * 1000, fetchLive);
    const p = r.value;
    if (p.failed.length) cacheDelete("live");
    const retrievedAt = new Date(Date.now() - r.age).toISOString();
    const caveats = [
      "Alerts are the NWS's own Severe and Extreme ratings; the tour order uses only the fields NWS and USGS publish and is not a risk score.",
      "A warning drawn by zone covers the whole of each zone it names; a polygon warning covers only what the forecaster drew.",
      ...p.failed.map((f) => `${f.source} did not answer (${f.error}); its items are missing, not absent.`),
    ];
    if (p.unmapped) caveats.push(`${p.unmapped} alert${p.unmapped === 1 ? "" : "s"} could not be outlined and are not on the globe.`);
    return ok(p, {
      provenance: [
        provenance(source("nws-api"), { kind: "snapshot", retrievedAt, upstreamUrl: "https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe" }),
        provenance(source("usgs-earthquakes"), { kind: "snapshot", retrievedAt, upstreamUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson" }),
      ],
      caveats,
      ttlS: p.failed.length ? 0 : TTL_S,
      meta: { source: "nws-api, usgs-earthquakes", alerts: p.alerts.length, quakes: p.quakes.length, cacheAge: r.age },
    });
  } catch (err) {
    return jsonError(err);
  }
}
