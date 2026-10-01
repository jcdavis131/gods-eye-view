// RSU event calendar API.
//
//   GET /api/rsu?op=events[&ticker=META][&from=2026-01-01][&to=2026-12-31][&type=vest]
//   GET /api/rsu?op=blackout
//
// Serves the point-in-time event calendar built by scripts/rsu-events.py
// from real parsed Form 4 filings. Empty until filings are parsed - no
// synthetic events, ever.
//
// NOTE: Phase 2 (branch scout/rsu-extraction, unmerged) has a fuller route
// with POST /api/rsu/extract. When that lands, reconcile the two routes.

import { NextResponse } from "next/server";
import { allRsuEvents, rsuEventProvenance, rsuEventsFiltered } from "@/lib/rsu/events";

export const maxDuration = 30;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const CAVEATS = [
  "knowable_date (filing date) is when each event became public - use it, not event_date, for any analysis.",
  "Events with knowable_estimated=true use event_date + 2 business days (Form 4 due window); pass exact filing dates to the builder for precision.",
  "Projected vest dates (event_type=projected_vest) are inferred, not reported - never mix them with actuals.",
  "The calendar is empty until real Form 4 filings are parsed. Nothing here is a trading signal.",
];

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const op = url.searchParams.get("op") || "events";
  try {
    if (op === "events") {
      const data = rsuEventsFiltered({
        ticker: url.searchParams.get("ticker") || undefined,
        from: url.searchParams.get("from") || undefined,
        to: url.searchParams.get("to") || undefined,
        type: url.searchParams.get("type") || undefined,
      });
      return json({
        data,
        provenance: [rsuEventProvenance()],
        generatedAt: new Date().toISOString(),
        caveats: CAVEATS,
        meta: { op, count: data.length, total: allRsuEvents().length },
      });
    }
    if (op === "blackout") {
      return json({
        data: {
          status: "not_publicly_disclosed",
          note: "Exact blackout/trading-window dates are internal company policy and are not in SEC filings. They are recorded as unknown, never inferred.",
        },
        provenance: [rsuEventProvenance()],
        generatedAt: new Date().toISOString(),
        caveats: CAVEATS,
        meta: { op },
      });
    }
    return json({ error: "unknown op. Use ?op=events or ?op=blackout" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
}
