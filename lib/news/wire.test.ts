// The wire parser on the seven outlet feeds captured 2026-10-07 (descriptions
// and media stripped at capture; the wire never reads them).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCES } from "@/lib/provenance/sources";
import manifest from "./fixtures/manifest.json";
import { decodeEntities, freshWire, linkKey, parseFeed, parseFeedDate, shortHash, titleKey, WIRE_OUTLETS, wireRoundup, type WireItem } from "./wire";

const FIX = path.join(__dirname, "fixtures");
const CAPTURED = Date.parse(manifest.capturedAt);
const feed = (id: string) => readFileSync(path.join(FIX, `rss-${id}.xml`), "utf8");

describe("WIRE_OUTLETS", () => {
  it("registers every outlet as a source and fetches over https", () => {
    for (const o of WIRE_OUTLETS) {
      expect(SOURCES[o.sourceId], o.id).toBeDefined();
      expect(o.feedUrl.startsWith("https://"), o.id).toBe(true);
      expect(manifest.files.some((f) => f.url === o.feedUrl), `${o.id} has a captured fixture`).toBe(true);
    }
  });
});

describe("parseFeed", () => {
  it.each(WIRE_OUTLETS.map((o) => [o.id, o] as const))("reads %s: title, link, outlet and a parsed date for every item", (_id, o) => {
    const items = parseFeed(feed(o.id), o);
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(5);
      expect(it.title).not.toMatch(/<|CDATA|&(amp|apos|quot|#\d+);/);
      expect(it.link).toMatch(/^https?:\/\//);
      expect(it.outlet).toBe(o.outlet);
      expect(it.publishedAt, it.title).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(Object.keys(it).sort()).toEqual(["id", "link", "outlet", "outletId", "publishedAt", "title"]);
    }
  });
  it("unwraps CDATA (BBC) and decodes entities (NPR's &apos;)", () => {
    const bbc = parseFeed(feed("bbc"), WIRE_OUTLETS.find((o) => o.id === "bbc")!);
    expect(bbc[0].title).toBe("US death row inmate Christa Pike awake and speaking after failed execution, lawyers say");
    expect(bbc[0].link).toBe("https://www.bbc.co.uk/news/articles/c8kgezxn54qko?at_medium=RSS&at_campaign=rss");
    const npr = parseFeed(feed("npr"), WIRE_OUTLETS.find((o) => o.id === "npr")!);
    expect(npr.map((i) => i.title)).toContain("Actress Eva Marie Saint, who won an Oscar for 'On the Waterfront,' dies at 102");
  });
  it("skips items with no title or no http link", () => {
    const xml = "<rss><channel><item><title>No link</title></item><item><link>https://x.test/a</link></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>";
    expect(parseFeed(xml, { id: "t", outlet: "T" })).toEqual([]);
  });
  it("reads an Atom entry's href link", () => {
    const xml = '<feed><entry><title>Atom title</title><link rel="alternate" href="https://x.test/b"/><updated>2026-10-06T12:00:00Z</updated></entry></feed>';
    expect(parseFeed(xml, { id: "t", outlet: "T" })[0]).toMatchObject({ title: "Atom title", link: "https://x.test/b", publishedAt: "2026-10-06T12:00:00.000Z" });
  });
});

describe("parseFeedDate", () => {
  it.each([
    ["Wed, 07 Oct 2026 02:30:59 GMT", "2026-10-07T02:30:59.000Z"],
    ["Tue, 6 Oct 2026 18:02:00 GMT", "2026-10-06T18:02:00.000Z"],
    ["Tue, 06 Oct 2026 18:45:00 -0400", "2026-10-06T22:45:00.000Z"],
    ["Wed, 07 Oct 2026 02:30:23 +0000", "2026-10-07T02:30:23.000Z"],
    ["Tue, 06 Oct 2026 12:00:00 +0000", "2026-10-06T12:00:00.000Z"],
    ["06 Oct 2026 08:00 EDT", "2026-10-06T12:00:00.000Z"],
    ["2026-10-06T08:00:00-04:00", "2026-10-06T12:00:00.000Z"],
  ])("%s -> %s", (s, want) => expect(parseFeedDate(s)).toBe(want));
  it("answers null for what does not parse", () => {
    for (const s of ["", "yesterday", "Wed, 07 Foo 2026 02:30:59 GMT", "Wed, 07 Oct 2026 02:30:59 XYZ", null]) expect(parseFeedDate(s)).toBeNull();
  });
});

describe("freshWire", () => {
  const it0 = (o: Partial<WireItem>): WireItem => ({ id: "wire:x", title: "T", link: "https://a.test/1", outletId: "a", outlet: "A", publishedAt: "2026-10-07T01:00:00.000Z", ...o });
  const now = Date.parse("2026-10-07T02:00:00Z");

  it("drops items older than 24 h, undated items and items dated in the future", () => {
    const items = [
      it0({ id: "wire:1", link: "https://a.test/1" }),
      it0({ id: "wire:2", link: "https://a.test/2", publishedAt: "2026-10-05T23:59:00.000Z" }),
      it0({ id: "wire:3", link: "https://a.test/3", publishedAt: null }),
      it0({ id: "wire:4", link: "https://a.test/4", publishedAt: "2026-10-07T03:00:00.000Z" }),
    ];
    expect(freshWire(items, now).map((i) => i.id)).toEqual(["wire:1"]);
  });
  it("de-duplicates by link (query, fragment and www ignored) and by title within an outlet, newest first", () => {
    const items = [
      it0({ id: "wire:1", link: "https://www.a.test/story?utm=1", publishedAt: "2026-10-07T00:00:00.000Z" }),
      it0({ id: "wire:2", link: "https://a.test/story/", publishedAt: "2026-10-07T01:00:00.000Z" }),
      it0({ id: "wire:3", link: "https://a.test/other", title: "t!" }),
      it0({ id: "wire:5", link: "https://b.test/other", title: "T", outletId: "b", outlet: "B" }),
    ];
    expect(freshWire(items, now).map((i) => i.id)).toEqual(["wire:2", "wire:5"]);
  });
  it("keeps the captured feeds' last-day items", () => {
    const all = WIRE_OUTLETS.flatMap((o) => parseFeed(feed(o.id), o));
    const fresh = freshWire(all, CAPTURED);
    expect(fresh.length).toBeGreaterThan(20);
    expect(new Set(fresh.map((i) => i.id)).size).toBe(fresh.length);
    const round = wireRoundup(fresh, 12, 2);
    expect(round.length).toBe(12);
    const per = new Map<string, number>();
    for (const r of round) per.set(r.outletId, (per.get(r.outletId) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(2);
  });
});

describe("helpers", () => {
  it("shortHash is stable and short", () => {
    expect(shortHash("a.test/story")).toBe(shortHash("a.test/story"));
    expect(shortHash("a.test/story")).not.toBe(shortHash("a.test/story2"));
    expect(shortHash("x")).toMatch(/^[0-9a-z]{7}$/);
  });
  it("decodes numeric and named entities and leaves unknown ones", () => {
    expect(decodeEntities("Al Jazeera &#8211; News &amp; &#x2019;s &bogus;")).toBe("Al Jazeera – News & ’s &bogus;");
  });
  it("normalises links and titles", () => {
    expect(linkKey("https://WWW.A.test/x/?q=1#f")).toBe("a.test/x");
    expect(titleKey("Hello, World!")).toBe("hello world");
  });
});
