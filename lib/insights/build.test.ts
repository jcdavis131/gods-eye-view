// buildInsight over the committed places-v0.1.1 bundle: what it publishes,
// what makes it refuse, and that the chart, the downloads, the JSON-LD and
// the feed are all drawn from the bundle files alone.
//
// Each refusal case changes one thing in a deep copy of the loaded bundle,
// the way a bad export or a hand edit would, and expects the build to name
// it. Nothing here invents a value: every variant starts from the real
// evidence and moves one field.

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightRefused, buildInsight, h3bGate, insightBySlug, publishedInsights } from "./build";
import { insightCsv, insightJson } from "./downloads";
import { insightJsonLd } from "./jsonld";
import { loadBundle, readBundle, type LoadedBundle } from "./load";
import { CANVAS_IDS } from "./render/canvas";
import { LABEL_CAP, layoutBubble } from "./render/charts/bubble";
import { renderSvg } from "./render/render";
import { parseChartSpec, type BubbleSpec } from "./render/spec";
import { fill, formatSlot, templateText } from "./sentence";
import { THEMES } from "./render/tokens";
import type { BundleManifest, Evidence, Methods } from "./types";

const ROOT = path.resolve(__dirname, "../..");
const NAME = "places-v0.1.1";
const DIR = path.join(ROOT, "lib/insights/data", NAME);
const BASE = loadBundle(NAME, ROOT);
const EV = BASE.findings[0].evidence;
const SIDECAR = JSON.parse(readFileSync(path.join(DIR, "charts/C1-raw.sidecar.json"), "utf8")) as BubbleSpec;
const SLUG = "c1-raw-office-goods-job-growth-2019-2025";
const TITLE = "No Major Metro Beat Austin on Both Office and Goods-and-Logistics Job Growth, 2019 to 2025";
const P2_BOTH = "P2:2019->2025.12420.beat_on_both";

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
  it("is C1-raw, panel A, with the template headline and the H3b chart title", () => {
    expect(I.slug).toBe(SLUG);
    expect(I.bundle).toBe(NAME);
    expect(I.panel).toBe("A");
    expect(I.status).toBe("twins_pending");
    expect(I.headline).toBe(
      "From 2019 to 2025 Austin's office-industry jobs grew 36.0% and its goods-and-logistics jobs 38.6%, ranking 1st and 2nd of 149 major metros; no major metro beat Austin on both.",
    );
    expect(I.chartTitle).toBe(TITLE);
    expect(I.dek).toBe(SIDECAR.dek);
    expect(I.subject).toEqual({ cbsa: "12420", label: "Austin", title: "Austin-Round Rock-San Marcos, TX" });
    expect(I.window).toEqual({ t0: 2019, t1: 2025 });
  });

  it("takes its dates from the bundle, never a clock", () => {
    expect(I.asOf).toBe("2026-09-18");
    expect(I.retrievedAt).toBe("2026-10-01T21:26:39Z");
    expect(buildInsight(BASE, "C1-raw")).toEqual(I);
  });

  it("prints one % per number in every sentence", () => {
    expect(I.headline).toMatch(/grew 36\.0% and its goods-and-logistics jobs 38\.6%, ranking/);
    for (const s of [I.headline, I.chartTitle, I.dek, I.randomPeer ?? "", I.statusNote, ...I.caveats.map((c) => c.text), ...(I.spec.subjectNotes ?? [])]) expect(s).not.toContain("%%");
    expect(I.spec.subjectNotes).toEqual(["+36.0% / +38.6%"]);
  });

  it("prints the random-peer probability with its exact arithmetic at every registered k", () => {
    expect(I.randomPeer).toBe("Drawing 10 major metros at random, with replacement, the chance that Austin beat all 10 on both is 0.934.");
    expect(I.randomPeerGrid.map((g) => `${g.k} ${g.printed}`)).toEqual(["5 0.967", "10 0.934", "20 0.873"]);
    const p = I.arithmetic.find((r) => r.where === "Random peer" && r.slot === "p")!;
    expect(p.printed).toBe("0.934");
    expect(p.kind).toBe("probability");
    expect(p.arithmetic).toBe("(147 / 148)^10 = 4711653532607691047049 / 5042166166892418433024");
  });

  it("lists every printed number in the arithmetic, each from an evidence number with a formula", () => {
    const printed = I.headline.match(/\d[\d,.]*(?:st|nd|rd|th)?/g) ?? [];
    const rows = I.arithmetic.filter((r) => r.where === "Headline");
    for (const n of printed) expect(rows.map((r) => r.printed), n).toContain(n.replace(/\.$/, ""));
    for (const r of I.arithmetic) {
      expect(EV.numbers[r.number], r.number).toBeDefined();
      expect(r.formula.length).toBeGreaterThan(0);
    }
    expect(new Set(I.arithmetic.map((r) => r.where))).toEqual(new Set(["Headline", "Random peer", "Caveat: recency", "Caveat: ces_manufacturing", "Caveat: benchmarked", "Chart title", "Chart subtitle", "Subject label", "Universe line", "Status note"]));
  });

  it("cites every published cell behind a printed number with its file's sha256 and Last-Modified", () => {
    const a = I.arithmetic.find((r) => r.where === "Headline" && r.slot === "a")!;
    expect(a.printed).toBe(formatSlot("a", EV.headline.slots.a));
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
        const src = Object.values(BASE.manifest.sources).find((s) => s.url === c.url)!;
        expect(c.sha256).toBe(src.sha256);
        expect(c.lastModified).toBe(src.last_modified);
        expect(c.citation).toContain(c.url);
        expect(c.citation).toContain(`sha256 ${src.sha256}.`);
        expect(c.citation).toContain(`Last-Modified ${src.last_modified}.`);
        expect(c.citation).toMatch(/accessed 2026-10-01\. sha256 /);
      }
    }
  });

  it("cites each upstream file the chart reads once, with the years read from it, and the delineation and Census files that pick the metros", () => {
    expect(I.files.map((f) => `${f.url.replace("https://download.bls.gov/pub/time.series/sm/", "")} ${f.years.join(",")}`)).toEqual([
      "sm.data.54.TotalNonFarm.All 2019,2025",
      "sm.data.60.MiningAndLogging.Current 2019,2025",
      "sm.data.61.MiningLoggingConstr.Current 2019,2025",
      "sm.data.62.Construction.Current 2019,2025",
      "sm.data.63.Manufacturing.Current 2019,2025",
      "sm.data.69.TransUtilities.Current 2019,2025",
      "sm.data.70.Information.Current 2019,2025",
      "sm.data.71.FinancialActivities.Current 2019,2025",
      "sm.data.72.ProfBusSrvc.Current 2019,2025",
    ]);
    expect(I.citations).toHaveLength(9 + 2 + 1);
    expect(I.citations[0]).toBe(
      "U.S. Bureau of Labor Statistics. Current Employment Statistics, State and Metro Area. period 2019/2025. https://download.bls.gov/pub/time.series/sm/sm.data.54.TotalNonFarm.All. accessed 2026-10-01. sha256 178d68fc85318bbc22068e15b2d2123dbcb3788d44de125dee90b87993fdfbb3. Last-Modified Fri, 18 Sep 2026 14:00:00 GMT. 39,239,428 bytes.",
    );
    const omb = I.shaping.find((s) => s.id === "omb_list1_2023")!;
    expect(omb.chart).toBe(true);
    expect(I.citations).toContain(omb.citation);
    expect(omb.citation).toContain("https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx");
    expect(omb.citation).toContain("sha256 952c4b1e78acbb54e6ec9412434b7602fedacbf021736351a63c181bdb753629. Last-Modified Fri, 04 Aug 2023 14:36:17 GMT.");
    const census = I.shaping.find((s) => s.id === "census_cbsa_est2025")!;
    expect(census.chart).toBe(false);
    expect(census.citation).toContain("cbsa-est2025-alldata.csv");
    expect(census.citation).toContain("sha256 bf6fad83753456413d047d1acebeb434bd067eba9d6d0be62b3f737ad1301852. Last-Modified Thu, 26 Mar 2026 12:30:28 GMT.");
    expect(I.robustness.find((r) => r.id === "P1")!.sources).toContain(census.citation);
    expect(I.robustness.find((r) => r.id === "P2")!.sources).not.toContain(census.citation);
  });

  it("carries the method note with the status note's year from window.t0, the pending twin panel and the robustness rows", () => {
    expect(I.methodNote.join(" ")).toMatch(/industries, not occupations/i);
    expect(I.statusNote).toBe("Twin-adjusted panel pending: this page is panel A, raw growth ranked among the major metros that publish every component, not against each metro's 2019 twins.");
    expect(I.arithmetic.find((r) => r.where === "Status note")).toMatchObject({ slot: "t0", printed: "2019", number: "window.t0", kind: "registered" });
    expect(I.robustness.map((r) => `${r.id} ${r.window} ${r.publishable}`)).toEqual([
      "D1 2019 to 2025 149 of 150",
      "D2 2019 to 2025 149 of 150",
      "D3 2019 to 2025 149 of 150",
      "E1 2019 to 2024 149 of 150",
      "E2 2019 to mean(Sep 2025-Aug 2026) 149 of 150",
      "E3 2019 to 2023 149 of 150",
      "P1 2019 to 2025 149 of 150",
      "P2 2019 to 2025 99 of 100",
      "P3 2019 to 2025 199 of 200",
      "R 2019 to 2022 149 of 150",
      "R 2022 to 2025 149 of 150",
      "X1 2019 to 2023 114 of 150",
    ]);
    expect(I.robustness.filter((r) => r.gates.includes("C1.H3b")).map((r) => r.id)).toEqual(["D1", "D2", "D3", "E1", "E2", "E3", "P1", "P2", "P3"]);
    const x1 = I.robustness.find((r) => r.id === "X1")!;
    expect(x1.axes.map((a) => `${a.label} ${a.growth} ${a.rank}`)).toEqual(["QCEW white-collar +35.6% 1st", "QCEW blue-collar +18.7% 5th"]);
    expect(x1.denominator).toEqual({ number: "X1:2019->2023.publishable", sets: ["X1:2019->2023:wc", "X1:2019->2023:bc"] });
    expect(I.notPrinted.map((n) => n.id)).toEqual(["C1.H3.twins", "C1.caveat.qcew_manufacturing"]);
  });

  it("is the only published insight and is found by its slug", () => {
    expect(publishedInsights([BASE]).map((i) => i.slug)).toEqual([SLUG]);
    expect(publishedInsights().map((i) => i.bundle)).toEqual([NAME]);
    expect(insightBySlug(SLUG, [BASE])?.id).toBe("C1-raw");
    expect(insightBySlug("no-such-slug", [BASE])).toBeNull();
  });
});

