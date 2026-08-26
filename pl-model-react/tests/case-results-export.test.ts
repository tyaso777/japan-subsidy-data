import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCaseResultReport, createCaseResultHtml, createCaseResultXlsx } from '../src/domain/case-results-export';
import { createInitialModelSnapshot } from '../src/store/model-store';

describe('案件結果の出力', () => {
  it('全社・ベース・補助事業の過去実績と将来予測P/Lを共通レポートへまとめる', () => {
    const report = buildCaseResultReport(createInitialModelSnapshot(), 'millionYen');

    expect(report.tables.map((table) => table.name)).toEqual(['全社合算 P/L', 'ベース事業 P/L', '補助事業 P/L']);
    expect(report.tables[1].years).toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(report.tables[1].rows.find((row) => row.label === '売上高')?.values.slice(0, 4)).toEqual([900, 950, 1000, 1080]);
  });

  it('Excelで開ける複数シートのxlsxを生成する', () => {
    const report = buildCaseResultReport(createInitialModelSnapshot(), 'millionYen');
    const archive = unzipSync(createCaseResultXlsx(report));

    expect(Object.keys(archive)).toContain('xl/worksheets/sheet1.xml');
    expect(Object.keys(archive)).toContain('xl/worksheets/sheet3.xml');
    const workbook = strFromU8(archive['xl/workbook.xml']);
    const baseSheet = strFromU8(archive['xl/worksheets/sheet2.xml']);
    expect(workbook).toContain('name="全社合算PL"');
    expect(workbook).toContain('name="ベース事業PL"');
    expect(workbook).not.toMatch(/<sheet name="[^"]*[\\/?*:[\]][^"]*"/);
    expect(baseSheet).toContain('<row r="1"');
    expect(baseSheet).toContain('金額単位：百万円');
    expect(baseSheet).toContain('<row r="2" ht="24" customHeight="1">');
    expect(baseSheet).toContain('ySplit="2" topLeftCell="C3"');
    expect(baseSheet).toContain('<autoFilter ref="A2:');
    expect(baseSheet).toContain('2026');
    expect(baseSheet).toContain('1080');
  });

  it('ブラウザ単体で閲覧できるHTMLレポートを生成する', () => {
    const report = buildCaseResultReport(createInitialModelSnapshot(), 'millionYen');
    const html = createCaseResultHtml(report);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('全社合算 P/L');
    expect(html).toContain('ベース事業 P/L');
    expect(html).toContain('補助事業 P/L');
    expect(html).toContain('2026年');
  });
});
