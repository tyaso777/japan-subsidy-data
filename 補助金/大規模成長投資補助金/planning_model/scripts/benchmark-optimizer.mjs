import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const modelSource = await readFile(path.join(projectDirectory, "app", "model.ts"), "utf8");
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const model = commonJsModule.exports;

const clone = (value) => structuredClone(value);
const historical = model.createHistoricalPlan(model.sampleBasePlan, model.DEFAULT_TIMELINE);
const metricDefinitions = Object.fromEntries(model.metrics.map((definition) => [definition.key, definition]));
const tolerance = 1e-12;

const narrowPayBounds = {
  projectPayGrowthToBase: [0.019325330501846927, 0.020735994183189166],
  otherPayGrowthToBase: [0.019139457023717443, 0.020553459914763095],
};

const cases = [];
const addCases = (prefix, metricKey, values, configure = () => {}) => {
  for (const value of values) {
    cases.push({
      name: `${prefix} ${value}`,
      targets: { [metricKey]: value },
      configure,
    });
  }
};

addCases("足下賃上げ率", "companyPaySchedule", [2.3, 2.5, 3, 3.5, 4, 4.5], ({ bounds, initial }) => {
  Object.assign(bounds, clone(narrowPayBounds));
  initial.projectPayGrowthToBase = 0.020030662342518046;
  initial.otherPayGrowthToBase = 0.01984645846924027;
});
addCases("全社売上高CAGR", "companySalesCagr", [16, 18, 20, 22, 24], ({ bounds }) => {
  bounds.projectSalesGrowth = [0.12, 0.24];
  bounds.otherSalesGrowth = [0.02, 0.08];
});
addCases("補助事業売上高CAGR", "projectSalesCagr", [18, 22, 26, 30, 34], ({ bounds }) => {
  bounds.projectSalesGrowth = [0.15, 0.35];
});
addCases("補助事業1人当たり給与CAGR", "employeePayCagr", [5, 6, 7, 8, 9], ({ bounds }) => {
  bounds.projectPayGrowth = [0.045, 0.10];
});
addCases("補助事業労働生産性CAGR", "laborProductivityCagr", [12, 16, 20, 24], ({ bounds }) => {
  bounds.projectSalesGrowth = [0.12, 0.30];
  bounds.projectHeadcountGrowth = [0, 0.08];
  bounds.projectCogsImprovementAfterBase = [0, 0.03];
});
cases.push(
  {
    name: "複合：足下賃上げ3.5・補助事業給与7",
    targets: { companyPaySchedule: 3.5, employeePayCagr: 7 },
    configure: ({ bounds, initial }) => {
      Object.assign(bounds, clone(narrowPayBounds));
      initial.projectPayGrowthToBase = 0.020030662342518046;
      initial.otherPayGrowthToBase = 0.01984645846924027;
    },
  },
  {
    name: "複合：全社売上22・補助事業売上25",
    targets: { companySalesCagr: 22, projectSalesCagr: 25 },
    configure: ({ bounds }) => {
      bounds.projectSalesGrowth = [0.15, 0.30];
      bounds.otherSalesGrowth = [0.02, 0.08];
    },
  },
  {
    name: "複合：生産性21・給与7",
    targets: { laborProductivityCagr: 21, employeePayCagr: 7 },
    configure: ({ bounds }) => {
      bounds.projectSalesGrowth = [0.15, 0.30];
      bounds.projectPayGrowth = [0.05, 0.10];
      bounds.projectHeadcountGrowth = [0, 0.08];
    },
  },
  {
    name: "複合：全社売上21・足下賃上げ3.5",
    targets: { companySalesCagr: 21, companyPaySchedule: 3.5 },
    configure: ({ bounds, initial }) => {
      Object.assign(bounds, clone(narrowPayBounds));
      initial.projectPayGrowthToBase = 0.020030662342518046;
      initial.otherPayGrowthToBase = 0.01984645846924027;
    },
  },
  {
    name: "制度条件：補助事業給与5以上",
    targets: { employeePayCagr: 7 },
    requiredMinimums: { employeePayCagr: 5 },
    configure: ({ bounds }) => {
      bounds.projectPayGrowth = [0.03, 0.08];
    },
  },
);

