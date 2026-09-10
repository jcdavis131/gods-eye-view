// Layer 9: groundwater and drought. What is under the ground and how dry
// the ground above it is.
//
//   USGS latest-daily wells   depth to water (72019, feet below land surface,
//                             deeper = falling table) or water-level elevation
//                             (62610 / 62611, higher = rising), joined to the
//                             USGS national aquifer name of each well
//   US Drought Monitor        this week's D0–D4 polygons (USDM / NDMC / USDA / NOAA)
//
// Wells load below WELL_MAX_HEIGHT_M; drought polygons are always drawn.

import type { MultiPolygon, Point, Polygon } from "geojson";
import type { WellReading } from "@/app/api/water/route";
import { fmtReading, isStale, PARAM_INFO, type Reading } from "@/lib/water/quality";
import type { BaseProps, FetchContext, FetchResult, LayerDefinition, LayerFeature } from "./types";
import { proxy } from "./aircraft";
import { viewBbox } from "./water";

export const WELL_MAX_HEIGHT_M = 1_500_000;

export interface WellExtra {
  site: string;
  readings: Partial<Record<string, Reading>>;
  /** Parameter charted when selected. */
  primary: string;
  aquifer?: string;
  aquiferCode?: string;
  localAquifer?: string;
  wellDepthFt?: number;
  stale: boolean;
}

export interface DroughtExtra {
  /** 0 abnormally dry … 4 exceptional drought. */
  dm: number;
}

export const DROUGHT_LABEL = ["D0 abnormally dry", "D1 moderate drought", "D2 severe drought", "D3 extreme drought", "D4 exceptional drought"];
/** USDM's own map colours. */
export const DROUGHT_COLOR = ["#FFFF00", "#FCD37F", "#FFAA00", "#E60000", "#730000"];

let drought: Promise<LayerFeature[]> | null = null;
let droughtAt = 0;

function loadDrought(ctx: FetchContext): Promise<LayerFeature[]> {
  if (!drought || ctx.now - droughtAt > 6 * 3600_000) {
    droughtAt = ctx.now;
    drought = proxy<GeoJSON.FeatureCollection>("/api/water?op=drought", { ...ctx, signal: undefined })
      .then((env) => {
        const out: LayerFeature[] = [];
        for (const f of env.data.features) {
          const dm = Number((f.properties as { DM?: number } | null)?.DM);
          if (!Number.isFinite(dm) || dm < 0 || dm > 4) continue;
          if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
          out.push({
            type: "Feature",
            geometry: f.geometry as Polygon | MultiPolygon,
            properties: {
              id: `usdm:D${dm}`,
              layer: "groundwater",
              name: DROUGHT_LABEL[dm],
              kind: "drought",
              source: "US Drought Monitor",
              details: {
                class: `D${dm}`,
                meaning: [
                  "going into drought: short-term dryness slowing planting; coming out: lingering deficits",
                  "some damage to crops and pastures; streams, reservoirs or wells low; voluntary water-use restrictions requested",
                  "crop or pasture losses likely; water shortages common; restrictions imposed",
                  "major crop and pasture losses; widespread water shortages or restrictions",
                  "exceptional and widespread crop and pasture losses; shortages in reservoirs, streams and wells creating water emergencies",
                ][dm],
                "usdm map": "https://droughtmonitor.unl.edu/CurrentMap.aspx",
              },
              extra: { dm } satisfies DroughtExtra,
            },
          });
        }
        return out;
      })
      .catch((err) => {
        drought = null;
        throw err;
      });
  }
  return drought;
}

