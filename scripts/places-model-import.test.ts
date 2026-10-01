// The bundle importer refuses anything it cannot verify. The source bundle
// here is the committed copy under lib/insights/data/places-v0.1, which is
// itself a verbatim bundle (that is what the importer guarantees), so the test
// needs no checkout of vector-places.
//
// Two layers: in memory, a byte flipped in each file in turn must fail
// verifyBundle; on disk, the CLI must import a scratch copy, exit 0 and copy
// the bytes unchanged, then exit 1 and write nothing once one byte of that
// copy is flipped.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BundleError, LOCK_FILE, readBundle, verifyBundle } from "./places-model-import.mjs";

const ROOT = path.resolve(__dirname, "..");
const NAME = "places-v0.1";
const COMMITTED = path.join(ROOT, "lib/insights/data", NAME);
const SCRIPT = path.join(ROOT, "scripts/places-model-import.mjs");
const LOCK = JSON.parse(readFileSync(path.join(ROOT, LOCK_FILE), "utf8"));

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

describe("verifyBundle", () => {
  it("accepts the committed bundle against the committed lock", () => {
    const v = verifyBundle(NAME, files, LOCK);
    expect(v.pinned).toBe(true);
    expect(v.manifest.bundle).toBe(NAME);
    expect(v.counts).toEqual({ files: 4, sources: 318, tuples: 3200, registered: 4, findings: 1 });
    expect([...files.keys()]).toEqual(["charts/C1-raw.sidecar.json", "evidence/C1-raw.json", "manifest.json", "methods.json"]);
  });

  it.each([...files.keys()])("refuses %s with one byte flipped", (rel) => {
    const message = refusal(() => verifyBundle(NAME, flipped(rel), LOCK));
    if (rel === "manifest.json") expect(message).toMatch(/pins places-v0\.1/);
    else expect(message).toMatch(new RegExp(`^${rel.replace(/[.]/g, "\\.")}: sha256 `));
  });

  it("refuses a stray file and a missing one", () => {
    const stray = new Map(files).set("notes.txt", Buffer.from("hello"));
    expect(refusal(() => verifyBundle(NAME, stray, LOCK))).toMatch(/not in manifest\.json files: notes\.txt/);
    const missing = new Map(files);
    missing.delete("methods.json");
    expect(refusal(() => verifyBundle(NAME, missing, LOCK))).toMatch(/missing: methods\.json/);
  });

  it("refuses a bundle whose directory name is not the manifest's", () => {
    expect(refusal(() => verifyBundle("places-v0.2", files, LOCK))).toMatch(/names bundle "places-v0\.1"/);
  });

  // With no lock entry the manifest has no external anchor, so the internal
  // cross-checks have to catch an edited source hash on their own.
  it("without a lock entry, still refuses a manifest whose source hash disagrees with the evidence", () => {
    const text = files.get("manifest.json")!.toString("utf8");
    const sha = "178d68fc85318bbc22068e15b2d2123dbcb3788d44de125dee90b87993fdfbb3";
    expect(text).toContain(sha);
    const edited = new Map(files).set("manifest.json", Buffer.from(text.replace(sha, sha.replace(/^1/, "2")), "utf8"));
    expect(refusal(() => verifyBundle(NAME, edited, null))).toMatch(/source ces_sm\/sm\.data\.54\.TotalNonFarm\.All differs from manifest\.json's entry/);
  });
});

describe("the CLI on a scratch copy", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "gev-places-import-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const run = (bundle: string, out: string) => spawnSync(process.execPath, [SCRIPT, "--bundle", bundle, "--out", out], { cwd: ROOT, encoding: "utf8" });

  it("imports an intact copy byte for byte and exits 0", () => {
    const src = path.join(tmp, "ok", NAME);
    cpSync(COMMITTED, src, { recursive: true });
    const out = path.join(tmp, "ok-out");
    const r = run(src, out);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("matches the lock");
    for (const [rel, buf] of files) expect(readFileSync(path.join(out, rel)).equals(buf), rel).toBe(true);
  });

  it.each(["evidence/C1-raw.json", "manifest.json"])("exits non-zero and writes nothing when one byte of %s is flipped", (rel) => {
    const src = path.join(tmp, `bad-${rel.replace(/\W/g, "_")}`, NAME);
    cpSync(COMMITTED, src, { recursive: true });
    const file = path.join(src, rel);
    const buf = readFileSync(file);
    buf[1000] = (buf[1000] + 1) & 0xff;
    writeFileSync(file, buf);
    const out = path.join(tmp, `bad-out-${rel.replace(/\W/g, "_")}`);
    const r = run(src, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/^refused: /);
    expect(existsSync(out)).toBe(false);
  });
});
