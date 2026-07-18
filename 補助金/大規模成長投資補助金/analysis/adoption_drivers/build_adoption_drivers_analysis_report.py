#!/usr/bin/env python3
"""Build the self-contained expert report for the adoption_drivers analysis."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "adoption_drivers_analysis_report.html"


def rows(name: str) -> list[dict[str, str]]:
    with (ROOT / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def doc(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


payload = {
    "summary": doc("summary.json"),
    "deep": doc("deep_summary.json"),
    "pairs": doc("expanded_pair_summary.json"),
    "rounds": rows("round_summary.csv"),
    "proxy": rows("proxy_validation.csv"),
    "groups": rows("group_comparison.csv"),
    "profiles": rows("profile_summary.csv"),
    "thresholds": rows("threshold_sensitivity.csv"),
    "applicant": rows("applicant_benchmark_summary.csv"),
    "criteria": rows("criteria_evidence_summary.csv"),
    "pairFactors": rows("expanded_pair_factor_summary.csv"),
    "trends": rows("sixth_round_benchmark_trends.csv"),
    "strategy": rows("sixth_round_numeric_strategy.csv"),
    "finance": rows("external_financial_confirmation_summary.csv"),
    "metrics": rows("metric_assessment.csv"),
}

DATA = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

HTML = r'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>採択要因分析：方法・結果・示唆</title>
<style>
:root{
  --bg:#f4f1ea;--paper:#fffdf8;--ink:#17212b;--muted:#5e6a73;--line:#d7d1c5;
  --blue:#1f5a7a;--blue2:#7fa8bd;--orange:#c76d2a;--green:#28766a;--red:#b94b4b;
  --purple:#72598f;--wash:#e8f0f2;--warm:#f6e8da;--shadow:0 12px 38px rgba(31,42,48,.08);
  --sans:"Yu Gothic UI","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;
  --serif:"Yu Mincho","Hiragino Mincho ProN",serif;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#12181b;--paper:#1a2226;--ink:#edf2f3;--muted:#aab5ba;--line:#3b484e;
  --blue:#78b9d7;--blue2:#486f82;--orange:#e79858;--green:#72c5b8;--red:#ef8585;
  --purple:#b8a1d3;--wash:#233239;--warm:#382a22;--shadow:none;
}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.75}
a{color:var(--blue);text-underline-offset:3px}button,a{touch-action:manipulation}.page{width:min(1420px,100%);margin:auto;padding:28px clamp(16px,3vw,44px) 72px}
.hero{background:var(--paper);border-top:8px solid var(--orange);box-shadow:var(--shadow);padding:clamp(28px,5vw,68px);margin-bottom:24px}
.eyebrow{font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--orange);font-weight:800}.hero h1{font-family:var(--serif);font-size:clamp(2rem,5vw,4.3rem);line-height:1.12;margin:.2em 0}.hero .lead{font-size:clamp(1rem,1.8vw,1.35rem);max-width:980px;color:var(--muted)}
.meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:30px;font-size:.88rem;color:var(--muted)}
.toc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin:24px 0 52px}.toc a{background:var(--paper);padding:13px 16px;text-decoration:none;color:var(--ink);font-weight:650}.toc a:hover,.toc a:focus-visible{background:var(--wash);outline:2px solid var(--blue);outline-offset:-2px}
.chapter{background:var(--paper);box-shadow:var(--shadow);margin:0 0 30px;padding:clamp(24px,4vw,54px);scroll-margin-top:20px}.chapter-head{display:grid;grid-template-columns:88px 1fr;gap:22px;border-bottom:1px solid var(--line);padding-bottom:24px;margin-bottom:28px}.no{font:700 clamp(2rem,5vw,4rem)/1 var(--serif);color:var(--orange)}h2{font:700 clamp(1.55rem,3vw,2.55rem)/1.3 var(--serif);margin:0}.subtitle{color:var(--muted);margin:.45rem 0 0;max-width:900px}h3{font-size:1.14rem;margin:2.2rem 0 .7rem;color:var(--blue)}h4{margin:1.2rem 0 .3rem}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0}.kpi{border-top:4px solid var(--blue);background:var(--wash);padding:18px}.kpi strong{display:block;font:700 clamp(1.6rem,3vw,2.5rem)/1.05 var(--serif);margin-bottom:6px}.kpi small{color:var(--muted)}
.finding{border-left:5px solid var(--orange);background:var(--warm);padding:18px 21px;margin:24px 0}.finding strong{display:block;margin-bottom:4px}.method{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 0;margin:20px 0;color:var(--muted)}.method b{color:var(--ink)}
.chart{min-height:260px;margin:18px 0 8px}.chart svg{display:block;width:100%;height:auto;overflow:visible}.chart-title{font-weight:750;margin-bottom:2px}.chart-note,.footnote{font-size:.83rem;color:var(--muted)}
.flow{display:grid;grid-template-columns:1.2fr 38px 1fr 38px 1fr;align-items:stretch;gap:8px;margin:25px 0}.flow-box{padding:22px;background:var(--wash);border-top:5px solid var(--blue);min-height:134px}.flow-box.warn{background:var(--warm);border-color:var(--orange)}.flow-box strong{display:block;font:700 2.5rem/1 var(--serif)}.flow-box span{display:block;margin-top:8px}.arrow{display:grid;place-items:center;color:var(--muted);font-size:1.6rem}
.table{width:100%;border-collapse:collapse;font-size:.89rem;margin:18px 0}.table th{background:var(--wash);text-align:left;border-bottom:2px solid var(--line);padding:9px 10px;vertical-align:bottom}.table td{border-bottom:1px solid var(--line);padding:9px 10px;vertical-align:top}.table .num{text-align:right;font-variant-numeric:tabular-nums}.table tr:last-child td{border-bottom:0}.tag{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--wash);font-size:.77rem;font-weight:700}.tag.orange{background:var(--warm);color:var(--orange)}
.profile-list,.strategy-list{display:grid;gap:10px;margin:18px 0}.profile-row{display:grid;grid-template-columns:minmax(130px,1.2fr) 2.5fr 90px;gap:12px;align-items:center}.bar-track{height:14px;background:var(--line);position:relative}.bar-fill{height:100%;background:var(--blue)}.profile-row small{text-align:right;color:var(--muted)}
.strategy-row{display:grid;grid-template-columns:48px minmax(160px,1.15fr) .75fr 1.2fr 1.4fr;gap:12px;border-bottom:1px solid var(--line);padding:13px 0;align-items:start}.strategy-row .sno{font:700 1.25rem/1 var(--serif);color:var(--orange)}.strategy-row b,.strategy-row span{overflow-wrap:anywhere}.strategy-row small{display:block;color:var(--muted)}
.spark-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.spark{background:var(--wash);padding:15px}.spark h4{font-size:.92rem;margin:0 0 4px}.spark .value{font:700 1.6rem/1.1 var(--serif)}
.formula{font-family:ui-monospace,"Cascadia Mono",monospace;background:var(--wash);padding:14px 16px;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;max-width:100%;border-left:4px solid var(--blue)}
.matrix{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line)}.matrix section{background:var(--paper);padding:20px}.matrix h3{margin:0 0 8px}.supported{color:var(--green)}.unsupported{color:var(--red)}
.callout{font-size:clamp(1.2rem,2.2vw,1.7rem);font-family:var(--serif);line-height:1.55;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:24px 0;margin:28px 0}.sources li{margin:.45rem 0}.mono{font-family:ui-monospace,"Cascadia Mono",monospace;font-size:.86em}.muted{color:var(--muted)}
.print-only{display:none}.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.82rem;color:var(--muted)}.swatch{display:inline-block;width:11px;height:11px;margin-right:5px;vertical-align:-1px}
@media(max-width:900px){.toc{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2,.grid3{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.chapter-head{grid-template-columns:58px 1fr}.flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg);height:26px}.spark-grid{grid-template-columns:1fr}.strategy-row{grid-template-columns:38px 1fr}.strategy-row>*:not(.sno){grid-column:2}.matrix{grid-template-columns:1fr}}
@media(max-width:620px){.page{padding:12px 10px 48px}.hero,.chapter{padding:22px 17px}.toc{grid-template-columns:1fr}.kpis{grid-template-columns:1fr}.chapter-head{display:block}.no{font-size:1rem;margin-bottom:8px}.profile-row{grid-template-columns:1fr}.profile-row small{text-align:left}.table.responsive,.table.responsive tbody,.table.responsive tr,.table.responsive td{display:block;width:100%}.table.responsive thead{display:none}.table.responsive tr{padding:10px 0;border-bottom:1px solid var(--line)}.table.responsive td{border:0;padding:3px 0}.table.responsive td::before{content:attr(data-label);display:block;color:var(--muted);font-size:.72rem;font-weight:700}.table.responsive .num{text-align:left}}
@media print{body{background:#fff;color:#111;font-size:10.5pt}.page{width:100%;padding:0}.hero,.chapter{box-shadow:none;background:#fff;margin:0;padding:12mm 10mm}.hero{border-top:5mm solid #c76d2a}.chapter{break-before:page}.chapter:first-of-type{break-before:auto}.toc{break-after:page}.chart,.finding,.method,.strategy-row,.spark{break-inside:avoid}.print-only{display:block}.toc a{color:#111;background:#fff}.page a::after{content:""}}
</style>
</head>
<body>
<main class="page">
  <header class="hero">
    <div class="eyebrow">Adoption drivers / analytical dossier</div>
    <h1>採択要因分析<br>方法・結果・示唆</h1>
    <p class="lead">大規模成長投資補助金の公開企業PDFと公式中央値を用いて、「採択者中央値を下回っても採択されている案件」をどこまで説明できるかを段階的に検証した。381社の定量スクリーニング、5軸プロファイル、公開文章の根拠密度、40組80社の目視ペア精査を一つの分析体系として再構成する。</p>
    <div class="meta"><span>分析対象：公開企業PDF 381社</span><span>公募回：1～4次（第5次はベンチマーク補助）</span><span>作成：2026-07-18</span><span>版：1.0</span></div>
  </header>

  <nav class="toc" aria-label="目次">
    <a href="#executive">01 要旨</a><a href="#design">02 データと設計</a><a href="#screen">03 劣後群スクリーニング</a><a href="#proxy">04 Proxy検証</a>
    <a href="#profiles">05 5軸プロファイル</a><a href="#text">06 公開文章分析</a><a href="#pairs">07 40ペア目視精査</a><a href="#sixth">08 第6次への含意</a>
    <a href="#synthesis">09 統合解釈</a><a href="#limits">10 限界と次の設計</a><a href="#appendix">11 定義・再現方法</a><a href="#sources">12 出典</a>
  </nav>

  <section class="chapter" id="executive">
    <div class="chapter-head"><div class="no">01</div><div><h2>エグゼクティブ・サマリー</h2><p class="subtitle">本分析が示したこと、示していないことを先に分離する。</p></div></div>
    <div class="kpis">
      <div class="kpi"><strong>125社</strong><small>可視7指標で採択者中央値に広く劣後（381社の32.8%）</small></div>
      <div class="kpi"><strong>54社</strong><small>追加の定量Proxyで少なくとも一つ補完</small></div>
      <div class="kpi"><strong>71社</strong><small>公開定量だけでは説明が残る案件</small></div>
      <div class="kpi"><strong>40ペア</strong><small>同回・同業種・近い投資規模の目視比較</small></div>
    </div>
    <div class="callout">結論は「中央値を超えれば通る」ではない。採択案件は、<b>申請者全体に対する最低限の競争力</b>を持ちつつ、需要・能力制約・構造転換・実行確度などを束ねて、投資から付加価値・賃金までの因果連鎖を説明している。</div>
    <div class="grid2">
      <div><h3>最も堅い知見</h3><ul><li>可視指標劣後125社のうち124社は、観測可能な指標の少なくとも一つで同回の<b>申請者中央値以上</b>だった。</li><li>公開Proxyでは「付加価値増加額÷補助金額」が公式中央値に比較的近く、費用対効果の補完診断として最も有用だった。</li><li>低定量側40社でも、能力制約と構造転換の強い根拠は各39社（97.5%）。4中核要因の2つ以上が全40社で確認された。</li></ul></div>
      <div><h3>読み過ぎてはいけない点</h3><ul><li>標本は原則として採択企業のみ。非採択個票がないため、採択確率・因果効果・重みは推定できない。</li><li>採択者中央値は合格線ではなく、各指標で採択者の半数が下回る記述統計である。</li><li>公開2ページPDFは申請書・審査点を代替しない。文章分析で「定量未説明」71社の理由を十分には回収できなかった。</li></ul></div>
    </div>
    <div class="finding"><strong>実務上の中心命題</strong>数値は「全部高くする」より、①第5次採択者中央値を競争水準の目安に置く、②主戦場となる1～2軸を選ぶ、③補助金1円当たり効果と絶対効果を両立させる、④需要→設備制約→投資→売上・付加価値→賃金・雇用を同一モデルで接続する、という設計が重要である。</div>
  </section>

  <section class="chapter" id="design">
    <div class="chapter-head"><div class="no">02</div><div><h2>データ、問い、分析設計</h2><p class="subtitle">分析対象の違いを混ぜず、段階的に仮説を絞った。</p></div></div>
    <div class="flow" aria-label="分析パイプライン">
      <div class="flow-box"><strong>381</strong><span>公開企業PDF<br>企業別数値・本文</span></div><div class="arrow">→</div>
      <div class="flow-box"><strong>3層</strong><span>中央値比較／5軸診断／文章根拠</span></div><div class="arrow">→</div>
      <div class="flow-box warn"><strong>40組</strong><span>同回・同業種・投資規模近似の目視精査</span></div>
    </div>
    <h3>研究質問</h3>
    <table class="table responsive"><thead><tr><th>段階</th><th>問い</th><th>方法</th><th>推論範囲</th></tr></thead><tbody>
      <tr><td data-label="段階">A. スクリーニング</td><td data-label="問い">採択者中央値を複数指標で下回る案件はどの程度あるか</td><td data-label="方法">可視7指標、同回採択者中央値、観測3指標以上、劣後率60%以上</td><td data-label="推論範囲">採択案件内の記述</td></tr>
      <tr><td data-label="段階">B. 定量補完</td><td data-label="問い">公開情報から作る追加指標で弱さを説明できるか</td><td data-label="方法">付加価値・補助金効率・雇用効率のProxy、同回比較</td><td data-label="推論範囲">公開値による補完可能性</td></tr>
      <tr><td data-label="段階">C. 多軸診断</td><td data-label="問い">企業ごとの勝ち筋は一つか、複数か</td><td data-label="方法">5軸を同回内パーセンタイル化、プロファイル・パレート支配・感度分析</td><td data-label="推論範囲">採択案件内の相対配置</td></tr>
      <tr><td data-label="段階">D. 定性精査</td><td data-label="問い">低定量案件に共通する具体的な根拠は何か</td><td data-label="方法">40組80社を6要因0～3点で目視符号化、Wilson区間・符号検定</td><td data-label="推論範囲">採択案件同士の探索的比較</td></tr>
    </tbody></table>
    <h3>主要入力</h3>
    <div class="grid3"><div><h4>企業別構造化データ</h4><p><span class="mono">cases.csv</span>、<span class="mono">sales_series.csv</span>。公募回、事業費、補助金、売上、給与、人数など。</p></div><div><h4>公開本文</h4><p><span class="mono">pages.jsonl</span>。公開企業PDFの本文をテーマ抽出・根拠文判定に使用。</p></div><div><h4>公式統計</h4><p><span class="mono">official_round_benchmarks.csv</span> と第5次公式中央値PDF。申請者全体・採択者の代表値。</p></div></div>
    <div class="method"><b>母集団注意：</b> 公開企業PDFは交付決定企業を中心とし、公募時点の採択者全体と一対一ではない。特に1次は156対公式採択109、2次は25対85で、ラベル・公表時点・収録範囲の差がある。</div>
  </section>

  <section class="chapter" id="screen">
    <div class="chapter-head"><div class="no">03</div><div><h2>可視指標劣後群のスクリーニング</h2><p class="subtitle">「中央値未満」を一指標で断定せず、観測数と劣後比率を条件化した。</p></div></div>
    <div class="formula">visible_lag = 観測可能な可視7指標が3個以上 AND 同回採択者中央値未満の比率が60%以上</div>
    <p class="footnote">可視7指標：全社売上高CAGR、全社売上高増加額、労働生産性CAGR、1人当たり給与成長率、給与支給総額増加額、役員報酬成長率、投資額／全社売上高。</p>
    <div class="flow">
      <div class="flow-box"><strong>381</strong><span>全公開案件</span></div><div class="arrow">→</div>
      <div class="flow-box warn"><strong>125</strong><span>可視指標劣後<br>32.8%</span></div><div class="arrow">→</div>
      <div class="flow-box"><strong>54 / 71</strong><span>定量Proxyで補完 / 公開定量では未説明</span></div>
    </div>
    <div class="grid2"><div><div class="chart-title">公募回別の劣後率</div><div id="roundChart" class="chart" role="img" aria-label="公募回別の可視指標劣後率"></div></div><div><div class="chart-title">劣後群とその他採択企業の差</div><div id="groupChart" class="chart" role="img" aria-label="劣後群の同回内パーセンタイル差"></div></div></div>
    <div class="finding"><strong>サイズとProxy効果がともに小さい</strong>劣後群は、補助金額・事業費・付加価値増加額Proxy・付加価値／補助金など、多くの比較でその他採択企業より低い。単純な「小さい案件だが補助金効率が高かった」という一つの説明では71社を回収できない。</div>
    <h3>申請者中央値に置き直すと見え方が変わる</h3>
    <div id="applicantChart" class="chart" role="img" aria-label="申請者中央値以上の指標割合"></div>
    <p>可視指標劣後125社のうち124社、定量未説明71社のうち70社は、少なくとも一指標で申請者中央値以上だった。平均すると劣後群でも観測指標の59.7%、未説明群でも58.4%が申請者中央値以上である。したがって「採択者中央値未満」は「申請者集団でも弱い」と同義ではない。</p>
  </section>

  <section class="chapter" id="proxy">
    <div class="chapter-head"><div class="no">04</div><div><h2>追加定量Proxyの構築と検証</h2><p class="subtitle">公開値から作れる指標を、公式採択者中央値との再現性で評価した。</p></div></div>
    <div class="formula">付加価値増加額 Proxy（億円） = {目標労働生産性 × 目標従業員数 − 基準労働生産性 × 基準従業員数} ÷ 10,000</div>
    <div class="formula">補助金費用対効果 Proxy（%） = 100 × 付加価値増加額 Proxy ÷ 補助金額（億円）</div>
    <div class="method"><b>重要な制約：</b> 公開PDFの「従業員数」と様式2の補助事業P/Lの主体範囲が一致する保証はない。企業別公式値ではなく、集計・診断用Proxyとしてのみ使用する。</div>
    <div id="proxyChart" class="chart" role="img" aria-label="公式中央値に対するProxy中央値の相対差"></div>
    <table class="table responsive"><thead><tr><th>指標</th><th>1次</th><th>2次</th><th>3次</th><th>4次</th><th>評価</th></tr></thead><tbody>
      <tr><td data-label="指標">付加価値増加額</td><td data-label="1次">−17.9%</td><td data-label="2次">−6.0%</td><td data-label="3次">−13.2%</td><td data-label="4次">−17.2%</td><td data-label="評価">方向は追うが、公式値を系統的に下回る</td></tr>
      <tr><td data-label="指標">付加価値増加額／補助金</td><td data-label="1次">+4.9%</td><td data-label="2次">+20.1%</td><td data-label="3次">−1.9%</td><td data-label="4次">−0.6%</td><td data-label="評価">1・3・4次で高い再現性、2次は要注意</td></tr>
    </tbody></table>
    <div class="finding"><strong>最も有用な公開補完KPI</strong>「付加価値増加額／補助金額」は公式上も費用対効果として明記され、公開Proxyの中央値再現性も比較的高い。ただし、これだけで可視指標劣後群を説明できるのは45社であり、万能な採択モデルではない。</div>
  </section>

  <section class="chapter" id="profiles">
    <div class="chapter-head"><div class="no">05</div><div><h2>5軸プロファイルと単調ランキングの限界</h2><p class="subtitle">指標を同回内パーセンタイルへ変換し、規模・回の違いを抑えて案件の勝ち筋を分類した。</p></div></div>
    <div class="grid2"><div><h3>5つの定量軸</h3><ol><li><b>成長・生産性</b>：全社／補助事業の成長率・増加額</li><li><b>絶対効果</b>：売上、付加価値、給与総額、雇用の増加額</li><li><b>補助金効率</b>：各効果÷補助金額</li><li><b>賃金・雇用</b>：給与成長、給与総額、雇用</li><li><b>企業変革投資</b>：投資額／売上、事業費規模</li></ol></div><div><h3>分類規則</h3><ul><li>各軸は同一公募回内のパーセンタイル平均。</li><li>0.65以上を「強い軸」の基本閾値。</li><li>3軸以上が強い場合は「複合バランス型」。</li><li>最大軸も0.55未満なら「定性・非公開要因候補」。</li><li>同回内で5軸すべてが別企業以下ならパレート支配あり。</li></ul></div></div>
    <div class="grid2"><div><div class="chart-title">採択プロファイルの構成</div><div id="profileList" class="profile-list"></div></div><div><div class="chart-title">強い軸の本数</div><div id="axisChart" class="chart" role="img" aria-label="強い定量軸の本数分布"></div></div></div>
    <div class="kpis"><div class="kpi"><strong>262社</strong><small>0.65以上の軸を少なくとも一つ持つ（68.8%）</small></div><div class="kpi"><strong>119社</strong><small>0.65以上の強い軸がゼロ</small></div><div class="kpi"><strong>288社</strong><small>同回内で公開5軸上パレート支配あり（75.6%）</small></div><div class="kpi"><strong>76社</strong><small>複合バランス型</small></div></div>
    <div id="thresholdChart" class="chart" role="img" aria-label="強い軸閾値の感度分析"></div>
    <div class="finding"><strong>パレート支配75.6%の意味</strong>公開5軸をすべて「高いほどよい」とする単調ランキングでは、実際の採択集合を表現できない。これは審査が不合理という意味ではなく、事業の先進性、地域波及、実行確度、財務・政策加点、プレゼンなど未観測・非単調の要素が大きいことを示す。</div>
  </section>

  <section class="chapter" id="text">
    <div class="chapter-head"><div class="no">06</div><div><h2>公開文章から審査根拠を回収できるか</h2><p class="subtitle">審査項目語と、数字・実績・受注・比較などの根拠マーカーが同じ文に出る頻度を測った。</p></div></div>
    <div class="method"><b>文章根拠文：</b> 審査観点の辞書語（経営、革新・市場、地域波及、実現可能性、政策整合）と、数値または「実績・受注・契約・確保・比較・顧客・市場規模」等が同一文に存在。1,000文字当たり密度を計算し、同回内パーセンタイルへ変換。</div>
    <div id="criteriaChart" class="chart" role="img" aria-label="審査観点別の文章根拠パーセンタイル"></div>
    <div class="grid2"><div><h3>観察されたこと</h3><ul><li>可視指標劣後群は地域波及（52.4）と経営（51.5）が全体中央値付近。</li><li>定量未説明群は地域波及（53.1）と政策整合（51.4）が相対的に高い。</li><li>ただし実現可能性（45.0）、革新・市場（47.1）はむしろ低い。</li><li>定量未説明71社のうち文章根拠総量が上位35%の案件は11社のみ。</li></ul></div><div><h3>解釈</h3><p>公開2ページPDFで定性要因を機械的に数えるだけでは、選定理由を復元できない。文章量、編集方針、公開様式の制約が大きく、「書いていない」と「申請書にない」を区別できない。</p><p>そこで次段階では、単語頻度ではなく、企業同士をそろえた上で<b>需要・制約・転換・地域性・実行確度・政策整合の具体性</b>を人手で評価した。</p></div></div>
  </section>

  <section class="chapter" id="pairs">
    <div class="chapter-head"><div class="no">07</div><div><h2>40組80社の類似企業ペア目視精査</h2><p class="subtitle">低定量側に定性面の強さがあるかを、同じ土俵の採択企業と比較した探索的監査。</p></div></div>
    <div class="kpis"><div class="kpi"><strong>40 / 40</strong><small>低定量側が4中核要因の2つ以上で強い</small></div><div class="kpi"><strong>36 / 40</strong><small>4中核要因の3つ以上で強い</small></div><div class="kpi"><strong>29 / 40</strong><small>4中核要因中2つ以上が厳格な3点</small></div><div class="kpi"><strong>30 + 10</strong><small>製造業ペア + 非製造業ペア</small></div></div>
    <div class="method"><b>マッチング：</b> 同一公募回・同一業種・近い投資規模から、低定量側と相対的に高い側を重複なしで選定。<b>符号化：</b> 6要因を0（記載なし）～3（固有名・数値・契約・工程等の強い根拠）で目視評価。<b>統計：</b> 強い根拠＝2点以上、Wilson 95%区間、ペア内符号検定。評価者間一致度は未測定。</div>
    <div id="pairChart" class="chart" role="img" aria-label="類似企業ペアの定性要因比較"></div>
    <table class="table responsive"><thead><tr><th>要因</th><th>低定量側 強い根拠</th><th>高定量側 強い根拠</th><th>ペア内 p</th><th>読み方</th></tr></thead><tbody id="pairTable"></tbody></table>
    <div class="finding"><strong>低定量側に見つかった定性面</strong>能力制約と構造転換は低定量側の各97.5%、実行確度と政策整合は各90%、地域供給網・代替困難性は77.5%、需要根拠は70%。少なくとも「数値が弱い代わりに説明が何もない」案件ではない。</div>
    <p>一方、6要因合計は低定量側が高い12組、同点8組、高定量側が高い20組。定性要因の総量が低定量を単純に補償するわけではない。唯一、実行確度は高定量側が有意に高かった（探索的 p=0.035）が、6比較の多重性を調整していないため確証的結論ではない。</p>
    <div class="callout">ペア精査の実務的な価値は「採択の因果」を証明した点ではなく、低定量でも採択された案件に、<b>固有顧客の増産要請、現有能力のボトルネック、工場統合・内製化／ODM化、地域供給網での代替困難性</b>が繰り返し具体化されていた点にある。</div>
  </section>

  <section class="chapter" id="sixth">
    <div class="chapter-head"><div class="no">08</div><div><h2>第6次公募の数値設計への含意</h2><p class="subtitle">第5次の採択者中央値を「合格線」ではなく、競争水準を考えるための実務ベンチマークとして使う。</p></div></div>
    <div class="spark-grid" id="trendGrid"></div>
    <h3>13指標の実務目線</h3>
    <div class="strategy-list" id="strategyList"></div>
    <div class="grid2"><div><h3>数値の作り方</h3><ol><li>顧客×製品×単価×数量で補助事業売上を積み上げる。</li><li>設備能力×稼働率×良品率から同じ売上を逆算し、二方向で一致させる。</li><li>補助事業P/Lから付加価値額を作り、給与・人数・減価償却・利益と接続する。</li><li>補助金額で除した費用対効果と、絶対増加額を同時に示す。</li><li>下振れシナリオでも賃上げ要件と返還リスクに耐えるか確認する。</li></ol></div><div><h3>文章・証拠の作り方</h3><ol><li>増産要請、契約、内示、顧客ヒアリング等で需要を固有化する。</li><li>現行設備の能力、歩留まり、外注費、納期など制約を数値化する。</li><li>単なる増設ではなく、統合・内製化・自動化・新方式への転換を示す。</li><li>融資・出資・施工・人材・許認可を工程表へ落とす。</li><li>地域一次効果（雇用・所得）と二次効果（供給網・代替困難性）を分ける。</li></ol></div></div>
    <h3>金融機関確認は「希少な加点」ではなく衛生要因に近い</h3>
    <div id="financeChart" class="chart" role="img" aria-label="採択案件の金融機関確認提出率"></div>
    <p>3次97.4%、4次98.0%、5次100%。採択案件内ではほぼ標準装備であり、提出だけで差別化するより、融資条件・意思決定済み範囲・資金ショート耐性まで実行確度として見せる必要がある。非採択企業との比較がないため、提出の採択効果は推定できない。</p>
  </section>

  <section class="chapter" id="synthesis">
    <div class="chapter-head"><div class="no">09</div><div><h2>分析を統合した解釈</h2><p class="subtitle">複数の分析が同じ方向を指す部分と、なお未観測の部分を分ける。</p></div></div>
    <div class="matrix">
      <section><h3 class="supported">データが支持する</h3><ul><li>採択者中央値未満でも、申請者集団に対する競争力は多くの案件に残る。</li><li>費用対効果、とくに付加価値増加額／補助金額は重要な補完軸。</li><li>案件の勝ち筋は単一指標ではなく、複数軸・絶対効果・効率の組合せ。</li><li>低定量案件にも能力制約・構造転換・実行確度等の具体的根拠が高頻度で存在。</li><li>公開5軸の単調総合点では採択集合を再現できない。</li></ul></section>
      <section><h3 class="unsupported">データが支持しない／未判定</h3><ul><li>「指標XをY以上にすれば採択確率がZ%上がる」という効果量。</li><li>採択者中央値を合格線として扱うこと。</li><li>低定量なら定性点が自動的に補償するという交換率。</li><li>公開PDFの文章量・キーワード数を審査点とみなすこと。</li><li>金融機関確認の提出自体が採択を生むという因果。</li></ul></section>
    </div>
    <h3>最も整合的な採択仮説</h3>
    <div class="flow">
      <div class="flow-box"><strong>①</strong><span>最低限の競争力<br>申請者中央値との比較</span></div><div class="arrow">→</div>
      <div class="flow-box"><strong>②</strong><span>主戦場<br>成長・絶対効果・効率・賃金・変革</span></div><div class="arrow">→</div>
      <div class="flow-box warn"><strong>③</strong><span>因果と実装<br>需要・制約・転換・資金・地域</span></div>
    </div>
    <p>この仮説では、中央値未満の案件が採択されることは矛盾しない。全指標の平均順位ではなく、申請者集団に対して最低限の競争力を保ち、事業固有の主戦場で十分な効果を示し、審査者が信頼できる因果連鎖と実行証拠を提示した案件が残る、と解釈できる。</p>
    <div class="finding"><strong>コンサルティングでの説明</strong>「採択中央値に届かないから無理」でも「定性で何とかなる」でもない。どの数値で戦い、どの数値は企業構造上不利かを明示し、不利を補うのではなく、投資の必然性と費用対効果を別の測定可能な軸で立証する。</div>
  </section>

  <section class="chapter" id="limits">
    <div class="chapter-head"><div class="no">10</div><div><h2>限界と、次に必要な分析設計</h2><p class="subtitle">現在の成果は高解像度の記述・仮説生成であり、採択確率モデルではない。</p></div></div>
    <table class="table responsive"><thead><tr><th>限界</th><th>影響</th><th>改善案</th></tr></thead><tbody>
      <tr><td data-label="限界">非採択企業の個票がない</td><td data-label="影響">採択確率、オッズ比、判別性能、因果効果を推定不能</td><td data-label="改善案">第6次で相談案件を事前登録し、採否・一次審査・プレゼン進出を追跡</td></tr>
      <tr><td data-label="限界">公開PDFと申請書の情報差</td><td data-label="影響">定性面の欠測が「弱さ」に見える</td><td data-label="改善案">申請書項目別の構造化符号化、非公開資料は匿名化して集計</td></tr>
      <tr><td data-label="限界">Proxyの主体・単位差</td><td data-label="影響">企業別の付加価値・給与総額を誤測定し得る</td><td data-label="改善案">様式2の補助事業P/Lと公開値を別変数として保持し、照合フラグを設ける</td></tr>
      <tr><td data-label="限界">目視符号化が単一評価</td><td data-label="影響">評価者の解釈がスコアへ混入</td><td data-label="改善案">2名以上の独立符号化、Cohen's κ/ICC、盲検化、事前コードブック</td></tr>
      <tr><td data-label="限界">多重比較と探索性</td><td data-label="影響">p=0.035を偶然の差と区別しにくい</td><td data-label="改善案">主要仮説を事前指定し、FDR/Bonferroni、外部標本で再現</td></tr>
      <tr><td data-label="限界">公募回間の制度変更</td><td data-label="影響">単純な時系列比較に構成変化が混ざる</td><td data-label="改善案">回固定効果、業種・規模層別、要領変更点のイベント変数</td></tr>
    </tbody></table>
    <h3>第6次で作れる前向きデータセット</h3>
    <ol><li>相談開始時に13指標、6定性要因、証拠レベル、財務制約を凍結する。</li><li>申請直前の修正履歴を残し、どの指標・証拠が改善したかを記録する。</li><li>一次審査、プレゼン進出、最終採否を別のアウトカムとして追跡する。</li><li>十分な件数が得られたら、回・業種・投資規模を統制した正則化ロジスティック回帰／勾配ブースティングを比較し、交差検証する。</li><li>SHAP等の説明は予測性能と校正を確認した後に使い、因果説明と区別する。</li></ol>
  </section>

  <section class="chapter" id="appendix">
    <div class="chapter-head"><div class="no">11</div><div><h2>定義、判定、再現方法</h2><p class="subtitle">分析結果を再計算・監査するための最低限の仕様。</p></div></div>
    <h3>主要判定</h3>
    <table class="table responsive"><thead><tr><th>名称</th><th>定義</th><th>用途</th></tr></thead><tbody>
      <tr><td data-label="名称">可視指標劣後</td><td data-label="定義">観測3指標以上、採択者中央値未満の割合60%以上</td><td data-label="用途">追加説明が必要な案件の入口</td></tr>
      <tr><td data-label="定義">定量補完</td><td data-label="定義">付加価値増加額、付加価値／補助金、補助事業売上等の少なくとも一つが採択者中央値以上</td><td data-label="用途">公開可視7指標の外側の勝ち筋</td></tr>
      <tr><td data-label="名称">強い軸</td><td data-label="定義">5軸の同回内パーセンタイルが0.65以上</td><td data-label="用途">プロファイル分類。0.60～0.75で感度分析</td></tr>
      <tr><td data-label="名称">パレート支配</td><td data-label="定義">同回の別企業が観測5軸すべてで同等以上かつ一つ以上で上</td><td data-label="用途">単調ランキングでは説明できない案件の識別</td></tr>
      <tr><td data-label="名称">強い定性根拠</td><td data-label="定義">0～3点符号化の2点以上。3点は固有名・数量・契約・工程など厳格な証拠</td><td data-label="用途">40ペア目視比較</td></tr>
    </tbody></table>
    <h3>再生成順</h3>
    <pre class="formula">python analyze_adoption_drivers.py
python deepen_adoption_profiles.py
python prepare_sixth_round_consulting.py
python select_matched_pair_candidates.py
python analyze_expanded_matched_pairs.py
python build_adoption_drivers_analysis_report.py</pre>
    <p class="footnote">Python 3.10以降を想定。外部データを更新する場合のみ <span class="mono">prepare_sixth_round_consulting.py --refresh-external</span> を使用する。</p>
    <h3>主な監査ファイル</h3>
    <ul class="sources"><li><a href="report.md">report.md</a>：初期スクリーニング</li><li><a href="deep_dive_report.md">deep_dive_report.md</a>：5軸・文章・スコアカード</li><li><a href="expanded_matched_pair_report.md">expanded_matched_pair_report.md</a>：40ペア全件監査</li><li><a href="expanded_matched_pair_review.xlsx">expanded_matched_pair_review.xlsx</a>：閲覧用ワークブック</li><li><a href="sixth_round_consulting_guide.md">sixth_round_consulting_guide.md</a>：第6次相談ガイド</li></ul>
  </section>

  <section class="chapter" id="sources">
    <div class="chapter-head"><div class="no">12</div><div><h2>公式出典と引用方針</h2><p class="subtitle">制度根拠と公開値のURL。分析値は同フォルダ内のCSV/JSONから再生成した。</p></div></div>
    <ul class="sources">
      <li><a href="https://seichotoushi-hojo.jp/assets/pdf/outline_4ji.pdf">第4次公募 公募要領</a>：経営力、先進性・成長性、地域波及、大規模投資・費用対効果、実現可能性、加点。</li>
      <li><a href="https://seichotoushi-hojo.jp/assets/pdf/about_3ji.pdf">第3次公募 補助金の概要</a>：補助金額に対する付加価値増加額等の費用対効果。</li>
      <li><a href="https://seichotoushi-hojo.jp/1_2ji/information/2024/05/28.html">第1次公募 一次審査結果</a>：一次審査・プレゼンテーション審査。</li>
      <li><a href="https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/5ji_median.pdf">第5次公募 各種指標の中央値</a>：申請者全体・採択者の公式代表値。</li>
      <li><a href="https://seichotoushi-hojo.jp/assets/pdf/list_3ji.pdf">第3次採択案件一覧</a>、<a href="https://seichotoushi-hojo.jp/assets/pdf/list_4ji.pdf">第4次採択案件一覧</a>、<a href="https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/list_5ji.pdf">第5次採択案件一覧</a>：金融機関確認。</li>
    </ul>
    <div class="method"><b>引用上の原則：</b> 公式中央値は公表値、企業別数値・定性所見は公開企業PDF、推計値は本分析のProxyとして明示する。中央値を審査基準・足切り値とは表現しない。</div>
  </section>
</main>
<script id="report-data" type="application/json">__DATA__</script>
<script>
const D=JSON.parse(document.getElementById('report-data').textContent);
const num=v=>Number(v); const pct=(v,d=1)=>`${num(v).toFixed(d)}%`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const svg=(w,h,body)=>`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
const line=(x1,y1,x2,y2,stroke='var(--line)',dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const text=(x,y,s,opt='')=>`<text x="${x}" y="${y}" ${opt}>${esc(s)}</text>`;

function verticalBars(id,items,{max=null,color='var(--blue)',suffix='%',height=270}={}){
  const el=document.getElementById(id), w=720,h=height, ml=52,mr=18,mt=20,mb=52, pw=w-ml-mr,ph=h-mt-mb;
  const mx=max||Math.max(...items.map(d=>d.value))*1.15; let b='';
  [0,.25,.5,.75,1].forEach(t=>{const y=mt+ph*(1-t);b+=line(ml,y,w-mr,y);b+=text(ml-8,y+4,(mx*t).toFixed(mx>50?0:1),`text-anchor="end" fill="var(--muted)" font-size="11"`)})
  const step=pw/items.length,bw=Math.min(70,step*.54);items.forEach((d,i)=>{const x=ml+i*step+(step-bw)/2,y=mt+ph*(1-d.value/mx),bh=mt+ph-y;b+=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${d.color||color}" rx="2"/>`;b+=text(x+bw/2,y-7,`${d.value.toFixed(1)}${suffix}`,`text-anchor="middle" fill="var(--ink)" font-size="12" font-weight="700"`);b+=text(x+bw/2,h-20,d.label,`text-anchor="middle" fill="var(--muted)" font-size="12"`) });
  el.innerHTML=svg(w,h,b);
}
function horizontalDiff(id,items){const el=document.getElementById(id),w=720,h=items.length*36+54,ml=220,mr=42,mt=24,mb=24,pw=w-ml-mr,min=-.24,max=.02;let b='';const x=v=>ml+(v-min)/(max-min)*pw;b+=line(x(0),mt,x(0),h-mb,'var(--muted)','4 4');[-.2,-.1,0].forEach(v=>{b+=line(x(v),mt,x(v),h-mb);b+=text(x(v),15,`${Math.round(v*100)}pt`,`text-anchor="middle" fill="var(--muted)" font-size="11"`)});items.forEach((d,i)=>{const y=mt+i*36+17;b+=text(ml-10,y+4,d.label,`text-anchor="end" fill="var(--ink)" font-size="11"`);b+=line(x(0),y,x(d.value),y,'var(--blue)');b+=`<circle cx="${x(d.value)}" cy="${y}" r="5" fill="var(--orange)"/>`;b+=text(x(d.value)-8,y-8,`${(d.value*100).toFixed(1)}pt`,`text-anchor="end" fill="var(--orange)" font-size="11" font-weight="700"`)});el.innerHTML=svg(w,h,b)}
function divergingBars(id,items,series,{min=-25,max=25,suffix='%'}={}){const el=document.getElementById(id),w=760,h=items.length*54+68,ml=180,mr=48,mt=34,mb=22,pw=w-ml-mr,ph=h-mt-mb,x=v=>ml+(v-min)/(max-min)*pw;let b='';[min,min/2,0,max/2,max].forEach(v=>{b+=line(x(v),mt,x(v),h-mb,v===0?'var(--muted)':'var(--line)',v===0?'5 4':'');b+=text(x(v),18,`${v}${suffix}`,`text-anchor="middle" fill="var(--muted)" font-size="11"`)});items.forEach((d,i)=>{const y=mt+i*(ph/items.length)+6;b+=text(ml-10,y+17,d.label,`text-anchor="end" fill="var(--ink)" font-size="11"`);series.forEach((s,j)=>{const v=d[s.key],yy=y+j*17,xa=Math.min(x(0),x(v)),ww=Math.abs(x(v)-x(0));b+=`<rect x="${xa}" y="${yy}" width="${ww}" height="11" fill="${s.color}"/>`;b+=text(x(v)+(v<0?-5:5),yy+10,`${v.toFixed(1)}${suffix}`,`${v<0?'text-anchor="end"':''} fill="var(--ink)" font-size="10"`)})});el.innerHTML=`<div class="legend">${series.map(s=>`<span><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`+svg(w,h,b)}
function groupedBars(id,items,series,{max=100,suffix='%',baseline=null,height=null}={}){const el=document.getElementById(id),w=760,h=height||items.length*52+62,ml=180,mr=44,mt=32,mb=20,pw=w-ml-mr,ph=h-mt-mb;let b='';const x=v=>ml+v/max*pw;[0,.25,.5,.75,1].forEach(t=>{b+=line(x(max*t),mt,x(max*t),h-mb);b+=text(x(max*t),18,`${Math.round(max*t)}${suffix}`,`text-anchor="middle" fill="var(--muted)" font-size="11"`)});if(baseline!==null)b+=line(x(baseline),mt,x(baseline),h-mb,'var(--muted)','5 4');items.forEach((d,i)=>{const y=mt+i*(ph/items.length)+5;b+=text(ml-10,y+17,d.label,`text-anchor="end" fill="var(--ink)" font-size="11"`);series.forEach((s,j)=>{const yy=y+j*17;b+=`<rect x="${ml}" y="${yy}" width="${Math.max(0,x(d[s.key])-ml)}" height="11" fill="${s.color}"/>`;b+=text(x(d[s.key])+5,yy+10,`${d[s.key].toFixed(1)}${suffix}`,`fill="var(--ink)" font-size="10"`)})});el.innerHTML=`<div class="legend">${series.map(s=>`<span><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`+svg(w,h,b)}
function lineChart(id,series,{min=0,max=100,suffix='%',labels=['0.60','0.65','0.70','0.75']}={}){const el=document.getElementById(id),w=760,h=300,ml=58,mr=32,mt=35,mb=48,pw=w-ml-mr,ph=h-mt-mb,x=i=>ml+i/(labels.length-1)*pw,y=v=>mt+(max-v)/(max-min)*ph;let b='';[0,.25,.5,.75,1].forEach(t=>{const v=min+(max-min)*t;b+=line(ml,y(v),w-mr,y(v));b+=text(ml-8,y(v)+4,`${v.toFixed(0)}${suffix}`,`text-anchor="end" fill="var(--muted)" font-size="11"`)});labels.forEach((l,i)=>{b+=text(x(i),h-18,l,`text-anchor="middle" fill="var(--muted)" font-size="11"`)});series.forEach(s=>{const pts=s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');b+=`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="3"/>`;s.values.forEach((v,i)=>{b+=`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}"/>`})});el.innerHTML=`<div class="legend">${series.map(s=>`<span><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`+svg(w,h,b)}

verticalBars('roundChart',D.rounds.map(r=>({label:r.round,value:num(r.visible_metric_lagging_pct)})),{max:50});
horizontalDiff('groupChart',D.groups.map(r=>({label:r.metric.replace('（億円）','').replace('（推計）',''),value:num(r.within_round_percentile_difference)})));
groupedBars('applicantChart',D.applicant.map(r=>({label:r.group,share:num(r.mean_above_applicant_share)*100,any:num(r.at_least_one_above_applicant_n)/num(r.n)*100})),[{key:'share',label:'観測指標の平均割合',color:'var(--blue)'},{key:'any',label:'少なくとも1指標',color:'var(--orange)'}],{max:100});

const proxyNames={value_added_increase:'付加価値増加額',value_added_subsidy_ratio:'付加価値／補助金'};
const proxyItems=['1次','2次','3次','4次'].map(rd=>{const o={label:rd};D.proxy.filter(r=>r.round===rd).forEach(r=>o[r.metric_key]=num(r.relative_difference_pct));return o});
divergingBars('proxyChart',proxyItems,[{key:'value_added_increase',label:'付加価値増加額',color:'var(--blue)'},{key:'value_added_subsidy_ratio',label:'付加価値／補助金',color:'var(--orange)'}]);

document.getElementById('profileList').innerHTML=D.profiles.map(r=>`<div class="profile-row"><b>${esc(r.application_profile)}</b><div class="bar-track"><div class="bar-fill" style="width:${num(r.share_pct)}%"></div></div><small>${r.company_count}社 / ${pct(r.share_pct)}</small></div>`).join('');
verticalBars('axisChart',Object.entries(D.deep.strong_axis_distribution).map(([k,v])=>({label:`${k}軸`,value:num(v),color:num(k)===0?'var(--orange)':'var(--blue)'})),{max:130,suffix:'社'});
const thresholdGroups=['全採択企業','可視指標劣後','定量で未説明'];
lineChart('thresholdChart',thresholdGroups.map((g,i)=>({label:g,color:['var(--blue)','var(--orange)','var(--red)'][i],values:D.thresholds.filter(r=>r.group===g).map(r=>num(r.at_least_one_strong_axis_pct))})),{min:0,max:100});

const critNames={management:'経営力',innovation_market:'革新・市場',regional_spillover:'地域波及',feasibility:'実現可能性',policy_relevance:'政策整合'};
const critItems=Object.keys(critNames).map(c=>{const o={label:critNames[c]};['可視指標劣後','定量で未説明'].forEach(g=>{o[g]=num(D.criteria.find(r=>r.group===g&&r.criterion===c).mean_within_round_percentile)*100});return o});
groupedBars('criteriaChart',critItems,[{key:'可視指標劣後',label:'可視指標劣後',color:'var(--blue)'},{key:'定量で未説明',label:'定量で未説明',color:'var(--orange)'}],{max:60,baseline:50});

const pairItems=D.pairFactors.map(r=>({label:r.factor_ja,lower:num(r.lower_strong_share)*100,higher:num(r.higher_strong_share)*100}));
groupedBars('pairChart',pairItems,[{key:'lower',label:'低定量側',color:'var(--orange)'},{key:'higher',label:'高定量側',color:'var(--blue)'}],{max:100});
document.getElementById('pairTable').innerHTML=D.pairFactors.map(r=>`<tr><td data-label="要因">${esc(r.factor_ja)}</td><td data-label="低定量側">${pct(num(r.lower_strong_share)*100)}（${r.lower_strong_count}/40）</td><td data-label="高定量側">${pct(num(r.higher_strong_share)*100)}（${r.higher_strong_count}/40）</td><td data-label="ペア内 p" class="num">${num(r.paired_sign_test_p).toFixed(3)}</td><td data-label="読み方">${num(r.paired_sign_test_p)<.05?'<span class="tag orange">探索的差</span>':'明確な差なし'}</td></tr>`).join('');

function sparkline(values,w=300,h=82){const min=Math.min(...values),max=Math.max(...values),pad=12,x=i=>pad+i/(values.length-1)*(w-pad*2),y=v=>pad+(max-v)/(max-min||1)*(h-pad*2);const pts=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');return svg(w,h,`${line(pad,h-pad,w-pad,h-pad)}<polyline points="${pts}" fill="none" stroke="var(--blue)" stroke-width="3"/>${values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--orange)"/>`).join('')}`)}
document.getElementById('trendGrid').innerHTML=D.trends.map(r=>{const vals=[1,2,3,4,5].map(i=>num(r[`accepted_round_${i}`]));return `<div class="spark"><h4>${esc(r.metric)}</h4><div><span class="value">${r.accepted_round_5}</span> <small>${esc(r.unit)}・5次採択者中央値</small></div>${sparkline(vals)}<div class="chart-note">1→5次：${vals.join(' → ')} ／ 5次申請者 ${r.all_applicants_round_5}</div></div>`}).join('');
document.getElementById('strategyList').innerHTML=D.strategy.map(r=>`<div class="strategy-row"><div class="sno">${esc(r.no)}</div><div><b>${esc(r.metric)}</b><small>${esc(r.unit)}・${esc(r.statistic)}</small></div><div><small>5次 採択者</small><b>${esc(r.fifth_accepted||'—')}</b></div><div><small>実務目安</small><b>${esc(r.practical_competitive_target)}</b><small>Stretch: ${esc(r.stretch_target)}</small></div><div><small>用途 / 注意</small><span>${esc(r.consulting_use)}</span><small>${esc(r.caution)}</small></div></div>`).join('');
verticalBars('financeChart',D.finance.map(r=>({label:r.round,value:num(r.confirmation_share_pct)})),{max:100});
</script>
</body>
</html>'''


OUTPUT.write_text(HTML.replace("__DATA__", DATA), encoding="utf-8")
print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
