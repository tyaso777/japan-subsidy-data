"""Build a self-contained HTML view of the expanded matched-pair analysis."""

from __future__ import annotations

import csv
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
PAIR_PATH = HERE / "expanded_matched_pair_review.csv"
FACTOR_PATH = HERE / "expanded_pair_factor_summary.csv"
SUMMARY_PATH = HERE / "expanded_pair_summary.json"
OUTPUT_PATH = HERE / "expanded_matched_pair_dashboard.html"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def number(value: str) -> float | None:
    if value == "":
        return None
    return float(value)


def integer(value: str) -> int:
    return int(value)


def compact_data() -> dict[str, object]:
    pair_rows = read_csv(PAIR_PATH)
    factor_rows = read_csv(FACTOR_PATH)
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    pairs = []
    score_fields = (
        "demand",
        "constraint",
        "transformation",
        "regional",
        "execution",
        "strategic",
    )
    for row in pair_rows:
        pair = {
            "id": row["pair_id"],
            "round": row["round"],
            "industry": row["industry"],
            "interpretation": row["pair_interpretation"],
            "confidence": row["coding_confidence"],
        }
        for source_side, target_side in (("lower", "low"), ("higher", "high")):
            pair[target_side] = {
                "company": row[f"{source_side}_company"],
                "quant": number(row[f"{source_side}_quantitative_score"]),
                "qual": integer(row[f"{source_side}_qualitative_total"]),
                "cost": number(row[f"{source_side}_project_cost_oku"]),
                "subsidy": number(row[f"{source_side}_subsidy_oku"]),
                "strong": row[f"{source_side}_strong_factors"],
                "evidence": row[f"{source_side}_evidence"],
                "pdf": row[f"{source_side}_pdf_url"],
                "scores": {
                    field: integer(row[f"{source_side}_{field}"])
                    for field in score_fields
                },
            }
        pairs.append(pair)
    factors = [
        {
            "key": row["factor"],
            "label": row["factor_ja"],
            "low": number(row["lower_strong_share"]),
            "high": number(row["higher_strong_share"]),
            "low3": number(row["lower_score3_share"]),
            "high3": number(row["higher_score3_share"]),
            "p": number(row["paired_sign_test_p"]),
        }
        for row in factor_rows
    ]
    return {"summary": summary, "factors": factors, "pairs": pairs}


