import {
  createHistoricalPlan,
  createForecastProjectPeriodInputs,
  cogsDepreciation,
  DEFAULT_TIMELINE,
  defaultDrivers,
  defaultTargets,
  driverBounds,
  generatePlan,
  employeeBonus,
  employeeSalary,
  netIncome,
  operatingProfit,
  ordinaryIncome,
  officerBonus,
  officerCompensation,
  retimeBalanceSheets,
  researchDevelopment,
  preTaxIncome,
  sampleBalanceSheets,
  sampleBasePlan,
  sampleDrivers,
  sgaDepreciation,
  total,
  type ProjectPeriodInput,
  type SegmentPlan,
  type YearPlan,
} from "./model";
import { PROPOSAL_FORMAT, type ProposalData } from "./proposal-io";
import { INTERNAL_MONEY_UNIT } from "./money";
import { inputKey, type InputValues } from "./input-values";
import { defaultMetricGroupBases } from "./metric-groups";
import { createOptimizationTargets, runPlanningOptimization } from "./proposal-optimization";
import { legacyOkuToInternalMoney } from "./money";

const clone = <T,>(value: T): T => structuredClone(value);
const round = (value: number) => Number(value.toFixed(2));

const standardWorkflowInitialDrivers = {
  ...sampleDrivers,
  projectMarketGrowth: 0.05,
  projectSalesGrowthToBase: 0.05409356725146197,
  projectCogsImprovementToBase: 5.551115123125783e-17,
  projectPayGrowthToBase: 0.020030662342518046,
  projectHeadcountGrowthToBase: 0.05409356725146197,
  projectSgaImprovementToBase: 0,
  projectOfficerPayGrowthToBase: 0.05409356725146197,
  otherSalesGrowthToBase: 0.042572463768115854,
  otherCogsImprovementToBase: 0,
  otherPayGrowthToBase: 0.01984645846924027,
  otherHeadcountGrowthToBase: 0.04083333333333339,
  otherSgaImprovementToBase: 0,
  projectSalesGrowth: 0.22,
  otherSalesGrowth: 0.06257246376811586,
  projectCogsImprovementAfterBase: 0.015,
  otherCogsImprovement: 0.005,
  projectPayGrowth: 0.07,
  otherPayGrowth: 0.02484645846924027,
  projectHeadcountGrowth: 0.04,
  otherHeadcountGrowth: 0.045833333333333386,
  projectSgaRateEnd: 0.015,
  otherSgaRateEnd: 0.005,
  projectOfficerPayGrowth: 0.05380116959064325,
  investment: legacyOkuToInternalMoney(23),
  subsidy: legacyOkuToInternalMoney(7.66),
  localBenchmark: 23,
};

const standardWorkflowAdjustedDrivers = {
  ...sampleDrivers,
  projectCogsRateWhenSalesZero: 0.6800284045429961,
  otherCogsRateWhenSalesZero: 0.6800524762335899,
  projectSalesGrowthToBase: 0.054050164473684194,
  projectCogsImprovementToBase: 1.174186491064466e-16,
  projectPayGrowthToBase: 0.020074675049375927,
  projectHeadcountGrowthToBase: 0.05340906347501403,
  projectSgaImprovementToBase: 0,
  projectOfficerPayGrowthToBase: 0.05412875611879036,
  otherSalesGrowthToBase: 0.04262008955831459,
  otherCogsImprovementToBase: 0,
  otherPayGrowthToBase: 0.01983058100766595,
  otherHeadcountGrowthToBase: 0.04058101466508131,
  otherSgaImprovementToBase: 0,
  projectSalesGrowth: 0.22021292914536156,
  otherSalesGrowth: 0.06254234108406823,
  projectCogsImprovementAfterBase: 0.014994531861872551,
  otherCogsImprovement: 0.005,
  projectPayGrowth: 0.084657027680731,
  otherPayGrowth: 0.02488021940260233,
  projectHeadcountGrowth: 0.02349784566554255,
  otherHeadcountGrowth: 0.045872821667604986,
  projectSgaRateEnd: 0.014999737221599106,
  otherSgaRateEnd: 0.005026523443170271,
  projectOfficerPayGrowth: 0.05379522273680665,
  investment: legacyOkuToInternalMoney(23),
  subsidy: legacyOkuToInternalMoney(7.66),
};

