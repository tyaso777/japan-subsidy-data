"""採択企業を強みの組合せと申請書文章の根拠密度で深掘りする。

非採択個票がないため採択確率は推定しない。採択企業がどの定量軸で強く、
どの案件が公開定量値では説明しにくいかを、公募回内百分位で可視化する。
"""

from __future__ import annotations

import json
import re
import warnings
from pathlib import Path

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CASES_PATH = ROOT / "data" / "processed" / "cases.csv"
BENCHMARKS_PATH = ROOT / "data" / "reference" / "official_round_benchmarks.csv"
DIAGNOSTICS_PATH = HERE / "company_diagnostics.csv"
PAGES_PATH = ROOT / "data" / "text" / "pages.jsonl"

CRITERIA_TERMS = {
    "management": ("長期", "ビジョン", "経営", "課題", "戦略", "収益", "成長", "変革", "強み", "弱み"),
    "innovation_market": ("新規", "革新", "独自", "差別化", "模倣", "特許", "先端", "高付加価値", "競合", "市場", "シェア", "顧客", "需要", "受注"),
    "regional_spillover": ("雇用", "地域", "地元", "仕入", "調達", "サプライチェーン", "賃上げ", "人材", "取引先", "波及"),
    "feasibility": ("工程", "スケジュール", "許認可", "資金", "金融機関", "融資", "自己資金", "体制", "責任者", "発注", "契約", "実績", "リスク"),
    "policy_relevance": ("省人", "省力", "自動化", "DX", "GX", "脱炭素", "国内回帰", "安定供給", "経済安全保障", "生産能力"),
}

EVIDENCE_MARKERS = (
    "実績", "受注", "契約", "確保", "シェア", "比較", "見込", "予定", "計画", "調査", "統計", "顧客", "市場規模"
)

AXIS_LABELS = {
    "axis_growth_productivity": "成長・生産性型",
    "axis_absolute_effect": "効果絶対額型",
    "axis_cost_effectiveness": "補助金効率型",
    "axis_wage_employment": "賃金・雇用型",
    "axis_transformation": "企業変革投資型",
}

VISIBLE_FIELDS = {
    "company_sales_cagr": "sales_cagr_pct",
    "company_sales_increase": "sales_increase_oku_yen_normalized",
    "labor_cagr": "labor_annual_rate_pct",
    "employee_pay_rate": "employee_pay_annual_rate_pct",
    "employee_pay_total_increase": "employee_pay_total_increase_estimated_oku",
    "officer_pay_rate": "officer_pay_annual_rate_pct",
    "investment_sales_ratio": "investment_sales_ratio_pct",
}


def num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def round_pct(df: pd.DataFrame, col: str) -> pd.Series:
    return df.groupby("round")[col].rank(pct=True, method="average")


