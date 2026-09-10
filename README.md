# God's Eye View

**A spy satellite simulator in your browser, except the data is real.**

A photorealistic 3D globe that fuses live public signals: every aircraft broadcasting ADS-B, ships on AIS, satellites propagated from CelesTrak elements, earthquakes as USGS reports them, open-data public cameras, upcoming rocket launches. Dark HUD, scanlines, cinematic camera, voice control. Starts with **zero API keys**. MIT licensed.

**Live:** https://gods-eye-view-rust.vercel.app (deploys from `master`). One hosting caveat: OpenSky refuses Vercel's egress, so the zoomed-out aircraft view there falls back to adsb.lol around the view centre plus the military feed; run it locally or add OpenSky credentials for the full global picture.

![God's Eye View boot screen](docs/screenshot-boot.jpg)

| Night side, NASA Black Marble | Public camera dossier | Replay: ISS orbit at T−90 min | Traffic simulation |
| --- | --- | --- | --- |
| ![night](docs/screenshot-night.jpg) | ![cameras](docs/screenshot-cameras.png) | ![replay](docs/screenshot-replay-iss.png) | ![traffic](docs/screenshot-traffic-sim.png) |

## Quick start

```bash
git clone https://github.com/jcdavis131/gods-eye-view
cd gods-eye-view
npm install        # also copies Cesium's static assets into public/cesium
npm run dev        # http://localhost:3000
```

That is the whole setup. No account, no token, no `.env`. Everything below the fold works on free public endpoints.

Pinokio users: add this folder (or the repo URL) in Pinokio and press **Install**, then **Start**. `pinokio.js`, `install.js`, `start.js`, `update.js` and `reset.js` are in the repo root.

## What you get with no keys

| Layer | Source (no key) | Refresh | Notes |
| --- | --- | --- | --- |
| Aircraft | [adsb.lol](https://adsb.lol) point query (≤ 250 nm around the view) + its global military-flagged feed; [OpenSky](https://opensky-network.org) when zoomed out | 10 s | Positions are dead-reckoned between reports for up to 90 s. OpenSky anonymous quota is 400 credits/day; the server caches 90 s and the HUD shows credits left. |
| Ships | [Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) (Fintraffic) AIS | 20 s | Real AIS, **Baltic Sea coverage**. No mock ships anywhere; the layer says what it covers. |
| Satellites | [CelesTrak](https://celestrak.org) GP elements, SGP4 via satellite.js | 2 h | Fully time-scrubbable. Propagation runs in a Web Worker, so the ~11k "all active" group (opt-in) stays smooth. Default groups: stations, brightest, GPS, military, weather. |
| Earthquakes | [USGS](https://earthquake.usgs.gov) all-magnitudes, past 24 h | 60 s | Sized and coloured by magnitude. |
| Public cams | [TfL JamCams](https://api-portal.tfl.gov.uk) + [NYC DOT](https://webcams.nyctmc.org) | 5 min | Open-data traffic cameras with live stills in the info panel. Positions only. |
| Traffic (sim) | OpenStreetMap roads via Overpass; vehicles are **simulated** | 10 min | Labelled SIMULATED everywhere. See [Ethics](#ethics-guardrails). Activates below 30 km camera altitude. |
| Launches | [Launch Library 2](https://thespacedevs.com) upcoming + recent | 15 min | Pads, countdowns, a coarse estimated ascent arc, an animated vehicle for T+0 to T+10 min. |
| Globe | Esri World Imagery + NASA GIBS Black Marble night lights | — | Day/night lighting, atmosphere, fog, stars. |

## Optional keys (all entered in the app, none required)

Press **Keys** in the top bar or hit `,`. Keys live in `localStorage` and are only ever sent to this app's own `/api` routes (as request headers) or to the vendor SDK they belong to (voice).

| Key | Unlocks |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Google Photorealistic 3D Tiles (buildings, trees, terrain). |
| `CESIUM_ION_TOKEN` | Cesium World Terrain. |
| `ADSBX_RAPIDAPI_KEY` | ADS-B Exchange as an alternative aircraft source. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | 4000 OpenSky credits/day for the global view. |
| `AISSTREAM_KEY` | Global AIS via [AISStream](https://aisstream.io) websocket (free key). |
| `WINDY_WEBCAMS_KEY` | Windy public webcams worldwide, nearest 50 to the view. |
| `ELEVENLABS_AGENT_ID` (+ `ELEVENLABS_API_KEY` for private agents) | ElevenLabs Conversational AI voice agent. |
| `VAPI_PUBLIC_KEY` + `VAPI_ASSISTANT_ID` | Vapi realtime voice agent. |

## Controls

- Drag to orbit, scroll to zoom, middle-drag or ctrl-drag to tilt.
- Click any object for its dossier; **Follow** locks the camera to it (your orbit offset is kept while it moves).
- `⌘K` / `Ctrl+K` search flights, ships, satellites and cameras by callsign, name, MMSI, ICAO hex or NORAD id, or geocode a place.
- Timeline scrubs ±24 h. Satellites and launches propagate to any time. Live layers hold their last known state and are flagged `LAST KNOWN`; nothing is synthesised for the past.
- Idle for 12 s and the camera drifts in orbit (cinematic mode, toggle in settings).
- Voice: press **Voice** and say "show me flights over Austin", "track the ISS", "rewind 30 minutes", "go live", "what am I looking at".

## Voice control

Three providers share one command registry (`lib/voice/commands.ts`):

| Provider | Needs | How |
| --- | --- | --- |
| Browser (default) | nothing | Web Speech API + a small local intent parser (`lib/voice/intent.ts`). Chrome/Edge/Safari. |
| ElevenLabs | agent id | Conversational AI agent; every command is registered as a **client tool** so the agent calls the globe directly. |
| Vapi | public key + assistant id | Web SDK call; function tools are advertised on the call as async client tools and results are posted back as system messages. |

For ElevenLabs and Vapi, configure tools on the vendor side with these names and schemas (also available at runtime as `window.gev.commands` and `toolDefinitions()`):

```json
[
  { "name": "fly_to_place",    "parameters": { "place": "string", "altitude_km": "number?" } },
  { "name": "show_layer",      "parameters": { "layer": "aircraft|ships|satellites|earthquakes|cameras|traffic|launches", "on": "boolean", "place": "string?" } },
  { "name": "find_object",     "parameters": { "query": "string", "follow": "boolean?" } },
  { "name": "follow_selected", "parameters": { "on": "boolean" } },
  { "name": "set_time",        "parameters": { "offset_minutes": "number?", "live": "boolean?" } },
  { "name": "home_view",       "parameters": {} },
  { "name": "describe_view",   "parameters": {} }
]
```

Vapi tools must be marked `async: true` (the browser executes them; there is no server webhook).

## Architecture

```
 browser ─────────────────────────────────────────────────────────────────────────────┐
 │                                                                                    │
 │  components/hud/*          HUD: layer panel, info panel, timeline, search, voice   │
 │        │  zustand (lib/store)                                                      │
 │        ▼                                                                           │
 │  components/globe/LayerHost.tsx   one tanstack-query per enabled layer             │
 │        │  fetch() → GeoJSON FeatureCollection                                      │
 │        ▼                                                                           │
 │  lib/layers/<name>.ts     normalise upstream JSON → GeoJSON (pure, inspectable)    │
 │        │                                                                           │
 │        ▼                                                                           │
 │  lib/globe/renderer.ts    LayerRenderer: billboards / points / polylines / labels  │
 │  lib/globe/styles.ts      glyph, colour, label, position-at-time per layer         │
 │        │                                                                           │
 │        ▼                                                                           │
 │  components/globe/CesiumGlobe.tsx   CesiumJS viewer, imagery, picking, follow,     │
 │                                     cinematic drift, clock sync                    │
 └─────────────────────┬──────────────────────────────────────────────────────────────┘
                       │ fetch /api/*  (optional keys travel as x-gev-* headers)
                       ▼
 app/api/<layer>/route.ts   thin proxies: CORS, polite User-Agent, gzip, in-memory
                            TTL cache, per-upstream rate gate, 429 back-off
                       │
                       ▼
 adsb.lol · OpenSky · Digitraffic · AISStream · CelesTrak · USGS · TfL · NYC DOT ·
 Windy · Launch Library 2 · Overpass · Nominatim · Esri · NASA GIBS · Google · Cesium ion
```

Why proxies at all? OpenSky locks CORS to its own origin, adsb.lol and Overpass send no CORS headers, Nominatim requires a User-Agent browsers cannot set, Digitraffic requires gzip plus a client header, and CelesTrak asks for at most one fetch per group every two hours. The routes pass upstream JSON through untouched (two big payloads are trimmed and say so with `trimmed: true`), so the network tab is the audit trail.

Open the console and type `gev` for a live handle: `gev.globe.getState()`, `gev.features()`, `gev.say("show me ships near Helsinki")`, `gev.run("set_time", { offset_minutes: -60 })`.

## Layer API

A layer is one file in `lib/layers/` exporting a `LayerDefinition`:

```ts
import type { LayerDefinition, FetchContext, FetchResult } from "./types";

export const myLayer: LayerDefinition = {
  id: "mything",                 // add to LayerId in lib/layers/types.ts
  label: "My thing",
  description: "Where it comes from and what it means.",
  color: "#7CFFB2",
  updateIntervalMs: 30_000,
  defaultEnabled: false,
  viewDependent: true,           // refetch when the camera settles somewhere new
  viewKey: (view) => `${view.lon.toFixed(1)},${view.lat.toFixed(1)}`, // optional, coarse by default
  simulated: false,              // true ONLY for simulations; shown loudly in the UI
  attribution: "Upstream name (licence)",
  async fetch(ctx: FetchContext): Promise<FetchResult> {
    // ctx.view = camera target/height/bbox, ctx.keys = optional operator keys,
    // ctx.now = wall clock, ctx.signal = abort, ctx.options = settings prefs
    const res = await fetch(`/api/mything?...`, { signal: ctx.signal });
    const data = await res.json();
    return {
      collection: { type: "FeatureCollection", features: [/* GeoJSON Features with BaseProps */] },
      source: "upstream name",
      fetchedAt: Date.now(),
      note: "coverage caveat shown in the HUD",
    };
  },
};
```

Every feature carries `BaseProps` (`lib/layers/types.ts`): `id`, `layer`, `name`, optional `kind`, `heading`, `altitude`, `speed`, `observedAt`, `source`, `simulated`, `details` (rendered verbatim in the info panel), `imageUrl`, `extra`.

Register it in `lib/layers/index.ts` and give it a `LayerStyle` in `lib/globe/styles.ts`:

```ts
export const myStyle: LayerStyle = {
  color: "#7CFFB2",
  icon: (f) => "dot",                       // glyph from lib/globe/icons.ts, or null for a point
  label: (f) => f.properties.name,
  labelMax: 60,                             // label everything while the layer is small
  trail: true,                              // keep a position history for the selected object
  position: (f, timeMs) => [lon, lat, alt], // optional: moving objects
  selectedLines: (f, timeMs) => [{ positions, color, width }], // optional: orbit / track
};
```

Rules the codebase keeps: never invent a value the upstream did not send (unknown heading stays `undefined`, AIS sentinels 511/360 are dropped), never count simulated features as live, never let a key reach third-party JavaScript except the SDK it belongs to.

## Ethics guardrails

This project shows **public infrastructure and public events** only. It is a way to look at the world's shared systems, not at people.

- No face recognition, no person tracking, no named-individual search, no licence plates, no phone signals. There is no code path that identifies a human being and none will be merged.
- Cameras are limited to operator-published open data (transport agencies, public webcams). Only their published position is used; **all camera poses are coarse position estimates and no orientation is drawn** because none is published.
- The traffic layer is a simulation on real roads driven by an aggregate demand curve. It never ingests real vehicle, phone or plate data and is labelled `SIMULATED` on the layer, on every feature, in the info panel and here.
- No fabricated fallbacks. When a feed is unavailable the layer says so; when coverage is partial (AIS without a key is the Baltic Sea) the layer says that too.
- Aircraft with privacy programmes (PIA/LADD) appear only as their upstream publishes them; this app adds no de-anonymisation.

If you build on this, keep the list above intact. It is the point.

## Data sources and attribution

adsb.lol (ODbL) · OpenSky Network · ADS-B Exchange · Fintraffic / Digitraffic (CC BY 4.0) · AISStream.io · CelesTrak · USGS Earthquake Hazards Program · Transport for London Open Data · NYC DOT · Windy.com · The Space Devs Launch Library 2 · OpenStreetMap contributors (ODbL) via Overpass and Nominatim · Esri World Imagery (Esri, Maxar, Earthstar Geographics, GIS User Community) · NASA GIBS / VIIRS Black Marble · CesiumJS (Apache 2.0) · satellite.js (MIT).

Please respect each upstream's rate limits and terms; the proxies already do (server-side caches, one request at a time per upstream, back-off on 429).

## Development notes

- Next.js 16 (Turbopack), React 19, Tailwind 4, shadcn (base-ui), Zustand, TanStack Query, CesiumJS 1.145, satellite.js 7.
- `scripts/copy-cesium.mjs` copies Cesium's Workers/Assets/Widgets/ThirdParty into `public/cesium` on install/dev/build; `window.CESIUM_BASE_URL` is set before Cesium is dynamically imported.
- Satellite positions come from `lib/globe/sat.worker.ts` (a Web Worker fed mission time once a second, or immediately after a timeline jump); the style falls back to main-thread SGP4 where Workers are unavailable.
- `next.config.ts` aliases `@spz-loader/core` (Cesium's Gaussian-splat decoder, unused here) to `lib/vendor/spz-loader-stub.ts`. Its inlined WebAssembly string gets minified into an invalid template literal in Turbopack production builds, which made the whole Cesium chunk fail to parse on Vercel while dev mode worked. Drive the production build in a browser, not just `curl`, before shipping.
- satellite.js is imported through `lib/vendor/satellite.ts`, not its package root: the root re-exports a WASM/pthreads runtime that imports `node:worker_threads`, which makes `next build` hang under Turbopack and fail under webpack. The shim reaches the pure SGP4 modules by relative path.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- Dev and production builds use separate output directories, so `next build` can run while `next dev` is up.
- Route handlers keep a process-local TTL cache (`lib/server/cache.ts`) and a per-upstream politeness gate (`lib/server/upstream.ts`).

## Disclaimer

Positions are as reported by their upstream and may be delayed, dead-reckoned (aircraft/ships for ≤ 90–180 s) or propagated (satellites via SGP4). Launch ascent arcs are coarse estimates. The traffic layer is a simulation. This is an educational and situational-awareness toy, not a navigation, safety or surveillance tool. Inspired by the vibe of [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view); all code here is original.

MIT © 2026 jcdavis131 and contributors.
