"use client";
// The one command registry every voice path talks to.
//
//   Web Speech API  ->  local intent parser  ->  runCommand()
//   ElevenLabs agent -> clientTools           ->  runCommand()
//   Vapi assistant   -> function-call message ->  runCommand()
//
// Each command returns a short sentence the agent can speak back.

import { flyTo, flyToSelection, homeView, startFollowing, stopFollowing } from "@/lib/globe/camera";
import { goLive, setMissionTime } from "@/lib/globe/clock";
import { allFeatures } from "@/lib/globe/registry";
import { LAYERS, LAYER_BY_ID } from "@/lib/layers";
import type { LayerId } from "@/lib/layers/types";
import { useGlobe } from "@/lib/store/globe";
import { geocode, heightForPlace } from "@/components/hud/SearchCommand";
import { formatDistance, formatLatLon } from "@/lib/globe/geo";
import { speakReport } from "@/lib/water/report";
import { reportFromGlobe } from "@/lib/water/reportClient";
import { speakMarketReport } from "@/lib/economy/report";
import { marketReportFromGlobe } from "@/lib/economy/reportClient";
import { PRESETS, presetShare } from "@/lib/explore/presets";
import { applyShare } from "@/lib/globe/share";

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}

export interface CommandDef {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<string>;
}

const LAYER_ALIASES: Record<string, LayerId> = {
  aircraft: "aircraft",
  airplanes: "aircraft",
  planes: "aircraft",
  flights: "aircraft",
  flight: "aircraft",
  jets: "aircraft",
  ships: "ships",
  ship: "ships",
  vessels: "ships",
  boats: "ships",
  satellites: "satellites",
  satellite: "satellites",
  sats: "satellites",
  orbit: "satellites",
  earthquakes: "earthquakes",
  quakes: "earthquakes",
  seismic: "earthquakes",
  cameras: "cameras",
  webcams: "cameras",
  cctv: "cameras",
  traffic: "traffic",
  cars: "traffic",
  launches: "launches",
  rockets: "launches",
  rocket: "launches",
  water: "water",
  rivers: "water",
  river: "water",
  lakes: "water",
  lake: "water",
  reservoirs: "water",
  reservoir: "water",
  gauges: "water",
  "stream gauges": "water",
  floods: "water",
  flooding: "water",
  hydrology: "water",
  groundwater: "groundwater",
  aquifers: "groundwater",
  aquifer: "groundwater",
  wells: "groundwater",
  drought: "groundwater",
  turbidity: "turbidity",
  sediment: "turbidity",
  "water quality": "turbidity",
  "satellite water": "turbidity",
  trade: "trade",
  ports: "trade",
  port: "trade",
  harbours: "trade",
  harbors: "trade",
  shipping: "trade",
  borders: "trade",
  "border crossings": "trade",
  crossings: "trade",
  commerce: "commerce",
  jobs: "commerce",
  employment: "commerce",
  wages: "commerce",
  business: "commerce",
  economy: "commerce",
  "real estate": "realestate",
  housing: "realestate",
  "home values": "realestate",
  homes: "realestate",
  rents: "realestate",
  property: "realestate",
  "property values": "realestate",
};

export function resolveLayer(word: string | undefined): LayerId | null {
  if (!word) return null;
  const w = word.toLowerCase().trim();
  return LAYER_ALIASES[w] ?? (LAYER_BY_ID[w as LayerId] ? (w as LayerId) : null);
}

async function goToPlace(place: string, altitudeKm?: number): Promise<string> {
  const hits = await geocode(place);
  if (hits.length === 0) return `I could not find a place called ${place}.`;
  const h = hits[0];
  const height = altitudeKm ? altitudeKm * 1000 : heightForPlace(h);
  flyTo(h.lon, h.lat, { height });
  return `Moving over ${h.name.split(",").slice(0, 2).join(",")}.`;
}