def mean_available(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    return df[cols].mean(axis=1, skipna=True)


def load_text() -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    all_text: dict[str, list[str]] = {}
    by_role: dict[str, dict[str, list[str]]] = {}
    with PAGES_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            page = json.loads(line)
            case_id = str(page["case_id"])
            role = str(page.get("role", "不明"))
            text = str(page.get("text", ""))
            all_text.setdefault(case_id, []).append(text)
            by_role.setdefault(case_id, {}).setdefault(role, []).append(text)
    return (
        {key: "\n".join(value) for key, value in all_text.items()},
        {case_id: {role: "\n".join(value) for role, value in roles.items()} for case_id, roles in by_role.items()},
    )


def evidence_features(text: str, terms: tuple[str, ...]) -> tuple[int, int, float]:
    unique_terms = sum(term.lower() in text.lower() for term in terms)
    sentences = [s.strip() for s in re.split(r"[。！？\n]+", text) if s.strip()]
    evidence_sentences = 0
    for sentence in sentences:
        has_term = any(term.lower() in sentence.lower() for term in terms)
        has_support = bool(re.search(r"\d", sentence)) or any(marker in sentence for marker in EVIDENCE_MARKERS)
        if has_term and has_support:
            evidence_sentences += 1
    # 長文ほど有利になり過ぎないよう1,000文字当たりにし、上限を設ける。
    density = min(10.0, 1000 * evidence_sentences / max(len(text), 500))
    return unique_terms, evidence_sentences, density


def assign_profile(row: pd.Series, axes: list[str]) -> str:
    scores = row[axes].dropna()
    if len(scores) < 3:
        return "公開定量情報不足"
    strong = scores[scores >= 0.65]
    if len(strong) >= 3:
        return "複合バランス型"
    if scores.max() < 0.55:
        return "公開5軸で強み未特定"
    return AXIS_LABELS[scores.idxmax()]


def main() -> None:
    warnings.simplefilter("ignore", pd.errors.PerformanceWarning)
    cases = pd.read_csv(CASES_PATH).copy()
    benchmarks = pd.read_csv(BENCHMARKS_PATH)
    diag = pd.read_csv(DIAGNOSTICS_PATH)
    keep = [
        "case_id", "visible_metric_lagging", "unresolved_visible_lag",
        "value_added_increase_proxy_oku", "value_added_subsidy_ratio_proxy_pct",
        "sales_increase_per_subsidy", "payroll_increase_per_subsidy",
        "jobs_increase_per_subsidy_oku", "project_sales_increase_proxy",
        "project_sales_cagr_proxy", "project_sales_share_proxy",
    ]
    df = cases.merge(diag[keep], on="case_id", how="left", validate="one_to_one")
    df["subsidy_oku"] = num(df["subsidy_million_yen_normalized"]) / 100
    df["project_cost_oku"] = num(df["project_cost_million_yen_normalized"]) / 100
    df["jobs_increase"] = num(df["employees_target_value"]) - num(df["employees_base_value"])
    df["investment_sales_ratio_pct"] = (
        num(df["project_cost_million_yen_normalized"]) / num(df["sales_baseline_oku_yen"])
    )

    applicant_rows = benchmarks[benchmarks["statistic"].eq("median")]
    applicant_medians = {
        (str(row["round"]), row["metric_key"]): float(row["applicant_value"])
        for _, row in applicant_rows.iterrows()
        if pd.notna(row["applicant_value"])
    }
    applicant_counts = []
    for _, row in df.iterrows():
        compared = 0
        above = 0
        for key, field in VISIBLE_FIELDS.items():
            value = pd.to_numeric(pd.Series([row[field]]), errors="coerce").iloc[0]
            threshold = applicant_medians.get((str(row["round"]), key), np.nan)
            if pd.notna(value) and pd.notna(threshold):
                compared += 1
                above += int(value >= threshold)
        applicant_counts.append((compared, above))
    df[["applicant_comparable_count", "above_applicant_median_count"]] = applicant_counts
    df["above_applicant_median_share"] = (
        df["above_applicant_median_count"] / df["applicant_comparable_count"]
    )

    base_metrics = [
        "sales_cagr_pct", "sales_increase_oku_yen_normalized", "labor_annual_rate_pct",
        "employee_pay_annual_rate_pct", "employee_pay_total_increase_estimated_oku",
        "officer_pay_annual_rate_pct", "investment_sales_ratio_pct", "project_cost_oku",
        "value_added_increase_proxy_oku", "value_added_subsidy_ratio_proxy_pct",
        "sales_increase_per_subsidy", "payroll_increase_per_subsidy",
        "jobs_increase", "jobs_increase_per_subsidy_oku", "project_sales_increase_proxy",
        "project_sales_cagr_proxy", "project_sales_share_proxy",
    ]
    for metric in base_metrics:
        df[f"pct_{metric}"] = round_pct(df, metric)

    axis_parts = {
        "axis_growth_productivity": [
            "pct_sales_cagr_pct", "pct_sales_increase_oku_yen_normalized", "pct_labor_annual_rate_pct",
            "pct_project_sales_increase_proxy", "pct_project_sales_cagr_proxy", "pct_project_sales_share_proxy",
        ],
        "axis_absolute_effect": [
            "pct_sales_increase_oku_yen_normalized", "pct_value_added_increase_proxy_oku",
            "pct_employee_pay_total_increase_estimated_oku", "pct_jobs_increase",
        ],
        "axis_cost_effectiveness": [
            "pct_value_added_subsidy_ratio_proxy_pct", "pct_sales_increase_per_subsidy",
            "pct_payroll_increase_per_subsidy", "pct_jobs_increase_per_subsidy_oku",
        ],
        "axis_wage_employment": [
            "pct_employee_pay_annual_rate_pct", "pct_employee_pay_total_increase_estimated_oku",
            "pct_jobs_increase", "pct_jobs_increase_per_subsidy_oku",
        ],
        "axis_transformation": ["pct_investment_sales_ratio_pct", "pct_project_cost_oku"],
    }
    axes = list(axis_parts)
    for axis, parts in axis_parts.items():
        df[axis] = mean_available(df, parts)
        df[f"{axis}_coverage"] = df[parts].notna().sum(axis=1)

    df["quantitative_axis_mean"] = mean_available(df, axes)
    df["quantitative_axis_max"] = df[axes].max(axis=1, skipna=True)
    df["strong_axis_count"] = df[axes].ge(0.65).sum(axis=1)
    df["weak_axis_count"] = df[axes].lt(0.35).sum(axis=1)
    df["application_profile"] = df.apply(assign_profile, axis=1, axes=axes)

    all_text, by_role = load_text()
    df["text_length"] = df["case_id"].astype(str).map(lambda x: len(all_text.get(x, "")))
    df["vision_text_length"] = df["case_id"].astype(str).map(
        lambda x: len(by_role.get(x, {}).get("長期成長ビジョン", ""))
    )
    df["project_text_length"] = df["case_id"].astype(str).map(
        lambda x: len(by_role.get(x, {}).get("補助事業の概要", ""))
    )
    for criterion, terms in CRITERIA_TERMS.items():
        values = df["case_id"].astype(str).map(lambda x: evidence_features(all_text.get(x, ""), terms))
        df[f"text_{criterion}_unique_terms"] = values.map(lambda x: x[0])
        df[f"text_{criterion}_evidence_sentences"] = values.map(lambda x: x[1])
        df[f"text_{criterion}_evidence_density"] = values.map(lambda x: x[2])
        df[f"text_{criterion}_density_pct"] = round_pct(df, f"text_{criterion}_evidence_density")
    density_cols = [f"text_{criterion}_evidence_density" for criterion in CRITERIA_TERMS]
    density_pct_cols = [f"text_{criterion}_density_pct" for criterion in CRITERIA_TERMS]
    df["text_evidence_density_mean"] = mean_available(df, density_cols)
    df["text_evidence_percentile_mean"] = mean_available(df, density_pct_cols)
    df["qualitative_compensation_candidate"] = (
        df["unresolved_visible_lag"].fillna(False)
        & df["text_evidence_percentile_mean"].ge(0.65)
    )

    profile_summary = (
        df.groupby("application_profile", dropna=False)
        .agg(
            company_count=("case_id", "size"),
            share_pct=("case_id", lambda s: 100 * len(s) / len(df)),
            visible_lagging_pct=("visible_metric_lagging", lambda s: 100 * s.mean()),
            unresolved_lag_pct=("unresolved_visible_lag", lambda s: 100 * s.mean()),
            median_quantitative_axis=("quantitative_axis_mean", "median"),
            median_text_evidence_percentile=("text_evidence_percentile_mean", "median"),
        )
        .reset_index()
        .sort_values("company_count", ascending=False)
    )

    comparison_groups = {
        "全採択企業": pd.Series(True, index=df.index),
        "可視指標劣後": df["visible_metric_lagging"].fillna(False),
        "定量で未説明": df["unresolved_visible_lag"].fillna(False),
        "その他採択企業": ~df["visible_metric_lagging"].fillna(False),
    }
    evidence_rows = []
    for group_name, mask in comparison_groups.items():
        for criterion in CRITERIA_TERMS:
            evidence_rows.append({
                "group": group_name,
                "criterion": criterion,
                "n": int(mask.sum()),
                "mean_evidence_sentences": df.loc[mask, f"text_{criterion}_evidence_sentences"].mean(),
                "median_evidence_density_per_1000_chars": df.loc[mask, f"text_{criterion}_evidence_density"].median(),
                "mean_within_round_percentile": df.loc[mask, f"text_{criterion}_density_pct"].mean(),
            })
    evidence_summary = pd.DataFrame(evidence_rows)

    sensitivity_rows = []
    sensitivity_groups = {
        "全採択企業": pd.Series(True, index=df.index),
        "可視指標劣後": df["visible_metric_lagging"].fillna(False),
        "定量で未説明": df["unresolved_visible_lag"].fillna(False),
    }
    for group_name, mask in sensitivity_groups.items():
        for threshold in (0.60, 0.65, 0.70, 0.75):
            count = df.loc[mask, axes].ge(threshold).any(axis=1).sum()
            sensitivity_rows.append({
                "group": group_name,
                "strong_axis_threshold": threshold,
                "n": int(mask.sum()),
                "at_least_one_strong_axis_n": int(count),
                "at_least_one_strong_axis_pct": 100 * count / mask.sum(),
            })
    sensitivity = pd.DataFrame(sensitivity_rows)

    applicant_comparison_rows = []
    for group_name, mask in sensitivity_groups.items():
        group = df.loc[mask]
        applicant_comparison_rows.append({
            "group": group_name,
            "n": len(group),
            "at_least_one_above_applicant_n": int(group["above_applicant_median_count"].ge(1).sum()),
            "at_least_half_above_applicant_n": int(group["above_applicant_median_share"].ge(0.5).sum()),
            "mean_above_applicant_share": group["above_applicant_median_share"].mean(),
            "median_above_applicant_count": group["above_applicant_median_count"].median(),
        })
    applicant_comparison = pd.DataFrame(applicant_comparison_rows)

    output_cols = [
        "case_id", "round", "company", "pdf_url", "industry", "visible_metric_lagging",
        "unresolved_visible_lag", "applicant_comparable_count", "above_applicant_median_count",
        "above_applicant_median_share", "application_profile", *axes, "quantitative_axis_mean",
        "quantitative_axis_max", "strong_axis_count", "weak_axis_count",
        "text_length", "vision_text_length", "project_text_length",
        *[col for criterion in CRITERIA_TERMS for col in (
            f"text_{criterion}_unique_terms", f"text_{criterion}_evidence_sentences",
            f"text_{criterion}_evidence_density", f"text_{criterion}_density_pct",
        )],
        "text_evidence_density_mean", "text_evidence_percentile_mean",
        "qualitative_compensation_candidate",
    ]
    profiles = df[output_cols].sort_values(
        ["unresolved_visible_lag", "quantitative_axis_mean"],
        ascending=[False, True],
    )
    profiles.to_csv(HERE / "application_profiles.csv", index=False, encoding="utf-8-sig")
    profile_summary.to_csv(HERE / "profile_summary.csv", index=False, encoding="utf-8-sig")
    evidence_summary.to_csv(HERE / "criteria_evidence_summary.csv", index=False, encoding="utf-8-sig")
    sensitivity.to_csv(HERE / "threshold_sensitivity.csv", index=False, encoding="utf-8-sig")
    applicant_comparison.to_csv(HERE / "applicant_benchmark_summary.csv", index=False, encoding="utf-8-sig")

    summary = {
        "company_count": int(len(df)),
        "profile_counts": df["application_profile"].value_counts().to_dict(),
        "strong_axis_distribution": df["strong_axis_count"].value_counts().sort_index().to_dict(),
        "unresolved_visible_lag_n": int(df["unresolved_visible_lag"].sum()),
        "qualitative_compensation_candidate_n": int(df["qualitative_compensation_candidate"].sum()),
        "visible_lagging_above_at_least_one_applicant_median_n": int(
            (df["visible_metric_lagging"].fillna(False) & df["above_applicant_median_count"].ge(1)).sum()
        ),
        "warning": "採択企業内の類型化であり、採択確率・審査点・因果効果ではない",
    }
    (HERE / "deep_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    assert len(profiles) == 381
    assert df[axes].notna().sum().min() > 300
    assert df["application_profile"].notna().all()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
