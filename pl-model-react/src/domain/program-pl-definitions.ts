import { commonPlFormulaInputs, sortNumericDefinitions } from './definition-graph';
import { evaluateFormula, type FormulaContext } from './formula-engine';
import type { CommonNumericDefinition, HistoricalPlCalculated } from './types';

const formulaFields: Record<string, keyof HistoricalPlCalculated> = {
  売上高: 'sales', 売上原価: 'cogs', 原価内減価償却費: 'cogsDepreciation', 売上総利益: 'grossProfit',
  販売費及び一般管理費: 'sga', 営業利益: 'operatingProfit', 従業員給与総額: 'employeePay', 従業員人件費: 'employeePay',
  役員人件費: 'officerPay', 販管費内減価償却費: 'sgaDepreciation', 減価償却費: 'depreciation',
  研究開発費: 'researchDevelopment', その他販管費: 'otherSga', 営業外損益: 'nonOperating', 経常利益: 'ordinaryIncome',
  特別損益: 'extraordinary', 税引前当期純利益: 'preTaxIncome', 当期純利益: 'netIncome',
  '従業員数（就業時間換算）': 'headcount', 役員数: 'officerCount',
  '従業員1人当たり給与支給総額': 'employeePayPerPerson', EBITDA: 'ebitda',
};

function pointName(offset: number): string {
  if (offset === 0) return 't';
  return offset > 0 ? `t+${offset}` : `t${offset}`;
}

function rawFormulaValues(records: HistoricalPlCalculated[], currentIndex: number): FormulaContext['values'] {
  return Object.fromEntries(Object.entries(formulaFields).map(([label, field]) => [label, Object.fromEntries(records.map((record, index) => [pointName(index - currentIndex), Number(record[field])]))]));
}

/**
 * 制度共通数値定義を年度順に評価し、P/L・チャート用レコードへ付加する。
 * 過年度に計算済みの制度指標もコンテキストへ戻すため、[付加価値額][t-1] のような式も扱える。
 */
export function applyProgramNumericDefinitions(records: HistoricalPlCalculated[], years: number[], definitions: CommonNumericDefinition[]): HistoricalPlCalculated[] {
  const ordered = sortNumericDefinitions(definitions, commonPlFormulaInputs);
  const results = records.map(() => ({} as Record<string, number | null>));
  const valuesByLabel = new Map(ordered.map((definition) => [definition.label, Array<number | null>(records.length).fill(null)]));

  for (let index = 0; index < records.length; index += 1) {
    const values = rawFormulaValues(records, index);
    for (const definition of ordered) {
      for (const [label, series] of valuesByLabel) {
        values[label] = Object.fromEntries(series.flatMap((value, valueIndex) => Number.isFinite(value) ? [[pointName(valueIndex - index), Number(value)]] : []));
      }
      try {
        const value = evaluateFormula(definition.formula, { values, years: { t: years[index] ?? index } });
        results[index][definition.id] = value;
        valuesByLabel.get(definition.label)![index] = value;
        values[definition.label] = { ...(values[definition.label] ?? {}), [definition.outputPoint]: value };
      } catch {
        results[index][definition.id] = null;
      }
    }
  }

  const canonicalIds = new Map(definitions.map((definition) => [definition.label, definition.id]));
  const mapped = records.map((record, index) => {
    const valueAdded = results[index][canonicalIds.get('付加価値額') ?? ''];
    const laborProductivity = results[index][canonicalIds.get('労働生産性') ?? ''];
    const ebitda = results[index][canonicalIds.get('EBITDA') ?? ''];
    return {
      ...record,
      programValues: results[index],
      valueAdded: Number.isFinite(valueAdded) ? Number(valueAdded) : 0,
      laborProductivity: Number.isFinite(laborProductivity) ? Number(laborProductivity) : 0,
      ebitda: Number.isFinite(ebitda) ? Number(ebitda) : 0,
      ebitdaMargin: record.sales && Number.isFinite(ebitda) ? Number(ebitda) / record.sales * 100 : 0,
    };
  });
  return mapped.map((record, index) => ({
    ...record,
    valueAddedGrowthRate: mapped[index - 1]?.valueAdded ? (record.valueAdded / mapped[index - 1].valueAdded - 1) * 100 : null,
  }));
}
