// The studio view, rendered to static markup with fixed props: no browser,
// no clock. The rundown, facts and wire come from the fixtures captured from
// the real feeds (lib/news/fixtures), through the same builders the API uses.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioView, captionFor, type StudioViewProps } from "./StudioView";
import { Heron, Fox, Otter, Mouth } from "./Anchors";
import { fixtureFacts, FIXTURE_DIR } from "@/lib/news/fixtureFacts";
import { templateRundown } from "@/lib/news/template";
import { selectRundown } from "@/lib/news/rundown";
import { freshWire, parseFeed, WIRE_OUTLETS } from "@/lib/news/wire";
import { DISCLOSURE, PERSONAS } from "@/lib/news/personas";
import { layoutSegment, onAir } from "@/lib/news/playback";
import { playhead, WHEEL } from "@/lib/news/schedule";
import { NETWORK_NAME } from "@/lib/news/network";
import { VISEMES } from "@/lib/news/anchorMotion";
import type { RundownData, WireData } from "./types";

const FACTS = fixtureFacts();
const CAPTURED = Date.parse("2026-10-07T02:40:01.668Z");
const TURN = Date.parse(playhead(CAPTURED).wheelStartedAt);
const sel = selectRundown(null, FACTS, CAPTURED, templateRundown(FACTS, new Date(TURN).toISOString()));
const cited = new Set(sel.rundown.segments.flatMap((s) => s.facts));
const RUNDOWN: RundownData = {
  rundown: sel.rundown,
  chosen: sel.chosen,
  rejected: sel.rejected,
  disclosure: { fictional: DISCLOSURE.fictional, writer: DISCLOSURE.writer[sel.chosen], check: DISCLOSURE.check },
  facts: FACTS.filter((f) => cited.has(f.id)),
};
const WIRE: WireData = {
  items: freshWire(WIRE_OUTLETS.flatMap((o) => parseFeed(readFileSync(path.join(FIXTURE_DIR, `rss-${o.id}.xml`), "utf8"), o)), CAPTURED),
  outlets: WIRE_OUTLETS.map((o) => ({ id: o.id, outlet: o.outlet, ok: o.id !== "france24", error: o.id === "france24" ? "HTTP 503" : undefined })),
};

/** Markup as the text a reader sees: tags dropped, React's entity escapes undone. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function decode(s: string): string {
  return s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const segStart = (id: string) => TURN + WHEEL.find((s) => s.id === id)!.startS * 1000;

function props(nowMs: number | null, over: Partial<StudioViewProps> = {}): StudioViewProps {
  return { nowMs, air: nowMs == null ? null : onAir(nowMs, RUNDOWN.rundown), rundown: RUNDOWN, wire: WIRE, schedule: null, animate: true, ...over };
}

/** A moment when line `i` of segment `id` is being spoken, halfway through. */
function midLine(id: string, i: number): number {
  const seg = RUNDOWN.rundown.segments.find((s) => s.id === id)!;
  const tl = layoutSegment(seg.id, seg.lines, WHEEL.find((s) => s.id === id)!.durS * 1000);
  const c = tl.cues.find((x) => x.lineIndex === i && !x.recap)!;
  return segStart(id) + (c.startMs + c.endMs) / 2;
}

describe("StudioView before the clock is known (the server render)", () => {
  const html = renderToStaticMarkup(<StudioView {...props(null, { rundown: null, wire: null })} />);
  it("shows the network, the LIVE bug, placeholders and the disclosure", () => {
    const t = text(html);
    expect(t).toContain(NETWORK_NAME);
    expect(t).toContain("LIVE");
    expect(t).toContain("--:--:--");
    expect(t).toContain(DISCLOSURE.fictional);
    expect(t).toContain(DISCLOSURE.scripts);
    expect(t).toContain(DISCLOSURE.check);
    expect(t).toContain("Tuning in");
  });
  it("draws all three anchors and the whole schedule", () => {
    for (const id of ["plume", "brack", "ledgerly"]) expect(html).toContain(`data-anchor="${id}"`);
    for (const s of WHEEL) expect(text(html)).toContain(s.title);
  });
});

