import { afterEach, describe, expect, it, vi } from "vitest";
import { factIndex, type Fact } from "./facts";
import { fixtureFacts, CAPTURED_AT } from "./fixtureFacts";
import { checkLine, RundownSchema } from "./rundown";
import { WHEEL } from "./schedule";
import { calendarDate, figure, launchLine, netPhrase, readName, templateRundown, utcClock, utcDay } from "./template";

afterEach(() => vi.restoreAllMocks());

const facts = fixtureFacts();
const idx = factIndex(facts);
const r = templateRundown(facts, CAPTURED_AT);
const allLines = r.segments.flatMap((s) => s.lines.map((l) => ({ seg: s.id, ...l })));
const textOf = (id: string) => allLines.find((l) => l.factIds.includes(id))?.text;

describe("templateRundown", () => {
  it("is a valid rundown with every wheel segment in order", () => {
    expect(RundownSchema.safeParse(r).success).toBe(true);
    expect(r.writer).toBe("template");
    expect(r.segments.map((s) => s.id)).toEqual(WHEEL.map((s) => s.id));
    expect(r.expires).toBe(new Date(Date.parse(CAPTURED_AT) + 30 * 60_000).toISOString());
  });
  it("cites only facts that exist, and every line passes the claim check against the facts it cites", () => {
    for (const l of allLines) {
      for (const id of l.factIds) expect(idx.has(id), id).toBe(true);
      expect(checkLine(l.text, l.factIds.map((id) => idx.get(id)!)), `${l.seg}: ${l.text}`).toEqual([]);
      expect(l.text).not.toMatch(/undefined|NaN|null|\[object/);
    }
  });
  it("puts no fact in a bumper or the sign-off", () => {
    for (const s of r.segments.filter((x) => WHEEL.find((w) => w.id === x.id)!.kind === "bumper")) for (const l of s.lines) expect(l.factIds).toEqual([]);
  });
  it("reports something on every news segment from the captured feeds", () => {
    for (const s of r.segments.filter((x) => WHEEL.find((w) => w.id === x.id)!.kind === "news")) expect(s.lines.some((l) => l.factIds.length > 0), s.id).toBe(true);
  });
  it("reads the clock never: the same facts and time give the same rundown", () => {
    const spy = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("template read the clock");
    });
    expect(templateRundown(facts, CAPTURED_AT)).toEqual(r);
    spy.mockRestore();
  });
  it("says the disclosure in the sign-off", () => {
    const so = r.segments.find((s) => s.id === "sign-off")!;
    expect(so.lines.map((l) => l.text).join(" ")).toMatch(/cartoon characters.*templates.*original sources/);
  });
});

