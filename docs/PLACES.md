# Places: county, metro and state pages

The globe answers "what is happening here" for a point you are looking at. A place page answers the same question for a name somebody typed: *Travis County*, *San Antonio metro*, *Texas*. Same sources, same provenance envelope, same arithmetic printed next to every estimate — rendered as a document instead of a heads-up display, at a URL a search engine can index and a person can link.

Every page is about a **place or an institution**: a county, a metro area, a state, a bank office, a federal award recipient, a listed company's headquarters county. No parcel, no street address, no owner, no officer, no insider appears anywhere in this surface, and no module here has a person-level field to leak.

## URL scheme

| URL | what | indexable | segment config |
| --- | --- | --- | --- |
| `/place/[fips]` | a county, keyed by five-digit FIPS (`/place/48453`) | yes | `dynamic = "force-dynamic"` |
| `/metro/[cbsa]` | a metro area, keyed by five-digit CBSA (`/metro/41700`) | yes | `dynamic = "force-dynamic"` |
| `/state/[usps]` | a state, keyed by two-letter USPS (`/state/TX`; `/state/tx` canonicalises up) | yes | `dynamic = "force-dynamic"` |
| `/place`, `/metro`, `/state` | the three hubs: browse counties by state, all 393 CBSAs grouped by state, all 52 states | yes | `revalidate = 86400`, prerendered |
| `/place/[fips]/brief` | the default-lens brief for that place | only when it has findings | `dynamic = "force-dynamic"` |
| `/place/[fips]/brief/[lens]` | the same brief filtered to one of the seven lenses | **never** | `dynamic = "force-dynamic"` |
| `/place/[fips]/feed.xml` | RSS 2.0, or Atom with `?format=atom`; `?lens=` selects a lens | n/a | `revalidate = 3600` |
| `/place/[fips]/feed.json` | JSON Feed 1.1 | n/a | `revalidate = 3600` |
| `/compare/[pair]` | two places side by side (`/compare/48453-vs-06037`, `/compare/metro.41700-vs-metro.19100`) | **never** | `dynamic = "force-dynamic"` |
| `/api/brief?scope=county:48453` | the same brief in the provenance envelope | n/a (disallowed in robots) | dynamic, `s-maxage=3600` |

Metro and state carry the same `/brief`, `/brief/[lens]`, `feed.xml` and `feed.json` children as county.

`maxDuration = 60` is on **every** place route and every new route handler. Because nothing prerenders (below), a cold county render pays TIGERweb plus two multi-tens-of-megabyte Zillow CSVs plus a full-US QCEW quarter plus FDIC plus USAspending on one request, inside a serverless function with the same ceiling as any other render.

## What is indexable, and why so little of it is

Roughly **3,680 indexable place URLs**: about 3,235 counties, 393 metros, 52 states, plus the three hubs. That is the acquisition surface. A place page carries the query intent — "San Antonio rent trend", "Travis County jobs" — and it is the only page with enough distinct content per URL to deserve the crawl budget.

Everything else is deliberately `index: false, follow: true`:

- **Lens briefs.** 3,680 places × 7 lenses is 25,760 near-duplicate URLs over the same numbers. That is the doorway-page pattern, and shipping it would demote the 3,680 pages that matter.
- **Compare pages.** 3,235² is roughly ten million URLs reachable by construction — a crawl trap. `follow: true` keeps the link equity flowing inward to the two place pages.
- **A default brief with zero findings.** `generateMetadata` returns `index: false` when `brief.findings.length === 0`, so a quiet county never ships a thin page. The digest still renders, and the feeds still carry it.

**No brief URL appears in any sitemap, ever.** Briefs are discovered by the in-content link on their place page, which passes equity and is the honest signal ("this page links to it") rather than "we listed 3,680 URLs that may render noindex". It also removes the contradiction of listing URLs whose indexability depends on whether an upstream answered.

Sitemaps, all absolute URLs built with `absoluteUrl()` from `lib/seo/base.ts`:

| file | contains |
| --- | --- |
| `app/sitemap.ts` → `/sitemap.xml` | `/`, `/place`, `/metro`, `/state` |
| `app/(docs)/place/sitemap.ts` → `/place/sitemap/0.xml` … | counties, sharded 1,000 per file via `generateSitemaps()` |
| `app/(docs)/metro/sitemap.ts` → `/metro/sitemap.xml` | 393 metros |
| `app/(docs)/state/sitemap.ts` → `/state/sitemap.xml` | 52 states |

Next has no automatic sitemap index, so `app/robots.ts` lists every shard in its `sitemap` field (`MetadataRoute.Robots` accepts `string[]`), which search engines treat as equivalent to an index. `robots.ts` disallows `/api/` and `/compare`. `lastModified` is `MANIFEST.pulled`, or the build date when the manifest has never been pulled — never `new Date()` per request, because a sitemap whose dates churn on every deploy is one crawlers learn to ignore.