TEMPLATE = r'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>採択企業40ペア・定性補完要因分析</title>
<style>
:root {
  color-scheme: light dark;
  --background: #f5f7fb;
  --foreground: #172033;
  --card: #ffffff;
  --card-foreground: #172033;
  --muted: #e9edf4;
  --muted-foreground: #5d687b;
  --border: #d8dee9;
  --primary: #17365d;
  --primary-foreground: #ffffff;
  --accent: #e7f0fb;
  --accent-foreground: #17365d;
  --ring: #3877bd;
  --viz-series-1: #2f6fb3;
  --viz-series-2: #e8792e;
  --viz-series-3: #238b7e;
  --viz-series-4: #8b5bb5;
  --destructive: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #111722;
    --foreground: #edf2f8;
    --card: #192231;
    --card-foreground: #edf2f8;
    --muted: #263244;
    --muted-foreground: #b1bccb;
    --border: #344155;
    --primary: #d8e8fb;
    --primary-foreground: #10223a;
    --accent: #263d58;
    --accent-foreground: #edf4fc;
    --ring: #8ab4e5;
    --viz-series-1: #72a7df;
    --viz-series-2: #f2a15f;
    --viz-series-3: #61bbae;
    --viz-series-4: #b79add;
    --destructive: #ff9088;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;
  font-size: 15px;
  line-height: 1.6;
}
a { color: var(--viz-series-1); }
button, select { font: inherit; }
button:focus-visible, select:focus-visible, [tabindex]:focus-visible {
  outline: 3px solid var(--ring);
  outline-offset: 2px;
}
.page { max-width: 1360px; margin: 0 auto; padding: 28px 24px 56px; }
.hero { margin-bottom: 22px; }
h1 { margin: 0 0 8px; font-size: clamp(1.5rem, 3vw, 2.25rem); line-height: 1.25; font-weight: 500; }
h2 { margin: 0 0 14px; font-size: 1.25rem; font-weight: 500; }
h3 { margin: 0 0 10px; font-size: 1rem; font-weight: 500; }
p { margin: 0; }
.lede { max-width: 980px; color: var(--muted-foreground); }
.viz-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
}
.viz-stat-label { color: var(--muted-foreground); }
.viz-stat-value { margin-top: 3px; font-size: 1.8rem; line-height: 1.2; font-weight: 500; }
.viz-stat-context { margin-top: 5px; color: var(--muted-foreground); font-size: .88rem; }
.section { margin-top: 30px; }
.section-head { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
.section-note { color: var(--muted-foreground); font-size: .88rem; }
.legend { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted-foreground); font-size: .88rem; }
.legend-item { display: inline-flex; align-items: center; gap: 7px; }
.legend-mark { width: 12px; height: 12px; display: inline-block; background: var(--viz-series-1); border-radius: 50%; }
.legend-mark.high { background: var(--viz-series-2); border-radius: 2px; transform: rotate(45deg); }
.chart-wrap { width: 100%; overflow: hidden; }
.chart-wrap svg { display: block; width: 100%; height: auto; }
.chart-grid { stroke: var(--border); stroke-width: 1; }
.chart-axis { stroke: var(--muted-foreground); stroke-width: 1; }
.chart-label { fill: var(--foreground); font-size: 13px; }
.chart-muted { fill: var(--muted-foreground); font-size: 12px; }
.series-low { fill: var(--viz-series-1); }
.series-high { fill: var(--viz-series-2); }
.pair-link { stroke: var(--primary); stroke-width: 2; opacity: .7; }
.point { cursor: pointer; transition: opacity .16s ease, transform .16s ease; }
.point:not(.selected) { opacity: .58; }
.point:hover, .point:focus { opacity: 1; }
.point.selected { opacity: 1; stroke: var(--foreground); stroke-width: 2.5; }
.controls { display: flex; align-items: end; gap: 14px; flex-wrap: wrap; margin: 18px 0; }
.field { display: grid; gap: 5px; min-width: min(100%, 440px); }
.field label { color: var(--muted-foreground); font-size: .88rem; }
.field select {
  width: 100%;
  padding: 9px 34px 9px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--card-foreground);
}
.pair-meta { color: var(--muted-foreground); font-size: .88rem; }
.pair-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.company-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 13px; }
.company-role { color: var(--muted-foreground); font-size: .82rem; }
.company-name { font-size: 1.08rem; font-weight: 500; }
.quant-badge { white-space: nowrap; padding: 3px 8px; border-radius: 999px; background: var(--muted); color: var(--foreground); font-size: .82rem; }
.score-list { display: grid; gap: 8px; margin: 14px 0; }
.score-row { display: grid; grid-template-columns: 155px minmax(80px, 1fr) 26px; gap: 9px; align-items: center; font-size: .86rem; }
.score-track { height: 8px; border-radius: 999px; background: var(--muted); overflow: hidden; }
.score-fill { height: 100%; background: var(--viz-series-1); }
.company-high .score-fill { background: var(--viz-series-2); }
.evidence { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.evidence-label { color: var(--muted-foreground); font-size: .82rem; }
.company-actions { margin-top: 12px; }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--card-foreground);
  text-decoration: none;
}
.interpretation { margin-top: 14px; padding: 14px 16px; border-left: 4px solid var(--viz-series-3); background: var(--accent); color: var(--accent-foreground); }
.method { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.method ul { margin: 8px 0 0; padding-left: 1.25rem; }
.method li + li { margin-top: 5px; }
.warning { color: var(--destructive); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 820px) {
  .page { padding: 20px 14px 42px; }
  .viz-grid, .pair-grid, .method { grid-template-columns: 1fr; }
  .score-row { grid-template-columns: 130px minmax(70px, 1fr) 24px; }
  .chart-label { font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .point { transition: none; } }
</style>
</head>
<body>
<main class="page" id="analysis-app">
  <header class="hero">
    <h1>採択企業40ペア・定性補完要因分析</h1>
    <p class="lede">同一公募回・同一業種・近い投資規模で、公開定量スコアに差がある採択企業を比較。数値が低い企業に、どのような案件固有の強みがあるかを公開PDFから確認しました。</p>
  </header>

  <section class="viz-grid" aria-label="主要結果">
    <div class="card">
      <div class="viz-stat-label">精査規模</div>
      <div class="viz-stat-value" id="sample-stat"></div>
      <div class="viz-stat-context">企業重複なし・1〜4次</div>
    </div>
    <div class="card">
      <div class="viz-stat-label">低定量側・厳格3点が2要因以上</div>
      <div class="viz-stat-value" id="strict-stat"></div>
      <div class="viz-stat-context">旧5ペアを除いても26/35件</div>
    </div>
    <div class="card">
      <div class="viz-stat-label">低定量側・能力制約／構造転換</div>
      <div class="viz-stat-value">各39/40</div>
      <div class="viz-stat-context">いずれも97.5%</div>
    </div>
  </section>

  <section class="section" aria-labelledby="factor-title">
    <div class="section-head">
      <div>
        <h2 id="factor-title">6要因の出現頻度</h2>
        <p class="section-note">2点以上＝案件固有の根拠あり。両側とも採択企業です。</p>
      </div>
      <div class="legend" aria-label="系列凡例">
        <span class="legend-item"><span class="legend-mark"></span>公開定量スコア低位</span>
        <span class="legend-item"><span class="legend-mark high"></span>公開定量スコア高位</span>
      </div>
    </div>
    <div class="chart-wrap" id="factor-chart"></div>
  </section>

  <section class="section" aria-labelledby="scatter-title">
    <div class="section-head">
      <div>
        <h2 id="scatter-title">公開定量スコアと定性6要因合計</h2>
        <p class="section-note">点を選ぶと同じペアの企業情報を表示します。定性合計は0〜18点。</p>
      </div>
      <div class="legend" aria-label="点の凡例">
        <span class="legend-item"><span class="legend-mark"></span>低位側</span>
        <span class="legend-item"><span class="legend-mark high"></span>高位側</span>
      </div>
    </div>
    <div class="chart-wrap" id="scatter-chart"></div>
  </section>

  <section class="section" aria-labelledby="pair-title">
    <div class="section-head">
      <div>
        <h2 id="pair-title">ペア別の根拠</h2>
        <p class="section-note">6要因の評点、根拠要約、企業別公式PDFを確認できます。</p>
      </div>
    </div>
    <div class="controls">
      <div class="field">
        <label for="pair-select">表示するペア</label>
        <select id="pair-select"></select>
      </div>
      <div class="pair-meta" id="pair-meta"></div>
    </div>
    <div class="pair-grid" id="pair-detail"></div>
    <p class="interpretation" id="pair-interpretation"></p>
  </section>

  <section class="section method" aria-label="読み方と限界">
    <div>
      <h2>この結果から言えること</h2>
      <ul>
        <li>低定量側でも、能力制約・構造転換を中心に案件固有の強みが確認できました。</li>
        <li>中央値未満を補うには、一般論ではなく顧客、数量、設備、地域供給網などの証拠が必要です。</li>
        <li>実行確度は高定量側のほうが強く、用地・認証・実証・資金・立上げ計画が差になり得ます。</li>
      </ul>
    </div>
    <div>
      <h2>解釈上の限界</h2>
      <ul>
        <li class="warning">採択企業同士の比較であり、採択確率や因果効果を推定したものではありません。</li>
        <li>公開PDFは採択理由書ではなく、審査時資料が編集・要約されている可能性があります。</li>
        <li>評点は0〜3点の目視符号化。代表8社は公式PDF原画面とも照合しました。</li>
      </ul>
    </div>
  </section>
</main>
<script>
const DATA = __DATA_JSON__;
const FACTOR_LABELS = {
  demand: "需要根拠の具体性",
  constraint: "能力制約の明確さ",
  transformation: "事業・工程の構造転換",
  regional: "地域供給網・代替困難性",
  execution: "実行確度",
  strategic: "政策・戦略分野との整合"
};
const app = document.getElementById("analysis-app");
const pairSelect = document.getElementById("pair-select");
let selectedPairId = DATA.pairs[0].id;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
})[char]);
const fmtPct = (value) => `${(value * 100).toFixed(1)}%`;
const fmtNum = (value, digits = 2) => value == null ? "—" : Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });
const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