describe("sentences", () => {
  it("quake: magnitude, place, UTC time and depth as USGS published them", () => {
    expect(textOf("quake:aka2026tuxgky")).toBe("USGS reports a magnitude 5.5 earthquake 92 km NNW of Aleneva, Alaska, at 18:34 UTC on 6 October, 87.6 kilometres deep. USGS rates its PAGER impact alert green.");
  });
  it("alert count", () => {
    expect(textOf("alerts:count")).toBe("The National Weather Service has 7 alerts rated Severe or Extreme in force. The commonest is the Flood Warning, with 4.");
  });
  it("wildfire: name read in title case, acres, basis, containment, credit", () => {
    const f = facts.find((x) => x.kind === "wildfire" && x.headline_fields.name === "LITTLE GIANT")!;
    expect(textOf(f.id)).toMatch(/^The Little Giant fire in .+ covers 172,904 acres by its mapped perimeter and is 93 percent contained.*, according to NIFC\.$/);
  });
  it("launch: provider, payload, vehicle, pad and NET to Launch Library's precision", () => {
    expect(textOf("launch:e0741415-6c63-4236-9736-24a6c04485bc")).toBe(
      "Korea Aerospace Research Institute is scheduled to launch NeonSat-2 to 6 on a KSLV-2 Nuri from Naro Space Center, South Korea, no earlier than 03:25 UTC on 7 October. Launch Library lists its status as Go for Launch.",
    );
    const base = facts.find((f) => f.kind === "launch")!;
    const at = (p: string): Fact => ({ ...base, headline_fields: { ...base.headline_fields, netPrecision: p } });
    expect(netPhrase(at("Hour"))).toBe("no earlier than 03:25 UTC on 7 October, to within the hour");
    expect(netPhrase(at("Day"))).toBe("no earlier than 7 October, to within the day");
    expect(netPhrase(at("Month"))).toBe("no earlier than sometime in October");
    const flown: Fact = { ...base, headline_fields: { ...base.headline_fields, status: "Launch Successful" } };
    expect(launchLine(flown)).toBe("Korea Aerospace Research Institute launched NeonSat-2 to 6 on a KSLV-2 Nuri from Naro Space Center, South Korea, at 03:25 UTC on 7 October. Launch Library lists its status as Launch Successful.");
    expect(checkLine(launchLine(flown), [flown])).toEqual([]);
    const deployed: Fact = { ...base, headline_fields: { ...base.headline_fields, status: "Payload Deployed" } };
    expect(launchLine(deployed, Date.parse("2026-10-07T04:30:00Z"))).toMatch(/^Korea Aerospace Research Institute launched NeonSat-2 to 6 .* Launch Library lists its status as Payload Deployed\.$/);
    const late = launchLine(base, Date.parse("2026-10-07T04:30:00Z"));
    expect(late).toBe("Launch Library last listed Korea Aerospace Research Institute's launch of NeonSat-2 to 6 on a KSLV-2 Nuri from Naro Space Center, South Korea for no earlier than 03:25 UTC on 7 October, with its status as Go for Launch; it has not posted an outcome yet.");
    expect(checkLine(late, [base])).toEqual([]);
  });
  it("flares, Kp, FRED and the release calendar", () => {
    expect(allLines.find((l) => l.text.includes("M1.8"))!.text).toBe("NASA's DONKI database logged an M1.8 solar flare that peaked at 08:05 UTC on 6 October, from active region 14549.");
    expect(textOf("fred:UNRATE:2026-09-01")).toBe("FRED's latest reading for the unemployment rate is 4.2 percent, in the observation dated 1 September 2026, up from 4.1 percent on 1 August 2026.");
    const kp = allLines.find((l) => l.text.startsWith("GFZ Potsdam's latest planetary Kp index is"))!;
    expect(kp.text).toMatch(/is \d+(\.\d{1,2})?, a (preliminary|definitive) value\./);
    for (const l of allLines.filter((x) => x.text.startsWith("On the release calendar"))) {
      const f = idx.get(l.factIds[0])!;
      if (f.headline_fields.precision === "approximate" && f.headline_fields.earliest !== f.headline_fields.latest) expect(l.text).toMatch(/expected between .+ and .+, our estimate/);
    }
  });
  it("weather: the model's numbers at the story's place, called a model estimate", () => {
    const w = allLines.find((l) => l.text.includes("Open-Meteo"))!;
    expect(w.text).toBe("At the quake's location, Open-Meteo's weather model has minus 2.2 degrees Celsius, humidity 88 percent, wind 0.7 metres per second. That is a model estimate, not a station reading.");
  });
  it("wire: the outlet's title verbatim, in quotes, with the outlet", () => {
    for (const l of allLines.filter((x) => x.seg === "the-wire" && x.factIds.length)) {
      const f = idx.get(l.factIds[0])!;
      expect(l.text).toBe(`From ${f.headline_fields.outlet}: "${f.headline_fields.title}"`);
    }
    const wire = allLines.filter((x) => x.seg === "the-wire" && x.factIds.length);
    expect(wire.length).toBe(10);
    const per = new Map<string, number>();
    for (const l of wire) per.set(idx.get(l.factIds[0])!.headline_fields.outlet, (per.get(idx.get(l.factIds[0])!.headline_fields.outlet) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(2);
  });
});

describe("empty and failed feeds", () => {
  it("plays a card that says nothing is in force, or that the feeds did not answer", () => {
    const none = templateRundown([], CAPTURED_AT);
    for (const s of none.segments.filter((x) => WHEEL.find((w) => w.id === x.id)!.kind === "news")) {
      expect(s.lines.some((l) => /nothing to report this half hour/.test(l.text)), s.id).toBe(true);
      for (const l of s.lines) expect(checkLine(l.text, []), l.text).toEqual([]);
    }
    const down = templateRundown([], CAPTURED_AT, ["launch-library-2"]);
    expect(down.segments.find((s) => s.id === "liftoff")!.lines.some((l) => /standing by/.test(l.text))).toBe(true);
  });
});

describe("formatters", () => {
  it("read times in UTC and dates as day month", () => {
    expect(utcClock("2026-10-07T03:05:00Z")).toBe("03:05 UTC");
    expect(utcDay("2026-10-07T23:59:00-04:00")).toBe("8 October");
    expect(calendarDate("2026-09-01")).toBe("1 September 2026");
  });
  it("figure drops trailing zeros and groups thousands", () => {
    expect(figure(172904, 0)).toBe("172,904");
    expect(figure(5.667, 2)).toBe("5.67");
    expect(figure(5, 2)).toBe("5");
    expect(figure(4.1)).toBe("4.1");
  });
  it("reads ALL-CAPS names in title case and leaves mixed case alone", () => {
    expect(readName("0445 CROSSWHITE")).toBe("0445 Crosswhite");
    expect(readName("Kaiser Canyon")).toBe("Kaiser Canyon");
  });
});
