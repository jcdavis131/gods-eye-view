# Upstream gap vs bilawalsidhu/gods-eye-view — 2026-10-23

Source video: https://youtube.com/shorts/gQDZPw7pSQM
Upstream repo: https://github.com/bilawalsidhu/gods-eye-view (MIT, 20 layers + map stack, README 1030 lines as of 2026-10-23)

Context: our repo was renamed from God's Eye View to Embedding Atlas (live at
arxiviq.com since 2026-10-23; previously eye.jcamd.com); internal `gev` namespace kept for compatibility. All code original,
per the README disclaimer. This file is a data/feature gap inventory, uncommitted.

## Confirmed missing in ours (upstream has, we don't)

| # | Upstream capability | Upstream source(s) | Key | Notes |
|---|---|---|---|---|
| 1 | GNSS Integrity — regional nav accuracy scores | adsb.lol + GPSJAM aggregation | none | No equivalent here |
| 2 | Live air quality on globe | ECCC MSC GeoMet (Canada AQHI 1–10+) | none | Ours: AirNow built, **switched off** until operator returns the data-user form — so right now we have *zero* live AQ |
| 3 | CCTV Mesh breadth (~4,000 cameras, 18+ regions) + viewshed volumes + draggable pose calibration | TfL, TxDOT, Caltrans, Ontario 511, Fintraffic, DriveBC, Tallinn, DelDOT, NSW, Calgary, Norway, Toronto, King County, WSDOT, Catalonia, Hong Kong, Taiwan + NYC DOT / Lithuania / FL511 opt-ins | none | Ours: 6 agencies (TfL, NYC DOT, Caltrans, DriveBC, Fintraffic, Singapore) — no viewsheds, no pose calibration |
| 4 | Mapped ALPR camera locations (OSM/DeFlock), locations+tags only | OpenStreetMap | none | Missing; ethics guardrails apply |
| 5 | Street Level panoramas — image cones + embedded viewer, 4 providers | Mapillary (free token), KartaView + Panoramax (keyless), Google Street View (metered) | mixed | Missing entirely |
| 6 | Radio — geolocated world radio, analog tuner, globe flies to broadcaster | Radio Browser | none | Missing |
| 7 | Transit — live GTFS-Realtime buses/trams/metros/trains/ferries, delayed playback, trails | Operator GTFS-RT feeds (Boston, Austin, Minneapolis, Helsinki, NL, Norway, SEQ, 9 Ontario agencies) | none | Missing |
| 8 | Bikeshare — live station availability | GBFS | none | Missing |
| 9 | Directions — click A/B, street-following route draped on terrain, turn-by-turn, camera fly-along | OSRM on FOSSGIS | none | We have measure (distance/area) but no routing |
| 10 | Observed weather — rain radar (CONUS), satellite clouds (GOES), lightning density on one timeline | NOAA nowCOAST | none | We have space weather + wind/currents only |
| 11 | Cyclones — NHC/CPHC advisory positions, forecast tracks, uncertainty cones | NOAA NHC/CPHC | none | Missing |
| 12 | Submarine cables (712 bundled) | TeleGeography-style cable data | none | Missing; we have dams, datacenters, pipelines |
| 13 | Cockpit view — ride inside a tracked aircraft | own render | none | Missing; we have cinematic camera only |
| 14 | GLSL sensor looks — NVG, FLIR/Ironbow, CRT, Noir, Snow over live globe | own shaders | none | Missing; we have dark HUD + scanlines |
| 15 | 3D hangar — per-class aircraft models (787, ATR-72, Citation, Bell 206, MQ-9) | bundled models | none | Missing; we draw glyphs/points |
| 16 | Detection overlay — screen-space bounding boxes + IDs | own render | none | Missing |
| 17 | Scene director — capturable cinematic camera tours + shareable scene files/bundles | own | none | Partial: we have guided tours + share links, not scene bundles |
| 18 | Voice whiteboard — spoken annotations drawn as real polygons/marks/routes | voice agent | OpenAI/Gemini key | Our voice exists; whiteboard capability unverified — likely missing |
| 19 | Google Photorealistic 3D Tiles (metered) / Cesium ion 3D cities (free tier) | Google / Cesium ion | free-tier/metred | We render Esri imagery + keyless terrain; no photorealistic 3D cities |

Not gaps: Live Flights ✓ (OpenSky + adsb.lol), Military flights ✓ (adsb.lol dbFlags), Vessels ✓ (AISStream), Satellites ✓ (CelesTrak + SGP4), Earthquakes ✓ (USGS), Fire perimeters ✓ (WFIGS), Active fires ✓ (FIRMS), Space missions ✓ (Launch Library 2), Traffic sim ✓, Map stack ✓ (Esri/OSM), Datacenters ✓ (OSM subset), Dams ✓ (NID), MCP ✓ (30 read-only tools), voice ✓, share links ✓, wind/currents ✓ (last refreshed #106).

## Our moat (we have, upstream doesn't)

- Water: USGS gauges + quality screening, aquifers, USDM drought, Sentinel-2 turbidity (Dogliotti 2015, browser-computed), NHD/NLDI/NHDPlus, community water report
- Economy: NGA ports + BTS volumes, BLS QCEW, Zillow ZHVI/ZORI, FRED, World Bank/WITS, market report + momentum index
- Public companies (SEC EDGAR), FDIC bank offices + SOD, USAspending obligations
- Parcels (multi-state adapters), zoning + permits + licences (10/7/5 cities), EPA ECHO/UST/FUDS/Superfund/PFAS
- Terrain/soils: 3D keyless terrain, USGS relief + 2ft contours, SSURGO + NCCPI, WHP, NLCD, SLR scenarios, elevation profiles
- Infrastructure: HIFLD transmission, EIA pipelines + plants, FRA rail, FAA airports, Quaternary faults, landslides, geology, PLSS
- Constructs: 31 nested civic frames, construct field, streamflow-vs-normal, "where the water goes" / "what drains here", live NWS warnings, teleport
- Lenses (8 personas), practitioner stack: /api/series nowcasts, history backfill + IC test, screener, 19 indicators, release calendar + vintages, watchlists (RSS/webhook), desk mode, /api/openapi
- Space weather (GFZ Kp, NASA DONKI), NASA ISS live stream, GDELT conflict events

## Suggested quick wins (his word required to build)

1. **Observed weather trio** (radar/clouds/lightning, nowCOAST, keyless) — highest analyst value per cost; pairs with our cyclone gap (#11).
2. **Radio + transit + bikeshare** (Radio Browser, GTFS-RT, GBFS — all keyless) — three movement layers, all free, similar wiring.
3. **Street Level (KartaView + Panoramax first, keyless)** — Mapillary needs a free token; Google Street View is metered, skip.
4. **CCTV expansion** — copy upstream's agency list (TxDOT, Ontario 511, NSW, WSDOT…), keep our honest pose labelling.
5. **GNSS Integrity** — keyless (adsb.lol + GPSJAM), small module, fits our air domain.
6. **Sensor looks (NVG/FLIR) + cockpit** — bigger lift, but it's the signature "spy satellite" feel the viral videos sell.
