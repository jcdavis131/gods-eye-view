// Permits API: building permits, business licences and environmental permits
// as their public registries publish them, in a box. CORS open, edge-cached,
// with the shared envelope (lib/server/respond.ts). Every answer carries a
// `coverage` list: which sources answered (covered, or partial when a cap was
// hit), which failed this time, and which cities in the box have no usable
// feed and why (stale, no feed, token required, not wired). "Not covered"
// never reads as "zero permits".
//
//   /api/permits?op=building&bbox=w,s,e,n[&days=30]   permits issued in the last `days`
//        (7-90) from Chicago, Austin, Seattle, Denver (residential), New York (DOB NOW),
//        Los Angeles and San Francisco; newest first, 500 per city at most. Box at most
//        0.03 degrees, snapped to 0.0025.
//   /api/permits?op=licences&bbox=w,s,e,n             licensed premises from the New York
//        State Liquor Authority, Chicago business licences, San Francisco registered
//        business locations, Los Angeles active businesses and New York City premises
//        licences; by trade name (not a non-company registrant's own name), home-business
//        heuristic applied. Box at most 0.02 degrees, snapped to 0.0025.
//   /api/permits?op=environmental&bbox=w,s,e,n        EPA ECHO Clean Water Act (NPDES) and
//        Clean Air Act facilities and the Corps of Engineers' regulatory actions. Box at
//        most 0.2 degrees, snapped to 0.05.
//   /api/permits?op=contaminants&bbox=w,s,e,n         EPA Envirofacts EMEF program listings:
//        Superfund (SEMS), Toxics Release Inventory, RCRA hazardous-waste handlers and
//        Brownfields (ACRES), 1,000 per program at most. Same box rules. A listing is a
//        regulatory status, not a finding of contamination; no address is requested.
//   /api/permits?op=tri&trifid=77012HLLPT9701M[&year=2024]   what a TRI facility reported
//        releasing on site that year (Form R), by chemical and medium, in its reported
//        units, with totals per medium and unit, and its Form A certifications. Fields are
//        kept by allowlist: the certifying official and every contact field never leave.
//
// Every portal is asked for named columns, and no applicant, owner, contact or
// filing-representative name is requested. A licence registry's legal or
// registrant name is requested only to test for an entity form and to compare
// it with the trade name, and is discarded otherwise. A contractor name
// (Austin, Seattle, Denver) and a Corps project name are shown in the dossier
// as published and can be a person's; nothing searches them (lib/permits/*.ts).

import type { NextRequest } from "next/server";
import { jsonError, polite, upstreamJson } from "@/lib/server/upstream";
import { badRequest, ok, options, withCors } from "@/lib/server/respond";
import { preferIpv4 } from "@/lib/server/net";
import { numParam, parseBbox, type Bbox } from "@/lib/civic/bbox";
import { CHICAGO_DISCLAIMER } from "@/lib/civic/terms";
import { buildingPermits, contaminants, environmental, licences } from "@/lib/permits/sources";
import { CONTAMINANTS_CAVEAT } from "@/lib/permits/contaminants";
import { HOME_HEURISTIC, permitFeatures, licenceFeatures, envFeatures } from "@/lib/permits/geojson";
import { cached } from "@/lib/server/cache";
import { retrying } from "@/lib/server/net";
import { provenance, type Provenance } from "@/lib/provenance/types";
import { source } from "@/lib/provenance/sources";
import { projectTri, TRI_CAVEAT, TRI_FIRST_YEAR, triDefaultYears, triFormA, triFormAUrl, TRIFID_RE, triReleases, triReleaseUrl, triTotals, type TriRaw } from "@/lib/permits/tri";

export const maxDuration = 60;
export const OPTIONS = options;

preferIpv4();

const BOX = "Only the returned `bbox` was loaded; outside it nothing is loaded, which is not the same as nothing being there.";

