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
    gap_detail = pd.read_csv(HERE / "official_applicant_accepted_gaps_by_round.csv")
    effects = pd.read_csv(HERE / "low_group_effect_comparison.csv")
    robustness = pd.read_csv(HERE / "metric_set_robustness.csv")
    value_added_loro = pd.read_csv(HERE / "value_added_leave_one_round_out.csv")
    pair_comparison = pd.read_csv(HERE / "qualitative_pair_comparison.csv")
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
    strict_clear_n = primary["strict_two_or_more_component_n"]
    strict_partial_n = primary["strict_one_component_n"]
    strict_unexplained_n = primary["strict_zero_component_n"]

    sensitivity_primary = sensitivity[
        sensitivity["sample"].eq("all")
        & sensitivity["metric_set"].eq("dashboard_9")
        & sensitivity["min_observed"].eq(5)
    ].sort_values("below_share_threshold")
    sensitivity_bars = "".join(
        f'''<div class="bar-row">
          <div class="bar-label">未満割合 {fmt(100 * row.below_share_threshold, 0)}%</div>
          <div class="bar-track"><span style="width:{min(100, float(row.conditional_lagging_pct)):.2f}%"></span></div>
          <div class="bar-value">{int(row.lagging_n)}/{int(row.eligible_n)}（{fmt(row.conditional_lagging_pct)}%）</div>
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
        if row.accepted_higher_rounds_n >= max(3, row.rounds_n - 1):
            direction, badge_kind = "概ね採択者が高い", "good"
        elif row.accepted_equal_rounds_n >= 3:
            direction, badge_kind = "差は不明瞭", "neutral"
        elif row.accepted_lower_rounds_n >= 3:
            direction, badge_kind = "概ね採択者が低い", "neutral"
        else:
            direction, badge_kind = "公募回で混在", "neutral"
        gap_rows.append([
            f'<span class="{emphasis}">{esc(row.metric_label)}</span>',
            esc(row.unit),
            f'{int(row.accepted_higher_rounds_n)}/{int(row.rounds_n)}',
            fmt(row.median_gap_pct) + "%",
            fmt(row.latest_applicant),
            fmt(row.latest_accepted),
            f'<span class="badge {badge_kind}">{direction}</span>',
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

    robustness_rows = [
        [
            esc(row.specification), esc(row.definition),
            f"{int(row.n):,}/{int(row.eligible_n):,}<div class=\"sub\">{fmt(row.conditional_pct)}%</div>",
            f"{int(row.clean_n):,}/{int(row.clean_eligible_n):,}<div class=\"sub\">{fmt(row.clean_conditional_pct)}%</div>",
            fmt(row.jaccard_with_dashboard9, 2),
        ]
        for row in robustness.itertuples()
    ]
    robustness_table = table(
        ["仕様", "操作的定義", "該当／判定可能", "品質除外なし：該当／判定可能", "現行9指標とのJaccard"],
        robustness_rows,
        "compact",
    )

    loro_rows = [
        [
            esc(row.round), f"{int(row.observed_n):,}", fmt(row.raw_proxy_median),
            fmt(row.official_accepted_median), fmt(row.loro_factor, 3),
            fmt(row.heldout_predicted_median), fmt(row.heldout_error_pct) + "%",
        ]
        for row in value_added_loro.itertuples()
    ]
    loro_table = table(
        ["除外公募回", "粗近似n", "粗近似中央値", "公式採択者中央値", "他3回で作る係数", "除外回予測", "誤差率"],
        loro_rows,
        "compact numeric",
    )

    pair_rows = [
        [
            esc(row.factor_ja), fmt(row.lower_mean_score, 3), fmt(row.higher_mean_score, 3),
            fmt(row.mean_score_gap_lower_minus_higher, 3), fmt(row.paired_sign_test_p, 3),
            fmt(row.bonferroni_p_6, 3), esc(row.interpretation),
        ]
        for row in pair_comparison.itertuples()
    ]
    pair_table = table(
        ["要素", "低位側平均", "高位側平均", "低位－高位", "符号検定p", "6要素補正p", "解釈"],
        pair_rows,
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

    proxy_definition_table = table(
        ["指標", "企業PDF値の構築方法", "公式値との差・取扱い"],
        [
            ["No.1 全社売上高CAGR", "（公開目標売上高÷公開基準売上高）^(1/年数)－1", "年度・連結／単体の対応を確認できる場合のみ使用。公式企業別値ではない。"],
            ["No.2 全社売上高増加額", "公開目標売上高－公開基準売上高", "同一主体・同一売上系列を優先。複数系列や期間曖昧は品質注意。"],
            ["No.7・9・11 各CAGR", "PDF記載率を基本的にそのまま使用", "公開PDFに記載された率として最も直接比較しやすいが、公式提出時の非公開値との同一性は保証されない。"],
            ["No.8 付加価値増加額", "{（目標労働生産性×目標従業員数）－（基準労働生産性×基準従業員数）}÷10,000×1.1", "公式は営業利益＋従業員給与＋役員給与＋減価償却費。人数も就業時間換算従業員＋役員であり一致しない。1.1は集計中央値の水準補正。"],
            ["No.10 給与総額増加額", "{（目標1人当たり給与×目標従業員数）－（基準1人当たり給与×基準従業員数）}÷10,000", "公開人数の主体・範囲が公式の常時使用従業員と一致する保証がないため、企業別公式値ではない。"],
            ["No.13 投資額／全社売上高", "公開事業費（百万円）÷公開基準売上高（億円）", "第6次の公式審査では高水準を正方向評価。一方、1～5次の採択者・申請者代表値では単調差が確認できないため、除外結果は感度分析としてのみ使用。"],
            ["No.14 付加価値増加額／補助金", "No.8の1.1倍前の粗近似分子÷公開補助金額×100", "No.8と同じ分子情報を共有するため、独立した証拠として二重計上しない。"],
        ],
        "compact",
    )

    evidence_table = table(
        ["区分", "根拠", "このレポートでの扱い", "許される表現"],
        [
            ["A 公式要件", "第6次の公式公募要領・様式", "申請要件、返還・取消条件", "満たす必要がある／未達リスクがある"],
            ["B 公式評価項目", "第6次の公式審査基準", "評価方向・加点項目", "審査で評価される／高水準が正方向"],
            ["C 公開データ上の観察", "381企業レコードと1～5次の公式代表値", "操作的定義、記述統計、感度分析", "収録範囲で何件・どの傾向が観測された"],
            ["D 採択案件の記載パターン", "目的抽出した採択44社の目視符号化", "探索仮説。採否識別力は未検証", "公開要約に反復して現れた"],
            ["E 分析者の実務提案", "A～Dと申請実務を接続した提案", "公式要件ではない", "整合性・説明可能性を高めるため推奨する"],
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

    official_accepted_by_round = (
        gap_detail.groupby("round", sort=False)["accepted_n"].max().to_dict()
    )
    round_rows = []
    for _, row in rounds.iterrows():
        official_n = official_accepted_by_round.get(row["round"], float("nan"))
        round_rows.append([
            esc(row["round"]), f'{int(official_n):,}' if pd.notna(official_n) else "—",
            f'{int(row["public_pdf_n"]):,}', f'{int(row["clean_n"]):,}',
            f'{int(row["dashboard9_low_n"]):,}（全レコードの{fmt(row["dashboard9_low_pct"])}%）',
            f'{int(row["directional8_low_n"]):,}（全レコードの{fmt(row["directional8_low_pct"])}%）',
        ])
    round_table = table(
        ["公募回", "公式採択案件数", "収録企業レコード", "品質除外なし", "現行9指標低位", "No.13除外感度"],
        round_rows,
        "compact numeric",
    )

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
    <a href="#conclusion">1. 結論</a><a href="#scope">2. 問いと限界</a><a href="#data">3. データ・集計水準整合</a>
    <a href="#definition">4. 「中央値未満」の定義</a><a href="#quant">5. 中央値以上観測の残存</a>
    <a href="#qual">6. 目的抽出44社の記載パターン</a><a href="#five">7. 全観測値が未満の精査対象</a>
    <a href="#official">8. 公式の申請者／採択者差</a><a href="#round6">9. 第6次の制度変更</a>
    <a href="#targets">10. 付録：過去値と探索シナリオ</a><a href="#recipe">11. 説明可能性を高める設計</a>
    <a href="#cases">12. No.13除外感度の113社</a><a href="#limitations">13. 限界・再現手順</a>
  </nav>
</aside>
<main>
<section id="conclusion">
  <h2>1. 結論：確認できたのは採択理由ではなく、「中央値未満」分類の構造</h2>
  <p class="lead">現行9指標で判定可能な373企業レコードのうち118（31.6%）、品質除外なしでは199中58（29.1%）が操作的な低位定義に該当しました。しかし、各指標が独立に50%の確率で中央値未満になる単純モデルでも期待値は114.6です。したがって、118という件数自体は例外的採択や隠れた審査基準の証拠ではありません。</p>
  <div class="stats">
    <div class="stat"><div class="value">{dashboard['n']}/{dashboard['eligible_n']}</div><div class="label">現行9指標で判定可能な企業レコード中</div></div>
    <div class="stat"><div class="value">{dashboard['any_applicant_win_n']}/{dashboard['n']}</div><div class="label">申請者代表値以上の指標が1つ以上</div></div>
    <div class="stat"><div class="value">{dashboard['applicant_half_or_more_n']}/{dashboard['n']}</div><div class="label">観測指標の半数以上が申請者代表値以上（過半数67、厳密超過の過半数58）</div></div>
    <div class="stat"><div class="value">5～9</div><div class="label">比較仕様により中央値以上の観測が残らない企業数</div></div>
  </div>
  <div class="thesis">
    <article><h4>① 分類は仕様依存</h4><p>現行9指標118、No.8除外101、No.13・14除外134、構成単位164。旧7指標からも35社が外れ28社が加わり、単一の「低位群」は安定しません。</p></article>
    <article><h4>② 非未満指標の残存は採択理由ではない</h4><p>No.13除外感度113社のうち108社には1領域以上で中央値以上が残りますが、これは60%未満という選定規則の裏返しを含み、審査上の補償を証明しません。</p></article>
    <article><h4>③ 定性要素は申請設計仮説</h4><p>全観測値が未満となる少数社には需要・能力制約・構造転換等の具体記載がありますが、非採択対照がないため採否識別要因ではありません。</p></article>
  </div>
  <div class="callout"><strong>最終的に言えること</strong>本分析が示すのは、採択者中央値未満という分類が全面的な定量劣後を意味しないことです。少数の残差群に見られる定性記載は、第6次の公式審査項目と整合する申請設計仮説として扱えますが、採択を保証する要因とはいえません。</div>
</section>

<section id="scope">
  <h2>2. この分析が答える問い／答えない問い</h2>
  <div class="callout warn"><strong>因果推論・合格確率の推定ではありません</strong>公開されているのは交付決定企業の要約PDFです。非採択企業の個票、審査項目別得点、審査時申請書は非公開なので、「この要素が合否を何点動かすか」「この計画の合格確率は何%か」は推定できません。</div>
  <div class="criteria-flow">
    <article><h4>記述</h4><p>操作的定義に該当する企業レコードがいくつあるか。</p></article>
    <article><h4>分解</h4><p>成長・生産性／付加価値・賃金の別領域に強みがあるか。</p></article>
    <article><h4>仮説抽出</h4><p>公開要約に繰り返し現れる定性パターンは何か。</p></article>
    <article><h4>制度接続</h4><p>第6次の様式・審査基準で何を証拠化すべきか。</p></article>
  </div>
  <p>したがって本報告の「説明」は、採択済み企業の公開情報における<b>整合的な解釈</b>です。識別力を確かめるには、同業・同規模の非採択申請書または審査点が必要です。</p>
  <h3>結論の証拠レベル</h3>
  {evidence_table}
  <h3>本文で使う用語</h3>
  <ul>
    <li><b>公式代表値：</b>事務局公表の申請者全体・採択者の中央値等。指標によって平均値の場合があるため、総称として「代表値」とします。</li>
    <li><b>企業PDF値：</b>交付決定後の公開要約に記載された値、または複数の公開値から再構築した近似値。審査時の企業別公式値ではありません。</li>
    <li><b>低位：</b>本分析の操作的なスクリーニング定義への該当。審査上の低評価・不合格水準を意味しません。</li>
    <li><b>中央値以上の観測が残る：</b>別領域に採択者代表値以上の公開指標があるという記述。採択理由、審査上の補償、因果効果を意味しません。</li>
    <li><b>品質除外なし：</b>率定義・代表主体・算術対応などに重大な注意フラグが付いていないケース。正確性を保証する認証ではありません。</li>
  </ul>
</section>

<section id="data">
  <h2>3. データ、分析単位、集計水準の整合確認</h2>
  <p>分析単位は、1～4次の交付決定後公開PDFから作った381の<b>企業レコード</b>です。申請案件母集団ではありません。共同申請・公開時点・収録単位が異なるため、1次のように収録企業レコード数が公式採択案件数を上回る回もあります。公式申請者・採択者代表値との比較は独立2群比較でも、企業別値の検証でもありません。</p>
  {round_table}
  <p class="sub">「申請者全体」には採択者も含まれます。公式代表値は丸め値であり、小差・同値を強く解釈しません。</p>
  <h3>現行9指標の集計水準整合</h3>
  {validation_table}
  <h3>主要な企業PDF値の定義</h3>
  {proxy_definition_table}
  <p>品質注意179社は、率定義の曖昧さ135件、代表主体の曖昧さ56件、事業費本文との不一致13件、率の算術不一致8件、売上の算術不一致6件を含みます（重複あり）。このため全381社と品質除外なし202社を併記します。</p>
  <p class="footnote">「中央値差率」は（企業PDF中央値÷公式採択者代表値－1）×100。その絶対値を4公募回で要約しています。No.8は同じ1～4次の公式水準を参考に1.1倍しているため、表はインサンプル較正後の整合であり「妥当性検証」ではありません。第2次はNo.1が3社、No.13が11社のみで特に不安定です。</p>
  <h3>No.8の公募回外チェック</h3>
  <p>1公募回を除外し、残る3回の「公式中央値÷粗近似中央値」の中央値を係数として除外回を予測しました。誤差率は−5.4%～+13.5%ですが、検証単位は4個の公募回中央値だけです。企業別精度、順位精度、誤差分布は未検証です。</p>
  {loro_table}
</section>

<section id="definition">
  <h2>4. 「採択者中央値未満案件」の定義は一意ではない</h2>
  <p>ダッシュボード互換定義は「9指標のうち5指標以上が観測でき、同回の採択者中央値未満が60%以上」です。判定可能373企業レコード中118（31.6%）、品質除外なしでは199中58（29.1%）が該当します。全381レコードを分母にした31.0%は、判定不能8レコードも含む参考値です。</p>
  <p>No.13（投資額／全社売上高）は、第6次の公式審査では高水準を正方向に評価します。一方、過去の申請者・採択者代表値には一貫した上下差がなく、過去採択の識別指標としての単調性は確認できません。このためNo.13除外8指標は主分析ではなく感度分析です。同仕様では判定可能371中113（30.5%）、品質除外なし198中55（27.8%）が該当します。</p>
  <div class="equation">低位 = 観測数 ≥ 5 かつ（採択者中央値未満の指標数 ÷ 観測数）≥ 60%</div>
  <p class="sub">観測数5は、9指標の過半を実測できないケースを主要判定から外すための最低情報量です。60%は「観測指標の明確な過半が未満」を抽出する操作的閾値であり、制度上・統計理論上の境界ではありません。この任意性を隠さないため、最低観測数と割合を系統的に変えた感度分析を併記します。</p>
  <h3>閾値感度</h3>
  {sensitivity_bars}
  <p class="sub">現行9指標、観測5指標以上の判定可能373レコード。50%なら193/373、75%なら53/373となり、該当数は閾値に依存します。</p>
  <h3>旧7指標から現行9指標への入れ替わり</h3>
  {transition_table}
  <p>旧分析の125社をそのまま引き継ぐのは不適切です。No.8・14の追加と最低観測数の統一により、90社のみ共通、35社が外れ、28社が新たに入っています。</p>
  <h3>指標集合を変えた頑健性確認</h3>
  {robustness_table}
  <p class="sub">No.8とNo.14は同じ付加価値増加額を共有し、No.2・8・10には企業規模の共通要因があります。該当数は101～176、構成単位判定では164まで動きます。したがって「低位群」はデータに内在する唯一の集団ではなく、分析仕様が作る比較群です。</p>
</section>

<section id="quant">
  <h2>5. 中央値以上の観測値がどこに残るか</h2>
  <p>No.13除外感度の8指標を、①全社成長（No.1・2）、②生産性／付加価値（No.7・8・14）、③賃金（No.9・10・11）の3領域に分けました。各領域に同回の採択者中央値以上の指標が1つでもあれば「中央値以上の観測値あり」と数えます。これは記述分類であり、審査上の補償、優位性、採択理由を意味しません。</p>
  <div class="stack" aria-label="113社の定量説明レベル">
    <div class="clear" style="width:{100*clear_n/explanation_total:.2f}%">{clear_n}</div>
    <div class="partial" style="width:{100*partial_n/explanation_total:.2f}%">{partial_n}</div>
    <div class="unknown" style="width:{100*unexplained_n/explanation_total:.2f}%">{unexplained_n}</div>
  </div>
  <div class="legend"><span style="--c:#0f766e">2領域以上に中央値以上あり {clear_n}社</span><span style="--c:#3b82f6">1領域に中央値以上あり {partial_n}社</span><span style="--c:#d97706">観測指標に中央値以上なし {unexplained_n}社</span></div>
  <div class="callout"><strong>定義上の注意</strong>同値を含む判定では42／66／5、代表値を厳密に上回る場合だけ数えると{strict_clear_n}／{strict_partial_n}／{strict_unexplained_n}です。108/113に1領域以上が残ることは、60%以上未満という抽出規則の裏返しを大きく含みます。採択を説明した割合として読んではいけません。</div>
  <h3>別の効率指標による一般的な補完は、単純中央値では確認できない</h3>
  {effect_table}
  <p>売上増／補助金、給与増／補助金、雇用増／補助金についても、低位群の中央値はその他採択企業の53～67%でした。公募回・業種・規模を調整しない探索的比較ですが、「公開9指標は低くても別の費用対効果が一般に高い」という単純な説明を支持しません。No.13は低位群の方が高いものの、公式には正方向評価、過去集計では識別性が不明瞭という二つの事実を分けて扱います。</p>
  <h3>なぜ118社も生じるのか：中央値の性質と指標の非独立性</h3>
  <p>各指標で中央値未満になる確率を仮に50%と置くと、現行の観測数構成における期待値は{fmt(perm['simple_coin_expected'])}社です。公開PDF母集団は公式中央値の算出母集団と同一ではないため、これは理論比較にすぎません。さらに、公募回×指標ごとの実際の上下比率と欠損位置を固定し、企業間で判定だけを1万回並べ替える帰無分布は平均{fmt(perm['permutation_expected'])}社、95%範囲{fmt(perm['permutation_q025'],0)}～{fmt(perm['permutation_q975'],0)}社、実測118社以上となる片側p={fmt(perm['permutation_p_ge_observed'],4)}でした。これは企業内で低位判定が束になる相関を示しますが、採択要因の検定ではありません。</p>
  <div class="callout warn"><strong>してはいけない読み方</strong>9指標を独立した9票として「6敗3勝」と評価すること。No.13を高いほど良いと採点すること。No.8とNo.14を別々の強み／弱みとして二重計上すること。</div>
</section>

<section id="qual">
  <h2>6. 目的抽出44社の公開要約に反復して現れた要素</h2>
  <p>既存40ペアの低位側で現行9指標にも該当する20社と、既存レビュー外の現行9指標低位・品質除外なし35社から、公募回・業種の偏りを抑えて選んだ24社、計44社を公開採択概要で確認しました。対象は採択後の公開要約であり、審査時申請書ではありません。0＝記載なし、1＝一般的、2＝具体、3＝強い具体証拠として、単独評価者が非盲検で符号化しました。</p>
  {factor_bars}
  <p><b>事業・工程の構造転換</b>は44/44、<b>能力制約</b>・<b>実行確度</b>・<b>政策整合</b>は各42/44、<b>地域・供給網</b>は40/44で2点以上でした。需要証拠は33/44で、全社に実名発注や契約があるわけではありません。一方、4つの中核要素（需要・制約・転換・地域）のうち3つ以上が具体的だった案件は42/44です。</p>
  <div class="callout warn"><strong>この比率は合否識別力ではない</strong>目的抽出・採択企業のみ・単独かつ非盲検の評価で、評価者間一致度も未測定です。例えば「構造転換100%」は公開要約で反復する提示様式を示すだけで、非採択企業にも同じ記載がある可能性を排除しません。</div>
  <h3>既存40ペアでの低位側・高位側比較</h3>
  {pair_table}
  <p class="sub">6要素のいずれもBonferroni補正後p値は0.05以上です。低位側だけに特有の定性要素は確認できず、ここから「定性面が定量劣後を補った」とは言えません。次段階には、事前登録コードブック、2名独立・盲検符号化、根拠ページ保存、非採択対照が必要です。</p>
  <h3>公開採択概要で頻出した提示パターン</h3>
  <ol>
    <li><b>需要：</b>顧客名、発注・増産要請、失注件数、市場数量、稼働率、待ち期間。</li>
    <li><b>制約：</b>能力／面積／排水／温湿度／防爆／人員／物流など、現在値と上限値。</li>
    <li><b>転換：</b>設備の羅列ではなく、分散→統合、外注→内製、単品→高付加価値、多段→一貫、自動化。</li>
    <li><b>波及：</b>地域雇用だけでなく、供給網の代替困難性、域外流出削減、観光滞在、共同配送、地域産品。</li>
    <li><b>実行：</b>用地、許認可、顧客試験、見積、金融、採用、工程、責任者、リスク代替案。</li>
  </ol>
</section>

<section id="five">
  <h2>7. No.13除外仕様で観測値がすべて中央値未満の5社</h2>
  <p>No.13を除いた選定仕様で、観測できた指標がすべて同回の採択者中央値未満となる5社です。2社は抽出品質の注意フラグがあります。No.8・14を一つの構成単位にまとめた別仕様では7社、同値を「超過」に数えない厳密判定では9社となるため、確定的な例外企業群ではありません。</p>
  <div class="case-grid">{study_cards}</div>
  <p class="footnote">これらは採択理由の確定ではありません。「公開定量では説明できない残差」に対して、公開要約から最も整合的な仮説を付したものです。</p>
</section>

<section id="official">
  <h2>8. 公式統計が示す、申請者から採択者へ上がる指標</h2>
  <p>1～5次で概ね採択者が申請者を上回るのは、成長率だけでなく<b>売上・付加価値・給与総額の絶対増加</b>と<b>補助金額当たり付加価値</b>です。第5次でも、補助事業売上高増加額は57.4→74.8億円、付加価値増加額は19.9→28.1億円、給与総額増加額は2.8→3.9億円、付加価値増加額／補助金額は171→213%でした。</p>
  {gap_table}
  <p class="footnote">差の中央値は、各公募回の（採択者代表値－申請者全体代表値）÷申請者全体代表値×100の中央値です。申請者全体には採択者も含まれ、両群は独立ではありません。公式代表値は丸め値のため、小差・同値を強く解釈しません。</p>
  <div class="callout"><strong>C 観察からE 実務提案への変換</strong>率だけでなく、①追加売上、②追加付加価値、③追加給与、④補助金1億円当たり付加価値を、需要・能力・損益の計算鎖で示します。No.13は公式評価上は高水準が正方向ですが、過去代表値の採択者・申請者差は不明瞭です。大胆さだけでなく財務健全性と実現可能性を併記してください。</div>
</section>

<section id="round6">
  <h2>9. 第6次で重要度が増した論点</h2>
  <p><span class="badge good">B 公式評価項目</span> 第6次は事前公開段階であり、正式公募開始時の資料で更新確認が必要です。公式審査は経営力、先進性・成長性、地域波及、大規模投資・費用対効果、実現可能性、補助金の必要性から構成され、書面の定量面に加えて経営者プレゼンで定性面も評価されます。第5次は198件申請、147件が書面通過、77件が最終採択でしたが、この段階数から配点を逆算することはできません。</p>
  <div class="callout"><strong>A まず満たすべき公式要件</strong>一般企業は投資額20億円以上（外注費・専門家経費を除く補助対象経費、税抜）かつ完了後3年間の補助事業従業員等1人当たり給与支給総額CAGR 5.0%以上。100億宣言企業は投資額15億円以上、同4.5%以上です。補助上限50億円、補助率1/3以下。これらは審査上の目標ではなく入口要件・返還条件です。</div>
  <div class="change-grid">{change_cards}</div>
  <h3>E 分析者提案：実務上の優先順位</h3>
  <ol>
    <li><b>足下の全社賃上げ：</b>基準年度後だけでなく、直近決算から基準年度までの全社賃上げを年次で設計。事前公開資料が参照する2025年CPI 3.2%は最低限の参考であり、それを上回る実行可能な水準と原資を説明する。</li>
    <li><b>補助金の必要性：</b>現預金が多い企業ほど、運転資金・別投資・M&A・借入余力・担保・増資検討・補助なし反実仮想を数値で示す。</li>
    <li><b>資金の確度：</b>金融機関／ファンドの出資・融資表明書は大幅加点だが、未実行の取消リスクがある。盛らずに実行可能額を確定する。</li>
    <li><b>モニタリング：</b>売上・能力・稼働・付加価値・賃金を同じKPIツリーで月次／四半期管理し、下振れ時の経営判断を記す。</li>
  </ol>
</section>

<section id="targets">
  <h2>10. 付録：過去代表値と探索シナリオ</h2>
  <p>下表の「1～5次傾向参照」は、公募回を等間隔と仮定し、最大5点の採択者公式代表値にTheil–Sen直線を当てて第6次へ外挿した探索値です。制度変更、応募者構成、不確実性区間を反映せず、予測値でも合格基準でもありません。「検討用ストレッチ」も事業計画を逆算するための分析者シナリオで、公式根拠はありません。</p>
  {framework_table}
  <div class="callout warn"><strong>本文の判断順序</strong>①公式要件、②顧客需要と能力制約から積み上げた実行可能なベースケース、③過去代表値との事後比較、④下振れ時にも要件を履行できる安全余裕、の順に判断します。探索外挿を先に目標化しません。</div>
  <h3>案件別の三段階表示</h3>
  <ul>
    <li><b>必達：</b>公式の要件・返還条件を安全余裕込みで満たす数値。</li>
    <li><b>ベース：</b>受注確度、歩留まり、稼働率、採用期間を保守的に積み上げた取締役会コミット値。</li>
    <li><b>上振れ：</b>追加顧客・高稼働・価格改善を条件にしたシナリオ。審査用の約束と混同しない。</li>
  </ul>
</section>

<section id="recipe">
  <h2>11. 要件整合性と説明可能性を高める実務設計</h2>
  <p><span class="badge warn">E 分析者提案</span> 以下は公式要件そのものではなく、A～Dの証拠を申請書内で矛盾なく接続するための実務設計です。</p>
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
  <h2>12. No.13除外感度の113企業レコード</h2>
  <p>会社名・業種・公募回・中央値以上の観測領域数で絞り込めます。これは過去集計の識別性を確認する感度仕様であり、第6次公式評価からNo.13を除くことを意味しません。</p>
  <div class="filters">
    <input id="caseSearch" type="search" placeholder="会社名・業種を検索（例：半導体、ホテル）" aria-label="会社名・業種を検索">
    <select id="roundFilter" aria-label="公募回"><option value="">全公募回</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select>
    <select id="levelFilter" aria-label="中央値以上の観測領域数"><option value="">全区分</option><option>2領域以上に中央値以上あり</option><option>1領域に中央値以上あり</option><option>観測指標に中央値以上なし</option></select>
    <label class="filter-check"><input id="cleanFilter" type="checkbox"> 品質除外なしのみ</label>
  </div>
  <div id="caseCount" class="sub" aria-live="polite"></div>
  <div class="table-wrap case-results"><table><thead><tr><th>公募回</th><th>企業</th><th>業種</th><th>未満／観測</th><th>中央値以上の領域数</th><th>成長</th><th>生産性・付加価値</th><th>賃金</th><th>区分</th><th>品質</th><th>原資料</th></tr></thead><tbody id="caseBody"></tbody></table></div>
</section>

<section id="limitations">
  <h2>13. 限界・再現手順・データ</h2>
  <ul>
    <li>不採択企業個票と審査点がないため、因果効果、配点、合格確率は推定できません。</li>
    <li>公開PDFは交付決定後の要約で、審査時申請書や公式採択者母集団と一致しません。</li>
    <li>No.8・14は集計中央値の水準を近づけた近似で、企業別公式値ではありません。</li>
    <li>目視44社は目的抽出・採択企業のみ・単独非盲検評価です。次段階は二重符号化と非採択比較です。</li>
    <li>欠損はランダムとは限りません。公募回、様式、企業属性により指標の観測可能性が異なり、低位群の構成を歪める可能性があります。</li>
    <li>低位群の件数と構成は、同値処理、No.8・14の重複処理、品質除外、指標集合に依存します。</li>
    <li>第6次は事前公開版に基づきます。正式公募要領・様式公開時に差分確認が必要です。</li>
  </ul>
  <h3>再現</h3>
  <div class="equation">python analyze_round6_reassessment.py<br>python build_round6_reassessment_report.py</div>
  <p>分析コード、企業別判定、感度分析、公式差、目視符号化、出典一覧を同じフォルダに保存しています。操作的定義と推定限界は<a href="methodology.md" target="_blank" rel="noopener">方法論ノート</a>、成果物一覧は<a href="README.md" target="_blank" rel="noopener">README</a>にまとめています。</p>
  {source_table}
  <p class="footnote">主な出力：<a href="case_level_reassessment.csv">企業別再評価CSV</a>／<a href="metric_set_robustness.csv">指標集合の頑健性CSV</a>／<a href="value_added_leave_one_round_out.csv">No.8公募回外チェックCSV</a>／<a href="qualitative_pair_comparison.csv">40ペア比較CSV</a>／<a href="focused_qualitative_review_44.csv">44社目視レビューCSV</a>／<a href="metric_reconstruction_validation.csv">指標再構築CSV</a>／<a href="official_applicant_accepted_gaps_by_round.csv">公式差CSV</a>／<a href="round6_numeric_framework.csv">探索数値フレームCSV</a></p>
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
