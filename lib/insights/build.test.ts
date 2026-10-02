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
import { renderRss } from "@/lib/feed/render";
import { InsightRefused, buildInsight, h3bGate, h3bWordingAt, insightBySlug, monthlyEnd, publishedInsights } from "./build";
import { insightCsv, insightJson } from "./downloads";
import { insightsFeedDoc } from "./feed";
import { HEADLINE_MAX, insightJsonLd, reportHeadline } from "./jsonld";
import { readBundle, type LoadedBundle } from "./load";
import { CANVAS_IDS } from "./render/canvas";
import { LABEL_CAP, layoutBubble } from "./render/charts/bubble";
import { renderSvg } from "./render/render";
import { parseChartSpec, type BubbleSpec } from "./render/spec";
import { METHODS_IS, METHODS_IS_NOT, fill, formatSlot, templateText, type TemplateId } from "./sentence";
import { THEMES } from "./render/tokens";
import { BASE, NAME, ROOT, suppressH3b, suppressedPath, variant, type Parts } from "./testFixtures";

const DIR = path.join(ROOT, "lib/insights/data", NAME);
const EV = BASE.findings[0].evidence;
const SIDECAR = JSON.parse(readFileSync(path.join(DIR, "charts/C1-raw.sidecar.json"), "utf8")) as BubbleSpec;
const SLUG = "c1-raw-office-goods-job-growth-2019-2025";
const TITLE = "No Major Metro Beat Austin on Both Office and Goods-and-Logistics Job Growth, 2019 to 2025";
const P2_BOTH = "P2:2019->2025.12420.beat_on_both";

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
    expect(new Set(I.arithmetic.map((r) => r.where))).toEqual(
      new Set(["Headline", "Random peer", "Caveat: recency", "Caveat: ces_manufacturing", "Caveat: benchmarked", "Chart title", "Chart subtitle", "Subject label", "Universe line", "Status note", "Method: what this is"]),
    );
  });

  it("lists the numbers the methods lines print, {t0}, {t1} and {N}, where they print", () => {
    const rows = I.arithmetic.filter((r) => r.where === "Method: what this is");
    expect(rows.map((r) => `${r.slot} ${r.printed} ${r.number}`)).toEqual(["t0 2019 window.t0", "t1 2025 window.t1", "N 150 main.universe.n"]);
    // Every number a line prints that its registered text does not already hold ("1 = the largest growth", "SPEC 8").
    const numbers = (t: string) => (t.match(/\b\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ""));
    for (const [id, line] of [...METHODS_IS.map((x, k) => [x, I.is[k]]), ...METHODS_IS_NOT.map((x, k) => [x, I.isNot[k]])] as Array<[TemplateId, string]>) {
      const constants = numbers(templateText(id));
      for (const n of numbers(line).filter((x) => !constants.includes(x))) expect(rows.map((r) => r.printed), `${n} in ${line}`).toContain(n);
    }
  });

  it("words what the delineation, the weights and the Census estimates decide from the bundle, with no number of its own", () => {
    const by = Object.fromEntries(I.shaping.map((s) => [s.id, s]));
    expect(by.omb_list1_2023.role).toBe(
      "Which metros there are and what they are called: a metro is a metropolitan statistical area of OMB's July 2023 delineation, the geography CES rebuilds metro history on, and its member counties are the ones the fail-closed check reads.",
    );
    expect(by.omb_list1_2023.coverage).toBe("2023-07");
    expect(by.qcew_county_total.role).toBe("The fail-closed check's weights: each member county's 2019 QCEW total covered employment; a metro with a member county that has none fails closed for twins.");
    expect(by.qcew_county_total.coverage).toBe("2019");
    expect(by.census_cbsa_est2025.role).toBe("Row P1's peer set: the 150 largest metros by Census 2025 population (POPESTIMATE2025).");
    expect(by.census_cbsa_est2025.coverage).toBe("2025");
    for (const s of I.shaping) expect(s.role).not.toMatch(/50 states/);
  });

  it("refuses a shaping file whose year disagrees with what the evidence says of it", () => {
    const census = variant((p) => {
      const e = Object.values(p.manifest.sources).find((s) => s.source === "census_cbsa_est2025")!;
      e.url = e.url.replace(/2025/g, "2024");
    });
    expect(refusal(census)).toMatch(/the census_cbsa_est2025 file .*cbsa-est2024-alldata\.csv is for 2024, its registry id says 2025/);
    const omb = variant((p) => void ((p.methods.panel_b as unknown as { registered: { twins: { pooling_composition: string } } }).registered.twins.pooling_composition = "msa_feb2013"));
    expect(refusal(omb)).toMatch(/the delineation composition "msa_feb2013" is not a month of 2023/);
    const weights = variant((p) => {
      const fc = p.evidence.chart.fail_closed[0] as unknown as Record<string, unknown>;
      fc.members_without_2020_weight = fc.members_without_2019_weight;
      delete fc.members_without_2019_weight;
    });
    expect(refusal(weights)).toMatch(/fails closed, but the evidence does not name its members without a 2019 weight/);
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

  it("prints the evidence's formula behind every robustness column", () => {
    expect(I.robustnessFormulas.map((f) => `${f.column} ${f.rows.join(",")}`)).toEqual([
      "Publishable D1,D2,D3,E1,E2,E3,P1,P2,P3,R,X1",
      "Growth D1,D2,D3,E1,E2,E3,P1,P2,P3,R",
      "Rank D1,D2,D3,E1,E2,E3,P1,P2,P3,R,X1",
      "Beat on both D1,D2,D3,E1,E2,E3,P1,P2,P3,R,X1",
      "Growth X1",
    ]);
    for (const r of I.robustness) {
      for (const a of r.axes) for (const key of a.numbers) expect(I.robustnessFormulas.map((f) => f.formula)).toContain(EV.numbers[key].formula);
    }
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

  /** A metro's main-specification growth moved on one axis in the evidence number and the chart sidecar, and in the main set when `sets` is true. */
  const moveMain = (p: Parts, cbsa: string, axis: "office" | "goods_logistics", value: number, sets: boolean) => {
    p.evidence.numbers[`main:2019->2025.${cbsa}.${axis}.growth_pct`].value = value;
    const d = p.chart.data.find((x) => x.id === cbsa)!;
    if (axis === "office") d.x = value;
    else d.y = value;
    if (sets) (p.evidence.sets[`main:2019->2025:${axis}`].members[cbsa] as { growth_pct: number }).growth_pct = value;
  };

  it("refuses a metro that beats the subject on both in the values while every count still says 0", () => {
    // Savannah at 40 / 40 against Austin's 35.96 / 38.56, consistently in the numbers, the sidecar and the main sets.
    const b = variant((p) => {
      moveMain(p, "42340", "office", 40, true);
      moveMain(p, "42340", "goods_logistics", 40, true);
    });
    expect(b.findings[0].evidence.numbers["main:2019->2025.12420.beat_on_both"].value).toBe(0);
    const message = refusal(b);
    expect(message).toMatch(/gate does not hold: .*main:2019->2025: 12420\.beat_on_both is 0 in the evidence, 1 \(42340\) recomputed from the sets/);
    expect(message).toMatch(/the subject's office rank is 1 in the evidence, 2 recomputed from its set/);
    // In the numbers and the sidecar only, the sets give the metro away.
    const unsynced = variant((p) => {
      moveMain(p, "42340", "office", 40, false);
      moveMain(p, "42340", "goods_logistics", 40, false);
    });
    expect(refusal(unsynced)).toMatch(/main:2019->2025: 42340's office growth is 40 in the evidence numbers, [-\d.]+ in its set/);
  });

  it("refuses a metro that is not publishable but beats the subject on the one axis it has, while its count says 0", () => {
    // Tampa's office growth at 50 (Austin 35.96) in its number, the sidecar and its own check, which still says could_beat_both: false.
    const b = variant((p) => {
      moveMain(p, "45300", "office", 50, false);
      const np = p.evidence.numbers["main:2019->2025.12420.not_publishable_could_beat_both"] as unknown as { checks: Array<{ has: { office: { value: number } } }> };
      np.checks[0].has.office.value = 50;
    });
    const message = refusal(b);
    expect(message).toMatch(/main:2019->2025: the not-publishable check of 45300 says .*"could_beat_both":false.*, the evidence numbers it names say .*"could_beat_both":true/);
    expect(message).toMatch(/main:2019->2025: not_publishable_could_beat_both is 0 in the evidence, 1 \(45300\) recomputed from the sets and the metros' own numbers/);
  });

  it("refuses a gating row whose sets have a metro beating the subject on both while its count says 0", () => {
    // Houston (26420), one of P2's 100, at 40 / 40 in both of P2's sets only: P2 carries no number of its own for it.
    const b = variant((p) => {
      for (const axis of ["office", "goods_logistics"]) (p.evidence.sets[`P2:2019->2025:${axis}`].members["26420"] as { growth_pct: number }).growth_pct = 40;
    });
    expect(BASE.findings[0].evidence.numbers["P2:2019->2025.26420.office.growth_pct"]).toBeUndefined();
    expect(refusal(b)).toMatch(/gate does not hold: .*P2:2019->2025: 12420\.beat_on_both is 0 in the evidence, 1 \(26420\) recomputed from the sets/);
  });

  it("refuses when the recency caveat's list is not what row R's sets say", () => {
    const b = variant((p) => {
      // Beaumont no longer beats Austin on office growth in row R's 2022->2025 sets; the caveat and the count still name it.
      const set = p.evidence.sets["R:2022->2025:office"];
      const beaumont = Object.keys(set.members).find((c) => p.evidence.numbers["R:2022->2025.12420.beat_on_both"].metros!.includes(c))!;
      (set.members[beaumont] as { growth_pct: number }).growth_pct = -50;
    });
    expect(refusal(b)).toMatch(/gate does not hold: .*R:2022->2025: 12420\.beat_on_both is 2 \(\d+, \d+\) in the evidence, 1 \(\d+\) recomputed from the sets/);
  });

  it("refuses a gating row dropped from every list the bundle keeps, against the registered rows", () => {
    const b = variant((p) => {
      p.evidence.headline.rule!.H3b!.gating_rows = p.evidence.headline.rule!.H3b!.gating_rows!.filter((r) => r !== "P2");
      p.methods.robustness.gating["C1.H3b"] = p.methods.robustness.gating["C1.H3b"].filter((r) => r !== "P2");
      p.methods.panel_a.headline.h3b_gates.rows = p.methods.panel_a.headline.h3b_gates.rows.filter((r) => r !== "P2");
      p.methods.robustness.rows.P2.gates = [];
      p.evidence.preconditions = p.evidence.preconditions.filter((x) => !x.name.endsWith(".P2"));
    });
    const message = refusal(b);
    expect(message).toMatch(/methods\.json gates it on \["E1","E2","E3","D1","D2","D3","P1","P3"\], not the registered rows \["E1","E2","E3","D1","D2","D3","P1","P2","P3"\]/);
    expect(message).toMatch(/precondition h3b\.no_metro_beat_both\.P2 is missing/);
  });

  it("recomputes the headline's ranks from the main sets even when the clause does not print", () => {
    const b = variant((p) => {
      moveMain(p, "42340", "office", 40, true);
      moveMain(p, "42340", "goods_logistics", 40, true);
      suppressH3b(p);
    });
    expect(refusal(b)).toMatch(/the evidence's counts disagree with its sets: .*the subject's office rank is 1 in the evidence, 2 recomputed from its set/);
  });

  it("refuses a median or a random-peer m that its set does not give", () => {
    const median = variant((p) => {
      const key = p.evidence.chart.medians.office.number;
      const m = p.evidence.numbers[key].metros![0];
      (p.evidence.sets["main:2019->2025:office"].members[m] as { growth_pct: number }).growth_pct += 0.5;
      p.evidence.numbers[`main:2019->2025.${m}.office.growth_pct`].value = (p.evidence.sets["main:2019->2025:office"].members[m] as { growth_pct: number }).growth_pct;
      p.chart.data.find((d) => d.id === m)!.x = p.evidence.numbers[`main:2019->2025.${m}.office.growth_pct`].value;
    });
    expect(refusal(median)).toMatch(/main:2019->2025\.office\.median is [\d.]+ in the evidence, [\d.]+ recomputed from main:2019->2025:office/);
    const peer = variant((p) => void p.evidence.numbers["main:2019->2025.12420.random_peer.k10"].not_beaten!.push("10420"));
    expect(refusal(peer)).toMatch(/random_peer\.k10: m = 147 of n = 148, not beaten \["10420","42340"\] in the evidence; the sets give m = 147 of n = 148, not beaten \["42340"\]/);
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
    const b = variant(suppressH3b);
    expect(refusal(b)).toMatch(/the H3b clause does not print, so the chart title must be the neutral C1\.chart_title\.raw/);
  });
});

describe("the H3b clause's words print only through its gate", () => {
  const H3B_TEXT = templateText("C1.H3b");
  const SUBJECT = EV.headline.slots.subject;
  /** The suppressed path with one more change: the H3b clause does not print, so its gate never runs. */
  const suppressedAnd = (change: (p: Parts) => void) =>
    variant((p) => {
      suppressedPath(p);
      change(p);
    });

  it("builds the suppressed path clean, and the printed path with the words in the headline, its description and the chart title only", () => {
    expect(h3bWordingAt(buildInsight(variant(suppressedPath), "C1-raw"))).toEqual([]);
    expect(I.h3bPrinted).toBe(true);
    expect(h3bWordingAt(I).sort()).toEqual(["chartTitle", "description", "headline", "spec.headline"]);
  });

  it("refuses the H3b template as a caveat", () => {
    const b = suppressedAnd((p) => void p.evidence.caveats.push({ id: "C1.H3b", printed: true, text: H3B_TEXT, slots: { subject: SUBJECT } }));
    expect(refusal(b)).toMatch(/caveat C1\.H3b uses template C1\.H3b, which a caveat may not print \(only C1\.caveat\.recency, /);
  });

  it("refuses the H3b template as the random-peer sentence", () => {
    const b = suppressedAnd((p) => {
      p.evidence.random_peer.id = "C1.H3b";
      p.evidence.random_peer.text = H3B_TEXT;
    });
    expect(refusal(b)).toMatch(/random peer uses template C1\.H3b, which a random peer may not print \(only C1\.random_peer\)/);
  });

  it("refuses an H3b title rung as an extra headline clause, gated by its own precondition", () => {
    const b = suppressedAnd((p) => {
      p.evidence.headline.clauses.push({ id: "C1.chart_title.h3b.2", text: templateText("C1.chart_title.h3b.2"), printed: true, slots: ["subject", "t0", "t1"] });
      p.evidence.preconditions.push({ ...structuredClone(p.evidence.preconditions[0]), name: "extra.clause", gates: "C1.chart_title.h3b.2" });
      p.methods.panel_a.headline.clauses["C1.chart_title.h3b.2"] = true;
    });
    expect(refusal(b)).toMatch(/headline uses template C1\.chart_title\.h3b\.2, which a headline clause may not print \(only C1\.H3\.ranks, C1\.H3b, C1\.H3\.twins\)/);
  });

  it("refuses the H3b clause listed twice in the headline", () => {
    const b = suppressedAnd((p) => void p.evidence.headline.clauses.push({ ...structuredClone(p.evidence.headline.clauses.find((c) => c.id === "C1.H3b")!), printed: true }));
    expect(refusal(b)).toMatch(/the headline lists a clause twice: C1\.H3\.ranks, C1\.H3b, C1\.H3\.twins, C1\.H3b/);
  });

  it("refuses the H3b template as the subject's label, the universe line or the method line", () => {
    const asLabel = suppressedAnd((p) => {
      const note = p.evidence.chart.subject_note!;
      p.evidence.chart.subject_note = { ...note, id: "C1.H3b", text: H3B_TEXT, slots: { ...note.slots, subject: SUBJECT } };
    });
    expect(refusal(asLabel)).toMatch(/subject label uses template C1\.H3b, which a subject label may not print/);
    const asUniverse = suppressedAnd((p) => void (p.evidence.chart.universe_line = { ...p.evidence.chart.universe_line, id: "C1.H3b", text: H3B_TEXT }));
    expect(refusal(asUniverse)).toMatch(/universe line uses template C1\.H3b, which a universe line may not print/);
    const asMethod = suppressedAnd((p) => void (p.evidence.headline.method_line = { id: "C1.H3b", text: H3B_TEXT }));
    expect(refusal(asMethod)).toMatch(/method line uses template C1\.H3b, which a method line may not print/);
  });

  it("refuses a suppressed entry or a precondition for a clause the headline does not have", () => {
    const suppressed = suppressedAnd((p) => {
      const h3b = p.evidence.suppressed.find((s) => s.clause === "C1.H3b")!;
      p.evidence.suppressed.push({ ...structuredClone(h3b), clause: "No major metro beat Austin on both" });
    });
    expect(refusal(suppressed)).toMatch(/the evidence suppresses "No major metro beat Austin on both", which is not a headline clause that does not print/);
    const gates = suppressedAnd((p) => void (p.evidence.preconditions[0].gates = "C1.caveat.recency"));
    expect(refusal(gates)).toMatch(/precondition universe\.n gates "C1\.caveat\.recency", which is neither the finding nor a clause of its headline/);
  });

  // The backstop: routes no template id governs, each carrying the words into the insight.
  it("refuses the words as a precondition's name when the clause does not print", () => {
    const b = suppressedAnd((p) => void p.evidence.preconditions.push({ ...structuredClone(p.evidence.preconditions[0]), name: "No major metro beat Austin on both" }));
    expect(refusal(b)).toMatch(/the H3b clause does not print \(its gate did not hold\), but its words do, at preconditions\.\d+\.name$/);
  });

  it("refuses the words as a failing precondition's name in the reason the clause does not print", () => {
    const name = "no major metro beat Austin on both";
    const b = suppressedAnd((p) => {
      const s = p.evidence.suppressed.find((x) => x.clause === "C1.H3b")!;
      s.preconditions[0].name = name;
      s.reason = `a precondition fails: ${name}`;
    });
    expect(refusal(b)).toMatch(/but its words do, at notPrinted\.\d+\.reason$/);
  });

  it("refuses the words as a metro's label on the chart", () => {
    const b = suppressedAnd((p) => void (p.chart.data[2].label = "No major metro beat Austin on both"));
    expect(refusal(b)).toMatch(/but its words do, at spec\.data\.2\.label$/);
  });

  it("refuses the words outside the headline, its description and the title when the clause prints", () => {
    const b = variant((p) => void p.evidence.preconditions.push({ ...structuredClone(p.evidence.preconditions[0]), name: "No major metro beat Austin on both" }));
    expect(refusal(b)).toMatch(/the H3b clause's words print outside the headline, its description and the chart title, at preconditions\.\d+\.name$/);
  });

  it("finds the words at every place the page prints from, in any case and spacing", () => {
    const clean = buildInsight(variant(suppressedPath), "C1-raw");
    const words = "No  Major\u00a0metro beat Austin on BOTH";
    const places: Array<[string, (i: typeof clean) => void]> = [
      ["headline", (i) => void (i.headline += ` ${words}`)],
      ["description", (i) => void (i.description += ` ${words}`)],
      ["caveats.0.text", (i) => void (i.caveats[0].text = words)],
      ["randomPeer", (i) => void (i.randomPeer = words)],
      ["chartTitle", (i) => void (i.chartTitle = words)],
      ["dek", (i) => void (i.dek = words)],
      ["spec.dek", (i) => void ((i.spec as BubbleSpec).dek = words)],
      ["notPrinted.0.reason", (i) => void (i.notPrinted[0].reason = words)],
      ["robustness.0.beatOnBoth.names.0", (i) => void (i.robustness[0].beatOnBoth = { count: "1", names: [words], number: "n" })],
      ["methodNote.1", (i) => void (i.methodNote[1] = words)],
    ];
    for (const [at, put] of places) {
      const i = structuredClone(clean);
      put(i);
      expect(h3bWordingAt(i), at).toEqual([at]);
    }
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

  it("refuses any other producer text the page prints that drifted from its registered words", () => {
    // Panel B's gate rules.
    expect(refusal(variant((p) => void (p.methods.panel_b.gate[1].rule = p.methods.panel_b.gate[1].rule.replace("±25%", "±30%"))))).toMatch(/panel B's gate beats_naive_and_geography_peers reads .*±30%.*, not the registered rule/);
    expect(refusal(variant((p) => void (p.methods.panel_b.gate[0].name = "bar_result_noted")))).toMatch(/panel B's gate "bar_result_noted" has no registered rule/);
    // The robustness rows' rules, rankings and sizes.
    expect(refusal(variant((p) => void (p.methods.robustness.rows.D1.registered.rule = "all of 40 in place of 43")))).toMatch(/robustness row D1's rule reads "all of 40 in place of 43", not the registered/);
    expect(refusal(variant((p) => void (p.methods.robustness.rows.P1.registered.ranked_by = "Census 2024 population")))).toMatch(/robustness row P1's ranking reads "Census 2024 population"/);
    expect(refusal(variant((p) => void (p.methods.robustness.rows.P2.registered.largest_n = 99)))).toMatch(/robustness row P2 registers the 99 largest metros, but its sets cover 100/);
    // Why a clause or a caveat does not print.
    expect(refusal(variant((p) => void (p.evidence.suppressed[0].reason = "twins_pending: no twin yet")))).toMatch(/suppressed clause C1\.H3\.twins gives the reason "twins_pending: no twin yet", which is none of its registered forms/);
    const qcew = variant((p) => {
      const c = p.evidence.caveats.find((x) => x.id === "C1.caveat.qcew_manufacturing")!;
      c.reason = c.reason!.replace("2023", "2024");
    });
    expect(refusal(qcew)).toMatch(/caveat C1\.caveat\.qcew_manufacturing gives the reason .*, which is none of its registered forms \(C1\.reason\.qcew_manufacturing\)/);
    // Why a metro is not published: a registered code, and the one its sets give.
    expect(refusal(variant((p) => void (p.evidence.chart.not_published[0].reason = "suppressed by BLS")))).toMatch(/Tampa-St\. Petersburg-Clearwater, FL is not published for the reason "suppressed by BLS", which is not a registered code/);
    expect(refusal(variant((p) => void (p.evidence.chart.not_published[0].reason = "zero_base")))).toMatch(/Tampa-St\. Petersburg-Clearwater, FL's reason is not the one the main sets give for leaving it out/);
    // Formulas and thresholds.
    expect(refusal(variant((p) => void (p.evidence.numbers["main:2019->2025.12420.office.rank"].formula = "1 + the members with a larger value")))).toMatch(
      /evidence number main:2019->2025\.12420\.office\.rank \(rank\) states the formula "1 \+ the members with a larger value", not the registered rank/,
    );
    expect(refusal(variant((p) => void (p.evidence.numbers["main:2019->2025.12420.office.rank"].formula = templateText("C1.H3b"))))).toMatch(/not the registered rank/);
    expect(refusal(variant((p) => void (p.evidence.preconditions.find((x) => x.name === "universe.n")!.threshold = "== 151 (prereg flagship.universe.largest_n)")))).toMatch(
      /precondition universe\.n states the threshold "== 151 \(prereg flagship\.universe\.largest_n\)", which is not a registered one/,
    );
  });

  it("refuses a precondition value the table prints that the chart or the subject's cells do not give", () => {
    const named = variant((p) => {
      const x = p.evidence.preconditions.find((q) => q.name === "universe.fail_closed_named")!;
      x.value = 3;
      x.metros = x.metros!.slice(1);
    });
    expect(refusal(named)).toMatch(/precondition universe\.fail_closed_named counts 3 \(.*\), the chart names 4/);
    const prelim = variant((p) => {
      const key = "main:2019->2025.12420.office.growth_pct";
      p.evidence.numbers[key].provenance[0] = p.evidence.numbers[key].provenance[0].replace("|M13|", "|M12|");
    });
    expect(refusal(prelim)).toMatch(/precondition h3\.cells_not_annual_or_footnoted is 0, the subject's cells give 1/);
  });

  it("builds the suppressed path: no H3b clause, the neutral title, the reason in its registered form", () => {
    const i = buildInsight(variant(suppressedPath), "C1-raw");
    expect(i.headline).toBe("From 2019 to 2025 Austin's office-industry jobs grew 36.0% and its goods-and-logistics jobs 38.6%, ranking 1st and 2nd of 149 major metros.");
    // With no claim in the headline or the title, the description is the headline alone.
    expect(i.description).toBe(i.headline);
    expect(i.chartTitle).toBe("Job Growth in Office and Goods-and-Logistics Industries, 150 Largest US Metros, 2019 to 2025");
    expect(i.notPrinted).toContainEqual({ id: "C1.H3b", reason: "a precondition fails: h3b.no_metro_beat_both.P2" });
    expect(i.h3bPrinted).toBe(false);
    expect(h3bWordingAt(i)).toEqual([]);
    // The same suppression with a reason that names a row that did not fail is refused.
    const wrong = variant((p) => {
      suppressH3b(p);
      p.evidence.suppressed.find((s) => s.clause === "C1.H3b")!.reason = "a precondition fails: h3b.no_metro_beat_both.P3";
    });
    expect(refusal(wrong)).toMatch(/suppressed clause C1\.H3b gives the reason "a precondition fails: h3b\.no_metro_beat_both\.P3"/);
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

describe("years and counts in the registered texts, read back from the evidence", () => {
  const CELL = "SMU01138200000000001|2019|M13";

  it("refuses a Source line period that is not its cell's, a cited cell the rows do not read and an estimate off the window", () => {
    expect(refusal(variant((p) => void (p.chart.provenance[CELL].period = "2018 annual average")))).toMatch(
      /the chart's Source line prints "2018 annual average" for SMU01138200000000001\|2019\|M13, the cell's period is "2019 annual average"/,
    );
    // The record moved to 2018 and its datum citing it there: a valid sidecar, but no row's number reads that cell.
    const moved = variant((p) => {
      const MOVED = "SMU01138200000000001|2018|M13";
      p.chart.provenance[MOVED] = { ...p.chart.provenance[CELL], period: "2018 annual average" };
      delete p.chart.provenance[CELL];
      for (const d of p.chart.data) d.provenance = d.provenance.map((k) => (k === CELL ? MOVED : k));
    });
    expect(refusal(moved)).toMatch(/the chart cites SMU01138200000000001\|2018\|M13 from ".*sm\.data\.54\.TotalNonFarm\.All", which is not a cell its rows read from that file/);
    expect(refusal(variant((p) => void (p.chart.provenance.growth.period = "2019/2024")))).toMatch(/the chart's estimate growth is for "2019\/2024", not the window 2019\/2025/);
  });

  it("refuses the QCEW caveat's reason when its years are not row X1's or a later QCEW cell is in the evidence", () => {
    const years = variant((p) => {
      const c = p.evidence.caveats.find((x) => x.id === "C1.caveat.qcew_manufacturing")!;
      c.reason = c.reason!.replaceAll("2023", "2024");
    });
    expect(refusal(years)).toMatch(/caveat C1\.caveat\.qcew_manufacturing gives the reason "no QCEW cell after 2024 .*", which is none of its registered forms \(C1\.reason\.qcew_manufacturing\) with the evidence's own values/);
    // One 2023 QCEW cell moved to 2024: the reason's "no QCEW cell after 2023" is no longer true.
    const later = variant((p) => {
      const cells = p.evidence.cells!;
      const key = Object.keys(cells).find((k) => p.evidence.sources[k]?.source.startsWith("qcew") && Object.values(cells[k]).some((c) => "2023|A" in c))!;
      const series = Object.values(cells[key]).find((c) => "2023|A" in c)!;
      series["2024|A"] = series["2023|A"];
      delete series["2023|A"];
    });
    expect(refusal(later)).toMatch(/caveat C1\.caveat\.qcew_manufacturing gives the reason "no QCEW cell after 2023 .*", which is none of its registered forms/);
  });

  it("refuses a universe formula whose year, period or cutoff ranks are not the evidence's", () => {
    const formula = (from: string, to: string) =>
      variant((p) => {
        const n = p.evidence.numbers["main.universe.n"];
        n.formula = n.formula!.replace(from, to);
      });
    expect(refusal(formula("2019 M13", "2018 M13"))).toMatch(/main\.universe\.n's formula .* does not read back from the evidence: it ranks on 2018 M13, the universe set on \[\[2019,"M13"\]\] and the window starts in 2019/);
    expect(refusal(formula("rank_150 and rank_151", "rank_149 and rank_150"))).toMatch(/it names rank_149 and rank_150, the universe holds 150 metros \(registered 150\)/);
    const swapped = variant((p) => {
      const c = p.evidence.sets["main:universe"].cutoff!;
      [c.rank_150, c.rank_151] = [c.rank_151, c.rank_150];
    });
    expect(refusal(swapped)).toMatch(/rank_150 \(34940\) is not the last metro in or rank_151 \(38940\) not the first one out/);
  });

  it("reads a monthly end's months out of its words, as many as they say", () => {
    const e2 = monthlyEnd("the mean of the 12 monthly values Sep 2025-Aug 2026")!;
    expect(e2).toHaveLength(12);
    expect([e2[0], e2[3], e2[4], e2[11]]).toEqual(["2025|M09", "2025|M12", "2026|M01", "2026|M08"]);
    expect(monthlyEnd("the mean of the 11 monthly values Sep 2025-Aug 2026")).toBeNull();
    expect(monthlyEnd("the mean of the 12 monthly values Sept 2025-Aug 2026")).toBeNull();
  });

  it("refuses a monthly end whose numbers do not read exactly the months its words name", () => {
    const key = "E2:2019->mean(Sep 2025-Aug 2026).12420.office.growth_pct";
    const b = variant((p) => {
      const n = p.evidence.numbers[key];
      n.provenance = n.provenance.map((t) => t.replace("|2026|M08|", "|2026|M09|"));
    });
    expect(refusal(b)).toMatch(/robustness row E2 ends at "the mean of the 12 monthly values Sep 2025-Aug 2026", but its numbers read .*2026\|M09/);
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
    insightCsv(i, { all: true });
    insightJson(i);
    insightJson(i, { all: true });
    insightJsonLd(i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("draws the recency subtitle under the H3b title on the OG card, as on the social card", () => {
    for (const canvas of ["social", "og"] as const) {
      const svg = renderSvg(I.spec, canvas, "dark");
      const words = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, "&")).join(" ");
      expect(words, canvas).toContain(I.dek);
      expect(I.dek).toContain("Beaumont and Tallahassee beat it on both");
    }
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
  const parse = (csv: string) => {
    const lines = csv.split("\r\n");
    return { header: csvCells(lines[0]), records: lines.slice(1).filter((l) => l !== "" && !l.startsWith("#")).map(csvCells), footer: lines.filter((l) => l.startsWith("# ")) };
  };
  const cell = (v: number | null) => (v === null ? "not published" : String(v));
  const plotted = SIDECAR.data.filter((d) => d.x !== null && d.y !== null);

  it("CSV carries the plotted rows by default, values as published and a missing one as 'not published'", () => {
    const { header, records, footer } = parse(insightCsv(I));
    expect(header).toEqual(["id", "Name", SIDECAR.x.label, SIDECAR.y.label, SIDECAR.size.label]);
    expect(records).toHaveLength(149);
    expect(records.map((r) => r[0]).sort()).toEqual(plotted.map((d) => d.id).sort());
    expect(records.some((r) => r[0] === "45300")).toBe(false);
    const byId = new Map(records.map((c) => [c[0], c]));
    for (const d of plotted) expect(byId.get(d.id), d.id).toEqual([d.id, d.fullLabel, cell(d.x), cell(d.y), cell(d.size)]);
    for (const r of records) for (const v of r) expect(v).not.toBe("");
    expect(footer[0]).toBe("# rows: the 149 rows the chart plots; ?all=1 adds the 1 of its 150 it does not plot");
  });

  it("CSV with { all: true } (?all=1) carries every row, Tampa's missing value as 'not published'", () => {
    const { records, footer } = parse(insightCsv(I, { all: true }));
    expect(records).toHaveLength(150);
    const tampa = records.find((r) => r[0] === "45300")!;
    expect(tampa).toEqual(["45300", "Tampa-St. Petersburg-Clearwater, FL", "15.884293326566844", "not published", "165.7"]);
    for (const r of records) for (const v of r) expect(v).not.toBe("");
    expect(footer[0]).toBe("# rows: all 150 rows of the chart's universe, the 1 it does not plot included; without ?all=1, only the 149 plotted rows");
  });

  it("CSV footer carries the as-of date, every file's citation, the unpublished row and the bundle hashes", () => {
    const csv = insightCsv(I);
    const { footer } = parse(csv);
    expect(footer).toContain("# as_of: 2026-09-18");
    expect(footer).toContain('# missing values: "not published", never 0 and never empty');
    for (const c of I.citations) expect(footer).toContain(`# source: ${c}`);
    expect(footer.filter((l) => l.startsWith("# source: "))).toHaveLength(I.citations.length);
    expect(footer).toContain("# not published: Tampa-St. Petersburg-Clearwater, FL");
    expect(footer.join("\n")).toContain(I.hashes.evidence);
    expect(footer).toContain("# read with pandas: pd.read_csv(url, comment='#', na_values=['not published'])");
    expect(csv).not.toMatch(/generated_at/);
  });

  it("JSON carries the plotted rows by default and every row with { all: true }, 'not published' for a missing value, and only the records they cite", () => {
    const j = insightJson(I) as { rows: Array<Record<string, unknown>>; provenance: Record<string, unknown>; selection: Record<string, unknown>; description: string };
    expect(j.selection).toMatchObject({ rows: "plotted", count: 149, plotted: 149, total: 150 });
    expect(j.description).toBe(I.description);
    expect(j.description).toContain("Beaumont and Tallahassee beat it on both");
    expect(j.rows.map((r) => r.id)).toEqual(plotted.map((d) => d.id).sort());
    const cited = new Set(plotted.flatMap((d) => d.provenance));
    expect(Object.keys(j.provenance).sort()).toEqual([...cited].sort());
    const all = insightJson(I, { all: true }) as { rows: Array<Record<string, unknown>>; provenance: Record<string, unknown>; selection: Record<string, unknown> };
    expect(all.selection).toMatchObject({ rows: "all", count: 150 });
    expect(all.rows.find((r) => r.id === "45300")).toMatchObject({ x: 15.884293326566844, y: "not published", size: 165.7 });
    expect(Object.keys(all.provenance).sort()).toEqual(Object.keys(SIDECAR.provenance).sort());
    for (const r of all.rows) for (const k of ["x", "y", "size"]) expect(r[k] === null).toBe(false);
  });
});

describe("JSON-LD and the feed", () => {
  const [report, dataset] = insightJsonLd(I) as Array<Record<string, unknown>>;
  const ISO = /^\d{4}(-\d{2})?(\/\d{4}(-\d{2})?)?$/;

  it("heads the Report with the chart title, within 110 characters, and puts the sentence and its recency caveat in its description", () => {
    expect(report["@type"]).toBe("Report");
    expect(report.headline).toBe(TITLE);
    expect((report.headline as string).length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(HEADLINE_MAX).toBe(110);
    expect(report.description).toBe(I.description);
    expect(I.description).toBe(`${I.headline} From 2022 to 2025 Austin ranks 17th on office-industry and 5th on goods-and-logistics growth, and Beaumont and Tallahassee beat it on both.`);
    expect((report.about as { url: string }).url).toMatch(/\/metro\/12420$/);
    expect(() => reportHeadline({ id: "x", chartTitle: "A".repeat(111) })).toThrow(/111 characters, over the 110/);
  });

  it("gives every file its own ISO 8601 coverage, the years actually read from it", () => {
    expect(dataset.temporalCoverage).toBe("2019/2025");
    expect(report.temporalCoverage).toBe("2019/2025");
    const based = dataset.isBasedOn as Array<{ url: string; temporalCoverage: string }>;
    expect(based.map((d) => d.url)).toEqual([...I.files.map((f) => f.url), I.shaping.find((s) => s.id === "omb_list1_2023")!.url]);
    expect(based.find((d) => d.url.endsWith("sm.data.54.TotalNonFarm.All"))?.temporalCoverage).toBe("2019/2025");
    expect(based.find((d) => d.url.endsWith("list1_2023.xlsx"))?.temporalCoverage).toBe("2023-07");
    const reportBased = (report.isBasedOn as Array<{ url?: string; temporalCoverage?: string }>).filter((d) => d.url);
    expect(reportBased.find((d) => d.url!.endsWith("cbsa-est2025-alldata.csv"))?.temporalCoverage).toBe("2025");
    for (const d of [...based, ...reportBased]) expect(d.temporalCoverage, d.url).toMatch(ISO);
    expect(JSON.stringify([report, dataset])).not.toMatch(/annual average/);
  });

  it("lists the four downloads the routes serve", () => {
    const urls = (dataset.distribution as Array<{ contentUrl: string }>).map((d) => d.contentUrl.replace(/^https:\/\/[^/]+/, ""));
    expect(urls).toEqual([`/insights/${SLUG}/data.csv`, `/insights/${SLUG}/data.csv?all=1`, `/insights/${SLUG}/data.json`, `/insights/${SLUG}/data.json?all=1`]);
  });

  it("gives each insight a content-addressed entry id and the bundle's own dates", () => {
    const doc = insightsFeedDoc([I], { self: "https://eye.jcamd.com/insights/feed.xml", home: "https://eye.jcamd.com/insights" });
    expect(doc.entries[0].id).toBe(`gev-insight-${SLUG}-${I.contentId}`);
    expect(doc.entries[0].published).toBe("2026-10-01T21:26:39Z");
    expect(doc.generatedAt).toBe("2026-10-01T21:26:39Z");
    expect(doc.description).toContain("published cells and estimates computed from them (formulas printed)");
    expect(doc.description).not.toMatch(/every number in it is a published cell/);
    expect(renderRss(doc)).toBe(renderRss(insightsFeedDoc([buildInsight(BASE, "C1-raw")], { self: doc.selfUrl, home: doc.homeUrl })));
    const otherEvidence = { ...BASE, hashes: { ...BASE.hashes, "evidence/C1-raw.json": "0".repeat(64) } };
    expect(buildInsight(otherEvidence, "C1-raw").contentId).not.toBe(I.contentId);
  });
});
