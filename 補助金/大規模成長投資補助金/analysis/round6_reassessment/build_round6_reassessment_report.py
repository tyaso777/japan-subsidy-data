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
        ["指標", "企業PDF値", "性質", "観測件数", "公式値との差率：4回中央値", "公式値との差率：最大"],
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
          <div class="sub">No.13を除く8指標：{int(row["directional8_below_accepted_n"])}/{int(row["directional8_observed_n"])}が同じ公募回の採択者中央値未満。{("品質上の重大な注意なし" if bool(row["is_clean"]) else "品質注意フラグあり")}。</div>
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
        metric_rounds = gap_detail.loc[
            gap_detail["metric_key"].eq(row.metric_key), "round"
        ].dropna().astype(str)
        latest_round = max(metric_rounds, key=lambda value: int(value.removesuffix("次")))
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
            esc(latest_round),
            fmt(row.latest_applicant),
            fmt(row.latest_accepted),
            f'<span class="badge {badge_kind}">{direction}</span>',
        ])
    gap_table = table(
        ["公式指標", "単位", "採択者が上回った公募回", "差率の公募回中央値", "最新公表回", "同回：申請者全体", "同回：採択者", "公募回別の傾向"],
        gap_rows,
        "compact",
    )

    framework_rows = []
    for row in framework.itertuples():
        framework_rows.append([
            esc(row.metric_label), esc(row.unit), fmt(row.round5_applicant), fmt(row.round5_accepted),
            fmt(row.round6_theil_sen_reference), fmt(row.stretch_scenario), esc(row.role),
        ])
    framework_table = table(
        ["指標", "単位", "5次申請者", "5次採択者", "単純外挿値（参考）", "上振れシナリオ（参考）", "確認用途"],
        framework_rows,
        "compact numeric",
    )

    effect_rows = []
    for row in effects.itertuples():
        effect_rows.append([
            esc(row.label), f"{int(row.low_n):,}", fmt(row.low_median),
            f"{int(row.other_n):,}", fmt(row.other_median),
            fmt(100 * row.median_ratio_low_to_other) + "%",
        ])
    effect_table = table(
        ["比較指標", "該当企業n", "該当企業の中央値", "非該当企業n", "非該当企業の中央値", "中央値比（該当／非該当）"],
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
        ["指標構成", "判定方法", "該当／判定可能", "主要品質フラグなし：該当／判定可能", "現行9指標とのJaccard係数"],
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
        ["除外公募回", "粗近似値の件数", "粗近似中央値", "公式採択者中央値", "他3回から推定した補正係数", "除外回の予測中央値", "誤差率"],
        loro_rows,
        "compact numeric",
    )

    pair_rows = [
        [
            esc(row.factor_ja), fmt(row.lower_mean_score, 3), fmt(row.higher_mean_score, 3),
            fmt(row.mean_score_gap_lower_minus_higher, 3), fmt(row.paired_sign_test_p, 3),
            fmt(row.bonferroni_p_6, 3),
        ]
        for row in pair_comparison.itertuples()
    ]
    pair_table = table(
        ["要素", "公開指標下位側", "公開指標上位側", "平均点差（下位－上位）", "符号検定p値", "Bonferroni補正後p値"],
        pair_rows,
        "compact numeric",
    )

    criteria_table = table(
        ["第6次の審査軸", "A001で関連する主な箇所", "申請書内で明示・整合させる事項"],
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
        ["指標", "企業PDF値の構築方法", "公式指標との主な相違点"],
        [
            ["No.1 全社売上高CAGR", "{（公開目標売上高÷公開基準売上高）^(1/年数)－1}×100", "年度・連結／単体の対応を確認できる場合のみ使用。公式企業別値ではない。"],
            ["No.2 全社売上高増加額", "公開目標売上高－公開基準売上高", "同一主体・同一売上系列を優先。複数系列や期間曖昧は品質注意。"],
            ["No.7・9・11 各CAGR", "PDF記載率を基本的にそのまま使用", "公開PDFに記載された率として最も直接比較しやすいが、公式提出時の非公開値との同一性は保証されない。"],
            ["No.8 付加価値増加額", "{（目標労働生産性×目標従業員数）－（基準労働生産性×基準従業員数）}÷10,000×1.1", "公式は営業利益＋従業員給与＋役員給与＋減価償却費。人数も就業時間換算従業員＋役員であり一致しない。1.1は集計中央値の水準補正。"],
            ["No.10 給与総額増加額", "{（目標1人当たり給与×目標従業員数）－（基準1人当たり給与×基準従業員数）}÷10,000", "公開人数の主体・範囲が公式の常時使用従業員と一致する保証がないため、企業別公式値ではない。"],
            ["No.13 投資額／全社売上高", "公開事業費（百万円）÷公開基準売上高（億円）", "第6次の公式審査では値が高いほど評価上プラス。一方、1～5次の採択者・申請者代表値の大小関係は公募回によって異なるため、除外結果は感度分析としてのみ使用。"],
            ["No.14 付加価値増加額／補助金", "No.8の1.1倍補正前の付加価値増加額簡易推計÷公開補助金額×100", "No.8と同じ分子情報を共有するため、独立した証拠として二重計上しない。"],
        ],
        "compact",
    )

    evidence_table = table(
        ["区分", "根拠", "分析上の位置づけ", "本文で用いる表現"],
        [
            ["公式要件", "第6次の公式公募要領・様式", "申請要件、返還・取消条件", "満たす必要がある／未達リスクがある"],
            ["公式評価項目", "第6次の公式審査基準", "評価方向・加点項目", "審査で評価される／値が高いほど評価上プラス"],
            ["公開データ上の観察", "381企業レコードと1～5次の公式代表値", "操作的定義、記述統計、感度分析", "収録範囲で何件・どの傾向が観測された"],
            ["採択案件の記載パターン", "分析目的に沿って選んだ採択44社の目視符号化", "探索仮説。採択企業と非採択企業を見分ける力は未検証", "公開要約に繰り返し記載された"],
            ["分析者の実務提案", "上記の根拠と申請実務を接続した提案", "公式要件ではない", "整合性・説明可能性を高めるため推奨する"],
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
        ["公募回", "公式採択案件数", "収録企業レコード", "主要品質フラグなし", "現行9指標：該当件数", "No.13除外：該当件数"],
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
<title>採択者中央値を下回る指標が多い企業――公開データによる再検証</title>
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
  <div class="eyebrow">公開データ再分析｜第6次公募に向けた申請設計</div>
  <h1>採択者中央値を下回る指標が多い企業――公開データによる再検証</h1>
  <p>本稿では、公開企業PDFから作成した381件の企業レコードと1～5次の公式統計を用い、複数指標で採択者中央値を下回る企業がどの程度存在し、その判定が指標の選び方によってどう変わるかを検証します。さらに、採択企業の公開要約と第6次の公式審査項目を整理し、申請書で数値と根拠をどう接続すべきかを示します。</p>
</header>
<div class="layout">
<aside class="toc" id="toc">
  <div class="toc-head"><strong>目次</strong><button id="tocToggle" type="button" aria-expanded="true">閉じる</button></div>
  <nav>
    <a href="#conclusion">1. 結論</a><a href="#scope">2. 問いと限界</a><a href="#data">3. 使用データと比較可能性</a>
    <a href="#definition">4. 「中央値未満」の定義</a><a href="#quant">5. 採択者中央値以上の指標</a>
    <a href="#qual">6. 採択企業44社の記載</a><a href="#five">7. 全観測値が未満の企業</a>
    <a href="#official">8. 公式の申請者／採択者差</a><a href="#round6">9. 第6次の制度変更</a>
    <a href="#targets">10. 過去の公式値と参考シナリオ</a><a href="#recipe">11. 申請書の数値と根拠を一致させる</a>
    <a href="#cases">12. No.13除外時の判定企業113件</a><a href="#limitations">13. 限界・再現手順</a>
  </nav>
</aside>
<main>
<section id="conclusion">
  <h2>1. 結論：「中央値未満」に該当する企業は、指標構成によって大きく入れ替わる</h2>
  <p class="lead">9指標のうち5つ以上を観測できた373件では、118件（31.6%）が「観測指標の60%以上で同じ公募回の採択者中央値を下回る」という条件に該当しました。主要品質フラグのない199件では58件（29.1%）です。ただし、該当件数と企業構成は指標の選び方に大きく左右されます。この118件を「定量面で劣りながら、別の基準で採択された企業」とみなすことはできません。</p>
  <div class="stats">
    <div class="stat"><div class="value">{dashboard['n']}/{dashboard['eligible_n']}</div><div class="label">定義該当件数／判定可能件数</div></div>
    <div class="stat"><div class="value">{dashboard['any_applicant_win_n']}/{dashboard['n']}</div><div class="label">申請者代表値以上の指標が1つ以上</div></div>
    <div class="stat"><div class="value">{dashboard['applicant_half_or_more_n']}/{dashboard['n']}</div><div class="label">観測指標の少なくとも半数が申請者代表値以上<div class="sub">過半数は67。同値を除く厳密判定では58</div></div></div>
    <div class="stat"><div class="value">5～9</div><div class="label">観測した全指標が採択者中央値未満<div class="sub">判定方法により5～9件</div></div></div>
  </div>
  <div class="thesis">
    <article><h4>① 該当企業は、指標の選び方で変わる</h4><p>該当数は、No.8を外すと101件、No.13・14を外すと134件、3領域に集約すると164件まで動きます。該当企業は自然に定まる一つの集団ではなく、比較目的に応じた定義によって変わります。</p></article>
    <article><h4>② 多くの企業には、中央値以上の指標もある</h4><p>No.13を外した感度分析では、113件中108件に少なくとも1領域で中央値以上の値があります。しかし、そもそも「60%以上が中央値未満」という条件は、最大40%の指標が中央値以上であることを許します。</p></article>
    <article><h4>③ 定性情報から得られるのは、因果ではなく仮説</h4><p>需要、能力制約、事業構造の転換、地域供給網、実行確度は採択企業の公開要約に頻出します。ただし、採択企業どうしの40ペア比較では、公開指標が低い側だけに固有の差は確認できませんでした。</p></article>
  </div>
  <div class="callout"><strong>第6次公募への含意</strong>過去の中央値を機械的に上回ることよりも、顧客需要、現在の能力制約、投資後の供給能力、売上・付加価値・賃金、地域波及、補助金の必要性を、共通の前提と計算式で整合させることが重要です。本稿の定性結果は、その説明を組み立てるための仮説であり、合格を保証する採点表ではありません。</div>
</section>

<section id="scope">
  <h2>2. 本分析で答える問いと、答えられない問い</h2>
  <div class="callout warn"><strong>分析対象は採択企業の公開資料に限られます</strong>非採択企業の申請書、項目別審査点、審査時点の企業別公式値は公開されていません。そのため、本稿で確認できるのは公開情報上の分布と記載傾向であり、配点、因果効果、合格確率ではありません。</div>
  <div class="criteria-flow">
    <article><h4>該当率を把握する</h4><p>本稿の抽出条件に該当する企業レコードは、判定可能な企業の何割か。</p></article>
    <article><h4>判定条件の感度を確認する</h4><p>指標構成、同値の扱い、品質条件を変えても結論は保たれるか。</p></article>
    <article><h4>定量・定性情報を整理する</h4><p>採択者中央値以上の値や、公開要約に反復する記載はどこにあるか。</p></article>
    <article><h4>第6次審査へ接続する</h4><p>公式審査項目に対して、何をどの資料で立証すべきか。</p></article>
  </div>
  <p>ここでいう「説明」とは、公開情報の範囲で矛盾の少ない解釈を組み立てることです。採択と非採択を分ける識別力を検証するには、同業・同規模の非採択申請書または審査点が必要です。</p>
  <h3>本文の主張と根拠の強さ</h3>
  {evidence_table}
  <h3>本文で使う用語</h3>
  <ul>
    <li><b>公式代表値：</b>事務局が公表した申請者全体・採択者の中央値または平均値です。</li>
    <li><b>企業PDF値：</b>交付決定後の公開要約に記載された値、または複数の公開値から再構築した近似値。審査時の企業別公式値ではありません。</li>
    <li><b>該当企業：</b>本稿の抽出条件を満たす企業レコードです。審査上の低評価や不合格水準を意味しません。</li>
    <li><b>採択者中央値以上の指標がある：</b>いずれかの領域に、採択者公式代表値以上となる公開指標があることを指します。採択理由や、審査上ほかの弱点を相殺したことを意味しません。</li>
    <li><b>主要品質フラグなし：</b>率の定義、集計主体、算術対応などに重大な注意フラグが付いていないレコードです。数値の正確性を保証する区分ではありません。</li>
  </ul>
</section>

<section id="data">
  <h2>3. 381件の企業レコードは何を表すか</h2>
  <p>分析対象は、1～4次の交付決定後に公開されたPDFから作成した381件の<b>企業レコード</b>です。これは申請案件の母集団でも、公式に公表された採択案件数そのものでもありません。共同申請では一つの案件に複数企業が含まれるため、収録企業数が公式採択案件数を上回る公募回もあります。</p>
  {round_table}
  <p class="sub">企業PDF値と公式統計は、分析単位も集計対象も異なります。また、「申請者全体」には採択者が含まれます。両者を独立した二群として扱わず、丸め値の小さな差や同値も強く解釈しません。</p>
  <h3>企業PDF再構築値の公募回別中央値は、公式代表値とどの程度整合するか</h3>
  {validation_table}
  <h3>主要な企業PDF値の定義</h3>
  {proxy_definition_table}
  <p>381レコードのうち179には、少なくとも一つの品質注意があります。主な内訳は、率の定義が曖昧なもの135件、連結・単体など対象主体が曖昧なもの56件、事業費の記載不一致13件です（重複あり）。以降では全レコードに加え、重大な注意フラグがない202レコードの結果も示します。</p>
  <p class="footnote">「公式値との差率」は、公募回ごとに |企業PDF中央値÷公式採択者代表値－1|×100 を求め、4回の中央値と最大値を示したものです。No.8の1.1倍補正には1～4次の公式値を用いているため、ここで示す近さは同じデータに対する較正結果であり、独立検証ではありません。第2次の観測数は、No.1が3件、No.13が11件です。</p>
  <h3>No.8補正係数の公募回別交差検証</h3>
  <p>補正係数が特定の公募回に依存していないかを確認するため、各回を順に除外し、残る3回で求めた係数から除外回の中央値を予測しました。予測誤差は−5.4%～+13.5%です。ただし、検証対象は4公募回の中央値に限られるため、企業別推計値や企業順位の精度は評価できません。</p>
  {loro_table}
</section>

<section id="definition">
  <h2>4. 「中央値未満」企業の抽出方法</h2>
  <p>まず、ダッシュボードと同じ9指標を用い、「5指標以上を観測でき、その60%以上で同じ公募回の採択者中央値を下回る」企業を抽出しました。該当したのは判定可能373レコード中118（31.6%）です。品質注意のないレコードに限ると58/199（29.1%）でした。</p>
  <p>この判定は、公式の足切り基準ではありません。観測数5と未満割合60%は、多くの指標で相対的に低い企業を抽出するための操作的な境界です。そのため、境界や指標集合を変えたときに結果がどれほど動くかを併せて確認します。</p>
  <p>No.13（投資額／全社売上高）は、第6次の公式審査では高い値が評価上プラスとされます。一方、1～5次の公式統計では、採択者中央値と申請者全体中央値の大小関係が公募回によって異なります。そこで、No.13を除いた判定も感度分析として示します。これは、公式評価からNo.13を除外すべきだという意味ではありません。この場合の該当数は113/371（30.5%）、主要品質フラグのないレコードでは55/198（27.8%）です。</p>
  <div class="equation">分析上の該当 = 観測数 ≥ 5 かつ（採択者中央値未満の指標数 ÷ 観測数）≥ 60%</div>
  <p class="sub">観測数5は、9指標の過半を観測できないレコードを主要判定から外すために置きました。60%は制度上の基準でも、統計理論から一意に導かれた境界でもありません。</p>
  <h3>判定閾値を変えた場合</h3>
  {sensitivity_bars}
  <p class="sub">現行9指標、観測5指標以上の判定可能373レコード。50%なら193/373、75%なら53/373となり、該当数は閾値に依存します。</p>
  <h3>7指標判定と9指標判定の違い</h3>
  {transition_table}
  <p>旧7指標で該当した125レコードのうち、現行9指標でも該当するのは90です。No.8・14の追加と最低観測数の統一により、35が外れ、28が新たに加わりました。分類対象は、指標の更新によって相応に入れ替わります。</p>
  <h3>指標構成を変えた感度分析</h3>
  {robustness_table}
  <p class="sub">No.8とNo.14は同じ付加価値増加額を共有し、No.2・8・10は企業規模の影響を受けます。指標構成を変えると、該当数は101～176件に変わります。Jaccard係数は、各判定方法の該当企業集合が現行9指標の集合とどれだけ重なるかを0～1で表します。</p>
</section>

<section id="quant">
  <h2>5. 採択者中央値以上の指標は、どの領域にあるか</h2>
  <p>No.13を除いた8指標を、全社成長、生産性・付加価値、賃金の3領域に整理しました。各領域に、同じ公募回の採択者中央値以上となる指標が一つでもあれば、その領域を「中央値以上」と数えます。この分類は公開値の分布を要約するものであり、審査上の強みや、ほかの弱点を相殺した効果を示すものではありません。</p>
  <div class="stack" aria-label="113企業レコードの中央値以上となる領域数">
    <div class="clear" style="width:{100*clear_n/explanation_total:.2f}%">{clear_n}</div>
    <div class="partial" style="width:{100*partial_n/explanation_total:.2f}%">{partial_n}</div>
    <div class="unknown" style="width:{100*unexplained_n/explanation_total:.2f}%">{unexplained_n}</div>
  </div>
  <div class="legend"><span style="--c:#0f766e">2領域以上に中央値以上あり {clear_n}社</span><span style="--c:#3b82f6">1領域に中央値以上あり {partial_n}社</span><span style="--c:#d97706">観測指標に中央値以上なし {unexplained_n}社</span></div>
  <div class="callout"><strong>読み方</strong>同値を「中央値以上」に含めると、42件は2領域以上、66件は1領域、5件は0領域でした。中央値を厳密に上回る場合だけ数えると、それぞれ{strict_clear_n}件、{strict_partial_n}件、{strict_unexplained_n}件です。113件中108件に中央値以上の領域があるという結果は、抽出条件が最大40%の中央値以上指標を許すことから、機械的に生じる部分があります。</div>
  <h3>別の費用対効果が一貫して高いわけではない</h3>
  {effect_table}
  <p>この表には、抽出条件に使った指標と、その入力値を共有する派生指標が含まれます。そのため、群間差の一部は定義上生じ得ます。追加した売上増／補助金、給与増／補助金、雇用増／補助金についても、未調整の統合中央値では該当企業が非該当企業を上回りませんでした。ただし、公募回、業種、企業規模を調整しておらず、別の費用対効果による採択という仮説を検定した結果ではありません。No.13だけは該当企業の中央値が高くなりますが、公式審査での位置づけと、過去の公表値における傾向は分けて解釈する必要があります。</p>
  <h3>118件に集中した理由：9指標は互いに独立ではない</h3>
  <p>各指標が独立で、中央値未満となる確率が50%だと仮定すると、現在の観測数構成から期待される該当数は{fmt(perm['simple_coin_expected'])}、標準偏差は8.8です。実測118との差は小さく、件数そのものは異常ではありません。ただし、公開PDFの母集団は公式中央値の算出母集団と同一ではないため、この値は理論上の目安です。</p>
  <p>次に、公募回と指標ごとの未満割合、欠損位置を保ったまま、企業間で判定を1万回並べ替えました。置換分布の平均は{fmt(perm['permutation_expected'])}、2.5～97.5百分位は{fmt(perm['permutation_q025'],0)}～{fmt(perm['permutation_q975'],0)}で、118以上となる片側p値は{fmt(perm['permutation_p_ge_observed'],4)}でした。これは、同一企業内で複数の未満判定が同時に現れる正の依存と整合しますが、共有分子、企業規模、未観測要因の寄与を分離するものではありません。</p>
  <div class="callout warn"><strong>解釈上の注意</strong>この検定が示すのは、中央値未満の判定が同じ企業内にまとまって現れやすいことです。9指標を独立した9票として数えることはできません。また、No.8とNo.14は共通の分子を使うため、別々の証拠として扱えません。置換検定のp値も、採択要因の有無を検定したものではありません。</div>
</section>

<section id="qual">
  <h2>6. 採択企業の公開要約には、何が繰り返し書かれているか</h2>
  <p>多指標で中央値を下回る企業の公開要約を読み、数値表には表れにくい説明要素を整理しました。対象は44社です。内訳は、既存40ペアのうち公開指標が低い側から20社、未レビューの該当企業から公募回と業種を分散して選んだ24社です。各要素を「記載なし」から「強い具体証拠あり」まで0～3点で符号化しました。</p>
  {factor_bars}
  <p>2点以上の具体的記載が最も多かったのは、<b>事業・工程の構造転換</b>で44/44社でした。<b>能力制約</b>、<b>実行確度</b>、<b>政策整合</b>は各42/44社、<b>地域・供給網への波及</b>は40/44社です。需要の具体性は33/44社であり、実名顧客や受注がすべての案件に示されていたわけではありません。</p>
  <div class="callout warn"><strong>頻出することと、採否を分けることは別です</strong>44社は無作為標本ではなく、対象はいずれも採択企業です。評価も一人が対象区分を知った状態で行っており、評価者間一致度を測っていません。「構造転換が44/44社に記載された」という結果は、採択企業の公開要約に多い書き方を示しますが、非採択企業との差を示しません。</div>
  <h3>採択企業40ペアの比較</h3>
  {pair_table}
  <p class="sub">比較した両側はいずれも採択企業です。6要素はいずれもBonferroni補正後p≥0.05で、この40ペアと符号検定では差を検出できませんでした。公開指標が低い側と高い側が同等であることや、差が存在しないことを証明する結果ではありません。</p>
  <h3>公開要約で多く見られた説明要素</h3>
  <p>識別力は未検証ですが、以下の順序は、投資の必要性と効果を一貫して説明するための実務的な骨格になります。</p>
  <ol>
    <li><b>需要：</b>顧客名、発注・増産要請、失注件数、市場数量、稼働率、待ち期間。</li>
    <li><b>制約：</b>能力／面積／排水／温湿度／防爆／人員／物流など、現在値と上限値。</li>
    <li><b>転換：</b>設備の羅列ではなく、分散→統合、外注→内製、単品→高付加価値、多段→一貫、自動化。</li>
    <li><b>波及：</b>地域雇用だけでなく、供給網の代替困難性、域外流出削減、観光滞在、共同配送、地域産品。</li>
    <li><b>実行：</b>用地、許認可、顧客試験、見積、金融、採用、工程、責任者、リスク代替案。</li>
  </ol>
</section>

<section id="five">
  <h2>7. 観測指標がすべて採択者中央値を下回った企業</h2>
  <p>No.13を除く8指標を5つ以上観測できた企業のうち、全観測値が中央値未満だったのは5件です。このうち2件にはデータ品質上の注意があります。No.13・14を除く7指標を4つ以上観測する別の判定方法では7件、元の113件について中央値との同値を「超過」に含めない場合には、中央値を厳密に上回る指標が一つもないものが9件でした。三つの判定方法は入れ子ではないため、5件、7件、9件は同じ母集団の単純な増減ではありません。以下の5件は確定的な「例外群」ではなく、公開情報を個別に確認する対象です。</p>
  <div class="case-grid">{study_cards}</div>
  <p class="footnote">各カードの説明は、公開要約と整合する仮説です。審査時の非公開情報や得点を確認できないため、採択理由を確定したものではありません。</p>
</section>

<section id="official">
  <h2>8. 公式統計では、どの指標に差が見られるか</h2>
  <p>1～5次の公式代表値を比べると、採択者側が概ね高いのは成長率だけではありません。<b>売上、付加価値、給与総額の絶対増加額</b>と、<b>補助金額当たりの付加価値増加額</b>にも差が見られます。第5次では、補助事業売上高増加額の中央値は、申請者全体57.4億円に対して採択者74.8億円でした。付加価値増加額は19.9億円対28.1億円、給与総額増加額は2.8億円対3.9億円、付加価値増加額／補助金額は171%対213%です。</p>
  {gap_table}
  <p class="footnote">差の中央値は、公募回ごとに（採択者代表値－申請者全体代表値）÷申請者全体代表値×100を計算し、その中央値を取ったものです。申請者全体には採択者が含まれるため、二群は独立していません。公式代表値も丸め値です。</p>
  <div class="callout"><strong>申請計画への落とし込み</strong>成長率だけを掲げるのではなく、追加売上、追加付加価値、追加給与、補助金1億円当たりの付加価値を、需要量、設備能力、価格、原価、人員計画から積み上げます。No.13は公式上、高い水準が評価されますが、投資規模の大きさだけでなく、財務健全性と実行可能性も併せて説明する必要があります。</div>
</section>

<section id="round6">
  <h2>9. 第6次の公式要件と評価項目</h2>
  <p><span class="badge good">公式評価項目</span> 事前公開された第6次の審査基準は、経営力、先進性・成長性、地域への波及、大規模投資・費用対効果、実現可能性、補助金の必要性の六つから構成されます。書面上の計数だけでなく、経営者プレゼンテーションを通じて、投資判断と実行責任を説明する設計です。第5次は198件の申請に対し、147件が書面審査を通過し、77件が最終採択となりました。ただし、この通過件数から各項目の配点を逆算することはできません。</p>
  <div class="callout"><strong>申請前に満たすべき公式要件</strong>一般企業は、外注費・専門家経費を除く税抜の補助対象経費について20億円以上を投資し、事業完了後3年間の補助事業従業員等1人当たり給与支給総額を年平均5.0%以上増やす必要があります。100億宣言企業は、投資額15億円以上、同4.5%以上です。補助上限は50億円、補助率は3分の1以下です。これらは競争上の目標値ではなく、申請資格と採択後の履行に関わる条件です。</div>
  <div class="change-grid">{change_cards}</div>
  <h3>公式資料を踏まえた実務上の検討事項</h3>
  <ol>
    <li><b>直近実績からの全社賃上げ：</b>基準年度以降の目標だけでなく、直近決算から基準年度までの賃上げと、その原資を年次で示します。2025年CPI 3.2%は制度上の参照値であり、各社の水準は収益計画と人員構成から説明する必要があります。</li>
    <li><b>補助金の必要性：</b>現預金、必要運転資金、並行投資、借入余力、担保、増資可能性を整理し、補助金がない場合に投資規模、時期、雇用、地域波及がどう変わるかを数値で示します。</li>
    <li><b>資金調達の確度：</b>金融機関・ファンドの表明額、実行条件、時期を事業スケジュールと一致させます。加点を目的に、実行できない金額を計画へ組み込まないことが重要です。</li>
    <li><b>実施後の管理：</b>売上、設備能力、稼働率、付加価値、賃金を同じKPI体系で管理し、月次・四半期の確認方法と、下振れ時の修正判断を事前に定めます。</li>
  </ol>
  <p class="footnote">本節は事前公開資料に基づきます。正式な公募要領・申請様式が公開された時点で、要件、定義、参照年度、提出書類を再確認してください。</p>
</section>

<section id="targets">
  <h2>10. 補論：過去の公式値から作る参考シナリオ</h2>
  <p>下表の「単純外挿値」は、1～5次の採択者公式代表値にTheil–Sen直線を当て、第6次相当の位置まで延長した参考値です。制度変更、応募企業の構成変化、予測区間は反映していません。「上振れシナリオ」も分析者が便宜的に設定した値です。いずれも第6次の予測値、合格基準、推奨目標値ではありません。</p>
  {framework_table}
  <div class="callout warn"><strong>数値を検討する順序</strong>まず公式要件を確認し、次に顧客需要と能力制約から実行可能なベースケースを積み上げます。その後で過去代表値との位置関係を確認し、最後に下振れ時にも要件を履行できる安全余裕を検証します。外挿値から先に目標を決めないことが重要です。</div>
  <h3>計画内で区別すべき三つの数値</h3>
  <ul>
    <li><b>必達水準：</b>公式要件と返還条件を、安全余裕を含めて履行するための最低水準。</li>
    <li><b>ベースケース：</b>受注確度、歩留まり、稼働率、採用期間を保守的に積み上げ、経営としてコミットできる計画値。</li>
    <li><b>上振れシナリオ：</b>追加顧客、高稼働、価格改善などの条件が成立した場合の可能値。審査上の約束とは明確に分けます。</li>
  </ul>
</section>

<section id="recipe">
  <h2>11. 申請書全体で数値と根拠を一致させる</h2>
  <p><span class="badge warn">分析者の実務提案</span> 本節は公式要件を追加するものではありません。公式要件、公開データ上の観察、定性分析から得た仮説を、申請書内で矛盾なく記載するための提案です。</p>
  <p class="lead">申請書の説得力は、数値の高さだけでなく、各ページの前提と計算が一致しているかで決まります。顧客別需要を起点に必要能力を算定し、設備仕様、稼働率、歩留まり、販売数量、損益、付加価値、給与原資、地域波及、補助金当たり効果までを同じ計算体系でつなぎます。</p>
  <div class="criteria-flow">
    <article><h4>需要台帳</h4><p>顧客、用途、数量、時期、確度、証拠資料を1行1案件で管理します。</p></article>
    <article><h4>制約台帳</h4><p>現有能力、最大稼働、失注、外注、リードタイム、品質条件を同じ単位で整理します。</p></article>
    <article><h4>投資後能力の算定</h4><p>設備ごとのサイクルタイム、稼働時間、歩留まり、人員から投資後の供給可能量を算定します。</p></article>
    <article><h4>売上・付加価値の算定</h4><p>数量×単価から売上、粗利、営業利益、減価償却、付加価値、給与原資へ接続します。</p></article>
    <article><h4>費用対効果</h4><p>補助金1億円当たりの売上、付加価値、給与、雇用、域外流出削減を示します。</p></article>
    <article><h4>実行条件の管理</h4><p>用地、許認可、見積、発注、採用、金融、認証を、期限と責任者を付けて管理します。</p></article>
    <article><h4>追加性</h4><p>補助金がない場合の延期・縮小と、それに伴う能力、雇用、地域波及の減少を示します。</p></article>
    <article><h4>経営者説明</h4><p>投資判断、資源配分、モニタリング、修正・撤退基準を、経営者自身が数値付きで説明します。</p></article>
  </div>
  <h3>申請前の整合性レビュー</h3>
  <p>個々の数値の高さよりも、根拠資料、計算式、法人範囲、対象年度、事業スケジュールが相互に一致しているかを確認します。</p>
  <ul class="checklist">
    <li>実名顧客、LOI、注文、増産要請、問い合わせ、失注ログのいずれかがある。</li>
    <li>現状能力と投資後能力が同じ単位・時間基準・歩留まりで比較できる。</li>
    <li>設備費と売上増が「何台×何個×稼働率×単価」の計算式でつながっている。</li>
    <li>補助事業売上と全社売上の二重計上、グループ／単体の混同がない。</li>
    <li>付加価値額は公式Excelの営業利益＋給与＋役員給与＋減価償却と一致する。</li>
    <li>賃上げは率だけでなく人数・給与総額・原資・未達時対応まで説明できる。</li>
    <li>地域波及は雇用人数だけでなく、仕入・外注・物流・観光消費等を金額化する。</li>
    <li>現預金、運転資金、別投資、借入、増資、補助なしケースの資金表がある。</li>
    <li>金融機関表明書の金額・条件・実行時期が事業スケジュールと一致する。</li>
    <li>経営者が、需要、制約、投資、効果、補助金の必要性を一続きの数値で説明できる。</li>
  </ul>
  <h3>第6次A001・関連様式との対応</h3>
  <p>下表のスライド番号は事前公開版A001に基づきます。正式版の公開後に番号と設問を再照合し、A002の計数、A001の文章・図表、A003・A004の金融確認について、対象年度、法人範囲、金額を一致させてください。</p>
  {criteria_table}
  <div class="callout"><strong>中央値を下回る指標がある場合</strong>過去の採択者中央値は足切り基準ではありません。低い理由を事業構造から説明し、どの効果を生むのか、公式要件をどの程度の余裕で履行できるのかを示します。絶対効果や国費当たり効果が相対的に小さい場合には、需要の確度、能力制約、地域供給網上の役割、補助金による追加性、実行条件を、第三者が照合できる証拠で補強します。ただし、これらの説明が数値上の弱さを審査上相殺するとは、本分析から判断できません。</div>
</section>

<section id="cases">
  <h2>12. No.13を除外した場合の判定対象113件</h2>
  <p>No.13を除く8指標のうち、5指標以上を観測でき、その60%以上が同じ公募回の採択者中央値未満となったレコードは、371件中113件でした。主要品質フラグのないレコードでは、198件中55件です。会社名、業種、公募回、中央値以上だった領域数で絞り込めます。</p>
  <p class="sub">No.13では、過去の採択者中央値と申請者全体中央値の大小関係が公募回によって異なります。この一覧は、No.13を除いた場合に判定がどう変わるかを確認するためのものです。第6次の公式評価からNo.13を除外する趣旨ではありません。</p>
  <div class="filters">
    <input id="caseSearch" type="search" placeholder="会社名・業種を検索（例：半導体、ホテル）" aria-label="会社名・業種を検索">
    <select id="roundFilter" aria-label="公募回"><option value="">全公募回</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select>
    <select id="levelFilter" aria-label="中央値以上の観測領域数"><option value="">全区分</option><option>2領域以上に中央値以上あり</option><option>1領域に中央値以上あり</option><option>観測指標に中央値以上なし</option></select>
    <label class="filter-check"><input id="cleanFilter" type="checkbox"> 主要品質フラグなしのみ</label>
  </div>
  <div id="caseCount" class="sub" aria-live="polite"></div>
  <div class="table-wrap case-results"><table><thead><tr><th>公募回</th><th>企業</th><th>業種</th><th>採択者中央値未満／観測指標数</th><th>中央値以上の指標がある領域数</th><th>成長</th><th>生産性・付加価値</th><th>賃金</th><th>領域判定</th><th>主要品質フラグ</th><th>原資料</th></tr></thead><tbody id="caseBody"></tbody></table></div>
</section>

<section id="limitations">
  <h2>13. 解釈上の制約と再現方法</h2>
  <h3>採択要因を識別するうえでの制約</h3>
  <p>本分析には、不採択企業の個票、審査点、審査コメントが含まれていません。このため、各指標や定性要素が採択確率に与える因果効果、審査上の配点、個社の合格確率は推定できません。公式の申請者全体・採択者代表値も集計値であり、企業属性を統制した比較ではありません。</p>
  <h3>企業別公開値の測定上の制約</h3>
  <p>381件は、交付決定後の公開PDFから構築した企業レコードです。審査時申請書や、公式集計の企業別データではありません。No.8とNo.14は公開情報から作った近似値であり、集計中央値の水準を点検しているものの、企業別公式値の正確性を保証しません。また、欠損は無作為とは限らず、公募回、様式、企業属性による観測可能性の違いが、該当数と企業構成に影響している可能性があります。</p>
  <h3>判定方法と定性分析の制約</h3>
  <p>該当数は、中央値との同値をどう扱うか、No.8とNo.14の共有情報をどう数えるか、品質注意レコードを含めるか、どの指標集合を選ぶかによって変わります。単一の判定結果だけで企業群を固定せず、複数の感度分析を併せて読む必要があります。44社の定性分析も、分析目的に沿って選んだ採択企業を、一人の評価者が企業区分を知った状態で符号化した探索分析です。</p>
  <h3>第6次正式資料による更新</h3>
  <p>制度に関する記述は、第6次の事前公開資料に基づきます。正式公募要領、申請様式、FAQが公開された時点で、要件、評価項目、参照年度、様式番号、提出書類を再確認してください。</p>
  <h3>再現手順</h3>
  <div class="equation">python analyze_round6_reassessment.py<br>python build_round6_reassessment_report.py</div>
  <p>分析コード、企業別判定、閾値感度、指標構成別の比較、公式代表値差、定性符号化、出典一覧を同じフォルダに保存しています。操作的定義と推定限界は<a href="methodology.md" target="_blank" rel="noopener">方法論ノート</a>、ファイル構成と再実行方法は<a href="README.md" target="_blank" rel="noopener">README</a>を参照してください。</p>
  {source_table}
  <p class="footnote">主な出力：<a href="case_level_reassessment.csv">企業別再評価CSV</a>／<a href="metric_set_robustness.csv">指標構成別比較CSV</a>／<a href="value_added_leave_one_round_out.csv">No.8公募回別交差検証CSV</a>／<a href="qualitative_pair_comparison.csv">40ペア比較CSV</a>／<a href="focused_qualitative_review_44.csv">44社目視レビューCSV</a>／<a href="metric_reconstruction_validation.csv">指標再構築CSV</a>／<a href="official_applicant_accepted_gaps_by_round.csv">公式差CSV</a>／<a href="round6_numeric_framework.csv">探索数値フレームCSV</a></p>
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
  count.textContent = `${{filtered.length}}件 / ${{cases.length}}件`;
  body.innerHTML = filtered.map(c => `<tr><td>${{safe(c.round)}}</td><td><strong>${{safe(c.company)}}</strong></td><td>${{safe(c.industry)}}</td><td>${{c.below}}/${{c.observed}}</td><td>${{c.componentWins}}</td><td>${{yn(c.growth)}}</td><td>${{yn(c.productivity)}}</td><td>${{yn(c.wage)}}</td><td>${{safe(c.level)}}</td><td>${{c.clean?'主要フラグなし':'注意あり'}}</td><td><a href="${{safe(c.pdf)}}" target="_blank" rel="noopener">PDF ↗</a></td></tr>`).join('');
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
