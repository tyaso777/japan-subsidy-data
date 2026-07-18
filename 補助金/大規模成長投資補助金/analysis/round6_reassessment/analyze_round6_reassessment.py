"""Reassess low-public-metric awardees and build round-6 evidence tables.

This is a descriptive audit of accepted / grant-decided companies.  It cannot
estimate acceptance probabilities because rejected-company microdata and
review scores are not public.  The script deliberately keeps dashboard-
compatible results, alternative metric-set sensitivities, data-quality
sensitivities, and qualitative review evidence separate.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Iterable

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ADOPTION = HERE.parent / "adoption_drivers"

CASES_PATH = PROJECT / "data" / "processed" / "cases.csv"
BENCH_PATH = PROJECT / "data" / "reference" / "official_round_benchmarks.csv"
PROFILE_PATH = ADOPTION / "application_profiles.csv"
PAIR_COMPANY_PATH = ADOPTION / "expanded_pair_company_coding.csv"
PAIR_FACTOR_PATH = ADOPTION / "expanded_pair_factor_summary.csv"
MANUAL24_PATH = HERE / "manual_review_current_low_24.csv"

VALUE_ADDED_LEVEL_ADJUSTMENT = 1.1
PRIMARY_MIN_OBS = 5
PRIMARY_BELOW_SHARE = 0.60
RNG_SEED = 20260719


@dataclass(frozen=True)
class Metric:
    no: int
    key: str
    label: str
    field: str
    unit: str
    quality_key: str
    comparability: str
    direction: str = "higher"


METRICS = [
    Metric(1, "company_sales_cagr", "全社年平均売上高成長率", "sales_cagr_pct", "%/年", "sales_rate", "proxy"),
    Metric(2, "company_sales_increase", "全社売上高増加額", "sales_increase_oku_yen_normalized", "億円", "sales_values", "proxy"),
    Metric(7, "labor_cagr", "補助事業年平均労働生産性の伸び", "labor_annual_rate_pct", "%/年", "labor_rate", "comparable"),
    Metric(8, "value_added_increase", "補助事業付加価値増加額（簡易補正推計）", "value_added_increase_estimated_oku", "億円", "value_added_increase_estimated", "proxy"),
    Metric(9, "employee_pay_rate", "年平均従業員目標賃上げ率", "employee_pay_annual_rate_pct", "%/年", "employee_pay_rate", "comparable"),
    Metric(10, "employee_pay_total_increase", "従業員給与支給総額の増加額（推計）", "employee_pay_total_increase_estimated_oku", "億円", "employee_pay_total_increase", "proxy"),
    Metric(11, "officer_pay_rate", "年平均役員目標賃上げ率", "officer_pay_annual_rate_pct", "%/年", "officer_pay_rate", "comparable"),
    Metric(13, "investment_sales_ratio", "全社売上高に対する投資額割合（近似）", "investment_sales_ratio_pct", "%", "investment_sales_ratio", "proxy", "context"),
    Metric(14, "value_added_subsidy_ratio", "補助金額に対する付加価値増加額割合（推計）", "value_added_subsidy_ratio_proxy_pct", "%", "value_added_subsidy_ratio_proxy", "proxy"),
]

DIRECTIONAL_METRICS = [m for m in METRICS if m.direction == "higher"]
OLD7_METRICS = [m for m in METRICS if m.no not in {8, 14}]
COMPARABLE_METRICS = [m for m in METRICS if m.comparability == "comparable"]
WITHOUT_NO14_METRICS = [m for m in METRICS if m.no != 14]
WITHOUT_NO8_METRICS = [m for m in METRICS if m.no != 8]
PAST_MONOTONIC_DEDUP_METRICS = [m for m in METRICS if m.no not in {13, 14}]
ABSOLUTE_EFFECT_METRICS = [m for m in METRICS if m.no in {2, 8, 10}]
RATE_METRICS = [m for m in METRICS if m.no in {1, 7, 9, 11}]

COMPONENTS = {
    "growth": ["company_sales_cagr", "company_sales_increase"],
    "productivity_value": ["labor_cagr", "value_added_increase", "value_added_subsidy_ratio"],
    "wage": ["employee_pay_rate", "employee_pay_total_increase", "officer_pay_rate"],
}

DEDUP_COMPONENTS = {
    "growth": ["company_sales_cagr", "company_sales_increase"],
    "productivity_value": ["labor_cagr", "value_added_increase"],
    "wage": ["employee_pay_rate", "employee_pay_total_increase", "officer_pay_rate"],
}

OFFICIAL_URLS = {
    "round6_home": "https://chukentou-seichotoushi-hojo.jp/",
    "round6_download": "https://chukentou-seichotoushi-hojo.jp/download/",
    "round6_overview": "https://chukentou-seichotoushi-hojo.jp/assets/documents/common/gaiyou_6ji.pdf",
    "round6_guidelines": "https://chukentou-seichotoushi-hojo.jp/assets/documents/common/youryou_6ji.pdf",
    "round6_forms": "https://chukentou-seichotoushi-hojo.jp/assets/documents/common/youshiki_6ji.zip",
    "round5_medians": "https://chukentou-seichotoushi-hojo.jp/assets/documents/common/5ji_median.pdf",
    "round5_results": "https://chukentou-seichotoushi-hojo.jp/information/index.html",
}


def num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def as_bool(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes"}


def derived_status(frame: pd.DataFrame, *keys: str) -> pd.Series:
    cols = [frame[f"{key}_analysis_status"].fillna("unavailable") for key in keys]
    table = pd.concat(cols, axis=1)

    def combine(row: pd.Series) -> str:
        values = set(row.astype(str))
        if values == {"ready"}:
            return "ready"
        if values.issubset({"ready", "usable_with_caution"}):
            return "usable_with_caution"
        if "review_required" in values:
            return "review_required"
        return "unavailable"

    return table.apply(combine, axis=1)


def add_dashboard_metrics(cases: pd.DataFrame) -> pd.DataFrame:
    cases = cases.copy()
    cases["subsidy_oku"] = num(cases["subsidy_million_yen_normalized"]) / 100
    cases["project_cost_oku"] = num(cases["project_cost_million_yen_normalized"]) / 100
    cases["investment_sales_ratio_pct"] = (
        num(cases["project_cost_million_yen_normalized"]) / num(cases["sales_baseline_oku_yen"])
    )
    cases["investment_sales_ratio_analysis_status"] = derived_status(cases, "project_cost", "sales_values")

    raw = (
        num(cases["labor_target_value_man_yen_per_person"]) * num(cases["employees_target_value"])
        - num(cases["labor_base_value_man_yen_per_person"]) * num(cases["employees_base_value"])
    ) / 10_000
    cases["value_added_increase_proxy_raw_oku"] = raw
    cases["value_added_increase_estimated_oku"] = raw * VALUE_ADDED_LEVEL_ADJUSTMENT
    cases["value_added_increase_estimated_analysis_status"] = derived_status(
        cases, "labor_values", "employees_values"
    )
    cases["value_added_subsidy_ratio_proxy_pct"] = 100 * raw / cases["subsidy_oku"]
    cases["value_added_subsidy_ratio_proxy_analysis_status"] = derived_status(
        cases, "labor_values", "employees_values", "subsidy"
    )

    cases["sales_increase_per_subsidy"] = num(cases["sales_increase_oku_yen_normalized"]) / cases["subsidy_oku"]
    cases["payroll_increase_per_subsidy"] = num(cases["employee_pay_total_increase_estimated_oku"]) / cases["subsidy_oku"]
    cases["jobs_increase"] = num(cases["employees_target_value"]) - num(cases["employees_base_value"])
    cases["jobs_increase_per_subsidy_oku"] = cases["jobs_increase"] / cases["subsidy_oku"]
    cases["is_clean"] = ~cases["analysis_exclusion_recommended"].map(as_bool)
    return cases


def benchmark_maps(bench: pd.DataFrame, column: str) -> dict[tuple[str, str], float]:
    result: dict[tuple[str, str], float] = {}
    for _, row in bench.iterrows():
        value = pd.to_numeric(pd.Series([row[column]]), errors="coerce").iloc[0]
        if pd.notna(value):
            result[(str(row["round"]), str(row["metric_key"]))] = float(value)
    return result


def add_benchmark_flags(cases: pd.DataFrame, bench: pd.DataFrame) -> pd.DataFrame:
    cases = cases.copy()
    accepted = benchmark_maps(bench, "accepted_value")
    applicant = benchmark_maps(bench, "applicant_value")
    for metric in METRICS:
        values = num(cases[metric.field])
        a = pd.Series([accepted.get((str(r), metric.key), np.nan) for r in cases["round"]], index=cases.index)
        p = pd.Series([applicant.get((str(r), metric.key), np.nan) for r in cases["round"]], index=cases.index)
        cases[f"benchmark_accepted_{metric.key}"] = a
        cases[f"benchmark_applicant_{metric.key}"] = p
        cases[f"below_accepted_{metric.key}"] = np.where(values.notna() & a.notna(), values < a, np.nan)
        cases[f"at_or_above_accepted_{metric.key}"] = np.where(values.notna() & a.notna(), values >= a, np.nan)
        cases[f"above_accepted_{metric.key}"] = np.where(values.notna() & a.notna(), values > a, np.nan)
        cases[f"at_or_above_applicant_{metric.key}"] = np.where(values.notna() & p.notna(), values >= p, np.nan)
        cases[f"above_applicant_{metric.key}"] = np.where(values.notna() & p.notna(), values > p, np.nan)
    return cases


def classification(cases: pd.DataFrame, metrics: list[Metric], prefix: str, min_obs: int, share: float) -> None:
    below_cols = [f"below_accepted_{m.key}" for m in metrics]
    accepted_cols = [f"at_or_above_accepted_{m.key}" for m in metrics]
    applicant_cols = [f"at_or_above_applicant_{m.key}" for m in metrics]
    below = cases[below_cols].apply(pd.to_numeric, errors="coerce")
    accepted = cases[accepted_cols].apply(pd.to_numeric, errors="coerce")
    applicant = cases[applicant_cols].apply(pd.to_numeric, errors="coerce")
    cases[f"{prefix}_observed_n"] = below.notna().sum(axis=1)
    cases[f"{prefix}_below_accepted_n"] = below.sum(axis=1, min_count=1)
    cases[f"{prefix}_below_accepted_share"] = cases[f"{prefix}_below_accepted_n"] / cases[f"{prefix}_observed_n"]
    cases[f"{prefix}_at_or_above_accepted_n"] = accepted.sum(axis=1, min_count=1)
    cases[f"{prefix}_at_or_above_applicant_n"] = applicant.sum(axis=1, min_count=1)
    cases[f"{prefix}_at_or_above_applicant_share"] = cases[f"{prefix}_at_or_above_applicant_n"] / cases[f"{prefix}_observed_n"]
    cases[f"{prefix}_lagging"] = (
        cases[f"{prefix}_observed_n"].ge(min_obs)
        & cases[f"{prefix}_below_accepted_share"].ge(share)
    )


def add_component_wins(cases: pd.DataFrame) -> pd.DataFrame:
    cases = cases.copy()
    for component, keys in COMPONENTS.items():
        cols = [f"at_or_above_accepted_{key}" for key in keys]
        values = cases[cols].apply(pd.to_numeric, errors="coerce")
        cases[f"component_{component}_observed"] = values.notna().any(axis=1)
        cases[f"component_{component}_win"] = values.fillna(0).max(axis=1).gt(0)
    win_cols = [f"component_{c}_win" for c in COMPONENTS]
    cases["directional_component_win_n"] = cases[win_cols].sum(axis=1)
    cases["directional_explanation_level"] = np.select(
        [
            cases["directional_component_win_n"].ge(2),
            cases["directional_component_win_n"].eq(1),
        ],
        ["2領域以上に中央値以上あり", "1領域に中央値以上あり"],
        default="観測指標に中央値以上なし",
    )
    return cases


def add_strict_comparison_sensitivity(cases: pd.DataFrame) -> pd.DataFrame:
    """Add strict-greater-than sensitivity for ties at rounded official values."""
    cases = cases.copy()
    applicant_cols = [f"above_applicant_{metric.key}" for metric in METRICS]
    applicant = cases[applicant_cols].apply(pd.to_numeric, errors="coerce")
    cases["dashboard9_strict_above_applicant_n"] = applicant.sum(axis=1, min_count=1)
    cases["dashboard9_strict_above_applicant_share"] = (
        cases["dashboard9_strict_above_applicant_n"] / cases["dashboard9_observed_n"]
    )
    cases["dashboard9_strict_applicant_majority"] = cases["dashboard9_strict_above_applicant_share"].gt(0.5)

    for component, keys in COMPONENTS.items():
        cols = [f"above_accepted_{key}" for key in keys]
        values = cases[cols].apply(pd.to_numeric, errors="coerce")
        cases[f"strict_component_{component}_win"] = values.fillna(0).max(axis=1).gt(0)
    strict_cols = [f"strict_component_{component}_win" for component in COMPONENTS]
    cases["strict_component_win_n"] = cases[strict_cols].sum(axis=1)
    return cases


def add_deduplicated_component_screen(cases: pd.DataFrame) -> pd.DataFrame:
    """Screen at the conceptual-component level without counting No.14 twice.

    For each component, take the median of available company/accepted-median
    ratios.  A component is below when that median is below one.  The company
    screen requires at least two observed components and at least two below.
    This is a robustness specification, not an official scoring model.
    """
    cases = cases.copy()
    for component, keys in DEDUP_COMPONENTS.items():
        ratios = []
        for key in keys:
            metric = next(item for item in METRICS if item.key == key)
            value = num(cases[metric.field])
            benchmark = num(cases[f"benchmark_accepted_{key}"])
            ratios.append((value / benchmark).where(value.notna() & benchmark.gt(0)))
        ratio_frame = pd.concat(ratios, axis=1)
        cases[f"dedup_component_{component}_ratio"] = ratio_frame.median(axis=1, skipna=True)
        cases[f"dedup_component_{component}_below"] = np.where(
            cases[f"dedup_component_{component}_ratio"].notna(),
            cases[f"dedup_component_{component}_ratio"].lt(1),
            np.nan,
        )
    below_cols = [f"dedup_component_{name}_below" for name in DEDUP_COMPONENTS]
    below = cases[below_cols].apply(pd.to_numeric, errors="coerce")
    cases["dedup_component_observed_n"] = below.notna().sum(axis=1)
    cases["dedup_component_below_n"] = below.sum(axis=1, min_count=1)
    cases["dedup_component_low"] = cases["dedup_component_observed_n"].ge(2) & cases["dedup_component_below_n"].ge(2)
    return cases


def metric_set_robustness(cases: pd.DataFrame) -> pd.DataFrame:
    specifications = [
        ("現行9指標", "dashboard9_lagging", "dashboard9_observed_n", 5, "9指標、観測5以上、未満60%以上"),
        ("No.13除外8指標", "directional8_lagging", "directional8_observed_n", 5, "過去代表値で単調性が確認できないNo.13を感度分析上除外"),
        ("No.14除外8指標", "without_no14_lagging", "without_no14_observed_n", 5, "No.8と分子を共有するNo.14を除外、観測5以上、未満60%以上"),
        ("No.8除外8指標", "without_no8_lagging", "without_no8_observed_n", 5, "No.14を残してNo.8を除外、観測5以上、未満60%以上"),
        ("No.13・14除外7指標", "past_monotonic_dedup_lagging", "past_monotonic_dedup_observed_n", 4, "過去単調性不明No.13と重複No.14を除外、観測4以上、未満60%以上"),
        ("構成単位3領域", "dedup_component_low", "dedup_component_observed_n", 2, "成長・生産性/付加価値・賃金の各中央値比を一票とし、2領域以上が1未満"),
        ("絶対効果3指標", "absolute_effect_lagging", "absolute_effect_observed_n", 2, "No.2・8・10の観測2以上、3分の2以上が未満"),
        ("率4指標", "rate_lagging", "rate_observed_n", 3, "No.1・7・9・11の観測3以上、60%以上が未満"),
    ]
    base = cases["dashboard9_lagging"].astype(bool)
    rows = []
    for label, field, observed_field, min_observed, definition in specifications:
        flag = cases[field].fillna(False).astype(bool)
        eligible = cases[observed_field].ge(min_observed)
        clean_eligible = eligible & cases["is_clean"]
        union = int((flag | base).sum())
        intersection = int((flag & base).sum())
        rows.append({
            "specification": label,
            "definition": definition,
            "n": int(flag.sum()),
            "pct_all": 100 * flag.mean(),
            "eligible_n": int(eligible.sum()),
            "conditional_pct": 100 * flag.sum() / eligible.sum(),
            "clean_n": int((flag & cases["is_clean"]).sum()),
            "clean_pct": 100 * (flag & cases["is_clean"]).sum() / cases["is_clean"].sum(),
            "clean_eligible_n": int(clean_eligible.sum()),
            "clean_conditional_pct": 100 * (flag & cases["is_clean"]).sum() / clean_eligible.sum(),
            "overlap_with_dashboard9_n": intersection,
            "jaccard_with_dashboard9": intersection / union if union else np.nan,
        })
    return pd.DataFrame(rows)


def add_round_percentiles(cases: pd.DataFrame) -> pd.DataFrame:
    cases = cases.copy()
    fields = [
        "sales_increase_per_subsidy",
        "payroll_increase_per_subsidy",
        "jobs_increase_per_subsidy_oku",
        "project_cost_oku",
        "subsidy_oku",
        "investment_sales_ratio_pct",
    ]
    for field in fields:
        cases[f"pct_{field}"] = cases.groupby("round")[field].rank(pct=True, method="average")
    cases["secondary_effect_top_quartile"] = cases[
        [
            "pct_sales_increase_per_subsidy",
            "pct_payroll_increase_per_subsidy",
            "pct_jobs_increase_per_subsidy_oku",
        ]
    ].max(axis=1).ge(0.75)
    return cases


def metric_validation(cases: pd.DataFrame, bench: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for sample, subset in [("all", cases), ("clean", cases[cases["is_clean"]])]:
        for round_name, group in subset.groupby("round", sort=True):
            for metric in METRICS:
                values = num(group[metric.field]).dropna()
                b = bench[(bench["round"].astype(str) == str(round_name)) & (bench["metric_key"] == metric.key)]
                applicant = float(b["applicant_value"].iloc[0]) if len(b) else np.nan
                accepted = float(b["accepted_value"].iloc[0]) if len(b) else np.nan
                med = float(values.median()) if len(values) else np.nan
                rows.append({
                    "sample": sample,
                    "round": round_name,
                    "no": metric.no,
                    "metric_key": metric.key,
                    "metric_label": metric.label,
                    "comparability": metric.comparability,
                    "unit": metric.unit,
                    "sample_cases": len(group),
                    "observed_n": len(values),
                    "coverage_pct": 100 * len(values) / len(group) if len(group) else np.nan,
                    "pdf_median": med,
                    "pdf_mean": float(values.mean()) if len(values) else np.nan,
                    "pdf_std_sample": float(values.std(ddof=1)) if len(values) > 1 else np.nan,
                    "pdf_variance_sample": float(values.var(ddof=1)) if len(values) > 1 else np.nan,
                    "official_applicant": applicant,
                    "official_accepted": accepted,
                    "median_gap_vs_accepted": med - accepted if pd.notna(med) and pd.notna(accepted) else np.nan,
                    "median_gap_pct_vs_accepted": 100 * (med / accepted - 1) if pd.notna(med) and accepted else np.nan,
                    "below_accepted_n": int((values < accepted).sum()) if pd.notna(accepted) else np.nan,
                    "below_accepted_pct": 100 * float((values < accepted).mean()) if len(values) and pd.notna(accepted) else np.nan,
                })
    return pd.DataFrame(rows)


def value_added_leave_one_round_out(cases: pd.DataFrame, bench: pd.DataFrame) -> pd.DataFrame:
    """Out-of-round check for the No.8 level-adjustment idea.

    Each held-out round uses the median official/raw-proxy ratio from the other
    three rounds.  This evaluates only aggregate median transportability, not
    company-level accuracy.
    """
    round_rows = []
    for round_name, group in cases.groupby("round", sort=True):
        raw = num(group["value_added_increase_proxy_raw_oku"]).dropna()
        official = bench[
            (bench["round"].astype(str) == str(round_name))
            & bench["metric_key"].eq("value_added_increase")
        ]
        accepted = float(official["accepted_value"].iloc[0]) if len(official) else np.nan
        raw_median = float(raw.median()) if len(raw) else np.nan
        round_rows.append({
            "round": round_name,
            "observed_n": len(raw),
            "raw_proxy_median": raw_median,
            "official_accepted_median": accepted,
            "round_level_ratio_official_to_raw": accepted / raw_median if raw_median else np.nan,
        })
    base = pd.DataFrame(round_rows)
    rows = []
    for _, held in base.iterrows():
        training = base[base["round"] != held["round"]]["round_level_ratio_official_to_raw"].dropna()
        factor = float(training.median()) if len(training) else np.nan
        predicted = held["raw_proxy_median"] * factor
        rows.append({
            **held.to_dict(),
            "training_rounds_n": len(training),
            "loro_factor": factor,
            "heldout_predicted_median": predicted,
            "heldout_signed_error": predicted - held["official_accepted_median"],
            "heldout_error_pct": 100 * (predicted / held["official_accepted_median"] - 1),
            "fixed_1_1_predicted_median": held["raw_proxy_median"] * VALUE_ADDED_LEVEL_ADJUSTMENT,
            "fixed_1_1_error_pct": 100 * (
                held["raw_proxy_median"] * VALUE_ADDED_LEVEL_ADJUSTMENT / held["official_accepted_median"] - 1
            ),
            "interpretation": "公募回集計中央値の外部較正確認。企業別精度の検証ではない。",
        })
    return pd.DataFrame(rows)


def sensitivity_table(cases: pd.DataFrame) -> pd.DataFrame:
    metric_sets = {
        "dashboard_9": METRICS,
        "directional_8_no13": DIRECTIONAL_METRICS,
        "old_7": OLD7_METRICS,
        "comparable_3": COMPARABLE_METRICS,
    }
    rows: list[dict[str, Any]] = []
    for sample, sample_mask in [("all", pd.Series(True, index=cases.index)), ("clean", cases["is_clean"])]:
        for set_name, metrics in metric_sets.items():
            below = cases[[f"below_accepted_{m.key}" for m in metrics]].apply(pd.to_numeric, errors="coerce")
            obs = below.notna().sum(axis=1)
            rate = below.sum(axis=1, min_count=1) / obs
            min_options = [3, 5, 7] if set_name != "comparable_3" else [3]
            for min_obs in min_options:
                for threshold in [0.50, 0.60, 2 / 3, 0.75, 0.80]:
                    hit = sample_mask & obs.ge(min_obs) & rate.ge(threshold)
                    denom = int(sample_mask.sum())
                    eligible = sample_mask & obs.ge(min_obs)
                    eligible_n = int(eligible.sum())
                    rows.append({
                        "sample": sample,
                        "metric_set": set_name,
                        "metric_count": len(metrics),
                        "min_observed": min_obs,
                        "below_share_threshold": threshold,
                        "lagging_n": int(hit.sum()),
                        "sample_n": denom,
                        "lagging_pct": 100 * hit.sum() / denom if denom else np.nan,
                        "eligible_n": eligible_n,
                        "eligible_pct": 100 * eligible_n / denom if denom else np.nan,
                        "conditional_lagging_pct": 100 * hit.sum() / eligible_n if eligible_n else np.nan,
                    })
    return pd.DataFrame(rows)


def old_new_transition(cases: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for sample, subset in [("all", cases), ("clean", cases[cases["is_clean"]])]:
        table = pd.crosstab(subset["old7_lagging"], subset["dashboard9_lagging"])
        for old in [False, True]:
            for new in [False, True]:
                rows.append({
                    "sample": sample,
                    "old7_lagging": old,
                    "dashboard9_lagging": new,
                    "n": int(table.loc[old, new]) if old in table.index and new in table.columns else 0,
                })
    return pd.DataFrame(rows)


def benchmark_gap_tables(bench: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    detail = bench.copy()
    detail["applicant_value"] = num(detail["applicant_value"])
    detail["accepted_value"] = num(detail["accepted_value"])
    detail["accepted_minus_applicant"] = detail["accepted_value"] - detail["applicant_value"]
    detail["accepted_vs_applicant_pct"] = 100 * (detail["accepted_value"] / detail["applicant_value"] - 1)
    summaries = []
    for key, group in detail.groupby("metric_key", sort=False):
        finite = group.dropna(subset=["applicant_value", "accepted_value"])
        summaries.append({
            "metric_key": key,
            "metric_label": group["metric_label"].iloc[0],
            "unit": group["unit"].iloc[0],
            "rounds_n": len(finite),
            "accepted_higher_rounds_n": int((finite["accepted_value"] > finite["applicant_value"]).sum()),
            "accepted_equal_rounds_n": int((finite["accepted_value"] == finite["applicant_value"]).sum()),
            "accepted_lower_rounds_n": int((finite["accepted_value"] < finite["applicant_value"]).sum()),
            "median_gap_pct": float(finite["accepted_vs_applicant_pct"].median()) if len(finite) else np.nan,
            "latest_applicant": float(finite.iloc[-1]["applicant_value"]) if len(finite) else np.nan,
            "latest_accepted": float(finite.iloc[-1]["accepted_value"]) if len(finite) else np.nan,
        })
    return detail, pd.DataFrame(summaries)


def pairwise_metric_correlations(cases: pd.DataFrame) -> pd.DataFrame:
    values = cases[[m.field for m in METRICS]].apply(pd.to_numeric, errors="coerce")
    corr = values.corr(method="spearman", min_periods=20)
    rows = []
    by_field = {m.field: m for m in METRICS}
    for i, left in enumerate(corr.columns):
        for right in corr.columns[i + 1 :]:
            n = int(values[[left, right]].dropna().shape[0])
            rows.append({
                "left_no": by_field[left].no,
                "left_metric": by_field[left].label,
                "right_no": by_field[right].no,
                "right_metric": by_field[right].label,
                "pair_n": n,
                "spearman_rho": corr.loc[left, right],
            })
    return pd.DataFrame(rows).sort_values("spearman_rho", ascending=False)


def group_effect_comparison(cases: pd.DataFrame) -> pd.DataFrame:
    fields = {
        "value_added_increase_estimated_oku": "No.8 付加価値増加額",
        "value_added_subsidy_ratio_proxy_pct": "No.14 付加価値増加/補助金",
        "sales_increase_per_subsidy": "売上増加額/補助金",
        "payroll_increase_per_subsidy": "給与総額増加/補助金",
        "jobs_increase_per_subsidy_oku": "雇用増/補助金1億円",
        "investment_sales_ratio_pct": "No.13 投資額/売上高",
        "subsidy_oku": "補助金額",
        "project_cost_oku": "事業費",
    }
    rows = []
    low = cases["dashboard9_lagging"]
    for field, label in fields.items():
        a = num(cases.loc[low, field]).dropna()
        b = num(cases.loc[~low, field]).dropna()
        rows.append({
            "field": field,
            "label": label,
            "low_n": len(a),
            "other_n": len(b),
            "low_median": float(a.median()) if len(a) else np.nan,
            "other_median": float(b.median()) if len(b) else np.nan,
            "median_ratio_low_to_other": float(a.median() / b.median()) if len(a) and len(b) and b.median() else np.nan,
        })
    return pd.DataFrame(rows)


def permutation_baseline(cases: pd.DataFrame, iterations: int = 10_000) -> dict[str, Any]:
    cols = [f"below_accepted_{m.key}" for m in METRICS]
    original = cases[cols].apply(pd.to_numeric, errors="coerce").to_numpy(float)
    observed_n = np.sum(~np.isnan(original), axis=1)
    observed_rate = np.nansum(original, axis=1) / np.where(observed_n, observed_n, np.nan)
    observed_count = int(np.sum((observed_n >= PRIMARY_MIN_OBS) & (observed_rate >= PRIMARY_BELOW_SHARE)))

    rng = np.random.default_rng(RNG_SEED)
    rounds = cases["round"].astype(str).to_numpy()
    round_values = sorted(set(rounds))
    simulated = np.empty(iterations, dtype=int)
    for it in range(iterations):
        shuffled = original.copy()
        for j in range(shuffled.shape[1]):
            for round_name in round_values:
                idx = np.where((rounds == round_name) & ~np.isnan(original[:, j]))[0]
                shuffled[idx, j] = rng.permutation(original[idx, j])
        rate = np.nansum(shuffled, axis=1) / np.where(observed_n, observed_n, np.nan)
        simulated[it] = int(np.sum((observed_n >= PRIMARY_MIN_OBS) & (rate >= PRIMARY_BELOW_SHARE)))

    def binomial_tail(n: int, threshold: float) -> float:
        start = math.ceil(n * threshold - 1e-12)
        return sum(math.comb(n, k) for k in range(start, n + 1)) / (2**n)

    obs_distribution = pd.Series(observed_n[observed_n >= PRIMARY_MIN_OBS]).value_counts().sort_index()
    simple_expected = float(sum(count * binomial_tail(int(n), PRIMARY_BELOW_SHARE) for n, count in obs_distribution.items()))
    simple_variance = float(sum(count * binomial_tail(int(n), PRIMARY_BELOW_SHARE) * (1 - binomial_tail(int(n), PRIMARY_BELOW_SHARE)) for n, count in obs_distribution.items()))
    return {
        "iterations": iterations,
        "seed": RNG_SEED,
        "observed_count": observed_count,
        "simple_coin_expected": simple_expected,
        "simple_coin_sd": math.sqrt(simple_variance),
        "permutation_expected": float(simulated.mean()),
        "permutation_sd": float(simulated.std(ddof=1)),
        "permutation_p_ge_observed": float((np.sum(simulated >= observed_count) + 1) / (iterations + 1)),
        "permutation_q025": float(np.quantile(simulated, 0.025)),
        "permutation_q975": float(np.quantile(simulated, 0.975)),
        "observed_z_vs_permutation": float((observed_count - simulated.mean()) / simulated.std(ddof=1)),
        "observed_metric_count_distribution": {str(int(k)): int(v) for k, v in obs_distribution.items()},
        "interpretation": "周辺の低位率と欠損位置を保ち、各公募回×指標の上下判定を企業間で独立に並べ替えた。実測の上振れは、採択の謎というより指標間相関・同一入力の二重計上を示す。",
    }


def text_score_comparison(cases: pd.DataFrame) -> pd.DataFrame:
    if not PROFILE_PATH.exists():
        return pd.DataFrame()
    profiles = pd.read_csv(PROFILE_PATH, low_memory=False)
    cols = [
        "case_id",
        "text_management_density_pct",
        "text_innovation_market_density_pct",
        "text_regional_spillover_density_pct",
        "text_feasibility_density_pct",
        "text_policy_relevance_density_pct",
        "text_evidence_percentile_mean",
        "qualitative_compensation_candidate",
    ]
    merged = cases[["case_id", "dashboard9_lagging"]].merge(profiles[cols], on="case_id", how="left")
    rows = []
    for field in cols[1:-1]:
        a = num(merged.loc[merged["dashboard9_lagging"], field]).dropna()
        b = num(merged.loc[~merged["dashboard9_lagging"], field]).dropna()
        rows.append({
            "field": field,
            "low_n": len(a),
            "other_n": len(b),
            "low_mean": float(a.mean()) if len(a) else np.nan,
            "other_mean": float(b.mean()) if len(b) else np.nan,
            "difference_low_minus_other": float(a.mean() - b.mean()) if len(a) and len(b) else np.nan,
        })
    for flag in [False, True]:
        pass
    return pd.DataFrame(rows)


def focused_qualitative_review(cases: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Combine the existing pair review with 24 new current-definition cases.

    This is a purposive, accepted-only, unblinded review.  The scores document
    recurring features in published summaries; they are not estimated causal
    effects and must not be read as pass/fail weights.
    """
    factor_labels = {
        "demand": "需要根拠の具体性",
        "constraint": "能力制約の明確さ",
        "transformation": "事業・工程の構造転換",
        "regional": "地域・供給網への波及",
        "execution": "実行確度",
        "strategic": "政策・戦略分野との整合",
    }
    case_keys = cases[
        [
            "case_id", "round", "company", "industry", "is_clean",
            "dashboard9_lagging", "dashboard9_observed_n",
            "dashboard9_below_accepted_n", "dashboard9_below_accepted_share",
            "directional8_lagging", "directional_component_win_n",
            "directional_explanation_level", "pdf_url",
        ]
    ].copy()

    manual = pd.read_csv(MANUAL24_PATH, low_memory=False)
    manual = manual.merge(
        case_keys.drop(columns=["pdf_url"]), on=["round", "company"], how="left", validate="one_to_one"
    )
    assert len(manual) == 24
    assert manual["case_id"].notna().all()
    assert manual["dashboard9_lagging"].all()
    assert manual["is_clean"].all()
    manual["review_origin"] = "新規目視レビュー（現行9指標・24社）"
    manual["selection_note"] = "現行9指標低位、品質除外なし、既存40ペアに未収録の35社から公募回・業種を分散して24社を選択"

    pair = pd.read_csv(PAIR_COMPANY_PATH, low_memory=False)
    pair = pair[pair["pair_role"].eq("公開定量スコア低位")].copy()
    pair = pair.merge(
        case_keys.drop(columns=["industry", "pdf_url"]),
        on=["round", "company"], how="left", validate="one_to_one",
    )
    pair = pair[pair["dashboard9_lagging"].fillna(False)].copy()
    assert len(pair) == 20
    pair["review_origin"] = "既存40ペアの低位側のうち現行9指標低位（20社）"
    pair["selection_note"] = "旧7指標で作成した40ペアの低位側から、今回の現行9指標定義にも該当する20社を再抽出"

    keep = [
        "review_origin", "selection_note", "case_id", "round", "company", "industry",
        "is_clean", "dashboard9_observed_n", "dashboard9_below_accepted_n",
        "dashboard9_below_accepted_share", "directional8_lagging",
        "directional_component_win_n", "directional_explanation_level",
        *factor_labels.keys(), "evidence", "coding_confidence", "pdf_url",
    ]
    review = pd.concat([pair[keep], manual[keep]], ignore_index=True)
    review["core_strong_n"] = review[["demand", "constraint", "transformation", "regional"]].ge(2).sum(axis=1)
    review["all_factor_strong_n"] = review[list(factor_labels)].ge(2).sum(axis=1)
    review = review.sort_values(["review_origin", "round", "company"]).reset_index(drop=True)

    summary_rows: list[dict[str, Any]] = []
    source_groups = [("合計", review)] + [(name, group) for name, group in review.groupby("review_origin", sort=False)]
    for source, subset in source_groups:
        for factor, label in factor_labels.items():
            scores = num(subset[factor]).dropna()
            summary_rows.append({
                "review_origin": source,
                "factor": factor,
                "factor_label": label,
                "reviewed_n": len(scores),
                "strong_n": int(scores.ge(2).sum()),
                "strong_pct": 100 * scores.ge(2).mean(),
                "score3_n": int(scores.eq(3).sum()),
                "score3_pct": 100 * scores.eq(3).mean(),
                "mean_score": float(scores.mean()),
            })
    factor_summary = pd.DataFrame(summary_rows)

    selection_summary = pd.DataFrame([
        {
            "review_origin": source,
            "reviewed_n": len(subset),
            "clean_n": int(subset["is_clean"].sum()),
            "three_of_four_core_strong_n": int(subset["core_strong_n"].ge(3).sum()),
            "three_of_four_core_strong_pct": 100 * subset["core_strong_n"].ge(3).mean(),
            "all_six_strong_n": int(subset["all_factor_strong_n"].eq(6).sum()),
            "warning": "目的抽出・採択企業のみ・単独かつ非盲検の目視評価。非採択企業との差や採択確率は推定できない。",
        }
        for source, subset in source_groups
    ])
    return review, factor_summary, selection_summary


