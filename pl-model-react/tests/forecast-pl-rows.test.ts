import { describe, expect, it } from 'vitest';
import { calculatePlSeries } from '../src/domain/financials';
import { forecastPlRows } from '../src/domain/rows';
import { baseHistoricalPl } from '../src/domain/sample-data';

describe('将来P/L表の参考行', () => {
  it('従業員・役員の1人当たり指標を人数行の後へまとめる', () => {
    const labels = forecastPlRows.map((row) => row.label);
    const bonusIndex = labels.indexOf('うち従業員の賞与');
    const employeeCountIndex = labels.indexOf('従業員数（就業時間換算）');

    expect(labels[bonusIndex + 1]).not.toContain('1人当たり');
    expect(labels.slice(employeeCountIndex, employeeCountIndex + 6)).toEqual([
      '従業員数（就業時間換算）',
      '従業員1人当たり給与支給総額',
      '従業員1人当たり給与支給総額成長率',
      '役員数',
      '役員1人当たり給与支給総額',
      '役員1人当たり給与支給総額成長率',
    ]);
  });

  it('給与総額とFTEから1人当たり給与とその前年比を算出する', () => {
    const records = calculatePlSeries(baseHistoricalPl);
    const pay = forecastPlRows.find((row) => row.label === '従業員1人当たり給与支給総額')!;
    const growth = forecastPlRows.find((row) => row.label === '従業員1人当たり給与支給総額成長率')!;
    const officerPay = forecastPlRows.find((row) => row.label === '役員1人当たり給与支給総額')!;
    const officerGrowth = forecastPlRows.find((row) => row.label === '役員1人当たり給与支給総額成長率')!;

    expect(pay.valueKind).toBe('moneyPerPerson');
    expect(growth.valueKind).toBe('percent');
    expect(pay.value?.(records[2], 2, records)).toBeCloseTo(records[2].employeePayPerPerson);
    expect(growth.value?.(records[2], 2, records)).toBeCloseTo(records[2].employeePayPerPersonGrowthRate!);
    expect(officerPay.value?.(records[2], 2, records)).toBeCloseTo(records[2].officerPayPerPerson);
    expect(officerGrowth.value?.(records[2], 2, records)).toBeCloseTo(records[2].officerPayPerPersonGrowthRate!);
  });
});
