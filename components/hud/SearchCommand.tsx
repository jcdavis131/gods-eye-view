"use client";
// ⌘K palette: find a flight / ship / satellite / camera by callsign, name or
// id among loaded objects, geocode a place, or run a cockpit command.

import { useEffect, useMemo, useState } from "react";
import { MapPin, Radar, Terminal } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGlobe } from "@/lib/store/globe";
import { allFeatures } from "@/lib/globe/registry";
import { flyTo, flyToSelection, homeView } from "@/lib/globe/camera";
import { goLive } from "@/lib/globe/clock";
import { LAYERS, LAYER_BY_ID } from "@/lib/layers";
import type { LayerFeature } from "@/lib/layers/types";
import { matchScore } from "@/lib/search/allowlist";

export interface GeocodeHit {
  name: string;
  lat: number;
  lon: number;
  type: string;
  bbox?: [number, number, number, number];
}

export async function geocode(q: string, signal?: AbortSignal): Promise<GeocodeHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: GeocodeHit[] };
  return json.data ?? [];
}

function searchFeatures(q: string, limit = 12): LayerFeature[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: Array<[number, LayerFeature]> = [];
  for (const f of allFeatures()) {
    // Names, ids and allowlisted identifier and place fields only (lib/search/allowlist.ts).
    const score = matchScore(f.properties, needle);
    if (score > 0) hits.push([score, f]);
  }
  hits.sort((a, b) => b[0] - a[0] || a[1].properties.name.localeCompare(b[1].properties.name));
  return hits.slice(0, limit).map(([, f]) => f);
}

export default function SearchCommand() {
  const open = useGlobe((s) => s.searchOpen);
  const setOpen = useGlobe((s) => s.setSearchOpen);
  const setLayer = useGlobe((s) => s.setLayer);
  const [q, setQ] = useState("");
  const [placeHits, setPlaceHits] = useState<{ q: string; hits: GeocodeHit[] }>({ q: "", hits: [] });

  const objects = useMemo(() => searchFeatures(q), [q]);
  // Only show geocode results that belong to the current query.
  const places = placeHits.q === q.trim() ? placeHits.hits : [];

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      geocode(term, ctrl.signal)
        .then((hits) => setPlaceHits({ q: term, hits }))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Search</DialogTitle>
        <DialogDescription>Find flights, ships, satellites, cameras and places</DialogDescription>
      </DialogHeader>
      <DialogContent className="hud-panel top-1/4 translate-y-0 overflow-hidden rounded-none! p-0" showCloseButton={false}>
        <Command shouldFilter={false} className="rounded-none! bg-transparent">
      <CommandInput
        placeholder="callsign, MMSI, satellite, city…"
        value={q}
        onValueChange={setQ}
        className="font-mono text-[12px]"
      />
      <CommandList className="max-h-[50vh]">
        <CommandEmpty className="text-[11px] text-muted-foreground">
          {q.length < 2 ? "Type to search loaded objects, places and commands." : "No matches in loaded layers."}
        </CommandEmpty>
        {objects.length > 0 && (
          <CommandGroup heading="Objects">
            {objects.map((f) => {
              const p = f.properties;
              const def = LAYER_BY_ID[p.layer];
              return (
                <CommandItem
                  key={`${p.layer}:${p.id}`}
                  value={`${p.layer}:${p.id}`}
                  onSelect={() => {
                    flyToSelection({ layer: p.layer, id: p.id });
                    close();
                  }}
                  className="font-mono text-[11px]"
                >
                  <Radar className="size-3.5" style={{ color: def?.color }} />
                  <span className="text-foreground">{p.name}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground">
                    {def?.label} {p.kind ? `· ${p.kind}` : ""}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {places.length > 0 && (
          <CommandGroup heading="Places">
            {places.map((h, i) => (
              <CommandItem
                key={`${h.lat},${h.lon},${i}`}
                value={`place:${i}:${h.name}`}
                onSelect={() => {
                  flyTo(h.lon, h.lat, { height: heightForPlace(h) });
                  close();
                }}
                className="font-mono text-[11px]"
              >
                <MapPin className="size-3.5 text-primary" />
                <span className="truncate">{h.name}</span>
                <span className="ml-auto text-[9px] uppercase tracking-widest text-muted-foreground">{h.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Commands">
          {LAYERS.map((l) => (
            <CommandItem
              key={`cmd:${l.id}`}
              value={`cmd:toggle:${l.id} ${l.label}`}
              onSelect={() => {
                setLayer(l.id, !useGlobe.getState().layers[l.id]);
                close();
              }}
              className="font-mono text-[11px]"
            >
              <Terminal className="size-3.5 text-muted-foreground" />
              Toggle {l.label}
            </CommandItem>
          ))}
          <CommandItem value="cmd:live go live now" onSelect={() => (goLive(), close())} className="font-mono text-[11px]">
            <Terminal className="size-3.5 text-muted-foreground" />
            Mission clock: go live
          </CommandItem>
          <CommandItem value="cmd:home view" onSelect={() => (homeView(), close())} className="font-mono text-[11px]">
            <Terminal className="size-3.5 text-muted-foreground" />
            Home view
          </CommandItem>
        </CommandGroup>
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Camera height for a geocoded place based on its bounding box size. */
export function heightForPlace(h: GeocodeHit): number {
  if (!h.bbox) return 60_000;
  const [w, s, e, n] = h.bbox;
  const span = Math.max(Math.abs(e - w), Math.abs(n - s));
  return Math.min(6_000_000, Math.max(6_000, span * 111_000 * 1.6));
}
