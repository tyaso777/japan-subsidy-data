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
});

test("狭幅では詳細チャートの固定を解除して縦積みにする", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.diagnostic-detail-layout\s*\{[^}]*position:\s*static;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
  );
});

test("年度別数値表は詳細チャートと同じ高さに収める", () => {
  assert.match(
    css,
    /\.diagnostic-values-panel\s*\{[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    css,
    /\.diagnostic-values-table-wrap\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*hidden;/s,
  );
  assert.match(
    css,
    /\.diagnostic-values-panel table\s*\{[^}]*height:\s*100%;[^}]*table-layout:\s*fixed;/s,
  );
  assert.match(
    css,
    /\.diagnostic-values-panel tbody th small\s*\{[^}]*display:\s*inline;[^}]*margin-left:\s*6px;/s,
  );
});

test("固定中の年度別数値表から背後のミニチャートが透けない", () => {
  assert.match(
    css,
    /\.diagnostic-detail-layout\s*\{[^}]*background:\s*var\(--paper\);[^}]*isolation:\s*isolate;/s,
  );
  assert.match(
    css,
    /\.diagnostic-values-panel\s*\{[^}]*background:\s*var\(--panel\);/s,
  );
  assert.doesNotMatch(css, /var\(--surface\)/);
});
