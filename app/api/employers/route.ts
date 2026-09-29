// Employers API: ranked US employers by headcount at their HQ city.
//
//   /api/employers?op=top&limit=100      top employers by headcount
//   /api/employers?op=zip&zip=72712      employers with HQ in a ZIP
//   /api/employers?op=metro&q=New York   employers with HQ in a metro
//   /api/employers?op=search&q=walmart   name search
//
// Every JSON response is an Enveloped<T>: { data, provenance[], generatedAt,
// caveats?, ...meta }. Headcounts are organization-wide as reported by each
// source (Forbes, DBpedia, Wikidata), not US-only or establishment-level.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  allEmployers,
  employerProvenance,
  employersInMetro,
  employersInZip,
  placedEmployers,
  searchEmployers,
  topEmployers,
  type EmployerRecord,
} from "@/lib/companies/employers";

export const maxDuration = 30;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const CAVEATS = [
  "Headcounts are organization-wide totals as reported by Forbes, Wikipedia infoboxes (via DBpedia), or Wikidata — not US-only employment.",
  "HQ city is geocoded to a ZIP via OpenStreetMap Nominatim (city center); it is not the exact street address.",
  "Coverage is ~1,364 employers with verified headcounts, not a census of all US employers.",
];

interface Enveloped<T> {
  data: T;
  provenance: ReturnType<typeof employerProvenance>[];
  generatedAt: string;
  caveats: string[];
  meta: Record<string, unknown>;
}

function enveloped<T>(data: T, meta: Record<string, unknown>): Enveloped<T> {
  return {
    data,
    provenance: [employerProvenance()],
    generatedAt: new Date().toISOString(),
    caveats: CAVEATS,
    meta,
  };
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const op = (sp.get("op") || "top").toLowerCase();

  try {
    switch (op) {
      case "top": {
        const limit = Math.max(1, Math.min(parseInt(sp.get("limit") || "100", 10) || 100, 2000));
        const data = topEmployers(limit);
        return json(enveloped(data, { op, limit, count: data.length, total: allEmployers().length }));
      }
      case "zip": {
        const zip = (sp.get("zip") || "").trim().slice(0, 5);
        if (!/^\d{5}$/.test(zip)) {
          return json({ error: "zip must be a 5-digit ZIP code" }, 400);
        }
        const data = employersInZip(zip);
        return json(enveloped(data, { op, zip, count: data.length }));
      }
      case "metro": {
        const q = (sp.get("q") || sp.get("metro") || "").trim();
        if (!q) return json({ error: "q (metro name) is required" }, 400);
        const data = employersInMetro(q);
        return json(enveloped(data, { op, q, count: data.length }));
      }
      case "search": {
        const q = (sp.get("q") || "").trim();
        if (!q) return json({ error: "q is required" }, 400);
        const limit = Math.max(1, Math.min(parseInt(sp.get("limit") || "50", 10) || 50, 200));
        const data = searchEmployers(q, limit);
        return json(enveloped(data, { op, q, limit, count: data.length }));
      }
      case "placed": {
        // employers with map coordinates (for the Atlas layer)
        const data = placedEmployers();
        return json(
          enveloped(
            data.map((e: EmployerRecord) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [e.lon, e.lat] },
              properties: {
                rank: e.rank,
                name: e.name,
                employees: e.employees,
                city: e.city,
                state: e.hq_state || e.state,
                zip: e.zip,
                metro: e.metro,
                ticker: e.ticker ?? null,
                source: e.source,
              },
            })),
            { op, count: data.length }
          )
        );
      }
      default:
        return json({ error: `unknown op: ${op}. Use top, zip, metro, search, or placed.` }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
}
