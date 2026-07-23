import {
  createHistoricalPlan,
  DEFAULT_TIMELINE,
  defaultDrivers,
  defaultTargets,
  driverBounds,
  generatePlan,
  operatingProfit,
  retimeBalanceSheets,
  sampleBalanceSheets,
  sampleBasePlan,
  sampleDrivers,
  total,
  type ProjectPeriodInput,
  type SegmentPlan,
  type YearPlan,
} from "./model";
import { PROPOSAL_FORMAT, type ProposalData } from "./proposal-io";
import { inputKey, type InputValues } from "./input-values";
import { defaultMetricGroupBases } from "./metric-groups";

const clone = <T,>(value: T): T => structuredClone(value);
const round = (value: number) => Number(value.toFixed(2));

const emptySegment = (): SegmentPlan => ({
  sales: 0,
  cogs: 0,
  employeePay: 0,
  officerPay: 0,
  depreciation: 0,
  otherSga: 0,
  headcount: 0,
  officerCount: 0,
});

const futureCapex = (investment: number) => {
  const projectYears = DEFAULT_TIMELINE.baseYear - DEFAULT_TIMELINE.latestYear;
  return Array.from({ length: DEFAULT_TIMELINE.baseYear + 3 - DEFAULT_TIMELINE.latestYear }, (_, index) => ({
    year: DEFAULT_TIMELINE.latestYear + index + 1,
    value: index < projectYears ? round(investment / projectYears) : 0,
  }));
};

const commonProposal = (title: string, exportedAt: string, historicalPlan: YearPlan[]): ProposalData => {
  const balanceSheets = retimeBalanceSheets(sampleBalanceSheets, DEFAULT_TIMELINE);
  const capex = futureCapex(sampleDrivers.investment);
  const inputValues: InputValues = {};
  historicalPlan.forEach((row) => {
    const company = total(row.project, row.other);
    const companyInputs: Record<string, number> = {
      "2-1": company.sales, "2-3": company.cogs,
      "2-7": company.employeePay + company.officerPay + company.depreciation + company.otherSga,
      "2-8": company.officerPay, "2-11": company.employeePay, "2-14": company.depreciation,
    };
    const projectInputs: Record<string, number> = {
      "7-1": row.project.sales, "7-4": row.project.sales - row.project.cogs,
      "7-6": operatingProfit(row.project), "7-8": row.project.employeePay,
      "7-9": row.project.officerPay, "7-10": row.project.depreciation,
      "7-13": row.project.headcount, "7-14": row.project.officerCount,
    };
    Object.entries(companyInputs).forEach(([code, value]) => { inputValues[inputKey.companyActual(row.year, code)] = round(value); });
    Object.entries(projectInputs).forEach(([code, value]) => { inputValues[inputKey.projectActual(row.year, code)] = round(value); });
  });
  balanceSheets.forEach((row) => (Object.keys(row) as (keyof typeof row)[]).filter((field) => field !== "year").forEach((field) => { inputValues[inputKey.balanceSheet(row.year, field)] = round(row[field]); }));
  capex.forEach((row) => { inputValues[inputKey.futureCapex(row.year)] = round(row.value); });
  (Object.keys(sampleDrivers) as (keyof typeof sampleDrivers)[]).forEach((key) => {
    inputValues[inputKey.driver(key)] = sampleDrivers[key];
    inputValues[inputKey.driverRange(key, 0)] = driverBounds[key][0];
    inputValues[inputKey.driverRange(key, 1)] = driverBounds[key][1];
  });
  (Object.keys(defaultTargets) as (keyof typeof defaultTargets)[]).forEach((key) => {
    inputValues[inputKey.target(key, "value")] = round(defaultTargets[key].value);
    if (defaultTargets[key].max !== undefined) inputValues[inputKey.target(key, "max")] = round(defaultTargets[key].max!);
  });
  return {
    format: PROPOSAL_FORMAT,
    title,
    exportedAt,
    timeline: { ...DEFAULT_TIMELINE },
    historicalPlan,
    balanceSheets,
    futureCapex: capex,
    drivers: clone(sampleDrivers),
    driverRanges: clone(driverBounds),
    targets: clone(defaultTargets),
    forecastOverrides: {},
    futureInputBasis: "other",
    inputValues,
    metricGroupBases: { ...defaultMetricGroupBases },
    applicationCategory: "general",
  };
};

export function createStandardSampleProposal(exportedAt: string): ProposalData {
  return commonProposal(
    "成長投資計画 提案計画サンプル",
    exportedAt,
    createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE),
  );
}

export function createHistoricalOnlySampleProposal(exportedAt: string): ProposalData {
  const proposal = commonProposal(
    "成長投資計画 過去3期入力済みサンプル",
    exportedAt,
    createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE),
  );
  proposal.drivers = clone(defaultDrivers);
  proposal.futureCapex = futureCapex(0);
  (Object.keys(sampleDrivers) as (keyof typeof sampleDrivers)[]).forEach((key) => {
    delete proposal.inputValues?.[inputKey.driver(key)];
    delete proposal.inputValues?.[inputKey.driverRange(key, 0)];
    delete proposal.inputValues?.[inputKey.driverRange(key, 1)];
  });
  proposal.futureCapex.forEach((row) => {
    delete proposal.inputValues?.[inputKey.futureCapex(row.year)];
  });
  return proposal;
}

export function createBaseYearLaunchSample(exportedAt: string) {
  const latestCompany = total(sampleBasePlan.project, sampleBasePlan.other);
  const latest: YearPlan = {
    year: DEFAULT_TIMELINE.latestYear,
    role: "latest",
    project: emptySegment(),
    other: latestCompany,
  };
  const historicalPlan = createHistoricalPlan(latest, DEFAULT_TIMELINE);
  const launchBase: SegmentPlan = {
    sales: 60,
    cogs: 39,
    employeePay: 4.8,
    officerPay: 0.3,
    depreciation: 4.5,
    otherSga: 6,
    headcount: 48,
    officerCount: 2,
  };
  const periodInputs: ProjectPeriodInput[] = [
    { year: 2026, project: emptySegment() },
    { year: 2027, project: emptySegment() },
    { year: 2028, project: launchBase },
  ];
  const effectivePlan = generatePlan(historicalPlan, sampleDrivers, DEFAULT_TIMELINE, periodInputs);
  const proposal = commonProposal(
    "成長投資計画 提案計画サンプル（基準年売上開始）",
    exportedAt,
    historicalPlan,
  );

  for (const row of effectivePlan.filter((candidate) => candidate.year > DEFAULT_TIMELINE.latestYear)) {
    const project = row.project;
    Object.assign(proposal.forecastOverrides, {
      [`${row.year}:project:7-1`]: round(project.sales),
      [`${row.year}:project:7-4`]: round(project.sales - project.cogs),
      [`${row.year}:project:7-6`]: round(operatingProfit(project)),
      [`${row.year}:project:7-8`]: round(project.employeePay),
      [`${row.year}:project:7-9`]: round(project.officerPay),
      [`${row.year}:project:7-10`]: round(project.depreciation),
      [`${row.year}:project:7-13`]: round(project.headcount),
      [`${row.year}:project:7-14`]: round(project.officerCount),
    });
  }

  return { proposal, effectivePlan };
}