describe("StudioView on air", () => {
  it("captions the line being spoken in a polite live region, with the speaker", () => {
    const now = midLine("planet-watch", 1);
    const html = renderToStaticMarkup(<StudioView {...props(now)} />);
    const line = RUNDOWN.rundown.segments.find((s) => s.id === "planet-watch")!.lines[1];
    const live = /<p aria-live="polite" aria-atomic="true"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(live).not.toBeNull();
    expect(text(live![1])).toContain(line.text);
    expect(text(live![1])).toContain(`${PERSONAS[line.anchor].shortName}:`);
    // The mouth shapes are not in the live region.
    expect(live![1]).not.toContain("data-viseme");
  });

  it("puts the speaker's name and role in the lower third, with the segment", () => {
    for (const [id, i] of [["planet-watch", 1], ["liftoff", 1], ["the-wire", 1]] as const) {
      const now = midLine(id, i);
      const air = onAir(now, RUNDOWN.rundown);
      const p = PERSONAS[air.speaker];
      const html = renderToStaticMarkup(<StudioView {...props(now)} />);
      const lt = /class="news-lower-third[^"]*">([\s\S]*?)<\/div>/.exec(html)![1];
      expect(text(lt)).toContain(p.name);
      expect(text(lt)).toContain(`${p.roleTitle} · ${air.segment.title}`);
      expect(html).toContain(`data-anchor="${air.speaker}" data-speaking="true"`);
    }
  });

  it("lists every fact the segment's lines cite on its source card, with provenance links", () => {
    for (const seg of RUNDOWN.rundown.segments) {
      const html = renderToStaticMarkup(<StudioView {...props(segStart(seg.id) + 1500)} />);
      const card = html.slice(html.indexOf('id="news-sources"'));
      for (const l of seg.lines) {
        for (const id of l.factIds) {
          expect(card, `${seg.id} ${id}`).toContain(`data-fact-id="${id}"`);
          const f = RUNDOWN.facts.find((x) => x.id === id)!;
          expect(decode(card)).toContain(`href="${f.provenance.source.url}"`);
          if (f.link) expect(decode(card)).toContain(`href="${f.link}"`);
        }
      }
      if (!seg.lines.some((l) => l.factIds.length)) expect(text(card)).toContain("No facts in this segment");
    }
  });

  it("marks the facts of the line on air", () => {
    const now = midLine("planet-watch", 1);
    const id = RUNDOWN.rundown.segments.find((s) => s.id === "planet-watch")!.lines[1].factIds[0];
    const html = renderToStaticMarkup(<StudioView {...props(now)} />);
    const start = html.indexOf(`data-fact-id="${id}"`);
    expect(start).toBeGreaterThan(-1);
    const item = html.slice(start, html.indexOf("</li>", start));
    expect(text(item)).toContain("ON AIR NOW");
  });

  it("credits and links the outlet on every ticker item, and says which outlets did not answer", () => {
    const html = renderToStaticMarkup(<StudioView {...props(midLine("top", 1))} />);
    const ticker = html.slice(html.indexOf('class="news-ticker'), html.indexOf("</section>", html.indexOf('class="news-ticker')));
    const firstCopy = ticker.slice(0, ticker.indexOf('aria-hidden="true"'));
    const items = [...firstCopy.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(items.length).toBe(WIRE.items.length);
    WIRE.items.forEach((w, i) => {
      expect(text(items[i])).toContain(`${w.outlet}:`);
      expect(decode(items[i])).toContain(`href="${w.link}"`);
      expect(text(items[i])).toContain(w.title);
    });
    expect(text(ticker)).toContain("France 24 did not answer");
  });

  it("stops the ticker's loop copy, lip movement and blinks when motion is off", () => {
    const now = midLine("planet-watch", 1);
    const html = renderToStaticMarkup(<StudioView {...props(now, { animate: false })} />);
    expect(html).not.toContain("news-ticker-run");
    expect(html).not.toContain("news-breathe");
    expect(html).not.toContain("animateTransform");
    expect(html).not.toContain('data-eye="shut"');
    // The speaker's mouth holds one open shape instead of stepping through letters.
    expect(html).toContain('data-viseme="etc"');
  });

  it("links the map inset to the globe at the story's place", () => {
    const now = midLine("planet-watch", 1);
    const air = onAir(now, RUNDOWN.rundown);
    const f = RUNDOWN.facts.find((x) => x.id === air.at!.caption!.factIds[0])!;
    const html = renderToStaticMarkup(<StudioView {...props(now)} />);
    expect(decode(html)).toContain(`href="/?lat=${f.place!.lat.toFixed(4)}&lon=${f.place!.lon.toFixed(4)}`);
    expect(text(html)).toContain("Open in the Atlas");
    expect(text(html)).toContain(f.place!.name);
  });

  it("marks the segment on air in the schedule", () => {
    const html = renderToStaticMarkup(<StudioView {...props(segStart("money-desk") + 5000)} />);
    expect(text(/<tr aria-current="true"[^>]*>([\s\S]*?)<\/tr>/.exec(html)![1])).toContain("Money Desk");
  });
});

describe("captionFor", () => {
  it("says why nothing is playing", () => {
    expect(captionFor(null, null).text).toContain("Tuning in");
    expect(captionFor(onAir(TURN, null), null).text).toContain("fetching");
    expect(captionFor(onAir(TURN, null), null, { rundown: "HTTP 502" }).text).toContain("HTTP 502");
    expect(captionFor(onAir(TURN + 1_800_000, RUNDOWN.rundown), null).text).toContain("next rundown");
  });
  it("shows what is next once a segment's lines are done", () => {
    const air = onAir(segStart("bumper-1") + 59_000, RUNDOWN.rundown);
    expect(air.at?.phase).toBe("hold");
    expect(captionFor(air, null).text).toBe(`Up next at ${new Date(segStart("liftoff")).toISOString().slice(11, 16)} UTC: Liftoff with Mott.`);
  });
});

describe("anchor figures", () => {
  it("draws every mouth shape differently", () => {
    const shapes = VISEMES.map((v) => renderToStaticMarkup(<svg><Mouth viseme={v} lip="#000" /></svg>).replace(/data-viseme="[^"]*"/, ""));
    expect(new Set(shapes).size).toBe(VISEMES.length);
    for (const Figure of [Heron, Otter, Fox]) {
      const drawn = VISEMES.map((v) => renderToStaticMarkup(<svg><Figure viseme={v} blink={false} gaze={0} speaking animate={false} /></svg>).replace(/data-viseme="[^"]*"/g, ""));
      expect(new Set(drawn).size, Figure.name).toBeGreaterThanOrEqual(6);
    }
  });
  it("shuts the eyes on a blink and turns the eyes with the gaze", () => {
    const open = renderToStaticMarkup(<svg><Otter viseme="rest" blink={false} gaze={0} speaking={false} animate={false} /></svg>);
    const shut = renderToStaticMarkup(<svg><Otter viseme="rest" blink gaze={0} speaking={false} animate={false} /></svg>);
    const left = renderToStaticMarkup(<svg><Otter viseme="rest" blink={false} gaze={-1} speaking={false} animate={false} /></svg>);
    expect(open).toContain('data-eye="open"');
    expect(shut).toContain('data-eye="shut"');
    expect(shut).not.toContain('data-eye="open"');
    expect(left).not.toBe(open);
  });
});
