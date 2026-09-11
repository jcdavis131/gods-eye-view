# Contributing

Thanks for looking. The point of this project is a globe anyone can run with no keys, showing public infrastructure and public events, with every number traceable to the upstream that published it. Contributions that keep that are welcome.

## Ground rules

- **Public infrastructure and public events only.** No people. No face recognition, person tracking, named-individual search, licence plates or phone signals. Economic data stays aggregate: counties, metros, states, harbours, ports of entry; no parcels, addresses, owners, listings or company lookups. Pull requests that add any of those will be closed; see the Ethics section of the README.
- **Never invent a value.** If an upstream does not send a field, leave it `undefined`. Simulations (traffic) and estimates (turbidity) are labelled as such on the layer, on every feature and in the dossier. Unknown heading stays unknown; stale readings are flagged, not hidden.
- **Keyless first.** A new layer must work with no API key. Optional keys can unlock more, but they are entered in the app, travel only as `x-gev-*` headers to this app's own `/api` routes or to the vendor SDK they belong to, and are never required.
- **Be polite to upstreams.** Route handlers cache, rate-gate (`lib/server/upstream.ts`) and back off on 429. Read each source's terms before adding it.

## Adding a layer

The README's **Layer API** section is the recipe: one file in `lib/layers/`, a style in `lib/globe/styles.ts` (or a sibling file like `waterStyles.ts`), a line in `lib/layers/index.ts`, and, if it needs a proxy, a route under `app/api/`. Add the id to `LayerId` in `lib/layers/types.ts`; TypeScript will point at everything else that needs a case (`FOLLOW_RANGE`, voice aliases).

Before opening a PR:

```bash
npm run typecheck
npm run lint
npm run build
```

Then drive the production build in a real browser (`npx next start -p 3100`, open it, watch the console). Two of the bugs in this repo's history only appeared in production bundles, never in `next dev`; the README's development notes explain both.

## Refreshing the bundled port and country data

`node scripts/economy-data.mjs` re-downloads the NGA World Port Index and the Natural Earth countries, re-matches the BTS port authorities to harbours (World Port Index entry within 150 km of the geocoded harbour city, otherwise the city point, otherwise left off) and rewrites `lib/economy/data/`. Every file carries the date it was pulled. Do not hand-edit coordinates in those files; fix the crosswalk in the script instead.

## Adding an Explore preset

`lib/explore/presets.ts`. A preset is a place, a height and which layers to switch on. Probe the place first (the USGS Water Data API is enough for the water layers) so the preset never lands on an empty map, and write the blurb about what the layers will show there, not about the water body itself.

## Reporting a wrong number

Open an issue with the permalink (top bar → Share) and the upstream page linked from the dossier. Every feature carries its source and its timestamp, so a wrong number is usually either an upstream change or a unit we mis-labelled; both are quick to fix once reproducible.