const standardWorkflowRanges: typeof driverBounds = {
  ...clone(driverBounds),
  projectCogsRateToBase: [0.68, 0.68],
  projectCogsRateWhenSalesZero: [0.66, 0.7],
  otherCogsRateToBase: [0.68, 0.68],
  otherCogsRateWhenSalesZero: [0.66, 0.7],
  projectSalesGrowthToBase: [0.051169590643274754, 0.05701754385964919],
  projectCogsImprovementToBase: [0, 1.6653345369377348e-16],
  projectPayGrowthToBase: [0.019325330501846927, 0.020735994183189166],
  projectHeadcountGrowthToBase: [0.051169590643274754, 0.05701754385964919],
  projectSgaImprovementToBase: [0, 0],
  projectOfficerPayGrowthToBase: [0.051169590643274754, 0.05701754385964919],
  otherSalesGrowthToBase: [0.040760869565217184, 0.04438405797101452],
  otherCogsImprovementToBase: [0, 0.00013457556935819737],
  otherPayGrowthToBase: [0.019139457023717443, 0.020553459914763095],
  otherHeadcountGrowthToBase: [0.03916666666666668, 0.04250000000000009],
  otherSgaImprovementToBase: [0, 0],
  projectSalesGrowth: [0.15, 0.3],
  otherSalesGrowth: [0.06076086956521719, 0.06438405797101453],
  projectCogsImprovementAfterBase: [0, 0.03],
  otherCogsImprovement: [0.005, 0.0051345755693581975],
  projectPayGrowth: [0.05, 0.1],
  otherPayGrowth: [0.024139457023717444, 0.025553459914763096],
  projectHeadcountGrowth: [0, 0.08],
  otherHeadcountGrowth: [0.04416666666666668, 0.04750000000000009],
  projectSgaRateEnd: [0, 0.03],
  otherSgaRateEnd: [0, 0.01],
  projectOfficerPayGrowth: [0.04263157894736836, 0.06555555555555558],
};

const standardWorkflowTargets = clone(defaultTargets);
Object.assign(standardWorkflowTargets, {
  companySalesCagr: { ...standardWorkflowTargets.companySalesCagr, value: 15 },
  companySalesIncrease: { ...standardWorkflowTargets.companySalesIncrease, value: legacyOkuToInternalMoney(82.4), max: legacyOkuToInternalMoney(252.69) },
  companyPaySchedule: { ...standardWorkflowTargets.companyPaySchedule, value: 2 },
  projectSalesShare: { ...standardWorkflowTargets.projectSalesShare, value: 60 },
  projectSalesIncrease: { ...standardWorkflowTargets.projectSalesIncrease, value: legacyOkuToInternalMoney(74.8), max: legacyOkuToInternalMoney(136.84) },
  valueAddedIncrease: { ...standardWorkflowTargets.valueAddedIncrease, value: legacyOkuToInternalMoney(18.78), max: legacyOkuToInternalMoney(33.43) },
  employeePayIncrease: { ...standardWorkflowTargets.employeePayIncrease, value: legacyOkuToInternalMoney(2.85), max: legacyOkuToInternalMoney(3.74) },
  investmentSalesRatio: { ...standardWorkflowTargets.investmentSalesRatio, value: 15 },
});

const standardWorkflowOverrides: Record<string, number> = {
  "2029:other:sales": legacyOkuToInternalMoney(85.13),
  "2029:project:7-8": legacyOkuToInternalMoney(7.9),
};

const partiallyUnmetAdjustedDrivers = {
  ...standardWorkflowAdjustedDrivers,
  projectCogsRateWhenSalesZero: 0.68,
  otherCogsRateWhenSalesZero: 0.68,
  projectSalesGrowthToBase: 0.05409356725146197,
  projectPayGrowthToBase: 0.020444143922526622,
  projectHeadcountGrowthToBase: 0.05213911138390186,
  projectOfficerPayGrowthToBase: 0.05409356725146197,
  otherSalesGrowthToBase: 0.042572463768115854,
  otherPayGrowthToBase: 0.020288334372692035,
  otherHeadcountGrowthToBase: 0.04062500000000005,
  projectSalesGrowth: 0.2202204894083272,
  otherSalesGrowth: 0.06257246376811586,
  projectCogsImprovementAfterBase: 0.015,
  projectPayGrowth: 0.08551097823165817,
  otherPayGrowth: 0.02484645846924027,
  projectHeadcountGrowth: 0.026365165641737756,
  otherHeadcountGrowth: 0.045833333333333386,
  projectSgaRateEnd: 0.015,
  otherSgaRateEnd: 0.005,
  projectOfficerPayGrowth: 0.05383792003047636,
};

