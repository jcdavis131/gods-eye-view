// News API: the newsroom's live-signal desk and headline wire. CORS open and
// edge-cached like /api/water, with the shared envelope
// (lib/server/respond.ts). See docs/NEWS.md.
//
//   /api/news?op=facts      every fact the anchors may state right now (NWS
//                           Severe/Extreme alerts, USGS M4.5+ quakes, NIFC
//                           wildfires, Launch Library launches, GFZ Kp, DONKI
//                           flares, FRED series, release windows, Open-Meteo at
//                           the lead stories, wire headlines), each with its
//                           provenance; feeds that failed are named
//   /api/news?op=wire       the headline wire: title, link, outlet and time from
//                           each outlet's own RSS feed, last 24 hours, de-duplicated
//   /api/news?op=rundown    what the anchors read this half hour: the local
//                           model's published rundown (NEWS_RUNDOWN_URL) when it is
//                           fresh, valid and every line checks out against the
//                           current facts, otherwise the template writer's
//   /api/news?op=schedule   the 30-minute wheel, the playhead at the server's
//                           clock and which segments will not play and why
//
// Every op carries the disclosure: the anchors are fictional cartoon
// characters, the script is written by a local AI (or by templates when it is
// offline) strictly from the listed facts, and viewers should check the
// original sources.

