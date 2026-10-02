// The bundle importer refuses anything it cannot verify. The source bundle
// here is the committed copy under lib/insights/data/places-v0.1.1, which is
// itself a verbatim bundle (that is what the importer guarantees), so the test
// needs no checkout of vector-places.
//
// Two layers: in memory, a byte flipped in each file in turn must fail
// verifyBundle, and so must a manifest the lock does not pin; on disk, the
// CLI must import a scratch copy, exit 0 and copy the bytes unchanged, then
// exit 1 and write nothing once one byte of that copy is flipped, or once
// one number is edited and the manifest re-hashed to match, run from a
// directory that is not the repo, and run through a junction to the repo.
//
// Every CLI run here passes --check or a scratch --out and --lock: a run with
// the defaults would write into lib/insights/data, which is committed.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { BundleError, LOCK_FILE, REPO_ROOT, isMainModule, readBundle, sha256, verifyBundle } from "./places-model-import.mjs";

const ROOT = path.resolve(__dirname, "..");
const NAME = "places-v0.1.1";
const COMMITTED = path.join(ROOT, "lib/insights/data", NAME);
const SCRIPT = path.join(ROOT, "scripts/places-model-import.mjs");
const LOCK_PATH = path.join(ROOT, LOCK_FILE);
const LOCK = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
/** sha256 of the manifest.json vector-places committed at 9ce8792 (bundles/places-v0.1.1/manifest.json). */
const PRODUCER_SHA = "c837b9945d38bbbc8c58abb142055617f46880a50c4fab633b35356d41d2736e";

const files = readBundle(COMMITTED);

/** The bundle with one byte of one file changed: the middle byte, +1. */
function flipped(rel: string, at?: number): Map<string, Buffer> {
  const out = new Map(files);
  const buf = Buffer.from(files.get(rel)!);
  const i = at ?? Math.floor(buf.length / 2);
  buf[i] = (buf[i] + 1) & 0xff;
  out.set(rel, buf);
  return out;
}

function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BundleError);
    return (e as Error).message;
  }
  throw new Error("expected a refusal");
}

/**
 * Austin's office-industry growth in the evidence moved by 10 points, and the
 * manifest's files entry for the evidence re-hashed to match: every internal
 * check of the bundle agrees with itself, and only the lock can tell.
 */
function tamperedAndRehashed(): Map<string, Buffer> {
  const rel = "evidence/C1-raw.json";
  const ev = files.get(rel)!.toString("utf8");
  const from = '"value": 35.956493921944976';
  expect(ev).toContain(from);
  const edited = Buffer.from(ev.replace(from, '"value": 45.956493921944976'), "utf8");
  const manifest = files.get("manifest.json")!.toString("utf8");
  const oldSha = sha256(files.get(rel)!);
  expect(manifest.split(oldSha)).toHaveLength(2);
  const rehashed = Buffer.from(manifest.replace(oldSha, sha256(edited)), "utf8");
  return new Map(files).set(rel, edited).set("manifest.json", rehashed);
}

function writeBundle(dir: string, bundle: Map<string, Buffer>): void {
  for (const [rel, buf] of bundle) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, buf);
  }
}