const multipleUnmetAdjustedDrivers = {
  ...standardWorkflowAdjustedDrivers,
  projectCogsRateWhenSalesZero: 0.6785088588426177,
  otherCogsRateWhenSalesZero: 0.68,
  projectSalesGrowthToBase: 0.05701754385964919,
  projectCogsImprovementToBase: 3.221017417122367e-17,
  projectPayGrowthToBase: 0.020399859477869334,
  projectHeadcountGrowthToBase: 0.052151386970828356,
  projectSgaImprovementToBase: 0,
  projectOfficerPayGrowthToBase: 0.05409356725146197,
  otherSalesGrowthToBase: 0.040760869565217184,
  otherCogsImprovementToBase: 0,
  otherPayGrowthToBase: 0.020288334372692035,
  otherHeadcountGrowthToBase: 0.04062500000000005,
  otherSgaImprovementToBase: 0,
  projectSalesGrowth: 0.3,
  otherSalesGrowth: 0.06438405797101453,
  projectCogsImprovementAfterBase: 0.015750907796368813,
  otherCogsImprovement: 0.005,
  projectPayGrowth: 0.091796875,
  otherPayGrowth: 0.02484645846924027,
  projectHeadcountGrowth: 0.03718216226939099,
  otherHeadcountGrowth: 0.045833333333333386,
  projectSgaRateEnd: 0.018363537894568176,
  otherSgaRateEnd: 0.005,
  projectOfficerPayGrowth: 0.05375420789063933,
};

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

const emptyFutureCapex = () => {
  return Array.from({ length: DEFAULT_TIMELINE.baseYear + 3 - DEFAULT_TIMELINE.latestYear }, (_, index) => ({
    year: DEFAULT_TIMELINE.latestYear + index + 1,
    value: 0,
  }));
};

const clearFutureCapex = (proposal: ProposalData) => {
  proposal.futureCapex = emptyFutureCapex();
  for (const row of proposal.futureCapex) {
    delete proposal.inputValues?.[inputKey.futureCapex(row.year)];
  }
};

const commonProposal = (title: string, exportedAt: string, historicalPlan: YearPlan[]): ProposalData => {
  historicalPlan = historicalPlan.map((row) => {
    const company = total(row.project, row.other);
    const forecastOrdinary = round(operatingProfit(company) - company.sales * 0.002);
    const forecastPreTax = forecastOrdinary;
    const forecastNet = round(forecastPreTax * 0.7);
    return {
      ...row,
      project: { ...row.project },
      other: {
        ...row.other,
        ordinaryIncome: row.other.ordinaryIncome ?? forecastOrdinary - ordinaryIncome(row.project),
        preTaxIncome: row.other.preTaxIncome ?? forecastPreTax - preTaxIncome(row.project),
        netIncome: row.other.netIncome ?? forecastNet - netIncome(row.project),
      },
    };
  });
  const balanceSheets = retimeBalanceSheets(sampleBalanceSheets, DEFAULT_TIMELINE);
  const capex = emptyFutureCapex();
  const inputValues: InputValues = {};
  historicalPlan.forEach((row) => {
    const company = total(row.project, row.other);
    const companyInputs: Record<string, number> = {
      "2-1": company.sales, "2-3": company.cogs,
      "2-4": cogsDepreciation(company),
      "2-7": company.employeePay + company.officerPay + sgaDepreciation(company) + researchDevelopment(company) + company.otherSga,
      "2-9": officerCompensation(company), "2-10": officerBonus(company),
      "2-12": employeeSalary(company), "2-13": employeeBonus(company),
      "2-14": sgaDepreciation(company), "2-15": researchDevelopment(company),
      "2-18": ordinaryIncome(company) ?? 0, "2-19": preTaxIncome(company) ?? 0,
      "2-20": netIncome(company) ?? 0, "2-27": company.headcount, "2-28": company.officerCount,
    };
    const projectInputs: Record<string, number> = {
      "7-1": row.project.sales, "7-4": row.project.sales - row.project.cogs,
      "7-6": operatingProfit(row.project), "7-8": row.project.employeePay,
      "7-9": row.project.officerPay,
      "P2-4": cogsDepreciation(row.project), "P2-14": sgaDepreciation(row.project),
      "7-13": row.project.headcount, "7-14": row.project.officerCount,
    };
    Object.entries(companyInputs).forEach(([code, value]) => { inputValues[inputKey.companyActual(row.year, code)] = round(value); });
    Object.entries(projectInputs).forEach(([code, value]) => { inputValues[inputKey.projectActual(row.year, code)] = round(value); });
  });
  balanceSheets.forEach((row) => (Object.keys(row) as (keyof typeof row)[]).filter((field) => field !== "year").forEach((field) => { inputValues[inputKey.balanceSheet(row.year, field)] = round(row[field]); }));
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
    moneyUnit: INTERNAL_MONEY_UNIT,
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
  const proposal = commonProposal(
    "成長投資計画 提案計画サンプル",
    exportedAt,
    createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE),
  );
  proposal.drivers = clone(standardWorkflowInitialDrivers);
  proposal.adjustedDrivers = clone(standardWorkflowAdjustedDrivers);
  clearFutureCapex(proposal);
  proposal.driverRanges = clone(standardWorkflowRanges);
  proposal.targets = clone(standardWorkflowTargets);
  proposal.forecastOverrides = clone(standardWorkflowOverrides);
  proposal.futureInputBasis = "other";
  for (const key of Object.keys(standardWorkflowInitialDrivers) as (keyof typeof standardWorkflowInitialDrivers)[]) {
    proposal.inputValues![inputKey.driver(key)] = standardWorkflowInitialDrivers[key];
    proposal.inputValues![inputKey.driverRange(key, 0)] = standardWorkflowRanges[key][0];
    proposal.inputValues![inputKey.driverRange(key, 1)] = standardWorkflowRanges[key][1];
  }
  for (const key of Object.keys(standardWorkflowTargets) as (keyof typeof standardWorkflowTargets)[]) {
    proposal.inputValues![inputKey.target(key, "value")] = round(standardWorkflowTargets[key].value);
    if (standardWorkflowTargets[key].max !== undefined) {
      proposal.inputValues![inputKey.target(key, "max")] = round(standardWorkflowTargets[key].max!);
    }
  }
  proposal.adjustedDrivers = reoptimizeSampleProposal(proposal).drivers;
  return proposal;
}

