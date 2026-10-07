import { describe, expect, it } from "vitest";
import { fixtureFacts, CAPTURED_AT, CAPTURED_MS } from "./fixtureFacts";
import { checkLine, checkRundown, numberSupported, properWords, RundownSchema, selectRundown, type Rundown } from "./rundown";
import { templateRundown } from "./template";

const facts = fixtureFacts();
const template = templateRundown(facts, CAPTURED_AT);
const quake = facts.find((f) => f.id === "quake:aka2026tuxgky")!;

/** A model-written rundown as N2 would publish it: same shape, its own words. */
function modelRundown(over: Partial<Rundown> = {}): Rundown {
  return {
    generatedAt: new Date(CAPTURED_MS - 20 * 60_000).toISOString(),
    writer: "qwen3:8b",
    expires: new Date(CAPTURED_MS + 40 * 60_000).toISOString(),
    segments: [
      {
        id: "top",
        title: "Top of the Half Hour",
        anchor: "plume",
        lines: [
          { anchor: "plume", text: "Good to have you with us at the Atlas desk.", factIds: [] },
          { anchor: "plume", text: "The strongest quake in the USGS feed is a magnitude 5.5, about 92 km NNW of Aleneva, Alaska.", factIds: [quake.id] },
        ],
        facts: [quake.id],
        location: null,
      },
      { id: "sign-off", title: "Sign-off", anchor: "plume", lines: [{ anchor: "plume", text: "Odessa Plume, signing off. Steady as a reed.", factIds: [] }], facts: [], location: null },
    ],
    ...over,
  };
}

describe("selectRundown", () => {
  it("uses a fresh, valid model rundown whose facts all exist, and rebuilds its source cards and locations from the current facts", () => {
    const pub = modelRundown();
    pub.segments[0].location = { name: "Somewhere invented", lat: 1, lon: 2 };
    const s = selectRundown(pub, facts, CAPTURED_MS, template);
    expect(s.rejected).toEqual([]);
    expect(s.chosen).toBe("qwen3:8b");
    expect(s.rundown.segments[0].location).toEqual(quake.place);
    expect(s.rundown.segments[0].facts).toEqual([quake.id]);
  });
  it("falls back to the template with the reason when nothing is published", () => {
    const s = selectRundown(null, facts, CAPTURED_MS, template, "NEWS_RUNDOWN_URL is not set");
    expect(s.chosen).toBe("template");
    expect(s.rejected).toEqual(["NEWS_RUNDOWN_URL is not set"]);
    expect(s.rundown.writer).toBe("template");
    expect(s.rundown.segments.find((x) => x.id === "planet-watch")!.location).not.toBeNull();
  });
  it.each([
    ["stale (three hours old)", modelRundown({ generatedAt: new Date(CAPTURED_MS - 3 * 3600_000).toISOString() }), /stale/],
    ["generated in the future", modelRundown({ generatedAt: new Date(CAPTURED_MS + 3600_000).toISOString() }), /future/],
    ["past its own expiry", modelRundown({ expires: new Date(CAPTURED_MS - 60_000).toISOString() }), /expired/],
    ["schema-invalid", { ...modelRundown(), segments: "none" }, /schema/],
    ["an unknown anchor", { ...modelRundown(), segments: [{ ...modelRundown().segments[0], anchor: "someone" }] }, /schema/],
    ["a segment the wheel does not have", { ...modelRundown(), segments: [{ ...modelRundown().segments[0], id: "sports" }] }, /schema/],
    ["a template file passed off as published", modelRundown({ writer: "template" }), /writer template/],
  ])("rejects a rundown that is %s", (_what, pub, why) => {
    const s = selectRundown(pub, facts, CAPTURED_MS, template);
    expect(s.chosen).toBe("template");
    expect(s.rejected.join(" | ")).toMatch(why);
  });
  it("rejects a fact id that is not in the current facts", () => {
    const pub = modelRundown();
    pub.segments[0].lines[1].factIds = ["quake:not-a-real-event"];
    expect(selectRundown(pub, facts, CAPTURED_MS, template).rejected).toEqual(["fact quake:not-a-real-event is not in the current facts"]);
  });
  it("rejects a number the cited fact does not carry", () => {
    const pub = modelRundown();
    pub.segments[0].lines[1].text = "The strongest quake is a magnitude 6.5 near Aleneva, Alaska.";
    expect(selectRundown(pub, facts, CAPTURED_MS, template).rejected).toEqual(["top line 2: number 6.5 is not in the cited facts"]);
  });
  it("rejects a place the cited fact does not name", () => {
    const pub = modelRundown();
    pub.segments[0].lines[1].text = "A magnitude 5.5 quake shook Anchorage.";
    expect(selectRundown(pub, facts, CAPTURED_MS, template).rejected).toEqual(['top line 2: "Anchorage" is not in the cited facts']);
  });
  it("rejects banter that slips in a fact", () => {
    const pub = modelRundown();
    pub.segments[1].lines[0].text = "Odessa Plume, signing off. Stay safe out there in Tokyo, where it is 21 degrees.";
    const rej = selectRundown(pub, facts, CAPTURED_MS, template).rejected;
    expect(rej).toContain('sign-off line 1: "Tokyo" in a line that cites no facts');
    expect(rej).toContain("sign-off line 1: number 21 in a line that cites no facts");
  });
  it("accepts the template's own rundown under the same check", () => {
    const c = checkRundown(template, facts, CAPTURED_MS);
    expect(c.problems).toEqual([]);
    expect(c.ok).toBe(true);
  });
});

describe("the claim check", () => {
  it("matches numbers as written or rounded to the precision written", () => {
    expect(numberSupported("172,904", [172904])).toBe(true);
    expect(numberSupported("5.67", [5.667])).toBe(true);
    expect(numberSupported("5.7", [5.667])).toBe(true);
    expect(numberSupported("6", [5.667])).toBe(true);
    expect(numberSupported("5.6", [5.667])).toBe(false);
    expect(numberSupported("2.2", [-2.2])).toBe(true);
  });
  it("takes the UTC parts of a fact's time as its numbers", () => {
    expect(checkLine("At 18:34 UTC on 6 October 2026.", [quake])).toEqual([]);
    expect(checkLine("At 19:34 UTC.", [quake])).toEqual(["number 19 is not in the cited facts"]);
  });
  it("skips capitals that start a sentence or a quotation", () => {
    expect(properWords('Hello there. The Wire: "Tear gas in Paris" says Mott.')).toEqual(["Wire", "Paris", "Mott."]);
    expect(checkLine("Yemen’s airport, says Mott.", [])).toEqual([]);
  });
  it("lets agency names in through the cited fact's source", () => {
    expect(checkLine("Per the U.S. Geological Survey, magnitude 5.5.", [quake])).toEqual([]);
  });
  it("RundownSchema caps line length", () => {
    const pub = modelRundown();
    pub.segments[0].lines[0].text = "x".repeat(601);
    expect(RundownSchema.safeParse(pub).success).toBe(false);
  });
});