function buildWells(rows: WellReading[], now: number): LayerFeature<Point>[] {
  const bySite = new Map<string, WellReading[]>();
  for (const r of rows) {
    const list = bySite.get(r.site) ?? [];
    list.push(r);
    bySite.set(r.site, list);
  }
  const out: LayerFeature<Point>[] = [];
  for (const [site, list] of bySite) {
    const readings: Partial<Record<string, Reading>> = {};
    let latest = 0;
    for (const r of list) {
      const t = Date.parse(r.time);
      const prev = readings[r.param];
      if (!prev || Date.parse(prev.time) < t) readings[r.param] = { value: r.value, unit: r.unit, time: r.time };
      if (t > latest) latest = t;
    }
    const primary = ["72019", "62611", "62610"].find((c) => readings[c]);
    if (!primary) continue;
    const first = list[0];
    const details: BaseProps["details"] = {};
    for (const c of ["72019", "62611", "62610"]) {
      const r = readings[c];
      if (!r) continue;
      details[PARAM_INFO[c].label] = `${fmtReading(c, r)} · ${r.time.slice(0, 10)}${isStale(r.time, now) ? " · STALE" : ""}`;
    }
    details["aquifer"] = first.aquifer ?? (first.aquiferCode ? `code ${first.aquiferCode}` : "not recorded");
    details["local aquifer code"] = first.localAquifer;
    details["well depth"] = first.wellDepthFt != null ? `${first.wellDepthFt} ft` : null;
    details["reading"] = primary === "72019" ? "depth below land surface: deeper means a falling water table" : "water-level elevation: higher means a rising water table";
    details["approval"] = first.approval;
    details["site"] = site;
    details["usgs page"] = `https://waterdata.usgs.gov/monitoring-location/${site.replace("USGS-", "")}/`;
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [first.lon, first.lat, 0] },
      properties: {
        id: `well:${site}`,
        layer: "groundwater",
        name: first.name ?? site,
        kind: "well",
        altitude: 0,
        observedAt: latest || undefined,
        source: "USGS",
        details,
        extra: {
          site,
          readings,
          primary,
          aquifer: first.aquifer,
          aquiferCode: first.aquiferCode,
          localAquifer: first.localAquifer,
          wellDepthFt: first.wellDepthFt,
          stale: latest > 0 && now - latest > 7 * 86_400_000,
        } satisfies WellExtra,
      },
    });
  }
  return out;
}

async function fetchGroundwater(ctx: FetchContext): Promise<FetchResult> {
  const notes: string[] = [];
  const sources: string[] = [];
  const features: LayerFeature[] = [];
  const droughtFeatures = await loadDrought(ctx).catch((e: Error) => {
    notes.push(`USDM: ${e.message.slice(0, 60)}`);
    return [] as LayerFeature[];
  });
  if (droughtFeatures.length) sources.push("USDM");
  features.push(...droughtFeatures);

  let wells: LayerFeature<Point>[] = [];
  if (ctx.view.height <= WELL_MAX_HEIGHT_M) {
    const bbox = viewBbox(ctx, 250_000);
    const env = await proxy<WellReading[]>(`/api/water?op=wells&bbox=${bbox.map((x) => x.toFixed(2)).join(",")}`, ctx).catch(
      (e: Error) => {
        notes.push(`USGS: ${e.message.slice(0, 60)}`);
        return null;
      },
    );
    if (env) {
      wells = buildWells(env.data, ctx.now);
      sources.push("USGS");
      const aquifers = new Set(wells.map((w) => (w.properties.extra as WellExtra).aquifer).filter(Boolean));
      notes.unshift(`${wells.length} wells · ${aquifers.size} named aquifers`);
    }
    features.push(...wells);
  } else {
    notes.unshift(`drought classes D0–D4 · descend below ${Math.round(WELL_MAX_HEIGHT_M / 1000)} km for wells`);
  }

  return {
    collection: { type: "FeatureCollection", features },
    source: sources.join(" + ") || "none",
    fetchedAt: ctx.now,
    note: notes.join(" · "),
    meta: { count: wells.length },
  };
}

export const groundwaterLayer: LayerDefinition = {
  id: "groundwater",
  label: "Aquifers & drought",
  description:
    "USGS monitoring wells with depth-to-water and the aquifer each one taps, over this week's US Drought Monitor classes.",
  color: "#D7B36A",
  updateIntervalMs: 30 * 60_000,
  defaultEnabled: false,
  viewDependent: true,
  attribution: "USGS Water Data · US Drought Monitor (NDMC, USDA, NOAA)",
  fetch: fetchGroundwater,
};