def qualitative_pair_comparison() -> pd.DataFrame:
    frame = pd.read_csv(PAIR_FACTOR_PATH, low_memory=False).copy()
    frame["bonferroni_p_6"] = np.minimum(1.0, num(frame["paired_sign_test_p"]) * len(frame))
    frame["interpretation"] = np.where(
        frame["bonferroni_p_6"].lt(0.05),
        "6要素補正後も差あり",
        "6要素補正後に低位側固有の差は確認できない",
    )
    return frame


def fully_below_case_studies(all_below: pd.DataFrame) -> pd.DataFrame:
    notes = {
        "株式会社ホテルニューアワジ": (
            "地域観光の面的転換と実行基盤",
            "インバウンド向け二都市・二社共同の宿泊拠点。高単価・連泊化、自治体・生産者との連携、認証・実証実績を一体で提示。",
        ),
        "アシザワ・ファインテック株式会社": (
            "特殊需要に対する明確な能力制約",
            "電池・電子材料向け微粉砕で、防爆・クリーン・ドライ環境が不足。試験・受託加工の取りこぼしを24時間自動化の専用工場で解く。",
        ),
        "株式会社八立製作所": (
            "実名顧客と代替困難な国内供給網",
            "主要顧客からの増産要請と、コマツ大阪工場向けブラケットの高い供給シェアを背景に、国内供給能力の増強を提示。",
        ),
        "株式会社シュゼット・ホールディングス": (
            "不可避の移転と供給継続を成長投資へ転換",
            "賃貸期限、排水能力、老朽・アスベストという制約を、二工場再編・高級需要・インバウンド・レジリエンス向上へ接続。",
        ),
        "株式会社タカラ倉庫運輸サービス": (
            "物流制約の共同化による地域インフラ効果",
            "分散拠点を統合し、共同配送・内陸デポ・保税機能で物流2030年問題に対応。輸送・保管コスト削減も数値化。",
        ),
    }
    frame = all_below.copy()
    frame["case_hypothesis"] = frame["company"].map(lambda x: notes[x][0])
    frame["qualitative_evidence"] = frame["company"].map(lambda x: notes[x][1])
    frame["interpretation_limit"] = "公開採択概要からの仮説。審査得点・非公開申請書・非採択比較がないため、採択理由の確定ではない。"
    cols = [
        "case_id", "round", "company", "industry", "is_clean",
        "directional8_observed_n", "directional8_below_accepted_n",
        "directional8_below_accepted_share", "case_hypothesis",
        "qualitative_evidence", "pdf_url", "interpretation_limit",
    ]
    return frame[cols].sort_values(["round", "company"])


