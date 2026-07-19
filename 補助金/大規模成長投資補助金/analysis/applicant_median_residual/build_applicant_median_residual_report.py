"""回次補正後28件の採択残差に関する仮説検証レポートを生成する。"""

from __future__ import annotations

import html
import json
import math
from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "applicant_median_residual_report.html"

METRICS = [
    (1, "全社年平均売上高成長率", "sales_cagr_pct", "benchmark_applicant_company_sales_cagr", "below_applicant_no1", "%"),
    (2, "全社売上高増加額", "sales_increase_oku_yen_normalized", "benchmark_applicant_company_sales_increase", "below_applicant_no2", "億円"),
    (7, "補助事業年平均労働生産性の伸び", "labor_annual_rate_pct", "benchmark_applicant_labor_cagr", "below_applicant_no7", "%"),
    (8, "付加価値増加額（簡易補正推計）", "value_added_increase_estimated_oku", "benchmark_applicant_value_added_increase", "below_applicant_no8", "億円"),
    (9, "年平均従業員1人当たり給与の伸び", "employee_pay_annual_rate_pct", "benchmark_applicant_employee_pay_rate", "below_applicant_no9", "%"),
    (10, "給与支給総額の増加額（推計）", "employee_pay_total_increase_estimated_oku", "benchmark_applicant_employee_pay_total_increase", "below_applicant_no10", "億円"),
    (11, "年平均役員1人当たり報酬の伸び", "officer_pay_annual_rate_pct", "benchmark_applicant_officer_pay_rate", "below_applicant_no11", "%"),
    (13, "投資額／全社売上高（近似）", "investment_sales_ratio_pct", "benchmark_applicant_investment_sales_ratio", "below_applicant_no13", "%"),
    (14, "付加価値増加額／補助金額（比率推計）", "value_added_subsidy_ratio_proxy_pct", "benchmark_applicant_value_added_subsidy_ratio", "below_applicant_no14", "%"),
]

FACTOR_EXPLANATIONS = {
    "A": ("需要の確からしさ", "実名顧客、受注・引合い、契約、数量見通しなど、投資後の需要が抽象論を超えて示されるか。"),
    "B": ("能力制約", "既存設備の稼働限界、受注辞退、外注・輸送制約など、投資しなければ需要に応えられない事情があるか。"),
    "C": ("事業転換・差別化", "内製化、垂直統合、ODM化、新工程・新市場など、単なる設備更新ではない行動変容があるか。"),
    "D": ("供給網・地域の不可欠性", "地域雇用、重要部材、廃棄物処理、観光・食料等で、代替しにくい供給網上の役割があるか。"),
    "E": ("実行準備", "用地、許認可、設備仕様、工程、体制、既投資など、計画が実行段階へ進んでいるか。"),
    "F": ("資金・自己負担能力", "自己資金、融資、財務余力、資金調達の具体性が公開資料で確認できるか。非公開になりやすい。"),
    "G": ("雇用・賃上げの質", "人数や率だけでなく、技能形成、定着、処遇改善、地域の良質な雇用との接続が説明されるか。"),
    "H": ("政策適合・波及性", "人手不足、レジリエンス、GX、地域内取引など、公募目的への波及経路が具体的か。"),
    "I": ("反証の強さ", "定性説明を採択理由とみなすことへの反証。高いほど、説明が一般的・事後的・不完全で因果主張が難しい。"),
}


