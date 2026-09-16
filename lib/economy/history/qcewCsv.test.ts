import { describe, expect, it } from "vitest";
import { parseQcewAreaTotal, totalAgglvl } from "./qcewCsv";

// Column order of the BLS QCEW open-data area slice, values quoted as BLS writes them.
const HEADER =
  '"area_fips","own_code","industry_code","agglvl_code","size_code","year","qtr","disclosure_code","qtrly_estabs","month1_emplvl","month2_emplvl","month3_emplvl","total_qtrly_wages","taxable_qtrly_wages","qtrly_contributions","avg_wkly_wage","lq_disclosure_code","lq_qtrly_estabs","lq_month1_emplvl","lq_month2_emplvl","lq_month3_emplvl","lq_total_qtrly_wages","lq_taxable_qtrly_wages","lq_qtrly_contributions","lq_avg_wkly_wage","oty_disclosure_code","oty_qtrly_estabs_chg","oty_qtrly_estabs_pct_chg","oty_month1_emplvl_chg","oty_month1_emplvl_pct_chg","oty_month2_emplvl_chg","oty_month2_emplvl_pct_chg","oty_month3_emplvl_chg","oty_month3_emplvl_pct_chg","oty_total_qtrly_wages_chg","oty_total_qtrly_wages_pct_chg","oty_taxable_qtrly_wages_chg","oty_taxable_qtrly_wages_pct_chg","oty_qtrly_contributions_chg","oty_qtrly_contributions_pct_chg","oty_avg_wkly_wage_chg","oty_avg_wkly_wage_pct_chg"';
const TOTAL = '"48453","0","10","70","0","2024","1","","45210","770100","772300","775900","15200000000","5100000000","61000000","1507","","1.00","1.00","1.00","1.00","1.00","1.00","1.00","1.00","","900","2.0","15000","2.0","15100","2.0","15200","2.0","700000000","4.8","100000000","2.0","1000000","1.7","44","3.0"';
const PRIVATE_TOTAL = '"48453","5","10","71","0","2024","1","","44000","700000","701000","702000","13000000000","4900000000","59000000","1480","","1.00","1.00","1.00","1.00","1.00","1.00","1.00","1.00","","880","2.0","14000","2.0","14100","2.0","14200","2.0","650000000","5.0","95000000","2.0","950000","1.6","40","2.8"';
const SECTOR = '"48453","5","1023","74","0","2024","1","","3200","40000","40100","40200","900000000","300000000","3600000","1730","","1.10","1.20","1.20","1.20","1.30","1.30","1.30","1.10","","50","1.6","800","2.0","810","2.1","820","2.1","40000000","4.6","6000000","2.0","60000","1.7","30","1.8"';
const SUPPRESSED = '"48301","0","10","70","0","2024","1","N","","","","","","","","","","","","","","","","","","N","","","","","","","","","","","","","","","",""';

describe("parseQcewAreaTotal", () => {
  it("picks the total covered row (industry 10, own 0, county agglvl 70) and reads levels and BLS's own changes", () => {
    const row = parseQcewAreaTotal([HEADER, SECTOR, PRIVATE_TOTAL, TOTAL].join("\n"), "48453", 2024, 1)!;
    expect(row).toMatchObject({ area: "48453", year: 2024, qtr: 1, estabs: 45210, emp: 775900, wages: 15200000000, avgWeeklyWage: 1507, otyEmpPct: 2.0, otyAvgWeeklyWagePct: 3.0, otyEstabsPct: 2.0, suppressed: false });
  });
  it("suppressed rows keep the shape but every value is null", () => {
    const row = parseQcewAreaTotal([HEADER, SUPPRESSED].join("\n"), "48301", 2024, 1)!;
    expect(row.suppressed).toBe(true);
    expect(row.emp).toBeNull();
    expect(row.avgWeeklyWage).toBeNull();
    expect(row.otyEmpPct).toBeNull();
  });
  it("null when the total row is absent, the header is foreign, or the file is empty", () => {
    expect(parseQcewAreaTotal([HEADER, SECTOR, PRIVATE_TOTAL].join("\n"), "48453", 2024, 1)).toBeNull();
    expect(parseQcewAreaTotal("<html>not found</html>", "48453", 2024, 1)).toBeNull();
    expect(parseQcewAreaTotal("", "48453", 2024, 1)).toBeNull();
  });
  it("state and national slices use their own aggregation level", () => {
    expect(totalAgglvl("48453")).toBe("70");
    expect(totalAgglvl("48000")).toBe("50");
    expect(totalAgglvl("US000")).toBe("10");
    const state = TOTAL.replace('"48453","0","10","70"', '"48000","0","10","50"');
    expect(parseQcewAreaTotal([HEADER, state].join("\n"), "48000", 2024, 1)?.area).toBe("48000");
    expect(parseQcewAreaTotal([HEADER, state].join("\n"), "48453", 2024, 1)).toBeNull();
  });
});
