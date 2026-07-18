"""Build the standalone expert report for the round-6 reassessment."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Iterable

import pandas as pd


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "round6_adoption_reassessment_report.html"


def esc(value: object) -> str:
    if pd.isna(value):
        return "—"
    return html.escape(str(value))


def fmt(value: object, digits: int = 1) -> str:
    if pd.isna(value):
        return "—"
    number = float(value)
    if abs(number) >= 1000:
        return f"{number:,.{digits}f}"
    return f"{number:.{digits}f}"


def table(headers: list[str], rows: Iterable[Iterable[object]], classes: str = "") -> str:
    head = "".join(f"<th>{esc(label)}</th>" for label in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{value}</td>" for value in row) + "</tr>"
        for row in rows
    )
    return f'<div class="table-wrap"><table class="{classes}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def link(url: object, label: str = "原資料") -> str:
    if pd.isna(url) or not str(url).strip():
        return "—"
    return f'<a href="{html.escape(str(url), quote=True)}" target="_blank" rel="noopener">{esc(label)}</a>'


def metric_validation_summary(frame: pd.DataFrame) -> pd.DataFrame:
    all_rows = frame[frame["sample"].eq("all")].copy()
    grouped = []
    for (no, label, comparability, unit), group in all_rows.groupby(
        ["no", "metric_label", "comparability", "unit"], sort=True
    ):
        grouped.append({
            "no": int(no),
            "label": label,
            "comparability": comparability,
            "unit": unit,
            "observed_n": int(group["observed_n"].sum()),
            "population_n": int(group["sample_cases"].sum()),
            "coverage_pct": 100 * group["observed_n"].sum() / group["sample_cases"].sum(),
            "median_abs_gap_pct": group["median_gap_pct_vs_accepted"].abs().median(),
            "max_abs_gap_pct": group["median_gap_pct_vs_accepted"].abs().max(),
        })
    return pd.DataFrame(grouped).sort_values("no")


def build() -> None:
    summary = json.loads((HERE / "summary.json").read_text(encoding="utf-8"))
    validation = pd.read_csv(HERE / "metric_reconstruction_validation.csv")
    validation_summary = metric_validation_summary(validation)
    sensitivity = pd.read_csv(HERE / "lagging_definition_sensitivity.csv")
    factors = pd.read_csv(HERE / "focused_qualitative_factor_summary.csv")
    selection = pd.read_csv(HERE / "focused_qualitative_selection_summary.csv")
    cases = pd.read_csv(HERE / "case_level_reassessment.csv", low_memory=False)
    studies = pd.read_csv(HERE / "fully_below_case_studies.csv")
    gaps = pd.read_csv(HERE / "official_applicant_accepted_gap_summary.csv")
    effects = pd.read_csv(HERE / "low_group_effect_comparison.csv")
    framework = pd.read_csv(HERE / "round6_numeric_framework.csv")
    changes = pd.read_csv(HERE / "round6_official_changes.csv")
    transitions = pd.read_csv(HERE / "old7_to_current9_transition.csv")
    rounds = pd.read_csv(HERE / "round_summary.csv")
    sources = pd.read_csv(HERE / "source_manifest.csv")

    low = cases[cases["directional8_lagging"].eq(True)].copy()
    low_case_json = []
    for _, row in low.iterrows():
        low_case_json.append({
            "company": row["company"],
            "round": row["round"],
            "industry": "" if pd.isna(row["industry"]) else row["industry"],
            "clean": bool(row["is_clean"]),
            "observed": int(row["directional8_observed_n"]),
            "below": int(row["directional8_below_accepted_n"]),
            "componentWins": int(row["directional_component_win_n"]),
            "level": row["directional_explanation_level"],
            "growth": bool(row["component_growth_win"]),
            "productivity": bool(row["component_productivity_value_win"]),
            "wage": bool(row["component_wage_win"]),
            "pdf": "" if pd.isna(row["pdf_url"]) else row["pdf_url"],
        })
    case_json = json.dumps(low_case_json, ensure_ascii=False).replace("<", "\\u003c")

    primary = summary["directional_primary"]
    dashboard = summary["dashboard_compatible"]
    perm = summary["permutation_baseline"]
    focused = summary["focused_qualitative_review"]
    explanation_total = primary["n"]
    clear_n = primary["two_or_more_component_wins_n"]
    partial_n = primary["one_component_win_n"]
    unexplained_n = primary["zero_component_win_n"]

    sensitivity_primary = sensitivity[
        sensitivity["sample"].eq("all")
        & sensitivity["metric_set"].eq("dashboard_9")
        & sensitivity["min_observed"].eq(5)
    ].sort_values("below_share_threshold")
    sensitivity_bars = "".join(
        f'''<div class="bar-row">
          <div class="bar-label">未満割合 {fmt(100 * row.below_share_threshold, 0)}%</div>
          <div class="bar-track"><span style="width:{min(100, float(row.lagging_pct)):.2f}%"></span></div>
          <div class="bar-value">{int(row.lagging_n)}社（{fmt(row.lagging_pct)}%）</div>
        </div>'''
        for row in sensitivity_primary.itertuples()
    )

    validation_rows = []
    for row in validation_summary.itertuples():
        kind = "ほぼ直接比較" if row.comparability == "comparable" else "推計・近似"
        validation_rows.append([
            f'<span class="metric-no">No.{row.no}</span>',
            esc(row.label),
            f'<span class="badge {"good" if row.comparability == "comparable" else "warn"}">{kind}</span>',
            f'{row.observed_n:,} / {row.population_n:,}<div class="sub">{fmt(row.coverage_pct)}%</div>',
            f'{fmt(row.median_abs_gap_pct_vs_accepted if hasattr(row, "median_abs_gap_pct_vs_accepted") else row.median_abs_gap_pct)}%',
            f'{fmt(row.max_abs_gap_pct)}%',
        ])
    validation_table = table(
        ["指標", "公開PDFから再構築する値", "性質", "観測件数", "中央値差率の中央値（絶対値）", "最大差率（絶対値）"],
        validation_rows,
        "compact",
    )

    factor_total = factors[factors["review_origin"].eq("合計")].copy()
    factor_bars = "".join(
        f'''<div class="factor-row">
          <div><strong>{esc(row.factor_label)}</strong><div class="sub">2点以上を「明確」と符号化</div></div>
          <div class="bar-track factor"><span style="width:{float(row.strong_pct):.2f}%"></span></div>
          <div class="factor-number">{int(row.strong_n)}/{int(row.reviewed_n)}<span>{fmt(row.strong_pct)}%</span></div>
        </div>'''
        for row in factor_total.itertuples()
    )

    study_cards = "".join(
        f'''<article class="case-card">
          <div class="case-head"><div><span class="badge">{esc(row["round"])}</span> <strong>{esc(row["company"])}</strong></div>{link(row["pdf_url"], "公開採択概要 ↗")}</div>
          <h4>{esc(row["case_hypothesis"])}</h4>
          <p>{esc(row["qualitative_evidence"])}</p>
          <div class="sub">方向性8指標：{int(row["directional8_below_accepted_n"])}/{int(row["directional8_observed_n"])}が採択者中央値未満。{("品質除外なし" if bool(row["is_clean"]) else "品質注意フラグあり")}。</div>
        </article>'''
        for _, row in studies.iterrows()
    )

    gap_rows = []
    important = {
        "company_sales_increase", "project_sales_increase", "value_added_increase",
        "employee_pay_total_increase", "value_added_subsidy_ratio",
    }
    for row in gaps.itertuples():
        emphasis = "key-row" if row.metric_key in important else ""
        direction = "採択者が高い" if row.accepted_higher_rounds_n > row.accepted_lower_rounds_n else "採択者が低い／一定せず"
        gap_rows.append([
            f'<span class="{emphasis}">{esc(row.metric_label)}</span>',
            esc(row.unit),
            f'{int(row.accepted_higher_rounds_n)}/{int(row.rounds_n)}',
            fmt(row.median_gap_pct) + "%",
            fmt(row.latest_applicant),
            fmt(row.latest_accepted),
            f'<span class="badge {"good" if direction == "採択者が高い" else "neutral"}">{direction}</span>',
        ])
    gap_table = table(
        ["公式指標", "単位", "採択者＞申請者", "差の中央値", "5次申請者", "5次採択者", "読み方"], gap_rows, "compact"
    )

    framework_rows = []
    for row in framework.itertuples():
        framework_rows.append([
            esc(row.metric_label), esc(row.unit), fmt(row.round5_applicant), fmt(row.round5_accepted),
            fmt(row.round6_theil_sen_reference), fmt(row.stretch_scenario), esc(row.role),
        ])
    framework_table = table(
        ["指標", "単位", "5次申請者", "5次採択者", "1～5次傾向参照", "検討用ストレッチ", "申請設計上の役割"],
        framework_rows,
        "compact numeric",
    )

    effect_rows = []
    for row in effects.itertuples():
        effect_rows.append([
            esc(row.label), fmt(row.low_median), fmt(row.other_median),
            fmt(100 * row.median_ratio_low_to_other) + "%",
        ])
    effect_table = table(
        ["補助的な効果指標", "現行9指標低位群の中央値", "その他採択企業の中央値", "低位群／その他"],
        effect_rows,
        "compact numeric",
    )

    criteria_table = table(
        ["第6次の審査軸", "A001で関連する主な箇所", "審査者が照合できる状態にする内容"],
        [
            ["① 経営力", "7～16、22", "5～10年ビジョン、ポートフォリオ、今回投資、全社成長、賃上げ、資金配分を一つの経営判断として接続"],
            ["② 先進性・成長性", "25、28、30～34", "市場数量、実名需要、競合差、能力制約、価格・販路、付加価値と労働投入、AXを根拠資料と接続"],
            ["③ 地域への波及", "37～45", "足下・完了後の賃上げ、雇用・給与総額、地域調達、域外流出、供給網レジリエンスを金額・人数で提示"],
            ["④ 大規模投資・費用対効果", "50～54", "平時投資との差、見積・価格妥当性、国費1円当たり効果、補助金による行動変容を反実仮想で説明"],
            ["⑤ 実現可能性", "57～65、A003・A004", "責任者、用地、許認可、仕様、発注、採用、資金、工程、リスク代替案、金融機関の審査・支援"],
            ["⑥ 補助金の必要性", "67、A002", "現預金、運転資金、別投資、借入・担保・増資の限界、補助なしの場合の縮小・延期を数値化"],
        ],
        "compact",
    )

    change_cards = "".join(
        f'''<article class="change-card">
          <h4>{esc(row["change"])}</h4>
          <p><strong>公式上の意味：</strong>{esc(row["official_meaning"])}</p>
          <p><strong>申請実務：</strong>{esc(row["application_action"])}</p>
          {link(row["source_url"], "公式資料 ↗")}
        </article>'''
        for _, row in changes.iterrows()
    )

    round_rows = [
        [esc(row["round"]), f'{int(row["public_pdf_n"]):,}', f'{int(row["clean_n"]):,}',
         f'{int(row["dashboard9_low_n"]):,}（{fmt(row["dashboard9_low_pct"])}%）',
         f'{int(row["directional8_low_n"]):,}（{fmt(row["directional8_low_pct"])}%）']
        for _, row in rounds.iterrows()
    ]
    round_table = table(["公募回", "公開PDF", "品質除外なし", "現行9指標低位", "方向性8指標低位"], round_rows, "compact numeric")

    transition_labels = {
        (False, False): "いずれも非該当",
        (False, True): "現行9指標で新規該当",
        (True, False): "旧7指標のみ該当",
        (True, True): "両定義で該当",
    }
    transition_rows = []
    for _, row in transitions[transitions["sample"].eq("all")].iterrows():
        old_flag = str(row["old7_lagging"]).lower() == "true"
        new_flag = str(row["dashboard9_lagging"]).lower() == "true"
        transition_rows.append([
            esc(transition_labels[(old_flag, new_flag)]),
            f'{int(row["n"]):,}',
            fmt(100 * int(row["n"]) / 381) + "%",
        ])
    transition_table = table(["旧7指標→現行9指標", "社数", "全381社比"], transition_rows, "compact numeric")

    source_rows = []
    for row in sources.itertuples():
        location = link(row.location, "公式リンク ↗") if row.source_type == "official" else f'<code>{esc(row.location)}</code>'
        source_rows.append([esc(row.source_type), location, esc(row.use)])
    source_table = table(["種別", "場所", "用途"], source_rows, "compact")

    html_text = f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>第6次申請に向けた採択者中央値未満案件の再分析</title>
<style>
:root {{ --ink:#172235; --muted:#5f6f86; --navy:#16324f; --teal:#0f766e; --teal2:#14b8a6; --orange:#d97706; --red:#b42318; --bg:#f4f7fb; --line:#dbe3ee; --card:#fff; --pale:#edf8f6; --pale-orange:#fff7e8; --pale-blue:#eef5ff; }}
* {{ box-sizing:border-box; }}
html {{ scroll-behavior:smooth; }}
body {{ margin:0; font-family:"Yu Gothic UI","Hiragino Kaku Gothic ProN",Meiryo,sans-serif; color:var(--ink); background:var(--bg); line-height:1.7; }}
a {{ color:#075985; text-decoration-thickness:1px; text-underline-offset:3px; }}
button,input,select {{ font:inherit; }}
.hero {{ background:linear-gradient(125deg,#132a44,#16566a); color:white; padding:48px max(24px,calc((100vw - 1480px)/2)); }}
.eyebrow {{ font-size:13px; letter-spacing:.13em; text-transform:uppercase; opacity:.76; }}
.hero h1 {{ font-size:clamp(27px,3.2vw,46px); line-height:1.25; margin:8px 0 16px; max-width:1100px; }}
.hero p {{ max-width:1040px; margin:0; color:#d9edf2; font-size:16px; }}
.layout {{ display:grid; grid-template-columns:255px minmax(0,1fr); gap:24px; max-width:1480px; margin:0 auto; padding:24px; align-items:start; }}
.toc {{ position:sticky; top:12px; background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; max-height:calc(100vh - 24px); }}
.toc-head {{ display:flex; justify-content:space-between; align-items:center; padding:13px 14px; background:#e7eef7; border-bottom:1px solid var(--line); }}
.toc-head strong {{ font-size:14px; }}
.toc button {{ border:0; background:transparent; color:var(--muted); cursor:pointer; padding:4px 6px; }}
.toc nav {{ padding:8px; overflow:auto; max-height:calc(100vh - 72px); }}
.toc a {{ display:block; padding:7px 8px; border-radius:8px; text-decoration:none; color:#33445d; font-size:13px; line-height:1.45; }}
.toc a:hover {{ background:#eef4fa; }}
.toc.collapsed nav {{ display:none; }}
.toc.collapsed {{ width:max-content; justify-self:end; }}
main {{ min-width:0; }}
section {{ scroll-margin-top:18px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; margin-bottom:22px; box-shadow:0 3px 14px rgba(26,45,70,.045); }}
section h2 {{ font-size:24px; line-height:1.35; margin:0 0 18px; }}
section h3 {{ font-size:18px; margin:28px 0 10px; }}
h4 {{ margin:0 0 6px; font-size:16px; }}
p {{ margin:8px 0 12px; }}
.lead {{ font-size:17px; color:#263951; }}
.sub {{ color:var(--muted); font-size:12px; line-height:1.55; }}
.callout {{ border-left:5px solid var(--teal); background:var(--pale); padding:16px 18px; margin:16px 0; }}
.callout.warn {{ border-color:var(--orange); background:var(--pale-orange); }}
.callout strong:first-child {{ display:block; margin-bottom:4px; }}
.stats {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:18px 0; }}
.stat {{ background:#f8fafc; border:1px solid var(--line); border-radius:12px; padding:15px; }}
.stat .value {{ font-size:30px; line-height:1.15; font-weight:700; color:var(--navy); }}
.stat .label {{ color:var(--muted); font-size:13px; margin-top:5px; }}
.thesis {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:18px 0; }}
.thesis article {{ padding:18px; border-top:4px solid var(--teal); background:#f8fbfd; }}
.thesis article:nth-child(2) {{ border-color:#3b82f6; }} .thesis article:nth-child(3) {{ border-color:var(--orange); }}
.equation {{ background:#f1f5f9; border-radius:10px; padding:12px 14px; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap:anywhere; }}
.stack {{ display:flex; height:46px; border-radius:9px; overflow:hidden; margin:12px 0 8px; color:#fff; font-weight:700; text-align:center; }}
.stack > div {{ display:flex; align-items:center; justify-content:center; min-width:38px; }}
.stack .clear {{ background:#0f766e; }} .stack .partial {{ background:#3b82f6; }} .stack .unknown {{ background:#d97706; }}
.legend {{ display:flex; flex-wrap:wrap; gap:14px; font-size:13px; color:var(--muted); }}
.legend span::before {{ content:""; display:inline-block; width:10px; height:10px; margin-right:5px; border-radius:2px; background:var(--c); }}
.bar-row,.factor-row {{ display:grid; grid-template-columns:160px minmax(160px,1fr) 150px; gap:12px; align-items:center; margin:10px 0; }}
.bar-track {{ height:14px; background:#e7edf4; overflow:hidden; border-radius:999px; }}
.bar-track span {{ display:block; height:100%; background:linear-gradient(90deg,var(--teal),var(--teal2)); }}
.bar-label,.bar-value {{ font-size:13px; }} .bar-value {{ text-align:right; color:var(--muted); }}
.factor-row {{ grid-template-columns:220px minmax(160px,1fr) 120px; }}
.bar-track.factor {{ height:18px; }}
.factor-number {{ text-align:right; font-weight:700; }} .factor-number span {{ display:block; font-size:12px; color:var(--muted); font-weight:400; }}
.table-wrap {{ overflow:auto; border:1px solid var(--line); border-radius:10px; margin:14px 0; }}
table {{ width:100%; border-collapse:collapse; min-width:780px; font-size:13px; }}
th {{ background:#edf2f8; color:#34445b; font-weight:700; text-align:left; position:sticky; top:0; z-index:1; }}
th,td {{ padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
tbody tr:last-child td {{ border-bottom:0; }} tbody tr:hover {{ background:#f8fbfd; }}
table.numeric td:not(:first-child), table.numeric th:not(:first-child) {{ text-align:right; }}
table.compact td,table.compact th {{ padding:7px 8px; }}
.metric-no {{ font-weight:700; white-space:nowrap; }} .key-row {{ font-weight:700; color:#0c4a6e; }}
.badge {{ display:inline-block; border-radius:999px; padding:2px 8px; background:#e9eef5; color:#3b4a60; font-size:11px; white-space:nowrap; }}
.badge.good {{ background:#dff5ee; color:#075b50; }} .badge.warn {{ background:#fff0d4; color:#8b4a05; }} .badge.neutral {{ background:#edf0f4; color:#536174; }}
.case-grid,.change-grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }}
.case-card,.change-card {{ border:1px solid var(--line); border-radius:12px; padding:16px; background:#fbfcfe; }}
.case-head {{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:8px; }}
.case-card p,.change-card p {{ font-size:14px; }}
.criteria-flow {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:18px 0; counter-reset:step; }}
.criteria-flow article {{ position:relative; padding:14px; border-top:3px solid var(--teal); background:#f6fafb; }}
.criteria-flow article::before {{ counter-increment:step; content:counter(step); display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--navy); color:white; font-size:12px; margin-bottom:7px; }}
.checklist {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 22px; padding:0; list-style:none; }}
.checklist li {{ position:relative; padding:8px 8px 8px 34px; border-bottom:1px solid var(--line); }}
.checklist li::before {{ content:"✓"; position:absolute; left:7px; color:var(--teal); font-weight:700; }}
.filters {{ display:grid; grid-template-columns:2fr 1fr 1.5fr auto; gap:10px; margin:12px 0; }}
.filters input,.filters select {{ width:100%; border:1px solid #cbd5e1; background:white; padding:9px 10px; border-radius:8px; }}
.filter-check {{ display:flex; align-items:center; gap:6px; white-space:nowrap; }}
.case-results table {{ min-width:980px; }}
.pill-yes {{ color:#08756a; font-weight:700; }} .pill-no {{ color:#8b95a5; }}
.footnote {{ font-size:12px; color:var(--muted); border-top:1px solid var(--line); padding-top:12px; margin-top:18px; }}
code {{ font-size:12px; overflow-wrap:anywhere; }}
@media(max-width:1050px) {{ .layout {{ grid-template-columns:1fr; }} .toc {{ position:sticky; top:0; z-index:20; max-height:none; }} .toc nav {{ max-height:35vh; }} .toc.collapsed {{ width:100%; justify-self:stretch; }} .stats {{ grid-template-columns:repeat(2,1fr); }} .criteria-flow {{ grid-template-columns:repeat(2,1fr); }} }}
@media(max-width:700px) {{ .hero {{ padding:32px 18px; }} .layout {{ padding:12px; }} section {{ padding:19px 15px; }} .stats,.thesis,.case-grid,.change-grid,.checklist,.criteria-flow {{ grid-template-columns:1fr; }} .bar-row,.factor-row {{ grid-template-columns:1fr; gap:5px; }} .bar-value,.factor-number {{ text-align:left; }} .filters {{ grid-template-columns:1fr; }} }}
@media print {{ body {{ background:white; }} .toc,.filters {{ display:none; }} .layout {{ display:block; padding:0; }} section {{ break-inside:avoid; box-shadow:none; }} .hero {{ background:#16324f !important; print-color-adjust:exact; }} }}
</style>
</head>
<body>
<header class="hero">
  <div class="eyebrow">Accepted-case reassessment / Round 6 application strategy</div>
  <h1>採択者中央値を下回っても採択された案件は、どこまで説明できるか</h1>
  <p>公開企業PDF 381社、1～5次の公式代表値、現行ダッシュボード9指標、目視レビュー44社、第6次事前公開資料を統合した再分析。目的は「中央値を超えるだけ」の助言から、需要・制約・効果・実行性・国費追加性が一つの因果鎖になった申請設計へ移すことです。</p>
</header>
<div class="layout">
<aside class="toc" id="toc">
  <div class="toc-head"><strong>目次</strong><button id="tocToggle" type="button" aria-expanded="true">閉じる</button></div>
  <nav>
    <a href="#conclusion">1. 結論</a><a href="#scope">2. 問いと限界</a><a href="#data">3. データ・再構築妥当性</a>
    <a href="#definition">4. 「中央値未満」の定義</a><a href="#quant">5. 定量的にどこまで説明できるか</a>
    <a href="#qual">6. 44社の定性レビュー</a><a href="#five">7. 方向性8指標すべて未満の5社</a>
    <a href="#official">8. 公式の申請者／採択者差</a><a href="#round6">9. 第6次の制度変更</a>
    <a href="#targets">10. 数値の持っていき方</a><a href="#recipe">11. 通る申請の組み立て</a>
    <a href="#cases">12. 対象113社を確認</a><a href="#limitations">13. 限界・再現手順</a>
  </nav>
</aside>
<main>
<section id="conclusion">
  <h2>1. 結論：中央値未満は「弱い申請」の同義語ではない</h2>
  <p class="lead">最大の知見は、採択者中央値未満案件の大半が、申請者全体から見ても弱いわけではないことです。現行9指標で低位とした118社のうち、117社は少なくとも1指標で同回の申請者代表値以上、80社は観測指標の過半数で申請者代表値以上でした。</p>
  <div class="stats">
    <div class="stat"><div class="value">{dashboard['n']}</div><div class="label">現行9指標の低位案件（381社中）</div></div>
    <div class="stat"><div class="value">{dashboard['any_applicant_win_n']}/{dashboard['n']}</div><div class="label">申請者代表値以上の指標が1つ以上</div></div>
    <div class="stat"><div class="value">{dashboard['applicant_majority_n']}/{dashboard['n']}</div><div class="label">観測指標の過半数が申請者代表値以上</div></div>
    <div class="stat"><div class="value">{unexplained_n}</div><div class="label">方向性8指標ですべて採択者中央値未満</div></div>
  </div>
  <div class="thesis">
    <article><h4>① 中央値は足切りではない</h4><p>単一指標なら、定義上、採択者の約半数は中央値以下です。複数指標も相関するため、「5/8が未満」を独立した5敗と数えるのは過大評価です。</p></article>
    <article><h4>② 108/113社には別の定量的な勝ち筋</h4><p>No.13を方向中立として除いた113社のうち42社は2領域以上、66社は1領域で採択者中央値以上。全面劣後は5社でした。</p></article>
    <article><h4>③ 残る5社は定性だけでなく因果鎖が具体的</h4><p>実名需要、物理的能力制約、工場統合・工程転換、地域供給網、用地・顧客・認証など実行根拠が結び付いていました。</p></article>
  </div>
  <div class="callout"><strong>第6次コンサルの中心命題</strong>「採択者中央値を全部超える」ではなく、公式必須条件を安全に満たしたうえで、<b>外部需要 → 現在の能力制約 → 投資仕様 → 生産・販売増 → 付加価値・賃金・地域波及 → 国費1円当たり効果</b>を同じ数量単位で接続し、金融・人員・工程・補助金必要性まで証拠化することです。</div>
</section>

<section id="scope">
  <h2>2. この分析が答える問い／答えない問い</h2>
  <div class="callout warn"><strong>因果推論・合格確率の推定ではありません</strong>公開されているのは交付決定企業の要約PDFです。非採択企業の個票、審査項目別得点、審査時申請書は非公開なので、「この要素が合否を何点動かすか」「この計画の合格確率は何%か」は推定できません。</div>
  <div class="criteria-flow">
    <article><h4>記述</h4><p>採択者中央値未満案件が何社いるか。</p></article>
    <article><h4>分解</h4><p>成長・生産性／付加価値・賃金の別領域に強みがあるか。</p></article>
    <article><h4>仮説抽出</h4><p>公開要約に繰り返し現れる定性パターンは何か。</p></article>
    <article><h4>制度接続</h4><p>第6次の様式・審査基準で何を証拠化すべきか。</p></article>
  </div>
  <p>したがって本報告の「説明」は、採択済み案件の公開情報における<b>整合的な解釈</b>です。識別力を確かめるには、同業・同規模の非採択申請書または審査点が必要です。</p>
</section>

<section id="data">
  <h2>3. データと企業別指標の再構築妥当性</h2>
  <p>対象は1～4次の公開企業PDF 381社です。うち抽出上の重大な注意フラグがないものは202社。公式代表値の母集団とは件数が一致しないため、企業PDF中央値と公式採択者中央値の一致は「水準妥当性」の確認であり、企業別公式値の検証ではありません。</p>
  {round_table}
  <h3>現行9指標の再構築監査</h3>
  {validation_table}
  <p class="footnote">「中央値差」は、各公募回の公開PDF再構築中央値と公式採択者代表値との差率の絶対値を4公募回で要約。No.8は1.1倍の一律水準補正、No.14は補正前No.8分子÷補助金額。No.8・14は個社公式値の再現ではありません。第2次は公開PDFが25社と少なく、No.1は3社、No.13は11社のみで特に不安定です。</p>
</section>

<section id="definition">
  <h2>4. 「採択者中央値未満案件」の定義は一意ではない</h2>
  <p>ダッシュボード互換定義は「9指標のうち5指標以上が観測でき、同回の採択者中央値未満が60%以上」。118社（31.0%）が該当します。ただしNo.13（投資額／全社売上高）は、1～5次の4回で採択者中央値が申請者中央値より低く、単純に高いほど良い指標ではありません。主要推論ではNo.13を外した方向性8指標を使い、113社（29.7%）を分析対象にしました。</p>
  <div class="equation">低位 = 観測数 ≥ 5 かつ（採択者中央値未満の指標数 ÷ 観測数）≥ 60%</div>
  <h3>閾値感度</h3>
  {sensitivity_bars}
  <p class="sub">現行9指標、観測5指標以上、全381社。50%なら193社、75%なら53社となり、結論は閾値に依存します。</p>
  <h3>旧7指標から現行9指標への入れ替わり</h3>
  {transition_table}
  <p>旧分析の125社をそのまま引き継ぐのは不適切です。No.8・14の追加と最低観測数の統一により、90社のみ共通、35社が外れ、28社が新たに入っています。</p>
</section>

<section id="quant">
  <h2>5. 定量的にどこまで説明できるか</h2>
  <p>方向性8指標を、①全社成長（No.1・2）、②生産性／付加価値（No.7・8・14）、③賃金（No.9・10・11）の3領域に分け、各領域で1指標でも採択者中央値以上なら「領域勝ち」としました。</p>
  <div class="stack" aria-label="113社の定量説明レベル">
    <div class="clear" style="width:{100*clear_n/explanation_total:.2f}%">{clear_n}</div>
    <div class="partial" style="width:{100*partial_n/explanation_total:.2f}%">{partial_n}</div>
    <div class="unknown" style="width:{100*unexplained_n/explanation_total:.2f}%">{unexplained_n}</div>
  </div>
  <div class="legend"><span style="--c:#0f766e">2領域以上で補完 {clear_n}社</span><span style="--c:#3b82f6">1領域で補完 {partial_n}社</span><span style="--c:#d97706">公開方向性定量では未説明 {unexplained_n}社</span></div>
  <div class="callout"><strong>解釈</strong>108/113社（{100*(clear_n+partial_n)/explanation_total:.1f}%）には少なくとも1領域の採択者中央値以上があり、「全部弱いのに採択」ではありません。ただし1指標の勝ちを採択理由と断定するものではなく、領域間の補完可能性を示す記述です。</div>
  <h3>「別の効率指標が高かったから」とは、群全体では説明できない</h3>
  {effect_table}
  <p>売上増／補助金、給与増／補助金、雇用増／補助金も、低位群の中央値はその他採択企業の53～67%でした。したがって「公開9指標は低いが、別の費用対効果で一律に救済された」という説明は棄却すべきです。No.13だけは低位群の方が高く、企業規模に対する投資の大胆さを示しますが、採択者と申請者の公式比較では高いほど有利ではありません。</p>
  <h3>なぜ118社も生じるのか：中央値の性質と指標の非独立性</h3>
  <p>各指標で中央値未満になる確率を単純に50%と置くだけでも、現行の観測数構成では期待値は{fmt(perm['simple_coin_expected'])}社です。118社という件数自体は、隠れた採択基準が大量に働いた証拠ではありません。さらにNo.8とNo.14は同じ付加価値増加額を分子に持ち、No.2・8・10は企業規模の影響を共有します。公募回×指標ごとの実際の上下比率と欠損位置を保ち、企業間で判定を1万回並べ替えた場合は平均{fmt(perm['permutation_expected'])}社、95%範囲{fmt(perm['permutation_q025'],0)}～{fmt(perm['permutation_q975'],0)}社でした。実測118社の上振れは、企業内で低位判定が束になる相関構造と整合しますが、「謎の採択」の直接証拠ではありません。</p>
  <div class="callout warn"><strong>してはいけない読み方</strong>9指標を独立した9票として「6敗3勝」と評価すること。No.13を高いほど良いと採点すること。No.8とNo.14を別々の強み／弱みとして二重計上すること。</div>
</section>

<section id="qual">
  <h2>6. 現行低位44社の目視レビュー</h2>
  <p>既存40ペアの低位側で現行9指標にも該当する20社と、既存レビュー外の現行9指標低位・品質除外なし35社から公募回・業種を分散して選んだ24社、計44社を公開採択概要で再確認しました。0＝記載なし、1＝一般的、2＝具体、3＝強い具体証拠として符号化しています。</p>
  {factor_bars}
  <p><b>事業・工程の構造転換</b>は44/44、<b>能力制約</b>・<b>実行確度</b>・<b>政策整合</b>は各42/44、<b>地域・供給網</b>は40/44で2点以上でした。需要証拠は33/44で、全社に実名発注や契約があるわけではありません。一方、4つの中核要素（需要・制約・転換・地域）のうち3つ以上が具体的だった案件は42/44です。</p>
  <div class="callout warn"><strong>この比率は合否識別力ではない</strong>目的抽出・採択企業のみ・単独かつ非盲検の評価です。例えば「構造転換100%」は、採択企業の公開要約で繰り返される提示様式を示すだけで、非採択企業にも同じ記載がある可能性を排除しません。</div>
  <h3>低定量採択案件で再現可能性が高い提示順</h3>
  <ol>
    <li><b>需要：</b>顧客名、発注・増産要請、失注件数、市場数量、稼働率、待ち期間。</li>
    <li><b>制約：</b>能力／面積／排水／温湿度／防爆／人員／物流など、現在値と上限値。</li>
    <li><b>転換：</b>設備の羅列ではなく、分散→統合、外注→内製、単品→高付加価値、多段→一貫、自動化。</li>
    <li><b>波及：</b>地域雇用だけでなく、供給網の代替困難性、域外流出削減、観光滞在、共同配送、地域産品。</li>
    <li><b>実行：</b>用地、許認可、顧客試験、見積、金融、採用、工程、責任者、リスク代替案。</li>
  </ol>
</section>

<section id="five">
  <h2>7. 方向性8指標の観測値がすべて採択者中央値未満の5社</h2>
  <p>公開定量だけでは補完を見いだせなかった5社です。2社は抽出品質の注意フラグがあり、個別値の読み過ぎにも注意が必要です。それでも公開要約には、投資が必要となる外部需要・能力制約・供給網上の意味が具体的に記載されていました。</p>
  <div class="case-grid">{study_cards}</div>
  <p class="footnote">これらは採択理由の確定ではありません。「公開定量では説明できない残差」に対して、公開要約から最も整合的な仮説を付したものです。</p>
</section>

<section id="official">
  <h2>8. 公式統計が示す、申請者から採択者へ上がる指標</h2>
  <p>1～5次で一貫して採択者が申請者を上回るのは、成長率だけでなく<b>売上・付加価値・給与総額の絶対増加</b>と<b>補助金額当たり付加価値</b>です。第5次でも、補助事業売上高増加額は57.4→74.8億円、付加価値増加額は19.9→28.1億円、給与総額増加額は2.8→3.9億円、付加価値増加額／補助金額は171→213%でした。</p>
  {gap_table}
  <div class="callout"><strong>申請助言への変換</strong>率だけを上げるのではなく、①何億円の売上を追加し、②何億円の付加価値を増やし、③何億円の給与を地域に追加し、④補助金1億円当たり何億円の付加価値を生むかを並べてください。No.13は「高いほど良い」ではなく、企業規模に対する投資の大胆さと実現可能性の文脈指標です。</div>
</section>

<section id="round6">
  <h2>9. 第6次で重要度が増した論点</h2>
  <p>第6次は事前公開段階であり、正式公募開始時の資料で更新確認が必要です。公式審査は経営力、先進性・成長性、地域波及、大規模投資・費用対効果、実現可能性、補助金の必要性から構成され、書面の定量面に加えて経営者プレゼンで定性面も評価されます。第5次は198件申請、147件が書面通過、77件が最終採択でしたが、この段階数から審査配点を逆算することはできません。</p>
  <div class="callout"><strong>まず満たすべき公式要件</strong>一般企業は投資額20億円以上（外注費・専門家経費を除く補助対象経費、税抜）かつ完了後3年間の補助事業従業員等1人当たり給与支給総額CAGR 5.0%以上。100億宣言企業は投資額15億円以上、同4.5%以上です。補助上限50億円、補助率1/3以下。これらは審査上の目標ではなく入口要件・返還条件です。</div>
  <div class="change-grid">{change_cards}</div>
  <h3>実務上の優先順位</h3>
  <ol>
    <li><b>足下の全社賃上げ：</b>基準年度後だけでなく、直近決算から基準年度までの全社賃上げを年次で設計。事前公開資料が参照する2025年CPI 3.2%は最低限の参考であり、それを上回る実行可能な水準と原資を説明する。</li>
    <li><b>補助金の必要性：</b>現預金が多い企業ほど、運転資金・別投資・M&A・借入余力・担保・増資検討・補助なし反実仮想を数値で示す。</li>
    <li><b>資金の確度：</b>金融機関／ファンドの出資・融資表明書は大幅加点だが、未実行の取消リスクがある。盛らずに実行可能額を確定する。</li>
    <li><b>モニタリング：</b>売上・能力・稼働・付加価値・賃金を同じKPIツリーで月次／四半期管理し、下振れ時の経営判断を記す。</li>
  </ol>
</section>

<section id="targets">
  <h2>10. 第6次で数値をどう持っていくか</h2>
  <p>下表の「1～5次傾向参照」は採択者公式値のTheil–Sen直線を第6次へ外挿した頑健な参考、「検討用ストレッチ」は事業計画を逆算するためのシナリオです。いずれも公式足切り・合格基準ではありません。</p>
  {framework_table}
  <div class="callout warn"><strong>中央値を目標値にしない</strong>中央値を少し超えるように数字を作ると、需要証拠、設備能力、価格・数量、P/L、人員、賃上げの間で矛盾が生じます。まず裏付け可能な需要数量と制約解消能力からボトムアップで計算し、その結果を申請者・採択者公式値と比較してください。</div>
  <h3>案件別の三段階表示</h3>
  <ul>
    <li><b>必達：</b>公式の要件・返還条件を安全余裕込みで満たす数値。</li>
    <li><b>ベース：</b>受注確度、歩留まり、稼働率、採用期間を保守的に積み上げた取締役会コミット値。</li>
    <li><b>上振れ：</b>追加顧客・高稼働・価格改善を条件にしたシナリオ。審査用の約束と混同しない。</li>
  </ul>
</section>

<section id="recipe">
  <h2>11. 「通る申請」を作るための実務レシピ</h2>
  <p class="lead">良い申請は、強い形容詞ではなく、同じ数量が資料全体を貫きます。市場予測100ではなく、顧客別需要→設備能力→販売数量→損益→付加価値→賃金→地域波及→国費効果まで照合できる状態を作ります。</p>
  <div class="criteria-flow">
    <article><h4>需要台帳</h4><p>顧客・用途・数量・時期・確度・証拠資料を1行1案件で管理。</p></article>
    <article><h4>制約台帳</h4><p>現能力、最大稼働、失注、外注、リードタイム、品質条件を定量化。</p></article>
    <article><h4>能力ブリッジ</h4><p>設備ごとのCT・稼働・歩留まり・人員から増産可能量を計算。</p></article>
    <article><h4>財務ブリッジ</h4><p>数量×単価→粗利→営業利益→減価償却→付加価値→給与原資。</p></article>
    <article><h4>費用対効果</h4><p>補助金1億円当たり売上・付加価値・給与・雇用・域外流出削減。</p></article>
    <article><h4>実行ゲート</h4><p>用地、許認可、見積、発注、採用、金融、認証を日付と責任者で管理。</p></article>
    <article><h4>追加性</h4><p>補助なしなら何を何年遅らせ、能力・雇用・波及がどれだけ失われるか。</p></article>
    <article><h4>経営者説明</h4><p>経営判断、資源配分、モニタリング、撤退／修正基準を自分の言葉で話す。</p></article>
  </div>
  <h3>申請前レビュー・チェックリスト</h3>
  <ul class="checklist">
    <li>実名顧客、LOI、注文、増産要請、問い合わせ、失注ログのいずれかがある。</li>
    <li>現状能力と投資後能力が同じ単位・時間基準・歩留まりで比較できる。</li>
    <li>設備費と売上増の間に「何台×何個×稼働率×単価」のブリッジがある。</li>
    <li>補助事業売上と全社売上の二重計上、グループ／単体の混同がない。</li>
    <li>付加価値額は公式Excelの営業利益＋給与＋役員給与＋減価償却と一致する。</li>
    <li>賃上げは率だけでなく人数・給与総額・原資・未達時対応まで説明できる。</li>
    <li>地域波及は雇用人数だけでなく、仕入・外注・物流・観光消費等を金額化する。</li>
    <li>現預金、運転資金、別投資、借入、増資、補助なしケースの資金表がある。</li>
    <li>金融機関表明書の金額・条件・実行時期が事業スケジュールと一致する。</li>
    <li>経営者が5分で需要→制約→投資→効果→必要性を数値付きで説明できる。</li>
  </ul>
  <h3>第6次A001・関連様式との対応</h3>
  <p>スライド番号は事前公開版A001に基づきます。正式版で必ず再照合してください。A002の数値、A001の文章・図、A003/A004の金融確認で年度・法人範囲・金額を一致させます。</p>
  {criteria_table}
  <div class="callout"><strong>中央値未満を許容できる条件</strong>低い指標を隠さず、なぜ低いか、その代わりにどの効果を最大化するか、公式要件をどう安全に履行するかを明示すること。特に絶対効果または国費当たり効果で弱い場合は、実名需要・能力制約・地域供給網・追加性・実行確度の証拠密度を上げる必要があります。</div>
</section>

<section id="cases">
  <h2>12. 方向性8指標低位113社を確認する</h2>
  <p>会社名・業種・公募回・定量補完レベルで絞り込めます。「公開定量では未説明」の5社は上の個別精査対象です。</p>
  <div class="filters">
    <input id="caseSearch" type="search" placeholder="会社名・業種を検索（例：半導体、ホテル）" aria-label="会社名・業種を検索">
    <select id="roundFilter" aria-label="公募回"><option value="">全公募回</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select>
    <select id="levelFilter" aria-label="定量説明レベル"><option value="">全説明レベル</option><option>明確な定量補完（領域2以上）</option><option>部分的な定量補完（領域1）</option><option>公開方向性定量では未説明</option></select>
    <label class="filter-check"><input id="cleanFilter" type="checkbox"> 品質除外なしのみ</label>
  </div>
  <div id="caseCount" class="sub" aria-live="polite"></div>
  <div class="table-wrap case-results"><table><thead><tr><th>公募回</th><th>企業</th><th>業種</th><th>未満／観測</th><th>領域勝ち</th><th>成長</th><th>生産性・付加価値</th><th>賃金</th><th>説明レベル</th><th>品質</th><th>原資料</th></tr></thead><tbody id="caseBody"></tbody></table></div>
</section>

<section id="limitations">
  <h2>13. 限界・再現手順・データ</h2>
  <ul>
    <li>不採択企業個票と審査点がないため、因果効果、配点、合格確率は推定できません。</li>
    <li>公開PDFは交付決定後の要約で、審査時申請書や公式採択者母集団と一致しません。</li>
    <li>No.8・14は集計中央値の水準を近づけた近似で、企業別公式値ではありません。</li>
    <li>目視44社は目的抽出・採択企業のみ・単独非盲検評価です。次段階は二重符号化と非採択比較です。</li>
    <li>第6次は事前公開版に基づきます。正式公募要領・様式公開時に差分確認が必要です。</li>
  </ul>
  <h3>再現</h3>
  <div class="equation">python analyze_round6_reassessment.py<br>python build_round6_reassessment_report.py</div>
  <p>分析コード、ケース別判定、感度分析、公式差、目視符号化、出典一覧を同じフォルダに保存しています。</p>
  {source_table}
  <p class="footnote">主な出力：<a href="case_level_reassessment.csv">ケース別再評価CSV</a>／<a href="focused_qualitative_review_44.csv">44社目視レビューCSV</a>／<a href="metric_reconstruction_validation.csv">指標再構築検証CSV</a>／<a href="official_applicant_accepted_gaps_by_round.csv">公式差の公募回別CSV</a>／<a href="round6_numeric_framework.csv">第6次数値フレームCSV</a></p>
</section>
</main>
</div>
<script>
const cases = {case_json};
const body = document.getElementById('caseBody');
const count = document.getElementById('caseCount');
const search = document.getElementById('caseSearch');
const round = document.getElementById('roundFilter');
const level = document.getElementById('levelFilter');
const clean = document.getElementById('cleanFilter');
function yn(value) {{ return value ? '<span class="pill-yes">●</span>' : '<span class="pill-no">—</span>'; }}
function safe(value) {{ const span=document.createElement('span'); span.textContent=value ?? ''; return span.innerHTML; }}
function renderCases() {{
  const q = search.value.trim().toLowerCase();
  const filtered = cases.filter(c => (!q || (c.company+' '+c.industry).toLowerCase().includes(q)) && (!round.value || c.round===round.value) && (!level.value || c.level===level.value) && (!clean.checked || c.clean));
  count.textContent = `${{filtered.length}}社 / ${{cases.length}}社`;
  body.innerHTML = filtered.map(c => `<tr><td>${{safe(c.round)}}</td><td><strong>${{safe(c.company)}}</strong></td><td>${{safe(c.industry)}}</td><td>${{c.below}}/${{c.observed}}</td><td>${{c.componentWins}}</td><td>${{yn(c.growth)}}</td><td>${{yn(c.productivity)}}</td><td>${{yn(c.wage)}}</td><td>${{safe(c.level)}}</td><td>${{c.clean?'除外なし':'注意'}}</td><td><a href="${{safe(c.pdf)}}" target="_blank" rel="noopener">PDF ↗</a></td></tr>`).join('');
}}
[search,round,level,clean].forEach(el => el.addEventListener('input',renderCases));
renderCases();
const toc = document.getElementById('toc'); const tocButton = document.getElementById('tocToggle');
tocButton.addEventListener('click', () => {{ const collapsed=toc.classList.toggle('collapsed'); tocButton.textContent=collapsed?'目次を開く':'閉じる'; tocButton.setAttribute('aria-expanded', String(!collapsed)); }});
if (window.innerWidth <= 1050) {{ toc.classList.add('collapsed'); tocButton.textContent='目次を開く'; tocButton.setAttribute('aria-expanded','false'); }}
</script>
</body>
</html>'''
    OUTPUT.write_text(html_text, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    build()
