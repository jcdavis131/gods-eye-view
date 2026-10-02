// Imports a vector-places model bundle (bundles/places-v0.1.1 and later) into
// lib/insights/data/<bundle>/, where the /insights pages read it at render
// time with no network. The bundle is copied byte for byte, and only after
// every hash in it has been checked:
//
//   node scripts/places-model-import.mjs --bundle ../vector-places/bundles/places-v0.1.1           a pinned release
//   node scripts/places-model-import.mjs --bundle <dir> --pin <sha256>  a new release: pin its manifest.json
//   node scripts/places-model-import.mjs --bundle <dir> --check        verify only, write nothing
//   node scripts/places-model-import.mjs --bundle <dir> --out <dir>    copy somewhere else (tests)
//   node scripts/places-model-import.mjs --bundle <dir> --lock <file>  a different lock (tests)
//
// Paths. --bundle is read relative to the working directory, like any input
// path. The lock and the output are never cwd-relative: by default they are
// lib/insights/data/bundles.lock.json and lib/insights/data/<bundle> under
// the repo this script lives in (found from import.meta.url), and a relative
// --lock or --out is resolved against that same repo root. Run from any
// directory, the importer checks a bundle against the committed lock. (It
// used to resolve the lock against the cwd: run from elsewhere it found no
// lock, so a bundle edited and re-hashed throughout passed every check.)
//
// What is verified, and why each check exists:
//
//   1. The manifest itself, against lib/insights/data/bundles.lock.json. A
//      manifest cannot carry its own hash (its _doc says so), so without an
//      anchor on this side a changed byte in manifest.json - in a source's
//      sha256, say, or in the files table after the files were edited - would
//      pass every other check. So a manifest whose sha256 the lock does not
//      hold is refused. A new release is pinned on import with
//      --pin <sha256>, the hash of the manifest.json the producer committed
//      (git -C ../vector-places show <commit>:bundles/<name>/manifest.json |
//      sha256sum); the import goes ahead only if the bundle's manifest has
//      that hash, and then writes it to the lock. A release name is
//      immutable: once pinned, every later import of that name must match,
//      byte for byte, and a re-export that changes anything is a new release
//      (v0.2), not a quiet overwrite.
//   2. manifest.files: the sha256 and size of every other file, and that the
//      bundle holds exactly those files (a stray or a missing file refuses).
//   3. Every sha256 the manifest carries (files, inputs, sources, code) is 64
//      lowercase hex. inputs and code describe the producing repo and are
//      checked there by its own acceptance suite; this side checks what it
//      can reach: that the evidence's registered numbers cite the inputs'
//      hashes, below.
//   4. The evidence agrees with the manifest: each evidence source entry is
//      identical to the manifest's, and every provenance tuple
//      (series_id|year|period|value|footnote|url|sha256|last_modified) names
//      a source by its url with that sha256 and Last-Modified, and resolves
//      to the same value and footnote in the evidence's cells table. So every
//      number the pages print traces to a hashed upstream file.
//   5. The chart sidecar's upstream URLs are manifest sources, and the
//      "sha256 ...", "Last-Modified ..." and "N bytes" notes on each record
//      are that source's hash, Last-Modified and size.
//
// Any failure exits 1 and writes nothing. Node built-ins only, no network.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo this script belongs to, from its own location: never the working directory. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Where the committed bundles live, relative to the repo root. */
export const DATA_DIR = "lib/insights/data";
/** The manifest hash of every imported release, relative to the repo root. */
export const LOCK_FILE = `${DATA_DIR}/bundles.lock.json`;

const HEX64 = /^[0-9a-f]{64}$/;
const BUNDLE_NAME = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const TUPLE_FIELDS = ["series_id", "year", "period", "value", "footnote", "url", "sha256", "last_modified"];

export class BundleError extends Error {
  constructor(message) {
    super(message);
    this.name = "BundleError";
  }
}

function fail(message) {
  throw new BundleError(message);
}

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** JSON with keys sorted at every level: two entries are the same entry when these strings are equal. */
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}

const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Every regular file under `dir`, as a posix path relative to it, in byte order. */
export function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
      else fail(`${r}: not a regular file or directory`);
    }
  };
  walk("");
  return out.sort(byteOrder);
}

/** The bundle as relative path -> bytes. */
export function readBundle(dir) {
  return new Map(listFiles(dir).map((rel) => [rel, fs.readFileSync(path.join(dir, rel))]));
}

function parseJson(rel, buf) {
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    fail(`${rel} is not valid JSON (${e.message})`);
  }
}

