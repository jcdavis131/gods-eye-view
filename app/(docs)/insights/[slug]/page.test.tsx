// The insight page and its routes, rendered and called in Node.
//
// The page must render the chart as role="img" with a <title> and a <desc>,
// the data table under it, the arithmetic with citations, the method note and
// the robustness rows, with no fetch anywhere. The routes must serve the
// downloads from the bundle and the two PNGs at their canvas sizes.
//
// Preview PNGs for a visual review are written, not asserted, with:
//   INSIGHTS_PNG_OUT=<dir> npx vitest run "app/(docs)/insights"
// (flagship-a2-social.png and flagship-a2-og.png, the routes' own bytes, and
// flagship-a2-light.png, the social card in the light theme).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insightBySlug } from "@/lib/insights/build";
import { insightCsv, insightJson } from "@/lib/insights/downloads";
import { PNG_WIDTH, toPng } from "@/lib/insights/render/raster";
import { renderSvg } from "@/lib/insights/render/render";
import { GET as csvGET } from "./data.csv/route";
import { GET as jsonGET } from "./data.json/route";
import OgImage, { contentType as ogType, size as ogSize } from "./opengraph-image";
import InsightPage, { generateMetadata, generateStaticParams } from "./page";
import { GET as socialGET } from "./social.png/route";
import { GET as feedXmlGET } from "../feed.xml/route";
import { GET as feedJsonGET } from "../feed.json/route";
import InsightsIndex from "../page";
import sitemap from "../sitemap";

const SLUG = "c1-raw-office-goods-job-growth-2019-2025";
const TITLE = "No Major Metro Beat Austin on Both Office and Goods-and-Logistics Job Growth, 2019 to 2025";
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (p: string) => new Request(`https://eye.jcamd.com${p}`);

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

function pngSize(png: Uint8Array): { width: number; height: number } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

afterEach(() => vi.restoreAllMocks());

describe("the insight page", () => {
  it("renders the chart as an image with a title and a description, and the data table, without a fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("no network at render time");
    });
    const html = renderToStaticMarkup(await InsightPage(ctx(SLUG)));
    expect(fetchSpy).not.toHaveBeenCalled();

    const i = insightBySlug(SLUG)!;
    // Two inline variants (wide and narrow), each an image with its own title and description.
    const svgs = html.match(/<svg [^>]*>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const s of svgs) {
      expect(s).toContain('role="img"');
      expect(s).toMatch(/aria-labelledby="[^"]+-t [^"]+-d"/);
    }
    expect(html.match(/<title id="[^"]+">/g)).toHaveLength(2);
    expect(html.match(/<desc id="[^"]+">Bubble chart\. Horizontal: Office-industry jobs, change 2019 to 2025\./g)).toHaveLength(2);

    // The data table: every row of the chart, Tampa as "not published".
    expect(html).toContain("<table");
    const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(body.match(/<tr /g)).toHaveLength(150);
    expect(text(body)).toContain("Tampa-St. Petersburg-Clearwater, FL +15.9% not published");

    const t = text(html);
    expect(t).toContain(i.headline);
    expect(t).toMatch(/industries, not occupations/i);
    expect(t).toMatch(/twin-adjusted panel pending/i);
    expect(t).toContain(
      "U.S. Bureau of Labor Statistics. Current Employment Statistics, State and Metro Area. series SMU48124205000000001. period 2019 M13. https://download.bls.gov/pub/time.series/sm/sm.data.70.Information.Current. accessed 2026-10-01. sha256 69515f5fad06d6ecd74ac056ca7bf0c52011ccbda992d8ea91046117533fc493. Last-Modified Fri, 18 Sep 2026 14:00:00 GMT.",
    );
    expect(t).toContain("X1: Second source: BLS QCEW");
    expect(t).toContain("From 2022 to 2025 Austin ranks 17th on office-industry and 5th on goods-and-logistics growth, and Beaumont and Tallahassee beat it on both.");
    expect(t).toContain(i.randomPeer!);
    expect(t).toContain("Exactly: (147 / 148)^10 = 4711653532607691047049 / 5042166166892418433024.");
    expect(t).toContain("not against each metro's 2019 twins.");
    expect(t).toContain("P2: Peer set");
    expect(t).toContain("99 of 100");
    for (const f of i.robustnessFormulas) expect(t).toContain(f.formula);
    // The universe and P1 cite the files that pick the metros: OMB's delineation and the Census estimates.
    for (const s of i.shaping) expect(t).toContain(s.citation);
    expect(t).toContain("list1_2023.xlsx");
    expect(t).toContain("cbsa-est2025-alldata.csv");
    // Not every number is a published cell, and the page does not say so.
    expect(t).toContain("published cells and estimates computed from them");
    expect(t).not.toMatch(/every number (in it )?is a published cell/i);
    expect(html).toContain(`href="/insights/${SLUG}/data.csv?all=1"`);
    // The card's size as the social route draws it (checked against the decoded PNG below).
    expect(t).toContain("card (PNG, 1080 × 1350)");
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"isBasedOn"');
  });

  it("is generated for the published slug only", async () => {
    expect(generateStaticParams()).toEqual([{ slug: SLUG }]);
    await expect(InsightPage(ctx("no-such-insight"))).rejects.toThrow();
    const meta = await generateMetadata(ctx(SLUG));
    expect(meta.title).toBe(TITLE);
    // The title says no major metro beat Austin on both; every description beside it carries the recency caveat.
    const caveat = "From 2022 to 2025 Austin ranks 17th on office-industry and 5th on goods-and-logistics growth, and Beaumont and Tallahassee beat it on both.";
    for (const d of [meta.description, meta.openGraph?.description, meta.twitter?.description]) expect(d).toContain(caveat);
    expect(meta.alternates?.canonical).toBe(`https://eye.jcamd.com/insights/${SLUG}`);
  });

  it("is listed on the index and in the sitemap", () => {
    const html = renderToStaticMarkup(InsightsIndex());
    expect(html).toContain(`href="/insights/${SLUG}"`);
    expect(text(html)).toContain("published cells and estimates computed from them (formulas printed)");
    expect(text(html)).not.toMatch(/every number (in it )?is a published cell/i);
    expect(sitemap().map((e) => e.url)).toEqual(["https://eye.jcamd.com/insights", `https://eye.jcamd.com/insights/${SLUG}`]);
  });
});

