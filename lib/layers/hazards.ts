// Layer: hazard alerts. Warnings and disaster events as their publishers
// rate them, next to the earthquakes and live-warnings layers.
//
//   NWS alerts/active   every active US watch, warning and advisory with its
//                       severity, urgency and certainty. Drawn as the polygon
//                       NWS published, or else as the counties the alert lists
//                       in its SAME codes (TIGERweb 1:20M); marine and other
//                       zone-only alerts with no county are counted, not drawn
//   GDACS               every event GDACS marks current (floods, cyclones,
//                       droughts, volcanoes, wildfires, earthquakes) with its
//                       Green / Orange / Red alert level: the RSS feed, merged
//                       with the latest-100 list and a search for current
//                       Orange and Red events
//   NASA EONET          open volcano events (no severity published)
//
// Two other layers draw some of the same events, and this one steps aside
// for them only while they are on:
//   - a GDACS quake that the USGS 24 h feed also has is left to the
//     Earthquakes layer, and only when GDACS rates it Green; Orange, Red and
//     unrated quakes always stay;
//   - an NWS alert rated Severe or Extreme is left to Live warnings (the
//     alerts layer, whose feed asks NWS for exactly those; LIVE_SEVERITIES).
//     Moderate, Minor and unrated alerts stay here either way.
// With both layers off, every event is drawn here. A severity the source did
// not publish is shown as "not rated by source" in its own colour; it is
// never drawn as calm.

import type { FeatureCollection } from "geojson";
import { hideableQuake, leftToLiveWarnings, type HazardAlertExtra } from "@/lib/hazards/features";
import type { FetchContext, FetchResult, LayerDefinition, LayerFeature, LayerId } from "./types";
import { proxy } from "./aircraft";

export type { HazardAlertExtra } from "@/lib/hazards/features";

interface AlertsEnvelope {
  counts?: {
    nws?: { alerts: number; drawnAsPolygon: number; drawnAsCounties: number; notDrawn: number };
    gdacs?: { events: number; quakesAlsoInUsgs: number; usgsChecked: boolean; via: string[]; failed: string[]; truncated: boolean };
    eonet?: { volcanoes: number };
  };
  failed?: string[];
}

/**
 * What this layer draws given which of the overlapping layers are on: the
 * features kept, the Green GDACS quakes left to Earthquakes, and the Severe
 * and Extreme NWS alerts left to Live warnings.
 */
export function stepAside(
  all: LayerFeature[],
  layersOn: Partial<Record<LayerId, boolean>> | undefined,
): { features: LayerFeature[]; quakesHidden: number; leftToLive: number } {
  const quakesOn = layersOn?.earthquakes === true;
  const liveOn = layersOn?.alerts === true;
  let quakesHidden = 0;
  let leftToLive = 0;
  const features = all.filter((f) => {
    const x = f.properties.extra as HazardAlertExtra | undefined;
    if (quakesOn && x && hideableQuake(x)) {
      quakesHidden++;
      return false;
    }
    if (liveOn && leftToLiveWarnings(x)) {
      leftToLive++;
      return false;
    }
    return true;
  });
  return { features, quakesHidden, leftToLive };
}

async function fetchHazards(ctx: FetchContext): Promise<FetchResult> {
  const env = await proxy<FeatureCollection>("/api/hazards?op=alerts", ctx);
  const meta = env as unknown as AlertsEnvelope;
  const all = env.data.features as unknown as LayerFeature[];
  const { features, quakesHidden: hidden, leftToLive } = stepAside(all, ctx.layersOn);
  const c = meta.counts ?? {};
  const notes: string[] = [];
  if (c.nws) {
    notes.push(
      `NWS ${c.nws.alerts} alerts: ${c.nws.drawnAsPolygon} polygons, ${c.nws.drawnAsCounties} by county` +
        (c.nws.notDrawn ? `, ${c.nws.notDrawn} with no drawable area (marine/zone, no polygon published)` : "") +
        (leftToLive
          ? ` · ${leftToLive} Severe/Extreme ${leftToLive === 1 ? "alert" : "alerts"} left to Live warnings while that layer is on (it draws those it can outline and counts the rest)`
          : ""),
    );
  }
  if (c.gdacs) {
    notes.push(
      `GDACS ${c.gdacs.events} current events` +
        (c.gdacs.truncated ? " · GDACS list may be incomplete" : "") +
        (c.gdacs.failed?.length ? ` · GDACS ${c.gdacs.failed.join(", ")} unavailable` : "") +
        (hidden
          ? ` · ${hidden} Green ${hidden === 1 ? "quake" : "quakes"} hidden while the Earthquakes layer is on (the USGS 24 h feed has ${hidden === 1 ? "it" : "them"} within 100 km and 30 min)`
          : "") +
        (c.gdacs.usgsChecked ? "" : " · USGS feed unavailable, no GDACS quake hidden"),
    );
  }
  if (c.eonet) notes.push(`EONET ${c.eonet.volcanoes} volcanoes`);
  if (meta.failed?.length) notes.push(`down: ${meta.failed.join(", ")}`);
  const sources = ["NWS", "GDACS", "EONET"].filter((s) => !meta.failed?.includes(s));
  return {
    collection: { type: "FeatureCollection", features },
    source: sources.join(" + ") || "none",
    fetchedAt: ctx.now,
    note: notes.join(" · "),
    meta: { count: features.length },
  };
}

export const hazardsLayer: LayerDefinition = {
  id: "hazards",
  label: "Hazard alerts",
  description:
    "Active NWS watches, warnings and advisories, every GDACS event marked current (floods, cyclones, droughts, volcanoes, wildfires, earthquakes) and NASA EONET open volcano events, each with the severity its publisher gives. Unrated events are marked as such, never as calm. Severe and Extreme NWS alerts are left to Live warnings while that layer is on.",
  color: "#FF9A3D",
  updateIntervalMs: 3 * 60_000,
  defaultEnabled: false,
  // What is left to another layer depends on whether Earthquakes and Live warnings are on.
  dependsOn: ["earthquakes", "alerts"],
  attribution: "NWS (public domain) · GDACS, EC-JRC (CC BY 4.0) · NASA EONET · TIGERweb",
  fetch: fetchHazards,
};