def theil_sen_next(values: Iterable[float]) -> float:
    y = np.asarray(list(values), dtype=float)
    x = np.arange(1, len(y) + 1, dtype=float)
    slopes = [(y[j] - y[i]) / (x[j] - x[i]) for i in range(len(y)) for j in range(i + 1, len(y))]
    slope = median(slopes)
    intercept = median((y - slope * x).tolist())
    return float(intercept + slope * (len(y) + 1))


def round6_numeric_framework(bench: pd.DataFrame) -> pd.DataFrame:
    selected = {
        "company_sales_cagr": (25.0, "成長率だけでなく絶対増加額と両立"),
        "company_sales_increase": (100.0, "全社にとっての成長インパクト"),
        "project_sales_increase": (90.0, "五回連続で採択者中央値が申請者中央値を上回る"),
        "value_added_increase": (35.0, "絶対効果の中核"),
        "employee_pay_rate": (7.5, "未達返還リスクを考慮し実行可能性を優先"),
        "employee_pay_total_increase": (5.0, "賃上げ率だけでなく地域に落ちる給与総額"),
        "value_added_subsidy_ratio": (250.0, "国費1円当たり効果"),
    }
    rows = []
    for key, (stretch, role) in selected.items():
        group = bench[bench["metric_key"] == key].sort_values("round")
        accepted = num(group["accepted_value"]).dropna().tolist()
        latest = group.iloc[-1]
        rows.append({
            "metric_key": key,
            "metric_label": latest["metric_label"],
            "unit": latest["unit"],
            "round5_applicant": latest["applicant_value"],
            "round5_accepted": latest["accepted_value"],
            "round6_theil_sen_reference": theil_sen_next(accepted) if len(accepted) >= 3 else np.nan,
            "stretch_scenario": stretch,
            "role": role,
            "warning": "公式足切りではない。同業・同規模の需要証拠とボトルネック解消ロジックで裏付け、未達リスクを反映する。",
        })
    return pd.DataFrame(rows)