Two version traps live in the sharded sitemap and are handled in `app/(docs)/place/sitemap.ts`: as of v16 `generateSitemaps` passes `id` as a `Promise<string>` (so it is coerced with `Number(await props.id)`, not multiplied as a string), and since v15 shards are served at `/place/sitemap/0.xml`, not `/sitemap.xml/0`.

## The manifest

`lib/places/data/{states,metros,counties}.json` is the offline identity layer: the thing that makes a FIPS, a CBSA or a USPS code a first-class key with **zero network**. `lib/places/registry.ts` imports those three files and nothing else — in particular it never imports `lib/economy/sources.ts`, which statically pulls about 4.4 MB of JSON at module load. `lib/places/scope.ts` is the URL grammar on top of it, and every 404 decision is made there, offline, before a single fetch.

| table | rows | complete | derived from |
| --- | --- | --- | --- |
| `states.json` | 52 | **yes** | hand-maintained: 50 states, DC, PR, with approximate centres. Public knowledge, not a pull. |
| `metros.json` | 393 | **yes** | `lib/economy/data/msa_index.json`, the bundled BLS OEWS metro index, regenerated offline |
| `counties.json` | 21 | **no** (`complete: false`) | a seed: the union of `lib/screener/fixtures.ts` `COUNTY_POINTS` and the distinct `countyFips` in the companies bundle |

`MANIFEST` (from `lib/places/registry.ts`) exposes `pulled`, `countiesComplete`, `metrosComplete`, `countyCount`, `metroCount`, `stateCount` and `cbsaMethod`. Pages print those numbers rather than implying a completeness the tables do not have.

### Regenerating it

```bash
node scripts/places-data.mjs --offline   # states.json + metros.json, no network at all; byte-idempotent
node scripts/places-data.mjs             # the full pull; needs egress, cannot run in the dev sandbox
```

The full pull additionally: pages the TIGERweb county layer to build all ~3,235 counties; assigns each county's CBSA by point-in-polygon of its Census internal point against the TIGERweb CBSA polygon layer; derives `adj[]` from the Census county adjacency file; and resolves each metro's Zillow `RegionID` by name match, recording `zillowMatchedBy` as `exact`, `short` or `null`. It **refuses** to overwrite `counties.json` if the new count is more than 2 percent below the existing count, and refuses to write fewer than 1,100 counties with a CBSA — a silently truncated pull is worse than no pull.

`MANIFEST.cbsaMethod` is written by the script and is meant to be quoted on a page. Today it reads:

> none: seed rows carry cbsa null. Run scripts/places-data.mjs on a host with egress to assign CBSA membership by point-in-polygon.

After a pull it names the service, the layer id and the polygon count, e.g. *"point-in-polygon of each county's Census internal point (CENTLON/CENTLAT) against &lt;service&gt; layer &lt;n&gt;, &lt;k&gt; CBSA polygons"*. The script also prints per-CBSA membership counts so a human can eyeball them before committing.

### What `countiesComplete: false` changes

**URL validation.** `parseCountyParam` accepts a five-digit FIPS whose last three digits are not `000` (that form is a state row in QCEW, never a county). If the manifest names it, the scope carries a `CountyRef`. If the manifest does not, and `countiesComplete` is false, and the two-digit prefix is one of the 52 known states, the scope resolves **provisionally**: accepted, `ref: null`, `provisional: true`, and the page gets its name and centroid from upstream at request time. So every real county stays reachable today. When the pull has run and `countiesComplete` flips to true, the provisional branch stops firing and an unknown FIPS becomes an exact 404 — the same URLs, stricter.

**The sitemap.** It lists what the manifest can name, so it is 21 counties today and about 3,235 after a pull. `generateSitemaps()` sizes itself from `Math.ceil(allCountyFips().length / 1000)` with a minimum of one shard, so the seed yields one file and a full pull yields four with no code change. The `/place` hub says in one honest sentence that the county table is a seed, and still links all 52 states.

**Metros are unaffected**, because the metro table is complete: an unknown CBSA is a real 404 today.

## ISR knobs, and a migration note

Every place page and brief page exports, as literals:

```ts
export const revalidate = 21600;        // 3600 on brief pages; 60 * 60 * 6 is NOT statically analysable
export const dynamicParams = true;
export const maxDuration = 60;
export async function generateStaticParams() { return []; }
```

