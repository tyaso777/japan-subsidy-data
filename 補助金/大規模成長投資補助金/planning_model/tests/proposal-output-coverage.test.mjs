import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";

const projectDirectory = new URL("../", import.meta.url);
const proposalIo = await import(new URL(".proposal-io-test-runtime.mjs", projectDirectory));
const sampleRuntime = await import(new URL(".sample-proposal-test-runtime.mjs", projectDirectory));

const exportedAt = "2026-07-27T00:00:00.000Z";

const exportContext = () => {
  const proposal = sampleRuntime.createStandardSampleProposal(exportedAt);
  const effectivePlan = sampleRuntime.createStandardSampleEffectivePlan(proposal);
  return { proposal, effectivePlan, metricRows: [] };
};

const requiredOutputLabels = [
  "貸借対照表等",
  "会社全体にかかる損益計算書",
  "補助事業にかかる収支計画",
  "ベース事業にかかる損益計算書",
  "15指標",
  "調整条件と根拠",
  "未入力",
  "暫定値",
  "診断チャート",
  "妥当性チェック",
  "使用単位",
  "入力値",
  "自動計算値",
  "最適化結果",
];

test("customer-facing proposal HTML covers every required output area and value state", () => {
  const html = proposalIo.buildProposalHtml(exportContext());

  for (const label of requiredOutputLabels) {
    assert.match(html, new RegExp(label), `HTML output is missing: ${label}`);
  }
});

test("customer-facing proposal Excel covers every required output area and value state", () => {
  const xlsx = proposalIo.buildProposalXlsx(exportContext());
  const files = unzipSync(xlsx);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const worksheets = Object.entries(files)
    .filter(([path]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .map(([, contents]) => strFromU8(contents))
    .join("\n");
  const packageText = `${workbook}\n${worksheets}`;

  for (const label of requiredOutputLabels) {
    assert.match(packageText, new RegExp(label), `Excel output is missing: ${label}`);
  }
});

test("whole-company-as-project output omits base-business sections and comparison diagnostics", () => {
  const context = exportContext();
  context.proposal.businessSegmentationMode = "wholeCompanyAsProject";

  const html = proposalIo.buildProposalHtml(context);
  assert.doesNotMatch(html, /<h2>ベース事業にかかる損益計算書（P\/L）<\/h2>/);
  assert.doesNotMatch(html, /基本指標による妥当性チェック｜5\. 補助事業とベース事業の比較/);

  const files = unzipSync(proposalIo.buildProposalXlsx(context));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.doesNotMatch(workbook, /name="ベース事業PL"/);
});
