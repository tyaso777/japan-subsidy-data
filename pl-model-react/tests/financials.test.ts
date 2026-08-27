import { describe, expect, it } from 'vitest';
import { calculateHistoricalPl, calculatePlSeries, combinePlInputs } from '../src/domain/financials';
import { baseHistoricalPl, subsidyHistoricalPl } from '../src/domain/sample-data';

describe('過去P/L自動計算', () => {
  it('入力項目から利益・付加価値・生産性を一意に計算する', () => {
    const result = calculateHistoricalPl(baseHistoricalPl[2], baseHistoricalPl[1]);

    expect(result.grossProfit).toBe(380_000_000);
    expect(result.operatingProfit).toBe(119_000_000);
    expect(result.ordinaryIncome).toBe(113_000_000);
    expect(result.valueAdded).toBe(311_000_000);
    expect(result.employeePayPerPerson).toBeCloseTo(132_000_000 / 118);
    expect(result.salesGrowthRate).toBeCloseTo((1_000_000_000 / 950_000_000 - 1) * 100);
    expect(result.headcountGrowthRate).toBeCloseTo((118 / 114 - 1) * 100);
    expect(result.employeePayPerPersonGrowthRate).toBeCloseTo(((132_000_000 / 118) / (124_000_000 / 114) - 1) * 100);
    expect(result.officerPayPerPerson).toBeCloseTo(18_000_000 / 4);
    expect(result.officerPayPerPersonGrowthRate).toBeCloseTo(((18_000_000 / 4) / (17_000_000 / 4) - 1) * 100);
    expect(result.employeePayGrowthRate).toBeCloseTo((132_000_000 / 124_000_000 - 1) * 100);
    expect(result.cogsRate).toBe(62);
    expect(result.otherSgaRate).toBe(7.6);
  });

  it('同じ計算パイプラインで系列と全社合算を計算する', () => {
    const series = calculatePlSeries(baseHistoricalPl);
    expect(series[2].operatingProfit).toBe(119_000_000);
    const company = calculateHistoricalPl(combinePlInputs(baseHistoricalPl[2], subsidyHistoricalPl[2]));
    expect(company.sales).toBe(1_100_000_000);
    expect(company.headcount).toBe(136);
  });

  it('売上高0で営業赤字の場合は営業利益率を0%とせず算定不能にする', () => {
    const result = calculateHistoricalPl({ ...subsidyHistoricalPl[0], sales: 0, cogs: 0 });

    expect(result.operatingProfit).toBeLessThan(0);
    expect(result.operatingProfitMargin).toBeNaN();
  });

  it('売上高が正で営業赤字なら営業利益率を負値で返す', () => {
    const result = calculateHistoricalPl({ ...subsidyHistoricalPl[0], sales: 10_000_000, cogs: 9_000_000 });

    expect(result.operatingProfit).toBeLessThan(0);
    expect(result.operatingProfitMargin).toBeLessThan(0);
  });
});
