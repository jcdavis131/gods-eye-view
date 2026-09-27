import { describe, expect, it } from "vitest";
import { parseLatLon, parseShape, parseShare, shapeParam, shareQuery, type ShareState } from "./share";
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

describe("space weather and drawn shapes in the share link", () => {
  const area: ShareState["shape"] = { kind: "area", points: [[-98.5, 29.4], [-98.49, 29.4], [-98.49, 29.41]] };

  it("round-trips the panel and a shape, the shape readable while t and pin stay encoded", () => {
    const s: ShareState = { lat: 29.4, lon: -98.5, t: Date.UTC(2026, 8, 2, 18, 0, 0), pin: { lat: 27.8, lon: -97.396 }, space: true, shape: area };
    const q = shareQuery(s);
    expect(q).toContain("&space=1");
    expect(q.endsWith("&shape=a:-98.50000,29.40000;-98.49000,29.40000;-98.49000,29.41000")).toBe(true);
    expect(q).toContain("t=2026-09-02T18%3A00%3A00Z");
    expect(q).toContain("pin=27.8000%2C-97.3960");
    expect(parseShare(q)).toEqual(s);
  });

  it("writes only a shape that measures something", () => {
    expect(shareQuery({ shape: { kind: "area", points: [[0, 0], [1, 1]] } })).toBe("");
    expect(shareQuery({ shape: { kind: "line", points: [[0, 0], [1, 1]] } })).toBe("?shape=l:0.00000,0.00000;1.00000,1.00000");
  });

  it("drops a malformed shape rather than guessing a vertex", () => {
    expect(parseShape("a:1,2;3,4")).toBeUndefined();
    expect(parseShape("l:1,2")).toBeUndefined();
    expect(parseShape("x:1,2;3,4")).toBeUndefined();
    expect(parseShape("l:1,2;3,")).toBeUndefined();
    expect(parseShape("l:1,2;,4")).toBeUndefined();
    expect(parseShape("l:1,2;3,4,5")).toBeUndefined();
    expect(parseShape("l:1,2;181,4")).toBeUndefined();
    expect(parseShape("l:1,2;3,91")).toBeUndefined();
    expect(parseShape(null)).toBeUndefined();
    expect(parseShape("l:1.5,2;-3,4")).toEqual({ kind: "line", points: [[1.5, 2], [-3, 4]] });
    // A browser that re-escapes the link still reads it.
    expect(parseShare("?shape=l%3A1%2C2%3B3%2C4").shape).toEqual({ kind: "line", points: [[1, 2], [3, 4]] });
  });

  it("keeps at most 60 vertices", () => {
    const many = Array.from({ length: 75 }, (_, i) => `${i / 10},${i / 20}`).join(";");
    expect(parseShape(`l:${many}`)?.points).toHaveLength(60);
    const q = shareQuery({ shape: { kind: "line", points: Array.from({ length: 75 }, (_, i): [number, number] => [i / 10, 0]) } });
    expect(shapeParam(parseShare(q).shape!).split(";")).toHaveLength(60);
  });
});

describe("a zoning answer in the share link", () => {
  it("round-trips the point at five decimals, apart from every other parameter", () => {
    const s: ShareState = { lat: 47.6067, lon: -122.3325, h: 3000, layers: ["zoning"], zoning: { lat: 47.6067, lon: -122.3325 } };
    const q = shareQuery(s);
    expect(q).toContain("zoning=47.60670%2C-122.33250");
    expect(q).not.toMatch(/[?&]sel=/);
    expect(parseShare(q)).toEqual(s);
  });
  it("rejects a malformed point rather than guessing", () => {
    expect(parseShare("?zoning=47.6").zoning).toBeUndefined();
    expect(parseShare("?zoning=-122.33,47.60").zoning).toBeUndefined();
  });
  it("keeps its point apart from the parcel, ground and what's-here points in one link", () => {
    const s: ShareState = {
      layers: ["parcels", "zoning", "soils"],
      zoning: { lat: 29.4241, lon: -98.4936 },
      parcel: { lat: 29.426, lon: -98.4861 },
      ground: { lat: 29.28, lon: -98.45 },
      here: { lat: 29.4, lon: -98.5 },
    };
    expect(parseShare(shareQuery(s))).toEqual(s);
  });
});

describe("an identified parcel in the share link", () => {
  it("travels as its point with 5 decimals, not as a selection id no feed holds", () => {
    const q = shareQuery({ layers: ["parcels"], parcel: { lat: 29.426, lon: -98.4861 }, sel: { layer: "parcels", id: "parcel:tx-stratmap:101328" } });
    expect(q).toContain("parcel=29.42600%2C-98.48610");
    expect(q).not.toContain("sel=");
    expect(parseShare(q)).toEqual({ layers: ["parcels"], parcel: { lat: 29.426, lon: -98.4861 } });
  });

  it("does not collide with the other point parameters, and drops an impossible point", () => {
    const back = parseShare("?pin=30.2672,-97.7431&cmp=29.4241,-98.4936&parcel=29.42600,-98.48610");
    expect(back.pin).toEqual({ lat: 30.2672, lon: -97.7431 });
    expect(back.cmp).toEqual({ lat: 29.4241, lon: -98.4936 });
    expect(back.parcel).toEqual({ lat: 29.426, lon: -98.4861 });
    expect(parseShare("?parcel=95,10").parcel).toBeUndefined();
    expect(parseShare("?parcel=SMITH").parcel).toBeUndefined();
  });

  it("keeps another layer's selection beside it", () => {
    const q = shareQuery({ parcel: { lat: 1, lon: 2 }, sel: { layer: "water", id: "usgs:1" } });
    expect(q).toContain("sel=water%3Ausgs%3A1");
  });
});