if (cases.length !== 30) throw new Error(`Expected 30 benchmark cases, received ${cases.length}.`);

const makeTargets = (targetValues) => {
  const targets = clone(model.defaultTargets);
  for (const target of Object.values(targets)) target.policy = "monitor";
  for (const [key, value] of Object.entries(targetValues)) {
    targets[key] = { ...targets[key], value, max: undefined, policy: "hard", weight: 1 };
  }
  return targets;
};

const runCase = (scenario, strategy) => {
  const bounds = clone(model.driverBounds);
  const initial = { ...model.sampleDrivers };
  scenario.configure({ bounds, initial });
  for (const key of Object.keys(bounds)) {
    initial[key] = Math.min(bounds[key][1], Math.max(bounds[key][0], initial[key]));
  }
  const targets = makeTargets(scenario.targets);
  const periodInputs = model.createForecastProjectPeriodInputs(historical.at(-1), initial, model.DEFAULT_TIMELINE);
  const referencePlan = model.generatePlan(historical, initial, model.DEFAULT_TIMELINE, periodInputs);
  const startedAt = performance.now();
  const result = model.optimizeDrivers(
    initial,
    historical,
    model.DEFAULT_TIMELINE,
    targets,
    periodInputs,
    referencePlan,
    bounds,
    true,
    undefined,
    scenario.requiredMinimums ?? {},
    strategy,
  );
  const elapsedMs = performance.now() - startedAt;
  const solvedInputs = model.createForecastProjectPeriodInputs(historical.at(-1), result.drivers, model.DEFAULT_TIMELINE);
  const actual = model.calculateMetrics(model.generatePlan(historical, result.drivers, model.DEFAULT_TIMELINE, solvedInputs), result.drivers);
  const failedTargets = Object.keys(scenario.targets).filter((key) =>
    !model.targetStatus(metricDefinitions[key], actual[key], targets[key]).ok
  );
  const priorityPenalty = result.requiredViolation * 1e12 + result.hardViolation * 1e9 + result.score;
  return { ...result, actual, failedTargets, elapsedMs, priorityPenalty };
};

const compare = (next, legacy, thresholds) => {
  if (next.requiredViolation + thresholds.required < legacy.requiredViolation) return "改善";
  if (legacy.requiredViolation + thresholds.required < next.requiredViolation) return "悪化";
  if (next.hardViolation + thresholds.hard < legacy.hardViolation) return "改善";
  if (legacy.hardViolation + thresholds.hard < next.hardViolation) return "悪化";
  if (next.score + thresholds.score < legacy.score) return "改善";
  if (legacy.score + thresholds.score < next.score) return "悪化";
  return "同等";
};
const strictThresholds = { required: tolerance, hard: tolerance, score: 1e-9 };
const practicalThresholds = { required: tolerance, hard: 0.00001, score: 0.1 };

const rows = [];
for (const [index, scenario] of cases.entries()) {
  const legacy = runCase(scenario, "legacy-fixed-step");
  const next = runCase(scenario, "full-range");
  rows.push({
    index: index + 1,
    scenario,
    legacy,
    next,
    strictJudgement: compare(next, legacy, strictThresholds),
    practicalJudgement: compare(next, legacy, practicalThresholds),
  });
  console.log(`${String(index + 1).padStart(2, "0")}/30 ${rows.at(-1).practicalJudgement} ${scenario.name}`);
}

