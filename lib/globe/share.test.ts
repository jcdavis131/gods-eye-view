import { describe, expect, it } from "vitest";
import { parseLatLon, parseShare, shareQuery, type ShareState } from "./share";
import { getVintage, isValidVintage, useReleases, vintageClockMs } from "@/lib/releases/store";

describe("parseShare / shareQuery", () => {
  it("round-trips every parameter including the vintage", () => {
    const s: ShareState = {
      lat: 29.2812,
      lon: -98.3412,
      h: 60000,
      hd: 45,
      p: -55,
      layers: ["water", "turbidity"],
      t: Date.UTC(2026, 8, 2, 18, 0, 0),
      sel: { layer: "water", id: "usgs:USGS-08180800" },
      report: true,
      market: true,
      vintage: "2026-08-15",
      embed: true,
    };
    const q = shareQuery(s);
    expect(q).toContain("&v=2026-08-15");
    expect(q).toContain("t=2026-09-02T18%3A00%3A00Z");
    const back = parseShare(q);
    expect(back).toEqual({ ...s, lat: 29.2812, lon: -98.3412 });
  });

  it("drops a malformed or impossible vintage rather than guessing", () => {
    expect(parseShare("?v=2026-02-30").vintage).toBeUndefined();
    expect(parseShare("?v=20260815").vintage).toBeUndefined();
    expect(parseShare("?v=2026-8-15").vintage).toBeUndefined();
    expect(parseShare("?v=").vintage).toBeUndefined();
    expect(parseShare("?v=2024-02-29").vintage).toBe("2024-02-29");
    expect(shareQuery({ vintage: "nope" })).toBe("");
    expect(shareQuery({ vintage: "2026-08-15" })).toBe("?v=2026-08-15");
  });

  it("leaves the other parameters alone", () => {
    const back = parseShare("lat=91&lon=0&h=50&hd=725&p=5&layers=water,nope&t=garbage&sel=nope:1&report=1");
    expect(back).toEqual({ hd: 5, layers: ["water"], report: true });
    expect(shareQuery({})).toBe("");
  });
});

describe("releases store", () => {
  it("validates vintages and exposes a module-level read", () => {
    expect(isValidVintage("2026-08-15")).toBe(true);
    expect(isValidVintage("2026-13-01")).toBe(false);
    expect(isValidVintage("2026-04-31")).toBe(false);
    useReleases.getState().setVintage("2026-08-15");
    expect(getVintage()).toBe("2026-08-15");
    useReleases.getState().setVintage("not a date");
    expect(getVintage()).toBeNull();
    expect(new Date(vintageClockMs("2026-08-15")).toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });
});

describe("pin and compare in the share link", () => {
  it("round-trips the pinned stack and the second place", () => {
    const s: ShareState = { lat: 27.8, lon: -97.396, layers: ["constructs"], sel: { layer: "constructs", id: "county:48355" }, pin: { lat: 27.8, lon: -97.396 }, cmp: { lat: 27.877, lon: -97.323 } };
    const q = shareQuery(s);
    expect(q).toContain("pin=27.8000%2C-97.3960");
    expect(q).toContain("cmp=27.8770%2C-97.3230");
    expect(parseShare(q)).toEqual(s);
  });
  it("reads plain commas and rejects malformed or out-of-range points", () => {
    expect(parseShare("?cmp=27.88,-97.32").cmp).toEqual({ lat: 27.88, lon: -97.32 });
    expect(parseLatLon(" 1.5 , -2 ")).toEqual({ lat: 1.5, lon: -2 });
    expect(parseShare("?cmp=97.32,27.88").cmp).toBeUndefined();
    expect(parseShare("?pin=27.8").pin).toBeUndefined();
    expect(parseShare("?pin=abc,def").pin).toBeUndefined();
    expect(parseLatLon("27.8,-190")).toBeUndefined();
  });
  it("writes nothing for a stack that follows the view", () => {
    expect(shareQuery({ lat: 1, lon: 2 })).not.toMatch(/pin=|cmp=/);
  });
});
