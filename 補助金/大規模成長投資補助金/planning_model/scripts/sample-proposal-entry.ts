import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { File } from "node:buffer";
import {
  calculateMetrics,
  createHistoricalPlan,
  DEFAULT_TIMELINE,
  defaultTargets,
  driverBounds,
  generatePlan,
  metrics,
  retimeBalanceSheets,
  sampleBalanceSheets,
  sampleBasePlan,
  sampleDrivers,
} from "../app/model";
import { buildProposalHtml, buildProposalXlsx, parseProposalFile, PROPOSAL_FORMAT, type ProposalData } from "../app/proposal-io";

const outputDirectory = path.resolve(process.cwd(), "examples");
const timeline = { ...DEFAULT_TIMELINE };
const historicalPlan = createHistoricalPlan(sampleBasePlan, timeline);
const effectivePlan = generatePlan(historicalPlan, sampleDrivers, timeline);
const actual = calculateMetrics(effectivePlan, sampleDrivers);
const projectYears = timeline.baseYear - timeline.latestYear;
const futureCapex = Array.from({ length: timeline.baseYear + 3 - timeline.latestYear }, (_, index) => ({
  year: timeline.latestYear + index + 1,
  value: index < projectYears ? sampleDrivers.investment / projectYears : 0,
}));
const proposal: ProposalData = {
  format: PROPOSAL_FORMAT,
  title: "成長投資計画 提案計画サンプル",
  exportedAt: "2026-07-22T00:00:00.000Z",
  timeline,
  historicalPlan,
  balanceSheets: retimeBalanceSheets(sampleBalanceSheets, timeline),
  futureCapex,
  drivers: structuredClone(sampleDrivers),
  driverRanges: structuredClone(driverBounds),
  targets: structuredClone(defaultTargets),
  forecastOverrides: {},
  futureInputBasis: "other",
};
const metricRows = metrics.map((definition) => ({
  label: definition.label,
  unit: definition.unit,
  actual: actual[definition.key],
  target: defaultTargets[definition.key].value,
  max: defaultTargets[definition.key].max,
  policy: defaultTargets[definition.key].policy,
}));

const html = buildProposalHtml({ proposal, effectivePlan, metricRows });
const xlsx = buildProposalXlsx({ proposal, effectivePlan, metricRows });
const importedHtml = await parseProposalFile(new File([html], "sample.html", { type: "text/html" }));
const importedXlsx = await parseProposalFile(new File([xlsx], "sample.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
if (importedHtml.title !== proposal.title || importedXlsx.title !== proposal.title) throw new Error("提案計画の再取込検証に失敗しました。");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル.html"), html, "utf8"),
  writeFile(path.join(outputDirectory, "成長投資計画_提案計画サンプル.xlsx"), xlsx),
]);

console.log(outputDirectory);