async function opBuilding(b: Bbox, days: number) {
  const a = await buildingPermits(b, days);
  const caveats = [
    `Permits the cities list as issued in the last ${days} days, as each publishes them. A permit is permission to build, not a record that work happened; valuations are the applicant's or the city's estimate under the column named with each.`,
    "No applicant, owner or contact name is requested. The contractor Austin, Seattle and Denver print on a permit is shown as published and can be a sole trader's own name; it is never searched.",
    "Where a city is missing from `coverage`, no source for it is wired; where it is listed with a state other than covered or partial, that state says why nothing is drawn.",
    BOX,
  ];
  if (a.coverage.some((c) => c.state === "partial")) caveats.push("A city hit the 500-permit cap: its newest 500 are shown, and there are more; ask for a smaller box or fewer days.");
  if (a.coverage.some((c) => c.state === "error")) caveats.push("A city did not answer this time; its permits are missing from this answer, not absent.");
  if (a.coverage.some((c) => c.id === "chicago" && c.state !== "error")) caveats.push(CHICAGO_DISCLAIMER);
  return ok(permitFeatures(a.records), {
    meta: { source: "city building permit portals", bbox: b, days, coverage: a.coverage, cacheAge: a.age },
    provenance: a.provenance,
    caveats,
    ttlS: a.coverage.some((c) => c.state === "error") ? 120 : 900,
  });
}

async function opLicences(b: Bbox) {
  const a = await licences(b);
  const caveats = [
    "Licensed premises as each registry publishes them, named by the trade name (DBA), or by an entity's legal name where there is no trade name. The legal or registrant name is requested only to test whether it is a company's and whether the trade name is that same name: a trade name that is a non-company registrant's own name is not shown, and a legal name is never shown unless it is a company's. A trade name is otherwise shown as published and can contain a person's name.",
    HOME_HEURISTIC,
    BOX,
  ];
  if (a.coverage.some((c) => c.state === "partial")) caveats.push("A registry returned its 1,000-record cap for this box; ask for a smaller box for every record.");
  if (a.coverage.some((c) => c.state === "error")) caveats.push("A registry did not answer this time; its licences are missing from this answer, not absent.");
  if (a.coverage.some((c) => c.id === "chicago" && c.state !== "error")) caveats.push(CHICAGO_DISCLAIMER);
  return ok(licenceFeatures(a.records), {
    meta: { source: "business licence registries", bbox: b, coverage: a.coverage, withheld: a.withheld, cacheAge: a.age },
    provenance: a.provenance,
    caveats,
    ttlS: a.coverage.some((c) => c.state === "error") ? 120 : 1800,
  });
}

async function opEnvironmental(b: Bbox) {
  const a = await environmental(b);
  const caveats = [
    "Facilities and actions as EPA ECHO and the Corps publish them. Compliance is ECHO's own words; where ECHO gives none it says 'not reported by ECHO', which is not 'no violation'.",
    "The Corps' applicant is never kept. Its project names are shown as published, except one that opens 'Surname, Given' (a private applicant's project), which is withheld; a project name can still carry a person's name in another form. Project names are never searched.",
    "The Corps' search answers at most 300 actions: every one in the box first, then actions from anywhere in the country up to 300. Only those inside the box are kept (sorted newest first here); its `total` is the national count and is not relayed.",
    BOX,
  ];
  if (a.coverage.some((c) => c.state === "partial")) caveats.push("A source's cap was hit for this box; ask for a smaller box for every record.");
  if (a.coverage.some((c) => c.state === "error")) caveats.push("A source did not answer this time; its records are missing from this answer, not absent.");
  return ok(envFeatures(a.records), {
    meta: { source: "EPA ECHO and USACE ORM", bbox: b, coverage: a.coverage, cacheAge: a.age },
    provenance: a.provenance,
    caveats,
    ttlS: a.coverage.some((c) => c.state === "error") ? 120 : 3600,
  });
}

async function opContaminants(b: Bbox) {
  const a = await contaminants(b);
  const caveats = [
    CONTAMINANTS_CAVEAT,
    "Facility names are as EPA publishes them and can be a person's name or a street address; they are shown in the record only and are never searched. No address or contact field is requested.",
    BOX,
  ];
  if (a.coverage.some((c) => c.state === "partial")) caveats.push("A program hit the 1,000-listing cap for this box (RCRA is dense in industrial areas); its first 1,000 are shown and there are more. Ask for a smaller box for every listing.");
  if (a.coverage.some((c) => c.state === "error")) caveats.push("A program did not answer this time; its listings are missing from this answer, not absent.");
  return ok(
    { type: "FeatureCollection", features: a.features },
    {
      meta: { source: "U.S. EPA Envirofacts EMEF (Superfund, TRI, RCRA, Brownfields)", bbox: b, coverage: a.coverage, cacheAge: a.age },
      provenance: a.provenance,
      caveats,
      ttlS: a.coverage.some((c) => c.state === "error") ? 120 : 3600,
    },
  );
}

