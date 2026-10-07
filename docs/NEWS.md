# The newsroom

A live news desk read by three fictional cartoon anchors. They report the Atlas's own live signals as straight news, and they read a wire of headlines from other newsrooms' public RSS feeds, each credited to its outlet. Their personality comes through banter and running bits between the facts, never through how a fact is told.

This file covers the data side: `lib/news/` and `/api/news`. The page, the voices and the model writer are built separately.

## What the anchors may say

Everything an anchor states is a **fact**: one object built from one record a public feed published (`lib/news/facts.ts`).

```ts
{
  id: "quake:aka2026tuxgky",          // stable: built from the upstream's own id
  kind: "quake",
  headline_fields: { place: "92 km NNW of Aleneva, Alaska", pagerAlert: "green" },  // the publisher's words
  numbers: { magnitude: 5.5, depthKm: 87.6 },                                      // the publisher's numbers
  place: { name: "92 km NNW of Aleneva, Alaska", lat: 58.802, lon: -153.609 },     // null when it has no place
  time: "2026-10-06T18:34:...Z",
  link: "https://earthquake.usgs.gov/earthquakes/eventpage/aka2026tuxgky",
  provenance: { source: {...}, kind: "published", seriesId: "aka2026tuxgky", retrievedAt: "..." }
}
```

| Kind | From | Read through | Notes |
| --- | --- | --- | --- |
| `alert`, `alert-count` | NWS alerts rated Severe or Extreme | `lib/live/fetch.ts` `liveFeed` (the `/api/live` cache) | Only alerts with an outline get a place; all are counted. |
| `quake` | USGS M4.5+ past day | `liveFeed` | USGS's tsunami flag is never relayed: it is not a warning. |
| `wildfire` | NIFC WFIGS current perimeters and incidents | `lib/hazards/sources.ts` `wfigs` + `buildWildfire` | Type WF only; still burning first, then by acres. |
| `launch` | Launch Library 2 upcoming | the same URL and cache key as `/api/launches` | NET in the next 48 hours, read to LL2's own precision. |
| `kp`, `flare` | GFZ Kp, NASA DONKI flares | `lib/space/sources.ts` `spaceWeather` | Kp latest and the day's highest; M and X flares only. |
| `indicator` | FRED (MORTGAGE30US, UNRATE, DCOILWTICO) | `lib/economy/sources.ts` `fred` | Latest and previous observation with their dates. |
| `release` | the bundled release calendar | `lib/releases/calendar.ts` | Approximate windows stay windows, with an estimate's provenance. |
| `weather` | Open-Meteo `current` | `lib/news/sources.ts` | At the lead quake and the lead fire only; model output, said so. |
| `wire` | outlet RSS feeds | `lib/news/wire.ts` | Title, link, outlet and time only. |

Builders are pure: they take `retrievedAt` and `now` as arguments and never read the clock (the tests make `Date.now` throw while they run). Each feed is waited on for at most 25 s; a feed that fails or is late is listed in `failed`, and its facts are missing, not absent.

## The wire

`lib/news/wire.ts`. Feeds probed with real fetches on 2026-10-07; the terms each outlet states, as read that day, are in its `license` in `lib/provenance/sources.ts`.

| Outlet | Feed | Terms read |
| --- | --- | --- |
| NPR | feeds.npr.org/1001/rss.xml | NPR Terms of Use, Content Feeds: a personal site may display the feeds with "NPR" credited adjacent. |
| BBC News | feeds.bbci.co.uk/news/world/rss.xml | BBC Terms of Use s.15: add the feed to your website unchanged, credited to BBC News with a link nearby; business use needs permission. |
| DW | rss.dw.com/xml/rss-en-world | Terms page 404 on the probe day. |
| ABC News (Australia) | abc.net.au/news/feed/51120/rss.xml | Conditions page 404 on the probe day. |
| Al Jazeera | aljazeera.com/xml/rss/all.xml | Terms page has no feed clause. |
| France 24 | france24.com/en/rss | RSS page 403 on the probe day. |
| UN News | news.un.org/feed/subscribe/en/news/all/rss.xml | RSS page 403 on the probe day. |

Left out: CBC (stream reset, then a timeout), NHK World (the English RSS path is 404), PBS NewsHour (connection reset), RNZ (two items) and The Guardian (its feeds page limits them to personal, non-commercial purposes).

