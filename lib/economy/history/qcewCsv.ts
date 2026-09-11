// Parser for one BLS QCEW open-data area slice
// (https://data.bls.gov/cew/data/api/<year>/<qtr>/area/<fips>.csv): every
// industry × ownership row for one area and quarter. We keep the one row the
// history needs, total covered employment (industry_code 10, own_code 0).
//
// Header (quoted cells in the real file):
//   area_fips,own_code,industry_code,agglvl_code,size_code,year,qtr,disclosure_code,
//   qtrly_estabs,month1_emplvl,month2_emplvl,month3_emplvl,total_qtrly_wages,
//   taxable_qtrly_wages,qtrly_contributions,avg_wkly_wage,lq_*...,oty_*...
// shape per https://www.bls.gov/cew/additional-resources/open-data/csv-data-slices.htm; unverified in sandbox

import { cellNum, parseCsv } from "@/lib/economy/csv";

export interface QcewTotalRow {
  area: string;
  year: number;
  qtr: number;
  /** Count of establishments in the quarter. */
  estabs: number | null;
  /** Third-month employment level. */
  emp: number | null;
  /** Total quarterly wages, dollars. */
  wages: number | null;
  avgWeeklyWage: number | null;
  /** BLS's own over-the-year percent changes, kept for cross-checks. */
  otyEmpPct: number | null;
  otyAvgWeeklyWagePct: number | null;
  otyEstabsPct: number | null;
  /** Disclosure code N: every value above is null. */
  suppressed: boolean;
}

/** Aggregation level of the total row for an area code: county 70, state 50, national 10. */
export function totalAgglvl(fips: string): "70" | "50" | "10" {
  if (fips === "US000") return "10";
  if (fips.endsWith("000")) return "50";
  return "70";
}

/** The total covered row, or null when the slice has none (unknown area, or the quarter is not out). */
export function parseQcewAreaTotal(csv: string, fips: string, year: number, qtr: number): QcewTotalRow | null {
  const rows = parseCsv(csv);
  const h = rows[0] ?? [];
  const idx = new Map(h.map((k, i) => [k.trim(), i] as const));
  const need = ["own_code", "industry_code", "agglvl_code"];
  if (need.some((k) => !idx.has(k))) return null;
  const level = totalAgglvl(fips);
  for (const r of rows.slice(1)) {
    const cell = (k: string) => {
      const i = idx.get(k);
      return i == null ? "" : (r[i] ?? "").trim();
    };
    if (cell("own_code") !== "0" || cell("industry_code") !== "10" || cell("agglvl_code") !== level) continue;
    const suppressed = cell("disclosure_code") === "N";
    const n = (k: string) => (suppressed ? null : cellNum(cell(k)));
    return {
      area: cell("area_fips") || fips,
      year: cellNum(cell("year")) ?? year,
      qtr: cellNum(cell("qtr")) ?? qtr,
      estabs: n("qtrly_estabs"),
      emp: n("month3_emplvl"),
      wages: n("total_qtrly_wages"),
      avgWeeklyWage: n("avg_wkly_wage"),
      otyEmpPct: n("oty_month3_emplvl_pct_chg"),
      otyAvgWeeklyWagePct: n("oty_avg_wkly_wage_pct_chg"),
      otyEstabsPct: n("oty_qtrly_estabs_pct_chg"),
      suppressed,
    };
  }
  return null;
}
