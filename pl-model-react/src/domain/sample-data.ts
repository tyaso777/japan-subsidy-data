import type { BalanceSheetRecord, HistoricalPlInput } from './types';

const MONEY_FIELDS: Array<Exclude<keyof HistoricalPlInput, 'headcount' | 'officerCount'>> = [
  'sales', 'cogs', 'cogsDepreciation', 'employeeSalary', 'employeeBonus', 'officerCompensation', 'officerBonus',
  'sgaDepreciation', 'researchDevelopment', 'otherSga', 'nonOperating', 'extraordinary', 'netIncome',
];

function plMillionsToYen(input: HistoricalPlInput): HistoricalPlInput {
  const output = { ...input };
  for (const field of MONEY_FIELDS) output[field] = input[field] * 1_000_000;
  return output;
}

function balanceSheetMillionsToYen(input: BalanceSheetRecord): BalanceSheetRecord {
  return Object.fromEntries(Object.entries(input).map(([field, value]) => [field, value * 1_000_000]));
}

export const baseHistoricalPl: HistoricalPlInput[] = [
  { sales: 900, cogs: 570, cogsDepreciation: 21, employeeSalary: 112, employeeBonus: 6, officerCompensation: 14.4, officerBonus: 1.6, sgaDepreciation: 15, researchDevelopment: 16, otherSga: 68, nonOperating: -5, extraordinary: 0, netIncome: 64, headcount: 110, officerCount: 4 },
  { sales: 950, cogs: 600, cogsDepreciation: 23, employeeSalary: 118, employeeBonus: 6, officerCompensation: 15.3, officerBonus: 1.7, sgaDepreciation: 16, researchDevelopment: 17, otherSga: 72, nonOperating: -5.5, extraordinary: 0, netIncome: 69, headcount: 114, officerCount: 4 },
  { sales: 1000, cogs: 620, cogsDepreciation: 25, employeeSalary: 125.5, employeeBonus: 6.5, officerCompensation: 16.2, officerBonus: 1.8, sgaDepreciation: 17, researchDevelopment: 18, otherSga: 76, nonOperating: -6, extraordinary: 0, netIncome: 79, headcount: 118, officerCount: 4 },
].map(plMillionsToYen);

export const subsidyHistoricalPl: HistoricalPlInput[] = [
  { sales: 50, cogs: 38, cogsDepreciation: 2, employeeSalary: 11.5, employeeBonus: .5, officerCompensation: 1.8, officerBonus: .2, sgaDepreciation: 1, researchDevelopment: 2, otherSga: 5, nonOperating: -1, extraordinary: 0, netIncome: -8, headcount: 12, officerCount: 1 },
  { sales: 70, cogs: 51, cogsDepreciation: 3, employeeSalary: 14.3, employeeBonus: .7, officerCompensation: 2, officerBonus: .2, sgaDepreciation: 1.5, researchDevelopment: 3, otherSga: 6, nonOperating: -1, extraordinary: 0, netIncome: -5, headcount: 15, officerCount: 1 },
  { sales: 100, cogs: 70, cogsDepreciation: 4, employeeSalary: 17, employeeBonus: 1, officerCompensation: 2.2, officerBonus: .3, sgaDepreciation: 2, researchDevelopment: 4, otherSga: 8, nonOperating: -1, extraordinary: 0, netIncome: 0, headcount: 18, officerCount: 1 },
].map(plMillionsToYen);

export const balanceSheets: BalanceSheetRecord[] = [
  { assets: 1050, currentAssets: 555, cash: 180, fixedAssets: 460, tangibleAssets: 400, buildings: 180, machinery: 140, land: 80, intangibleAssets: 60, software: 40, liabilities: 630, currentLiabilities: 250, shortTermDebt: 95, fixedLiabilities: 380, longTermDebt: 285, netAssets: 420, shareholderEquity: 400, capital: 100, capex: 75 },
  { assets: 1115, currentAssets: 599, cash: 195, fixedAssets: 480, tangibleAssets: 416, buildings: 188, machinery: 148, land: 80, intangibleAssets: 64, software: 43, liabilities: 640, currentLiabilities: 260, shortTermDebt: 90, fixedLiabilities: 380, longTermDebt: 282, netAssets: 475, shareholderEquity: 450, capital: 100, capex: 82 },
  { assets: 1208, currentAssets: 640, cash: 220, fixedAssets: 530, tangibleAssets: 460, buildings: 205, machinery: 175, land: 80, intangibleAssets: 70, software: 48, liabilities: 663, currentLiabilities: 278, shortTermDebt: 85, fixedLiabilities: 385, longTermDebt: 275, netAssets: 545, shareholderEquity: 520, capital: 100, capex: 96 },
].map(balanceSheetMillionsToYen);
