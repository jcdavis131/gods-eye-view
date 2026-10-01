// buildInsight over the committed places-v0.1 bundle: what it publishes, what
// makes it refuse, and that the chart, the downloads, the JSON-LD and the
// feed are all drawn from the bundle files alone.
//
// Each refusal case changes one thing in a deep copy of the loaded bundle,
// the way a bad export or a hand edit would, and expects the build to name
// it. Nothing here invents a value: every variant starts from the real
// evidence and moves one field.

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRss } from "@/lib/feed/render";
import { InsightRefused, buildInsight, insightBySlug, publishedInsights } from "./build";
import { insightCsv, insightJson } from "./downloads";
import { insightsFeedDoc } from "./feed";
import { insightJsonLd } from "./jsonld";
import { loadBundle, readBundle, type LoadedBundle } from "./load";
import { CANVAS_IDS } from "./render/canvas";
import { layoutBubble } from "./render/charts/bubble";
import { renderSvg } from "./render/render";
import { parseChartSpec, type BubbleSpec } from "./render/spec";
import { formatSlot } from "./sentence";
import { THEMES } from "./render/tokens";
import type { Evidence, Methods, BundleManifest } from "./types";

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "lib/insights/data/places-v0.1");
const BASE = loadBundle("places-v0.1", ROOT);
const SIDECAR = JSON.parse(readFileSync(path.join(DIR, "charts/C1-raw.sidecar.json"), "utf8")) as BubbleSpec;
const SLUG = "c1-raw-office-goods-job-growth-2019-2025";

interface Parts {
  manifest: BundleManifest;
  methods: Methods;
  evidence: Evidence;
  chart: BubbleSpec;
  template: string;
}

/** The bundle with one change applied to deep copies of its documents. */
function variant(change: (p: Parts) => void): LoadedBundle {
  const f = BASE.findings[0];
  const p: Parts = {
    manifest: structuredClone(BASE.manifest),
    methods: structuredClone(BASE.methods),
    evidence: structuredClone(f.evidence),
    chart: structuredClone(f.chart) as BubbleSpec,
    template: f.template,
  };
  change(p);
  return { ...BASE, manifest: p.manifest, methods: p.methods, findings: [{ ...f, evidence: p.evidence, chart: p.chart, template: p.template }] };
}

function refusal(b: LoadedBundle): string {
  try {
    buildInsight(b, "C1-raw");
  } catch (e) {
    expect(e).toBeInstanceOf(InsightRefused);
    return (e as Error).message;
  }
  throw new Error("expected the build to refuse");
}

const I = buildInsight(BASE, "C1-raw");

describe("the published finding", () => {
  it("is C1-raw, panel A, with the template headline", () => {
    expect(I.slug).toBe(SLUG);
    expect(I.panel).toBe("A");
    expect(I.status).toBe("twins_pending");
    expect(I.headline).toBe(
      "From 2019 to 2025 Austin's office-industry jobs grew 36.0% and its goods-and-logistics jobs 38.6%, ranking 1st and 2nd of 149 major metros; no major metro beat Austin on both.",
    );
    expect(I.chartTitle).toBe("Job Growth in Office and Goods-and-Logistics Industries, 150 Largest US Metros, 2019 to 2025");
    expect(I.subject).toEqual({ cbsa: "12420", label: "Austin", title: "Austin-Round Rock-San Marcos, TX" });
  });

  it("takes its dates from the bundle, never a clock", () => {
    expect(I.asOf).toBe("2026-09-18");
    expect(I.retrievedAt).toBe("2026-10-01T21:26:39Z");
    expect(buildInsight(BASE, "C1-raw")).toEqual(I);
  });

  it("lists every printed headline number in the arithmetic, each from an evidence number", () => {
    const printed = I.headline.match(/\d[\d,.]*(?:st|nd|rd|th)?/g) ?? [];
    const rows = I.arithmetic.filter((r) => r.where === "headline");
    for (const n of printed) expect(rows.map((r) => r.printed), n).toContain(n.replace(/\.$/, ""));
    for (const r of I.arithmetic) {
      const n = BASE.findings[0].evidence.numbers[r.number];
      expect(n, r.number).toBeDefined();
      expect(r.formula.length).toBeGreaterThan(0);
    }
  });

  it("cites every published cell behind a printed number, URL and access date included", () => {
    const a = I.arithmetic.find((r) => r.where === "headline" && r.slot === "a")!;
    expect(a.printed).toBe(formatSlot("a", BASE.findings[0].evidence.headline.slots.a));
    expect(a.cells.map((c) => `${c.seriesId} ${c.period} ${c.value}`)).toEqual([
      "SMU48124205000000001 2019 M13 39.0",
      "SMU48124205500000001 2019 M13 66.0",
      "SMU48124206000000001 2019 M13 207.6",
      "SMU48124205000000001 2025 M13 50.4",
      "SMU48124205500000001 2025 M13 90.7",
      "SMU48124206000000001 2025 M13 283.9",
    ]);
    for (const r of I.arithmetic) {
      for (const c of r.cells) {
        expect(c.citation).toContain(c.provenance.upstreamUrl as string);
        expect(c.citation).toMatch(/accessed 2026-10-01\.$/);
      }
    }
  });

  it("carries the method note, the pending twin panel and the robustness rows", () => {
    expect(I.methodNote.join(" ")).toMatch(/industries, not occupations/i);
    expect(I.methodNote.join(" ")).toMatch(/twin-adjusted panel pending/i);
    expect(I.robustness.map((r) => `${r.id} ${r.window}`)).toEqual([
      "D1 2019 to 2025",
      "D2 2019 to 2025",
      "D3 2019 to 2025",
      "E1 2019 to 2024",
      "E2 2019 to mean(Sep 2025-Aug 2026)",
      "E3 2019 to 2023",
      "P1 2019 to 2025",
      "P2 2019 to 2025",
      "P3 2019 to 2025",
      "R 2019 to 2022",
      "R 2022 to 2025",
      "X1 2019 to 2023",
    ]);
    const x1 = I.robustness.find((r) => r.id === "X1")!;
    expect(x1.axes.map((a) => `${a.label} ${a.growth} ${a.rank}`)).toEqual(["QCEW white-collar +35.6% 1st", "QCEW blue-collar +18.7% 5th"]);
    expect(I.notPrinted.map((n) => n.id)).toEqual(["C1.H3.twins", "C1.caveat.qcew_manufacturing"]);
  });

  it("is the only published insight and is found by its slug", () => {
    expect(publishedInsights([BASE]).map((i) => i.slug)).toEqual([SLUG]);
    expect(insightBySlug(SLUG, [BASE])?.id).toBe("C1-raw");
    expect(insightBySlug("no-such-slug", [BASE])).toBeNull();
  });
});

