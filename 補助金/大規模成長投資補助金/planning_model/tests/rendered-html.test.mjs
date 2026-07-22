import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the planning model shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="ja">/i);
  assert.match(html, /<title>成長投資計画 数値設計ラボ<\/title>/i);
  assert.match(html, /成長投資計画 数値設計ラボ/);
  assert.doesNotMatch(html, /目標に近づける/);
  assert.match(html, /15指標・目標/);
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(pageSource, /設定した目標に近づける/);
  assert.match(pageSource, /projectSalesGrowth: \{ initial: 0\.22, lower: 0\.15, upper: 0\.30 \}/);
  assert.match(pageSource, /projectPayGrowth: \{ initial: 0\.07, lower: 0\.05, upper: 0\.10 \}/);
  assert.match(pageSource, /projectCogsImprovementAfterBase: \{ initial: 0\.015, lower: 0, upper: 0\.02 \}/);
  assert.doesNotMatch(pageSource, /原価率改善 1\.5pt［-2～5pt］/);
  assert.match(pageSource, /5ji_median\.pdf/);
  assert.match(pageSource, /補助事業1人当たり給与支給総額の年平均上昇率/);
  assert.doesNotMatch(pageSource, /1人給与成長率|1人給与伸び/);
  assert.match(pageSource, /その他販管費率改善ポイント/);
  assert.match(pageSource, /各期率＋前年差改善pt/);
  assert.match(pageSource, /<strong>\{improvementLabel\}<\/strong><small>当期率/);
  assert.match(pageSource, /actuals-three-year-table/);
  assert.match(pageSource, /content-stack history-actuals-view/);
  assert.match(pageSource, /function roundedInput\(value: number, digits = 2\)/);
  assert.match(pageSource, /上書き内容を反映して再最適化/);
  assert.match(pageSource, /15指標・目標へ戻る/);
  assert.doesNotMatch(pageSource, /function solveAndOpenAnnualPl\(\)/);
  assert.doesNotMatch(pageSource, /toFixed\(6\)/);
  assert.match(globalStyles, /actuals-three-year-table \{ overflow-x: hidden; overflow-y: auto; \}/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
