// EPA program listings for the Contaminated sites layer: Superfund (SEMS),
// the Toxics Release Inventory, RCRA hazardous-waste handlers and Brownfields
// (ACRES), from EPA's Envirofacts EMEF `efpoints` map service. Pure: the
// layer table, the request, the row -> feature builder. The fetch lives in
// lib/permits/sources.ts and the route in app/api/permits.
//
// EMEF's water (2) and air (3) layers are not used: the Environmental permits
// layer already draws those facilities from ECHO. Named fields only;
// location_address and every contact field stay at the source. A facility's
// name is EPA's primary_name and can be a person's (a sole proprietor) or a
// street address (a Brownfields property is often named by it): it is shown
// in the dossier and never searched; the feature is named by its program id.

import type { LayerFeature } from "@/lib/layers/types";
import type { Bbox } from "@/lib/zoning/features";

export const EMEF = "https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer";

export type ContaminantProgram = "sems" | "tri" | "rcra" | "acres";

export interface EmefLayer {
  id: ContaminantProgram;
  layer: 0 | 1 | 4 | 5;
  /** EMEF's own layer name. */
  service: string;
  /** Short label used in feature names and coverage. */
  short: string;
  /** What the program is, in EPA's terms. */
  name: string;
}

export const EMEF_LAYERS: EmefLayer[] = [
  { id: "sems", layer: 0, service: "Superfund", short: "SEMS", name: "Superfund (SEMS): sites in EPA's Superfund Enterprise Management System, NPL and non-NPL, active and archived" },
  { id: "tri", layer: 1, service: "Toxic releases", short: "TRI", name: "Toxics Release Inventory reporter" },
  { id: "rcra", layer: 4, service: "Hazardous waste", short: "RCRA", name: "RCRA hazardous waste handler (RCRAInfo)" },
  { id: "acres", layer: 5, service: "Brownfields", short: "Brownfields", name: "Brownfields property (ACRES)" },
];

/** Asked for per layer and box; RCRA alone held 3,001 handlers in a 0.4 by 0.25 degree Houston box. */
export const EMEF_MAX = 1000;

/** The fields the route asks for. location_address is never requested. */
export const EMEF_FIELDS = ["registry_id", "primary_name", "pgm_sys_acrnm", "pgm_sys_id", "facility_url"] as const;

export const CONTAMINANTS_CAVEAT =
  "EPA program listings: Superfund (SEMS, including non-NPL and archived sites), Toxics Release Inventory reporters, RCRA hazardous-waste handlers and Brownfields properties. A listing is a regulatory status, not a finding of contamination at the point; a TRI reporter's record can show what it reported releasing (asked on click, never drawn). Points are EPA's facility coordinates. Water and air permits are in the Environmental permits layer.";

export function emefParams(b: Bbox): Record<string, string> {
  const [w, s, e, n] = b;
  return {
    where: "1=1",
    geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outSR: "4326",
    outFields: EMEF_FIELDS.join(","),
    returnGeometry: "true",
    resultRecordCount: String(EMEF_MAX),
  };
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

export interface ContaminantExtra {
  program: ContaminantProgram;
  registryId?: string;
  programId?: string;
}

/** One EMEF layer's rows as features, once per program listing (registry id + program id). */
export function buildContaminants(
  program: ContaminantProgram,
  rows: Array<{ id?: number | string; geometry: GeoJSON.Geometry | null; properties: Record<string, unknown> | null }>,
): LayerFeature[] {
  const meta = EMEF_LAYERS.find((l) => l.id === program)!;
  const out: LayerFeature[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.geometry || r.geometry.type !== "Point") return;
    const [lon, lat] = r.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const p = r.properties ?? {};
    const registryId = str(p.registry_id);
    const programId = str(p.pgm_sys_id);
    const key = `${registryId ?? ""}|${programId ?? ""}`;
    if (key !== "|" && seen.has(key)) return;
    seen.add(key);
    const url = str(p.facility_url);
    const x: ContaminantExtra = { program, registryId, programId };
    out.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id: `emef:${program}:${programId ?? registryId ?? i}`,
        layer: "contaminants",
        name: `${meta.short} ${programId ?? registryId ?? "listing"}`,
        kind: program,
        source: "EPA Envirofacts (EMEF)",
        details: {
          program: meta.name,
          "facility (as EPA publishes it)": str(p.primary_name),
          "program system id": programId,
          "registry id": registryId,
          "program system (as EPA codes it)": str(p.pgm_sys_acrnm),
          "EPA record": url && /^https:\/\//.test(url) ? url : undefined,
          "what this is": program === "tri" ? "an EPA program listing: a regulatory status, not a finding of contamination at this point; what the facility reported releasing is under Reported releases" : "an EPA program listing: a regulatory status, not a finding of contamination at this point",
        },
        extra: x,
      },
    });
  });
  return out;
}
