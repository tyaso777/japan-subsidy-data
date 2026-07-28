import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.resolve(testDirectory, "../app/chart-label-layout.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const commonJsModule = { exports: {} };
new Function("module", "exports", compiled)(commonJsModule, commonJsModule.exports);
const { layoutChartPointLabels } = commonJsModule.exports;

const bounds = { left: 0, top: 0, right: 200, bottom: 120 };
const overlaps = (left, right) =>
  left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;

test("折線が上側を横切る点では数値ラベルを下側へ逃がす", () => {
  const [label] = layoutChartPointLabels(
    [{ id: "a", x: 100, y: 60, text: "10.0", seriesIndex: 0, pointIndex: 1, anchor: "middle" }],
    [{ x1: 70, y1: 60, x2: 130, y2: 28 }],
    bounds,
  );

  assert.ok(label.labelY > 60);
  assert.equal(label.needsBackground, false);
});

test("同じ位置に近い複数系列の数値ラベルを重ならない候補へ分ける", () => {
  const labels = layoutChartPointLabels(
    [
      { id: "a", x: 100, y: 60, text: "10.0", seriesIndex: 0, pointIndex: 1, anchor: "middle" },
      { id: "b", x: 100, y: 61, text: "10.1", seriesIndex: 1, pointIndex: 1, anchor: "middle" },
    ],
    [],
    bounds,
  );

  assert.equal(overlaps(labels[0].box, labels[1].box), false);
  assert.equal(labels.some((label) => label.needsBackground), false);
});

test("チャート上端に近い数値ラベルはプロット範囲内に配置する", () => {
  const [label] = layoutChartPointLabels(
    [{ id: "a", x: 100, y: 4, text: "12.3", seriesIndex: 0, pointIndex: 1, anchor: "middle" }],
    [],
    bounds,
  );

  assert.ok(label.box.top >= bounds.top);
  assert.ok(label.box.bottom <= bounds.bottom);
  assert.ok(label.labelY > 4);
});

test("ラベルから遠く離れた同一直線上の線分を衝突とみなさない", () => {
  const [label] = layoutChartPointLabels(
    [{ id: "a", x: 100, y: 60, text: "10.0", seriesIndex: 0, pointIndex: 1, anchor: "middle" }],
    [{ x1: 0, y1: 48, x2: 10, y2: 48 }],
    bounds,
  );

  assert.ok(label.labelY < 60);
  assert.equal(label.needsBackground, false);
});