function renderStats() {
  document.getElementById("sample-stat").textContent = `${DATA.summary.pair_count}ペア・${DATA.summary.company_count}社`;
  document.getElementById("strict-stat").textContent = `${DATA.summary.lower_core_score3_two_or_more_count}/40`;
}

function renderFactorChart() {
  const compact = window.innerWidth < 620;
  const width = compact ? 390 : 1120;
  const height = compact ? 372 : 356;
  const left = compact ? 118 : 238;
  const right = compact ? 66 : 72;
  const top = compact ? 28 : 30;
  const rowH = compact ? 52 : 48;
  const plotW = width - left - right;
  const mobileLabels = {
    demand: "需要根拠", constraint: "能力制約", transformation: "構造転換",
    regional: "地域代替性", execution: "実行確度", strategic: "政策整合"
  };
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "factor-svg-title factor-svg-desc" });
  const title = svgEl("title", { id: "factor-svg-title" });
  title.textContent = "低定量側と高定量側の定性要因出現頻度";
  const desc = svgEl("desc", { id: "factor-svg-desc" });
  desc.textContent = "能力制約と構造転換は低定量側でも97.5%。需要根拠は70%、地域性は77.5%。";
  svg.append(title, desc);
  (compact ? [0, .5, 1] : [0, .25, .5, .75, 1]).forEach((tick) => {
    const x = left + tick * plotW;
    svg.appendChild(svgEl("line", { x1: x, y1: top, x2: x, y2: height - 28, class: "chart-grid" }));
    const label = svgEl("text", { x, y: height - 8, "text-anchor": "middle", class: "chart-muted" });
    label.textContent = `${tick * 100}%`;
    svg.appendChild(label);
  });
  DATA.factors.forEach((factor, index) => {
    const y = top + index * rowH + 8;
    const label = svgEl("text", { x: left - 14, y: y + 15, "text-anchor": "end", class: "chart-label" });
    label.textContent = compact ? mobileLabels[factor.key] : factor.label;
    svg.appendChild(label);
    const lowW = factor.low * plotW;
    const highW = factor.high * plotW;
    svg.appendChild(svgEl("rect", { x: left, y, width: lowW, height: 14, rx: 3, class: "series-low" }));
    svg.appendChild(svgEl("rect", { x: left, y: y + 18, width: highW, height: 14, rx: 3, class: "series-high" }));
    const lowText = svgEl("text", compact
      ? { x: width - 4, y: y + 11, "text-anchor": "end", class: "chart-label" }
      : { x: Math.min(left + lowW + 8, width - 34), y: y + 11, class: "chart-label" });
    lowText.textContent = fmtPct(factor.low);
    const highText = svgEl("text", compact
      ? { x: width - 4, y: y + 29, "text-anchor": "end", class: "chart-label" }
      : { x: Math.min(left + highW + 8, width - 34), y: y + 29, class: "chart-label" });
    highText.textContent = fmtPct(factor.high);
    svg.append(lowText, highText);
  });
  const wrap = document.getElementById("factor-chart");
  wrap.replaceChildren(svg);
}

