"use client";
// The join between the constructs world and the physical one, by location.
//
// ConstructAside is mounted by InfoPanel for a selected constructs feature:
// for the "here" anchor it lists the whole stack by point of view; for one
// construct it lists its relations and then every feature loaded on the
// globe right now that falls inside the construct's outline, layer by layer.
//
// ConstructContext is mounted for a selected feature of any other layer while
// the constructs layer is on: the constructs whose outlines contain it. Both
// directions are plain point-in-polygon over what is already in the browser;
// nothing is fetched and nothing is inferred beyond the published outlines.

import { useMemo } from "react";
import { useGlobe } from "@/lib/store/globe";
import { LAYER_BY_ID } from "@/lib/layers";
import type { LayerFeature } from "@/lib/layers/types";
import { allRenderers, getRenderer } from "@/lib/globe/registry";
import { flyToSelection } from "@/lib/globe/camera";
import { DOMAIN_ORDER, DOMAINS, KINDS } from "@/lib/fabric/catalog";
import { ringsContain } from "@/lib/fabric/geo";
import { joinInside, pointOf } from "@/lib/fabric/join";
import type { ConstructExtra, ConstructNode, Fabric } from "@/lib/fabric/types";

function extraOf(f: LayerFeature): ConstructExtra | undefined {
  return f.properties.extra as ConstructExtra | undefined;
}

function selectFeature(f: LayerFeature, fly = false) {
  const sel = { layer: f.properties.layer, id: f.properties.id };
  useGlobe.getState().select(sel, f);
  if (fly) flyToSelection(sel);
}

function constructFeature(id: string): LayerFeature | undefined {
  const r = getRenderer("constructs");
  if (!r) return undefined;
  for (const f of r.features()) if (f.properties.id === id) return f;
  return undefined;
}

function loadedFeatures(): LayerFeature[] {
  const out: LayerFeature[] = [];
  for (const r of allRenderers()) {
    if (!r.show || r.layer === "constructs") continue;
    for (const f of r.features()) out.push(f);
  }
  return out;
}

/** Re-join at most every few seconds while the panel re-renders each second. */
function useJoinTick(): number {
  return Math.floor(Date.now() / 5000);
}

function KindChip({ node }: { node: ConstructNode }) {
  return (
    <span className="hud-label shrink-0" style={{ color: DOMAINS[node.domain].color }}>
      {KINDS[node.kind].label}
    </span>
  );
}

export default function ConstructAside({ feature }: { feature: LayerFeature }) {
  const x = extraOf(feature);
  if (!x) return null;
  if (x.fabric) return <Stack fabric={x.fabric} />;
  if (x.node) return <One node={x.node} />;
  return null;
}