describe("terrain, the sea level scenario and ground answers in the share link", () => {
  it("round-trips a ground point, the terrain exaggeration and the scenario", () => {
    const s: ShareState = { layers: ["soils", "sealevel"], ground: { lat: 29.28, lon: -98.45 }, terrain: 1.5, slr: 3 };
    const q = shareQuery(s);
    expect(q).toContain("ground=29.28000%2C-98.45000");
    expect(q).toContain("terrain=1.5");
    expect(q).toContain("slr=3");
    expect(parseShare(q)).toEqual(s);
  });

  it("drops an exaggeration outside 1-3 and a scenario NOAA does not cache", () => {
    expect(parseShare("?terrain=0.5").terrain).toBeUndefined();
    expect(parseShare("?terrain=9").terrain).toBeUndefined();
    expect(parseShare("?terrain=").terrain).toBeUndefined();
    expect(parseShare("?terrain=2").terrain).toBe(2);
    expect(parseShare("?slr=2.5").slr).toBeUndefined();
    expect(parseShare("?slr=11").slr).toBeUndefined();
    expect(parseShare("?slr=").slr).toBeUndefined();
    expect(parseShare("?ground=91,0").ground).toBeUndefined();
  });

  it("does not reuse the parcels or zoning branches' parameter names", () => {
    const q = shareQuery({ ground: { lat: 1, lon: 2 }, terrain: 1, slr: 1 });
    for (const taken of ["parcel=", "zoning=", "pin=", "cmp=", "sel="]) expect(q).not.toContain(taken);
  });
});

describe("the Area panel and what's here in the share link", () => {
  const area = { kind: "area" as const, points: [[-98.5, 29.4], [-98.49, 29.4], [-98.49, 29.41]] as Array<[number, number]> };
  it("round-trips aoi=1 with its drawn area and a what's-here point", () => {
    const s: ShareState = { shape: area, aoi: true, here: { lat: 29.4241, lon: -98.4936 } };
    const q = shareQuery(s);
    expect(q).toContain("aoi=1");
    expect(q).toContain("here=29.42410%2C-98.49360");
    // The shape still goes last, unescaped.
    expect(q.endsWith("shape=a:-98.50000,29.40000;-98.49000,29.40000;-98.49000,29.41000")).toBe(true);
    expect(parseShare(q)).toEqual(s);
  });
  it("writes aoi only with a drawn area to show", () => {
    expect(shareQuery({ aoi: true })).not.toContain("aoi");
    expect(shareQuery({ aoi: true, shape: { kind: "line", points: [[0, 0], [1, 1]] } })).not.toContain("aoi");
    expect(parseShare("?here=91,0").here).toBeUndefined();
  });
});

describe("a link minted before the parcels and infrastructure branches", () => {
  // Written by origin/master's shareQuery (5976456): parameters are keyed by name
  // and layers by id, so new branches only add names. This exact string must
  // keep decoding to the same state and re-encode byte for byte.
  const minted =
    "?lat=29.2812&lon=-98.3412&h=60000&hd=45&p=-55&layers=water%2Csoils%2Csealevel&t=2026-09-02T18%3A00%3A00Z" +
    "&sel=water%3Ausgs%3AUSGS-08180800&report=1&v=2026-08-15&pin=27.8000%2C-97.3960&space=1" +
    "&ground=29.28000%2C-98.45000&terrain=1.5&slr=3&shape=a:-98.50000,29.40000;-98.49000,29.40000;-98.49000,29.41000";
  const state: ShareState = {
    lat: 29.2812,
    lon: -98.3412,
    h: 60000,
    hd: 45,
    p: -55,
    layers: ["water", "soils", "sealevel"],
    t: Date.UTC(2026, 8, 2, 18, 0, 0),
    sel: { layer: "water", id: "usgs:USGS-08180800" },
    report: true,
    vintage: "2026-08-15",
    pin: { lat: 27.8, lon: -97.396 },
    space: true,
    ground: { lat: 29.28, lon: -98.45 },
    terrain: 1.5,
    slr: 3,
    shape: { kind: "area", points: [[-98.5, 29.4], [-98.49, 29.4], [-98.49, 29.41]] },
  };

  it("decodes exactly as before, with no parcel, area-panel or what's-here state", () => {
    expect(parseShare(minted)).toEqual(state);
  });

  it("re-encodes to the same string", () => {
    expect(shareQuery(state)).toBe(minted);
  });
});
