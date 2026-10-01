// One published insight as a document.
//
// Everything on this page comes from a committed, hash-verified places
// bundle (lib/insights/load.ts) through lib/insights/build.ts, which refuses
// a finding unless every precondition passed. The headline and every caveat
// are registered templates (lib/insights/sentence.ts) filled with evidence
// numbers; no language model wrote a word of it. Each printed number is
// listed under "The arithmetic" with its formula and the published cells it
// reads, each cell cited with lib/provenance citation().
//
// The chart is the renderer's SVG, inline, twice: the 760-wide variant above
// the phone breakpoint and the 400-wide one below it, toggled by CSS, so the
// page ships no JavaScript for it. Each SVG is role="img" with a <title> and
// a <desc> (lib/insights/render). The data table under it holds every row of
// the chart, plotted or not, and is the chart's text alternative.
//
// Statically generated from the committed bundle: no request-time data, no
// network. An unknown slug is a 404.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumbs from "@/components/doc/Breadcrumbs";
import FactTable, { type FactRow } from "@/components/doc/FactTable";
import JsonLd from "@/components/doc/JsonLd";
import { MISSING, num } from "@/lib/brief/format";
import { insightBySlug, publishedInsights } from "@/lib/insights/build";
import { insightPath } from "@/lib/insights/feed";
import { insightJsonLd, insightTrail } from "@/lib/insights/jsonld";
import { renderSvg } from "@/lib/insights/render/render";
import { chartTable } from "@/lib/insights/render/table";
import { robustnessKind } from "@/lib/insights/sentence";
import type { ArithmeticRow, Insight } from "@/lib/insights/types";
import { absoluteUrl } from "@/lib/seo/base";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return publishedInsights().map((i) => ({ slug: i.slug }));
}

type Params = { params: Promise<{ slug: string }> };

function load(slug: string): Insight {
  const i = insightBySlug(slug);
  if (!i) notFound();
  return i;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const i = load(slug);
  const url = absoluteUrl(insightPath(i));
  return {
    title: i.chartTitle,
    description: i.headline,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": absoluteUrl("/insights/feed.xml"),
        "application/feed+json": absoluteUrl("/insights/feed.json"),
        "text/csv": absoluteUrl(`${insightPath(i)}/data.csv`),
      },
    },
    openGraph: { title: i.chartTitle, description: i.headline, url, type: "article" },
    twitter: { card: "summary_large_image", title: i.chartTitle, description: i.headline },
  };
}

// ---------------------------------------------------------------- small pieces

function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="text-[19px] font-semibold leading-tight text-foreground">
      {title}{" "}
      <a href={`#${id}`} className="text-muted-foreground no-underline hover:text-primary" aria-label={`Link to ${title}`}>
        #
      </a>
    </h2>
  );
}

function where(r: ArithmeticRow): string {
  return r.where === "headline" ? "Headline" : `Caveat ${r.where.replace(/^C1\.caveat\./, "")}`;
}

