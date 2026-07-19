"""申請者中央値を多くの指標で下回る採択企業を再検証する。

分析対象は公開PDFを収録した採択・交付企業だけである。不採択企業の
企業別データや審査点は含まれないため、本分析は採択確率や採択理由を
推定しない。目的は、同回申請者中央値を下回る指標が多い企業群の定義、
頑健性、企業内集積、規模との関係を記述することである。
"""

from __future__ import annotations

import json
import hashlib
import math
import re
from statistics import NormalDist
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ROUND6 = HERE.parent / "round6_reassessment"
CASE_LEVEL_PATH = ROUND6 / "case_level_reassessment.csv"
CASES_PATH = PROJECT / "data" / "processed" / "cases.csv"
BENCHMARKS_PATH = PROJECT / "data" / "reference" / "official_round_benchmarks.csv"
APPLICATION_ROUND_MAP_PATH = HERE / "application_round_crosswalk_1_2.csv"
FINANCIAL_CONFIRMATION_PATH = HERE.parent / "adoption_drivers" / "external_financial_confirmations.csv"

RNG_SEED = 20260719
N_PERMUTATIONS = 20_000
PRIMARY_MIN_OBS = 5
PRIMARY_BELOW_SHARE = 0.60


@dataclass(frozen=True)
class Metric:
    no: int
    key: str
    label: str
    field: str
    source_class: str
    domain: str
    direction: str = "higher"


METRICS = [
    Metric(1, "company_sales_cagr", "全社年平均売上高成長率", "sales_cagr_pct", "near_direct", "growth"),
    Metric(2, "company_sales_increase", "全社売上高増加額", "sales_increase_oku_yen_normalized", "near_direct", "growth"),
    Metric(7, "labor_cagr", "補助事業年平均労働生産性の伸び", "labor_annual_rate_pct", "direct_comparable", "productivity_value"),
    Metric(8, "value_added_increase", "付加価値増加額（簡易補正推計）", "value_added_increase_estimated_oku", "rough_proxy", "productivity_value"),
    Metric(9, "employee_pay_rate", "年平均従業員1人当たり給与の伸び", "employee_pay_annual_rate_pct", "direct_comparable", "wage"),
    Metric(10, "employee_pay_total_increase", "従業員給与支給総額の増加額（推計）", "employee_pay_total_increase_estimated_oku", "proxy", "wage"),
    Metric(11, "officer_pay_rate", "年平均役員報酬の伸び", "officer_pay_annual_rate_pct", "direct_comparable", "wage"),
    Metric(13, "investment_sales_ratio", "全社売上高に対する投資額割合（近似）", "investment_sales_ratio_pct", "proxy_context", "investment_context", "context"),
    Metric(14, "value_added_subsidy_ratio", "補助金額に対する付加価値増加額割合（推計）", "value_added_subsidy_ratio_proxy_pct", "rough_proxy", "productivity_value"),
]

METRIC_BY_NO = {m.no: m for m in METRICS}
DOMAINS = {
    "growth": [1, 2],
    "productivity_value": [7, 8, 14],
    "wage": [9, 10, 11],
}