**The data-bearing pages are dynamic, not incrementally static.** `/place/[fips]`, `/metro/[cbsa]`, `/state/[usps]`, every brief and `/compare/[pair]` set `dynamic = "force-dynamic"` and declare no `generateStaticParams`. The only new routes that prerender are the three hubs, the sitemap segments and `robots.txt`, all of which read the bundled manifest alone.

This was not the first design, and the way it failed is worth keeping written down. The original shape was ISR — `revalidate` plus a `generateStaticParams` returning `[]` — on the reasoning that an empty array defers every path to request time. It does, but it defers *when* a path renders, not *how*: the path still renders **statically**, and a statically-rendered page may not issue a `no-store` fetch. Every fetcher in `lib/economy`, `lib/water` and `lib/finance` passes `cache: "no-store"`, so all ~3,680 pages answered `500 Page changed from static to dynamic at runtime` while the build, the typecheck, the linter and 1,154 unit tests were all green. Nothing short of requesting a page catches that, which is why `docs/PLACES.md` lists curl smoke tests as verification rather than treating a green build as proof.

Prerendering is the wrong goal here anyway, for three reasons that each stand alone:

1. The build sandbox refuses CONNECT to data hosts, so prerendering 393 metros and 52 states would bake "upstream did not answer" into HTML served to the first crawler that arrives.
2. `lib/server/cache.ts` is a module-level `Map` that lives for the life of one server process, and `next build` renders static pages across multiple worker processes — so the hoped-for build-time amortisation of the Zillow and QCEW tables does not happen.
3. Upstream timeouts run to 40-60 s against Next's 60 s `staticPageGenerationTimeout`, so one hanging proxy fails the build outright.

Caching did not disappear with ISR, it moved a layer down: `cached()` in `lib/server/cache.ts` memoises each upstream for its own TTL — 24 h for TIGER geometry, 1 h for the screener cohorts — so a warm process serves a repeat request from memory without a second pull. What a dynamic page gives up is CDN-level HTML caching, which is the honest cost of this shape and the thing to revisit if the fetchers ever grow a cacheable path.

> **MIGRATION NOTE — read before touching any of these.**
> `revalidate`, `dynamicParams`, `dynamic` and `fetchCache` are documented **only** in `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`. Per the route-segment-config version history, they are **removed the moment `cacheComponents` is enabled in `next.config.ts`** (v16.0.0). `maxDuration`, `runtime` and `preferredRegion` survive.
> `generateStaticParams` is not the lever it looks like. With `cacheComponents` off, returning `[]` defers every path to request time but still renders it **statically**, which is incompatible with the `no-store` fetches every source here uses — that is the 500 described above. These routes therefore declare no `generateStaticParams` at all and rely on `dynamic = "force-dynamic"`. **Under Cache Components it must return at least one param and an empty array is a build error** (`docs/messages/empty-generate-static-params`), so a future migration has to supply real params from the manifest and give the fetchers a cacheable path at the same time — the two cannot be done separately.
> So enabling `cacheComponents` is not a config flip for this surface: it deletes three of the four knobs on every place route and changes what the fourth is for. That work belongs in its own change, with `incremental-static-regeneration-cache-components.md` open.

Route handlers (the feeds, `/api/brief`) are **dynamic by default** in this version — unlike `sitemap.ts` and `robots.ts`, which the docs say are cached — so each request runs the assembly on origin and the CDN absorbs repeats through the explicit `cache-control` line from `cacheControl()` in `lib/server/respond.ts`.

## Two root layouts

`app/layout.tsx` and `app/page.tsx` are gone. The app splits into `app/(globe)` and `app/(docs)`, each with its own root layout, with the home route inside a group as multiple root layouts require.

The old root layout could not host a document, and neither problem was fixable in place:

- it pinned `body` to `h-full overflow-hidden`, which makes a long article physically unscrollable;
- it injected a render-blocking `<link>` to `/cesium/Widgets/widgets.css` into `<head>` on **every** route, including text pages that will never draw a globe.

`app/(globe)/layout.tsx` is otherwise a byte copy of the old one, so the globe's rendered HTML is unchanged (its Cesium stylesheet link keeps its existing `@next/next/no-css-tags` disable comment). The smoke test is `curl -s localhost:3000/ | grep -c widgets.css` → 1 on the globe, 0 on `/place/48453`.

`app/(docs)/layout.tsx` renders `<html data-mode="desk" data-theme="light">`. `app/globals.css` already scopes the audited WCAG-AA light palette to `[data-mode='desk'][data-theme='light']` and the print block to `html[data-mode='desk']` — plain attribute selectors on the document element, specificity 0,2,0 against the cockpit `:root` block's 0,1,0 — so setting the attributes server-side wins and inherits the print stylesheet for free. `lib/desk/store.ts` is never imported: `applyDeskDom` has a cross-store side effect on `useSettings.prefs.cinematic`, and a theme toggle would mean shipping a client island on a page that currently ships zero application JavaScript.