def official_change_table() -> pd.DataFrame:
    rows = [
        ("足下の全社賃上げ", "補助事業期間中の全社賃上げを新たに評価。最低でも物価上昇率超。", "最新決算→基準年度を年次で積み上げ、原資と一人当たり付加価値に接続", OFFICIAL_URLS["round6_overview"]),
        ("補助金の必要性", "現預金等から国費支援の追加性を独立審査。", "運転資金、別投資、借入・増資の限界、補助なしの縮小・後ろ倒しを数値化", OFFICIAL_URLS["round6_guidelines"]),
        ("実現可能性・モニタリング", "実現可能性を厳格化し、事業期間中・事業化報告期間の数値をモニタリング。", "需要、能力、仕様、認証、用地、人材、調達、販路、資金、工程を同じ単位で接続", OFFICIAL_URLS["round6_guidelines"]),
        ("金融機関・ファンド", "確認書に加え出資・融資表明書を新設し、後者は大幅加点。", "可能なら様式4-2を早期交渉。未実行は取消リスクがあるため実行可能額に限定", OFFICIAL_URLS["round6_guidelines"]),
        ("新規・強化加点", "中小→中堅移行、AX、ファミリーガバナンス等。", "適用可否と必要様式を最初に確定。後付けではなく本体ロジックと整合", OFFICIAL_URLS["round6_overview"]),
        ("補助率1/4の許容", "1/3水準に満たなくても1/4で追加採択する可能性。", "追加自己負担と賃上げ履行が可能な場合にのみ様式2で許容", OFFICIAL_URLS["round6_guidelines"]),
    ]
    return pd.DataFrame(rows, columns=["change", "official_meaning", "application_action", "source_url"])