describe("the H3b gate", () => {
  it("holds row by row on the committed bundle", () => {
    expect(h3bGate(EV, BASE.methods)).toEqual([]);
  });

  it("refuses when one gating row's precondition is missing, though every remaining precondition passes", () => {
    const b = variant((p) => void (p.evidence.preconditions = p.evidence.preconditions.filter((x) => x.name !== "h3b.no_metro_beat_both.P2")));
    expect(b.findings[0].evidence.preconditions.every((x) => x.pass)).toBe(true);
    expect(refusal(b)).toMatch(/the H3b clause prints but its gate does not hold: precondition h3b\.no_metro_beat_both\.P2 is missing/);
  });

  it("refuses when a gating row's count is not zero in the evidence, whatever its precondition says", () => {
    const b = variant((p) => {
      p.evidence.numbers[P2_BOTH].value = 1;
      p.evidence.numbers[P2_BOTH].metros = ["42340"];
    });
    expect(refusal(b)).toMatch(/evidence number P2:2019->2025\.12420\.beat_on_both is 1 \(42340\), not 0/);
  });

  it("refuses when the gating list drops a row, or a row's not-publishable check is missing", () => {
    expect(refusal(variant((p) => void (p.methods.robustness.gating["C1.H3b"] = p.methods.robustness.gating["C1.H3b"].filter((r) => r !== "E2"))))).toMatch(/gate does not hold: methods\.json gates it on/);
    expect(refusal(variant((p) => void (p.evidence.preconditions = p.evidence.preconditions.filter((x) => x.name !== "h3b.not_publishable_cannot_beat_both.D3"))))).toMatch(
      /precondition h3b\.not_publishable_cannot_beat_both\.D3 is missing/,
    );
  });

  it("refuses when the recency caveat does not print with it", () => {
    const b = variant((p) => {
      const c = p.evidence.caveats.find((x) => x.id === "C1.caveat.recency")!;
      c.printed = false;
      c.reason = "not printed in this variant";
    });
    expect(refusal(b)).toMatch(/the recency caveat does not print with a non-empty list/);
  });

  it("requires the neutral chart title when the clause does not print", () => {
    const b = variant((p) => {
      p.evidence.headline.clauses.find((c) => c.id === "C1.H3b")!.printed = false;
      p.evidence.suppressed.push({ clause: "C1.H3b", reason: "suppressed in this variant", preconditions: [] });
      p.methods.panel_a.headline.clauses["C1.H3b"] = false;
    });
    expect(refusal(b)).toMatch(/the H3b clause does not print, so the chart title must be the neutral C1\.chart_title\.raw/);
  });
});

