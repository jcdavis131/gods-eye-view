import { describe, expect, it } from "vitest";
import type { BaseProps } from "@/lib/layers/types";
import { matchScore, searchableDetail, SEARCHABLE_DETAILS } from "./allowlist";

const props = (p: Partial<BaseProps>): BaseProps => ({ id: "x", layer: "publiclands", name: "Unit", source: "t", ...p });

describe("the search allowlist", () => {
  it("never lists an owner, operator, manager, holder, bank or recipient field", () => {
    for (const k of ["owner", "local owner", "owner type", "operator", "manager", "easement holder", "easement holder type", "bank", "provider", "HQ", "recipient", "issued by"]) {
      expect(searchableDetail(k), k).toBe(false);
    }
    for (const k of SEARCHABLE_DETAILS) expect(k).toBe(k.toLowerCase());
  });

  it("finds a public land by its name but not by the owner or easement holder PAD-US publishes", () => {
    const unit = props({ name: "Palo Alto College", details: { owner: "Alamo Community College District", "easement holder": "Bexar Land Trust", county: "Bexar" } });
    expect(matchScore(unit, "palo alto")).toBe(2);
    expect(matchScore(unit, "alamo community")).toBe(0);
    expect(matchScore(unit, "land trust")).toBe(0);
    // A place field is fine.
    expect(matchScore(unit, "bexar")).toBe(1);
  });

  it("finds an aircraft by registration or callsign, never by its operator", () => {
    const ac = props({ layer: "aircraft", id: "a1b2c3", name: "UAL123", details: { registration: "N12345", operator: "Some Holdings LLC", callsign: "UAL123" } });
    expect(matchScore(ac, "n12345")).toBe(1);
    expect(matchScore(ac, "a1b2")).toBe(2);
    expect(matchScore(ac, "holdings")).toBe(0);
  });

  it("matches published identifiers that come as numbers (FDIC cert, construct code)", () => {
    expect(matchScore(props({ layer: "banks", name: "Branch", details: { "FDIC cert": 3510 } }), "3510")).toBe(1);
    expect(matchScore(props({ layer: "constructs", name: "Bexar County", details: { code: "48029" } }), "48029")).toBe(1);
  });

  it("finds a game by its teams and league (the name is the abbreviated score line)", () => {
    const game = props({ layer: "sports", id: "401", name: "DAL @ NYG", details: { league: "NFL", matchup: "Dallas Cowboys @ New York Giants", venue: "MetLife Stadium, East Rutherford, NJ", broadcast: "FOX" } });
    expect(matchScore(game, "cowboys")).toBe(1);
    expect(matchScore(game, "nfl")).toBe(1);
    expect(matchScore(game, "metlife")).toBe(1);
    expect(matchScore(game, "fox")).toBe(0);
  });

  it("finds a company by sector and SIC, never by its HQ address", () => {
    const co = props({ layer: "companies", id: "320193", name: "Apple Inc.", details: { ticker: "AAPL · Nasdaq", CIK: "320193", sector: "Information Technology · XLK", SIC: "3571 Electronic Computers", HQ: "Cupertino, CA 95014" } });
    expect(matchScore(co, "information technology")).toBe(1);
    expect(matchScore(co, "electronic computers")).toBe(1);
    expect(matchScore(co, "3571")).toBe(1);
    expect(matchScore(co, "cupertino")).toBe(0);
  });

  it("finds a ship by its destination and an aircraft by its origin country, never by operator", () => {
    const ship = props({ layer: "ships", id: "230000000", name: "NORDIC STAR", details: { mmsi: 230000000, destination: "HELSINKI" } });
    expect(matchScore(ship, "helsinki")).toBe(1);
    const plane = props({ layer: "aircraft", id: "abc123", name: "DLH400", details: { "origin country": "Germany", operator: "Deutsche Lufthansa AG" } });
    expect(matchScore(plane, "germany")).toBe(1);
    expect(matchScore(plane, "lufthansa")).toBe(0);
  });

  it("finds a launch by its vehicle and pad, never by its provider", () => {
    const launch = props({ layer: "launches", id: "l1", name: "Starlink Group 10-1", details: { vehicle: "Falcon 9 Block 5", pad: "SLC-40", provider: "SpaceX" } });
    expect(matchScore(launch, "falcon 9")).toBe(1);
    expect(matchScore(launch, "spacex")).toBe(0);
  });

  it("scores exact over prefix over contained, and never matches a loaded box", () => {
    expect(matchScore(props({ name: "Zone AE" }), "zone ae")).toBe(3);
    expect(matchScore(props({ name: "Zone AE" }), "zone")).toBe(2);
    expect(matchScore(props({ name: "Big Zone" }), "zone")).toBe(1);
    expect(matchScore(props({ name: "Loaded area", kind: "loaded-box", details: { zone: "AE" } }), "loaded")).toBe(0);
  });
});