Only the title, link, outlet and publication time are kept. Descriptions, article bodies, images and authors are never read. On air a headline is read verbatim, in quotes, with its outlet ("From BBC News: "..."), and never summarised or embellished. Items older than 24 hours, undated items and repeated links are dropped.

## The wheel

`lib/news/schedule.ts`. A fixed 30-minute wheel at offsets from :00 and :30 UTC, so every viewer sees the same segment at the same moment with no server state.

| Offset | Segment | Anchor | Facts |
| --- | --- | --- | --- |
| 0:00 | Top of the Half Hour | Odessa | the lead item from each desk |
| 4:00 | Planet Watch | Tully | quakes, alerts, fires, weather at the story |
| 10:00 | At the Desk | (bumper) | none |
| 11:00 | Liftoff | Mott | launches, Kp, flares |
| 16:00 | Money Desk | Mott | FRED series, release windows |
| 21:00 | At the Desk | (bumper) | none |
| 22:00 | The Wire | Odessa | outlet headlines |
| 29:00 | Sign-off | (all) | none; the disclosure |

A news segment with no facts keeps its slot (moving the others would put two viewers whose caches differ on different segments) and plays a card: "nothing to report" when its feeds answered with nothing, "standing by" when they did not answer. `op=schedule` lists them in `skipped`.

## The anchors

`lib/news/personas.ts`, as data: Odessa Plume (grey heron, lead anchor), Tully Brack (sea otter, planet correspondent) and Mott Ledgerly (fennec fox, money and space desk), with design notes, traits, catchphrases, their relationships and fact-free running bits. All three are original characters written for this project; they must not be drawn or voiced to resemble any real person, any other network's characters, or any show or brand. Kokoro voice ids are candidates with `confirmed: false` until someone chooses them by ear.

## The rundown

`lib/news/rundown.ts` defines the `Rundown` (zod):

```ts
{ generatedAt, writer: "qwen3:8b" | "template", expires,
  segments: [{ id, title, anchor, lines: [{ anchor, text, factIds }], facts, location }] }
```

`id` is a wheel segment id, `anchor` one of `plume`, `brack`, `ledgerly`. Two writers produce one:

- **The template writer** (`lib/news/template.ts`): one sentence per fact kind, times in UTC with the date, nothing generated. Always available.
- **The local model** (qwen3:8b on the operator's machine) writes a rundown from `op=facts` about every 30 minutes and publishes it as JSON at an https URL (a public gist's raw link works). Set that URL as **`NEWS_RUNDOWN_URL`** in the deployment's environment. Without it the desk runs on the template writer.

`op=rundown` uses the published rundown only when all of these hold, and otherwise uses the template's and returns the reasons in `rejected`:

1. generated less than two hours ago, not in the future, and not past its own `expires`;
2. valid against the schema (`writer` must be `qwen3:8b`);
3. every fact id it cites is in the current facts;
4. every line passes the claim check: each number in the text is a number the cited facts carry (as published, or rounded to the precision written; a time's UTC parts count), and each capitalised word that does not start a sentence or a quotation appears in the cited facts or their sources' names, or is on a short list (the anchors' names, the segment titles, months and days, agency acronyms). A line that cites no facts may carry no number and no such word.

Nothing about a fact is taken from the published file but its id: each segment's source card (`facts`) and `location` are rebuilt from the current facts.

The claim check cannot catch a claim written entirely in lower-case words with no number ("a big storm is coming"). The model's instructions must forbid any statement not backed by a cited fact; the template writer never makes one.

A rundown that cites a count that has since changed (the alert count, under the one id `alerts:count`) fails the number check and falls back to the template, by design. Weather fact ids carry Open-Meteo's own observation time (`wx:<fact id>:<time>`), which moves every 15 minutes, so a rundown that cites one is usually rejected after that; the model writer should leave weather to the template or cite it only when it publishes within the quarter hour.

## Disclosure

Every answer carries it, and the page must show it: the anchors are fictional cartoon characters; the script is written by a local AI model (or by fixed templates when it is offline or its script failed the checks) strictly from the facts listed in each segment's source card; viewers should check the original sources. The text lives in `DISCLOSURE` in `lib/news/personas.ts`.

## API

`/api/news?op=facts|wire|rundown|schedule`, CORS open, edge-cached (facts 2 min, wire 5 min, rundown 1 min, schedule 30 s). See `public/openapi.json`.

## Fixtures

`lib/news/fixtures/` was captured once from the real feeds on 2026-10-07 and trimmed; `manifest.json` records each URL and capture time. The RSS fixtures keep titles and links only.