function checkHex(where, h) {
  if (typeof h !== "string" || !HEX64.test(h)) fail(`${where}: sha256 ${JSON.stringify(h)} is not 64 lowercase hex characters`);
}

/**
 * Check one bundle. `files` is relative path -> bytes, `name` the release
 * name (the directory name), `lock` the parsed lock file or null, and
 * `opts.pin` the manifest sha256 the operator expects for a release the lock
 * does not hold yet. Returns the parsed manifest, its own hash and size,
 * whether the lock already pinned it, and counts of what was checked; throws
 * BundleError naming the first thing that does not hold.
 */
export function verifyBundle(name, files, lock, opts = {}) {
  if (!BUNDLE_NAME.test(name)) fail(`bundle name ${JSON.stringify(name)} is not a release name like places-v0.1.1`);
  const manifestBuf = files.get("manifest.json");
  if (!manifestBuf) fail("manifest.json is missing");
  const manifestSha256 = sha256(manifestBuf);
  const manifestBytes = manifestBuf.length;

  // 1. The manifest against the lock (or the operator's pin), on its raw bytes, before anything in it is believed.
  const pinned = lock?.bundles?.[name];
  if (opts.pin != null) checkHex("--pin", opts.pin);
  if (pinned) {
    if (pinned.manifest_sha256 !== manifestSha256 || pinned.manifest_bytes !== manifestBytes) {
      fail(
        `manifest.json is sha256 ${manifestSha256} (${manifestBytes} bytes), but the lock pins ${name} at ${pinned.manifest_sha256} (${pinned.manifest_bytes} bytes); a release is immutable, so a changed export needs a new release name`,
      );
    }
    if (opts.pin != null && opts.pin !== manifestSha256) fail(`--pin ${opts.pin} is not the pinned manifest.json sha256 ${manifestSha256} of ${name}`);
  } else if (opts.pin == null) {
    fail(
      `manifest.json is sha256 ${manifestSha256} (${manifestBytes} bytes), which the lock does not pin for ${name}; check it against the manifest.json the producer committed and import with --pin <that sha256>`,
    );
  } else if (opts.pin !== manifestSha256) {
    fail(`manifest.json is sha256 ${manifestSha256} (${manifestBytes} bytes), not the --pin ${opts.pin}`);
  }
  const manifest = parseJson("manifest.json", manifestBuf);
  if (manifest.bundle !== name) fail(`manifest.json names bundle ${JSON.stringify(manifest.bundle)}, but the directory is ${name}`);

  // 3. Every hash the manifest carries is well formed.
  const declared = manifest.files ?? fail("manifest.json has no files table");
  for (const [rel, e] of Object.entries(declared)) checkHex(`manifest files[${rel}]`, e?.sha256);
  for (const [rel, e] of Object.entries(manifest.inputs ?? {})) checkHex(`manifest inputs[${rel}]`, e?.sha256);
  for (const [rel, e] of Object.entries(manifest.sources ?? {})) checkHex(`manifest sources[${rel}]`, e?.sha256);
  for (const [rel, h] of Object.entries(manifest.code?.files ?? {})) checkHex(`manifest code.files[${rel}]`, h);

  // 2. Exactly the declared files, each with its declared hash and size.
  const present = [...files.keys()].filter((r) => r !== "manifest.json").sort(byteOrder);
  const listed = Object.keys(declared).sort(byteOrder);
  const extra = present.filter((r) => !Object.hasOwn(declared, r));
  const missing = listed.filter((r) => !files.has(r));
  if (extra.length) fail(`not in manifest.json files: ${extra.join(", ")}`);
  if (missing.length) fail(`listed in manifest.json files but missing: ${missing.join(", ")}`);
  for (const rel of listed) {
    const buf = files.get(rel);
    const want = declared[rel];
    const got = sha256(buf);
    if (got !== want.sha256) fail(`${rel}: sha256 ${got}, manifest says ${want.sha256}`);
    if (buf.length !== want.bytes) fail(`${rel}: ${buf.length} bytes, manifest says ${want.bytes}`);
  }

  const docs = new Map(listed.filter((r) => r.endsWith(".json")).map((r) => [r, parseJson(r, files.get(r))]));
  const sources = manifest.sources ?? {};
  const sourceByUrl = new Map();
  for (const [key, s] of Object.entries(sources)) {
    if (sourceByUrl.has(s.url)) fail(`manifest sources ${sourceByUrl.get(s.url).key} and ${key} share the url ${s.url}`);
    sourceByUrl.set(s.url, { key, ...s });
  }

  let tuples = 0;
  let registered = 0;
  const findings = Object.entries(manifest.findings ?? {});
  if (findings.length === 0) fail("manifest.json lists no findings");
  for (const [id, f] of findings) {
    for (const part of ["chart", "evidence"]) {
      if (!docs.has(f[part])) fail(`finding ${id}: its ${part} ${JSON.stringify(f[part])} is not a JSON file of the bundle`);
    }
    const ev = docs.get(f.evidence);
    if (ev.finding_id !== id) fail(`${f.evidence}: finding_id ${JSON.stringify(ev.finding_id)}, manifest lists it as ${id}`);
    if (ev.release !== manifest.release) fail(`${f.evidence}: release ${JSON.stringify(ev.release)}, manifest says ${manifest.release}`);
    if (ev.rules_version !== manifest.rules_version) fail(`${f.evidence}: rules_version ${ev.rules_version}, manifest says ${manifest.rules_version}`);
    if (ev.panel !== f.panel) fail(`${f.evidence}: panel ${JSON.stringify(ev.panel)}, manifest says ${f.panel}`);
    if (canonicalJson(ev.provenance_fields) !== canonicalJson(TUPLE_FIELDS)) fail(`${f.evidence}: provenance_fields are not ${TUPLE_FIELDS.join("|")}`);

    // 4. Evidence sources are the manifest's, entry for entry.
    for (const [key, s] of Object.entries(ev.sources ?? {})) {
      if (!Object.hasOwn(sources, key)) fail(`${f.evidence}: source ${key} is not in manifest.json sources`);
      if (canonicalJson(s) !== canonicalJson(sources[key])) fail(`${f.evidence}: source ${key} differs from manifest.json's entry`);
    }
    for (const file of Object.keys(ev.cells ?? {})) {
      if (!Object.hasOwn(ev.sources ?? {}, file)) fail(`${f.evidence}: cells read ${file}, which is not one of its sources`);
    }
    // Every tuple names a hashed source and resolves to a published cell.
    for (const [nid, n] of Object.entries(ev.numbers ?? {})) {
      for (const t of n.provenance ?? []) {
        const parts = t.split("|");
        if (parts.length !== TUPLE_FIELDS.length) fail(`${f.evidence}: number ${nid} has a provenance tuple with ${parts.length} fields: ${t}`);
        const [series, year, period, value, footnote, url, hash, lastModified] = parts;
        const src = sourceByUrl.get(url);
        if (!src || !Object.hasOwn(ev.sources ?? {}, src.key)) fail(`${f.evidence}: number ${nid} cites ${url}, which is not a source of the evidence`);
        if (src.sha256 !== hash) fail(`${f.evidence}: number ${nid} cites ${url} at sha256 ${hash}, the manifest has ${src.sha256}`);
        if ((src.last_modified ?? "") !== lastModified) fail(`${f.evidence}: number ${nid} cites ${url} Last-Modified ${lastModified}, the manifest has ${src.last_modified}`);
        const cell = ev.cells?.[src.key]?.[series]?.[`${year}|${period}`];
        if (cell !== `${value}|${footnote}`) fail(`${f.evidence}: number ${nid} cites ${series} ${year} ${period} = ${value}|${footnote}, the cells table has ${JSON.stringify(cell)}`);
        tuples++;
      }
      if (n.kind === "registered") {
        const r = n.registered ?? {};
        const input = manifest.inputs?.[r.file];
        if (!input || input.sha256 !== r.sha256 || input.bytes !== r.bytes) fail(`${f.evidence}: registered number ${nid} cites ${r.file} at ${r.sha256}, which is not manifest.json's input entry`);
        registered++;
      }
    }

    // 5. The sidecar's upstream files are manifest sources with the hashes it notes.
    const chart = docs.get(f.chart);
    for (const [key, p] of Object.entries(chart.provenance ?? {})) {
      if (!p.upstreamUrl) continue;
      const src = sourceByUrl.get(p.upstreamUrl);
      if (!src) fail(`${f.chart}: provenance ${key} reads ${p.upstreamUrl}, which is not in manifest.json sources`);
      for (const note of p.notes ?? []) {
        const m = /^sha256 ([0-9a-f]+)$/.exec(note);
        if (m && m[1] !== src.sha256) fail(`${f.chart}: provenance ${key} notes sha256 ${m[1]}, the manifest has ${src.sha256} for ${p.upstreamUrl}`);
        const lm = /^Last-Modified (.+)$/.exec(note);
        if (lm && lm[1] !== src.last_modified) fail(`${f.chart}: provenance ${key} notes Last-Modified ${lm[1]}, the manifest has ${src.last_modified} for ${p.upstreamUrl}`);
        const b = /^(\d+) bytes$/.exec(note);
        if (b && Number(b[1]) !== src.bytes) fail(`${f.chart}: provenance ${key} notes ${b[1]} bytes, the manifest has ${src.bytes} for ${p.upstreamUrl}`);
      }
    }
  }

  return { manifest, manifestSha256, manifestBytes, pinned: Boolean(pinned), counts: { files: listed.length + 1, sources: Object.keys(sources).length, tuples, registered, findings: findings.length } };
}

