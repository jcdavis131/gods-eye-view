// The committed places bundles, read from disk and checked before use.
//
// scripts/places-model-import.mjs copies a bundle into lib/insights/data/
// only after verifying it; this module re-checks what it reads at load time,
// so a page can never render from a file that was edited after the import:
//   - manifest.json against bundles.lock.json (sha256 and size), and
//   - every file the manifest lists against its sha256 and size.
// A mismatch throws, and the page that asked fails rather than printing a
// number nobody verified.
//
// Files are read with node:fs relative to the project root, like the fonts
// in render/raster.ts, never imported: the evidence file is 2.3 MB and a
// JSON import would make the type checker infer a type for every key in it.
// next.config.ts lists lib/insights/data in outputFileTracingIncludes for
// /insights/** so the deployed functions carry the files. No network, ever.
//
// Node only. A bundle is read once per process per root and cached.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { BundleManifest, Evidence, Methods } from "./types";

/** Where the committed bundles live, relative to the project root. */
export const DATA_DIR = "lib/insights/data";
/** The manifest pin of every imported release (written by the importer). */
export const LOCK_FILE = `${DATA_DIR}/bundles.lock.json`;
/** The bundles the site publishes from. */
export const BUNDLES = ["places-v0.1"] as const;
export type BundleName = (typeof BUNDLES)[number];

export class BundleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleLoadError";
  }
}

export interface LoadedFinding {
  id: string;
  panel: string;
  template: string;
  chartFile: string;
  evidenceFile: string;
  /** The sidecar as parsed JSON; build.ts validates it as a ChartSpec. */
  chart: unknown;
  evidence: Evidence;
}

export interface LoadedBundle {
  name: string;
  manifest: BundleManifest;
  methods: Methods;
  /** sha256 of manifest.json (as pinned) and of every listed file (as the manifest states and this load confirmed). */
  hashes: Record<string, string>;
  findings: LoadedFinding[];
}

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

function readJson<T>(file: string, buf: Buffer): T {
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch (e) {
    throw new BundleLoadError(`${file} is not valid JSON (${(e as Error).message})`);
  }
}

/** Read and check one bundle under `root`. Throws BundleLoadError on any mismatch. */
export function readBundle(name: string, root: string): LoadedBundle {
  const at = (rel: string): string => path.join(root, rel);
  const read = (rel: string): Buffer => {
    try {
      return readFileSync(at(rel));
    } catch {
      throw new BundleLoadError(`${rel} is missing; import the bundle with scripts/places-model-import.mjs`);
    }
  };

  const lock = readJson<{ bundles?: Record<string, { manifest_sha256: string; manifest_bytes: number }> }>(LOCK_FILE, read(LOCK_FILE));
  const pin = lock.bundles?.[name];
  if (!pin) throw new BundleLoadError(`${name} is not pinned in ${LOCK_FILE}`);

  const dir = `${DATA_DIR}/${name}`;
  const manifestBuf = read(`${dir}/manifest.json`);
  const manifestSha = sha256(manifestBuf);
  if (manifestSha !== pin.manifest_sha256 || manifestBuf.length !== pin.manifest_bytes) {
    throw new BundleLoadError(`${dir}/manifest.json is sha256 ${manifestSha} (${manifestBuf.length} bytes), but ${LOCK_FILE} pins ${pin.manifest_sha256} (${pin.manifest_bytes} bytes)`);
  }
  const manifest = readJson<BundleManifest>(`${dir}/manifest.json`, manifestBuf);
  if (manifest.bundle !== name) throw new BundleLoadError(`${dir}/manifest.json names bundle ${JSON.stringify(manifest.bundle)}`);

  const hashes: Record<string, string> = { "manifest.json": manifestSha };
  const docs = new Map<string, unknown>();
  for (const [rel, f] of Object.entries(manifest.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const buf = read(`${dir}/${rel}`);
    const got = sha256(buf);
    if (got !== f.sha256 || buf.length !== f.bytes) {
      throw new BundleLoadError(`${dir}/${rel} is sha256 ${got} (${buf.length} bytes), but its manifest says ${f.sha256} (${f.bytes} bytes)`);
    }
    hashes[rel] = got;
    if (rel.endsWith(".json")) docs.set(rel, readJson(`${dir}/${rel}`, buf));
  }

  const doc = <T>(rel: string): T => {
    if (!docs.has(rel)) throw new BundleLoadError(`${dir}: ${rel} is not a JSON file the manifest lists`);
    return docs.get(rel) as T;
  };
  const findings = Object.entries(manifest.findings)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, f]) => ({ id, panel: f.panel, template: f.template, chartFile: f.chart, evidenceFile: f.evidence, chart: doc<unknown>(f.chart), evidence: doc<Evidence>(f.evidence) }));

  return { name, manifest, methods: doc<Methods>("methods.json"), hashes, findings };
}

const loaded = new Map<string, LoadedBundle>();

/** The bundle, read and checked once per process (per root). */
export function loadBundle(name: string = BUNDLES[0], root: string = process.cwd()): LoadedBundle {
  const key = `${root}\u0000${name}`;
  let b = loaded.get(key);
  if (!b) {
    b = readBundle(name, root);
    loaded.set(key, b);
  }
  return b;
}
