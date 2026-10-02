// The insight's pages and routes when the H3b clause does not print.
//
// lib/insights/build is replaced with itself serving one insight: the
// committed bundle down its suppressed path (lib/insights/testFixtures.ts),
// built by the real buildInsight. The page, its metadata and JSON-LD, the
// index, both feeds and both downloads must then carry the clause's words
// nowhere, the page's own captions and robustness table included, and name
// the clause only by its id.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { h3bWordingPatterns } from "@/lib/insights/sentence";
import { GET as csvGET } from "./data.csv/route";
import { GET as jsonGET } from "./data.json/route";
import InsightPage, { generateMetadata } from "./page";
import { GET as feedXmlGET } from "../feed.xml/route";
import { GET as feedJsonGET } from "../feed.json/route";
import InsightsIndex from "../page";

vi.mock("@/lib/insights/build", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/insights/build")>();
  const { suppressedPath, variant } = await import("@/lib/insights/testFixtures");
  const insight = mod.buildInsight(variant(suppressedPath), "C1-raw");
  return { ...mod, publishedInsights: () => [insight], insightBySlug: (slug: string) => (slug === insight.slug ? insight : null) };
});

const SLUG = "c1-raw-office-goods-job-growth-2019-2025";
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (p: string) => new Request(`https://eye.jcamd.com${p}`);

/** Markup as the text a reader sees: tags dropped, React's entity escapes undone, whitespace runs as one space. */
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

/** The H3b clause's words wherever they occur in `t`. */
function h3bWords(t: string): string[] {
  return h3bWordingPatterns().flatMap((re) => [...t.matchAll(new RegExp(re.source, "gis"))].map((m) => m[0]));
}

describe("when the H3b clause does not print", () => {
  it("the page carries its words nowhere and names it by id in the captions and the robustness table", async () => {
    const html = renderToStaticMarkup(await InsightPage(ctx(SLUG)));
    const t = text(html);
    expect(h3bWords(html)).toEqual([]);
    expect(h3bWords(t)).toEqual([]);
    // The page is the suppressed one: the neutral title, the reason the clause does not print.
    expect(t).toContain("Job Growth in Office and Goods-and-Logistics Industries, 150 Largest US Metros, 2019 to 2025");
    expect(t).toContain("C1.H3b : a precondition fails: h3b.no_metro_beat_both.P2");
    expect(t).toContain("The finding is published only because each one passes; clause C1.H3b does not print, and why is under Caveats.");
    expect(t).toContain("A row that gates the headline is a precondition of clause C1.H3b, which does not print; the others are reported only.");
    expect(t).toContain("yes: clause C1.H3b, which does not print");
  });

  it("its metadata, the index, the feeds and the downloads carry its words nowhere", async () => {
    const meta = await generateMetadata(ctx(SLUG));
    const out = [
      JSON.stringify(meta),
      text(renderToStaticMarkup(InsightsIndex())),
      await feedXmlGET().text(),
      await feedJsonGET().text(),
      await (await csvGET(req(`/insights/${SLUG}/data.csv?all=1`), ctx(SLUG))).text(),
      await (await jsonGET(req(`/insights/${SLUG}/data.json?all=1`), ctx(SLUG))).text(),
    ];
    expect(meta.title).toBe("Job Growth in Office and Goods-and-Logistics Industries, 150 Largest US Metros, 2019 to 2025");
    for (const o of out) expect(h3bWords(o)).toEqual([]);
  });
});
