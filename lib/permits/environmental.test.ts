// EPA ECHO and USACE ORM adapters on payloads captured on 2026-09-26 for the
// Houston Ship Channel (-95.2,29.7,-95.0,29.78), first 25 rows each. The
// Corps' applicant and requester strings were replaced in the fixture (they
// embed personal names); the adapter never reads them. No network.
import { describe, expect, it } from "vitest";
import { buildAir, buildNpdes, buildUsace, echoDate, echoFacilities, echoFacilitiesUrl, echoQidUrl, echoQuery, ormDate, ormFeatures, ormUrl } from "./environmental";

import cwaQuery from "./fixtures/echo-npdes-query.json";
import cwaRows from "./fixtures/echo-npdes-rows.json";
import airQuery from "./fixtures/echo-air-query.json";
import airRows from "./fixtures/echo-air-rows.json";
import orm from "./fixtures/usace-orm.json";

describe("EPA ECHO", () => {
  it("reads the query id and row count from get_facilities", () => {
    expect(echoQuery(cwaQuery)).toMatchObject({ rows: 459 });
    expect(echoQuery(airQuery)).toMatchObject({ rows: 120 });
    expect(echoQuery({ Results: { Error: { ErrorMessage: "x" } } })).toBeNull();
  });

  it("asks get_qid for named columns, including the longitude the default set leaves out", () => {
    const url = echoQidUrl("npdes", "161");
    expect(url).toContain("qcolumns=");
    expect(decodeURIComponent(url)).toContain(",24,25,");
    expect(echoFacilitiesUrl("air", [-95.2, 29.7, -95, 29.78])).toContain("p_c1lon=-95.2");
  });

  it("NPDES: named by permit id, facility kept for the dossier, dates from MM/DD/YYYY", () => {
    const r = buildNpdes(echoFacilities(cwaRows));
    expect(r.length).toBe(25);
    expect(r[0]).toMatchObject({ program: "npdes", number: "TXR1509LI", facility: "0 BAYWAY DRIVE BAYTOWN TX 77520", dateLabel: "permit expires" });
    expect(r[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.every((x) => Number.isFinite(x.lon) && Number.isFinite(x.lat))).toBe(true);
    expect(r[0].url).toMatch(/^https:\/\/echo\.epa\.gov\/detailed-facility-report\?fid=/);
  });

  it("air: ECHO's compliance words kept; a missing status says 'not reported by ECHO', never 'no violation'", () => {
    const r = buildAir(echoFacilities(airRows));
    expect(r.length).toBe(25);
    expect(r.every((x) => typeof x.compliance === "string" && x.compliance.length > 0)).toBe(true);
    const missing = buildAir([{ SourceID: "X1", FacLat: "29.7", FacLong: "-95.1", AIRName: "SITE" }]);
    expect(missing[0].compliance).toBe("not reported by ECHO");
  });

  it("parses ECHO and ORM dates and nothing else", () => {
    expect(echoDate("03/04/2028")).toBe("2028-03-04");
    expect(echoDate("2028-03-04")).toBeUndefined();
    expect(ormDate("20250617")).toBe("2025-06-17");
    expect(ormDate("05/22/2025")).toBe("2025-05-22");
    expect(ormDate("N/A")).toBeUndefined();
  });
});

describe("USACE ORM", () => {
  it("never keeps the applicant or a 408 requester, names by DA or request number, newest first", () => {
    const r = buildUsace(ormFeatures(orm));
    expect(r.length).toBe(25);
    expect(JSON.stringify(r)).not.toContain("[removed from this fixture");
    expect(r.find((x) => x.number === "SWG-1993-01047")).toMatchObject({ type: "Letter of Permission", status: "Issued With Special Conditions" });
    expect(r.find((x) => x.number.startsWith("408-SWG-"))?.published["record kind (ORM)"]).toBe("Section 408 permission");
    const dated = r.filter((x) => x.date).map((x) => x.date!);
    expect(dated).toEqual([...dated].sort().reverse());
  });

  it("asks for at most 300 actions in the box", () => {
    expect(ormUrl([-95.2, 29.7, -95, 29.78])).toBe("https://permits.ops.usace.army.mil/orm-public-api/permits/search?da=true&max=300&bbox=-95.2,29.7,-95,29.78");
  });
});