/** One Envirofacts call, projected to the TRI allowlist before anything else sees it. */
function triFetch(url: string): Promise<TriRaw[]> {
  return retrying(() => polite("epa-envirofacts", 1000, 30_000, async () => projectTri(await upstreamJson<unknown>("epa-tri", url, { timeoutMs: 30_000 }))), 3);
}

/** A facility-year: the Form R release rows and the Form A certifications, held 30 days (a filed year rarely changes). */
function triYear(trifid: string, year: number) {
  return cached(`tri:${trifid}:${year}`, 30 * 24 * 3600_000, async () => {
    const [r, a] = await Promise.all([triFetch(triReleaseUrl(trifid, year)), triFetch(triFormAUrl(trifid, year)).catch(() => null)]);
    return { releases: triReleases(r), formA: a ? triFormA(a) : null };
  });
}

async function opTri(trifid: string, asked: number | null) {
  const years = asked != null ? [asked] : triDefaultYears();
  let year = years[0];
  let r = await triYear(trifid, year);
  if (asked == null && !r.value.releases.length && !r.value.formA?.length) {
    year = years[1];
    r = await triYear(trifid, year);
  }
  const { releases, formA } = r.value;
  const caveats = [TRI_CAVEAT, "The certifying official and every contact field Envirofacts sends are dropped before anything is kept; TRI's own facility coordinates are not used."];
  if (!releases.length && !formA?.length) caveats.push(asked != null ? `TRI holds no Form R or Form A from this facility for ${year}.` : `TRI holds no Form R or Form A from this facility for ${years.join(" or ")}; ask for another year with year=.`);
  if (formA == null) caveats.push("The Form A list did not answer this time (formA: null): certifications without quantities are unknown, not absent.");
  const prov: Provenance[] = [
    provenance(source("epa-tri"), { kind: "published", seriesId: `tri_reporting_form + tri_release_qty + tri_chem_info, facility ${trifid}, reporting year ${year}`, upstreamUrl: triReleaseUrl(trifid, year), retrievedAt: new Date(Date.now() - r.age).toISOString() }),
  ];
  if (formA) prov.push(provenance(source("epa-tri"), { kind: "published", seriesId: `tri_reporting_form (Form A) + tri_chem_info, facility ${trifid}, reporting year ${year}`, upstreamUrl: triFormAUrl(trifid, year), retrievedAt: new Date(Date.now() - r.age).toISOString() }));
  return ok(
    { facility: trifid, year, rows: releases, totals: triTotals(releases), formA },
    { meta: { source: source("epa-tri").name, cacheAge: r.age }, provenance: prov, caveats, ttlS: formA ? 86400 : 600 },
  );
}

const BBOX_HELP = "bbox=w,s,e,n required, west < east and south < north, e.g. bbox=-87.635,41.88,-87.625,41.887";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const op = q.get("op") ?? "";
  try {
    switch (op) {
      case "building": {
        const b = parseBbox(q.get("bbox"), 0.03, 0.0025);
        if (!b) return badRequest(BBOX_HELP);
        const d = numParam(q.get("days"));
        if (d != null && (d < 7 || d > 90)) return badRequest("days must be 7 to 90 (default 30)");
        return await opBuilding(b, Math.round(d ?? 30));
      }
      case "licences": {
        const b = parseBbox(q.get("bbox"), 0.02, 0.0025);
        if (!b) return badRequest(BBOX_HELP);
        return await opLicences(b);
      }
      case "environmental": {
        const b = parseBbox(q.get("bbox"), 0.2, 0.05);
        if (!b) return badRequest(BBOX_HELP);
        return await opEnvironmental(b);
      }
      case "contaminants": {
        const b = parseBbox(q.get("bbox"), 0.2, 0.05);
        if (!b) return badRequest(BBOX_HELP);
        return await opContaminants(b);
      }
      case "tri": {
        const trifid = (q.get("trifid") ?? "").trim();
        const y = q.get("year");
        const year = y == null || y.trim() === "" ? null : /^\d{4}$/.test(y.trim()) ? Number(y.trim()) : NaN;
        if (!TRIFID_RE.test(trifid) || (year != null && (!Number.isInteger(year) || year < TRI_FIRST_YEAR || year > new Date().getUTCFullYear()))) {
          return badRequest(`trifid (15 letters and digits, e.g. 77012HLLPT9701M) required; year optional, ${TRI_FIRST_YEAR} to this year`);
        }
        return await opTri(trifid, year);
      }
      default:
        return badRequest("unknown op: building | licences | environmental | contaminants | tri");
    }
  } catch (err) {
    return withCors(jsonError(err));
  }
}