export function createPartiallyUnmetSampleProposal(exportedAt: string): ProposalData {
  const proposal = createStandardSampleProposal(exportedAt);
  proposal.title = "成長投資計画 一部目標未達サンプル";
  proposal.targets.companyPaySchedule = {
    ...proposal.targets.companyPaySchedule,
    value: 3.5,
  };
  proposal.inputValues![inputKey.target("companyPaySchedule", "value")] = 3.5;
  proposal.adjustedDrivers = reoptimizeSampleProposal(proposal).drivers;
  return proposal;
}

export function createMultipleUnmetSampleProposal(exportedAt: string): ProposalData {
  const proposal = createStandardSampleProposal(exportedAt);
  proposal.title = "成長投資計画 複数目標未達サンプル";
  const unmetTargets = {
    companySalesCagr: 30,
    companyPaySchedule: 3.5,
    projectSalesCagr: 35,
  } as const;
  for (const [key, value] of Object.entries(unmetTargets) as [keyof typeof unmetTargets, number][]) {
    proposal.targets[key] = { ...proposal.targets[key], value };
    proposal.inputValues![inputKey.target(key, "value")] = value;
  }
  proposal.adjustedDrivers = reoptimizeSampleProposal(proposal).drivers;
  return proposal;
}

function applySampleForecastOverrides(plan: YearPlan[], proposal: ProposalData) {
  const result = clone(plan);
  const anchored = new Set<keyof SegmentPlan>();
  for (let index = 3; index < result.length; index += 1) {
    for (const field of ["sales", "employeePay"] as (keyof SegmentPlan)[]) {
      const key = `${result[index].year}:other:${field}`;
      if (Object.prototype.hasOwnProperty.call(proposal.forecastOverrides, key)) {
        result[index].other[field] = round(proposal.forecastOverrides[key]);
        anchored.add(field);
      } else if (anchored.has(field)) {
        const previousAuto = plan[index - 1].other[field];
        const previousEffective = result[index - 1].other[field];
        const currentAuto = plan[index].other[field];
        result[index].other[field] = round(Math.abs(previousAuto) > 1e-9
          ? previousEffective * currentAuto / previousAuto
          : previousEffective + currentAuto - previousAuto);
      }
    }
  }
  let projectPayAnchored = false;
  for (let index = 3; index < result.length; index += 1) {
    const key = `${result[index].year}:project:7-8`;
    if (Object.prototype.hasOwnProperty.call(proposal.forecastOverrides, key)) {
      result[index].project.employeePay = round(proposal.forecastOverrides[key]);
      projectPayAnchored = true;
    } else if (projectPayAnchored) {
      const previousAuto = plan[index - 1].project.employeePay;
      const previousEffective = result[index - 1].project.employeePay;
      const currentAuto = plan[index].project.employeePay;
      result[index].project.employeePay = round(Math.abs(previousAuto) > 1e-9
        ? previousEffective * currentAuto / previousAuto
        : previousEffective + currentAuto - previousAuto);
    }
  }
  return result;
}