METRIC_SETS = {
    "current9": {"nos": [1, 2, 7, 8, 9, 10, 11, 13, 14], "min_obs": 5, "share": 0.60,
                 "definition": "現行9指標、観測5以上、申請者中央値未満60%以上"},
    "directional8_no13": {"nos": [1, 2, 7, 8, 9, 10, 11, 14], "min_obs": 5, "share": 0.60,
                           "definition": "方向が一意でないNo.13を除外"},
    "without_no8": {"nos": [1, 2, 7, 9, 10, 11, 13, 14], "min_obs": 5, "share": 0.60,
                     "definition": "簡易補正推計No.8を除外"},
    "without_no14": {"nos": [1, 2, 7, 8, 9, 10, 11, 13], "min_obs": 5, "share": 0.60,
                      "definition": "粗近似比率No.14を除外"},
    "old7_no8_no14": {"nos": [1, 2, 7, 9, 10, 11, 13], "min_obs": 5, "share": 0.60,
                       "definition": "No.8・14追加前の7指標"},
    "no8_no13_no14": {"nos": [1, 2, 7, 9, 10, 11], "min_obs": 5, "share": 0.60,
                       "definition": "No.8・13・14を除外"},
    "direct_or_near_direct5": {"nos": [1, 2, 7, 9, 11], "min_obs": 4, "share": 0.60,
                               "definition": "PDF直書き又は基礎値からほぼ直接求める5指標、観測4以上"},
    "direct_comparable3": {"nos": [7, 9, 11], "min_obs": 3, "share": 2 / 3,
                            "definition": "公式定義との比較可能性が相対的に高い率3指標、3指標中2以上"},
}


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def boolean(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.lower().isin({"true", "1", "yes"})


def mann_whitney_approx_p(a: pd.Series, b: pd.Series) -> float:
    """Tie-corrected normal approximation for a two-sided Mann–Whitney test."""
    x = numeric(a).dropna().to_numpy(dtype=float)
    y = numeric(b).dropna().to_numpy(dtype=float)
    n1, n2 = len(x), len(y)
    if n1 == 0 or n2 == 0:
        return np.nan
    combined = np.concatenate([x, y])
    ranks = pd.Series(combined).rank(method="average").to_numpy()
    u1 = float(ranks[:n1].sum() - n1 * (n1 + 1) / 2)
    n = n1 + n2
    tie_counts = pd.Series(combined).value_counts().to_numpy(dtype=float)
    tie_term = float(np.sum(tie_counts ** 3 - tie_counts))
    variance = n1 * n2 / 12 * ((n + 1) - tie_term / (n * (n - 1))) if n > 1 else 0
    if variance <= 0:
        return 1.0
    z = (u1 - n1 * n2 / 2) / math.sqrt(variance)
    return float(2 * (1 - NormalDist().cdf(abs(z))))


def sign_flip_p(differences: pd.Series, seed: int, n_perm: int = 20_000) -> float:
    """Two-sided paired randomization p-value using the absolute mean difference."""
    diff = numeric(differences).dropna().to_numpy(dtype=float)
    if len(diff) == 0:
        return np.nan
    observed = abs(float(np.mean(diff)))
    if observed == 0 and np.all(diff == 0):
        return 1.0
    rng = np.random.default_rng(seed)
    exceed = 0
    for _ in range(n_perm):
        signs = rng.choice(np.array([-1.0, 1.0]), size=len(diff), replace=True)
        exceed += abs(float(np.mean(diff * signs))) >= observed
    return (exceed + 1) / (n_perm + 1)


def fisher_exact_two_sided(table: np.ndarray) -> tuple[float, float]:
    """Two-sided Fisher exact test for a 2×2 table without SciPy."""
    a, b = map(int, table[0])
    c, d = map(int, table[1])
    odds = (a * d / (b * c)) if b and c else (math.inf if a and d else np.nan)
    row1, row2 = a + b, c + d
    col1 = a + c
    total = row1 + row2

    def probability(x: int) -> float:
        return math.comb(col1, x) * math.comb(total - col1, row1 - x) / math.comb(total, row1)

    low = max(0, row1 - (total - col1))
    high = min(row1, col1)
    observed_p = probability(a)
    p = sum(probability(x) for x in range(low, high + 1) if probability(x) <= observed_p + 1e-15)
    return float(odds), float(min(1.0, p))


def write_csv(frame: pd.DataFrame, name: str) -> None:
    frame.to_csv(HERE / name, index=False, encoding="utf-8-sig")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_data() -> pd.DataFrame:
    case_level = pd.read_csv(CASE_LEVEL_PATH).rename(columns={"round": "round_original"})
    original = pd.read_csv(CASES_PATH, low_memory=False)
    extra_cols = [
        "case_id", "sales_baseline_oku_yen", "sales_target_oku_yen",
        "employees_base_value", "employees_target_value", "subsidy_rate_pct",
        "has_ambiguous_rate_any", "representative_entity_ambiguous",
        "cost_text_numeric_mismatch", "has_unit_ambiguity_any",
        "has_period_ambiguity_any", "has_mixed_entity_metrics",
        "has_arithmetic_mismatch_any", "quality_flag_count",
        "critical_quality_flag_count",
        "has_consortium", "has_multiple_investments", "project_location_count",
        "head_office_project_same_prefecture", "head_office_region",
        "project_region_class", "project_regions",
    ]
    frame = case_level.merge(original[extra_cols], on="case_id", how="left", validate="one_to_one")

    # cases.csv の1・2次 round は公開ファイルの命名バッチを表しており、
    # 公式の申請公募回と181件中60件で一致しない。公式採択一覧の企業名を照合し、
    # 旧社名2件だけは法人番号で同一性を確認して
    # 照合したクロスウォークを適用し、比較基準もここで付け直す。
    round_map = pd.read_csv(APPLICATION_ROUND_MAP_PATH, encoding="utf-8-sig")
    required_map_columns = {"case_id", "application_round"}
    if not required_map_columns.issubset(round_map.columns):
        raise AssertionError(f"回次クロスウォークの列不足: {required_map_columns - set(round_map.columns)}")
    if len(round_map) != 181 or round_map["case_id"].nunique() != 181:
        raise AssertionError("1・2次の回次クロスウォークは181件一意でなければならない")
    frame = frame.merge(
        round_map[["case_id", "application_round"]],
        on="case_id", how="left", validate="one_to_one",
    )
    frame["round"] = frame["application_round"].fillna(frame["round_original"])
    expected_round_counts = {"1次": 106, "2次": 75, "3次": 107, "4次": 93}
    if frame["round"].value_counts().to_dict() != expected_round_counts:
        raise AssertionError(f"補正後回次件数が想定外: {frame['round'].value_counts().to_dict()}")

    benchmarks = pd.read_csv(BENCHMARKS_PATH)
    benchmark_lookup = benchmarks.set_index(["round", "metric_key"])
    for metric in METRICS:
        frame[f"benchmark_applicant_{metric.key}"] = [
            benchmark_lookup.loc[(round_label, metric.key), "applicant_value"]
            for round_label in frame["round"]
        ]
        frame[f"benchmark_accepted_{metric.key}"] = [
            benchmark_lookup.loc[(round_label, metric.key), "accepted_value"]
            for round_label in frame["round"]
        ]
    frame["is_clean"] = boolean(frame["is_clean"])
    frame["baseline_sales_oku"] = numeric(frame["sales_baseline_oku_yen"])
    frame["employees_base"] = numeric(frame["employees_base_value"])
    frame["employees_target"] = numeric(frame["employees_target_value"])
    frame["jobs_increase"] = frame["employees_target"] - frame["employees_base"]
    frame["subsidy_share_project_cost_pct"] = 100 * numeric(frame["subsidy_oku"]) / numeric(frame["project_cost_oku"])
    frame["subsidy_to_baseline_sales_pct"] = 100 * numeric(frame["subsidy_oku"]) / frame["baseline_sales_oku"]
    return frame


def nullable_boolean(series: pd.Series) -> pd.Series:
    lowered = series.astype(str).str.strip().str.lower()
    result = pd.Series(np.nan, index=series.index, dtype=float)
    result.loc[lowered.isin({"true", "1", "yes"})] = 1.0
    result.loc[lowered.isin({"false", "0", "no"})] = 0.0
    return result


def add_comparison_flags(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    for metric in METRICS:
        value = numeric(frame[metric.field])
        applicant = numeric(frame[f"benchmark_applicant_{metric.key}"])
        accepted = numeric(frame[f"benchmark_accepted_{metric.key}"])
        observed = value.notna() & applicant.notna()
        frame[f"applicant_observed_no{metric.no}"] = observed
        frame[f"below_applicant_no{metric.no}"] = np.where(observed, value < applicant, np.nan)
        frame[f"at_or_above_applicant_no{metric.no}"] = np.where(observed, value >= applicant, np.nan)
        frame[f"applicant_ratio_no{metric.no}"] = np.where(observed & applicant.ne(0), value / applicant, np.nan)
        accepted_observed = value.notna() & accepted.notna()
        frame[f"below_accepted_no{metric.no}"] = np.where(accepted_observed, value < accepted, np.nan)
    return frame


def round_correction_impact(frame: pd.DataFrame) -> pd.DataFrame:
    """Compare the original stored-round classification with the audited round."""

    original_round_frame = frame.copy()
    benchmark_lookup = pd.read_csv(BENCHMARKS_PATH).set_index(["round", "metric_key"])
    for metric in METRICS:
        original_round_frame[f"benchmark_applicant_{metric.key}"] = [
            benchmark_lookup.loc[(round_label, metric.key), "applicant_value"]
            for round_label in original_round_frame["round_original"]
        ]
        original_round_frame[f"benchmark_accepted_{metric.key}"] = [
            benchmark_lookup.loc[(round_label, metric.key), "accepted_value"]
            for round_label in original_round_frame["round_original"]
        ]
    original_round_frame = add_comparison_flags(original_round_frame)
    old = classify(original_round_frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    new = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    result = frame[["case_id", "company", "round_original", "round"]].copy()
    result = result.rename(columns={"round": "application_round"})
    result["round_changed"] = result["round_original"] != result["application_round"]
    result["old_core29"] = old["flag"].to_numpy()
    result["new_core28"] = new["flag"].to_numpy()
    result["membership_change"] = np.select(
        [result["old_core29"] & ~result["new_core28"], ~result["old_core29"] & result["new_core28"]],
        ["removed_after_round_correction", "added_after_round_correction"],
        default="unchanged",
    )
    return result


def classify(frame: pd.DataFrame, nos: Iterable[int], min_obs: int, share: float) -> pd.DataFrame:
    cols = [f"below_applicant_no{no}" for no in nos]
    flags = frame[cols].apply(pd.to_numeric, errors="coerce")
    observed_n = flags.notna().sum(axis=1)
    below_n = flags.sum(axis=1, min_count=1)
    below_share = below_n / observed_n
    return pd.DataFrame({
        "observed_n": observed_n,
        "below_n": below_n,
        "below_share": below_share,
        "flag": observed_n.ge(min_obs) & below_share.ge(share),
        "eligible": observed_n.ge(min_obs),
    }, index=frame.index)


def boundary_sensitivity(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Test whether the strict median boundary is driving the core-29 classification.

    ``relative_gap`` is positive when the company value is below the same-round
    applicant median.  A margin of 0.05 therefore requires the value to be at
    least 5% below the benchmark, rather than merely below a rounded median.
    """
    primary = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    primary_flag = primary["flag"]
    metric_cells: list[pd.DataFrame] = []
    for metric in METRICS:
        value = numeric(frame[metric.field])
        benchmark = numeric(frame[f"benchmark_applicant_{metric.key}"])
        observed = value.notna() & benchmark.notna()
        denominator = benchmark.abs()
        relative_gap = pd.Series(np.nan, index=frame.index, dtype=float)
        nonzero = observed & denominator.gt(1e-12)
        relative_gap.loc[nonzero] = (benchmark.loc[nonzero] - value.loc[nonzero]) / denominator.loc[nonzero]
        zero = observed & ~denominator.gt(1e-12)
        relative_gap.loc[zero] = np.where(value.loc[zero] < benchmark.loc[zero], np.inf, np.where(value.loc[zero] > benchmark.loc[zero], -np.inf, 0.0))
        metric_cells.append(pd.DataFrame({
            "case_id": frame["case_id"],
            "round": frame["round"],
            "company": frame["company"],
            "metric_no": metric.no,
            "metric_label": metric.label,
            "company_value": value,
            "applicant_median": benchmark,
            "relative_gap_below_benchmark": relative_gap,
            "absolute_relative_gap_lt_1pct": observed & relative_gap.abs().round(12).lt(0.01),
            "absolute_relative_gap_lt_5pct": observed & relative_gap.abs().round(12).lt(0.05),
            "absolute_relative_gap_lt_10pct": observed & relative_gap.abs().round(12).lt(0.10),
            "primary_core28": primary_flag,
        }).loc[observed])
    cells = pd.concat(metric_cells, ignore_index=True)

    rows = []
    for margin in [0.00, 0.01, 0.05, 0.10]:
        flags = pd.DataFrame(index=frame.index)
        for metric in METRICS:
            value = numeric(frame[metric.field])
            benchmark = numeric(frame[f"benchmark_applicant_{metric.key}"])
            observed = value.notna() & benchmark.notna()
            cutoff = benchmark - benchmark.abs() * margin
            flags[f"no{metric.no}"] = np.where(observed, value < cutoff, np.nan)
        observed_n = flags.notna().sum(axis=1)
        below_n = flags.sum(axis=1, min_count=1)
        selected = observed_n.ge(PRIMARY_MIN_OBS) & (below_n / observed_n).ge(PRIMARY_BELOW_SHARE)
        union_n = int((selected | primary_flag).sum())
        overlap_n = int((selected & primary_flag).sum())
        rows.append({
            "minimum_relative_gap_below_benchmark": margin,
            "definition": (
                "company_value < applicant_median"
                if margin == 0 else
                f"company_value < applicant_median - abs(applicant_median)*{margin:g}"
            ),
            "eligible_n": int(observed_n.ge(PRIMARY_MIN_OBS).sum()),
            "flag_n": int(selected.sum()),
            "overlap_with_primary_n": overlap_n,
            "jaccard_with_primary": overlap_n / union_n if union_n else np.nan,
            "primary_core_observed_cell_n": int(cells.loc[cells["primary_core28"], "case_id"].count()),
            "primary_core_abs_gap_lt_5pct_cell_n": int(cells.loc[cells["primary_core28"], "absolute_relative_gap_lt_5pct"].sum()),
        })
    return pd.DataFrame(rows), cells


def build_metric_set_sensitivity(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    base = classify(frame, **{k: METRIC_SETS["current9"][k] for k in ("nos", "min_obs", "share")})
    membership = frame[["case_id", "round", "company", "is_clean"]].copy()
    rows = []
    for name, spec in METRIC_SETS.items():
        result = classify(frame, spec["nos"], spec["min_obs"], spec["share"])
        membership[f"{name}_observed_n"] = result["observed_n"]
        membership[f"{name}_below_n"] = result["below_n"]
        membership[f"{name}_below_share"] = result["below_share"]
        membership[f"{name}_flag"] = result["flag"]
        union = int((result["flag"] | base["flag"]).sum())
        intersection = int((result["flag"] & base["flag"]).sum())
        for scope, scope_mask in [("all", pd.Series(True, index=frame.index)), ("clean", frame["is_clean"])]:
            eligible = result["eligible"] & scope_mask
            flag = result["flag"] & scope_mask
            rows.append({
                "metric_set": name,
                "scope": scope,
                "metric_nos": ",".join(map(str, spec["nos"])),
                "metric_count": len(spec["nos"]),
                "min_observed": spec["min_obs"],
                "below_share_threshold": spec["share"],
                "definition": spec["definition"],
                "eligible_n": int(eligible.sum()),
                "flag_n": int(flag.sum()),
                "flag_pct_of_eligible": 100 * flag.sum() / eligible.sum() if eligible.sum() else np.nan,
                "overlap_with_current9_n": intersection if scope == "all" else int((flag & base["flag"]).sum()),
                "current9_only_n": int((base["flag"] & scope_mask & ~result["flag"]).sum()),
                "alternative_only_n": int((result["flag"] & scope_mask & ~base["flag"]).sum()),
                "jaccard_with_current9": intersection / union if scope == "all" and union else (
                    int((flag & base["flag"]).sum()) / int(((flag | (base["flag"] & scope_mask))).sum())
                    if scope == "clean" and int((flag | (base["flag"] & scope_mask)).sum()) else np.nan
                ),
            })
    return pd.DataFrame(rows), membership


def build_core_company_table(frame: pd.DataFrame, membership: pd.DataFrame) -> pd.DataFrame:
    base = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    core = frame.loc[base["flag"]].copy()
    core["current9_observed_n_reproduced"] = base.loc[base["flag"], "observed_n"]
    core["current9_below_applicant_n"] = base.loc[base["flag"], "below_n"]
    core["current9_below_applicant_share"] = base.loc[base["flag"], "below_share"]

    for domain, nos in DOMAINS.items():
        cols = [f"below_applicant_no{no}" for no in nos]
        flags = core[cols].apply(pd.to_numeric, errors="coerce")
        core[f"{domain}_observed_n"] = flags.notna().sum(axis=1)
        core[f"{domain}_below_n"] = flags.sum(axis=1, min_count=1)
        core[f"{domain}_below_share"] = core[f"{domain}_below_n"] / core[f"{domain}_observed_n"]
        core[f"{domain}_all_observed_below"] = (
            core[f"{domain}_observed_n"].gt(0)
            & core[f"{domain}_below_n"].eq(core[f"{domain}_observed_n"])
        )

    identity_cols = [
        "case_id", "round", "company", "industry", "pdf_url", "is_clean",
        "analysis_exclusion_recommended", "analysis_exclusion_reasons",
        "current9_observed_n_reproduced", "current9_below_applicant_n",
        "current9_below_applicant_share", "project_cost_oku", "subsidy_oku",
        "baseline_sales_oku", "employees_base", "employees_target", "jobs_increase",
        "subsidy_share_project_cost_pct", "subsidy_to_baseline_sales_pct",
        "sales_increase_per_subsidy", "payroll_increase_per_subsidy",
        "jobs_increase_per_subsidy_oku",
    ]
    domain_cols = []
    for domain in DOMAINS:
        domain_cols += [
            f"{domain}_observed_n", f"{domain}_below_n", f"{domain}_below_share",
            f"{domain}_all_observed_below",
        ]
    metric_cols = []
    for metric in METRICS:
        metric_cols += [
            metric.field,
            f"benchmark_applicant_{metric.key}",
            f"applicant_ratio_no{metric.no}",
            f"below_applicant_no{metric.no}",
            f"benchmark_accepted_{metric.key}",
            f"below_accepted_no{metric.no}",
        ]
    return core[identity_cols + domain_cols + metric_cols].sort_values(["round", "company"])


def round_metric_marginals(frame: pd.DataFrame, scope: str, nos: list[int]) -> pd.DataFrame:
    data = frame if scope == "all" else frame.loc[frame["is_clean"]]
    rows = []
    for round_label, group in data.groupby("round", sort=False):
        for no in nos:
            flags = numeric(group[f"below_applicant_no{no}"])
            observed = flags.notna()
            rows.append({
                "scope": scope,
                "round": round_label,
                "metric_no": no,
                "metric_label": METRIC_BY_NO[no].label,
                "observed_n": int(observed.sum()),
                "below_applicant_n": int(flags.sum(skipna=True)),
                "below_applicant_probability": flags.mean(skipna=True),
            })
    return pd.DataFrame(rows)


def permutation_statistics(flags: np.ndarray, metric_nos: list[int], min_obs: int) -> dict[str, float]:
    observed_n = np.sum(~np.isnan(flags), axis=1)
    below_n = np.nansum(flags, axis=1)
    eligible = observed_n >= min_obs
    share = np.divide(below_n, observed_n, out=np.full_like(below_n, np.nan, dtype=float), where=observed_n > 0)
    result = {
        "count_60pct": int(np.sum(eligible & (share >= 0.60))),
        "count_strict_majority": int(np.sum(eligible & (share > 0.50))),
        "count_75pct": int(np.sum(eligible & (share >= 0.75))),
        "count_all_observed_below": int(np.sum(eligible & (below_n == observed_n))),
        "variance_below_share": float(np.nanvar(share[eligible], ddof=1)),
    }
    all_domain_below = np.zeros(flags.shape[0], dtype=int)
    no_to_col = {no: i for i, no in enumerate(metric_nos)}
    for nos in DOMAINS.values():
        idx = [no_to_col[no] for no in nos if no in no_to_col]
        if not idx:
            continue
        subset = flags[:, idx]
        domain_obs = np.sum(~np.isnan(subset), axis=1)
        domain_below = np.nansum(subset, axis=1)
        all_domain_below += ((domain_obs > 0) & (domain_below == domain_obs)).astype(int)
    result["count_all_three_domains_below"] = int(np.sum(eligible & (all_domain_below == 3)))
    return result


def run_permutation(frame: pd.DataFrame, spec_name: str, scope: str, n_perm: int, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    spec = METRIC_SETS[spec_name]
    data = frame.copy() if scope == "all" else frame.loc[frame["is_clean"]].copy()
    metric_nos = spec["nos"]
    cols = [f"below_applicant_no{no}" for no in metric_nos]
    original = data[cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    observed_stats = permutation_statistics(original, metric_nos, spec["min_obs"])
    rng = np.random.default_rng(seed)

    cells: list[tuple[np.ndarray, int, np.ndarray]] = []
    rounds = data["round"].astype(str).to_numpy()
    for col_idx in range(len(metric_nos)):
        for round_label in pd.unique(rounds):
            idx = np.flatnonzero((rounds == round_label) & ~np.isnan(original[:, col_idx]))
            cells.append((idx, col_idx, original[idx, col_idx].copy()))

    simulations = []
    for iteration in range(n_perm):
        simulated = np.full_like(original, np.nan, dtype=float)
        for idx, col_idx, values in cells:
            simulated[idx, col_idx] = rng.permutation(values)
        stats = permutation_statistics(simulated, metric_nos, spec["min_obs"])
        stats.update({"iteration": iteration + 1, "metric_set": spec_name, "scope": scope})
        simulations.append(stats)
    distribution = pd.DataFrame(simulations)

    summary_rows = []
    for statistic, observed in observed_stats.items():
        values = numeric(distribution[statistic]).to_numpy()
        sd = float(np.std(values, ddof=1))
        summary_rows.append({
            "metric_set": spec_name,
            "scope": scope,
            "permutations": n_perm,
            "seed": seed,
            "statistic": statistic,
            "observed": observed,
            "permutation_mean": float(np.mean(values)),
            "permutation_sd": sd,
            "permutation_q025": float(np.quantile(values, 0.025)),
            "permutation_median": float(np.quantile(values, 0.50)),
            "permutation_q975": float(np.quantile(values, 0.975)),
            "z_score": (observed - float(np.mean(values))) / sd if sd > 0 else np.nan,
            "upper_tail_p": (1 + int(np.sum(values >= observed))) / (n_perm + 1),
            "lower_tail_p": (1 + int(np.sum(values <= observed))) / (n_perm + 1),
        })
    return pd.DataFrame(summary_rows), distribution


def add_scale_variables(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    for field in ["baseline_sales_oku", "project_cost_oku", "subsidy_oku", "employees_base"]:
        values = numeric(frame[field]).where(numeric(frame[field]) >= 0)
        frame[f"log1p_{field}"] = np.log1p(values)
    return frame


def greedy_scale_matching(frame: pd.DataFrame, core_flag: pd.Series) -> pd.DataFrame:
    eligible = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)["eligible"]
    data = add_scale_variables(frame.loc[eligible].copy())
    data["core_flag"] = core_flag.loc[data.index].to_numpy()
    scale_fields = ["baseline_sales_oku", "project_cost_oku", "subsidy_oku", "employees_base"]
    log_fields = [f"log1p_{field}" for field in scale_fields]
    pairs = []

    for round_label, round_data in data.groupby("round", sort=False):
        treated = round_data.loc[round_data["core_flag"]].copy()
        controls = round_data.loc[~round_data["core_flag"]].copy()
        if treated.empty or controls.empty:
            continue

        z = round_data[log_fields].copy()
        for field in log_fields:
            mean = z[field].mean(skipna=True)
            sd = z[field].std(skipna=True, ddof=1)
            z[field] = (z[field] - mean) / (sd if pd.notna(sd) and sd > 0 else 1.0)

        cost = np.full((len(treated), len(controls)), 1_000.0)
        shared_matrix = np.zeros_like(cost, dtype=int)
        industry_matrix = np.zeros_like(cost, dtype=bool)
        for i, (ti, trow) in enumerate(treated.iterrows()):
            for j, (ci, crow) in enumerate(controls.iterrows()):
                tz = z.loc[ti, log_fields].to_numpy(dtype=float)
                cz = z.loc[ci, log_fields].to_numpy(dtype=float)
                shared = np.isfinite(tz) & np.isfinite(cz)
                shared_n = int(shared.sum())
                industry_exact = str(trow["industry"]) == str(crow["industry"])
                if shared_n >= 2:
                    scale_distance = float(np.sqrt(np.mean((tz[shared] - cz[shared]) ** 2)))
                    missing_penalty = 0.35 * (len(log_fields) - shared_n)
                    # 規模近接を主目的とし、業種一致は二次的な加点に留める。
                    industry_penalty = 0.0 if industry_exact else 0.35
                    cost[i, j] = scale_distance + missing_penalty + industry_penalty
                shared_matrix[i, j] = shared_n
                industry_matrix[i, j] = industry_exact

        # SciPyに依存せず再現できるよう、全候補を距離順に並べ、1対1で
        # 貪欲割当する。処置側は28件、各回に十分な対照があるため、
        # 産業ペナルティと規模距離を明示した監査可能な方法を優先する。
        candidates = sorted(
            ((float(cost[i, j]), i, j) for i in range(len(treated)) for j in range(len(controls))),
            key=lambda item: (item[0], item[1], item[2]),
        )
        assigned_treated: set[int] = set()
        assigned_controls: set[int] = set()
        assignments = []
        for _, i, j in candidates:
            if i in assigned_treated or j in assigned_controls:
                continue
            assigned_treated.add(i)
            assigned_controls.add(j)
            assignments.append((i, j))
            if len(assignments) == len(treated):
                break
        for i, j in assignments:
            ti = treated.index[i]
            ci = controls.index[j]
            trow = treated.loc[ti]
            crow = controls.loc[ci]
            row = {
                "round": round_label,
                "treated_case_id": trow["case_id"],
                "treated_company": trow["company"],
                "treated_industry": trow["industry"],
                "control_case_id": crow["case_id"],
                "control_company": crow["company"],
                "control_industry": crow["industry"],
                "industry_exact_match": bool(industry_matrix[i, j]),
                "shared_scale_variable_n": int(shared_matrix[i, j]),
                "match_distance": float(cost[i, j]),
            }
            for field in scale_fields:
                row[f"treated_{field}"] = trow[field]
                row[f"control_{field}"] = crow[field]
            pairs.append(row)
    return pd.DataFrame(pairs).sort_values(["round", "treated_company"])


def standardized_mean_difference(a: pd.Series, b: pd.Series, log1p: bool = False) -> float:
    x = numeric(a).dropna().to_numpy(dtype=float)
    y = numeric(b).dropna().to_numpy(dtype=float)
    if log1p:
        x = np.log1p(x[x >= 0])
        y = np.log1p(y[y >= 0])
    if len(x) < 2 or len(y) < 2:
        return np.nan
    pooled = math.sqrt((np.var(x, ddof=1) + np.var(y, ddof=1)) / 2)
    return (np.mean(x) - np.mean(y)) / pooled if pooled > 0 else np.nan


def comparison_summary(frame: pd.DataFrame, core_flag: pd.Series, pairs: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    current = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    eligible = current["eligible"]
    core = frame.loc[eligible & core_flag]
    other = frame.loc[eligible & ~core_flag]
    pair_t = pairs.merge(frame.add_prefix("treated_frame_").rename(columns={"treated_frame_case_id": "treated_case_id"}), on="treated_case_id", how="left")
    pair_t = pair_t.merge(frame.add_prefix("control_frame_").rename(columns={"control_frame_case_id": "control_case_id"}), on="control_case_id", how="left")

    variables = [
        ("baseline_sales_oku", "基準売上高（億円）", True, True),
        ("project_cost_oku", "事業費（億円）", True, True),
        ("subsidy_oku", "補助金額（億円）", True, True),
        ("employees_base", "基準従業員数", True, True),
        ("jobs_increase", "従業員増加数", False, False),
        ("jobs_increase_per_subsidy_oku", "補助金1億円当たり従業員増加数", False, False),
        ("subsidy_share_project_cost_pct", "事業費に対する補助金割合", False, False),
        ("subsidy_to_baseline_sales_pct", "基準売上高に対する補助金割合", False, False),
        ("investment_sales_ratio_pct", "事業費／基準売上高", False, False),
        ("sales_increase_per_subsidy", "補助金1億円当たり売上増加額", False, False),
        ("payroll_increase_per_subsidy", "補助金1億円当たり給与総額増加額", False, False),
    ]
    raw_rows = []
    matched_rows = []
    rank_rows = []

    for field, label, scale_variable, use_log in variables:
        a = numeric(core[field]).dropna()
        b = numeric(other[field]).dropna()
        mw_p = mann_whitney_approx_p(a, b)
        raw_rows.append({
            "variable": field,
            "label": label,
            "is_scale_variable": scale_variable,
            "core_n": len(a),
            "other_n": len(b),
            "core_median": a.median() if len(a) else np.nan,
            "other_median": b.median() if len(b) else np.nan,
            "core_mean": a.mean() if len(a) else np.nan,
            "other_mean": b.mean() if len(b) else np.nan,
            "core_to_other_median_ratio": a.median() / b.median() if len(a) and len(b) and b.median() != 0 else np.nan,
            "standardized_mean_difference": standardized_mean_difference(a, b, log1p=use_log),
            "mann_whitney_p": mw_p,
        })

        tcol = f"treated_frame_{field}"
        ccol = f"control_frame_{field}"
        complete = pair_t[[tcol, ccol]].apply(pd.to_numeric, errors="coerce").dropna()
        if len(complete):
            diff = complete[tcol] - complete[ccol]
            ratios = complete[tcol] / complete[ccol].replace(0, np.nan)
            paired_p = sign_flip_p(diff, RNG_SEED + len(matched_rows))
        else:
            diff = pd.Series(dtype=float)
            ratios = pd.Series(dtype=float)
            paired_p = np.nan
        matched_rows.append({
            "variable": field,
            "label": label,
            "is_scale_variable": scale_variable,
            "complete_pair_n": len(complete),
            "treated_median": complete[tcol].median() if len(complete) else np.nan,
            "control_median": complete[ccol].median() if len(complete) else np.nan,
            "paired_difference_median": diff.median() if len(diff) else np.nan,
            "paired_ratio_median": ratios.median() if ratios.notna().any() else np.nan,
            "paired_sign_flip_p": paired_p,
            "matched_standardized_mean_difference": standardized_mean_difference(
                complete[tcol], complete[ccol], log1p=use_log
            ) if len(complete) else np.nan,
        })

        if scale_variable:
            ranks = pd.Series(np.nan, index=frame.index, dtype=float)
            for _, group in frame.loc[eligible].groupby("round", sort=False):
                ranks.loc[group.index] = numeric(group[field]).rank(pct=True, method="average")
            core_ranks = ranks.loc[eligible & core_flag].dropna()
            rank_p = sign_flip_p(core_ranks - 0.5, RNG_SEED + 100 + len(rank_rows))
            rank_rows.append({
                "variable": field,
                "label": label,
                "core_n": len(core_ranks),
                "core_round_percentile_median": core_ranks.median() if len(core_ranks) else np.nan,
                "core_round_percentile_mean": core_ranks.mean() if len(core_ranks) else np.nan,
                "core_below_round_median_n": int((core_ranks < 0.5).sum()),
                "sign_flip_vs_0_5_p": rank_p,
            })
    return pd.DataFrame(raw_rows), pd.DataFrame(matched_rows), pd.DataFrame(rank_rows)


def quality_comparison(frame: pd.DataFrame, core_flag: pd.Series) -> pd.DataFrame:
    eligible = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)["eligible"]
    variables = {
        "not_clean": ~frame["is_clean"],
        "has_ambiguous_rate_any": boolean(frame["has_ambiguous_rate_any"]),
        "representative_entity_ambiguous": boolean(frame["representative_entity_ambiguous"]),
        "cost_text_numeric_mismatch": boolean(frame["cost_text_numeric_mismatch"]),
        "has_unit_ambiguity_any": boolean(frame["has_unit_ambiguity_any"]),
        "has_period_ambiguity_any": boolean(frame["has_period_ambiguity_any"]),
        "has_mixed_entity_metrics": boolean(frame["has_mixed_entity_metrics"]),
        "has_arithmetic_mismatch_any": boolean(frame["has_arithmetic_mismatch_any"]),
    }
    rows = []
    for name, flag in variables.items():
        core = eligible & core_flag
        other = eligible & ~core_flag
        table = np.array([
            [int((core & flag).sum()), int((core & ~flag).sum())],
            [int((other & flag).sum()), int((other & ~flag).sum())],
        ])
        odds, p = fisher_exact_two_sided(table)
        rows.append({
            "quality_indicator": name,
            "core_flagged_n": table[0, 0],
            "core_total_n": int(core.sum()),
            "core_flagged_pct": 100 * table[0, 0] / core.sum(),
            "other_flagged_n": table[1, 0],
            "other_total_n": int(other.sum()),
            "other_flagged_pct": 100 * table[1, 0] / other.sum(),
            "fisher_odds_ratio": odds,
            "fisher_two_sided_p": p,
        })
    result = pd.DataFrame(rows)
    result["bh_q_within_quality_indicators"] = benjamini_hochberg(result["fisher_two_sided_p"])
    return result


def benjamini_hochberg(p_values: pd.Series) -> pd.Series:
    values = numeric(p_values)
    valid = values.dropna().sort_values()
    result = pd.Series(np.nan, index=values.index, dtype=float)
    if valid.empty:
        return result
    m = len(valid)
    adjusted = valid.to_numpy() * m / np.arange(1, m + 1)
    adjusted = np.minimum.accumulate(adjusted[::-1])[::-1]
    result.loc[valid.index] = np.minimum(adjusted, 1.0)
    return result


def stratified_label_permutations(
    rounds: pd.Series,
    observed_core: np.ndarray,
    n_perm: int,
    seed: int,
) -> np.ndarray:
    """公募回別の中核群件数を固定したラベル置換行列を返す。"""
    rng = np.random.default_rng(seed)
    round_values = rounds.astype(str).to_numpy()
    labels = np.zeros((n_perm, len(round_values)), dtype=np.uint8)
    cells = []
    for round_label in pd.unique(round_values):
        idx = np.flatnonzero(round_values == round_label)
        treated_n = int(observed_core[idx].sum())
        cells.append((idx, treated_n))
    for iteration in range(n_perm):
        for idx, treated_n in cells:
            if treated_n:
                labels[iteration, rng.choice(idx, size=treated_n, replace=False)] = 1
    return labels


def round_standardize(values: pd.Series, rounds: pd.Series) -> pd.Series:
    result = pd.Series(np.nan, index=values.index, dtype=float)
    numeric_values = numeric(values)
    for _, idx in rounds.groupby(rounds.astype(str), sort=False).groups.items():
        part = numeric_values.loc[idx]
        mean = part.mean(skipna=True)
        sd = part.std(skipna=True, ddof=1)
        if pd.notna(sd) and sd > 0:
            result.loc[idx] = (part - mean) / sd
        else:
            result.loc[idx] = np.where(part.notna(), 0.0, np.nan)
    return result


def structure_geography_comparison(
    frame: pd.DataFrame,
    core_flag: pd.Series,
    n_perm: int = 20_000,
) -> pd.DataFrame:
    """構造・地理・規模特徴を、公募回を固定したラベル置換で比較する。"""
    primary = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    data = frame.loc[primary["eligible"]].copy()
    core = core_flag.loc[data.index].astype(bool).to_numpy()
    permutation_labels = stratified_label_permutations(
        data["round"], core, n_perm, RNG_SEED + 900
    )

    feature_specs: list[tuple[str, str, str, pd.Series, bool]] = [
        ("structure", "has_consortium", "共同申請・コンソーシアム", nullable_boolean(data["has_consortium"]), False),
        ("structure", "has_multiple_investments", "複数投資案件", nullable_boolean(data["has_multiple_investments"]), False),
        ("geography", "project_location_count", "事業実施県・場所数", numeric(data["project_location_count"]), True),
        ("geography", "head_office_project_same_prefecture", "本社と事業実施場所が同一都道府県", nullable_boolean(data["head_office_project_same_prefecture"]), False),
        ("scale", "baseline_sales_oku", "基準売上高（億円）", numeric(data["baseline_sales_oku"]), True),
        ("scale", "employees_base", "基準従業員数", numeric(data["employees_base"]), True),
        ("scale", "project_cost_oku", "事業費（億円）", numeric(data["project_cost_oku"]), True),
        ("scale", "investment_sales_ratio_pct", "事業費／基準売上高（%）", numeric(data["investment_sales_ratio_pct"]), True),
        ("scale", "subsidy_rate_pct", "補助率（%）", numeric(data["subsidy_rate_pct"]), False),
    ]

    for field, label in [
        ("industry", "業種"),
        ("head_office_region", "本社地方"),
        ("project_region_class", "事業実施地方区分"),
    ]:
        categories = data[field].fillna("欠損").astype(str).replace("", "欠損")
        for category in sorted(categories.unique()):
            feature_specs.append((
                "categorical",
                f"{field}={category}",
                f"{label}：{category}",
                categories.eq(category).astype(float),
                False,
            ))

    rows = []
    for feature_index, (family, feature, label, raw_values, use_log) in enumerate(feature_specs):
        values = numeric(raw_values)
        if use_log:
            values = np.log1p(values.where(values >= 0))
        adjusted = round_standardize(values, data["round"])
        observed = adjusted.notna().to_numpy(dtype=float)
        filled = adjusted.fillna(0).to_numpy(dtype=float)
        treated_obs = core & observed.astype(bool)
        control_obs = (~core) & observed.astype(bool)
        observed_diff = (
            float(np.mean(filled[treated_obs])) - float(np.mean(filled[control_obs]))
            if treated_obs.any() and control_obs.any() else np.nan
        )

        treated_n_sim = permutation_labels @ observed
        treated_sum_sim = permutation_labels @ filled
        total_n = float(observed.sum())
        total_sum = float(filled.sum())
        control_n_sim = total_n - treated_n_sim
        valid = (treated_n_sim > 0) & (control_n_sim > 0)
        simulated_diff = np.full(n_perm, np.nan, dtype=float)
        simulated_diff[valid] = (
            treated_sum_sim[valid] / treated_n_sim[valid]
            - (total_sum - treated_sum_sim[valid]) / control_n_sim[valid]
        )
        finite_sim = simulated_diff[np.isfinite(simulated_diff)]
        p = (
            (1 + int(np.sum(np.abs(finite_sim) >= abs(observed_diff)))) / (1 + len(finite_sim))
            if np.isfinite(observed_diff) and len(finite_sim) else np.nan
        )

        treated_raw = numeric(raw_values.loc[data.index[core]]).dropna()
        control_raw = numeric(raw_values.loc[data.index[~core]]).dropna()
        rows.append({
            "feature_family": family,
            "feature": feature,
            "label": label,
            "transformation_for_adjustment": "log1p_then_round_zscore" if use_log else "round_zscore",
            "core_n": len(treated_raw),
            "other_n": len(control_raw),
            "core_mean_or_share": treated_raw.mean() if len(treated_raw) else np.nan,
            "other_mean_or_share": control_raw.mean() if len(control_raw) else np.nan,
            "core_median": treated_raw.median() if len(treated_raw) else np.nan,
            "other_median": control_raw.median() if len(control_raw) else np.nan,
            "round_adjusted_mean_difference": observed_diff,
            "round_adjusted_standardized_difference": standardized_mean_difference(
                adjusted.loc[data.index[core]], adjusted.loc[data.index[~core]], log1p=False
            ),
            "round_stratified_permutation_p": p,
            "permutations": n_perm,
            "seed": RNG_SEED + 900,
        })
    result = pd.DataFrame(rows)
    result["bh_q_within_all_features"] = benjamini_hochberg(result["round_stratified_permutation_p"])
    return result


def normalized_company_key(round_value: object, company: object) -> str:
    normalized = re.sub(r"[\s\u3000]+", "", str(company)).replace("㈱", "株式会社")
    return f"{str(round_value)}|{normalized}"


def financial_confirmation_comparison(
    frame: pd.DataFrame,
    core_flag: pd.Series,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    external = pd.read_csv(FINANCIAL_CONFIRMATION_PATH)
    external["merge_key"] = [
        normalized_company_key(r, c) for r, c in zip(external["round"], external["company"])
    ]
    external["has_financial_confirmation"] = boolean(external["has_financial_confirmation"])
    frame_keys = frame[["case_id", "round", "company"]].copy()
    frame_keys["merge_key"] = [
        normalized_company_key(r, c) for r, c in zip(frame_keys["round"], frame_keys["company"])
    ]
    linked = frame_keys.merge(
        external[["merge_key", "has_financial_confirmation", "financial_institution", "official_list_url"]],
        on="merge_key", how="left", validate="one_to_one",
    )
    linked["core28"] = linked["case_id"].isin(set(frame.loc[core_flag, "case_id"]))
    linked_observed = linked.loc[linked["has_financial_confirmation"].notna()].copy()

    core_external_keys = set(linked_observed.loc[linked_observed["core28"], "merge_key"])
    external_is_core = external["merge_key"].isin(core_external_keys)
    core_values = external.loc[external_is_core, "has_financial_confirmation"]
    other_values = external.loc[~external_is_core, "has_financial_confirmation"]
    # 比較対象は中核28件が存在する3・4次。外部表の5次は除く。
    relevant_rounds = set(linked_observed.loc[linked_observed["core28"], "round"].astype(str))
    external_relevant = external["round"].astype(str).isin(relevant_rounds)
    core_values = external.loc[external_relevant & external_is_core, "has_financial_confirmation"]
    other_values = external.loc[external_relevant & ~external_is_core, "has_financial_confirmation"]
    table = np.array([
        [int(core_values.sum()), int((~core_values).sum())],
        [int(other_values.sum()), int((~other_values).sum())],
    ])
    odds, p = fisher_exact_two_sided(table)
    rows = [
        {
            "sample": "core28_round3_4_external_linked",
            "total_n": len(core_values),
            "confirmation_true_n": int(core_values.sum()),
            "confirmation_true_pct": 100 * core_values.mean(),
            "comparison_group": "other_round3_4_external_records",
            "comparison_total_n": len(other_values),
            "comparison_true_n": int(other_values.sum()),
            "comparison_true_pct": 100 * other_values.mean(),
            "fisher_odds_ratio": odds,
            "fisher_two_sided_p": p,
        },
        {
            "sample": "all_round3_4_external_records",
            "total_n": int(external_relevant.sum()),
            "confirmation_true_n": int(external.loc[external_relevant, "has_financial_confirmation"].sum()),
            "confirmation_true_pct": 100 * external.loc[external_relevant, "has_financial_confirmation"].mean(),
            "comparison_group": "none",
            "comparison_total_n": np.nan,
            "comparison_true_n": np.nan,
            "comparison_true_pct": np.nan,
            "fisher_odds_ratio": np.nan,
            "fisher_two_sided_p": np.nan,
        },
    ]
    return pd.DataFrame(rows), linked_observed.sort_values(["round", "company"])


def build_hypothesis_evidence(
    frame: pd.DataFrame,
    sensitivity: pd.DataFrame,
    permutation_summary: pd.DataFrame,
    rank_summary: pd.DataFrame,
    quality_summary: pd.DataFrame,
    structure_geography: pd.DataFrame,
    financial_summary: pd.DataFrame,
) -> tuple[pd.DataFrame, dict]:
    base = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    core = base["flag"]
    core_flags = frame.loc[core, [f"below_applicant_no{m.no}" for m in METRICS]].apply(pd.to_numeric, errors="coerce")
    wins = core_flags.eq(0).sum(axis=1)
    no13_all = sensitivity[(sensitivity["metric_set"] == "directional8_no13") & (sensitivity["scope"] == "all")].iloc[0]
    old7_all = sensitivity[(sensitivity["metric_set"] == "old7_no8_no14") & (sensitivity["scope"] == "all")].iloc[0]
    clean_quality = quality_summary.loc[quality_summary["quality_indicator"] == "not_clean"].iloc[0]
    period_quality = quality_summary.loc[
        quality_summary["quality_indicator"] == "has_period_ambiguity_any"
    ].iloc[0]
    perm_primary = permutation_summary[
        (permutation_summary["metric_set"] == "current9")
        & (permutation_summary["scope"] == "all")
        & (permutation_summary["statistic"] == "count_60pct")
    ].iloc[0]
    financial = financial_summary.loc[
        financial_summary["sample"] == "core28_round3_4_external_linked"
    ].iloc[0]
    consortium = structure_geography.loc[
        structure_geography["feature"] == "has_consortium"
    ].iloc[0]

    scale_evidence = []
    for _, row in rank_summary.iterrows():
        scale_evidence.append({
            "variable": row["variable"],
            "median_within_round_percentile": row["core_round_percentile_median"],
            "p_value": row["sign_flip_vs_0_5_p"],
        })

    rows = [
        {
            "hypothesis": "H1_measurement_error",
            "evidence_direction": "measurement_affects_membership_but_not_full_explanation",
            "result": (
                f"品質注意率は中核群{clean_quality['core_flagged_pct']:.1f}%、その他{clean_quality['other_flagged_pct']:.1f}%"
                f"（Fisher p={clean_quality['fisher_two_sided_p']:.4g}）。ただし期間曖昧性は"
                f"{period_quality['core_flagged_pct']:.1f}%対{period_quality['other_flagged_pct']:.1f}%"
                f"（Fisher p={period_quality['fisher_two_sided_p']:.4g}、BH q={period_quality['bh_q_within_quality_indicators']:.4g}）。"
                f"No.8・14除外でも{int(old7_all['flag_n'])}件だが、"
                f"補正後28件との共通は{int(old7_all['overlap_with_current9_n'])}件、Jaccard={old7_all['jaccard_with_current9']:.3f}。"
            ),
            "interpretation": "期間定義の曖昧性は中核群で多く、H1を部分的に支持する。測定・近似方法は個社の分類を動かすが、品質フラグ除外後も比率はほぼ同じで、現象全体を測定誤差だけでは説明できない。",
        },
        {
            "hypothesis": "H7_scale",
            "evidence_direction": "evaluate_with_round_adjusted_scale_ranks",
            "result": json.dumps(scale_evidence, ensure_ascii=False),
            "interpretation": "同回内規模順位とマッチド対照差を併読する。規模が低ければ絶対効果指標の低さを機械的に説明し得るが、採択理由は同定しない。",
        },
        {
            "hypothesis": "H8_multidimensional_selection",
            "evidence_direction": "within_company_clustering_and_compensating_dimensions",
            "result": (
                f"公募回×指標の周辺度数を固定した置換で60%以上未満の期待値{perm_primary['permutation_mean']:.2f}件に対し"
                f"観測{perm_primary['observed']:.0f}件（上側p={perm_primary['upper_tail_p']:.5f}）。"
                f"中核28件中、少なくとも1指標が申請者中央値以上なのは{int((wins >= 1).sum())}件。"
                f"共同申請等は{consortium['core_mean_or_share']*100:.1f}%対{consortium['other_mean_or_share']*100:.1f}%"
                f"（同回置換p={consortium['round_stratified_permutation_p']:.4g}、BH q={consortium['bh_q_within_all_features']:.4g}）。"
            ),
            "interpretation": "指標の弱さが企業内で偶然以上に集積するかと、別指標の強みが残るかを示す。採択企業内の記述であり、多次元選抜が採択を生んだという因果推論ではない。",
        },
        {
            "hypothesis": "H9_financial_confirmation",
            "evidence_direction": "refuted_as_discriminator",
            "result": (
                f"3・4次の外部表に結合できた中核群は{int(financial['confirmation_true_n'])}/{int(financial['total_n'])}件で確認書あり。"
                f"その他外部表では{int(financial['comparison_true_n'])}/{int(financial['comparison_total_n'])}件"
                f"（Fisher p={financial['fisher_two_sided_p']:.4g}）。"
            ),
            "interpretation": "金融機関確認書はほぼ全採択案件に存在し、中核群を識別する変数ではない。要件充足又は一般的な申請実務を表す可能性が高い。",
        },
    ]
    financial_payload = financial.to_dict()
    for key, value in list(financial_payload.items()):
        if isinstance(value, (float, np.floating)) and not np.isfinite(value):
            financial_payload[key] = None

    payload = {
        "hypotheses": rows,
        "scale_evidence": scale_evidence,
        "primary_core_n": int(core.sum()),
        "primary_eligible_n": int(base["eligible"].sum()),
        "primary_core_clean_n": int((core & frame["is_clean"]).sum()),
        "primary_clean_eligible_n": int((base["eligible"] & frame["is_clean"]).sum()),
        "core_with_any_at_or_above_applicant_n": int((wins >= 1).sum()),
        "core_all_observed_below_n": int((wins == 0).sum()),
        "no13_sensitivity_n": int(no13_all["flag_n"]),
        "old7_sensitivity_n": int(old7_all["flag_n"]),
        "old7_jaccard": float(old7_all["jaccard_with_current9"]),
        "structure_geography_feature_n": len(structure_geography),
        "structure_geography_bh_q_below_0_05_n": int((structure_geography["bh_q_within_all_features"] < 0.05).sum()),
        "financial_confirmation": financial_payload,
    }
    return pd.DataFrame(rows), payload


def validate(
    frame: pd.DataFrame,
    core_table: pd.DataFrame,
    sensitivity: pd.DataFrame,
    boundary: pd.DataFrame,
    boundary_cells: pd.DataFrame,
    pairs: pd.DataFrame,
    correction_impact: pd.DataFrame,
) -> None:
    primary = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    assert len(frame) == 381
    assert int(primary["eligible"].sum()) == 373
    assert int(primary["flag"].sum()) == 28
    assert int((primary["eligible"] & frame["is_clean"]).sum()) == 199
    assert int((primary["flag"] & frame["is_clean"]).sum()) == 16
    assert len(core_table) == 28 and core_table["case_id"].nunique() == 28
    assert len(pairs) == 28
    assert pairs["treated_case_id"].nunique() == 28
    assert pairs["control_case_id"].nunique() == 28
    current = sensitivity[(sensitivity["metric_set"] == "current9") & (sensitivity["scope"] == "all")].iloc[0]
    assert int(current["flag_n"]) == 28 and int(current["eligible_n"]) == 373
    boundary_counts = boundary.set_index("minimum_relative_gap_below_benchmark")["flag_n"].astype(int).to_dict()
    assert boundary_counts == {0.0: 28, 0.01: 27, 0.05: 20, 0.1: 14}
    assert int(boundary.iloc[0]["primary_core_observed_cell_n"]) == 208
    assert int(boundary.iloc[0]["primary_core_abs_gap_lt_5pct_cell_n"]) == 25
    assert len(boundary_cells) > 0 and boundary_cells["case_id"].nunique() == 381
    assert int(correction_impact["round_changed"].sum()) == 60
    assert int(correction_impact["old_core29"].sum()) == 29
    assert int(correction_impact["new_core28"].sum()) == 28
    removed = set(correction_impact.loc[correction_impact["membership_change"] == "removed_after_round_correction", "case_id"])
    added = set(correction_impact.loc[correction_impact["membership_change"] == "added_after_round_correction", "case_id"])
    assert removed == {"s1_outline__179", "s1_outline__196"}
    assert added == {"s1_outline_159"}


def main() -> None:
    frame = add_comparison_flags(load_data())
    correction_impact = round_correction_impact(frame)
    sensitivity, membership = build_metric_set_sensitivity(frame)
    boundary, boundary_cells = boundary_sensitivity(frame)
    core_table = build_core_company_table(frame, membership)

    marginals = pd.concat([
        round_metric_marginals(frame, scope, METRIC_SETS[spec]["nos"])
        for spec in ["current9", "directional8_no13"]
        for scope in ["all", "clean"]
    ], ignore_index=True).drop_duplicates()

    permutation_summaries = []
    permutation_distributions = []
    for spec_idx, spec in enumerate(["current9", "directional8_no13"]):
        for scope_idx, scope in enumerate(["all", "clean"]):
            summary, distribution = run_permutation(
                frame, spec, scope, N_PERMUTATIONS,
                RNG_SEED + spec_idx * 100 + scope_idx,
            )
            permutation_summaries.append(summary)
            permutation_distributions.append(distribution)
    permutation_summary = pd.concat(permutation_summaries, ignore_index=True)
    permutation_distribution = pd.concat(permutation_distributions, ignore_index=True)

    base = classify(frame, METRIC_SETS["current9"]["nos"], PRIMARY_MIN_OBS, PRIMARY_BELOW_SHARE)
    pairs = greedy_scale_matching(frame, base["flag"])
    raw_comparison, matched_comparison, scale_ranks = comparison_summary(frame, base["flag"], pairs)
    quality = quality_comparison(frame, base["flag"])
    structure_geography = structure_geography_comparison(frame, base["flag"], N_PERMUTATIONS)
    financial_summary, financial_linked = financial_confirmation_comparison(frame, base["flag"])
    hypothesis_table, hypothesis_payload = build_hypothesis_evidence(
        frame, sensitivity, permutation_summary, scale_ranks, quality,
        structure_geography, financial_summary,
    )

    pair_lookup = pairs[[
        "treated_case_id", "control_case_id", "control_company", "control_industry",
        "industry_exact_match", "shared_scale_variable_n", "match_distance",
    ]].rename(columns={"treated_case_id": "case_id"})
    core_table = core_table.merge(pair_lookup, on="case_id", how="left", validate="one_to_one")

    validate(frame, core_table, sensitivity, boundary, boundary_cells, pairs, correction_impact)

    write_csv(core_table, "core28_company_quantitative_table.csv")
    write_csv(correction_impact, "round_correction_impact.csv")
    write_csv(sensitivity, "metric_set_sensitivity.csv")
    write_csv(membership, "metric_set_membership.csv")
    write_csv(boundary, "boundary_sensitivity.csv")
    write_csv(boundary_cells, "boundary_metric_cells.csv")
    write_csv(marginals, "round_metric_applicant_marginals.csv")
    write_csv(permutation_summary, "permutation_test_summary.csv")
    write_csv(permutation_distribution, "permutation_test_distribution.csv")
    write_csv(pairs, "matched_accepted_pairs.csv")
    write_csv(raw_comparison, "raw_scale_and_effect_comparison.csv")
    write_csv(matched_comparison, "matched_scale_and_effect_comparison.csv")
    write_csv(scale_ranks, "round_adjusted_scale_ranks.csv")
    write_csv(quality, "quality_indicator_comparison.csv")
    write_csv(structure_geography, "round_adjusted_structure_geography_comparison.csv")
    write_csv(financial_summary, "financial_confirmation_comparison.csv")
    write_csv(financial_linked, "financial_confirmation_case_linkage.csv")
    write_csv(hypothesis_table, "hypothesis_evidence.csv")
    source_manifest = pd.DataFrame([
        {
            "source_file": str(path),
            "role": role,
            "sha256": file_sha256(path),
            "file_size_bytes": path.stat().st_size,
        }
        for path, role in [
            (CASE_LEVEL_PATH, "企業別公開PDF推計値・既存品質判定（回次中央値は本分析で再付与）"),
            (CASES_PATH, "規模・案件構造・地理・品質の元データ"),
            (BENCHMARKS_PATH, "公募回別の公式申請者・採択者中央値"),
            (APPLICATION_ROUND_MAP_PATH, "公式採択一覧で補正した1・2次の申請公募回クロスウォーク"),
            (FINANCIAL_CONFIRMATION_PATH, "3・4次の金融機関確認書外部表"),
        ]
    ])
    write_csv(source_manifest, "quantitative_source_manifest.csv")

    summary = {
        "analysis_scope": "publicly recorded accepted/grant-decided company records only",
        "not_identified": ["acceptance probability", "causal effect of metrics", "reason for acceptance"],
        "primary_definition": {
            "metric_set": "current9",
            "minimum_observed_metrics": PRIMARY_MIN_OBS,
            "below_applicant_median_share_threshold": PRIMARY_BELOW_SHARE,
            "strict_comparison": "company value < same-round applicant median",
        },
        "counts": hypothesis_payload,
        "boundary_sensitivity": {
            "method": "require company value to be at least 0%, 1%, 5%, or 10% below the same-round applicant median before counting it as below",
            "primary_core_observed_cells": int(boundary.iloc[0]["primary_core_observed_cell_n"]),
            "primary_core_abs_gap_lt_5pct_cells": int(boundary.iloc[0]["primary_core_abs_gap_lt_5pct_cell_n"]),
        },
        "permutation": {
            "method": "within each round × metric, shuffle below-median flags across records with that metric observed; missingness positions and marginal below counts are fixed",
            "permutations": N_PERMUTATIONS,
            "seed_base": RNG_SEED,
        },
        "matching": {
            "treated_n": len(pairs),
            "control_n_unique": int(pairs["control_case_id"].nunique()),
            "same_round_required": True,
            "scale_variables": ["baseline sales", "project cost", "subsidy", "baseline employees"],
            "industry_exact_match_n": int(pairs["industry_exact_match"].sum()),
            "industry_exact_match_pct": 100 * pairs["industry_exact_match"].mean(),
            "minimum_shared_scale_variables": 2,
            "matching_without_replacement": True,
            "matching_method": "same-round greedy 1:1 matching on log scale distance with industry mismatch penalty",
        },
        "source_files": [
            str(CASE_LEVEL_PATH), str(CASES_PATH), str(BENCHMARKS_PATH),
            str(APPLICATION_ROUND_MAP_PATH), str(FINANCIAL_CONFIRMATION_PATH),
        ],
    }
    (HERE / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8"
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