def source_manifest() -> pd.DataFrame:
    rows = [
        ("local", str(CASES_PATH.relative_to(PROJECT)), "381社の公開PDF抽出・品質フラグ"),
        ("local", str(BENCH_PATH.relative_to(PROJECT)), "1～5次の申請者・採択者公式代表値"),
        ("local", str(PAIR_COMPANY_PATH.relative_to(PROJECT)), "40ペア80社の目視符号化"),
        ("official", OFFICIAL_URLS["round6_home"], "6次の最新スケジュール、正式版公開の確認先"),
        ("official", OFFICIAL_URLS["round6_overview"], "6次事前公開概要、5次からの変更点"),
        ("official", OFFICIAL_URLS["round6_guidelines"], "6次事前公開公募要領、審査基準・提出書類"),
        ("official", OFFICIAL_URLS["round6_forms"], "6次事前公開様式、スライド要求・Excel計算式"),
        ("official", OFFICIAL_URLS["round5_medians"], "5次申請者198件・採択者77件の中央値"),
        ("official", OFFICIAL_URLS["round5_results"], "5次審査・採択結果"),
    ]
    return pd.DataFrame(rows, columns=["source_type", "location", "use"])


def write_csv(frame: pd.DataFrame, name: str) -> None:
    frame.to_csv(HERE / name, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_MINIMAL)


