// The catalogue as JSON: every curated collection eye draws or reads, with
// what a record is, its sources (expanded from the SOURCES registry: name,
// publisher, url, licence), coverage, freshness and where it was read, what is
// left out and why, caveats, and the ops that serve it. Static (bundled with
// the app; no upstream call), CORS open, an hour at the edge.
//
//   /api/catalog                  every collection, plus the layers not yet catalogued
//   /api/catalog?id=nrhp-listed   one collection (404 with the list of ids when unknown)
//   /api/catalog?layer=crithab    a layer's collections
//
// The same entries are listed for people at /catalog.

import type { NextRequest } from "next/server";
import { badRequest, notFound, ok, options } from "@/lib/server/respond";
import { COLLECTIONS, catalogued, collection, collectionsForLayer, type Collection } from "@/lib/catalog/collections";
import { LAYER_IDS, type LayerId } from "@/lib/layers/types";
import { source } from "@/lib/provenance/sources";

export const OPTIONS = options;

/** A collection with its sources expanded from the registry; `round` is internal curation bookkeeping and is not published. */
function view(c: Collection) {
  const out: Omit<Collection, "sources" | "round"> & { round?: Collection["round"]; sources: ReturnType<typeof source>[]; globe: string } = { ...c, sources: c.sources.map((id) => source(id)), globe: `/?layers=${c.layer}` };
  delete out.round;
  return out;
}

const CAVEATS = [
  "The catalogue describes each collection as it was read on the dates given (freshness.recordedOn, coverage.count.countedOn); it is not a live status.",
  "Layers listed in `uncatalogued` are drawn by eye but have no catalogue entry yet; their sources are in the About panel's Signal sources.",
];

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  const layer = q.get("layer");
  const uncatalogued = LAYER_IDS.filter((l) => !catalogued().includes(l));
  if (id != null) {
    const c = collection(id);
    if (!c) return notFound(`no collection "${id}"`, { ids: COLLECTIONS.map((x) => x.id) });
    return ok({ collection: view(c) }, { ttlS: 3600, caveats: CAVEATS });
  }
  if (layer != null) {
    if (!(LAYER_IDS as string[]).includes(layer)) return badRequest(`unknown layer "${layer}"`, { layers: catalogued() });
    return ok({ layer, collections: collectionsForLayer(layer as LayerId).map(view) }, { ttlS: 3600, caveats: CAVEATS });
  }
  return ok({ collections: COLLECTIONS.map(view), catalogued: catalogued(), uncatalogued }, { ttlS: 3600, caveats: CAVEATS });
}