def esc(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return html.escape(str(value), quote=True)


def num(value: object) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(result) else result


def fmt(value: object, digits: int = 1) -> str:
    result = num(value)
    if result is None:
        return "—"
    if abs(result) >= 1000:
        return f"{result:,.0f}"
    return f"{result:,.{digits}f}"


def pct(value: object, digits: int = 1) -> str:
    result = num(value)
    return "—" if result is None else f"{result:.{digits}f}%"


def truthy(value: object) -> bool:
    if isinstance(value, (int, float)) and not pd.isna(value):
        return float(value) != 0.0
    return str(value).strip().lower() in {"true", "1", "1.0", "yes"}


def read(name: str) -> pd.DataFrame:
    return pd.read_csv(HERE / name, encoding="utf-8-sig")


def bar(value: float, maximum: float = 100.0, tone: str = "blue") -> str:
    width = max(0.0, min(100.0, 100 * value / maximum if maximum else 0.0))
    return f'<span class="bar-track" aria-hidden="true"><span class="bar-fill {tone}" style="width:{width:.1f}%"></span></span>'


def metric_summary(core: pd.DataFrame) -> list[dict[str, object]]:
    rows = []
    for no, label, value_col, benchmark_col, below_col, unit in METRICS:
        observed = core[value_col].notna()
        below = core.loc[observed, below_col].map(truthy)
        rows.append({
            "no": no,
            "label": label,
            "observed": int(observed.sum()),
            "below": int(below.sum()),
            "below_pct": 100 * below.mean() if len(below) else float("nan"),
            "unit": unit,
        })
    return rows


def case_metric_rows(row: pd.Series) -> str:
    rendered = []
    for no, label, value_col, benchmark_col, below_col, unit in METRICS:
        value = num(row.get(value_col))
        benchmark = num(row.get(benchmark_col))
        if value is None or benchmark is None:
            continue
        is_below = truthy(row.get(below_col))
        ratio = value / benchmark if benchmark != 0 else None
        rendered.append(
            "<tr>"
            f"<th>No.{no} {esc(label)}</th>"
            f"<td>{fmt(value, 2)} {esc(unit)}</td>"
            f"<td>{fmt(benchmark, 2)} {esc(unit)}</td>"
            f"<td>{fmt(ratio, 2)}倍</td>"
            f"<td><span class=\"status {'below' if is_below else 'above'}\">{'未満' if is_below else '以上'}</span></td>"
            "</tr>"
        )
    return "".join(rendered)


def factor_chips(row: pd.Series) -> str:
    chips = []
    for letter in "ABCDEFGH":
        score = num(row.get(f"{letter}_score"))
        if score is not None and score >= 2:
            label = FACTOR_EXPLANATIONS[letter][0]
            chips.append(f'<span class="chip" title="{esc(label)}">{letter} {int(score)}</span>')
    return "".join(chips)


def render_case(row: pd.Series) -> str:
    company_value = row.get("company_q", row.get("company_c", row.get("company", "")))
    round_value = row.get("round_q", row.get("round_c", row.get("round", "")))
    industry_value = row.get("industry_q", row.get("industry_c", row.get("industry", "")))
    company = esc(company_value)
    archetype = esc(row.get("dominant_archetype", ""))
    local_pdf = esc(row.get("local_pdf_relative", ""))
    web_pdf = esc(row.get("pdf_url_q", row.get("pdf_url", "")))
    quality = "主要品質注意なし" if truthy(row.get("is_clean_q", row.get("is_clean"))) else "品質・期間等の注意あり"
    score = int(num(row.get("below_applicant_n")) or num(row.get("current9_below_applicant_n")) or 0)
    observed = int(num(row.get("observed_n")) or num(row.get("current9_observed_n_reproduced")) or 0)
    confidence = {"High": "高", "Medium": "中", "Low": "低"}.get(
        str(row.get("inference_confidence", "")), str(row.get("inference_confidence", ""))
    )
    search = " ".join([
        str(company_value), str(round_value), str(industry_value), str(row.get("dominant_archetype", "")),
        str(row.get("fact_summary", "")), str(row.get("inference_summary", "")),
    ]).lower()
    evidence_rows = []
    for letter in "ABCDEFGHI":
        score_value = num(row.get(f"{letter}_score"))
        evidence = row.get(f"{letter}_evidence", "")
        source = row.get(f"{letter}_source_page_role", "")
        if score_value is None or not str(evidence).strip():
            continue
        evidence_rows.append(
            f'<tr><th>{letter} {esc(FACTOR_EXPLANATIONS[letter][0])}</th>'
            f'<td>{int(score_value)}</td><td>{esc(evidence)}</td><td>{esc(source)}</td></tr>'
        )
    return f"""
    <article class="case-card" data-round="{esc(round_value)}" data-archetype="{archetype}" data-search="{esc(search)}">
      <details>
        <summary>
          <span><b>{company}</b><small>{esc(round_value)}・{esc(industry_value)}</small></span>
          <span class="case-summary"><b>{score}/{observed}指標が未満</b><small>{archetype}</small></span>
        </summary>
        <div class="case-body">
          <div class="case-meta"><span>{quality}</span><span>推論確度 {esc(confidence)}</span>{factor_chips(row)}</div>
          <div class="two-col">
            <section><h4>公開資料で確認した事実</h4><p>{esc(row.get('fact_summary', ''))}</p></section>
            <section><h4>採択説明としての推論</h4><p>{esc(row.get('inference_summary', ''))}</p></section>
          </div>
          <p class="counter"><b>反証・留保：</b>{esc(row.get('I_evidence', ''))}</p>
          <details class="subdetails"><summary>9指標と申請者中央値の照合</summary>
            <div class="table-wrap"><table><thead><tr><th>指標</th><th>企業値</th><th>同回申請者中央値</th><th>比</th><th>判定</th></tr></thead><tbody>{case_metric_rows(row)}</tbody></table></div>
          </details>
          <details class="subdetails"><summary>A～Iの根拠一覧</summary>
            <div class="table-wrap"><table><thead><tr><th>観点</th><th>点</th><th>根拠</th><th>頁・役割</th></tr></thead><tbody>{''.join(evidence_rows)}</tbody></table></div>
          </details>
          <div class="links">{f'<a href="{local_pdf}" target="_blank" rel="noopener">ローカルPDF</a>' if local_pdf else ''}{f'<a href="{web_pdf}" target="_blank" rel="noopener">公開PDF</a>' if web_pdf else ''}</div>
        </div>
      </details>
    </article>"""


def main() -> None:
    core = read("core28_company_quantitative_table.csv")
    coding = read("qualitative_coding_28.csv")
    correction = read("round_correction_impact.csv")
    membership = read("metric_set_membership.csv")
    sensitivity = read("metric_set_sensitivity.csv")
    boundary = read("boundary_sensitivity.csv")
    permutation = read("permutation_test_summary.csv")
    matched = read("matched_scale_and_effect_comparison.csv")
    scale_ranks = read("round_adjusted_scale_ranks.csv")
    structure = read("round_adjusted_structure_geography_comparison.csv")
    quality = read("quality_indicator_comparison.csv")
    factors = read("qualitative_factor_summary.csv")
    factor_reference = read("qualitative_reference_comparison.csv")
    consistency = read("coding_consistency_overlap.csv")
    text_comparison = read("automated_text_comparison.csv")
    themes = read("theme_prevalence_comparison.csv")
    external = read("external_spot_checks.csv")
    sources = read("source_manifest.csv")

    cases = core.merge(coding, on="case_id", how="left", suffixes=("_q", "_c"))
    if len(cases) != 28 or cases["case_id"].nunique() != 28:
        raise AssertionError("企業別統合表は回次補正後28件一意でなければならない")
    if int(correction["round_changed"].map(truthy).sum()) != 60:
        raise AssertionError("1・2次の回次補正は60件でなければならない")

    metrics = metric_summary(core)
    sens = sensitivity[sensitivity["scope"] == "all"].copy()
    perm = permutation[
        (permutation["metric_set"] == "current9")
        & (permutation["scope"] == "all")
        & (permutation["statistic"] == "count_60pct")
    ].iloc[0]
    perm_clean = permutation[
        (permutation["metric_set"] == "current9")
        & (permutation["scope"] == "clean")
        & (permutation["statistic"] == "count_60pct")
    ].iloc[0]

    archetypes = coding["dominant_archetype"].fillna("その他").value_counts()
    core_clean = int(core["is_clean"].map(truthy).sum())
    any_strength = int((core["current9_below_applicant_n"] < core["current9_observed_n_reproduced"]).sum())
    all_below = int((core["current9_below_applicant_n"] == core["current9_observed_n_reproduced"]).sum())
    above_n = core["current9_observed_n_reproduced"] - core["current9_below_applicant_n"]
    one_strength = int((above_n == 1).sum())
    marginal_case_n = int(boundary.loc[boundary["minimum_relative_gap_below_benchmark"] == 0.05, "flag_n"].iloc[0])
    direct_ab_score3_n = int(((coding["A_score"] >= 3) | (coding["B_score"] >= 3)).sum())
    high_counter_n = int((coding["I_score"] >= 2).sum())

    correction_changed = correction[correction["membership_change"] != "unchanged"].copy()
    correction_label = {
        "removed_after_round_correction": "旧29件から除外",
        "added_after_round_correction": "補正後28件へ追加",
    }
    correction_rows = "".join(
        f"<tr><th>{esc(row.company)}</th><td>{esc(row.round_original)} → {esc(row.application_round)}</td>"
        f"<td>{esc(correction_label.get(row.membership_change, row.membership_change))}</td></tr>"
        for row in correction_changed.itertuples()
    )

    metric_rows = "".join(
        f"<tr><th>No.{r['no']} {esc(r['label'])}</th><td>{r['below']}/{r['observed']}</td><td>{pct(r['below_pct'])}{bar(r['below_pct'], tone='red')}</td></tr>"
        for r in metrics
    )

    eligible_current = membership[pd.to_numeric(membership["current9_observed_n"], errors="coerce") >= 5].copy()
    eligible_current["is_flag"] = eligible_current["current9_flag"].map(truthy)
    round_rows = "".join(
        f"<tr><th>{esc(round_name)}</th><td>{len(group)}</td><td>{int(group['is_flag'].sum())}</td><td>{pct(100*group['is_flag'].mean())}</td></tr>"
        for round_name, group in eligible_current.groupby("round", sort=True)
    )
    threshold_rows = []
    below_share = pd.to_numeric(eligible_current["current9_below_share"], errors="coerce")
    for label, threshold in [("50%以上", 0.50), ("60%以上（主定義）", 0.60), ("3分の2以上", 2/3), ("75%以上", 0.75)]:
        threshold_rows.append(f"<tr><th>{label}</th><td>{int((below_share >= threshold).sum())}</td></tr>")
    observation_rows = []
    observed_all = pd.to_numeric(membership["current9_observed_n"], errors="coerce")
    share_all = pd.to_numeric(membership["current9_below_share"], errors="coerce")
    for minimum in [4, 5, 6, 7]:
        mask = observed_all >= minimum
        observation_rows.append(f"<tr><th>{minimum}指標以上</th><td>{int(mask.sum())}</td><td>{int((mask & (share_all >= .60)).sum())}</td></tr>")
    boundary_rows = "".join(
        f"<tr><th>{'厳密な未満（主定義）' if float(row.minimum_relative_gap_below_benchmark) == 0 else fmt(100*float(row.minimum_relative_gap_below_benchmark), 0) + '%以上下回る'}</th>"
        f"<td>{int(row.flag_n)}</td><td>{int(row.overlap_with_primary_n)}</td><td>{fmt(row.jaccard_with_primary, 3)}</td></tr>"
        for row in boundary.itertuples()
    )
    boundary_cell_n = int(boundary.iloc[0]["primary_core_observed_cell_n"])
    boundary_near_n = int(boundary.iloc[0]["primary_core_abs_gap_lt_5pct_cell_n"])

    sens_labels = {
        "current9": "現行9指標",
        "directional8_no13": "No.13除外",
        "without_no8": "No.8除外",
        "without_no14": "No.14除外",
        "old7_no8_no14": "従来7指標",
        "no8_no13_no14": "No.8・13・14除外",
        "direct_or_near_direct5": "直接・準直接5指標",
        "direct_comparable3": "直接比較3指標",
    }
    sensitivity_rows = "".join(
        f"<tr><th>{esc(sens_labels.get(row.metric_set, row.metric_set))}</th><td>{int(row.flag_n)}</td><td>{int(row.overlap_with_current9_n)}</td><td>{fmt(row.jaccard_with_current9, 3)}{bar(float(row.jaccard_with_current9), 1, 'amber')}</td><td>{esc(row.definition)}</td></tr>"
        for row in sens.itertuples()
    )

    selected_matched = matched[matched["variable"].isin([
        "project_cost_oku", "subsidy_oku", "employees_base", "jobs_increase",
        "jobs_increase_per_subsidy_oku", "sales_increase_per_subsidy", "payroll_increase_per_subsidy",
    ])]
    matched_rows = "".join(
        f"<tr><th>{esc(row.label)}</th><td>{int(row.complete_pair_n)}</td><td>{fmt(row.treated_median, 2)}</td><td>{fmt(row.control_median, 2)}</td><td>{fmt(row.paired_sign_flip_p, 4)}</td></tr>"
        for row in selected_matched.itertuples()
    )

    factor_lookup = {row.factor: row for row in factors.itertuples()}
    ref_lookup = {row.factor: row for row in factor_reference.itertuples()}
    factor_rows = []
    for letter in "ABCDEFGHI":
        row = factor_lookup[letter]
        reference = ref_lookup.get(letter)
        ref = pct(reference.reference_accepted_strong_pct) if reference else "比較なし"
        p_value = fmt(reference.fisher_two_sided_p, 3) if reference else "—"
        factor_rows.append(
            f"<tr><th>{letter} {esc(FACTOR_EXPLANATIONS[letter][0])}</th><td>{int(row.score_2_or_3_n)}/{len(core)}</td><td>{pct(row.score_2_or_3_pct)}{bar(float(row.score_2_or_3_pct), tone='green')}</td><td>{ref}</td><td>{p_value}</td><td>{esc(FACTOR_EXPLANATIONS[letter][1])}</td></tr>"
        )

    reference_rows = "".join(factor_rows)
    archetype_rows = "".join(
        f"<tr><th>{esc(name)}</th><td>{int(count)}</td><td>{pct(100*count/len(core))}{bar(100*count/len(core), tone='purple')}</td></tr>"
        for name, count in archetypes.items()
    )

    consistency_rows = "".join(
        f"<tr><th>{esc(row.factor)} {esc(row.factor_label)}</th><td>{int(row.overlap_n)}</td><td>{pct(row.exact_agreement_pct)}</td><td>{pct(row.within_one_point_pct)}</td><td>{fmt(row.spearman_rho, 2)}</td></tr>"
        for row in consistency.itertuples()
    )

    example_names = [
        "株式会社環境整備産業",
        "八戸酒造株式会社",
        "ときわ製作所株式会社",
        "株式会社ニシムタ",
        "株式会社ホテルニューアワジ",
        "リバードコーポレーション株式会社",
    ]
    examples = coding.set_index("company").reindex(example_names).dropna(how="all")
    example_rows = "".join(
        f"<tr><th>{esc(company)}</th><td>{esc(row.fact_summary)}</td><td>{esc(row.inference_summary)}</td><td>{esc(row.I_evidence)}</td></tr>"
        for company, row in examples.iterrows()
    )

    text_rows = "".join(
        f"<tr><th>{esc(row.metric_label)}</th><td>{fmt(row.core28_mean, 3)}</td><td>{fmt(row.other_accepted_mean, 3)}</td><td>{fmt(row.mean_difference, 3)}</td><td>{fmt(row.within_round_permutation_p, 3)}</td></tr>"
        for row in text_comparison.itertuples()
    )

    theme_rows = "".join(
        f"<tr><th>{esc(row.theme.replace('theme_', ''))}</th><td>{pct(row.core28_pct)}</td><td>{pct(row.other_accepted_pct)}</td><td>{fmt(row.difference_pctpt, 1)}pt</td><td>{fmt(row.fisher_two_sided_p, 3)}</td></tr>"
        for row in themes.head(8).itertuples()
    )

    structure_index = structure.set_index("feature")
    consortium = structure_index.loc["has_consortium"]
    kanto_feature = next((name for name in structure_index.index if "head_office_region" in name and "関東" in name), None)
    kanto = structure_index.loc[kanto_feature] if kanto_feature else None
    period = quality[quality["quality_indicator"] == "period_ambiguity"].iloc[0] if (quality["quality_indicator"] == "period_ambiguity").any() else quality.iloc[-1]
    employee_rank = scale_ranks[scale_ranks["variable"] == "employees_base"].iloc[0]
    reference_n = int(factor_reference["reference_accepted_n"].max())
    consortium_n = int(round(float(consortium.core_mean_or_share) * len(core)))

    stringent = core.loc[above_n == 1, ["case_id", "company", "round"] + [f"below_applicant_no{no}" for no, *_ in METRICS]].merge(
        coding[["case_id", "fact_summary", "inference_summary", "I_evidence"]],
        on="case_id", how="left", validate="one_to_one",
    )
    stringent_rows = []
    for row in stringent.itertuples():
        strength = next(
            (f"No.{no} {label}" for no, label, *_ in METRICS if not truthy(getattr(row, f"below_applicant_no{no}")) and not pd.isna(getattr(row, f"below_applicant_no{no}"))),
            "—",
        )
        stringent_rows.append(
            f"<tr><th>{esc(row.company)}<br><small>{esc(row.round)}</small></th><td>{esc(strength)}</td>"
            f"<td>{esc(row.fact_summary)}</td><td>{esc(row.I_evidence)}</td></tr>"
        )

    external_rows = "".join(
        f'<tr><th>{esc(row.company)}</th><td>{esc(row.check_timing)}</td><td>{esc(row.claim_checked)}</td><td>{esc(row.result)}</td><td><a href="{esc(row.source_url)}" target="_blank" rel="noopener">外部資料</a><br><small>{esc(row.interpretation_limit)}</small></td></tr>'
        for row in external.itertuples()
    )

    source_rows = "".join(
        f'<tr><th>{esc(row.source_id)}</th><td>{esc(row.use)}</td><td>{f"<a href=\"{esc(row.location)}\" target=\"_blank\" rel=\"noopener\">公式・外部ソース</a>" if str(row.location).startswith("http") else f"<code>{esc(row.location)}</code>"}</td><td>{esc(row.important_limit)}</td></tr>'
        for row in sources.itertuples()
    )

    case_cards = "".join(render_case(row) for _, row in cases.sort_values(["round_q", "company_q"]).iterrows())
    archetype_options = "".join(f'<option value="{esc(value)}">{esc(value)}</option>' for value in sorted(archetypes.index))

    kanto_sentence = ""
    if kanto is not None:
        kanto_sentence = (
            f"本社関東は28件で{pct(100*kanto.core_mean_or_share)}、その他で{pct(100*kanto.other_mean_or_share)}"
            f"（同回置換 p={fmt(kanto.round_stratified_permutation_p, 4)}、BH q={fmt(kanto.bh_q_within_all_features, 4)}）。"
            "探索した39特徴中の一つである。"
        )

    chart_max = max(40.0, math.ceil((float(perm.observed) + 5) / 10) * 10)
    expected_left = 100 * float(perm.permutation_mean) / chart_max
    observed_left = 100 * float(perm.observed) / chart_max
    interval_left = 100 * float(perm.permutation_q025) / chart_max
    interval_width = 100 * (float(perm.permutation_q975) - float(perm.permutation_q025)) / chart_max

    data_payload = json.dumps({
        "core": 28,
        "eligible": 373,
        "clean_core": core_clean,
        "clean_eligible": 199,
        "permutation_expected": float(perm.permutation_mean),
        "permutation_interval": [float(perm.permutation_q025), float(perm.permutation_q975)],
    }, ensure_ascii=False)

    report = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>公開指標では弱く見える採択案件：補正後28件の仮説検証</title>
<style>
:root{{--bg:#f4f7fb;--paper:#fff;--ink:#172033;--muted:#5e6b80;--line:#d8e0ec;--nav:#101c34;--nav-ink:#eaf0fb;--blue:#376cb8;--blue-soft:#e9f1ff;--green:#2d855e;--green-soft:#e4f4ec;--red:#b9504f;--red-soft:#f9e9e8;--amber:#bd7b20;--amber-soft:#fff1d7;--purple:#7b5cb8;--purple-soft:#f0eafb;--shadow:0 8px 24px rgba(31,48,78,.08)}}
@media(prefers-color-scheme:dark){{:root{{--bg:#0e1420;--paper:#151e2d;--ink:#edf2fb;--muted:#aebbd0;--line:#334157;--nav:#090e18;--nav-ink:#edf2fb;--blue:#74a7ed;--blue-soft:#1d3658;--green:#71c69a;--green-soft:#173b2c;--red:#ee8984;--red-soft:#4b2527;--amber:#e6ac5a;--amber-soft:#49351d;--purple:#ad91e2;--purple-soft:#352b4a;--shadow:none}}}}
*{{box-sizing:border-box}} html{{scroll-behavior:smooth}} body{{margin:0;background:var(--bg);color:var(--ink);font-family:"Yu Gothic UI","Hiragino Sans",Meiryo,sans-serif;line-height:1.7}} a{{color:var(--blue)}} code{{font-family:ui-monospace,Consolas,monospace;font-size:.9em}} .layout{{display:grid;grid-template-columns:280px minmax(0,1fr);max-width:1640px;margin:auto}} .toc{{position:sticky;top:0;height:100vh;background:var(--nav);color:var(--nav-ink);padding:24px 18px;overflow:auto}} .toc h2{{font-size:16px;margin:0 0 12px}} .toc p{{font-size:12px;color:#b8c6de;margin:0 0 18px}} .toc a{{display:block;color:var(--nav-ink);text-decoration:none;padding:7px 9px;border-left:2px solid transparent;font-size:13px}} .toc a:hover{{background:rgba(255,255,255,.08);border-color:#79a7ea}} .toc button{{width:100%;border:1px solid #4b5d78;background:transparent;color:var(--nav-ink);padding:8px;border-radius:6px;cursor:pointer;margin-top:18px}} .reopen{{display:none;position:fixed;left:0;top:16px;z-index:20;border:0;background:var(--nav);color:var(--nav-ink);padding:10px 8px;border-radius:0 6px 6px 0;cursor:pointer}} body.nav-closed .layout{{grid-template-columns:1fr}} body.nav-closed .toc{{display:none}} body.nav-closed .reopen{{display:block}} main{{min-width:0;padding:38px clamp(18px,4vw,64px) 80px}} .hero{{background:linear-gradient(130deg,var(--nav),#294c7e);color:white;padding:40px clamp(22px,5vw,64px);border-radius:16px;margin-bottom:28px}} .hero h1{{font-size:clamp(28px,4vw,48px);line-height:1.25;margin:0 0 16px}} .hero p{{max-width:980px;font-size:17px;margin:0;color:#e2ebf9}} .eyebrow{{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#bcd0ee;margin-bottom:8px}} section.report{{background:var(--paper);padding:clamp(22px,4vw,46px);border:1px solid var(--line);border-radius:14px;margin:0 0 22px;box-shadow:var(--shadow)}} h2{{font-size:26px;line-height:1.35;margin:0 0 20px}} h3{{font-size:19px;margin:28px 0 10px}} h4{{font-size:15px;margin:0 0 8px}} p{{margin:0 0 15px}} .lead{{font-size:18px}} .callout{{padding:18px 20px;background:var(--blue-soft);border-left:5px solid var(--blue);margin:18px 0}} .warning{{background:var(--amber-soft);border-left-color:var(--amber)}} .critical{{background:var(--red-soft);border-left-color:var(--red)}} .grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:18px 0}} .stat{{border-top:4px solid var(--blue);background:var(--bg);padding:16px}} .stat b{{display:block;font-size:30px;line-height:1.2}} .stat small{{display:block;color:var(--muted)}} .two-col{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}} .flow{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0}} .flow div{{background:var(--bg);padding:14px;border-top:3px solid var(--blue)}} .flow b{{display:block;margin-bottom:5px}} .flow small{{color:var(--muted)}} .table-wrap{{overflow-x:auto}} table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}} th{{font-weight:600}} thead th{{background:var(--bg);white-space:nowrap}} tbody tr:hover{{background:color-mix(in srgb,var(--blue-soft) 55%,transparent)}} .bar-track{{display:block;width:100%;height:5px;background:var(--line);margin-top:5px;border-radius:4px;overflow:hidden;min-width:60px}} .bar-fill{{display:block;height:100%;background:var(--blue)}} .bar-fill.red{{background:var(--red)}} .bar-fill.green{{background:var(--green)}} .bar-fill.amber{{background:var(--amber)}} .bar-fill.purple{{background:var(--purple)}} .null-chart{{position:relative;height:92px;margin:28px 6% 12px;border-bottom:2px solid var(--line)}} .null-chart .interval{{position:absolute;top:42px;height:12px;background:var(--amber);border-radius:8px}} .null-chart .expected,.null-chart .observed{{position:absolute;bottom:0;width:2px;height:64px;background:var(--amber)}} .null-chart .observed{{background:var(--red);width:4px}} .null-chart span{{position:absolute;top:4px;transform:translateX(-50%);white-space:nowrap;font-size:12px}} .null-chart .olabel{{font-weight:bold}} .axis{{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}} .verdicts{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}} .verdict{{padding:15px;border-left:5px solid var(--line);background:var(--bg)}} .verdict.support{{border-color:var(--green)}} .verdict.partial{{border-color:var(--amber)}} .verdict.refute{{border-color:var(--red)}} .verdict.unknown{{border-color:var(--purple)}} .verdict b{{display:block}} .verdict small{{color:var(--muted)}} .formula{{font-family:ui-monospace,Consolas,monospace;background:var(--bg);padding:12px 14px;border:1px solid var(--line);overflow:auto}} details.subdetails{{margin:12px 0;border-top:1px solid var(--line)}} details.subdetails>summary{{cursor:pointer;padding:10px 0;font-weight:600}} .case-tools{{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}} .case-tools label{{font-size:12px;color:var(--muted)}} .case-tools input,.case-tools select{{display:block;margin-top:3px;padding:9px 10px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);min-width:180px}} .case-count{{margin-left:auto;align-self:end;font-weight:bold}} .case-card{{border-top:1px solid var(--line)}} .case-card>details>summary{{display:flex;justify-content:space-between;gap:18px;cursor:pointer;padding:15px 4px;list-style:none}} .case-card>details>summary::-webkit-details-marker{{display:none}} .case-card>details>summary:before{{content:"＋";margin-right:8px;color:var(--blue)}} .case-card>details[open]>summary:before{{content:"−"}} .case-card summary span:first-of-type{{flex:1}} .case-card summary small{{display:block;color:var(--muted);font-weight:normal}} .case-summary{{text-align:right}} .case-body{{padding:4px 8px 24px 28px}} .case-meta{{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px;font-size:12px;color:var(--muted)}} .case-meta>span{{background:var(--bg);padding:3px 7px}} .chip{{color:var(--ink)!important;background:var(--green-soft)!important}} .counter{{background:var(--amber-soft);padding:12px 14px}} .links{{display:flex;gap:12px;margin-top:12px}} .status{{display:inline-block;padding:2px 6px;border-radius:4px;font-weight:bold}} .status.below{{background:var(--red-soft);color:var(--red)}} .status.above{{background:var(--green-soft);color:var(--green)}} .score-guide{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}} .score-guide div{{background:var(--bg);padding:10px}} .source-note{{font-size:12px;color:var(--muted)}} .footer-note{{text-align:center;color:var(--muted);font-size:12px;margin-top:28px}}
@media(max-width:980px){{.layout{{display:block}}.toc{{position:sticky;top:0;height:auto;max-height:100vh;overflow:auto;z-index:19}}.toc nav{{columns:2}}.grid,.flow{{grid-template-columns:repeat(2,1fr)}}.two-col,.verdicts{{grid-template-columns:1fr}}}}
@media(max-width:620px){{main{{padding:16px 10px 50px}}.hero,section.report{{border-radius:8px;padding:22px 16px}}.grid,.flow{{grid-template-columns:1fr}}.toc nav{{columns:1}}.case-card>details>summary{{display:block}}.case-summary{{text-align:left;margin:6px 0 0 24px}}.score-guide{{grid-template-columns:1fr 1fr}}}}
@media print{{.toc,.reopen,.case-tools{{display:none!important}}.layout{{display:block}}main{{padding:0}}section.report{{box-shadow:none;break-inside:auto}}details>*{{display:block!important}}details>summary{{list-style:none}}a{{color:inherit;text-decoration:none}}}}
</style>
</head>
<body>
<button class="reopen" id="reopen" aria-label="目次を開く">≫</button>
<div class="layout">
<aside class="toc" id="toc"><h2>目次</h2><p>旧29件をデータ監査で補正し、定量・定性・制度の代替仮説を比較</p><nav>
<a href="#conclusion">1. エグゼクティブ・サマリー</a><a href="#definition">2. データ監査と対象定義</a><a href="#official">3. 公式審査との関係</a><a href="#quant">4. 定量的な頑健性</a><a href="#hypotheses">5. 説明仮説の比較</a><a href="#qual">6. 全28件の定性精査</a><a href="#archetypes">7. 説明類型と厳しい3件</a><a href="#cases">8. 企業別証拠</a><a href="#round6">9. 第6次への実務示唆</a><a href="#limits">10. 限界と再現方法</a><a href="#sources">11. 資料</a>
</nav><button id="closeToc">目次を閉じる</button></aside>
<main>
<header class="hero"><div class="eyebrow">採択残差の仮説検証</div><h1>公開指標では弱く見える採択案件を、<br>どこまで説明できるか</h1><p>当初抽出した29件を公式採択一覧で再監査し、申請公募回を補正した最終28件を対象とする。近似誤差、閾値、規模、費用対効果、共同申請、地域性、定性証拠、非公開審査の各仮説を、反証可能性とともに比較した。</p></header>

<section class="report" id="conclusion"><h2>1. エグゼクティブ・サマリー</h2>
<p class="source-note"><b>採択残差：</b>採択・交付されたという事実のうち、公開PDFから比較できる9指標だけでは説明できない部分。本レポートは、この残差の説明候補を比較するものであり、審査員の判断を復元するものではない。</p>
<p class="lead"><b>結論は「28件に共通する特殊事情が一つあった」ではない。</b>案件固有の需要、能力制約、事業転換、地域供給網、実行準備は確認できる。しかし、同じ特徴は別の採択企業にも高頻度で現れ、公開資料だけでは採択への因果効果を識別できない。最も整合的なのは、測定上のずれ、企業規模、評価主体、定性的な案件固有性、公開されない審査情報が案件ごとに重なったという説明である。</p>
<div class="grid"><div class="stat"><b>28 / 373</b><small>主定義に該当（7.5%）</small></div><div class="stat"><b>{any_strength} / 28</b><small>少なくとも1指標は申請者中央値以上</small></div><div class="stat"><b>{all_below}</b><small>全観測指標が申請者中央値未満</small></div></div>
<p class="source-note">分母373は、収録採択・交付企業レコードのうち9指標を5つ以上判定できた件数であり、全申請又は全採択件数ではない。全28件に中央値以上の指標が残ることも、主定義が「未満60%以上」であり最大40%の反対方向を許すため、定義からほぼ予想される性質である。</p>
<div class="callout"><b>実務上の読み方：</b>「定量値が弱くても、定性ストーリーで逆転できる」という証拠ではない。公開9指標に弱点がある案件ほど、①顧客・数量を伴う需要、②投資しなければ解けない物理制約、③設備仕様から売上・付加価値・賃金へ至る計算、④用地・許認可・資金の実行証拠を、一つの検証可能な因果鎖として示す必要がある。</div>
<div class="verdicts"><div class="verdict support"><b>比較的強い観測</b><small>28件のうち{direct_ab_score3_n}件は、需要又は能力制約に実名・数量・実行事実を伴う3点証拠がある。共同申請等も{consortium_n}/28件で、その他採択より多い。</small></div><div class="verdict partial"><b>説明の一部になる</b><small>期間曖昧性、近似指標、従業員規模、回次境界、評価主体のずれは「弱く見える」理由を説明する。</small></div><div class="verdict refute"><b>代替優位は確認できない</b><small>補助金1億円当たり雇用・給与効果、金融機関確認書、語句密度は、28件だけの優位を示さない。</small></div><div class="verdict unknown"><b>観測できない</b><small>審査点、プレゼン質疑、財務余力、補助金必要性、不採択企業の個票。したがって個別の採択理由は確定できない。</small></div></div>
</section>

<section class="report" id="definition"><h2>2. データ監査と対象定義</h2>
<div class="callout critical"><b>重要な訂正：当初29件ではなく、最終分析対象は28件である。</b><br>元データの1・2次 <code>round</code> は申請公募回ではなく、企業PDFの公開・命名バッチを反映していた。公式の1次・2次採択一覧の企業名を照合し、旧社名2件を法人番号で確認したところ、181件中60件で回次が逆だった。正しい回次の申請者中央値を付け直すと、旧29件から2件を除き1件を加えた28件となった。この訂正を隠さず、以下の全統計・定性精査を再計算している。</div>
<div class="table-wrap"><table><thead><tr><th>企業</th><th>保存回次 → 申請公募回</th><th>対象集合への影響</th></tr></thead><tbody>{correction_rows}</tbody></table></div>
<p class="source-note">補正根拠：<a href="https://seichotoushi-hojo.jp/assets/pdf/list_1ji.pdf" target="_blank" rel="noopener">1次採択一覧</a>、<a href="https://seichotoushi-hojo.jp/assets/pdf/list_2ji.pdf" target="_blank" rel="noopener">2次採択一覧</a>、<a href="https://seichotoushi-hojo.jp/assets/pdf/list_2ji_tsuika.pdf" target="_blank" rel="noopener">2次追加採択一覧</a>。固定クロスウォークと生成・検証スクリプトを本レポートと同じフォルダに保存した。</p>
<h3>補正後28件の機械的定義</h3>
<p>この28件は「審査上の定量評価が低かった企業」ではない。次の分析規則を満たす収録レコードの集合である。</p>
<div class="flow"><div><b>対象</b><small>1～4次の公開企業PDFを収録した採択・交付企業レコード</small></div><div><b>比較</b><small>補正した申請公募回の申請者全体・公式中央値</small></div><div><b>可観測性</b><small>9指標のうち5指標以上を企業別に再現</small></div><div><b>抽出</b><small>観測指標の60%以上で企業値が中央値未満</small></div></div>
<div class="formula">core28 = observed_metrics ≥ 5 AND count(company_value &lt; applicant_median[application_round]) / observed_metrics ≥ 0.60</div>
<p class="source-note">中央値は分布の中心であり、公式の足切り線・合格点ではない。分析単位は企業PDFの収録レコードで、共同申請の参加者等を含み、公式の採択申請件数と一致しない場合がある。</p>
<h3>公募回別の判定可能レコード</h3><div class="table-wrap"><table><thead><tr><th>申請公募回</th><th>5指標以上判定可能</th><th>28件条件に該当</th><th>収録内比率</th></tr></thead><tbody>{round_rows}</tbody></table></div>
<p>補正後は1次3/100、2次2/74、3次8/106、4次15/93である。各回の収録率と分析単位が同一ではないため、これを公募回別の採択確率や制度変化として比較しない。</p>
<h3>60%・観測5以上という規則の感度</h3><div class="two-col"><div class="table-wrap"><table><thead><tr><th>未満率の閾値（観測5以上）</th><th>該当</th></tr></thead><tbody>{''.join(threshold_rows)}</tbody></table></div><div class="table-wrap"><table><thead><tr><th>最低観測数（未満60%以上）</th><th>判定可能</th><th>該当</th></tr></thead><tbody>{''.join(observation_rows)}</tbody></table></div></div>
<p>50%なら66件、3分の2なら17件、75%なら11件となる。28件は自然に存在するカテゴリーではなく、分析上の閾値で切り出したケーススタディ集合である。</p>
<h3>中央値の境界に対する感度</h3><div class="table-wrap"><table><thead><tr><th>「未満」と数える条件</th><th>該当</th><th>主定義との共通</th><th>Jaccard</th></tr></thead><tbody>{boundary_rows}</tbody></table></div>
<p>主定義28件が持つ観測セル{boundary_cell_n}個のうち、中央値との差が5%未満なのは{boundary_near_n}個（{pct(100*boundary_near_n/boundary_cell_n)}）。企業値が中央値を5%以上下回る場合だけを「未満」と数えると該当は{marginal_case_n}件、10%以上では14件へ減る。したがって、少なくとも一部は中央値近傍の丸め・推計誤差で所属が動く。</p>
<h3>どの指標で下回るのか</h3><div class="table-wrap"><table><thead><tr><th>指標</th><th>未満／観測</th><th>未満率</th></tr></thead><tbody>{metric_rows}</tbody></table></div>
<p>弱さはNo.7、No.8、No.10、No.14に集中する。No.8とNo.14は同じ付加価値増加額の近似分子を共有し、No.8とNo.10は従業員規模の影響を強く受ける。したがって9回の独立した失点とはみなせない。</p>
<details class="subdetails"><summary>算式で構成した4指標の式と公式値との差</summary><div class="table-wrap"><table><thead><tr><th>指標</th><th>本分析の式</th><th>主要なずれ</th></tr></thead><tbody>
<tr><th>No.8 付加価値増加額</th><td>［（目標労働生産性×目標従業員数）－（基準労働生産性×基準従業員数）］÷10,000×1.1</td><td>公式付加価値は営業利益＋従業員給与＋役員給与＋減価償却費。公式分母は就業時間換算従業員＋役員であり、公開PDFの人数と一致しない。1.1は1～4次の集計中央値を参考にした水準補正で、企業別誤差を直さない。</td></tr>
<tr><th>No.10 給与総額増加額</th><td>［（目標1人当たり給与×目標従業員数）－（基準1人当たり給与×基準従業員数）］÷10,000</td><td>公開PDFの従業員数の主体・範囲が、公式の常時使用従業員と一致する保証がない。</td></tr>
<tr><th>No.13 投資額／全社売上高</th><td>公開事業費÷公開基準売上高×100</td><td>公開基準売上高がない案件は欠損。比率が高いほど投資リスクは大きい一方、過大投資にもなり得るため、他の8指標と違い方向が一意でない。</td></tr>
<tr><th>No.14 付加価値増加額／補助金</th><td>No.8の1.1倍補正前の粗近似値÷公開補助金額×100</td><td>No.8と同じ人数・労働生産性を使う。独立した証拠として二重計上できず、企業別公式値でもない。</td></tr>
</tbody></table></div><p>No.1・2もPDF記載値に近いものの、企業値の期間と公式集計の期間が一致する保証がないため「準直接」と扱う。公式定義と相対的に直接比較しやすいNo.7・9・11だけでは83件が該当し、補正後28件との共通は15件、Jaccard係数0.156である。近似指標を除けば同じ企業群が残るわけではない。</p></details>
</section>

<section class="report" id="official"><h2>3. 公開9指標は、公式審査の一部分しか見ていない</h2>
<p>1次公募では、定量面の書面審査を通過した254件に対し、計画の蓋然性をみるプレゼン審査を行い、最終109件を採択した。事務局は不採択者へ「合格者平均に比べ相対的に評価の低かった審査項目」を知らせており、単一指標の足切りではなく複数項目の相対評価であることが確認できる。</p>
<div class="flow"><div><b>① 経営力</b><small>成長ビジョン、戦略、経営資源、管理体制、資金計画</small></div><div><b>② 先進性・成長性</b><small>市場検証、競合差別化、生産性・付加価値</small></div><div><b>③ 地域波及</b><small>給与・雇用、地域取引、供給網レジリエンス</small></div><div><b>④～⑥</b><small>費用対効果、実現可能性、補助金の必要性（6次）</small></div></div>
<p>公開PDFは交付決定後の概要資料であり、申請書全体、ローカルベンチマーク、資金繰り、審査員との質疑を含まない。このため、28件を「数値が悪いのに定性だけで逆転した」と断定するのは早い。正確には、<b>公開9指標だけでは総合評価を再構成できない28件</b>である。</p>
<div class="callout warning"><b>識別できること：</b>公開9指標で説明できない程度と、公開資料に現れた補完候補。<br><b>識別できないこと：</b>各候補の審査点、採択への因果効果、不採択企業との差、審査員が重視した理由。</div>
<p class="source-note">公式根拠：<a href="https://seichotoushi-hojo.jp/1_2ji/information/2024/06/21.html" target="_blank" rel="noopener">1次公募の採択結果</a>、<a href="https://seichotoushi-hojo.jp/1_2ji/information/2024/05/28.html" target="_blank" rel="noopener">不採択理由の情報開示</a>、<a href="https://chukentou-seichotoushi-hojo.jp/assets/documents/common/youryou_6ji.pdf" target="_blank" rel="noopener">6次公募要領・事前公開版</a>。</p>
</section>

<section class="report" id="quant"><h2>4. 定量的な頑健性：件数と構成企業を分けて評価する</h2>
<h3>未満判定は、無作為に散らばるより企業内へ集積している</h3><p>公募回×指標ごとの未満件数と欠損位置を固定し、企業への割当だけを20,000回入れ替えた。60%以上未満となるレコードは平均{fmt(perm.permutation_mean,2)}件、95%範囲{fmt(perm.permutation_q025,0)}～{fmt(perm.permutation_q975,0)}件に対し、観測は{fmt(perm.observed,0)}件だった（上側 p={fmt(perm.upper_tail_p,5)}）。主要品質注意なしでも観測{fmt(perm_clean.observed,0)}件、期待{fmt(perm_clean.permutation_mean,2)}件（p={fmt(perm_clean.upper_tail_p,5)}）。</p>
<div class="null-chart" role="img" aria-label="置換分布の期待{fmt(perm.permutation_mean,2)}件、95%範囲{fmt(perm.permutation_q025,0)}から{fmt(perm.permutation_q975,0)}件に対し観測{fmt(perm.observed,0)}件"><div class="interval" style="left:{interval_left:.2f}%;width:{interval_width:.2f}%"></div><div class="expected" style="left:{expected_left:.2f}%"></div><div class="observed" style="left:{observed_left:.2f}%"></div><span class="elabel" style="left:{expected_left:.2f}%">期待 {fmt(perm.permutation_mean,2)}</span><span class="olabel" style="left:{observed_left:.2f}%">観測 {fmt(perm.observed,0)}</span></div><div class="axis"><span>0件</span><span>{fmt(chart_max/2,0)}件</span><span>{fmt(chart_max,0)}件</span></div>
<div class="callout warning"><b>この置換検定は採択理由の検定ではない。</b>No.8とNo.14は分子を共有し、No.8とNo.10は従業員規模に依存する。置換は現実の指標間相関を壊すため、棄却できるのは「各指標の周辺未満率と欠損だけで説明できる」という限定的な帰無仮説である。特別な企業群の存在、定性評価、採択因果を証明しない。</div>
<h3>指標集合を変えると、総数以上に構成企業が変わる</h3><div class="table-wrap"><table><thead><tr><th>指標集合</th><th>該当</th><th>補正後28件との共通</th><th>Jaccard</th><th>定義</th></tr></thead><tbody>{sensitivity_rows}</tbody></table></div>
<p>従来7指標では30件だが、補正後28件との共通は15件、Jaccard係数は0.349である。Jaccard係数は2集合の共通件数÷和集合件数。したがって「公開指標の多くが申請者中央値を下回る採択案件が一定数ある」という集団レベルの観察と、「どの企業が該当するか」という個社分類は分けて扱う必要がある。</p>
</section>

<section class="report" id="hypotheses"><h2>5. 説明仮説の比較：何が残り、何が棄却されたか</h2>
<p class="source-note"><b>統計表記：</b>p値は、差がないという仮定の下で観測以上の差が出る確率の目安。BH q値は、多数の特徴を同時に探索したことをBenjamini–Hochberg法で補正した値。いずれも効果の大きさや因果関係を直接表さない。</p>
<div class="verdicts">
<div class="verdict partial"><b>H1 期間・主体・近似のずれ：部分支持</b><small>品質注意全体は42.9%対47.0%で差がない。一方、期間曖昧性は42.9%対15.4%（Fisher p=0.00092、品質8項目内BH q=0.0073）。5%の境界条件でも8件が外れ、分類誤差は無視できない。</small></div>
<div class="verdict partial"><b>H2 従業員規模が絶対額を押し下げる：記述的に整合</b><small>基準従業員数中央値は78人対135人、同回内順位中央値は{pct(100*float(employee_rank.core_round_percentile_median))}（0.5との差の符号反転p={fmt(employee_rank.sign_flip_vs_0_5_p,4)}）。ただしNo.8・10が人数に依存するため、抽出規則が小規模企業を選びやすい内生性を含む。</small></div>
<div class="verdict refute"><b>H3 補助金当たり効果が隠れて高い：支持されず</b><small>同回マッチ28対の中央値は、補助金1億円当たり雇用1.02人対2.36人、給与増0.143億円対0.289億円。いずれも28件側が低い。もっとも、No.10で抽出した群の給与効率比較には機械的な選択効果がある。</small></div>
<div class="verdict partial"><b>H4 共同申請・評価主体の不一致：関連あり、機序未識別</b><small>共同申請等は{consortium_n}/28件（25.0%）、その他10/345件（2.9%）。同回置換 p={fmt(consortium.round_stratified_permutation_p,4)}、39特徴内BH q={fmt(consortium.bh_q_within_all_features,4)}。単独企業の指標と申請全体の効果が一致しない可能性はあるが、相乗効果や採択効果そのものは観測していない。</small></div>
<div class="verdict partial"><b>H5 地域・供給網の構成差：探索的</b><small>{esc(kanto_sentence)} 定性精査では供給網・地域インフラ型が10件。業種・地域・公募回の残余交絡を除けず、地域優遇の証拠ではない。</small></div>
<div class="verdict refute"><b>H6 金融機関確認書：識別力なし</b><small>3・4次で28件側23/23、その他190/195。Fisher p=1。一般的な申請実務・加点であって28件固有ではない。</small></div>
<div class="verdict partial"><b>H7 定性的な案件固有性：存在するが識別力は未確認</b><small>全28件に事業転換・実行準備の具体記述がある。一方、非無作為の比較採択{reference_n}件でも同じ特徴が高頻度で、A～E・Hに明確な差を検出しない。差がないことは同等性の証明でもない。</small></div>
<div class="verdict unknown"><b>H8 プレゼン・財務・必要性：観測不能</b><small>公開PDFにない審査要素。公式制度上は重要だが、28件について高かったかは検証できない。</small></div>
</div>
<h3>探索的な同回マッチ28対</h3><p>同じ公募回を必須とし、基準売上高・事業費・補助金・基準従業員数のうち2変数以上の対数距離と業種一致を優先し、対照を重複なしで割り当てた。19対は業種も一致するが、基準売上高が両社でそろうのは8対だけである。これは採択企業内の探索比較であって、不採択企業との差、採択効果又は厳密な近傍対照ではない。</p>
<div class="table-wrap"><table><thead><tr><th>変数</th><th>完全対</th><th>28件中央値</th><th>採択対照中央値</th><th>平均差の符号反転p</th></tr></thead><tbody>{matched_rows}</tbody></table></div>
<p class="source-note">p値は各対の差の符号を20,000回ランダムに反転し、平均差の絶対値を比較した両側ランダム化検定。中央値差そのものの検定ではない。</p>
</section>

<section class="report" id="qual"><h2>6. 全28件の定性精査：事実・推論・反証を分ける</h2>
<p>各公開PDFの全ページを読み、A～Hの説明候補とIの反証を0～3点で符号化した。点数は公式審査点ではなく、公開文章に現れる証拠の具体性を揃えて比較する研究用コードである。企業群を知った上での非盲検評価であり、独立した複数評価者による二重コーディングではない。</p>
<div class="score-guide"><div><b>0</b><small>確認できない</small></div><div><b>1</b><small>一般論・弱い示唆</small></div><div><b>2</b><small>案件固有の具体説明</small></div><div><b>3</b><small>数量・実名・実行事実を伴う</small></div></div>
<div class="table-wrap"><table><thead><tr><th>観点</th><th>2点以上</th><th>28件内割合</th><th>比較採択{reference_n}件</th><th>Fisher p</th><th>操作的定義</th></tr></thead><tbody>{reference_rows}</tbody></table></div>
<p><b>読み方：</b>C事業転換、E実行準備、G雇用・賃上げ、H政策適合は28/28件で2点以上だが、比較採択でもCは100%、E・Hは92.9%である。これは「定性的な強みがある」ことと「28件に固有で採択を識別する」ことが別であると示す。比較群は別目的で選ばれた採択企業の非無作為標本であり、差を検出しないことは同等性を証明しない。F・Gは比較群に対応コードがなく、28件内の記述に限る。</p>
<h3>自動テキスト指標でも、文章の強さは確認されない</h3><div class="table-wrap"><table><thead><tr><th>指標</th><th>28件</th><th>その他採択</th><th>差</th><th>同回置換p</th></tr></thead><tbody>{text_rows}</tbody></table></div>
<p>経営力・市場語句の同回順位は28件側が低く、地域・実現可能性はほぼ同じである。語句密度は内容の質を測らないが、「定性語を多く書いたから通った」という単純な説明とは整合しない。7項目を探索し、最小の未調整p値は0.026であるため、多重比較を考慮せず決定的な差と扱わない。</p>
<h3>テーマ出現率</h3><div class="table-wrap"><table><thead><tr><th>テーマ</th><th>28件</th><th>その他採択</th><th>差</th><th>Fisher p</th></tr></thead><tbody>{theme_rows}</tbody></table></div>
<h3>既存レビューとの一致度</h3><p>以前の別目的目視レビューと重なる16件について、後から一致度を確認した。全項目で±1点以内100%だが、完全一致は43.8～81.3%。E・Hの順位相関は弱い。独立二重コーディングによる再現性評価ではないため、1点差の順位ではなく「案件固有の証拠があるか」という大きな方向に限定して読む。</p><div class="table-wrap"><table><thead><tr><th>観点</th><th>重複</th><th>完全一致</th><th>±1点</th><th>順位相関</th></tr></thead><tbody>{consistency_rows}</tbody></table></div>
</section>

<section class="report" id="archetypes"><h2>7. 説明類型と、公開定量上もっとも厳しい3件</h2>
<p>企業ごとの公開事実を主要な説明候補へ整理した。類型は排他的な採択理由ではなく、複数要因のうち公開情報で比較的具体的なものを便宜的に一つ選んだ分類である。</p>
<div class="table-wrap"><table><thead><tr><th>主要類型</th><th>件数</th><th>構成</th></tr></thead><tbody>{archetype_rows}</tbody></table></div>
<div class="two-col"><div><h3>供給網・地域インフラ</h3><p>重要部材、食品、廃棄物処理、観光等で地域・取引網の代替困難性を示す。定量効果が小さくても、供給途絶回避や地域内波及を説明し得る。</p><h3>事業転換・垂直統合</h3><p>卸から製造、外注から内製、工程統合、宿泊型への転換など、既存延長でない行動変容を示す。</p></div><div><h3>需要確約・能力制約</h3><p>実名顧客の要請、既存能力を超える需要、受注辞退等により、投資の因果鎖と販売確度を補う。</p><h3>実行準備・財務／その他</h3><p>用地・許認可・資金・工程の準備が中心。ただし財務とプレゼンは公開PDFに乏しく、ここは最も観測しにくい。</p></div></div>
<div class="callout critical"><b>類型の存在を採択理由と取り違えない。</b>公開PDFは採択後の概要資料であり、審査員が実際に何を高く評価したかを示さない。{high_counter_n}/28件で反証スコアIが2点以上となり、顧客契約の欠如、他案件にも一般的な説明、主体・期間のずれなど、因果主張を弱める材料が残る。</div>
<h3>中央値以上が1指標しかない3件</h3>
<p>全28件は少なくとも1指標が申請者中央値以上だが、その強みが1指標だけの案件は{one_strength}件である。この3件は「他の定量強みが補った」という説明を最も置きにくく、公開資料の定性事実又は非公開審査へ説明を求める度合いが高い。</p>
<div class="table-wrap"><table><thead><tr><th>企業</th><th>唯一の中央値以上</th><th>公開PDFの案件固有事実</th><th>反証・未解決点</th></tr></thead><tbody>{''.join(stringent_rows)}</tbody></table></div>
<p class="source-note">No.13は投資額／全社売上高で、値が高いほど常に良いとは限らない。株式会社シュゼット・ホールディングスは方向が一意な8指標では全観測値が申請者中央値未満となる唯一のケースである。</p>
<h3>説明力が比較的高い6例</h3><p>数字・固有名詞・実行事実が比較的そろう例を、反証と並べた。強い事例だけを抜き出した例示であり、6社の共通点を28件全体へ一般化しない。</p><div class="table-wrap"><table><thead><tr><th>企業</th><th>公開資料の事実</th><th>説明候補</th><th>反証・限界</th></tr></thead><tbody>{example_rows}</tbody></table></div>
<h3>外部資料による限定的な裏取り</h3><div class="table-wrap"><table><thead><tr><th>企業</th><th>時点</th><th>確認事項</th><th>結果</th><th>資料・限界</th></tr></thead><tbody>{external_rows}</tbody></table></div>
</section>

<section class="report" id="cases"><h2>8. 企業別28件：事実・推論・反証を分けて読む</h2>
<p>各社について、公開資料の事実、採択説明としての推論、反証・留保を分離した。企業名を開くと9指標の値、同回申請者中央値、A～Iのページ根拠を確認できる。</p>
<div class="case-tools"><label>検索<input id="caseSearch" type="search" placeholder="企業名・業種・事実"></label><label>公募回<select id="roundFilter"><option value="">すべて</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select></label><label>類型<select id="archetypeFilter"><option value="">すべて</option>{archetype_options}</select></label><span class="case-count" id="caseCount">28件</span></div>
<div id="caseList">{case_cards}</div>
</section>

<section class="report" id="round6"><h2>9. 第6次公募への示唆：中央値未満を狙うのではなく、弱点を補う証拠鎖をつくる</h2>
<div class="callout warning"><b>6次公募要領は、現時点では事前公開版である。</b>公式サイトは公募開始を2026年7月下旬予定とし、公募開始時に審査項目等を更新する可能性を明記している。申請時は必ず<a href="https://chukentou-seichotoushi-hojo.jp/download/" target="_blank" rel="noopener">公式ダウンロードページ</a>の正式最新版へ差し替える。</div>
<p>今回の28件から「数値が申請者中央値未満でも定性で通せる」と助言するのは危険である。実務上の最適戦略は、<b>実現可能な範囲で可視定量値を同回ベンチマーク以上へ近づけ、そのうえで数字が生まれる因果鎖を一次資料で固定すること</b>である。</p>
<div class="flow"><div><b>需要の証拠</b><small>顧客名、数量、契約・購入意向書（LOI）、引合い、失注・受注辞退、第三者市場</small></div><div><b>制約の証拠</b><small>稼働率、能力上限、外注費、リードタイム、歩留まり、人手不足</small></div><div><b>投資の作用</b><small>設備仕様→能力→売上・付加価値→雇用・賃金を一つの式で接続</small></div><div><b>実行の証拠</b><small>用地、許認可、見積、工程、責任者、融資・表明書、リスク対策</small></div></div>
<h3>6次の6審査項目へ落とす</h3>
<div class="table-wrap"><table><thead><tr><th>公式項目</th><th>申請で示すべきもの</th><th>今回の28件からの教訓</th></tr></thead><tbody>
<tr><th>① 経営力</th><td>5～10年像、全社戦略、補助事業の位置付け、ガバナンス、資金計画、足下の賃上げ。</td><td>設備説明だけでなく、既存強みと全社変革を結ぶ。全社賃上げは物価上昇率を下回ると大幅不利。</td></tr>
<tr><th>② 先進性・成長性</th><td>ユーザー、市場規模、競合、持続成長、模倣困難性、生産性・付加価値。</td><td>「市場が伸びる」ではなく顧客・数量・能力差を示す。需要確約・能力制約型の証拠が効く。</td></tr>
<tr><th>③ 地域への波及</th><td>給与・雇用、利益から賃金への還元、地域取引、供給網レジリエンス。</td><td>雇用人数だけでなく地域内調達額、供給途絶回避、技能職の質を計測する。</td></tr>
<tr><th>④ 大規模投資・費用対効果</th><td>売上に対する投資、補助金当たり付加価値、補助金による行動変容。</td><td>28件に隠れた効率優位は見つからない。No.14等は必ず競争水準を確認する。</td></tr>
<tr><th>⑤ 実現可能性</th><td>体制、財務、ローカルベンチマーク、工程・課題、金融コミットメント、情報管理。</td><td>過大な効果を置かない。公式は、実現性に乏しい過大見積りを定量効果にかかわらず大幅不利と明記。</td></tr>
<tr><th>⑥ 補助金の必要性</th><td>現預金・借入だけでは実現困難な理由、補助なしの規模・時期、資金ギャップ。</td><td>「資金がない」ではなく、補助がなければ何を縮小・延期・中止するのかを示し、補助によって初めて生じる追加効果を明確にする。</td></tr>
</tbody></table></div>
<h3>数値目標の持っていき方</h3><ol><li>9指標を公式様式の定義・期間・主体で再計算し、公開PDF近似値をそのまま使わない。</li><li>同回申請者中央値は安全圏ではない。可能なら採択者中央値も参照し、各公式項目に最低1つは明確な強みを置く。</li><li>絶対額が規模で不利なら、補助金当たり効果と地域内波及を併記する。ただし低い絶対効果を比率だけで隠さない。</li><li>顧客需要→設備能力→販売数量→粗利・付加価値→賃金・雇用を同じ前提でつなぎ、様式1・2・決算・プレゼンの数字を一致させる。</li><li>経営者が式、感応度、下振れ時の返済・賃上げ継続を自分の言葉で説明できる状態まで質疑を反復する。</li><li>加点は該当するものだけ確実に取得・記載する。金融機関の出資・融資表明書など「大幅加点」は、実行義務と取消条件も確認する。</li></ol>
<p>6次事前公開版には、補助率1/4を許容した申請を、本来の採択レベルに満たない場合でも追加採択する可能性が記載されている。事業採算と資金繰りが成立する場合に限り、戦略的選択肢になり得る。</p>
</section>

<section class="report" id="limits"><h2>10. 限界と再現方法</h2>
<h3>この分析が答えられないこと</h3><ul><li>不採択企業の企業別9指標・申請書・定性評価がないため、採択確率、予測モデル、採択への因果効果を推定できない。</li><li>公開PDFは採択後の概要資料であり、申請書、審査記録、プレゼン質疑、財務、加点、ローカルベンチマークを完全には含まない。</li><li>9指標の一部は公開値からの近似で、公式様式の期間・人数・主体と一致しない。No.8・14等には構造的な相関がある。</li><li>28件は閾値と指標集合に依存し、自然な母集団ではない。回次補正前後で3レコードが入れ替わったこと自体が、個社分類の不確実性を示す。</li><li>A～Iは対象群を知った非盲検の手作業コードで、比較採択{reference_n}件も無作為標本ではない。独立二重コーディングではなく、E・Hなど点数の細部は不安定である。</li><li>39の構造・地理特徴と複数のテキスト指標を探索した。BH補正を示しても、共同申請・本社地域の外部妥当性は別標本で再検証が必要である。</li></ul>
<h3>再現手順</h3><div class="formula">python build_application_round_crosswalk.py<br>python analyze_applicant_median_residual.py<br>python analyze_qualitative_evidence.py<br>python build_applicant_median_residual_report.py<br>python validate_applicant_median_residual.py<br>python validate_applicant_median_residual_report.py</div>
<p>公式回次クロスウォーク、旧29件から補正後28件への差分、20,000回置換、境界・指標集合感度、28対マッチング、A～Iコーディング、比較表、外部スポットチェックを同じフォルダへCSV・JSON・Markdownで保存した。HTML本文から中間値を分離し、再集計できる。</p>
<details class="subdetails"><summary>レポート内の集計値</summary><pre id="payload">{esc(data_payload)}</pre></details>
</section>

<section class="report" id="sources"><h2>11. 使用資料と証拠の限界</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>用途</th><th>場所</th><th>限界</th></tr></thead><tbody>{source_rows}</tbody></table></div>
<p class="source-note">6次への示唆は、6次事前公開版の明文を優先した。1～4次の28件分析結果を、6次の採択因果として遡及・外挿していない。</p></section>
<p class="footer-note">公開情報に基づく探索的・記述的分析。企業別の公式審査結果や採択理由を示すものではない。</p>
</main></div>
<script>
const body=document.body,toc=document.getElementById('toc');
document.getElementById('closeToc').addEventListener('click',()=>body.classList.add('nav-closed'));
document.getElementById('reopen').addEventListener('click',()=>body.classList.remove('nav-closed'));
const search=document.getElementById('caseSearch'),round=document.getElementById('roundFilter'),arch=document.getElementById('archetypeFilter'),count=document.getElementById('caseCount');
function filterCases(){{const q=search.value.trim().toLowerCase();let n=0;document.querySelectorAll('.case-card').forEach(card=>{{const show=(!q||card.dataset.search.includes(q))&&(!round.value||card.dataset.round===round.value)&&(!arch.value||card.dataset.archetype===arch.value);card.hidden=!show;if(show)n++;}});count.textContent=n+'件';}}
[search,round,arch].forEach(el=>el.addEventListener('input',filterCases));
</script>
</body></html>"""

    OUTPUT.write_text(report, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