def main() -> None:
    cases = pd.read_csv(CASES_PATH, low_memory=False)
    bench = pd.read_csv(BENCH_PATH, low_memory=False)
    cases = add_dashboard_metrics(cases)
    cases = add_benchmark_flags(cases, bench)

    classification(cases, METRICS, "dashboard9", PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    classification(cases, DIRECTIONAL_METRICS, "directional8", PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    classification(cases, OLD7_METRICS, "old7", 3, PRIMARY_BELOW_SHARE)
    classification(cases, COMPARABLE_METRICS, "comparable3", 3, 2 / 3)
    classification(cases, WITHOUT_NO14_METRICS, "without_no14", 5, PRIMARY_BELOW_SHARE)
    classification(cases, WITHOUT_NO8_METRICS, "without_no8", 5, PRIMARY_BELOW_SHARE)
    classification(cases, PAST_MONOTONIC_DEDUP_METRICS, "past_monotonic_dedup", 4, PRIMARY_BELOW_SHARE)
    classification(cases, ABSOLUTE_EFFECT_METRICS, "absolute_effect", 2, 2 / 3)
    classification(cases, RATE_METRICS, "rate", 3, PRIMARY_BELOW_SHARE)
    cases = add_component_wins(cases)
    cases = add_strict_comparison_sensitivity(cases)
    cases = add_deduplicated_component_screen(cases)
    cases = add_round_percentiles(cases)

    dashboard_low = cases["dashboard9_lagging"]
    directional_low = cases["directional8_lagging"]
    cases["dashboard9_applicant_half_or_more"] = cases["dashboard9_at_or_above_applicant_share"].ge(0.50)
    cases["dashboard9_applicant_majority"] = cases["dashboard9_at_or_above_applicant_share"].gt(0.50)
    cases["dashboard9_any_applicant_win"] = cases["dashboard9_at_or_above_applicant_n"].ge(1)
    cases["directional_all_observed_below_accepted"] = directional_low & cases["directional8_at_or_above_accepted_n"].eq(0)

    validation = metric_validation(cases, bench)
    value_added_loro = value_added_leave_one_round_out(cases, bench)
    sensitivity = sensitivity_table(cases)
    robustness = metric_set_robustness(cases)
    transitions = old_new_transition(cases)
    gap_detail, gap_summary = benchmark_gap_tables(bench)
    correlations = pairwise_metric_correlations(cases)
    effects = group_effect_comparison(cases)
    text_comparison = text_score_comparison(cases)
    pair_comparison = qualitative_pair_comparison()
    permutation = permutation_baseline(cases)
    numeric_framework = round6_numeric_framework(bench)
    changes = official_change_table()

    explanation = (
        cases.loc[directional_low]
        .groupby("directional_explanation_level", dropna=False)
        .size()
        .rename("n")
        .reset_index()
    )
    explanation["cohort_n"] = int(directional_low.sum())
    explanation["share_pct"] = 100 * explanation["n"] / explanation["cohort_n"]

    round_summary = []
    for round_name, group in cases.groupby("round", sort=True):
        round_summary.append({
            "round": round_name,
            "public_pdf_n": len(group),
            "clean_n": int(group["is_clean"].sum()),
            "dashboard9_low_n": int(group["dashboard9_lagging"].sum()),
            "dashboard9_low_pct": 100 * group["dashboard9_lagging"].mean(),
            "directional8_low_n": int(group["directional8_lagging"].sum()),
            "directional8_low_pct": 100 * group["directional8_lagging"].mean(),
            "clean_dashboard9_low_n": int((group["is_clean"] & group["dashboard9_lagging"]).sum()),
            "clean_directional8_low_n": int((group["is_clean"] & group["directional8_lagging"]).sum()),
        })
    round_summary_df = pd.DataFrame(round_summary)

    output_cols = [
        "case_id", "round", "company", "industry", "pdf_url", "is_clean",
        "analysis_exclusion_recommended", "analysis_exclusion_reasons",
        "project_cost_oku", "subsidy_oku", "dashboard9_observed_n",
        "dashboard9_below_accepted_n", "dashboard9_below_accepted_share",
        "dashboard9_at_or_above_accepted_n", "dashboard9_at_or_above_applicant_n",
        "dashboard9_at_or_above_applicant_share", "dashboard9_strict_above_applicant_n",
        "dashboard9_strict_above_applicant_share", "dashboard9_lagging",
        "directional8_observed_n", "directional8_below_accepted_n",
        "directional8_below_accepted_share", "directional8_at_or_above_accepted_n",
        "directional8_lagging", "directional_component_win_n",
        "strict_component_win_n", "dedup_component_low",
        "without_no14_lagging", "without_no8_lagging", "past_monotonic_dedup_observed_n",
        "past_monotonic_dedup_at_or_above_accepted_n", "past_monotonic_dedup_lagging",
        "absolute_effect_lagging", "rate_lagging",
        "directional_explanation_level", "directional_all_observed_below_accepted",
        "component_growth_win", "component_productivity_value_win", "component_wage_win",
        "secondary_effect_top_quartile", "sales_increase_per_subsidy",
        "payroll_increase_per_subsidy", "jobs_increase_per_subsidy_oku",
    ]
    for metric in METRICS:
        output_cols.extend([
            metric.field,
            f"benchmark_applicant_{metric.key}",
            f"benchmark_accepted_{metric.key}",
            f"below_accepted_{metric.key}",
        ])
    case_output = cases[output_cols].sort_values(
        ["directional8_lagging", "directional8_below_accepted_share", "dashboard9_observed_n"],
        ascending=[False, False, False],
    )

    all_below = case_output[case_output["directional_all_observed_below_accepted"]].copy()
    dedup_all_below = case_output[
        case_output["past_monotonic_dedup_observed_n"].ge(4)
        & case_output["past_monotonic_dedup_at_or_above_accepted_n"].eq(0)
    ].copy()
    qualitative_review, qualitative_factors, qualitative_selection = focused_qualitative_review(cases)
    all_below_studies = fully_below_case_studies(all_below)

    write_csv(case_output, "case_level_reassessment.csv")
    write_csv(all_below, "all_directional_metrics_below_cases.csv")
    write_csv(dedup_all_below, "all_deduplicated_metrics_below_cases.csv")
    write_csv(all_below_studies, "fully_below_case_studies.csv")
    write_csv(qualitative_review, "focused_qualitative_review_44.csv")
    write_csv(qualitative_factors, "focused_qualitative_factor_summary.csv")
    write_csv(qualitative_selection, "focused_qualitative_selection_summary.csv")
    write_csv(validation, "metric_reconstruction_validation.csv")
    write_csv(value_added_loro, "value_added_leave_one_round_out.csv")
    write_csv(sensitivity, "lagging_definition_sensitivity.csv")
    write_csv(robustness, "metric_set_robustness.csv")
    write_csv(transitions, "old7_to_current9_transition.csv")
    write_csv(round_summary_df, "round_summary.csv")
    write_csv(explanation, "directional_explanation_levels.csv")
    write_csv(gap_detail, "official_applicant_accepted_gaps_by_round.csv")
    write_csv(gap_summary, "official_applicant_accepted_gap_summary.csv")
    write_csv(correlations, "metric_spearman_correlations.csv")
    write_csv(effects, "low_group_effect_comparison.csv")
    write_csv(text_comparison, "automatic_text_score_comparison.csv")
    write_csv(pair_comparison, "qualitative_pair_comparison.csv")
    write_csv(numeric_framework, "round6_numeric_framework.csv")
    write_csv(changes, "round6_official_changes.csv")
    write_csv(source_manifest(), "source_manifest.csv")

    summary = {
        "scope": {
            "cases": len(cases),
            "clean_cases": int(cases["is_clean"].sum()),
            "rounds": sorted(cases["round"].astype(str).unique().tolist()),
            "official_warning": "6次は事前公開版。公募開始時の正式版で更新必須。",
        },
        "dashboard_compatible": {
            "definition": "9指標中5指標以上観測、採択者中央値未満が60%以上",
            "n": int(dashboard_low.sum()),
            "pct": round(100 * dashboard_low.mean(), 1),
            "eligible_n": int(cases["dashboard9_observed_n"].ge(PRIMARY_MIN_OBS).sum()),
            "conditional_pct": round(100 * dashboard_low.sum() / cases["dashboard9_observed_n"].ge(PRIMARY_MIN_OBS).sum(), 1),
            "clean_n": int((dashboard_low & cases["is_clean"]).sum()),
            "clean_eligible_n": int((cases["is_clean"] & cases["dashboard9_observed_n"].ge(PRIMARY_MIN_OBS)).sum()),
            "any_applicant_win_n": int((dashboard_low & cases["dashboard9_any_applicant_win"]).sum()),
            "applicant_half_or_more_n": int((dashboard_low & cases["dashboard9_applicant_half_or_more"]).sum()),
            "applicant_majority_n": int((dashboard_low & cases["dashboard9_applicant_majority"]).sum()),
            "strict_above_applicant_majority_n": int((dashboard_low & cases["dashboard9_strict_applicant_majority"]).sum()),
        },
        "directional_primary": {
            "definition": "No.13は公式上正方向評価だが、過去代表値で単調性が確認できないため感度分析上除外。残る8指標中5指標以上観測、未満60%以上",
            "n": int(directional_low.sum()),
            "pct": round(100 * directional_low.mean(), 1),
            "eligible_n": int(cases["directional8_observed_n"].ge(PRIMARY_MIN_OBS).sum()),
            "conditional_pct": round(100 * directional_low.sum() / cases["directional8_observed_n"].ge(PRIMARY_MIN_OBS).sum(), 1),
            "clean_n": int((directional_low & cases["is_clean"]).sum()),
            "clean_eligible_n": int((cases["is_clean"] & cases["directional8_observed_n"].ge(PRIMARY_MIN_OBS)).sum()),
            "two_or_more_component_wins_n": int((directional_low & cases["directional_component_win_n"].ge(2)).sum()),
            "one_component_win_n": int((directional_low & cases["directional_component_win_n"].eq(1)).sum()),
            "zero_component_win_n": int((directional_low & cases["directional_component_win_n"].eq(0)).sum()),
            "strict_two_or_more_component_n": int((directional_low & cases["strict_component_win_n"].ge(2)).sum()),
            "strict_one_component_n": int((directional_low & cases["strict_component_win_n"].eq(1)).sum()),
            "strict_zero_component_n": int((directional_low & cases["strict_component_win_n"].eq(0)).sum()),
            "all_observed_below_companies": all_below["company"].tolist(),
        },
        "robustness": {
            "metric_set_counts": {
                row["specification"]: int(row["n"])
                for _, row in robustness.iterrows()
            },
            "deduplicated_all_below_n": len(dedup_all_below),
            "deduplicated_all_below_companies": dedup_all_below["company"].tolist(),
            "warning": "仕様により件数・企業集合が変わるため、5社を確定的な例外群と解釈しない。",
        },
        "old_vs_new": {
            "old7_n": int(cases["old7_lagging"].sum()),
            "current9_n": int(dashboard_low.sum()),
            "both_n": int((cases["old7_lagging"] & dashboard_low).sum()),
            "old_only_n": int((cases["old7_lagging"] & ~dashboard_low).sum()),
            "new_only_n": int((~cases["old7_lagging"] & dashboard_low).sum()),
        },
        "permutation_baseline": permutation,
        "focused_qualitative_review": {
            "reviewed_n": len(qualitative_review),
            "new_review_n": int(qualitative_review["review_origin"].str.startswith("新規").sum()),
            "existing_pair_current_low_n": int(qualitative_review["review_origin"].str.startswith("既存").sum()),
            "factor_strong_counts": {
                row["factor"]: int(row["strong_n"])
                for _, row in qualitative_factors[qualitative_factors["review_origin"].eq("合計")].iterrows()
            },
            "warning": "目的抽出・採択企業のみ・単独かつ非盲検の目視評価であり、採択確率や因果効果を推定しない。",
        },
        "limitations": [
            "不採択企業個票と項目別審査点が非公開のため、採択確率・因果効果・配点は推定できない。",
            "公開PDFは交付決定企業の要約資料で、審査時申請書・公式採択者母集団と一致しない。",
            "No.8・14は集計中央値の水準再現であり、企業別公式値との照合ではない。",
            "9指標は独立でなく、No.8/14は同一分子、No.2/8/10は企業規模を共有する。",
            "定性目視コードは採択企業の目的抽出・単独非盲検評価で、採否識別力を示さない。",
        ],
    }
    (HERE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    assert len(cases) == 381
    assert int(dashboard_low.sum()) == 118
    assert int(directional_low.sum()) == 113
    assert int((directional_low & cases["directional_component_win_n"].ge(2)).sum()) == 42
    assert int((directional_low & cases["directional_component_win_n"].eq(1)).sum()) == 66
    assert int((directional_low & cases["directional_component_win_n"].eq(0)).sum()) == 5
    assert int((directional_low & cases["strict_component_win_n"].ge(2)).sum()) == 39
    assert int((directional_low & cases["strict_component_win_n"].eq(1)).sum()) == 65
    assert int((directional_low & cases["strict_component_win_n"].eq(0)).sum()) == 9
    assert len(all_below) == 5
    assert len(dedup_all_below) == 7
    assert int(cases["dashboard9_observed_n"].ge(5).sum()) == 373
    assert int(cases["directional8_observed_n"].ge(5).sum()) == 371
    assert len(qualitative_review) == 44
    assert int(qualitative_review["core_strong_n"].ge(3).sum()) == 42
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