describe("refusals", () => {
  it("refuses when any precondition does not pass", () => {
    const b = variant((p) => {
      p.evidence.preconditions.find((x) => x.name === "no_metro_beat_both.E1")!.pass = false;
    });
    expect(refusal(b)).toMatch(/precondition no_metro_beat_both\.E1 \(value 0, needs == 0\) does not pass/);
    expect(() => publishedInsights([b])).toThrow(InsightRefused);
  });

  it("refuses a printed clause that no precondition gates", () => {
    expect(refusal(variant((p) => void (p.evidence.preconditions = p.evidence.preconditions.filter((x) => x.gates !== "C1.H3.no_metro_beat_both"))))).toMatch(/clause C1\.H3\.no_metro_beat_both prints but no precondition gates it/);
  });

  it("refuses a clause whose wording drifted from the registered text", () => {
    expect(refusal(variant((p) => void (p.evidence.headline.clauses[1].text = "no metro beat {subject} on both")))).toMatch(/template C1\.H3\.no_metro_beat_both reads .* not the registered text/);
  });

  it("refuses a slot whose value is not its evidence number's", () => {
    const b = variant((p) => {
      const a = p.evidence.headline.slots.a as { value: number };
      a.value += 0.1;
    });
    expect(refusal(b)).toMatch(/headline slot \{a\} .* evidence number main:2019->2025\.12420\.office\.growth_pct/);
  });

  it("refuses a never-used word", () => {
    expect(refusal(variant((p) => void p.evidence.headline.never_used.push("ranking")))).toMatch(/never-used word "ranking"/);
  });

  it("refuses a panel that has not shipped, a template it has no sentences for and a status it cannot describe", () => {
    expect(refusal(variant((p) => void (p.manifest.panels.A = "pending")))).toMatch(/panel A is "pending", not shipped/);
    expect(refusal(variant((p) => void (p.template = "C9")))).toMatch(/no sentences for template "C9"/);
    const b = variant((p) => {
      p.manifest.status = p.evidence.status = p.methods.status = "complete";
    });
    expect(refusal(b)).toMatch(/no status note for bundle status "complete"/);
  });

  it("refuses a chart value that is not the evidence's", () => {
    const b = variant((p) => {
      const austin = p.chart.data.find((d) => d.id === "12420")!;
      austin.x = (austin.x as number) + 1;
    });
    expect(refusal(b)).toMatch(/chart row 12420 x is .* evidence number main:2019->2025\.12420\.office\.growth_pct/);
  });

  it("refuses a robustness number that is not the evidence's", () => {
    const b = variant((p) => {
      p.methods.robustness.rows.D1.windows["2019->2025"].axes!.office.rank.value = 2;
    });
    expect(refusal(b)).toMatch(/robustness D1 2019->2025: D1:2019->2025\.12420\.office\.rank is 2 on the methods page, 1 in the evidence/);
  });
});