export function reoptimizeSampleProposal(proposal: ProposalData) {
  const optimizationTargets = createOptimizationTargets(
    proposal.targets,
    proposal.inputValues ?? {},
    proposal.metricGroupBases ?? defaultMetricGroupBases,
  );
  return runPlanningOptimization({
    drivers: proposal.drivers,
    historicalPlan: proposal.historicalPlan,
    timeline: proposal.timeline,
    optimizationTargets,
    driverRanges: proposal.driverRanges,
    applicationCategory: proposal.applicationCategory ?? "general",
    planTransform: (plan) => applySampleForecastOverrides(plan, proposal),
  });
}

export function createStandardSampleEffectivePlan(proposal: ProposalData) {
  const historical = proposal.historicalPlan;
  const calculationDrivers = proposal.adjustedDrivers ?? proposal.drivers;
  const periodInputs = createForecastProjectPeriodInputs(historical[2], calculationDrivers, proposal.timeline);
  const plan = generatePlan(historical, calculationDrivers, proposal.timeline, periodInputs);
  return applySampleForecastOverrides(plan, proposal);
}

export function createHistoricalOnlySampleProposal(exportedAt: string): ProposalData {
  const proposal = commonProposal(
    "成長投資計画 過去3期入力済みサンプル",
    exportedAt,
    createHistoricalPlan(sampleBasePlan, DEFAULT_TIMELINE),
  );
  return clearFutureSettings(proposal);
}

function clearFutureSettings(proposal: ProposalData): ProposalData {
  proposal.drivers = clone(defaultDrivers);
  proposal.futureCapex = emptyFutureCapex();
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

export function createBaseYearLaunchHistoricalOnlySampleProposal(exportedAt: string): ProposalData {
  const latestCompany = total(sampleBasePlan.project, sampleBasePlan.other);
  const latest: YearPlan = {
    year: DEFAULT_TIMELINE.latestYear,
    role: "latest",
    project: emptySegment(),
    other: latestCompany,
  };
  return clearFutureSettings(commonProposal(
    "成長投資計画 基準年売上開始・過去3期入力済みサンプル",
    exportedAt,
    createHistoricalPlan(latest, DEFAULT_TIMELINE),
  ));
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
    sales: legacyOkuToInternalMoney(60),
    cogs: legacyOkuToInternalMoney(39),
    employeePay: legacyOkuToInternalMoney(4.8),
    officerPay: legacyOkuToInternalMoney(0.3),
    depreciation: legacyOkuToInternalMoney(4.5),
    cogsDepreciation: legacyOkuToInternalMoney(1.13),
    sgaDepreciation: legacyOkuToInternalMoney(3.37),
    otherSga: legacyOkuToInternalMoney(6),
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
  proposal.drivers.projectFirstYearSales = 0;
  proposal.drivers.projectBaseYearSales = launchBase.sales;
  if (proposal.inputValues) {
    proposal.inputValues[inputKey.driver("projectFirstYearSales")] = 0;
    proposal.inputValues[inputKey.driver("projectBaseYearSales")] = launchBase.sales;
    delete proposal.inputValues[inputKey.driver("projectSalesGrowthToBase")];
    delete proposal.inputValues[inputKey.driverRange("projectSalesGrowthToBase", 0)];
    delete proposal.inputValues[inputKey.driverRange("projectSalesGrowthToBase", 1)];
  }

  for (const row of effectivePlan.filter((candidate) => candidate.year > DEFAULT_TIMELINE.latestYear)) {
    const project = row.project;
    Object.assign(proposal.forecastOverrides, {
      [`${row.year}:project:7-1`]: round(project.sales),
      [`${row.year}:project:7-4`]: round(project.sales - project.cogs),
      [`${row.year}:project:7-6`]: round(operatingProfit(project)),
      [`${row.year}:project:7-8`]: round(project.employeePay),
      [`${row.year}:project:7-9`]: round(project.officerPay),
      [`${row.year}:project:P2-4`]: round(cogsDepreciation(project)),
      [`${row.year}:project:P2-14`]: round(sgaDepreciation(project)),
      [`${row.year}:project:7-13`]: round(project.headcount),
      [`${row.year}:project:7-14`]: round(project.officerCount),
    });
  }

  return { proposal, effectivePlan };
}