function readLock(file) {
  if (!fs.existsSync(file)) return null;
  return parseJson(path.basename(file), fs.readFileSync(file));
}

function writeLock(file, lock, name, v) {
  const next = {
    _doc: "The manifest.json of every imported places bundle, by release name, written by scripts/places-model-import.mjs. A manifest can't carry its own hash, so this pins it: the importer refuses a manifest whose sha256 is not here (a new release is pinned with --pin, the sha256 of the manifest.json the producer committed), a release name is immutable, and a later import or a page load of that name refuses a manifest that differs.",
    bundles: { ...(lock?.bundles ?? {}), [name]: { manifest_bytes: v.manifestBytes, manifest_sha256: v.manifestSha256, release: v.manifest.release } },
  };
  next.bundles = Object.fromEntries(Object.keys(next.bundles).sort(byteOrder).map((k) => [k, next.bundles[k]]));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
}

/** Copy the verified bytes into `out`, removing anything there the bundle does not hold. */
function copyBundle(files, out) {
  fs.mkdirSync(out, { recursive: true });
  const keep = new Set(files.keys());
  if (fs.existsSync(out)) {
    for (const rel of listFiles(out)) if (!keep.has(rel)) fs.rmSync(path.join(out, rel));
  }
  for (const [rel, buf] of files) {
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && fs.readFileSync(dest).equals(buf)) continue;
    fs.writeFileSync(dest, buf);
  }
}

