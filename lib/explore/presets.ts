// Curated starting points. Each one is just a permalink: a place, a height
// and which layers to switch on. The blurbs say what the layers will show
// there, not facts about the water; the data loads live when you arrive.
//
// Every preset below was probed against the USGS Water Data API on
// 2026-09-10 (gauges and wells inside a one-degree box) before it was
// listed, so none of them lands on an empty map. The hazards & land presets
// were probed on 2026-09-25 with the exact box each layer requests. Fires
// move, so the wildfire preset has no fixed place: it resolves when clicked.

import type { LayerFeature, LayerId } from "@/lib/layers/types";
import type { ShareState } from "@/lib/globe/share";
import type { FireExtra } from "@/lib/hazards/features";

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
  /** Open the community water report on arrival. */
  report?: boolean;
  /** Open the market report on arrival. */
  market?: boolean;
  /** Gallery section; water presets carry no group. */
  group?: "markets" | "constructs" | "hazards";
  /**
   * For places that move (the largest fire): where to go right now, asked
   * when the preset is used. The lat/lon above are the fallback.
   */
  resolve?: () => Promise<Partial<ShareState> | null>;
}

/** The current WFIGS perimeter with the most acres: its anchor, a height that frames it, and a selection. */
async function largestFire(): Promise<Partial<ShareState> | null> {
  const res = await fetch("/api/hazards?op=wildfire");
  if (!res.ok) return null;
  const j = (await res.json()) as { data?: { features?: LayerFeature[] } };
  let best: LayerFeature | null = null;
  for (const f of j.data?.features ?? []) {
    const x = f.properties.extra as FireExtra;
    if (!x.hasPerimeter || x.type !== "WF") continue;
    if (!best || (x.acres ?? 0) > ((best.properties.extra as FireExtra).acres ?? 0)) best = f;
  }
  if (!best) return null;
  const g = best.geometry;
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const r of rings) for (const [lon, lat] of r) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  if (!Number.isFinite(w)) return null;
  const [lon, lat] = best.properties.anchor ?? [(w + e) / 2, (s + n) / 2];
  const spanKm = Math.max(e - w, n - s) * 111;
  return { lon, lat, h: Math.min(400_000, Math.max(40_000, spanKm * 2_200)), sel: { layer: "wildfire", id: best.properties.id } };
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
  // ---- Trade & markets (probed against /api/economy on 2026-09-10)
  {
    id: "world-trade",
    title: "Who trades with whom",
    region: "whole Earth",
    group: "markets",
    blurb: "Countries shaded by goods-and-services trade from the World Bank, the twenty largest labelled with exports. Click any country and its top export markets and import sources arrive as arcs from WITS.",
    lon: -40,
    lat: 25,
    height: 16_000_000,
    layers: ["trade"],
    dwellS: 25,
  },
  {
    id: "la-long-beach",
    title: "Los Angeles & Long Beach",
    region: "San Pedro Bay, California",
    group: "markets",
    blurb: "The two busiest container ports in the country side by side with their BTS TEU history, the counties around them with jobs, wages and home values, and the market report open.",
    lon: -118.22,
    lat: 33.76,
    height: 90_000,
    layers: ["trade", "commerce", "realestate"],
    dwellS: 40,
    market: true,
  },
  {
    id: "houston-ship-channel",
    title: "Houston Ship Channel",
    region: "Texas Gulf Coast",
    group: "markets",
    blurb: "Houston, Texas City, Freeport, Beaumont and Port Arthur: tonnage leaders with their top commodities, beside Harris County's jobs and wages.",
    lon: -95.0,
    lat: 29.7,
    height: 140_000,
    layers: ["trade", "commerce"],
    dwellS: 35,
  },
  {
    id: "laredo",
    title: "Laredo crossings",
    region: "US–Mexico border, Texas",
    group: "markets",
    blurb: "The busiest truck crossing in North America with 25 months of BTS counts, the other Rio Grande ports of entry, and Webb County's jobs.",
    lon: -99.5,
    lat: 27.55,
    height: 160_000,
    layers: ["trade", "commerce"],
    dwellS: 35,
  },
  {
    id: "detroit-windsor",
    title: "Detroit–Windsor",
    region: "US–Canada border, Michigan",
    group: "markets",
    blurb: "The Ambassador Bridge crossing and Port Huron, Detroit's harbour, and Wayne County's sector mix and home values.",
    lon: -83.05,
    lat: 42.3,
    height: 160_000,
    layers: ["trade", "commerce", "realestate"],
    dwellS: 30,
  },
  {
    id: "austin-housing",
    title: "Austin housing",
    region: "Central Texas",
    group: "markets",
    blurb: "Travis, Williamson and Hays counties coloured by the one-year change in Zillow's typical home value, with rents, wages and the mortgage-against-wages estimate in the market report.",
    lon: -97.75,
    lat: 30.3,
    height: 160_000,
    layers: ["realestate", "commerce"],
    dwellS: 35,
    market: true,
  },
  {
    id: "bay-area-values",
    title: "Bay Area values",
    region: "Northern California",
    group: "markets",
    blurb: "The most expensive counties in the country next to the Port of Oakland, with price-to-rent and years-of-wages lines showing what those values mean against local pay.",
    lon: -122.2,
    lat: 37.6,
    height: 220_000,
    layers: ["realestate", "commerce", "trade"],
    dwellS: 35,
    market: true,
  },
  {
    id: "states-markets",
    title: "Fifty states",
    region: "United States",
    group: "markets",
    blurb: "Every state coloured by the one-year change in typical home value with statewide jobs and wages; descend below 2,500 km anywhere and the counties take over.",
    lon: -97,
    lat: 39,
    height: 6_500_000,
    layers: ["realestate", "commerce"],
    dwellS: 25,
  },
  {
    id: "constructs-austin",
    title: "What governs downtown Austin",
    region: "Central Texas",
    group: "constructs",
    blurb: "Thirty-odd constructs float over one block of Congress Avenue: city, county, three legislative districts, school district, tract, metro, six nested watersheds, two ecoregions, a flood zone, a forecast office and three federal regions. Select one to see the gauges and companies inside it.",
    lon: -97.74,
    lat: 30.27,
    height: 60_000,
    layers: ["constructs", "water", "companies"],
    dwellS: 35,
  },
  {
    id: "constructs-field-texas",
    title: "Where Texas's watersheds are busiest",
    region: "Texas",
    group: "constructs",
    blurb: "Subbasins (HUC-8) float over Texas and rise with what the physical layers put inside them: stream gauges, aircraft, company headquarters, earthquakes. Zoom in and subwatersheds emerge; switch the point of view in Layers to see counties or districts instead.",
    lon: -97.7,
    lat: 29.6,
    height: 420_000,
    layers: ["field", "water", "aircraft", "companies", "earthquakes"],
    dwellS: 35,
  },
  {
    id: "constructs-bexar",
    title: "San Antonio's water constructs",
    region: "South Texas",
    group: "constructs",
    blurb: "The watershed chain the San Antonio River drains through, the Blackland Prairie ecoregion and the county and districts over it, with the city's gauges and wells joined to each one by location.",
    lon: -98.49,
    lat: 29.42,
    height: 90_000,
    layers: ["constructs", "water", "groundwater"],
    dwellS: 30,
  },
  // ---- Hazards & land (probed on 2026-09-25 with each layer's own request box)
  {
    id: "largest-fire",
    title: "The largest fire burning now",
    region: "United States · chosen when you click",
    group: "hazards",
    blurb: "Resolves on arrival: the current WFIGS perimeter with the most acres, selected, with its percent contained and how old the perimeter is, and the satellite hotspots of the last 24 hours around it.",
    lon: -113,
    lat: 42,
    height: 3_500_000,
    layers: ["wildfire", "fires", "hazards"],
    dwellS: 35,
    resolve: largestFire,
  },
  {
    id: "hazards-world",
    title: "Hazards worldwide",
    region: "whole Earth",
    group: "hazards",
    blurb: "Every event GDACS marks current, cyclones, floods, droughts, volcanoes, wildfires and quakes, with GDACS's own Green / Orange / Red level and the Orange and Red ones labelled; NASA EONET volcanoes; every FIRMS hotspot of the last 24 hours binned from orbit. Green GDACS quakes that USGS also has are left to the Earthquakes layer. Descend over the United States for NWS warnings.",
    lon: 10,
    lat: 15,
    height: 16_000_000,
    layers: ["hazards", "fires", "earthquakes"],
    dwellS: 25,
  },
  {
    id: "sa-floodplain",
    title: "San Antonio River floodplain",
    region: "Downtown San Antonio, Texas",
    group: "hazards",
    blurb: "FEMA's regulatory flood map at street scale: about a hundred zones, AE and A along the river and its creeks, one with a published base flood elevation of 634.5 ft (NAVD88) at the target. A map of the 1 % annual-chance floodplain, not a forecast.",
    lon: -98.4883,
    lat: 29.4232,
    height: 3_000,
    layers: ["flood", "water"],
    dwellS: 30,
  },
  {
    id: "mitchell-lake",
    title: "Mitchell Lake wetlands",
    region: "South San Antonio, Texas",
    group: "hazards",
    blurb: "About four hundred National Wetlands Inventory polygons around a shallow lake and the Medina and San Antonio river corridors: freshwater ponds, riverine channels, emergent marsh, each with its Cowardin code and acres. NWI mapped them from March 1983 colour-infrared photographs, so the shoreline and marsh may have moved since.",
    lon: -98.43,
    lat: 29.28,
    height: 7_000,
    layers: ["wetlands", "water"],
    dwellS: 30,
  },
  {
    id: "government-canyon",
    title: "Government Canyon",
    region: "Bexar County, Texas",
    group: "hazards",
    blurb: "A 12,344-acre state natural area PAD-US lists as open access, GAP status 2, among some 1,400 public and protected areas around San Antonio, from Joint Base San Antonio to Corps of Engineers lake lands: fee lands filled by whether the public may enter, easements outlined with who holds them, and the owner and manager of every unit as PAD-US publishes them.",
    lon: -98.7556,
    lat: 29.5737,
    height: 40_000,
    layers: ["publiclands", "water"],
    dwellS: 30,
  },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export function presetShare(p: Preset): ShareState {
  return { lat: p.lat, lon: p.lon, h: p.height, layers: p.layers, report: p.report || undefined, market: p.market || undefined };
}

/** presetShare, with a moving preset resolved to where it is now (falls back to the fixed place). */
export async function presetTarget(p: Preset): Promise<ShareState> {
  const base = presetShare(p);
  if (!p.resolve) return base;
  try {
    const r = await p.resolve();
    return r ? { ...base, ...r } : base;
  } catch {
    return base;
  }
}

/** Presets in gallery order, grouped. */
export const PRESET_GROUPS: Array<{ title: string; presets: Preset[] }> = [
  { title: "Water", presets: PRESETS.filter((p) => !p.group) },
  { title: "Trade & markets", presets: PRESETS.filter((p) => p.group === "markets") },
  { title: "Constructs", presets: PRESETS.filter((p) => p.group === "constructs") },
  { title: "Hazards & land", presets: PRESETS.filter((p) => p.group === "hazards") },
];
