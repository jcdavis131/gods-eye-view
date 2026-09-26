# Contributing

Thanks for looking. The point of this project is a globe anyone can run with no keys, showing public infrastructure, public land and public events, with every number traceable to the upstream that published it. Contributions that keep that are welcome.

## Ground rules

- **Public infrastructure, land and events; not people.** No face recognition, person tracking, named-individual search, licence plates or phone signals. Economic data is about places and institutions: counties, metros, states, harbours, ports of entry, and public companies, banks and federal award recipients as their regulators publish them (SEC EDGAR, FDIC, USAspending); no insider or officer names, no shareholder names. Pull requests that add any of those will be closed; see the Ethics section of the README.
- **Parcels, addresses and ownership come as each public source publishes them, as fully as it publishes them.** A county parcel service or a federal land inventory is in scope with its own fields and terms; add nothing to it. There is no search from a person's name to what they own: the ⌘K palette never reads an owner, operator, manager or easement-holder field, and searches names plus an explicit allowlist of identifier, category and place keys (`SEARCHABLE_DETAILS` in `lib/search/allowlist.ts`, tested next to it). Add your layer's identifiers there (a site number, a permit number); never add an owner, operator, manager, holder or applicant field, and never join owner names across sources. A feature's `name` is always searched: institutions are found by the names their regulators publish, and a bank branch's name includes its bank, so a bank's name finds its loaded branches; never put an owner's name into a feature's `name` unless the publisher itself names the feature that way.
- **Never invent a value.** If an upstream does not send a field, leave it `undefined`. Simulations (traffic) and estimates (turbidity) are labelled as such on the layer, on every feature and in the dossier. Unknown heading stays unknown; stale readings are flagged, not hidden. A severity the source did not publish is shown as "not rated by source", never as calm. Watch for `Number("")` and `Number(null)`: both are 0, not missing.
- **Keyless first.** A new layer must work with no API key. Optional keys can unlock more, but they are entered in the app, travel only as `x-gev-*` headers to this app's own `/api` routes or to the vendor SDK they belong to, and are never required.
- **Be polite to upstreams.** Route handlers cache, rate-gate (`lib/server/upstream.ts`) and back off on 429. ArcGIS services go through `lib/server/arcgis.ts`, and flaky upstreams through `retrying()` in `lib/server/net.ts` (resets, timeouts and 5xx are retried; 4xx and 429 never). Read each source's terms before adding it, and put its attribution in the layer and in the README. No active scanning of hosts.

## Adding a layer

The README's **Layer API** section is the recipe: one file in `lib/layers/`, a style in `lib/globe/styles.ts` (or a sibling file like `waterStyles.ts`, `hazardStyles.ts`, `landStyles.ts`), a line in `lib/layers/index.ts`, and, if it needs a proxy, a route under `app/api/`. Add the id to `LayerId` in `lib/layers/types.ts`; TypeScript will point at everything else that needs a case (`FOLLOW_RANGE`). The rest is not type-checked, so do it by hand:

- a source id in `lib/provenance/sources.ts`, and a route built on `lib/server/respond.ts` (`ok`, `badRequest`, `options`) with a `provenance` record per upstream used and `caveats` for what the data is not ([docs/API.md](docs/API.md), "Adding an op or a route");
- the route's ops in the `op` enum of `public/openapi.json`, with a response schema tagged `x-op` (a test compares them with the route's `case` labels);
- a `LAYER_LABEL_PRIORITY` entry in `lib/globe/labelBudget.ts`;
- the layer in `NOT_PHYSICAL` (`lib/fabric/emergence.ts`) if its points are not things on the ground (alerts, statistics at a centroid);
- voice aliases in `lib/voice/commands.ts` and the word list in `lib/voice/intent.ts`, without shadowing another layer's id;
- tests next to the code (`*.test.ts`, vitest, no network) for every rule that keeps a value honest.

Layers that only make sense up close (flood zones below 5 km) return an empty collection with a note above their height, use a fine `viewKey`, and draw the box they loaded as a dashed outline (`loadedBoxFeature` in `lib/layers/flood.ts`) so ground that was never loaded does not read as ground with nothing on it; the default key only moves every half degree. Static polygon layers pass their features through a `FeatureMemo` (`lib/layers/featureMemo.ts`) so polygons still in view are not rebuilt on every pan. A layer that draws differently depending on another layer lists it in `dependsOn` and does it in `refine(result, ctx)`, not in `fetch`: `ctx.layersOn`, `ctx.answering` (the layer has an answer on the map: not failed, not still loading) and `ctx.holds(layer, id)`, re-run whenever one of those layers is toggled, answers or fails, with no refetch. Step aside for another layer only for what it is drawing right now (`answering` and `holds`), never merely because it is on: the Hazard alerts layer leaves an NWS alert to Live warnings only when that layer holds it, so a warning it could not outline, or a feed that failed, is still drawn somewhere.

Before opening a PR:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Then drive the production build in a real browser (`npx next start -p 3100`, open it, watch the console). Two of the bugs in this repo's history only appeared in production bundles, never in `next dev`; the README's development notes explain both.

## Refreshing the bundled port and country data

`node scripts/economy-data.mjs` re-downloads the NGA World Port Index and the Natural Earth countries, re-matches the BTS port authorities to harbours (World Port Index entry within 150 km of the geocoded harbour city, otherwise the city point, otherwise left off) and rewrites `lib/economy/data/`. Every file carries the date it was pulled. Do not hand-edit coordinates in those files; fix the crosswalk in the script instead.

## Adding an Explore preset

`lib/explore/presets.ts`. A preset is a place, a height and which layers to switch on. Probe the place first (the USGS Water Data API is enough for the water layers; for flood zones, wetlands and public lands, query the upstream with the exact box the layer requests at the preset's height (flood and wetlands: a 4.5 km radius around the 0.04 degree view-key cell)) so the preset never lands on an empty map, and write the blurb about what the layers will show there, not about the water body itself. A place that moves (the largest fire) gets a `resolve()` that finds it when the preset is used, with a fixed fallback; use it through `presetTarget()`.

## Reporting a wrong number

Open an issue with the permalink (top bar → Share) and the upstream page linked from the dossier. Every feature carries its source and its timestamp, so a wrong number is usually either an upstream change or a unit we mis-labelled; both are quick to fix once reproducible.
