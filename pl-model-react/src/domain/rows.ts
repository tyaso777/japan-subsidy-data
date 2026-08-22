import type { BalanceSheetRecord, HistoricalPlCalculated, HistoricalPlInput } from './types';
import type { ValueKind } from './value-units';

export type FinancialRow<T> = {
  code: string;
  label: string;
  field?: keyof T;
  indent?: 1 | 2;
  valueKind?: ValueKind;
  calculated?: boolean;
  /** P/L本表を補う水準・比率。S番号で表示し、本表とは独立して表示切替する。 */
  supplementary?: boolean;
  value?: (record: T, index: number, records: T[]) => number | null;
};

export const balanceSheetRows: FinancialRow<BalanceSheetRecord>[] = [
  { code: '1-1', label: '資産総額', field: 'assets' },
  { code: '1-2', label: 'うち流動資産', field: 'currentAssets', indent: 1 },
  { code: '1-3', label: 'うち現金及び預金', field: 'cash', indent: 2 },
  { code: '1-4', label: 'うち固定資産', field: 'fixedAssets', indent: 1 },
  { code: '1-5', label: 'うち有形固定資産', field: 'tangibleAssets', indent: 2 },
  { code: '1-6', label: 'うち建物及び構築物', field: 'buildings', indent: 2 },
  { code: '1-7', label: 'うち機械装置等', field: 'machinery', indent: 2 },
  { code: '1-8', label: 'うち土地', field: 'land', indent: 2 },
  { code: '1-9', label: 'うち無形固定資産', field: 'intangibleAssets', indent: 2 },
  { code: '1-10', label: 'うちソフトウェア', field: 'software', indent: 2 },
  { code: '1-11', label: 'その他（流動資産、固定資産を除くその他資産）', indent: 1, calculated: true, value: (row) => row.assets - row.currentAssets - row.fixedAssets },
  { code: '1-12', label: '負債及び純資産合計', calculated: true, value: (row) => row.liabilities + row.netAssets },
  { code: '1-13', label: '負債総額', field: 'liabilities' },
  { code: '1-14', label: 'うち流動負債', field: 'currentLiabilities', indent: 1 },
  { code: '1-15', label: 'うち短期借入金', field: 'shortTermDebt', indent: 2 },
  { code: '1-16', label: 'うち固定負債', field: 'fixedLiabilities', indent: 1 },
  { code: '1-17', label: 'うち長期借入金', field: 'longTermDebt', indent: 2 },
  { code: '1-18', label: 'その他（上記を除く負債）', indent: 1, calculated: true, value: (row) => row.liabilities - row.currentLiabilities - row.fixedLiabilities },
  { code: '1-19', label: '純資産総額', field: 'netAssets' },
  { code: '1-20', label: 'うち株主資本', field: 'shareholderEquity', indent: 1 },
  { code: '1-21', label: 'うち資本金', field: 'capital', indent: 2 },
  { code: '1-22', label: 'その他（上記を除く純資産）', indent: 1, calculated: true, value: (row) => row.netAssets - row.shareholderEquity },
  { code: '1-23', label: '自己資本比率', valueKind: 'percent', calculated: true, value: (row) => row.assets ? row.shareholderEquity / row.assets * 100 : 0 },
  { code: '1-24', label: '新規設備投資による支出', field: 'capex' },
  { code: '1-25', label: 'EBITDA有利子負債倍率', valueKind: 'multiple', calculated: true, value: (row) => row.ebitdaDebtMultiple ?? 0 },
];