function pointData() {
  return DATA.pairs.flatMap((pair) => [
    { pairId: pair.id, side: "low", company: pair.low.company, x: pair.low.quant, y: pair.low.qual },
    { pairId: pair.id, side: "high", company: pair.high.company, x: pair.high.quant, y: pair.high.qual }
  ]);
}

function renderScatter() {
  const compact = window.innerWidth < 620;
  const width = compact ? 390 : 1120;
  const height = compact ? 382 : 472;
  const left = compact ? 46 : 72;
  const right = compact ? 12 : 34;
  const top = compact ? 18 : 24;
  const bottom = compact ? 58 : 68;
  const plotW = width - left - right, plotH = height - top - bottom;
  const points = pointData();
  const xs = points.map((d) => d.x);
  const xMin = Math.max(0, Math.floor((Math.min(...xs) - .03) * 10) / 10);
  const xMax = Math.min(1, Math.ceil((Math.max(...xs) + .03) * 10) / 10);
  const sx = (v) => left + (v - xMin) / (xMax - xMin) * plotW;
  const sy = (v) => top + (18 - v) / 18 * plotH;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "scatter-svg-title scatter-svg-desc" });
  const title = svgEl("title", { id: "scatter-svg-title" });
  title.textContent = "企業別の公開定量スコアと定性6要因合計";
  const desc = svgEl("desc", { id: "scatter-svg-desc" });
  desc.textContent = "80社を低定量側の円と高定量側のひし形で表示。選択したペアを線で結ぶ。";
  svg.append(title, desc);
  for (let y = 0; y <= 18; y += compact ? 6 : 3) {
    const py = sy(y);
    svg.appendChild(svgEl("line", { x1: left, y1: py, x2: width - right, y2: py, class: "chart-grid" }));
    const label = svgEl("text", { x: left - 12, y: py + 4, "text-anchor": "end", class: "chart-muted" });
    label.textContent = y;
    svg.appendChild(label);
  }
  const xStep = compact ? .2 : .1;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + .001; x += xStep) {
    const px = sx(x);
    svg.appendChild(svgEl("line", { x1: px, y1: top, x2: px, y2: height - bottom, class: "chart-grid" }));
    const label = svgEl("text", { x: px, y: height - bottom + 24, "text-anchor": "middle", class: "chart-muted" });
    label.textContent = x.toFixed(1);
    svg.appendChild(label);
  }
  svg.appendChild(svgEl("line", { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, class: "chart-axis" }));
  svg.appendChild(svgEl("line", { x1: left, y1: top, x2: left, y2: height - bottom, class: "chart-axis" }));
  const xLabel = svgEl("text", { x: left + plotW / 2, y: height - 14, "text-anchor": "middle", class: "chart-label" });
  xLabel.textContent = "公開5軸の定量スコア（相対値）";
  const yLabelX = compact ? 12 : 18;
  const yLabel = svgEl("text", { x: yLabelX, y: top + plotH / 2, transform: `rotate(-90 ${yLabelX} ${top + plotH / 2})`, "text-anchor": "middle", class: "chart-label" });
  yLabel.textContent = "定性6要因合計（0〜18点）";
  svg.append(xLabel, yLabel);
  const selected = DATA.pairs.find((pair) => pair.id === selectedPairId);
  svg.appendChild(svgEl("line", { x1: sx(selected.low.quant), y1: sy(selected.low.qual), x2: sx(selected.high.quant), y2: sy(selected.high.qual), class: "pair-link" }));
  points.forEach((point) => {
    const selectedClass = point.pairId === selectedPairId ? " selected" : "";
    const mark = point.side === "low"
      ? svgEl("circle", { cx: sx(point.x), cy: sy(point.y), r: 6.5, class: `point series-low${selectedClass}` })
      : svgEl("rect", { x: sx(point.x) - 5.5, y: sy(point.y) - 5.5, width: 11, height: 11, rx: 1, transform: `rotate(45 ${sx(point.x)} ${sy(point.y)})`, class: `point series-high${selectedClass}` });
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("role", "button");
    mark.setAttribute("aria-label", `${point.company}、${point.side === "low" ? "低定量側" : "高定量側"}、定量${point.x.toFixed(3)}、定性${point.y}点`);
    const tip = svgEl("title");
    tip.textContent = `${point.company}\n定量 ${point.x.toFixed(3)} / 定性 ${point.y}点`;
    mark.appendChild(tip);
    const choose = () => selectPair(point.pairId, true);
    mark.addEventListener("click", choose);
    mark.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); }
    });
    svg.appendChild(mark);
  });
  document.getElementById("scatter-chart").replaceChildren(svg);
}

