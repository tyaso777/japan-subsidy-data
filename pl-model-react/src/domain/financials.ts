import type { HistoricalPlCalculated, HistoricalPlInput } from './types';

export function calculatePl(input: HistoricalPlInput, previous?: HistoricalPlInput): HistoricalPlCalculated {
  const employeePay = input.employeeSalary + input.employeeBonus;
  const officerPay = input.officerCompensation + input.officerBonus;
  const grossProfit = input.sales - input.cogs;
  const sga = employeePay + officerPay + input.sgaDepreciation + input.researchDevelopment + input.otherSga;
  const operatingProfit = grossProfit - sga;
  const ordinaryIncome = operatingProfit + input.nonOperating;
  const preTaxIncome = ordinaryIncome + input.extraordinary;
  const depreciation = input.cogsDepreciation + input.sgaDepreciation;
  const valueAdded = operatingProfit + employeePay + officerPay + depreciation;
  const previousCalculated = previous ? calculatePl(previous) : null;
  const people = input.headcount + input.officerCount;
  const ebitda = operatingProfit + depreciation;
  const employeePayPerPerson = input.headcount ? employeePay / input.headcount : 0;
  return {
    ...input,
    employeePay,
    officerPay,
    grossProfit,
    grossProfitMargin: input.sales ? grossProfit / input.sales * 100 : 0,
    sga,
    operatingProfit,
    operatingProfitMargin: input.sales ? operatingProfit / input.sales * 100 : 0,
    ordinaryIncome,
    preTaxIncome,
    depreciation,
    valueAdded,
    salesGrowthRate: previous?.sales ? (input.sales / previous.sales - 1) * 100 : null,
    headcountGrowthRate: previous?.headcount ? (input.headcount / previous.headcount - 1) * 100 : null,
    employeePayPerPersonGrowthRate: previousCalculated?.employeePayPerPerson ? (employeePayPerPerson / previousCalculated.employeePayPerPerson - 1) * 100 : null,
    employeePayGrowthRate: previousCalculated?.employeePay ? (employeePay / previousCalculated.employeePay - 1) * 100 : null,
    valueAddedGrowthRate: previousCalculated?.valueAdded ? (valueAdded / previousCalculated.valueAdded - 1) * 100 : null,
    cogsRate: input.sales ? input.cogs / input.sales * 100 : 0,
    otherSgaRate: input.sales ? input.otherSga / input.sales * 100 : 0,
    employeePayPerPerson,
    laborProductivity: people ? valueAdded / people : 0,
    ebitda,
    ebitdaMargin: input.sales ? ebitda / input.sales * 100 : 0,
  };
}

export const calculateHistoricalPl = calculatePl;

export function calculatePlSeries(inputs: HistoricalPlInput[]): HistoricalPlCalculated[] {
  return inputs.map((input, index) => calculatePl(input, inputs[index - 1]));
}

export function combinePlInputs(...inputs: HistoricalPlInput[]): HistoricalPlInput {
  const fields = Object.keys(inputs[0] ?? {}) as Array<keyof HistoricalPlInput>;
  return Object.fromEntries(fields.map((field) => [field, inputs.reduce((sum, input) => sum + input[field], 0)])) as HistoricalPlInput;
}
