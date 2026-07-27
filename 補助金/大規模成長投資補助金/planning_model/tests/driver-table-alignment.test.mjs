import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, stylesheet] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("forecast-condition grouped headings are centered over their exact columns", () => {
  assert.match(
    pageSource,
    /className="driver-statutory-heading">制度上の必須条件<small>編集不可<\/small>/,
  );
  assert.equal(
    pageSource.match(/colSpan=\{2\} className="driver-period-heading"/g)?.length,
    2,
  );
  assert.equal(
    pageSource.match(/className="driver-bound-heading"/g)?.length,
    4,
  );
  assert.match(
    stylesheet,
    /\.driver-target-table \.driver-statutory-heading, \.driver-target-table \.driver-period-heading, \.driver-target-table \.driver-bound-heading \{ text-align: center !important; \}/,
  );
});

test("statutory condition is placed immediately after the adjustment-condition column", () => {
  assert.match(
    pageSource,
    /<th rowSpan=\{2\}>調整条件<small>C-1～（Condition）<\/small><\/th><th rowSpan=\{2\} className="driver-statutory-heading">制度上の必須条件<small>編集不可<\/small><\/th>\{historicalPlan\.slice\(1\)\.map/,
  );
  assert.match(
    pageSource,
    /<th><span className="driver-item-code">[\s\S]*?<\/th>\s*<td className="statutory-condition">[\s\S]*?<\/td>\s*\{history\.values\.slice\(1\)\.map/,
  );
});

test("statutory condition column is compact and cannot expand into the period inputs", () => {
  assert.match(
    stylesheet,
    /\.driver-target-table th:nth-child\(2\), \.driver-target-table td:nth-child\(2\) \{ width: 105px !important; min-width: 105px !important; max-width: 105px !important; \}/,
  );
});

test("lower and upper bound inputs stay compact enough to remain visually separated", () => {
  assert.match(
    stylesheet,
    /\.driver-target-table input \{ width: 54px; padding: 6px; text-align: right; \}/,
  );
});

test("forecast-condition number inputs hide spinner controls that obscure compact values", () => {
  assert.match(
    stylesheet,
    /\.driver-target-table input\[type="number"\] \{ appearance: textfield; -moz-appearance: textfield; \}/,
  );
  assert.match(
    stylesheet,
    /\.driver-target-table input\[type="number"\]::-webkit-inner-spin-button, \.driver-target-table input\[type="number"\]::-webkit-outer-spin-button \{ -webkit-appearance: none; margin: 0; \}/,
  );
});

test("forecast-condition controls are centered in their cells while numbers remain right aligned", () => {
  assert.match(
    stylesheet,
    /\.driver-target-table \.driver-period-range \{ text-align: center; \}/,
  );
  assert.match(
    stylesheet,
    /\.driver-period-range-grid input \{ justify-self: center; margin: 0; text-align: right; \}/,
  );
});

test("optimization result spans both lower and upper bound columns", () => {
  assert.match(
    pageSource,
    /<td className="driver-period-range" colSpan=\{2\}>[\s\S]*?<div className="driver-period-range-grid">[\s\S]*?許容下限[\s\S]*?許容上限[\s\S]*?<small className="adjusted-value">結果 /,
  );
  assert.match(
    stylesheet,
    /\.driver-period-range-grid \.adjusted-value \{ grid-column: 1 \/ -1; display: block; margin-top: var\(--space-1\); text-align: center; \}/,
  );
});

test("invalid lower and upper bounds are announced immediately on the affected pair", () => {
  assert.match(
    pageSource,
    /const orderingError = driverRangeOrderingFailure\(rawLower, rawUpper\)/,
  );
  assert.match(
    pageSource,
    /const requirementError = driverRangeRequirementFailure\(key, applicationCategory, rawLower\)/,
  );
  assert.equal(
    pageSource.match(/aria-invalid=\{rangeError \? "true" : undefined\}/g)?.length,
    2,
  );
  assert.match(
    pageSource,
    /<small className="field-error driver-range-error" role="alert">\{rangeError\}<\/small>/,
  );
  assert.match(pageSource, /className="driver-statutory-floor"/);
  assert.match(pageSource, /className="driver-review-note"/);
  assert.match(
    stylesheet,
    /\.driver-period-range-grid \.driver-range-error \{ grid-column: 1 \/ -1;/,
  );
});

test("driver review guidance stays in the statutory-condition column instead of overlapping range inputs", () => {
  assert.doesNotMatch(
    pageSource,
    /const reviewNote = driverReviewNote\(key\)/,
  );
  assert.match(
    pageSource,
    /const reviewNotes = \[\.\.\.new Set\(keys\.map\(\(key\) => driverReviewNote\(key\)\)/,
  );
  assert.match(
    pageSource,
    /<td className="statutory-condition">[\s\S]*?\{reviewNotes\.map\(\(note\) => <small className="driver-review-note"/,
  );
  assert.match(
    stylesheet,
    /\.driver-target-table \.statutory-condition \.driver-review-note \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/,
  );
  assert.doesNotMatch(
    stylesheet,
    /\.driver-period-range-grid \.driver-review-note/,
  );
});

test("zero-history project sales amount is a separate row above the growth-rate row", () => {
  const amountRowIndex = pageSource.indexOf('className="driver-adjustable project-launch-sales-row"');
  const amountCodeIndex = pageSource.indexOf("C-1A／C-1B:", amountRowIndex);
  const firstYearRangeIndex = pageSource.indexOf('renderDriverPeriodCells("projectFirstYearSales")', amountCodeIndex);
  const baseYearRangeIndex = pageSource.indexOf('renderDriverPeriodCells("projectBaseYearSales")', firstYearRangeIndex);
  const growthRowIndex = pageSource.indexOf("const growthRow =", baseYearRangeIndex);
  assert.ok(amountRowIndex >= 0, "補助事業売上高の範囲入力行が必要");
  assert.ok(amountCodeIndex > amountRowIndex, "範囲入力行にはC-1A／C-1Bを表示する");
  assert.ok(firstYearRangeIndex > amountCodeIndex, "設備導入期間の下限・上限には設備導入初年度売上高を置く");
  assert.ok(baseYearRangeIndex > firstYearRangeIndex, "基準年度側の下限・上限には基準年度売上高を置く");
  assert.ok(growthRowIndex > baseYearRangeIndex, "売上高入力行を売上成長率行より上に置く");
  assert.match(
    pageSource,
    /const codes = launchSalesGrowthRow[\s\S]*?\? "C-1／C-9"/,
  );
  assert.doesNotMatch(pageSource, /C-1A／C-1B／C-9/);
  assert.doesNotMatch(pageSource, /0始まりではCAGRを計算できません/);
});

test("zero-history project sales anchors are adjustable within their own ranges", () => {
  const adjustableStart = pageSource.indexOf("const adjustableDriverKeys:");
  const adjustableEnd = pageSource.indexOf("];", adjustableStart);
  const adjustableBlock = pageSource.slice(adjustableStart, adjustableEnd);
  const fixedStart = pageSource.indexOf("const fixedForecastDriverKeys");
  const fixedEnd = pageSource.indexOf("]);", fixedStart);
  const fixedBlock = pageSource.slice(fixedStart, fixedEnd);
  assert.match(adjustableBlock, /"projectFirstYearSales"[\s\S]*?"projectBaseYearSales"/);
  assert.doesNotMatch(fixedBlock, /"projectFirstYearSales"|"projectBaseYearSales"/);
});

test("base-business officer pay growth is range-adjustable in both forecast periods", () => {
  const adjustableStart = pageSource.indexOf("const adjustableDriverKeys:");
  const adjustableEnd = pageSource.indexOf("];", adjustableStart);
  const adjustableBlock = pageSource.slice(adjustableStart, adjustableEnd);
  const fixedStart = pageSource.indexOf("const fixedForecastDriverKeys");
  const fixedEnd = pageSource.indexOf("]);", fixedStart);
  const fixedBlock = pageSource.slice(fixedStart, fixedEnd);
  const statisticalStart = pageSource.indexOf("const equipmentPeriodStatisticalKeys");
  const statisticalEnd = pageSource.indexOf("]);", statisticalStart);
  const statisticalBlock = pageSource.slice(statisticalStart, statisticalEnd);

  assert.match(adjustableBlock, /"otherOfficerPayGrowthToBase"/);
  assert.match(adjustableBlock, /"otherOfficerPayGrowth"/);
  assert.doesNotMatch(fixedBlock, /"otherOfficerPayGrowthToBase"|"otherOfficerPayGrowth"/);
  assert.match(statisticalBlock, /"otherOfficerPayGrowthToBase"/);
});

test("fixed forecast-condition header keeps its two-row layout and centering", () => {
  assert.match(
    pageSource,
    /overlay\.classList\.toggle\("driver-target-table", wrapper\.classList\.contains\("driver-target-table"\)\)/,
  );
  assert.match(
    pageSource,
    /const sourceRows = Array\.from\(header\.rows\)[\s\S]*?overlayRows\[index\]\.style\.height = `\$\{rowHeight\}px`/,
  );
  assert.doesNotMatch(
    stylesheet,
    /\.page-sticky-header-overlay thead th \{[^}]*height:\s*56px/,
  );
});