export const COMMANDS: CommandDef[] = [
  {
    name: "fly_to_place",
    description: "Move the camera over a named place (city, country, airport, landmark).",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Place name, e.g. 'Austin, Texas' or 'Heathrow'" },
        altitude_km: { type: "number", description: "Optional camera altitude in kilometres" },
      },
      required: ["place"],
    },
    run: async (a) => goToPlace(String(a.place ?? ""), a.altitude_km ? Number(a.altitude_km) : undefined),
  },
  {
    name: "show_layer",
    description: "Turn a data layer on or off, optionally moving over a place first.",
    parameters: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          description: "Layer id",
          enum: LAYERS.map((l) => l.id),
        },
        on: { type: "boolean", description: "true to show, false to hide" },
        place: { type: "string", description: "Optional place to fly to" },
      },
      required: ["layer", "on"],
    },
    run: async (a) => {
      const id = resolveLayer(String(a.layer ?? ""));
      if (!id) return `Unknown layer ${a.layer}.`;
      const on = a.on !== false && a.on !== "false";
      useGlobe.getState().setLayer(id, on);
      const label = LAYER_BY_ID[id]?.label ?? id;
      let msg = `${label} ${on ? "on" : "off"}.`;
      if (a.place) msg = `${await goToPlace(String(a.place))} ${msg}`;
      return msg;
    },
  },
  {
    name: "find_object",
    description: "Find a flight, ship, satellite or camera among loaded objects by callsign, name or id and fly to it.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Callsign, vessel name, satellite name, MMSI or ICAO hex" },
        follow: { type: "boolean", description: "Keep the camera locked on it" },
      },
      required: ["query"],
    },
    run: async (a) => {
      const q = String(a.query ?? "").trim().toLowerCase().replace(/\s+/g, "");
      if (!q) return "What should I look for?";
      let best: { score: number; layer: LayerId; id: string; name: string } | null = null;
      for (const f of allFeatures()) {
        const p = f.properties;
        const name = p.name.toLowerCase().replace(/\s+/g, "");
        const id = p.id.toLowerCase();
        let score = 0;
        if (name === q || id === q) score = 3;
        else if (name.startsWith(q) || id.startsWith(q)) score = 2;
        else if (name.includes(q)) score = 1;
        if (score > (best?.score ?? 0)) best = { score, layer: p.layer, id: p.id, name: p.name };
      }
      if (!best) return `No loaded object matches ${a.query}. Try turning on the right layer or moving closer.`;
      const follow = a.follow === true || a.follow === "true";
      flyToSelection({ layer: best.layer, id: best.id }, follow);
      return `${follow ? "Tracking" : "Found"} ${best.name}.`;
    },
  },
  {
    name: "follow_selected",
    description: "Lock or release the camera on the currently selected object.",
    parameters: {
      type: "object",
      properties: { on: { type: "boolean", description: "true to follow, false to release" } },
      required: ["on"],
    },
    run: async (a) => {
      const on = a.on !== false && a.on !== "false";
      if (on) {
        if (!useGlobe.getState().selected) return "Nothing is selected.";
        startFollowing();
        return "Camera locked.";
      }
      stopFollowing();
      return "Camera released.";
    },
  },
  {
    name: "set_time",
    description: "Move the mission clock: back or forward by minutes, or snap to live.",
    parameters: {
      type: "object",
      properties: {
        offset_minutes: { type: "number", description: "Offset from now in minutes; negative = past" },
        live: { type: "boolean", description: "true to return to live time" },
      },
    },
    run: async (a) => {
      if (a.live === true || a.live === "true" || a.offset_minutes == null) {
        goLive();
        return "Mission clock is live.";
      }
      const m = Number(a.offset_minutes);
      setMissionTime(Date.now() + m * 60_000);
      return `Mission clock set to ${m < 0 ? Math.abs(m) + " minutes ago" : m + " minutes ahead"}.`;
    },
  },
  {
    name: "home_view",
    description: "Zoom out to the whole planet.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      homeView();
      return "Pulling back to orbit.";
    },
  },
  {
    name: "water_report",
    description:
      "Community water report for a place or the current view: drought class, reservoir levels, stream gauge flood status and quality screening, groundwater wells and aquifers, satellite turbidity, and an explicit supply-stress estimate.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Optional place to fly to first, e.g. 'San Antonio'" },
      },
    },
    run: async (a) => {
      const st = useGlobe.getState();
      let prefix = "";
      if (a.place) prefix = (await goToPlace(String(a.place), 120)) + " ";
      st.setLayer("water", true);
      st.setLayer("groundwater", true);
      st.setWaterReportOpen(true);
      // Give the layers a moment to land before reading them.
      await new Promise((r) => setTimeout(r, a.place ? 6000 : 1500));
      const v = useGlobe.getState().view;
      const report = reportFromGlobe(v.lon, v.lat);
      return prefix + speakReport(report);
    },
  },
  {
    name: "market_report",
    description:
      "Market report for a place or the current view: typical home value and rent with one- and five-year changes, a mortgage-against-wages estimate, jobs and wages, the nearest ports and border crossings, and a momentum index with its formula.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Optional place to fly to first, e.g. 'Austin'" },
      },
    },
    run: async (a) => {
      const st = useGlobe.getState();
      let prefix = "";
      if (a.place) prefix = (await goToPlace(String(a.place), 150)) + " ";
      st.setLayer("realestate", true);
      st.setLayer("commerce", true);
      st.setLayer("trade", true);
      st.setMarketReportOpen(true);
      await new Promise((r) => setTimeout(r, a.place ? 7000 : 2000));
      const v = useGlobe.getState().view;
      return prefix + speakMarketReport(marketReportFromGlobe(v.lon, v.lat));
    },
  },
  {
    name: "explore_preset",
    description: "Jump to one of the curated explorations (a place with the right layers switched on: water, ports, housing markets), or start the guided tour.",
    parameters: {
      type: "object",
      properties: {
        preset: { type: "string", description: "Preset id or a word from its title", enum: PRESETS.map((p) => p.id) },
        tour: { type: "boolean", description: "true to start the guided tour instead" },
      },
    },
    run: async (a) => {
      const st = useGlobe.getState();
      if (a.tour === true || a.tour === "true") {
        st.setTour({ active: true, index: 0, startedAt: Date.now(), paused: false });
        return "Starting the tour.";
      }
      const q = String(a.preset ?? "").toLowerCase();
      const p = PRESETS.find((x) => x.id === q) ?? PRESETS.find((x) => `${x.title} ${x.region}`.toLowerCase().includes(q));
      if (!p) return `No preset matches ${a.preset}. Try one of: ${PRESETS.map((x) => x.title).join(", ")}.`;
      applyShare(presetShare(p));
      return `${p.title}, ${p.region}. ${p.blurb}`;
    },
  },
  {
    name: "describe_view",
    description: "Summarise what the operator is looking at: camera target, altitude, layer counts, selection.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const s = useGlobe.getState();
      const parts = [`Camera over ${formatLatLon(s.view.lat, s.view.lon)} at ${formatDistance(s.view.height)}.`];
      const on = LAYERS.filter((l) => s.layers[l.id]);
      if (on.length) {
        parts.push(
          "Layers: " +
            on.map((l) => `${l.label} ${s.status[l.id]?.count ?? 0}${l.simulated ? " simulated" : ""}`).join(", ") +
            ".",
        );
      }
      if (s.selectedFeature) parts.push(`Selected ${s.selectedFeature.properties.name}.`);
      return parts.join(" ");
    },
  },
];

export const COMMAND_BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

export async function runCommand(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const cmd = COMMAND_BY_NAME.get(name);
  if (!cmd) return `Unknown command ${name}.`;
  try {
    const out = await cmd.run(args);
    useGlobe.getState().pushLog({ level: "info", text: `VOICE ${name} → ${out}` });
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useGlobe.getState().pushLog({ level: "warn", text: `VOICE ${name} failed: ${msg}` });
    return `That failed: ${msg}`;
  }
}

/** OpenAI-style function definitions (what Vapi and ElevenLabs both accept). */
export function toolDefinitions() {
  return COMMANDS.map((c) => ({
    type: "function" as const,
    function: { name: c.name, description: c.description, parameters: c.parameters },
  }));
}
