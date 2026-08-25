import { describe, expect, it } from 'vitest';
import { balanceSheetRows, forecastPlRows, historicalPlRows } from '../src/domain/rows';

const visibleCodes = (rows: Array<{ displayCode?: string; code: string }>) =>
  rows.map((row) => row.displayCode ?? row.code);

describe('tool-local financial statement display codes', () => {
  it('numbers B/S rows sequentially without subsidy-form prefixes', () => {
    expect(visibleCodes(balanceSheetRows)).toEqual(
      Array.from({ length: balanceSheetRows.length }, (_, index) => String(index + 1)),
    );
  });

  it('numbers ordinary P/L rows sequentially and supplementary rows as S-n', () => {
    const ordinary = historicalPlRows.filter((row) => !row.supplementary);
    const supplementary = historicalPlRows.filter((row) => row.supplementary);

    expect(visibleCodes(ordinary)).toEqual(
      Array.from({ length: ordinary.length }, (_, index) => String(index + 1)),
    );
    expect(visibleCodes(supplementary)).toEqual(
      Array.from({ length: supplementary.length }, (_, index) => `S-${index + 1}`),
    );
    expect(historicalPlRows.find((row) => row.label === '売上高')?.displayCode).toBe('1');
  });

  it('renumbers the forecast P/L according to its own displayed order', () => {
    const ordinary = forecastPlRows.filter((row) => !row.supplementary);
    expect(visibleCodes(ordinary)).toEqual(
      Array.from({ length: ordinary.length }, (_, index) => String(index + 1)),
    );
  });
});