function parseArgs(argv) {
  const opts = { bundle: null, out: null, lock: null, pin: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--bundle") opts.bundle = value();
    else if (a === "--out") opts.out = value();
    else if (a === "--lock") opts.lock = value();
    else if (a === "--pin") opts.pin = value();
    else if (a === "--check") opts.check = true;
    else fail(`unknown argument ${a}; usage: --bundle <dir> [--pin <sha256>] [--out <dir>] [--lock <file>] [--check]`);
  }
  if (!opts.bundle) fail("--bundle <dir> is required");
  return opts;
}

/** A path for the log: relative to the repo when it is inside it, absolute otherwise. */
function shown(p) {
  const rel = path.relative(REPO_ROOT, p);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : p;
}

/**
 * Run the importer. `cwd` resolves --bundle only; the lock and the output
 * resolve against REPO_ROOT, so the committed lock is the anchor wherever
 * this runs from.
 */
export function main(argv, cwd = process.cwd()) {
  const opts = parseArgs(argv);
  const bundleDir = path.resolve(cwd, opts.bundle);
  if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) fail(`${bundleDir} is not a directory`);
  const name = path.basename(bundleDir);
  const lockFile = path.resolve(REPO_ROOT, opts.lock ?? LOCK_FILE);
  const out = path.resolve(REPO_ROOT, opts.out ?? path.join(DATA_DIR, name));
  if (out === bundleDir) fail("--out is the bundle itself");

  const files = readBundle(bundleDir);
  const lock = readLock(lockFile);
  const v = verifyBundle(name, files, lock, { pin: opts.pin });
  const c = v.counts;
  const lines = [
    `verified ${name} (release ${v.manifest.release}, rules_version ${v.manifest.rules_version}, status ${v.manifest.status})`,
    `  manifest.json sha256 ${v.manifestSha256} (${v.manifestBytes} bytes): ${v.pinned ? `matches the lock ${shown(lockFile)}` : "equals --pin; not yet in the lock"}`,
    `  ${c.files} files, ${c.findings} finding(s), ${c.sources} manifest sources, ${c.tuples} provenance tuples resolved to cells, ${c.registered} registered numbers matched to inputs`,
  ];
  if (opts.check) {
    lines.push("  --check: nothing written");
    return lines;
  }
  copyBundle(files, out);
  lines.push(`  copied to ${shown(out)}`);
  if (!v.pinned) {
    writeLock(lockFile, lock, name, v);
    lines.push(`  pinned in ${shown(lockFile)}`);
  }
  return lines;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    for (const l of main(process.argv.slice(2))) console.log(l);
  } catch (e) {
    console.error(`refused: ${e instanceof BundleError ? e.message : (e?.stack ?? e)}`);
    process.exit(1);
  }
}
