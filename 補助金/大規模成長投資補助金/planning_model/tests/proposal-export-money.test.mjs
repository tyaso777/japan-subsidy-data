import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";

const projectDirectory = new URL("../", import.meta.url);
const proposalIo = await import(new URL(".proposal-io-test-runtime.mjs", projectDirectory));
const sampleRuntime = await import(new URL(".sample-proposal-test-runtime.mjs", projectDirectory));

const exportedAt = "2026-07-27T00:00:00.000Z";
const exactCanonicalAmount = 1_228_817;

const exportContext = () => {
  const proposal = sampleRuntime.createStandardSampleProposal(exportedAt);
  const effectivePlan = sampleRuntime.createStandardSampleEffectivePlan(proposal);
  effectivePlan[0].project.sales = exactCanonicalAmount;
  effectivePlan[0].other.sales = 0;
  return { proposal, effectivePlan, metricRows: [] };
};

test("proposal HTML converts canonical yen to the displayed thousand-yen unit", () => {
  const html = proposalIo.buildProposalHtml(exportContext());

  assert.match(html, />1,229 千円</);
});

test("proposal Excel converts canonical yen to an exact thousand-yen numeric value", () => {
  const xlsx = proposalIo.buildProposalXlsx(exportContext());
  const files = unzipSync(xlsx);
  const companySheet = strFromU8(files["xl/worksheets/sheet3.xml"]);

  assert.match(companySheet, /<v>1228\.817<\/v>/);
});