describe("refusals", () => {
  it("refuses when any precondition does not pass", () => {
    const b = variant((p) => {
      p.evidence.preconditions.find((x) => x.name === "h3b.no_metro_beat_both.E1")!.pass = false;
    });
    expect(refusal(b)).toMatch(/precondition h3b\.no_metro_beat_both\.E1 \(value 0, needs == 0\) does not pass/);
    expect(() => publishedInsights([b])).toThrow(InsightRefused);
  });

  it("refuses a printed clause that no precondition gates", () => {
    expect(refusal(variant((p) => void (p.evidence.preconditions = p.evidence.preconditions.filter((x) => x.gates !== "C1.H3.ranks"))))).toMatch(/clause C1\.H3\.ranks prints but no precondition gates it/);
  });

  it("refuses a clause, a caveat or a ladder rung whose wording drifted from the registered text", () => {
    expect(refusal(variant((p) => void (p.evidence.headline.clauses[1].text = "no metro beat {subject} on both")))).toMatch(/template C1\.H3b reads .* not the registered text/);
    expect(refusal(variant((p) => void (p.evidence.caveats[0].text = p.evidence.caveats[0].text.replace("ranks", "placed"))))).toMatch(/caveat C1\.caveat\.recency template C1\.caveat\.recency reads/);
    expect(refusal(variant((p) => void (p.evidence.chart.title.ladder![0].text = "No Metro Beat {subject}, {t0} to {t1}")))).toMatch(/chart title ladder template C1\.chart_title\.h3b\.1 reads/);
    expect(refusal(variant((p) => void (p.evidence.chart.dek.ladder![1].text += "!")))).toMatch(/chart subtitle ladder template C1\.chart_dek\.recency\.2 reads/);
  });

  it("refuses a title or subtitle rung that its ladder's rule would not pick", () => {
    const title = variant((p) => {
      p.evidence.chart.title.id = "C1.chart_title.h3b.1";
      p.evidence.chart.title.text = templateText("C1.chart_title.h3b.1");
    });
    expect(refusal(title)).toMatch(/the chart title is C1\.chart_title\.h3b\.1, but C1\.chart_title\.h3b\.2 is the first rung every canvas can set/);
    const dek = variant((p) => {
      p.evidence.chart.dek.id = "C1.chart_dek.recency.2";
      p.evidence.chart.dek.text = templateText("C1.chart_dek.recency.2");
      p.chart.dek = fill("C1.chart_dek.recency.2", p.evidence.chart.dek.slots);
    });
    expect(refusal(dek)).toMatch(/the chart subtitle is C1\.chart_dek\.recency\.2, but C1\.chart_dek\.recency\.1 is the first rung within 240 characters/);
  });

  it("refuses a slot whose value is not its evidence number's", () => {
    const b = variant((p) => {
      const a = p.evidence.headline.slots.a as { value: number };
      a.value += 0.1;
    });
    expect(refusal(b)).toMatch(/headline slot \{a\} .* evidence number main:2019->2025\.12420\.office\.growth_pct/);
  });

  it("refuses a probability whose exact fraction is not (m / n)^k", () => {
    const b = variant((p) => void (p.evidence.numbers["main:2019->2025.12420.random_peer.k10"].exact!.numerator = "4711653532607691047048"));
    expect(refusal(b)).toMatch(/\(147 \/ 148\)\^10 is 4711653532607691047049 \/ 5042166166892418433024, not the evidence's 4711653532607691047048/);
  });

  it("refuses a subject note, an axis title or a label order the evidence does not give", () => {
    expect(refusal(variant((p) => void (p.chart.subjectNotes = ["+36% / +39%"])))).toMatch(/subject note is not its template's output/);
    expect(refusal(variant((p) => void (p.chart.x.label = "Office jobs, change 2019 to 2025")))).toMatch(/horizontal axis title reads "Office jobs, change 2019 to 2025"/);
    const order = variant((p) => {
      const ids = p.chart.labels!.ids!;
      [ids[1], ids[2]] = [ids[2], ids[1]];
    });
    expect(refusal(order)).toMatch(/label ids are not the evidence's requested labels in their order/);
  });

  it("refuses a never-used word", () => {
    expect(refusal(variant((p) => void p.evidence.headline.never_used.push("ranking")))).toMatch(/never-used word "ranking"/);
  });

  it("refuses a panel that has not shipped, a template it has no sentences for, a status it cannot describe and a status line that disagrees", () => {
    expect(refusal(variant((p) => void (p.manifest.panels.A = "pending")))).toMatch(/panel A is "pending", not shipped/);
    expect(refusal(variant((p) => void (p.template = "C9")))).toMatch(/no sentences for template "C9"/);
    const b = variant((p) => {
      p.manifest.status = p.evidence.status = p.methods.status = p.methods.status_line.slots.status = "complete";
    });
    expect(refusal(b)).toMatch(/no status note for bundle status "complete"/);
    expect(refusal(variant((p) => void (p.methods.status_line.slots.panel_b = "shipped")))).toMatch(/status line does not agree with the manifest/);
  });

  it("refuses a chart value that is not the evidence's", () => {
    const b = variant((p) => {
      const austin = p.chart.data.find((d) => d.id === "12420")!;
      austin.x = (austin.x as number) + 1;
    });
    expect(refusal(b)).toMatch(/chart row 12420 x is .* evidence number main:2019->2025\.12420\.office\.growth_pct/);
  });

  it("refuses a robustness number or denominator that is not the evidence's", () => {
    const b = variant((p) => {
      p.methods.robustness.rows.D1.windows["2019->2025"].axes!.office.rank.value = 2;
    });
    expect(refusal(b)).toMatch(/robustness D1 2019->2025: D1:2019->2025\.12420\.office\.rank is 2 on the methods page, 1 in the evidence/);
    const n = variant((p) => void (p.methods.robustness.rows.P2.windows["2019->2025"].n = 101));
    expect(refusal(n)).toMatch(/robustness P2 2019->2025: the methods page counts 101 metros, the evidence sets 100/);
  });
});

describe("drawn from the bundle alone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads, builds, renders every canvas and writes every download without a fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("no network at render time");
    });
    const fresh = readBundle(NAME, ROOT);
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
    expect(marks).toHaveLength(EV.chart.plotted);
    expect(marks).toHaveLength(149);
  });

  it("asks every canvas for the evidence's labels in their order, up to 16 on social, OG and inline-wide, the subject with its values", () => {
    const requested = EV.chart.labels.requested.map((r) => r.id);
    expect(requested).toHaveLength(16);
    expect(requested.slice(0, 2)).toEqual(["12420", "42340"]);
    for (const canvas of CANVAS_IDS) {
      const L = layoutBubble(I.spec as BubbleSpec, canvas, "dark");
      expect(L.requested, canvas).toEqual(requested);
      expect(L.placed[0].id).toBe("12420");
      const position = (id: string) => requested.indexOf(id);
      const lastPlaced = Math.max(...L.placed.map((p) => position(p.id)));
      for (const d of L.dropped.filter((x) => x.reason === "cap")) expect(position(d.id), `${canvas} ${d.id}`).toBeGreaterThan(lastPlaced);
      if (canvas !== "inline-narrow") {
        expect(LABEL_CAP[canvas]).toBeGreaterThanOrEqual(16);
        expect(L.dropped.filter((d) => d.reason === "cap"), canvas).toEqual([]);
      }
      expect(renderSvg(I.spec, canvas, "dark")).toContain(">+36.0% / +38.6%</text>");
    }
  });
});
