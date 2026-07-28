import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("診断概要は詳細チャートだけを選択ブロック内で固定する", () => {
  assert.match(
    css,
    /\.diagnostic-detail-layout\s*\{[^}]*position:\s*sticky;[^}]*height:\s*clamp\(300px,\s*38vh,\s*420px\);/s,
  );
  assert.match(
    css,
    /\.diagnostic-panel\s*>\s*h3\s*\{[^}]*position:\s*sticky;[^}]*top:\s*46px;/s,
  );
  assert.doesNotMatch(css, /--diagnostic-sticky-chart-height/);
  assert.doesNotMatch(pageSource, /--diagnostic-sticky-chart-height/);
  assert.doesNotMatch(pageSource, /updateStickyChartHeight|selectedChartRef|diagnosticsRef/);
  assert.doesNotMatch(pageSource, /diagnostic-selected-chart/);
  assert.match(
    pageSource,
    /className="diagnostic-overview-block"[\s\S]*?\{selected && <div className="diagnostic-detail-layout"[\s\S]*?<nav className="diagnostic-metric-navigator"/,
  );
  assert.match(pageSource, /querySelectorAll<HTMLButtonElement>\("\.diagnostic-metric-tile"\)/);
  assert.match(pageSource, /getBoundingClientRect\(\)/);
  assert.match(pageSource, /const nearestPrimary = Math\.min/);
  assert.match(pageSource, /Math\.abs\(primaryDelta\) <= nearestPrimary \+ 8/);
  assert.match(pageSource, /data-metric-key=\{key\}/);
});

test("詳細チャートはタブレット幅で固定を維持しスマートフォン幅だけ解除する", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.diagnostic-detail-layout\s*\{[^}]*position:\s*static;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
  );
  assert.doesNotMatch(
    css,
    /@media\s*\(max-width:\s*1100px\)\s*\{\s*\.diagnostic-detail-layout\s*\{[^}]*position:\s*static;/s,
  );
});

test("年度別数値は大チャートの各点へ表示して右表を置かない", () => {
  assert.match(
    pageSource,
    /<TrendChart showPointLabels title=\{selected\.row\.name\}/,
  );
  assert.match(pageSource, /className="trend-chart-point-label"/);
  assert.doesNotMatch(pageSource, /className="diagnostic-values-panel"/);
  assert.doesNotMatch(css, /\.diagnostic-values-panel/);
  assert.match(css, /\.diagnostic-detail-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
});

test("大チャートの凡例をカード内に収めてミニチャートと重ねない", () => {
  assert.match(
    css,
    /\.diagnostic-detail-layout \.trend-chart-card\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    css,
    /\.diagnostic-detail-layout \.trend-chart-svg\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s,
  );
  assert.match(css, /\.diagnostic-detail-layout \.trend-chart-legend\s*\{[^}]*align-self:\s*end;/s);
  assert.match(css, /\.trend-chart-point-label\s*\{[^}]*paint-order:\s*stroke fill;/s);
  assert.doesNotMatch(css, /var\(--surface\)/);
});