describe("drawn from the bundle alone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads, builds, renders every canvas and writes both downloads without a fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("no network at render time");
    });
    const fresh = readBundle("places-v0.1", ROOT);
    const i = buildInsight(fresh, "C1-raw");
    for (const canvas of CANVAS_IDS) for (const theme of THEMES) expect(renderSvg(i.spec, canvas, theme)).toMatch(/^<svg /);
    insightCsv(i);
    insightJson(i);
    insightJsonLd(i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("charts exactly the sidecar: the spec is the parsed sidecar, and every published row is drawn", () => {
    expect(I.spec).toEqual(parseChartSpec(SIDECAR));
    const marks = layoutBubble(I.spec as BubbleSpec, "inline-wide", "light").marks;
    expect(marks).toHaveLength(BASE.findings[0].evidence.chart.plotted);
    expect(marks).toHaveLength(149);
  });
});

/** RFC 4180 cells of one record (no embedded newlines in these files). */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (quoted) {
      if (ch === '"' && line[k + 1] === '"') {
        cur += '"';
        k++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

describe("downloads", () => {
  const csv = insightCsv(I);
  const lines = csv.split("\r\n");
  const header = csvCells(lines[0]);
  const records = lines.slice(1).filter((l) => l !== "" && !l.startsWith("#"));

  it("CSV rows are the sidecar rows, every one, values as published and null as empty", () => {
    expect(header).toEqual(["id", "Name", SIDECAR.x.label, SIDECAR.y.label, SIDECAR.size.label]);
    expect(records).toHaveLength(SIDECAR.data.length);
    const byId = new Map(records.map((l) => csvCells(l)).map((c) => [c[0], c]));
    expect([...byId.keys()].sort()).toEqual(SIDECAR.data.map((d) => d.id).sort());
    const cell = (v: number | null) => (v === null ? "" : String(v));
    for (const d of SIDECAR.data) expect(byId.get(d.id), d.id).toEqual([d.id, d.fullLabel, cell(d.x), cell(d.y), cell(d.size)]);
    expect(byId.get("45300")?.[3]).toBe("");
  });

  it("CSV footer carries the as-of date, every citation, the unpublished row and the bundle hashes", () => {
    const footer = lines.filter((l) => l.startsWith("# "));
    expect(footer).toContain("# as_of: 2026-09-18");
    for (const c of I.citations) expect(footer).toContain(`# source: ${c}`);
    expect(footer).toContain("# not published: Tampa-St. Petersburg-Clearwater, FL");
    expect(footer.join("\n")).toContain(I.hashes.evidence);
    expect(csv).not.toMatch(/generated_at/);
  });

  it("JSON rows are exactly the sidecar rows with their provenance", () => {
    const j = insightJson(I) as { rows: unknown[]; provenance: unknown };
    const want = [...SIDECAR.data].sort((a, b) => (a.id < b.id ? -1 : 1)).map((d) => ({ id: d.id, label: d.label, fullLabel: d.fullLabel, x: d.x, y: d.y, size: d.size, provenance: d.provenance }));
    expect(j.rows).toEqual(want);
    expect(j.provenance).toEqual(SIDECAR.provenance);
  });
});

describe("JSON-LD and the feed", () => {
  it("bases the Dataset on the upstream files of the chart's provenance", () => {
    const [report, dataset] = insightJsonLd(I) as Array<Record<string, unknown>>;
    const urls = (dataset.isBasedOn as Array<{ url: string }>).map((d) => d.url);
    const want = [...new Set(I.provenance.map((p) => p.upstreamUrl ?? p.source.url))];
    expect(urls).toEqual(want);
    expect(urls).toContain("https://download.bls.gov/pub/time.series/sm/sm.data.54.TotalNonFarm.All");
    expect(report["@type"]).toBe("Report");
    expect((report.about as { url: string }).url).toMatch(/\/metro\/12420$/);
    expect(dataset.temporalCoverage).toBe("2019/2025");
  });

  it("gives each insight a content-addressed entry id and the bundle's own dates", () => {
    const doc = insightsFeedDoc([I], { self: "https://eye.jcamd.com/insights/feed.xml", home: "https://eye.jcamd.com/insights" });
    expect(doc.entries[0].id).toBe(`gev-insight-${SLUG}-${I.contentId}`);
    expect(doc.entries[0].published).toBe("2026-10-01T21:26:39Z");
    expect(doc.generatedAt).toBe("2026-10-01T21:26:39Z");
    expect(renderRss(doc)).toBe(renderRss(insightsFeedDoc([buildInsight(BASE, "C1-raw")], { self: doc.selfUrl, home: doc.homeUrl })));
    const otherEvidence = { ...BASE, hashes: { ...BASE.hashes, "evidence/C1-raw.json": "0".repeat(64) } };
    expect(buildInsight(otherEvidence, "C1-raw").contentId).not.toBe(I.contentId);
  });
});
