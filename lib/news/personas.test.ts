import { describe, expect, it } from "vitest";
import { DISCLOSURE, PERSONA_IDS, PERSONAS, RUNNING_BITS } from "./personas";
import { checkLine } from "./rundown";

// Names, show titles and taglines of the network that inspired the brief
// (pnn.watch, read 2026-10-07), so nothing here collides with them.
const NOT_OURS = ["pixel", "pnn", "lenny", "dana", "chet", "sam", "jax", "dale", "nina", "gary", "jess", "marty", "tyler", "rex", "sterling", "bobbie", "hammer", "morning rush", "opening bell", "stonks", "after dark", "late edition", "rarely right", "questionable anchors"];

describe("PERSONAS", () => {
  it("has three anchors, one per role, keyed by their own ids", () => {
    expect(Object.keys(PERSONAS).sort()).toEqual([...PERSONA_IDS].sort());
    for (const [k, p] of Object.entries(PERSONAS)) expect(p.id).toBe(k);
    expect(Object.values(PERSONAS).map((p) => p.role).sort()).toEqual(["desk", "field", "lead"]);
  });
  it("relates each anchor to both others", () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p.relationships.map((r) => r.with).sort()).toEqual(PERSONA_IDS.filter((x) => x !== p.id).sort());
    }
  });
  it("keeps Kokoro voices as unconfirmed candidates until they are chosen by ear", () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p.voice.engine).toBe("kokoro");
      expect(p.voice.confirmed).toBe(false);
      expect(p.voice.candidates.length).toBeGreaterThan(0);
    }
  });
  it("borrows no name, title or tagline from the network that inspired the brief", () => {
    const text = JSON.stringify({ PERSONAS, RUNNING_BITS }).toLowerCase();
    for (const w of NOT_OURS) expect(text, w).not.toMatch(new RegExp(`\\b${w}\\b`));
  });
});

describe("catchphrases and running bits", () => {
  it("carry no number and no proper noun but the anchors' own names and the segment titles", () => {
    for (const p of Object.values(PERSONAS)) for (const c of p.catchphrases) expect(checkLine(c, []), c).toEqual([]);
    for (const b of RUNNING_BITS) {
      expect(b.lines.length).toBeGreaterThanOrEqual(2);
      for (const l of b.lines) {
        expect(PERSONAS[l.anchor]).toBeDefined();
        expect(checkLine(l.text, []), l.text).toEqual([]);
      }
    }
  });
});

describe("DISCLOSURE", () => {
  it("says the anchors are fictional, who wrote the script, and to check the sources", () => {
    expect(DISCLOSURE.fictional).toMatch(/fictional/);
    expect(DISCLOSURE.writer["qwen3:8b"]).toMatch(/local AI/);
    expect(DISCLOSURE.writer.template).toMatch(/templates/);
    expect(DISCLOSURE.check).toMatch(/original sources/);
  });
});