function scoreRows(company, side) {
  return Object.entries(FACTOR_LABELS).map(([key, label]) => {
    const value = company.scores[key];
    return `<div class="score-row"><span>${escapeHtml(label)}</span><span class="score-track"><span class="score-fill" style="width:${value / 3 * 100}%"></span></span><span>${value}</span></div>`;
  }).join("");
}

function companyCard(company, side) {
  const role = side === "low" ? "公開定量スコア低位" : "公開定量スコア高位";
  return `<article class="card company-${side}">
    <div class="company-head">
      <div><div class="company-role">${role}</div><div class="company-name">${escapeHtml(company.company)}</div></div>
      <span class="quant-badge">定量 ${company.quant.toFixed(3)} / 定性 ${company.qual}点</span>
    </div>
    <div class="pair-meta">事業費 ${fmtNum(company.cost)}億円　補助金 ${fmtNum(company.subsidy)}億円</div>
    <div class="score-list" aria-label="${escapeHtml(company.company)}の6要因評点">${scoreRows(company, side)}</div>
    <div class="evidence"><div class="evidence-label">根拠要約</div><p>${escapeHtml(company.evidence)}</p></div>
    <div class="company-actions"><a class="btn" href="${escapeHtml(company.pdf)}" target="_blank" rel="noopener noreferrer">公式PDFを開く</a></div>
  </article>`;
}