Both layouts build absolute URLs from `SITE_URL` in `lib/seo/base.ts` rather than inheriting a `metadataBase` that no longer exists above them. `app/sitemap.ts` and `app/robots.ts` sit at the app root with no root layout above them at all, which is why every `<loc>` is built with `absoluteUrl()`.

`next.config.ts` is **not** edited by any of this. `security-headers.test.ts` asserts exactly two header rules, both `source: '/:path*'`, and their exact complementary embed conditions; a third rule scoped to `/place/*` fails that assertion. The existing CSP already covers every new route, and its `script-src 'unsafe-inline'` is what makes the inline JSON-LD legal.

## Honest degradation

A place page **never renders a blank section and never 500s on an upstream failure**. `placeFacts()` fans out with `Promise.allSettled` behind an 8 s per-branch budget and gives every section a `SectionState`: `fresh`, `stale` (a cached value served after a producer error), `unavailable` with a human reason, or `not-applicable` when the section does not exist at that scale. `placeFactsShell()` is the zero-network Tier A version — synchronous, manifest plus bundled OEWS — and it is what the egress-free build and a total outage render.

With **no egress at all**, here is what a reader actually gets:

| section | offline | why |
| --- | --- | --- |
| identity, breadcrumbs, links, canonical, JSON-LD | **renders** | manifest only |
| hubs, sitemaps, `robots.txt` | **renders** | manifest only |
| occupation mix (top 30 SOC occupations, 22 major groups) | **renders** on a metro, and on a county whose CBSA the manifest knows | `lib/economy/oews.ts` is bundled and synchronous |
| metro member-county list, state metro list | **renders** | manifest only |
| upcoming releases | **renders** | `lib/releases/calendar.ts` is a bundled calendar |
| companies | **renders** when the county is one of the 18 in the bundle, labelled "fixture, not a pull" in words | `companies.json` has `pulled: null` and `withFacts: 0`; the section is omitted entirely rather than rendering an empty list, because an empty list reads as "no public companies are headquartered here", which is false for ~3,125 counties |
| market: home values, rents, jobs, sectors | **unavailable, with a reason** | Zillow CSVs, BLS QCEW, TIGERweb |
| water: drought, reservoirs, gauges, wells, stress | **unavailable, with a reason** | USGS, NWPS, TWDB |
| finance: FDIC deposits and HHI | **unavailable, with a reason** | FDIC BankFind |
| federal spending and the per-job estimate | **unavailable, with a reason** | USAspending |
| indicator context | **unavailable, with a reason** | the indicator service fetches |
| percentiles, ranks, compare | **unavailable, with a reason** | they need the nationwide entity table |
| the brief | **renders**, with release and gap findings and always a digest | `buildBrief` is pure; it says plainly that nothing crossed a line |

Three wording rules that survive every outage, because they are about honesty rather than availability:

- **Water is a disc, not a county.** `REPORT_RADII_KM` searches 150 km for reservoirs and 75 km for gauges and wells around the county's Census internal point, and the fetch window is snapped outward to a 0.5° grid. There is no clip-to-polygon path in `lib/water`. The section is labelled "within 75 km of the county's internal point", every row prints its `distanceKm`, and `buildWaterReport`'s own stress caveat — that turbidity is browser-only, so the server score renormalises over three of four terms and is not comparable to a browser score for the same point — is printed **verbatim**, not paraphrased.
- **Indicators are national context.** All 19 registered indicators are national, river gauges, one state (Texas), a port, a crossing or world-scoped; none is county-keyed and `getIndicators()` has no geographic selector. The block is labelled CONTEXT explicitly so nobody reads "this county's indicators" into it.
- **Estimates print their arithmetic.** Affordability, momentum, HHI and per-job each render their own `formula[]` array next to the number, reusing the array the estimate computed rather than a re-derivation that could drift.

Metro pages carry one more: there is no QCEW path for a metro. `qcewSectors` handles `SSCCC` / `SS000` / `US000` at `agglvl` 74/54/14 and the route regex rejects a C-prefixed MSA code, so the metro jobs figure is a **county rollup** — the sum over the metro's member counties, with the withheld counties **named** rather than counted as zero, and the arithmetic printed in `rollup.formula`.

## Related

- `docs/BRIEF.md` — what a brief may and may not claim, the threshold table, the determinism contract, `/api/brief`.
- `docs/API.md` — the provenance envelope every JSON route answers with.
- `docs/SCREENER.md` — the field registry the place metrics and percentile cohorts are built from.
- `docs/RELEASES.md` — the calendar behind the "next release" line.
