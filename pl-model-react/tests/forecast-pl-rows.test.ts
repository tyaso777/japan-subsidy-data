import { describe, expect, it } from 'vitest';
import { calculatePlSeries } from '../src/domain/financials';
import { forecastPlRows } from '../src/domain/rows';
import { baseHistoricalPl } from '../src/domain/sample-data';

describe('将来P/L表の参考行', () => {
  it('従業員人件費の内訳直後に1人当たり給与と前年比成長率を表示する', () => {
    const labels = forecastPlRows.map((row) => row.label);
    const bonusIndex = labels.indexOf('うち従業員の賞与');

    expect(labels.slice(bonusIndex, bonusIndex + 3)).toEqual([
      'うち従業員の賞与',
      '1人当たり給与',
      '1人当たり給与成長率',
    ]);
    expect(labels.filter((label) => label === '1人当たり給与')).toHaveLength(1);
  });

  it('給与総額とFTEから1人当たり給与とその前年比を算出する', () => {
    const records = calculatePlSeries(baseHistoricalPl);
    const pay = forecastPlRows.find((row) => row.label === '1人当たり給与')!;
    const growth = forecastPlRows.find((row) => row.label === '1人当たり給与成長率')!;

    expect(pay.valueKind).toBe('moneyPerPerson');
    expect(growth.valueKind).toBe('percent');
    expect(pay.value?.(records[2], 2, records)).toBeCloseTo(records[2].employeePayPerPerson);
    expect(growth.value?.(records[2], 2, records)).toBeCloseTo(records[2].employeePayPerPersonGrowthRate!);
  });
});
