// The loader re-checks the committed bundle against the lock and its own
// manifest every time a process first reads it, so a page cannot render a
// file that was edited after the import. The tampering cases run on a copy
// of lib/insights/data under a scratch root.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BundleLoadError, DATA_DIR, LOCK_FILE, loadBundle, readBundle } from "./load";

const ROOT = path.resolve(__dirname, "../..");

describe("loadBundle", () => {
  it("reads places-v0.1.1 with every file matching its manifest", () => {
    const b = loadBundle("places-v0.1.1", ROOT);
    expect(b.manifest.bundle).toBe("places-v0.1.1");
    expect(b.findings.map((f) => f.id)).toEqual(["C1-raw"]);
    for (const [rel, f] of Object.entries(b.manifest.files)) expect(b.hashes[rel]).toBe(f.sha256);
    const lock = JSON.parse(readFileSync(path.join(ROOT, LOCK_FILE), "utf8"));
    expect(b.hashes["manifest.json"]).toBe(lock.bundles["places-v0.1.1"].manifest_sha256);
  });

  it("reads once per process", () => {
    expect(loadBundle("places-v0.1.1", ROOT)).toBe(loadBundle("places-v0.1.1", ROOT));
  });
});

describe("a tampered copy", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "gev-insights-load-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function copyWith(label: string, rel: string | null): string {
    const root = path.join(tmp, label);
    cpSync(path.join(ROOT, DATA_DIR), path.join(root, DATA_DIR), { recursive: true });
    if (rel) {
      const file = path.join(root, DATA_DIR, "places-v0.1.1", rel);
      const buf = readFileSync(file);
      buf[2000] = (buf[2000] + 1) & 0xff;
      writeFileSync(file, buf);
    }
    return root;
  }

  it("loads when nothing changed", () => {
    expect(readBundle("places-v0.1.1", copyWith("intact", null)).findings).toHaveLength(1);
  });

  it.each(["evidence/C1-raw.json", "charts/C1-raw.sidecar.json", "methods.json"])("refuses one changed byte in %s", (rel) => {
    const root = copyWith(rel.replace(/\W/g, "_"), rel);
    let err: unknown;
    try {
      readBundle("places-v0.1.1", root);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BundleLoadError);
    expect((err as Error).message).toMatch(new RegExp(`${rel.replace(/[.]/g, "\\.")} is sha256 [0-9a-f]{64}`));
  });

  it("refuses one changed byte in manifest.json against the lock", () => {
    expect(() => readBundle("places-v0.1.1", copyWith("manifest", "manifest.json"))).toThrow(/but lib\/insights\/data\/bundles\.lock\.json pins/);
  });

  it("refuses a bundle the lock does not pin", () => {
    expect(() => readBundle("places-v9.9", ROOT)).toThrow(/is not pinned/);
  });
});
