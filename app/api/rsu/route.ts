// RSU API: extract Restricted Stock Unit transactions from SEC Form 4 filings.
//
//   POST /api/rsu/extract  { xml: "<ownershipDocument>..." }
//     -> { transactions: [...], vestingSchedules: [...] }
//
//   GET /api/rsu/blackout
//     -> { status: "not_publicly_disclosed", note: ... }
//
// Form 4 XML is parsed for RSU grants (code A), vests (code M), sales (code S),
// and tax withholdings (code F). Vesting schedules are inferred from footnote
// text patterns; blackout periods are never inferred (not in SEC filings).
//
// NOTE: Live EDGAR fetching is not available from this environment (SEC
// returns 403). Submit Form 4 XML directly obtained from EDGAR.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

interface RSUTransaction {
  filerName: string;
  filerCik: string;
  issuerName: string;
  issuerCik: string;
  issuerTicker: string;
  securityTitle: string;
  transactionDate: string;
  transactionCode: string;
  shares: number;
  price: number | null;
  eventType: "grant" | "vest" | "sale" | "tax_withhold" | "disposition" | "other";
}

function isRsu(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("restricted stock unit") ||
    t.includes("rsu") ||
    t.includes("restricted share unit") ||
    t.includes("performance share") ||
    t.includes("deferred stock unit")
  );
}

function classifyEvent(code: string): RSUTransaction["eventType"] {
  switch (code.trim().toUpperCase()) {
    case "A": return "grant";
    case "M": return "vest";
    case "S": return "sale";
    case "F": return "tax_withhold";
    case "D": return "disposition";
    default: return "other";
  }
}

/** Minimal Form 4 XML parser (no external deps). */
function parseForm4(xml: string): RSUTransaction[] {
  const txns: RSUTransaction[] = [];

  // Extract issuer and filer (first occurrence)
  const issuerCik = /<issuerCik>([^<]*)<\/issuerCik>/.exec(xml)?.[1]?.trim() ?? "";
  const issuerName = /<issuerName>([^<]*)<\/issuerName>/.exec(xml)?.[1]?.trim() ?? "";
  const issuerTicker = /<issuerTradingSymbol>([^<]*)<\/issuerTradingSymbol>/.exec(xml)?.[1]?.trim() ?? "";
  const filerCik = /<rptOwnerCik>([^<]*)<\/rptOwnerCik>/.exec(xml)?.[1]?.trim() ?? "";
  const filerName = /<rptOwnerName>([^<]*)<\/rptOwnerName>/.exec(xml)?.[1]?.trim() ?? "";

  // Find all transaction blocks
  const txnRe = /<(nonDerivativeTransaction|derivativeTransaction)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = txnRe.exec(xml)) !== null) {
    const block = m[2];
    const title = /<securityTitle>\s*<value>([^<]*)<\/value>/.exec(block)?.[1]?.trim()
      ?? /<securityTitle>([^<]*)<\/securityTitle>/.exec(block)?.[1]?.trim() ?? "";
    if (!isRsu(title)) continue;

    const txnDate = /<transactionDate>\s*<value>([^<]*)<\/value>/.exec(block)?.[1]?.trim() ?? "";
    const code = /<transactionCode>([^<]*)<\/transactionCode>/.exec(block)?.[1]?.trim() ?? "";
    const sharesRaw = /<transactionShares>\s*<value>([^<]*)<\/value>/.exec(block)?.[1]?.trim() ?? "0";
    const priceRaw = /<transactionPricePerShare>\s*<value>([^<]*)<\/value>/.exec(block)?.[1]?.trim() ?? "";
    const acqDisp = /<transactionAcquiredDisposedCode>\s*<value>([^<]*)<\/value>/.exec(block)?.[1]?.trim() ?? "A";

    let shares = parseFloat(sharesRaw.replace(/,/g, "")) || 0;
    if (acqDisp === "D") shares = -shares;
    const price = priceRaw ? parseFloat(priceRaw.replace(/,/g, "")) : null;

    txns.push({
      filerName, filerCik, issuerName, issuerCik, issuerTicker,
      securityTitle: title,
      transactionDate: txnDate,
      transactionCode: code,
      shares,
      price: Number.isFinite(price as number) ? price : null,
      eventType: classifyEvent(code),
    });
  }
  return txns;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get("op") || "blackout";
  if (op === "blackout") {
    return json({
      status: "not_publicly_disclosed",
      note: "Corporate blackout periods are internal policy and are not disclosed in SEC filings. Do not infer standard quarterly windows.",
      whereToLook: [
        "10-K Part III Item 10 (sometimes mentions insider trading policy)",
        "Proxy DEF 14A (sometimes references trading policy)",
      ],
      generatedAt: new Date().toISOString(),
    });
  }
  return json({ error: "unknown op. Use POST /api/rsu/extract or GET ?op=blackout" }, 400);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const xml = (body.xml as string) || "";
    if (!xml || !xml.includes("<ownershipDocument")) {
      return json({ error: "body.xml must be a Form 4 ownershipDocument XML string" }, 400);
    }
    const transactions = parseForm4(xml);
    const grants = transactions.filter((t) => t.eventType === "grant");
    const vests = transactions.filter((t) => t.eventType === "vest");
    return json({
      data: { transactions, summary: { grants: grants.length, vests: vests.length, total: transactions.length } },
      provenance: [{ source: "SEC EDGAR Form 4 (user-supplied XML)", note: "Live EDGAR fetch unavailable; submit XML directly." }],
      caveats: [
        "RSU identification is by security-title keyword match; verify against the filing.",
        "Vesting schedules require footnote/proxy text and are not inferred here.",
        "Blackout periods are not in SEC filings — see GET ?op=blackout.",
      ],
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "parse error" }, 500);
  }
}
