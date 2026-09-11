"use client";
// Take the data with you: what the water layers currently hold, as files.

import type { Point } from "geojson";
import { getRenderer } from "@/lib/globe/registry";
import type { LayerFeature } from "@/lib/layers/types";
import type { ChipExtra } from "@/lib/layers/turbidity";
import type { GaugeExtra, ReservoirExtra } from "@/lib/water/features";
import { useGlobe } from "@/lib/store/globe";

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  useGlobe.getState().pushLog({ level: "info", text: `Saved ${filename}` });
}

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Turbidity chips as GeoJSON, scene provenance on every feature. */
export function chipsGeoJson(): { count: number; text: string } {
  const r = getRenderer("turbidity");
  const features = r ? [...r.features()] : [];
  const out = {
    type: "FeatureCollection",
    generated: new Date().toISOString(),
    method: "Dogliotti et al. 2015 single-band turbidity on Sentinel-2 L2A water pixels; 640 m chips; estimates, not measurements",
    features: features.map((f) => {
      const x = f.properties.extra as ChipExtra;
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [x.bounds.west, x.bounds.south],
              [x.bounds.east, x.bounds.south],
              [x.bounds.east, x.bounds.north],
              [x.bounds.west, x.bounds.north],
              [x.bounds.west, x.bounds.south],
            ],
          ],
        },
        properties: {
          id: f.properties.id,
          median_fnu: x.stats.median,
          p10_fnu: x.stats.p10,
          p90_fnu: x.stats.p90,
          mean_fnu: x.stats.mean,
          water_pixels: x.stats.n,
          total_pixels: x.totalPixels,
          low_confidence: x.lowConfidence,
          scene_id: x.scene.id,
          scene_datetime: x.scene.datetime,
          scene_cloud_pct: x.scene.cloud,
          window_cloud_pct: x.scene.localCloud * 100,
          ground_pixel_m: x.scene.pixelM,
          dn_convention: x.scene.convention,
          dn_check_pass: x.scene.check.pass,
          stac_item: x.scene.stacUrl,
          gauge_site: x.insitu?.site,
          gauge_distance_m: x.insitu?.distanceM,
          gauge_latest_fnu: x.insitu?.latest.value,
          gauge_at_overpass_fnu: x.insitu?.atOverpass?.value,
        },
      };
    }),
  };
  return { count: features.length, text: JSON.stringify(out) };
}

/** Every gauge / reservoir reading in the surface-water layer as CSV. */
export function gaugesCsv(): { count: number; text: string } {
  const r = getRenderer("water");
  const rows: string[] = ["feature_id,site,name,kind,lon,lat,parameter,value,unit,observed,flood_category,quality_index,source"];
  let n = 0;
  if (r) {
    for (const f of r.features() as IterableIterator<LayerFeature<Point>>) {
      const k = f.properties.kind;
      if (k !== "gauge" && k !== "reservoir" && k !== "flood-gauge") continue;
      n++;
      const [lon, lat] = f.geometry.coordinates;
      const x = f.properties.extra as GaugeExtra | ReservoirExtra;
      if ("readings" in x) {
        const entries = Object.entries(x.readings);
        if (entries.length === 0) {
          rows.push(
            [f.properties.id, x.site, f.properties.name, k, lon, lat, "", "", "", "", x.flood?.category ?? "", "", f.properties.source]
              .map(csvCell)
              .join(","),
          );
        }
        for (const [param, rd] of entries) {
          if (!rd) continue;
          rows.push(
            [f.properties.id, x.site, f.properties.name, k, lon, lat, param, rd.value, rd.unit, rd.time, x.flood?.category ?? "", x.index?.score ?? "", f.properties.source]
              .map(csvCell)
              .join(","),
          );
        }
      } else {
        rows.push(
          [f.properties.id, f.properties.id.replace("twdb:", ""), f.properties.name, k, lon, lat, "percent_full", x.percentFull ?? "", "%", "", "", "", f.properties.source]
            .map(csvCell)
            .join(","),
        );
      }
    }
  }
  return { count: n, text: rows.join("\n") };
}

export function exportChips() {
  const { count, text } = chipsGeoJson();
  if (!count) {
    useGlobe.getState().pushLog({ level: "warn", text: "No turbidity chips loaded to export." });
    return;
  }
  downloadText(`turbidity-chips-${stamp()}.geojson`, text, "application/geo+json");
}

export function exportGauges() {
  const { count, text } = gaugesCsv();
  if (!count) {
    useGlobe.getState().pushLog({ level: "warn", text: "No gauges loaded to export; descend below 1,500 km first." });
    return;
  }
  downloadText(`water-gauges-${stamp()}.csv`, text, "text/csv");
}