function Arithmetic({ rows }: { rows: ArithmeticRow[] }) {
  return (
    <ol className="mt-3 space-y-4">
      {rows.map((r) => (
        <li key={`${r.where}|${r.slot}|${r.number}`} id={`n-${r.where}-${r.slot}`} className="border-l-2 border-border pl-3 text-[14px] leading-relaxed">
          <div className="font-semibold text-foreground">
            {where(r)}, {"{"}
            {r.slot}
            {"}"} prints <span className="tabular-nums">{r.printed}</span>
          </div>
          <div className="text-muted-foreground">
            <code className="text-[12px]">{r.number}</code> ({r.kind}): {r.formula}
            {r.over.length ? <> Over the sets {r.over.join(" and ")}.</> : null}
          </div>
          {r.registered ? <div className="text-muted-foreground">Registered in {r.registered}.</div> : null}
          {r.cells.length ? (
            <ul className="mt-1 space-y-1">
              {r.cells.map((c, k) => (
                <li key={`${c.seriesId}|${c.period}|${k}`} className="text-[13px]">
                  <span className="tabular-nums text-foreground">
                    {c.seriesId} {c.period} = {c.value}
                    {c.footnote ? ` (footnote ${c.footnote})` : ""}
                  </span>
                  <span className="block text-muted-foreground break-words">{c.citation}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- the page

export default async function InsightPage({ params }: Params) {
  const { slug } = await params;
  const i = load(slug);
  const table = chartTable(i.spec);
  const wide = renderSvg(i.spec, "inline-wide", "light");
  const narrow = renderSvg(i.spec, "inline-narrow", "light");
  const base = insightPath(i);

  const preconditionRows: FactRow[] = i.preconditions.map((p, k) => ({
    key: `${p.name}|${k}`,
    cells: [p.name, p.gates, p.value === null ? MISSING : typeof p.value === "number" ? num(p.value) : String(p.value), p.threshold, p.pass ? "pass" : "FAIL"],
  }));
  const robustnessRows: FactRow[] = i.robustness.map((r) => ({
    key: `${r.id}|${r.window}`,
    cells: [
      `${r.id}: ${robustnessKind(r.kind)}`,
      r.change,
      r.window,
      ...[0, 1].map((k) => (r.axes[k] ? `${r.axes[k].label} ${r.axes[k].growth}, ${r.axes[k].rank}` : MISSING)),
      r.beatOnBoth ? (r.beatOnBoth.names.length ? `${r.beatOnBoth.count}: ${r.beatOnBoth.names.join("; ")}` : r.beatOnBoth.count) : MISSING,
      r.publishable,
      r.gates ? "yes" : "no",
    ],
  }));
  const robustnessSources = [...new Set(i.robustness.flatMap((r) => r.sources))];
  const sizeLabel = i.spec.kind === "bubble" ? i.spec.size.label : null;

  return (
    <article>
      <JsonLd nodes={insightJsonLd(i)} />
      <Breadcrumbs trail={insightTrail(i)} />

      <header className="mt-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Insight · panel {i.panel} · {i.bundle} · numbers as of {i.asOf}
        </p>
        <h1 className="mt-2 max-w-[48rem] text-[26px] font-semibold leading-tight text-foreground">{i.headline}</h1>
        <p className="mt-3 max-w-[48rem] text-[15px] leading-relaxed text-muted-foreground">{i.dek}</p>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Subject:{" "}
          <Link href={`/metro/${i.subject.cbsa}`} className="text-primary underline">
            {i.subject.title}
          </Link>
        </p>
      </header>

      <figure id="chart" className="mt-8 border-t border-border pt-5" aria-labelledby="chart-title">
        <h2 id="chart-title" className="text-[19px] font-semibold leading-tight text-foreground">
          {i.chartTitle}
        </h2>
        <div className="mt-3 hidden sm:block" dangerouslySetInnerHTML={{ __html: wide }} />
        <div className="mt-3 sm:hidden" dangerouslySetInnerHTML={{ __html: narrow }} />
        <figcaption className="mt-2 max-w-[48rem] text-[13px] leading-relaxed text-muted-foreground">
          {table.caption}
          {table.missing.length ? ` Not published: ${table.missing.join("; ")}.` : ""}
          {sizeLabel ? ` Bubble area: ${sizeLabel}; an outlined bubble is a negative value.` : ""}
        </figcaption>
        <p className="mt-2 text-[13px]">
          <a href={`${base}/data.csv`} className="text-primary underline">
            data.csv
          </a>
          {" · "}
          <a href={`${base}/data.json`} className="text-primary underline">
            data.json
          </a>
          {" · "}
          <a href={`${base}/social.png`} className="text-primary underline">
            card (PNG, 1080 × 1350)
          </a>
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] text-foreground">Data table: all {num(table.rows.length)} metros in the chart</summary>
          <FactTable columns={table.columns} rows={table.rows} caption={table.caption} />
        </details>
      </figure>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="caveats" title="Caveats" />
        <ul className="mt-3 max-w-[48rem] list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
          {i.caveats.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
        {i.notPrinted.length ? (
          <>
            <p className="mt-4 text-[14px] font-semibold text-foreground">Not printed, and why</p>
            <ul className="mt-1 max-w-[48rem] list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
              {i.notPrinted.map((n) => (
                <li key={n.id}>
                  <code className="text-[12px]">{n.id}</code>: {n.reason}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="method" title="Method" />
        {i.methodNote.map((m) => (
          <p key={m} className="mt-3 max-w-[48rem] text-[15px] leading-relaxed">
            {m}
          </p>
        ))}
        <p className="mt-4 text-[14px] font-semibold text-foreground">What this is</p>
        <ul className="mt-1 max-w-[48rem] list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          {i.is.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] font-semibold text-foreground">What this is not</p>
        <ul className="mt-1 max-w-[48rem] list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          {i.isNot.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-4 max-w-[48rem] text-[14px] leading-relaxed">{i.panelB.text}</p>
        <ul className="mt-1 max-w-[48rem] list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
          {i.panelB.gate.map((g) => (
            <li key={g.name}>
              <code className="text-[12px]">{g.name}</code> ({g.status}): {g.rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="arithmetic" title="The arithmetic" />
        <p className="mt-2 max-w-[48rem] text-[14px] leading-relaxed text-muted-foreground">
          Every number printed above, the evidence entry it is read from, how that entry is computed, and each published cell it reads.
        </p>
        <Arithmetic rows={i.arithmetic} />
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="preconditions" title="Preconditions" />
        <FactTable
          columns={[
            { key: "name", label: "Precondition" },
            { key: "gates", label: "Gates" },
            { key: "value", label: "Value", align: "right" },
            { key: "threshold", label: "Needs" },
            { key: "pass", label: "Result" },
          ]}
          rows={preconditionRows}
          caption={`Every precondition recorded in the evidence for ${i.id}. The finding is published only because each one passes.`}
        />
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="robustness" title="Robustness rows" />
        <FactTable
          columns={[
            { key: "row", label: "Row" },
            { key: "change", label: "What changes" },
            { key: "window", label: "Window" },
            { key: "a", label: "Office-type growth, rank" },
            { key: "b", label: "Goods-type growth, rank" },
            { key: "both", label: "Beat on both" },
            { key: "pub", label: "Publishable", align: "right" },
            { key: "gates", label: "Gates the headline" },
          ]}
          rows={robustnessRows}
          caption={`The registered robustness rows, recomputed for ${i.subject.title}. A row marked "yes" is a precondition of the clause that no major metro beat it on both; the others are reported only.`}
        />
        <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-muted-foreground">
          {robustnessSources.map((s) => (
            <li key={s} className="break-words">
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <SectionHead id="universe" title="Universe" />
        <p className="mt-2 max-w-[48rem] text-[15px] leading-relaxed">{i.universe}.</p>
        <ul className="mt-2 max-w-[48rem] list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
          {i.notPublished.map((m) => (
            <li key={m.cbsa}>
              {m.title}: not published{m.reason ? ` (${m.reason})` : ""}.
            </li>
          ))}
          {i.failClosed.map((m) => (
            <li key={m.cbsa}>{m.title}: fails closed for twins; still in panel A.</li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-border pt-5">
        <SectionHead id="sources" title="Sources" />
        <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed">
          {i.citations.map((c) => (
            <li key={c} className="break-words">
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[48rem] text-[13px] leading-relaxed text-muted-foreground">
          Built from bundle {i.bundle} (release {i.release}, rules_version {i.rulesVersion}), finding {i.id}. sha256: manifest.json {i.hashes.manifest}; chart sidecar {i.hashes.chart}; evidence {i.hashes.evidence}; methods {i.hashes.methods}. Every sentence on this page is a fixed template filled from that evidence; no language model wrote any of it.
        </p>
      </footer>
    </article>
  );
}