import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/server/upstream";
import { badRequest, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4 } from "@/lib/server/net";
import type { Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { newsFacts, publishedRundown, wireFeed } from "@/lib/news/sources";
import { selectRundown } from "@/lib/news/rundown";
import { templateRundown } from "@/lib/news/template";
import { playhead, scheduleFor, WHEEL } from "@/lib/news/schedule";
import { DISCLOSURE, PERSONAS } from "@/lib/news/personas";
import type { Fact } from "@/lib/news/facts";

export const maxDuration = 60;
export const OPTIONS = options;

// earthquake.usgs.gov resets over IPv6 from some hosts (lib/server/net.ts); the facts op reads it.
preferIpv4();

const NOT_A_WARNING_SERVICE = "Not a warning service: everything here relays what agencies and outlets publish, minutes to hours late. Follow official channels and local authorities in an emergency.";

function disclosure(writer: "qwen3:8b" | "template"): string {
  return `${DISCLOSURE.fictional} ${DISCLOSURE.writer[writer]} ${DISCLOSURE.check}`;
}

/** One provenance record per source the facts came from (the latest retrieval of each), so the envelope stays short; every fact keeps its own. */
function envelopeProvenance(facts: Fact[]): Provenance[] {
  const by = new Map<string, Provenance>();
  for (const f of facts) {
    const p = f.provenance;
    const prev = by.get(p.source.id);
    if (!prev || prev.retrievedAt < p.retrievedAt) by.set(p.source.id, { source: p.source, kind: p.kind, retrievedAt: p.retrievedAt, upstreamUrl: p.upstreamUrl, notes: p.notes });
  }
  return [...by.values()];
}

async function opFacts() {
  const r = await newsFacts();
  const v = r.value;
  const caveats = [
    `${DISCLOSURE.fictional} ${DISCLOSURE.scripts} ${DISCLOSURE.check}`,
    NOT_A_WARNING_SERVICE,
    "Each fact keeps the publisher's own words and numbers; a field the publisher did not send is absent, not zero.",
    "Wire facts are headlines only (title, link, outlet, time); the stories are the outlets'.",
    "Weather facts are Open-Meteo model output for the grid cell at a story's place, not station readings.",
    ...v.failed.map((f) => `${f.source} did not answer (${f.error}); its facts are missing, not absent.`),
  ];
  return ok(
    { facts: v.facts, failed: v.failed, answered: v.answered, assembledAt: v.assembledAt },
    { provenance: envelopeProvenance(v.facts), caveats, ttlS: v.failed.length ? 60 : 120, meta: { source: "Embedding Atlas live feeds + outlet RSS", facts: v.facts.length, cacheAge: r.age } },
  );
}

async function opWire() {
  const r = await wireFeed();
  const v = r.value;
  const retrievedAt = new Date(Date.now() - r.age).toISOString();
  const caveats = [
    "Headlines only: the title, link, outlet and time each outlet's own RSS feed publishes, read verbatim and credited; nothing is summarised and no article text is relayed.",
    "Items older than 24 hours, undated items and repeats of a link are dropped.",
    ...v.outlets.filter((o) => !o.ok).map((o) => `${o.outlet} did not answer (${o.error ?? "no answer"}); its headlines are missing, not absent.`),
  ];
  const provenance: Provenance[] = v.outlets.filter((o) => o.ok).map((o) => ({ source: source(o.sourceId), kind: "published" as const, upstreamUrl: o.feedUrl, retrievedAt }));
  return ok(
    { items: v.items, outlets: v.outlets },
    { provenance, caveats, ttlS: v.outlets.some((o) => !o.ok) ? 120 : 300, meta: { source: "outlet RSS feeds", items: v.items.length, cacheAge: r.age } },
  );
}

async function opRundown() {
  const now = Date.now();
  const [r, pub] = await Promise.all([newsFacts(), publishedRundown()]);
  const facts = r.value.facts;
  // The template is written for this turn of the wheel, so every request in the half hour words it the same way.
  const tpl = templateRundown(facts, playhead(now).wheelStartedAt, r.value.failed.map((f) => f.source));
  const why = pub.status === "unset" ? "NEWS_RUNDOWN_URL is not set" : pub.status === "ok" ? undefined : `published rundown unavailable: ${pub.error}`;
  const sel = selectRundown(pub.status === "ok" ? pub.raw : null, facts, now, tpl, why);
  const cited = new Set(sel.rundown.segments.flatMap((s) => s.facts));
  const caveats = [disclosure(sel.chosen), NOT_A_WARNING_SERVICE];
  if (sel.chosen === "template" && pub.status !== "unset") caveats.push(`The local model's rundown was not used: ${sel.rejected.slice(0, 3).join("; ")}.`);
  return ok(
    {
      rundown: sel.rundown,
      chosen: sel.chosen,
      rejected: sel.rejected,
      published: pub.status === "ok" ? { status: pub.status, fetchedAt: pub.fetchedAt } : { status: pub.status },
      disclosure: { fictional: DISCLOSURE.fictional, writer: DISCLOSURE.writer[sel.chosen], check: DISCLOSURE.check },
      anchors: Object.values(PERSONAS).map((p) => ({ id: p.id, name: p.name, roleTitle: p.roleTitle, species: p.species })),
      facts: facts.filter((f) => cited.has(f.id)),
    },
    { provenance: envelopeProvenance(facts.filter((f) => cited.has(f.id))), caveats, ttlS: 60, meta: { source: "Embedding Atlas newsroom", writer: sel.chosen, cacheAge: r.age } },
  );
}

async function opSchedule() {
  const now = Date.now();
  const r = await newsFacts();
  const sch = scheduleFor(now, r.value.facts, r.value.failed.map((f) => f.source));
  return ok(
    { ...sch, wheel: WHEEL },
    {
      caveats: [
        "The wheel is fixed: segment start times are offsets from the top and the bottom of each UTC hour, so compute the playhead from your own clock and `wheel`; `playhead` is the server's view at `serverNow`.",
        `${DISCLOSURE.fictional} ${DISCLOSURE.scripts} ${DISCLOSURE.check}`,
      ],
      ttlS: 30,
      meta: { source: "Embedding Atlas newsroom", cacheAge: r.age },
    },
  );
}

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get("op") ?? "";
  try {
    switch (op) {
      case "facts":
        return await opFacts();
      case "wire":
        return await opWire();
      case "rundown":
        return await opRundown();
      case "schedule":
        return await opSchedule();
      default:
        return badRequest("unknown op: facts | wire | rundown | schedule");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
