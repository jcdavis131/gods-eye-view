// Curated starting points. Each one is just a permalink: a place, a height
// and which layers to switch on. The blurbs say what the layers will show
// there, not facts about the water; the data loads live when you arrive.
//
// Every preset below was probed against the USGS Water Data API on
// 2026-09-10 (gauges and wells inside a one-degree box) before it was
// listed, so none of them lands on an empty map.

import type { LayerId } from "@/lib/layers/types";
import type { ShareState } from "@/lib/globe/share";

export interface Preset {
  id: string;
  title: string;
  region: string;
  blurb: string;
  lon: number;
  lat: number;
  height: number;
  layers: LayerId[];
  /** Seconds the tour lingers here. */
  dwellS?: number;
  report?: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: "planet",
    title: "The planet's water",
    region: "whole Earth",
    blurb: "Every named river and lake from orbit with this week's US Drought Monitor classes draped on the ground. Descend below 1,500 km anywhere in the United States and the gauges appear.",
    lon: -97.7,
    lat: 30,
    height: 12_000_000,
    layers: ["water", "groundwater"],
    dwellS: 18,
  },
  {
    id: "bexar-reservoirs",
    title: "Calaveras & Braunig",
    region: "San Antonio, Texas",
    blurb: "Two reservoirs and the Medina River at 60 km: turbidity chips computed in your browser from the latest clear Sentinel-2 pass, next to USGS turbidity gauges with their reading at the overpass. This is the scene family the physics was validated on.",
    lon: -98.34,
    lat: 29.28,
    height: 60_000,
    layers: ["water", "turbidity", "groundwater"],
    dwellS: 45,
    report: true,
  },
  {
    id: "edwards-aquifer",
    title: "Edwards Aquifer wells",
    region: "San Antonio, Texas",
    blurb: "USGS monitoring wells labelled by the aquifer they tap, the drought class under the city, and stream gauges with full quality panels (oxygen, pH, conductance, turbidity). Open the water report for the arithmetic.",
    lon: -98.49,
    lat: 29.42,
    height: 120_000,
    layers: ["water", "groundwater"],
    dwellS: 30,
    report: true,
  },
  {
    id: "highland-lakes",
    title: "Highland Lakes",
    region: "Austin, Texas",
    blurb: "Texas Water Development Board reservoirs with percent-full and USGS reservoir gauges along the Colorado River chain. The report weights storage by capacity here, the one place the data allows it.",
    lon: -97.9,
    lat: 30.4,
    height: 120_000,
    layers: ["water", "groundwater"],
    dwellS: 30,
    report: true,
  },
  {
    id: "lake-mead",
    title: "Lake Mead & Hoover Dam",
    region: "Nevada / Arizona",
    blurb: "The densest water-quality instrumentation the presets were probed against: dozens of USGS turbidity and dissolved-oxygen gauges around the reservoir, with satellite turbidity chips to compare against them.",
    lon: -114.74,
    lat: 36.05,
    height: 150_000,
    layers: ["water", "turbidity", "groundwater"],
    dwellS: 45,
  },
  {
    id: "chesapeake",
    title: "Chesapeake Bay",
    region: "Annapolis, Maryland",
    blurb: "An estuary rather than a lake: USGS turbidity gauges on the tributaries, monitoring wells on the coastal plain, and Sentinel-2 chips over the bay itself.",
    lon: -76.45,
    lat: 38.95,
    height: 120_000,
    layers: ["water", "turbidity"],
    dwellS: 40,
  },
  {
    id: "lake-erie",
    title: "Western Lake Erie",
    region: "Toledo, Ohio",
    blurb: "The shallow western basin at 150 km with gauges on the Maumee and its neighbours, wells inland, and satellite turbidity chips across the open water.",
    lon: -83.4,
    lat: 41.7,
    height: 150_000,
    layers: ["water", "turbidity", "groundwater"],
    dwellS: 40,
  },
  {
    id: "okeechobee",
    title: "Lake Okeechobee",
    region: "Florida",
    blurb: "A large, shallow lake at 150 km: stream gauges on the canals, wells across the surrounding basin and turbidity chips over the lake.",
    lon: -80.8,
    lat: 26.95,
    height: 150_000,
    layers: ["water", "turbidity", "groundwater"],
    dwellS: 40,
  },
  {
    id: "baton-rouge",
    title: "Mississippi & Atchafalaya",
    region: "Baton Rouge, Louisiana",
    blurb: "Stream gauges with NWS flood categories along the lower Mississippi and the Atchafalaya basin at 200 km; drop below 100 km over the delta for satellite turbidity at 20 m.",
    lon: -91.3,
    lat: 30,
    height: 200_000,
    layers: ["water", "groundwater"],
    dwellS: 30,
  },
  {
    id: "el-paso",
    title: "Rio Grande at El Paso",
    region: "Texas / New Mexico",
    blurb: "A groundwater story: USGS wells on both sides of the river, the aquifers they draw from, and the drought class over the border basin.",
    lon: -106.5,
    lat: 31.75,
    height: 120_000,
    layers: ["groundwater", "water"],
    dwellS: 30,
    report: true,
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function presetShare(p: Preset): ShareState {
  return { lat: p.lat, lon: p.lon, h: p.height, layers: p.layers, report: p.report || undefined };
}
