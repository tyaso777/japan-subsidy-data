import {
  createHistoricalPlan,
  DEFAULT_TIMELINE,
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

const commonProposal = (title: string, exportedAt: string, historicalPlan: YearPlan[]): ProposalData => ({
  format: PROPOSAL_FORMAT,
  title,
  exportedAt,
  timeline: { ...DEFAULT_TIMELINE },
  historicalPlan,
  balanceSheets: retimeBalanceSheets(sampleBalanceSheets, DEFAULT_TIMELINE),
  futureCapex: futureCapex(sampleDrivers.investment),
  drivers: clone(sampleDrivers),
  driverRanges: clone(driverBounds),
  targets: clone(defaultTargets),
  forecastOverrides: {},
  futureInputBasis: "other",
});

export function createStandardSampleProposal(exportedAt: string): ProposalData {
  return commonProposal(
    "成長投資計画 提案計画サンプル",
    exportedAt,
    createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE),
  );
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
