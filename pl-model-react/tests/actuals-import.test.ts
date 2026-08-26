import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseActualsImportFile } from '../src/domain/actuals-import';
import { createModelStore } from '../src/store/model-store';

const validFile = {
  format: 'pl-model-actuals',
  version: '1',
  amountUnit: 'million-yen',
  years: [2023, 2024, 2025],
  balanceSheets: [
    { year: 2023, values: { assets: 1_000, cash: 180 } },
    { year: 2025, values: { assets: 1_200, capex: null } },
  ],
  profitAndLoss: {
    base: [
      { year: 2023, values: { sales: 900, cogs: 570, headcount: 110 } },
      { year: 2025, values: { sales: 1_000, cogs: 620, headcount: 118 } },
    ],
    subsidy: [],
  },
  unmappedItems: ['支払利息'],
  notes: ['補助事業の区分資料なし'],
};

describe('AI向け過去実績インポート形式', () => {
  it('配布する入力テンプレートをそのまま検証できる', () => {
    const template = readFileSync(resolve(process.cwd(), 'public/actuals-import-template.json'), 'utf8');

    expect(() => parseActualsImportFile(template)).not.toThrow();
  });

  it('年度をキーに不足項目をnullで補い、金額だけを円へ変換する', () => {
    const imported = parseActualsImportFile(JSON.stringify(validFile));

    expect(imported.years).toEqual([2023, 2024, 2025]);
    expect(imported.actuals.balanceSheets[0].assets).toBe(1_000_000_000);
    expect(imported.actuals.balanceSheets[1].assets).toBeNull();
    expect(imported.actuals.balanceSheets[2].capex).toBeNull();
    expect(imported.actuals.basePl[0].sales).toBe(900_000_000);
    expect(imported.actuals.basePl[0].headcount).toBe(110);
    expect(imported.actuals.basePl[1].sales).toBeNull();
    expect(imported.actuals.subsidyPl[0].sales).toBeNull();
    expect(imported.unmappedItems).toEqual(['支払利息']);
  });

  it('千円単位も円へ変換し、人数は変換しない', () => {
    const source = structuredClone(validFile);
    source.amountUnit = 'thousand-yen';
    source.profitAndLoss.base[0].values.sales = 900;
    source.profitAndLoss.base[0].values.headcount = 12.5;

    const imported = parseActualsImportFile(JSON.stringify(source));

    expect(imported.actuals.basePl[0].sales).toBe(900_000);
    expect(imported.actuals.basePl[0].headcount).toBe(12.5);
  });

  it('年度の重複・降順・欠落を拒否する', () => {
    expect(() => parseActualsImportFile(JSON.stringify({ ...validFile, years: [2023, 2025] }))).toThrow(/連続/);
    expect(() => parseActualsImportFile(JSON.stringify({ ...validFile, years: [2024, 2023] }))).toThrow(/昇順/);
    expect(() => parseActualsImportFile(JSON.stringify({ ...validFile, years: [2023, 2023] }))).toThrow(/重複/);
  });

  it('対象年度外、未知の入力項目、自動計算項目を拒否する', () => {
    const outside = structuredClone(validFile);
    outside.balanceSheets[0].year = 2022;
    expect(() => parseActualsImportFile(JSON.stringify(outside))).toThrow(/対象年度/);

    const unknown = structuredClone(validFile) as typeof validFile & { profitAndLoss: { base: Array<{ year: number; values: Record<string, number | null> }>; subsidy: never[] } };
    unknown.profitAndLoss.base[0].values.operatingProfit = 100;
    expect(() => parseActualsImportFile(JSON.stringify(unknown))).toThrow();
  });

  it('取込年度へ個社期間を合わせ、最新実績を将来予測の基準値へ反映して一度で戻せる', () => {
    const store = createModelStore(undefined, { initialActuals: 'empty' });
    const extended = structuredClone(validFile);
    extended.years = [2022, 2023, 2024, 2025];
    const imported = parseActualsImportFile(JSON.stringify(extended));

    store.getState().importHistoricalActuals(imported);

    const state = store.getState();
    expect(state.program.timeline.historical).toEqual({ startYear: 2022, endYear: 2025 });
    expect(state.program.timeline.periods[0]).toMatchObject({ startYear: 2026, endYear: 2028 });
    expect(state.actuals.basePl[3].sales).toBe(1_000_000_000);
    expect(state.forecast.series.find((series) => series.id === 'base-sales')).toMatchObject({ baseYear: 2025, baseValue: 1_000_000_000 });
    expect(state.canUndo).toBe(true);

    state.undo();
    expect(store.getState().actuals.basePl[2].sales).toBeNull();
  });
});