const strictImproved = rows.filter((row) => row.strictJudgement === "改善").length;
const strictEqual = rows.filter((row) => row.strictJudgement === "同等").length;
const strictWorsened = rows.filter((row) => row.strictJudgement === "悪化").length;
const improved = rows.filter((row) => row.practicalJudgement === "改善").length;
const equal = rows.filter((row) => row.practicalJudgement === "同等").length;
const worsened = rows.filter((row) => row.practicalJudgement === "悪化").length;
const legacyFeasible = rows.filter((row) => row.legacy.hardFeasible).length;
const nextFeasible = rows.filter((row) => row.next.hardFeasible).length;
const totalLegacyPenalty = rows.reduce((sum, row) => sum + row.legacy.priorityPenalty, 0);
const totalNextPenalty = rows.reduce((sum, row) => sum + row.next.priorityPenalty, 0);
const totalLegacyMs = rows.reduce((sum, row) => sum + row.legacy.elapsedMs, 0);
const totalNextMs = rows.reduce((sum, row) => sum + row.next.elapsedMs, 0);
const averageLegacyMs = totalLegacyMs / rows.length;
const averageNextMs = totalNextMs / rows.length;
const maxLegacyMs = Math.max(...rows.map((row) => row.legacy.elapsedMs));
const maxNextMs = Math.max(...rows.map((row) => row.next.elapsedMs));
const speedChange = totalLegacyMs ? (totalNextMs / totalLegacyMs - 1) * 100 : 0;

const number = (value, digits = 6) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const report = `# 最適化ロジック変更前後ベンチマーク

- 実行日時: ${new Date().toISOString()}
- ケース数: ${rows.length}
- 比較方法: 制度必須違反 → 目標違反 → 目的関数の順で辞書式比較
- 厳密比較: 改善 ${strictImproved}件・同等 ${strictEqual}件・悪化 ${strictWorsened}件
- 実務許容差込み: 改善 ${improved}件・同等 ${equal}件・悪化 ${worsened}件
- 目標実現可能: 変更前 ${legacyFeasible}/${rows.length}件 → 変更後 ${nextFeasible}/${rows.length}件
- 制約優先ペナルティ合計: 変更前 ${number(totalLegacyPenalty, 3)} → 変更後 ${number(totalNextPenalty, 3)}
- 実行時間合計: 変更前 ${number(totalLegacyMs / 1000, 2)}秒 → 変更後 ${number(totalNextMs / 1000, 2)}秒
- 実行時間平均: 変更前 ${number(averageLegacyMs / 1000, 2)}秒 → 変更後 ${number(averageNextMs / 1000, 2)}秒
- 最大実行時間: 変更前 ${number(maxLegacyMs / 1000, 2)}秒 → 変更後 ${number(maxNextMs / 1000, 2)}秒
- 変更後の速度差: ${speedChange <= 0 ? `${number(Math.abs(speedChange), 1)}%高速化` : `${number(speedChange, 1)}%低速化`}

制約優先ペナルティは比較用に「制度必須違反×10^12＋目標違反×10^9＋目的関数」として算出しています。小さいほど良好です。
実務許容差は、制度必須違反1e-12、目標違反0.00001、目的関数0.1です。厳密比較上の微差と、採用判断に影響する差を分けています。

| No. | ケース | 厳密 | 実務 | 変更前 必須違反 | 変更後 必須違反 | 変更前 目標違反 | 変更後 目標違反 | 変更前 目的関数 | 変更後 目的関数 | 変更前未達 | 変更後未達 | 旧ms | 新ms |
|---:|---|:---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.map((row) => `| ${row.index} | ${row.scenario.name} | ${row.strictJudgement} | ${row.practicalJudgement} | ${number(row.legacy.requiredViolation)} | ${number(row.next.requiredViolation)} | ${number(row.legacy.hardViolation)} | ${number(row.next.hardViolation)} | ${number(row.legacy.score, 3)} | ${number(row.next.score, 3)} | ${row.legacy.failedTargets.length} | ${row.next.failedTargets.length} | ${number(row.legacy.elapsedMs, 0)} | ${number(row.next.elapsedMs, 0)} |`).join("\n")}
`;

const reportPath = path.join(projectDirectory, "optimizer-benchmark-results.md");
await writeFile(reportPath, report, "utf8");
console.log(`Report: ${reportPath}`);
console.log(`Strict: improved=${strictImproved}, equal=${strictEqual}, worsened=${strictWorsened}`);
console.log(`Practical: improved=${improved}, equal=${equal}, worsened=${worsened}`);
if (worsened > 0) process.exitCode = 1;
