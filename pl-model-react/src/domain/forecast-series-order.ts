import type { ForecastSeries } from './forecast-engine';

/**
 * 水準設定を、対応する科目・内訳がP/Lへ最初に現れる順へ並べる。
 * 人員・1人当たり給与はP/Lの参考指標（27以降）に合わせて利益項目の後へ置く。
 */
const plDriverOrder = [
  'sales',
  'cogsRate',
  'cogsDepRate',
  'officerPay',
  'officerCompensationShare',
  'employeeSalaryShare',
  'sgaDepRate',
  'researchDevelopmentRate',
  'otherSgaRate',
  'nonOperatingRate',
  'extraordinaryRate',
  'taxRate',
  'headcount',
  'officerCount',
  'payPerPerson',
] as const;

const orderByDriver = new Map<string, number>(plDriverOrder.map((driver, index) => [driver, index]));

export function forecastDriverId(series: ForecastSeries): string {
  return series.id.startsWith(`${series.scope}-`) ? series.id.slice(series.scope.length + 1) : series.id;
}

export function orderForecastSeriesByPl<T extends ForecastSeries>(series: readonly T[]): T[] {
  return series
    .map((item, index) => ({ item, index, order: orderByDriver.get(forecastDriverId(item)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ item }) => item);
}
