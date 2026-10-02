// Shared fixtures for the insight tests: the committed places-v0.1.1 bundle
// and the one-change variants the refusal tests build from it.
//
// Nothing here invents a value: every variant starts from deep copies of the
// real documents and moves fields the way a bad export or a hand edit would.

import path from "node:path";
import { loadBundle, type LoadedBundle } from "./load";
import type { BubbleSpec } from "./render/spec";
import { fill, templateText } from "./sentence";
import type { BundleManifest, Evidence, Methods } from "./types";

export const ROOT = path.resolve(__dirname, "../..");
export const NAME = "places-v0.1.1";
export const BASE: LoadedBundle = loadBundle(NAME, ROOT);

export interface Parts {
  manifest: BundleManifest;
  methods: Methods;
  evidence: Evidence;
  chart: BubbleSpec;
  template: string;
}

/** The bundle with one change applied to deep copies of its documents. */
export function variant(change: (p: Parts) => void): LoadedBundle {
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

/** The H3b clause suppressed the way the producer suppresses it: a failing row named in the registered reason form. */
export function suppressH3b(p: Parts): void {
  p.evidence.headline.clauses.find((c) => c.id === "C1.H3b")!.printed = false;
  const failing = { ...structuredClone(p.evidence.preconditions.find((x) => x.name === "h3b.no_metro_beat_both.P2")!), pass: false, value: 1 };
  p.evidence.suppressed.push({ clause: "C1.H3b", reason: "a precondition fails: h3b.no_metro_beat_both.P2", preconditions: [failing] });
  p.evidence.preconditions = p.evidence.preconditions.filter((x) => x.gates !== "C1.H3b");
  p.methods.panel_a.headline.clauses["C1.H3b"] = false;
}

/** The whole suppressed path, which builds: the H3b clause suppressed and the chart under the neutral title. */
export function suppressedPath(p: Parts): void {
  suppressH3b(p);
  const slots = { ...p.evidence.chart.title.slots, N: p.evidence.chart.universe_line.slots.N };
  p.evidence.chart.title = { id: "C1.chart_title.raw", text: templateText("C1.chart_title.raw"), slots };
  p.chart.headline = fill("C1.chart_title.raw", slots);
}