function renderPair() {
  const pair = DATA.pairs.find((item) => item.id === selectedPairId);
  document.getElementById("pair-meta").textContent = `${pair.id}｜${pair.round}｜${pair.industry}｜評点確度 ${pair.confidence}`;
  document.getElementById("pair-detail").innerHTML = companyCard(pair.low, "low") + companyCard(pair.high, "high");
  document.getElementById("pair-interpretation").textContent = pair.interpretation;
}

function selectPair(pairId, syncSelect = false) {
  selectedPairId = pairId;
  if (syncSelect) pairSelect.value = pairId;
  renderPair();
  renderScatter();
}

function initPairSelect() {
  DATA.pairs.forEach((pair) => {
    const option = document.createElement("option");
    option.value = pair.id;
    option.textContent = `${pair.id}｜${pair.low.company} ↔ ${pair.high.company}`;
    pairSelect.appendChild(option);
  });
  pairSelect.value = selectedPairId;
  pairSelect.addEventListener("change", () => selectPair(pairSelect.value));
}

renderStats();
renderFactorChart();
initPairSelect();
renderPair();
renderScatter();
let compactLayout = window.innerWidth < 620;
window.addEventListener("resize", () => {
  const nextCompact = window.innerWidth < 620;
  if (nextCompact !== compactLayout) {
    compactLayout = nextCompact;
    renderFactorChart();
    renderScatter();
  }
});
</script>
</body>
</html>
'''


def main() -> None:
    payload = json.dumps(compact_data(), ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")
    html = TEMPLATE.replace("__DATA_JSON__", payload)
    OUTPUT_PATH.write_text(html, encoding="utf-8", newline="\n")
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