describe("the routes", () => {
  it("serves data.csv and data.json from the bundle, the plotted rows by default and every row with ?all=1, and 404s an unknown slug", async () => {
    const i = insightBySlug(SLUG)!;
    const csv = await csvGET(req(`/insights/${SLUG}/data.csv`), ctx(SLUG));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const plotted = await csv.text();
    expect(plotted).toBe(insightCsv(i));
    expect(plotted).not.toMatch(/^45300,/m);
    const all = await csvGET(req(`/insights/${SLUG}/data.csv?all=1`), ctx(SLUG));
    expect(all.headers.get("content-disposition")).toBe(`inline; filename="${SLUG}-all.csv"`);
    const allText = await all.text();
    expect(allText).toBe(insightCsv(i, { all: true }));
    expect(allText).toContain("45300,\"Tampa-St. Petersburg-Clearwater, FL\",15.884293326566844,not published,165.7");
    const json = await jsonGET(req(`/insights/${SLUG}/data.json`), ctx(SLUG));
    expect(JSON.parse(await json.text())).toEqual(JSON.parse(JSON.stringify(insightJson(i))));
    const jsonAll = await jsonGET(req(`/insights/${SLUG}/data.json?all=1`), ctx(SLUG));
    expect(JSON.parse(await jsonAll.text())).toEqual(JSON.parse(JSON.stringify(insightJson(i, { all: true }))));
    expect((await csvGET(req("/insights/x/data.csv"), ctx("x"))).status).toBe(404);
  });

  it("serves both feeds with the same entry", async () => {
    const xml = await (await feedXmlGET()).text();
    const feed = JSON.parse(await (await feedJsonGET()).text()) as { items: Array<{ id: string }> };
    expect(feed.items).toHaveLength(1);
    expect(xml).toContain(`<guid isPermaLink="false">${feed.items[0].id}</guid>`);
  });

  it("draws the social card at 1080 x 1350 and the OG card at 1200 x 630", async () => {
    const social = new Uint8Array(await (await socialGET(req(`/insights/${SLUG}/social.png`), ctx(SLUG))).arrayBuffer());
    expect(pngSize(social)).toEqual({ width: 1080, height: 1350 });
    const ogRes = await OgImage(ctx(SLUG));
    expect(ogRes.headers.get("content-type")).toBe(ogType);
    const og = new Uint8Array(await ogRes.arrayBuffer());
    expect(pngSize(og)).toEqual(ogSize);
    const out = process.env.INSIGHTS_PNG_OUT;
    if (out) {
      const i = insightBySlug(SLUG)!;
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, "flagship-a2-social.png"), social);
      writeFileSync(path.join(out, "flagship-a2-og.png"), og);
      writeFileSync(path.join(out, "flagship-a2-light.png"), await toPng(renderSvg(i.spec, "social", "light"), PNG_WIDTH.social));
    }
  });
});