export const historicalPlRows: FinancialRow<HistoricalPlCalculated>[] = [
  { code: '1', label: '売上高', field: 'sales' },
  { code: '2', label: '売上高成長率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.salesGrowthRate },
  { code: '3', label: '売上原価', field: 'cogs' },
  { code: 'S1', label: '原価率', valueKind: 'percent', indent: 1, calculated: true, supplementary: true, value: (row) => row.cogsRate },
  { code: '4', label: 'うち減価償却費（原価）', field: 'cogsDepreciation', indent: 1 },
  { code: 'S2', label: '原価内減価償却費率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.sales ? row.cogsDepreciation / row.sales * 100 : 0 },
  { code: '5', label: '売上総利益', calculated: true, value: (row) => row.grossProfit },
  { code: '6', label: '売上総利益率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.grossProfitMargin },
  { code: '7', label: '販売費及び一般管理費', calculated: true, value: (row) => row.sga },
  { code: '8', label: 'うち役員の人件費', indent: 1, calculated: true, value: (row) => row.officerPay },
  { code: '9', label: 'うち役員報酬', field: 'officerCompensation', indent: 2 },
  { code: '10', label: 'うち役員賞与', field: 'officerBonus', indent: 2 },
  { code: 'S7', label: '役員給与のうち報酬割合', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.officerPay ? row.officerCompensation / row.officerPay * 100 : 0 },
  { code: '11', label: 'うち従業員の人件費', indent: 1, calculated: true, value: (row) => row.employeePay },
  { code: '12', label: 'うち従業員の給与', field: 'employeeSalary', indent: 2 },
  { code: '13', label: 'うち従業員の賞与', field: 'employeeBonus', indent: 2 },
  { code: 'S6', label: '従業員給与のうち給与割合', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.employeePay ? row.employeeSalary / row.employeePay * 100 : 0 },
  { code: '14', label: 'うち減価償却費（販管費）', field: 'sgaDepreciation', indent: 1 },
  { code: 'S3', label: '販管費内減価償却費率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.sales ? row.sgaDepreciation / row.sales * 100 : 0 },
  { code: '15', label: 'うち研究開発費', field: 'researchDevelopment', indent: 1 },
  { code: 'S4', label: '研究開発費の売上高比率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.sales ? row.researchDevelopment / row.sales * 100 : 0 },
  { code: '15A', label: 'その他販管費', field: 'otherSga', indent: 1 },
  { code: 'S5', label: 'その他販管費率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.otherSgaRate },
  { code: '16', label: '営業利益', calculated: true, value: (row) => row.operatingProfit },
  { code: '17', label: '営業利益率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.operatingProfitMargin },
  { code: '17A', label: '営業外損益（純額）', field: 'nonOperating', indent: 1 },
  { code: 'S8', label: '営業外損益の売上高比率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.sales ? row.nonOperating / row.sales * 100 : 0 },
  { code: '18', label: '経常利益', calculated: true, value: (row) => row.ordinaryIncome },
  { code: '18A', label: '特別損益（純額）', field: 'extraordinary', indent: 1 },
  { code: 'S9', label: '特別損益の売上高比率', valueKind: 'percent', indent: 2, calculated: true, supplementary: true, value: (row) => row.sales ? row.extraordinary / row.sales * 100 : 0 },
  { code: '19', label: '税引前当期純利益', calculated: true, value: (row) => row.preTaxIncome },
  { code: '20', label: '当期純利益', field: 'netIncome' },
  { code: 'S10', label: '実効税率', valueKind: 'percent', indent: 1, calculated: true, supplementary: true, value: (row) => row.preTaxIncome > 0 ? (1 - row.netIncome / row.preTaxIncome) * 100 : null },
  { code: '23', label: '減価償却費（合計）', calculated: true, value: (row) => row.depreciation },
  { code: '24', label: '付加価値額', calculated: true, value: (row) => row.valueAdded },
  { code: '25', label: '付加価値増加率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.valueAddedGrowthRate },
  { code: '27', label: '従業員数（就業時間換算）', field: 'headcount', valueKind: 'fte' },
  { code: '28', label: '役員数', field: 'officerCount', valueKind: 'count' },
  { code: '29', label: '従業員1人当たり給与支給総額', valueKind: 'moneyPerPerson', calculated: true, value: (row) => row.employeePayPerPerson },
  { code: '33', label: '労働生産性', valueKind: 'moneyPerPerson', calculated: true, value: (row) => row.laborProductivity },
  { code: '34', label: 'EBITDA', calculated: true, value: (row) => row.ebitda },
  { code: '35', label: 'EBITDAマージン', valueKind: 'percent', calculated: true, value: (row) => row.ebitdaMargin },
];

const forecastPayPerPersonRows: FinancialRow<HistoricalPlCalculated>[] = [
  { code: '30', label: '従業員1人当たり給与支給総額成長率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.employeePayPerPersonGrowthRate },
  { code: '31', label: '役員1人当たり給与支給総額', valueKind: 'moneyPerPerson', calculated: true, value: (row) => row.officerPayPerPerson },
  { code: '32', label: '役員1人当たり給与支給総額成長率', valueKind: 'percent', indent: 1, calculated: true, value: (row) => row.officerPayPerPersonGrowthRate },
];

const forecastPeopleCodes = new Set(['27', '28', '29']);
const forecastPeopleRows: FinancialRow<HistoricalPlCalculated>[] = [
  historicalPlRows.find((row) => row.code === '27')!,
  historicalPlRows.find((row) => row.code === '29')!,
  forecastPayPerPersonRows[0],
  historicalPlRows.find((row) => row.code === '28')!,
  ...forecastPayPerPersonRows.slice(1),
];

/** 将来P/Lでは従業員・役員ごとに「人数→1人当たり単価→前年比」をまとめる。 */
export const forecastPlRows: FinancialRow<HistoricalPlCalculated>[] = historicalPlRows.flatMap((row) => {
  if (row.code === '27') return forecastPeopleRows;
  return forecastPeopleCodes.has(row.code) ? [] : [row];
});

export type HistoricalPlEditableField = keyof HistoricalPlInput;
