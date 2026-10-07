import { describe, expect, it } from "vitest";
import { blinkClosed, gazeFor, OPENNESS, SEATS, visemeAt, visemeForChar, VISEMES } from "./anchorMotion";
import { PERSONA_IDS } from "./personas";

describe("visemes", () => {
  it("has at least six mouth shapes besides rest, each reachable from text", () => {
    const shapes = new Set("mapeoufl k".split("").map(visemeForChar));
    shapes.delete("rest");
    expect(shapes.size).toBeGreaterThanOrEqual(6);
    for (const v of VISEMES) expect(OPENNESS[v]).toBeGreaterThanOrEqual(0);
  });

  it("maps letters to the usual shapes and closes on spaces and punctuation", () => {
    expect(visemeForChar("B")).toBe("MBP");
    expect(visemeForChar("a")).toBe("AI");
    expect(visemeForChar("e")).toBe("E");
    expect(visemeForChar("o")).toBe("O");
    expect(visemeForChar("w")).toBe("U");
    expect(visemeForChar("v")).toBe("FV");
    expect(visemeForChar("t")).toBe("L");
    expect(visemeForChar("k")).toBe("etc");
    expect(visemeForChar("é")).toBe("etc");
    expect(visemeForChar(" ")).toBe("rest");
    expect(visemeForChar(",")).toBe("rest");
  });

  it("shows the more open shape of each step, and rests outside the line", () => {
    const text = "Ears up";
    expect(visemeAt(text, 0)).toBe("AI"); // "Ea"
    expect(visemeAt(text, 3 / 7)).toBe("etc"); // "s "
    expect(visemeAt(text, 5 / 7)).toBe("U"); // "up"
    expect(visemeAt(text, 1)).toBe("rest");
    expect(visemeAt(text, -0.1)).toBe("rest");
    expect(visemeAt("", 0.5)).toBe("rest");
  });

  it("moves the mouth through several shapes over a real line", () => {
    const text = "USGS reports a magnitude 5.9 earthquake 264 km SSW of Severo-Kuril’sk, Russia.";
    const seen = new Set(Array.from({ length: 200 }, (_, i) => visemeAt(text, i / 200)));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

describe("blinks", () => {
  it("blinks briefly, a few times a minute, on each anchor's own rhythm", () => {
    for (const id of PERSONA_IDS) {
      let closed = 0;
      let blinks = 0;
      let prev = false;
      for (let t = 0; t < 60_000; t += 10) {
        const c = blinkClosed(id, 1_700_000_000_000 + t);
        if (c) closed++;
        if (c && !prev) blinks++;
        prev = c;
      }
      expect(blinks, id).toBeGreaterThanOrEqual(10);
      expect(blinks, id).toBeLessThanOrEqual(18);
      expect(closed * 10, id).toBeLessThan(60_000 * 0.06);
    }
  });
  it("is the same for everyone at the same moment", () => {
    for (let t = 0; t < 20_000; t += 37) expect(blinkClosed("plume", t)).toBe(blinkClosed("plume", t));
  });
  it("does not blink all three anchors together", () => {
    let together = 0;
    for (let t = 0; t < 600_000; t += 10) if (PERSONA_IDS.every((id) => blinkClosed(id, t))) together++;
    expect(together).toBeLessThan(10);
  });
});

describe("gaze", () => {
  it("has the speaker look at the camera and the others look at the speaker", () => {
    expect(SEATS).toEqual(["brack", "plume", "ledgerly"]);
    expect(gazeFor("plume", "plume")).toBe(0);
    expect(gazeFor("brack", "plume")).toBe(1);
    expect(gazeFor("ledgerly", "plume")).toBe(-1);
    expect(gazeFor("ledgerly", "brack")).toBe(-1);
    expect(gazeFor("brack", "ledgerly")).toBe(1);
    expect(gazeFor("plume", null)).toBe(0);
  });
});