describe("verifyBundle", () => {
  it("accepts the committed bundle against the committed lock", () => {
    const v = verifyBundle(NAME, files, LOCK);
    expect(v.pinned).toBe(true);
    expect(v.manifestSha256).toBe(PRODUCER_SHA);
    expect(v.manifest.bundle).toBe(NAME);
    expect(v.counts).toEqual({ files: 4, sources: 318, tuples: 3676, registered: 5, findings: 1 });
    expect([...files.keys()]).toEqual(["charts/C1-raw.sidecar.json", "evidence/C1-raw.json", "manifest.json", "methods.json"]);
  });

  it.each([...files.keys()])("refuses %s with one byte flipped", (rel) => {
    const message = refusal(() => verifyBundle(NAME, flipped(rel), LOCK));
    if (rel === "manifest.json") expect(message).toMatch(/pins places-v0\.1\.1/);
    else expect(message).toMatch(new RegExp(`^${rel.replace(/[.]/g, "\\.")}: sha256 `));
  });

  it("refuses an edited number whose manifest was re-hashed to match, because the lock pins the manifest", () => {
    expect(refusal(() => verifyBundle(NAME, tamperedAndRehashed(), LOCK))).toMatch(/but the lock pins places-v0\.1\.1 at c837b994/);
  });

  it("refuses a manifest the lock does not pin, unless --pin names its sha256", () => {
    expect(refusal(() => verifyBundle(NAME, files, null))).toMatch(/which the lock does not pin for places-v0\.1\.1; .* --pin/);
    expect(refusal(() => verifyBundle(NAME, files, { bundles: {} }))).toMatch(/does not pin/);
    expect(refusal(() => verifyBundle(NAME, files, null, { pin: "0".repeat(64) }))).toMatch(/not the --pin 0{64}/);
    expect(refusal(() => verifyBundle(NAME, files, null, { pin: "C837" }))).toMatch(/--pin: sha256 "C837" is not 64 lowercase hex/);
    const v = verifyBundle(NAME, files, null, { pin: PRODUCER_SHA });
    expect(v.pinned).toBe(false);
    expect(v.manifestSha256).toBe(PRODUCER_SHA);
  });

  it("refuses a --pin that disagrees with the lock's own pin", () => {
    expect(refusal(() => verifyBundle(NAME, files, LOCK, { pin: "1".repeat(64) }))).toMatch(/is not the pinned manifest\.json sha256/);
  });

  it("refuses a stray file and a missing one", () => {
    const stray = new Map(files).set("notes.txt", Buffer.from("hello"));
    expect(refusal(() => verifyBundle(NAME, stray, LOCK))).toMatch(/not in manifest\.json files: notes\.txt/);
    const missing = new Map(files);
    missing.delete("methods.json");
    expect(refusal(() => verifyBundle(NAME, missing, LOCK))).toMatch(/missing: methods\.json/);
  });

  it("refuses a bundle whose directory name is not the manifest's", () => {
    expect(refusal(() => verifyBundle("places-v0.2", files, LOCK))).toMatch(/does not pin for places-v0\.2/);
    expect(refusal(() => verifyBundle("places-v0.2", files, LOCK, { pin: PRODUCER_SHA }))).toMatch(/names bundle "places-v0\.1\.1"/);
  });

  // With the operator's pin on an edited manifest, the internal cross-checks
  // have to catch an edited source hash on their own.
  it("pinned by hand, still refuses a manifest whose source hash disagrees with the evidence", () => {
    const text = files.get("manifest.json")!.toString("utf8");
    const sha = "178d68fc85318bbc22068e15b2d2123dbcb3788d44de125dee90b87993fdfbb3";
    expect(text).toContain(sha);
    const edited = Buffer.from(text.replace(sha, sha.replace(/^1/, "2")), "utf8");
    const bundle = new Map(files).set("manifest.json", edited);
    expect(refusal(() => verifyBundle(NAME, bundle, null, { pin: sha256(edited) }))).toMatch(/source ces_sm\/sm\.data\.54\.TotalNonFarm\.All differs from manifest\.json's entry/);
  });
});

describe("the CLI on a scratch copy", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "gev-places-import-"));
  /** A directory that is not the repo and holds no lib/insights/data: the cwd of the runs that must still find the committed lock. */
  const elsewhere = path.join(tmp, "elsewhere");
  mkdirSync(elsewhere, { recursive: true });
  const lockBefore = readFileSync(LOCK_PATH);
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
    // No run may have touched the committed lock.
    expect(readFileSync(LOCK_PATH).equals(lockBefore)).toBe(true);
  });

  const run = (args: string[], cwd: string = ROOT) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

  it("finds its repo from its own location", () => {
    expect(path.resolve(REPO_ROOT)).toBe(ROOT);
  });

  it("imports an intact copy byte for byte and exits 0", () => {
    const src = path.join(tmp, "ok", NAME);
    cpSync(COMMITTED, src, { recursive: true });
    const out = path.join(tmp, "ok-out");
    const r = run(["--bundle", src, "--out", out]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("matches the lock lib/insights/data/bundles.lock.json");
    for (const [rel, buf] of files) expect(readFileSync(path.join(out, rel)).equals(buf), rel).toBe(true);
  });

  it("verifies when run through a junction (or symlink) to the repo, and refuses a flipped byte there", () => {
    // A link to the repo: node runs the script by its real path, so import.meta.url is not the path typed.
    const link = path.join(tmp, "repo-link");
    symlinkSync(ROOT, link, "junction");
    try {
      const script = path.join(link, "scripts", "places-model-import.mjs");
      expect(existsSync(script)).toBe(true);
      expect(realpathSync.native(script)).not.toBe(script);
      expect(isMainModule(script, pathToFileURL(SCRIPT).href)).toBe(true);
      expect(isMainModule(path.join(link, "scripts", "places-model-import.test.ts"), pathToFileURL(SCRIPT).href)).toBe(false);
      expect(isMainModule(undefined, pathToFileURL(SCRIPT).href)).toBe(false);

      const src = path.join(tmp, "via-link", NAME);
      cpSync(COMMITTED, src, { recursive: true });
      const ok = spawnSync(process.execPath, [script, "--bundle", src, "--check"], { cwd: elsewhere, encoding: "utf8" });
      expect(ok.stderr).toBe("");
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain(`verified ${NAME}`);
      expect(ok.stdout).toContain("matches the lock lib/insights/data/bundles.lock.json");

      const bad = path.join(tmp, "via-link-bad", NAME);
      cpSync(COMMITTED, bad, { recursive: true });
      const file = path.join(bad, "evidence/C1-raw.json");
      const buf = readFileSync(file);
      buf[1000] = (buf[1000] + 1) & 0xff;
      writeFileSync(file, buf);
      const r = spawnSync(process.execPath, [script, "--bundle", bad, "--check"], { cwd: elsewhere, encoding: "utf8" });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/^refused: evidence\/C1-raw\.json: sha256 /);
    } finally {
      // The link alone (rmdir removes a junction, never what it points at).
      rmdirSync(link);
      expect(existsSync(path.join(ROOT, "scripts", "places-model-import.mjs"))).toBe(true);
    }
  });

  it("checks against the committed lock when run from another directory", () => {
    const src = path.join(tmp, "ok-elsewhere", NAME);
    cpSync(COMMITTED, src, { recursive: true });
    const r = run(["--bundle", src, "--check"], elsewhere);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("matches the lock lib/insights/data/bundles.lock.json");
  });

  it.each(["evidence/C1-raw.json", "manifest.json"])("exits non-zero and writes nothing when one byte of %s is flipped", (rel) => {
    const src = path.join(tmp, `bad-${rel.replace(/\W/g, "_")}`, NAME);
    cpSync(COMMITTED, src, { recursive: true });
    const file = path.join(src, rel);
    const buf = readFileSync(file);
    buf[1000] = (buf[1000] + 1) & 0xff;
    writeFileSync(file, buf);
    const out = path.join(tmp, `bad-out-${rel.replace(/\W/g, "_")}`);
    const r = run(["--bundle", src, "--out", out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^refused: /);
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a tampered and re-hashed copy run from another directory, and writes nothing", () => {
    const src = path.join(tmp, "rehashed", NAME);
    writeBundle(src, tamperedAndRehashed());
    const out = path.join(tmp, "rehashed-out");
    for (const args of [["--bundle", src, "--check"], ["--bundle", src, "--out", out]]) {
      const r = run(args, elsewhere);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.stderr).toMatch(/^refused: manifest\.json is sha256 [0-9a-f]{64} \(\d+ bytes\), but the lock pins places-v0\.1\.1 at c837b994/);
    }
    expect(existsSync(out)).toBe(false);
  });

  it("refuses a release the lock does not pin, and pins it with --pin into the given lock only", () => {
    // The same bytes under a new release name: the manifest's bundle field says so, so its sha256 is new.
    const name = "places-v0.1.9";
    const manifest = Buffer.from(files.get("manifest.json")!.toString("utf8").replace(`"bundle": "${NAME}"`, `"bundle": "${name}"`), "utf8");
    expect(manifest.equals(files.get("manifest.json")!)).toBe(false);
    const src = path.join(tmp, "renamed", name);
    writeBundle(src, new Map(files).set("manifest.json", manifest));
    const out = path.join(tmp, "renamed-out");
    const lock = path.join(tmp, "renamed.lock.json");
    writeFileSync(lock, lockBefore);

    const unpinned = run(["--bundle", src, "--out", out, "--lock", lock], elsewhere);
    expect(unpinned.status).toBe(1);
    expect(unpinned.stderr).toMatch(/which the lock does not pin for places-v0\.1\.9/);
    const wrong = run(["--bundle", src, "--out", out, "--lock", lock, "--pin", PRODUCER_SHA], elsewhere);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toMatch(/not the --pin c837b994/);
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(lock).equals(lockBefore)).toBe(true);

    const pinned = run(["--bundle", src, "--out", out, "--lock", lock, "--pin", sha256(manifest)], elsewhere);
    expect(pinned.stderr).toBe("");
    expect(pinned.status).toBe(0);
    expect(pinned.stdout).toContain("equals --pin; not yet in the lock");
    const written = JSON.parse(readFileSync(lock, "utf8"));
    expect(written.bundles[name]).toEqual({ manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), release: "v0.1.1" });
    expect(written.bundles[NAME]).toEqual(LOCK.bundles[NAME]);
  });

  it("never writes into lib/insights/data when checked against any lock but the committed one", () => {
    // A release the committed lock does not hold, pinned by a forged lock outside the repo (or by
    // --pin into a scratch lock): verifying against it is allowed, writing the committed tree is not.
    const name = "places-v0.1.8";
    const target = path.join(ROOT, "lib/insights/data", name);
    expect(existsSync(target)).toBe(false);
    const manifest = Buffer.from(files.get("manifest.json")!.toString("utf8").replace(`"bundle": "${NAME}"`, `"bundle": "${name}"`), "utf8");
    const src = path.join(tmp, "forged", name);
    writeBundle(src, new Map(files).set("manifest.json", manifest));
    const forged = path.join(tmp, "forged.lock.json");
    writeFileSync(forged, JSON.stringify({ bundles: { ...LOCK.bundles, [name]: { manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), release: "v0.1.1" } } }));
    const empty = path.join(tmp, "empty.lock.json");
    writeFileSync(empty, JSON.stringify({ bundles: {} }));
    try {
      const check = run(["--bundle", src, "--lock", forged, "--check"], elsewhere);
      expect(check.stderr).toBe("");
      expect(check.status).toBe(0);
      for (const args of [
        ["--bundle", src, "--lock", forged],
        ["--bundle", src, "--lock", forged, "--out", `lib/insights/data/${name}`],
        // Windows compares paths without case: the same directory spelled in capitals is still the committed tree.
        ...(process.platform === "win32" ? [["--bundle", src, "--lock", forged, "--out", target.toUpperCase()]] : []),
        ["--bundle", src, "--lock", empty, "--pin", sha256(manifest)],
      ]) {
        const r = run(args, elsewhere);
        expect(r.status, args.join(" ")).toBe(1);
        expect(r.stderr).toMatch(/^refused: .* is under lib\/insights\/data, which only an import checked against lib\/insights\/data\/bundles\.lock\.json may write/);
        expect(existsSync(target), args.join(" ")).toBe(false);
      }
      expect(JSON.parse(readFileSync(empty, "utf8"))).toEqual({ bundles: {} });
      // The same import with a scratch --out goes ahead.
      const out = path.join(tmp, "forged-out");
      const ok = run(["--bundle", src, "--lock", forged, "--out", out], elsewhere);
      expect(ok.stderr).toBe("");
      expect(ok.status).toBe(0);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("decides where --out is on real paths: a junction into lib/insights/data is under it, a linked --out or one that holds it is refused", () => {
    // A3's attack: a forged lock pinning an edited manifest, and --out a junction into the committed data directory.
    // Compared on the paths as typed, the junction was "outside", and the import replaced the committed files.
    const name = "places-v0.1.7";
    const DATA = path.join(ROOT, "lib/insights/data");
    const target = path.join(DATA, name);
    expect(existsSync(target)).toBe(false);
    const snapshot = () => [...readBundle(DATA)].map(([rel, buf]) => `${rel} ${sha256(buf)}`);
    const before = snapshot();
    const manifest = Buffer.from(files.get("manifest.json")!.toString("utf8").replace(`"bundle": "${NAME}"`, `"bundle": "${name}"`), "utf8");
    const src = path.join(tmp, "junction-forged", name);
    writeBundle(src, new Map(files).set("manifest.json", manifest));
    const forged = path.join(tmp, "junction-forged.lock.json");
    writeFileSync(forged, JSON.stringify({ bundles: { ...LOCK.bundles, [name]: { manifest_bytes: manifest.length, manifest_sha256: sha256(manifest), release: "v0.1.1" } } }));
    const dataLink = path.join(tmp, "data-link");
    const insightsLink = path.join(tmp, "insights-link");
    const scratch = path.join(tmp, "linked-scratch");
    const outLink = path.join(tmp, "out-link");
    mkdirSync(scratch, { recursive: true });
    symlinkSync(DATA, dataLink, "junction");
    symlinkSync(path.join(ROOT, "lib/insights"), insightsLink, "junction");
    symlinkSync(scratch, outLink, "junction");
    try {
      expect(realpathSync.native(dataLink)).not.toBe(dataLink);
      // Through a junction to the data directory, against a forged lock: under lib/insights/data, refused.
      const under = run(["--bundle", src, "--lock", forged, "--out", path.join(dataLink, name)], elsewhere);
      expect(under.status).toBe(1);
      expect(under.stderr).toMatch(/^refused: .* is under lib\/insights\/data, which only an import checked against lib\/insights\/data\/bundles\.lock\.json may write/);
      // An --out that is lib/insights/data or holds it, spelled directly or through a junction to lib/insights: the
      // copy would remove the lock and every other bundle. Refused against any lock, the committed one included.
      for (const out of [DATA, path.join(ROOT, "lib/insights"), path.join(insightsLink, "data")]) {
        for (const lock of [[], ["--lock", forged]]) {
          const r = run(["--bundle", src, ...lock, "--out", out], elsewhere);
          expect(r.status, `${out} ${lock.join(" ")}`).toBe(1);
          expect(r.stderr).toMatch(/^refused: .* is lib\/insights\/data or holds it; a copy there would remove every file the bundle does not hold/);
        }
      }
      // An --out that is itself a link, even to a scratch directory, and a link into the data directory: refused.
      for (const out of [outLink, dataLink, insightsLink]) {
        const r = run(["--bundle", src, "--lock", forged, "--out", out], elsewhere);
        expect(r.status, out).toBe(1);
        expect(r.stderr).toMatch(/^refused: --out .* is a link \(a symlink or a junction\); name the directory itself/);
      }
      expect(readdirSync(scratch)).toEqual([]);
      // --check through the junction writes nothing and verifies against the lock it is given.
      const check = run(["--bundle", src, "--lock", forged, "--out", path.join(dataLink, name), "--check"], elsewhere);
      expect(check.stderr).toBe("");
      expect(check.status).toBe(0);
      // Nothing under lib/insights/data changed: no new bundle, the lock and the committed bundle byte for byte.
      expect(existsSync(target)).toBe(false);
      expect(snapshot()).toEqual(before);
    } finally {
      // The links alone (rmdir removes a junction, never what it points at), then anything a failed guard wrote.
      for (const l of [dataLink, insightsLink, outLink]) rmdirSync(l);
      rmSync(target, { recursive: true, force: true });
      expect(existsSync(path.join(DATA, "bundles.lock.json"))).toBe(true);
      expect(existsSync(path.join(COMMITTED, "manifest.json"))).toBe(true);
    }
  });
});