function Stack({ fabric }: { fabric: Fabric }) {
  const { lon, lat } = fabric.point;
  const api = `/api/fabric?op=stack&lon=${lon.toFixed(3)}&lat=${lat.toFixed(3)}`;
  return (
    <div className="border-t border-border px-3 py-2">
      <div className="hud-label mb-1">The stack, by point of view</div>
      {DOMAIN_ORDER.map((d) => {
        const nodes = fabric.nodes.filter((n) => n.domain === d);
        if (!nodes.length) return null;
        return (
          <div key={d} className="mb-1.5">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: DOMAINS[d].color }}>
              {DOMAINS[d].label} · {DOMAINS[d].question.toLowerCase()}
            </div>
            <ul>
              {nodes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-2 text-left text-[10px] leading-snug hover:text-primary"
                    onClick={() => {
                      const f = constructFeature(n.id);
                      if (f) selectFeature(f);
                    }}
                  >
                    <span className="w-[112px] shrink-0 truncate text-muted-foreground">{KINDS[n.kind].label}</span>
                    <span className="truncate">{n.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {fabric.failed.length > 0 && (
        <div className="mt-1 text-[9px] leading-snug text-warn">
          Did not answer: {fabric.failed.map((f) => f.source).join(", ")}. Their constructs are missing, not absent.
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-3 text-[9px]">
        <button type="button" className="text-primary hover:underline" onClick={() => useGlobe.getState().setWaterReportOpen(true)}>
          Water report here
        </button>
        <button type="button" className="text-primary hover:underline" onClick={() => useGlobe.getState().setMarketReportOpen(true)}>
          Market report here
        </button>
        <a className="text-primary hover:underline" href={api} target="_blank" rel="noreferrer">
          JSON
        </a>
        <a className="text-primary hover:underline" href={`${api}&format=csv`} target="_blank" rel="noreferrer">
          CSV
        </a>
      </div>
      <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
        Every construct here contains this point. Select one to join it to whatever is loaded on the globe inside it.
      </div>
    </div>
  );
}

function One({ node }: { node: ConstructNode }) {
  const here = constructFeature("here");
  const fabric = here ? extraOf(here)?.fabric : undefined;
  const tick = useJoinTick();
  const joined = useMemo(
    () => (node.rings ? joinInside(node.rings, loadedFeatures()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [node.id, tick],
  );
  const byId = new Map((fabric?.nodes ?? []).map((n) => [n.id, n]));
  const edges = (fabric?.edges ?? []).filter((e) => e.from === node.id || e.to === node.id);
  const rel = (from: boolean, relation: string) =>
    from ? { "nests-in": "inside", "drains-to": "drains to", "assigned-to": "assigned to" }[relation] : { "nests-in": "contains", "drains-to": "receives from", "assigned-to": "answers for" }[relation];

  return (
    <>
      {(edges.length > 0 || node.links.some((l) => l.url.startsWith("/"))) && (
        <div className="border-t border-border px-3 py-2">
          <div className="hud-label mb-1">Relations</div>
          <ul className="space-y-0.5">
            {edges.map((e) => {
              const from = e.from === node.id;
              const otherId = from ? e.to : e.from;
              const other = byId.get(otherId);
              return (
                <li key={`${e.from}|${e.relation}|${e.to}`} className="flex items-baseline gap-2 text-[10px] leading-snug">
                  <span className="w-[82px] shrink-0 text-muted-foreground">{rel(from, e.relation)}</span>
                  {other ? (
                    <button
                      type="button"
                      className="truncate text-left hover:text-primary"
                      title={e.basis}
                      onClick={() => {
                        const f = constructFeature(other.id);
                        if (f) selectFeature(f);
                      }}
                    >
                      <KindChip node={other} /> {other.name}
                    </button>
                  ) : (
                    <span className="truncate" title={e.basis}>
                      {otherId}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {node.links
            .filter((l) => l.url.startsWith("/"))
            .map((l) => (
              <a key={l.url} href={l.url} className="mt-1 block text-[10px] text-primary hover:underline">
                {l.label} →
              </a>
            ))}
        </div>
      )}
      <div className="border-t border-border px-3 py-2">
        <div className="hud-label mb-1">Inside, joined by location</div>
        {!joined && (
          <div className="text-[10px] leading-snug text-muted-foreground">
            No outline is published for this construct at this point, so nothing can be placed inside it.
          </div>
        )}
        {joined && joined.size === 0 && (
          <div className="text-[10px] leading-snug text-muted-foreground">
            Nothing loaded on the globe falls inside it. Switch on more layers (gauges, wells, companies, banks, harbours) to join them.
          </div>
        )}
        {joined && joined.size > 0 && (
          <ul className="space-y-1">
            {[...joined.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([layer, list]) => {
                const def = LAYER_BY_ID[layer];
                return (
                  <li key={layer} className="text-[10px] leading-snug">
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ color: def?.color }}>{def?.label ?? layer}</span>
                      <span className="tabular-nums text-muted-foreground">{list.length.toLocaleString("en-US")}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-2">
                      {list.slice(0, 4).map((f) => (
                        <button key={f.properties.id} type="button" className="truncate text-left text-foreground/80 hover:text-primary" onClick={() => selectFeature(f, true)}>
                          {f.properties.name}
                        </button>
                      ))}
                      {list.length > 4 && <span className="text-muted-foreground">+{list.length - 4}</span>}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
        <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
          Point-in-outline over what is loaded now, at last-known positions; outlines are generalised, so features within about 200 m of an edge can land on either side.
        </div>
      </div>
    </>
  );
}

/** For any other selected feature: the loaded constructs whose outlines contain it. */
export function ConstructContext({ feature }: { feature: LayerFeature }) {
  const on = useGlobe((s) => s.layers.constructs);
  const tick = useJoinTick();
  const inside = useMemo(() => {
    const p = pointOf(feature);
    const r = getRenderer("constructs");
    if (!p || !r || !on) return [];
    const out: LayerFeature[] = [];
    for (const f of r.features()) {
      const rings = extraOf(f)?.node?.rings;
      if (rings && ringsContain(rings, p[0], p[1])) out.push(f);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.properties.layer, feature.properties.id, on, tick]);
  if (!inside.length) return null;
  return (
    <div className="border-t border-border px-3 py-2">
      <div className="hud-label mb-1">Inside these constructs</div>
      <ul className="space-y-0.5">
        {inside.map((f) => {
          const n = extraOf(f)!.node!;
          return (
            <li key={n.id}>
              <button type="button" className="flex w-full items-baseline gap-2 text-left text-[10px] leading-snug hover:text-primary" onClick={() => selectFeature(f)}>
                <span className="w-[112px] shrink-0 truncate" style={{ color: DOMAINS[n.domain].color }}>
                  {KINDS[n.kind].label}
                </span>
                <span className="truncate">{n.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
