import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { File } from "node:buffer";
import {
  calculateMetrics,
  generatePlan,
  metrics,
} from "../app/model";
import { buildProposalHtml, buildProposalXlsx, parseProposalFile, type ProposalData } from "../app/proposal-io";
import { createBaseYearLaunchSample, createStandardSampleEffectivePlan, createStandardSampleProposal } from "../app/sample-proposals";

const outputDirectory = path.resolve(process.cwd(), "examples");
const exportedAt = "2026-07-22T00:00:00.000Z";
const standardProposal = createStandardSampleProposal(exportedAt);
const launchSample = createBaseYearLaunchSample(exportedAt);

async function buildAndVerify(proposal: ProposalData, effectivePlan: ReturnType<typeof generatePlan>, baseName: string) {
  const actual = calculateMetrics(effectivePlan, proposal.drivers);
  const metricRows = metrics.map((definition) => ({
    label: definition.label,
    unit: definition.unit,
    actual: actual[definition.key],
    target: proposal.targets[definition.key].value,
    max: proposal.targets[definition.key].max,
    policy: proposal.targets[definition.key].policy,
  }));
  const html = buildProposalHtml({ proposal, effectivePlan, metricRows });
  const xlsx = buildProposalXlsx({ proposal, effectivePlan, metricRows });
  const importedHtml = await parseProposalFile(new File([html], `${baseName}.html`, { type: "text/html" }));
  const importedXlsx = await parseProposalFile(new File([xlsx], `${baseName}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  if (importedHtml.title !== proposal.title || importedXlsx.title !== proposal.title) throw new Error(`${proposal.title}の再取込検証に失敗しました。`);
  return { html, xlsx };
}

const standardPlan = createStandardSampleEffectivePlan(standardProposal);
const standardActuals = calculateMetrics(standardPlan, standardProposal.drivers);
const standardRequiredTargets = [
  "companySalesCagr",
  "companyPaySchedule",
  "projectSalesShare",
  "projectSalesCagr",
  "laborProductivityCagr",
  "employeePayCagr",
  "investmentSalesRatio",
  "valueAddedSubsidyRatio",
] as const;
for (const key of standardRequiredTargets) {
  const actual = standardActuals[key];
  const target = standardProposal.targets[key].value;
  if (!Number.isFinite(actual) || actual + 1e-8 < target) {
    throw new Error(
      `標準提案の再最適化結果が目標未達です: ${key}（計画値 ${actual} / 目標値 ${target}）`,
    );
  }
}
const standardOutput = await buildAndVerify(standardProposal, standardPlan, "成長投資計画_提案計画サンプル");
const launchOutput = await buildAndVerify(launchSample.proposal, launchSample.effectivePlan, "成長投資計画_提案計画サンプル_基準年売上開始");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル.html"), standardOutput.html, "utf8"),
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル.xlsx"), standardOutput.xlsx),
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル_基準年売上開始.html"), launchOutput.html, "utf8"),
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル_基準年売上開始.xlsx"), launchOutput.xlsx),
]);

console.log(outputDirectory);
