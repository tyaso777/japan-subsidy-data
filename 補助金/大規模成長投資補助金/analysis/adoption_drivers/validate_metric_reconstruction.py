"""基本7指標の再構築妥当性と、追加評価5指標の利用可能件数を集計する。

公開企業PDFの収録母集団は公式の採択者母集団と一致しない。このスクリプトは
両者を同一標本とみなすのではなく、公開PDFから作った企業別値の収録率と分布を
示した上で、公式採択者代表値との距離を診断する。
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CASES_PATH = ROOT / "data" / "processed" / "cases.csv"
BENCHMARKS_PATH = ROOT / "data" / "reference" / "official_round_benchmarks.csv"
SALES_SERIES_PATH = ROOT / "data" / "processed" / "sales_series.csv"


def load_analysis_module():
    path = HERE / "analyze_adoption_drivers.py"
    spec = importlib.util.spec_from_file_location("adoption_driver_core", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


CORE = load_analysis_module()

VISIBLE_META = {
    "company_sales_cagr": {
        "no": 1,
        "field": "sales_cagr_pct",
        "method": "PDFの全社売上高の基準値・目標値と期間から年平均成長率を算出",
        "source_type": "算出値",
    },
    "company_sales_increase": {
        "no": 2,
        "field": "sales_increase_oku_yen_normalized",
        "method": "PDF記載の全社売上高増加額を億円へ単位正規化",
        "source_type": "記載値・単位正規化",
    },
    "labor_cagr": {
        "no": 7,
        "field": "labor_annual_rate_pct",
        "method": "PDFの労働生産性の基準値・目標値と期間から年平均伸び率を算出",
        "source_type": "算出値",
    },
    "employee_pay_rate": {
        "no": 9,
        "field": "employee_pay_annual_rate_pct",
        "method": "PDFの1人当たり給与の基準値・目標値と期間から年平均賃上げ率を算出",
        "source_type": "算出値",
    },
    "employee_pay_total_increase": {
        "no": 10,
        "field": "employee_pay_total_increase_estimated_oku",
        "method": "（目標1人当たり給与×目標人数－基準1人当たり給与×基準人数）÷10,000",
        "source_type": "推計値",
    },
    "officer_pay_rate": {
        "no": 11,
        "field": "officer_pay_annual_rate_pct",
        "method": "PDFの1人当たり役員報酬の基準値・目標値と期間から年平均伸び率を算出",
        "source_type": "算出値",
    },
    "investment_sales_ratio": {
        "no": 13,
        "field": "investment_sales_ratio_pct",
        "method": "事業費（百万円）÷基準全社売上高（億円）。単位差により数値がそのまま%になる",
        "source_type": "推計値",
    },
}

ADDITIONAL_META = {
    "project_sales_share": {
        "no": 4,
        "field": "project_sales_share_proxy",
        "method": "目標補助事業売上高÷目標全社売上高×100",
    },
    "project_sales_cagr": {
        "no": 5,
        "field": "project_sales_cagr_proxy",
        "method": "補助事業売上高の基準値・目標値と期間から年平均成長率を算出",
    },
    "project_sales_increase": {
        "no": 6,
        "field": "project_sales_increase_proxy",
        "method": "目標補助事業売上高－基準補助事業売上高",
    },
    "value_added_increase": {
        "no": 8,
        "field": "value_added_increase_proxy_oku",
        "method": "（目標労働生産性×目標人数－基準労働生産性×基準人数）÷10,000",
    },
    "value_added_subsidy_ratio": {
        "no": 14,
        "field": "value_added_subsidy_ratio_proxy_pct",
        "method": "付加価値増加額の推計値÷補助金額×100",
    },
}

ROUNDS = ["1次", "2次", "3次", "4次"]


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan)


def finite_values(cases: pd.DataFrame, round_label: str, field: str) -> pd.Series:
    return numeric(cases.loc[cases["round"].eq(round_label), field]).dropna()


def relative_difference(value: float, benchmark: float) -> float:
    if benchmark == 0:
        return np.nan
    return 100 * (value - benchmark) / abs(benchmark)


def prepare_cases() -> tuple[pd.DataFrame, pd.DataFrame]:
    cases = pd.read_csv(CASES_PATH).copy()
    benchmarks = pd.read_csv(BENCHMARKS_PATH)
    sales_series = pd.read_csv(SALES_SERIES_PATH)

    cases["investment_sales_ratio_pct"] = (
        numeric(cases["project_cost_million_yen_normalized"])
        / numeric(cases["sales_baseline_oku_yen"])
    )
    cases["subsidy_oku"] = numeric(cases["subsidy_million_yen_normalized"]) / 100
    cases["value_added_increase_proxy_oku"] = (
        numeric(cases["labor_target_value_man_yen_per_person"])
        * numeric(cases["employees_target_value"])
        - numeric(cases["labor_base_value_man_yen_per_person"])
        * numeric(cases["employees_base_value"])
    ) / 10_000
    cases["value_added_subsidy_ratio_proxy_pct"] = (
        100 * cases["value_added_increase_proxy_oku"] / cases["subsidy_oku"]
    )
    cases = CORE.add_project_sales_proxies(cases, sales_series)
    return cases, benchmarks


def official_row(
    benchmarks: pd.DataFrame,
    round_label: str,
    metric_key: str,
    statistic: str | None = None,
) -> pd.Series | None:
    rows = benchmarks[
        benchmarks["round"].eq(round_label)
        & benchmarks["metric_key"].eq(metric_key)
    ]
    if statistic is not None:
        rows = rows[rows["statistic"].eq(statistic)]
    if rows.empty:
        return None
    return rows.iloc[0]


def build_visible_validation(cases: pd.DataFrame, benchmarks: pd.DataFrame) -> None:
    round_sizes = cases.groupby("round").size().to_dict()
    details: list[dict] = []
    for round_label in ROUNDS:
        for metric_key, meta in VISIBLE_META.items():
            official = official_row(benchmarks, round_label, metric_key, "median")
            if official is None:
                continue
            values = finite_values(cases, round_label, meta["field"])
            official_median = float(official["accepted_value"])
            pdf_median = float(values.median())
            total = int(round_sizes[round_label])
            details.append(
                {
                    "round": round_label,
                    "metric_no": meta["no"],
                    "metric_key": metric_key,
                    "metric_label": CORE.METRIC_LABELS[metric_key],
                    "unit": official["unit"],
                    "public_pdf_cases": total,
                    "official_accepted_n": int(official["accepted_n"]),
                    "pdf_value_n": int(values.count()),
                    "pdf_coverage_pct": 100 * values.count() / total,
                    "official_accepted_median": official_median,
                    "pdf_median": pdf_median,
                    "median_difference": pdf_median - official_median,
                    "median_difference_pct": relative_difference(pdf_median, official_median),
                    "pdf_mean": float(values.mean()),
                    "pdf_sample_std": float(values.std(ddof=1)) if len(values) > 1 else np.nan,
                    "pdf_sample_variance": float(values.var(ddof=1)) if len(values) > 1 else np.nan,
                    "source_type": meta["source_type"],
                    "calculation": meta["method"],
                }
            )
    detail = pd.DataFrame(details).sort_values(["metric_no", "round"])
    detail.to_csv(HERE / "visible_metric_validation.csv", index=False, encoding="utf-8-sig")

    summary_rows: list[dict] = []
    public_total = int(cases["round"].isin(ROUNDS).sum())
    for metric_key, meta in VISIBLE_META.items():
        part = detail[detail["metric_key"].eq(metric_key)]
        summary_rows.append(
            {
                "metric_no": meta["no"],
                "metric_key": metric_key,
                "metric_label": CORE.METRIC_LABELS[metric_key],
                "source_type": meta["source_type"],
                "pdf_value_n": int(part["pdf_value_n"].sum()),
                "public_pdf_cases": public_total,
                "pdf_coverage_pct": 100 * part["pdf_value_n"].sum() / public_total,
                "round_median_abs_difference_pct": float(part["median_difference_pct"].abs().median()),
                "max_abs_difference_pct": float(part["median_difference_pct"].abs().max()),
                "rounds_within_10pct": int(part["median_difference_pct"].abs().le(10).sum()),
                "rounds_compared": int(len(part)),
                "calculation": meta["method"],
            }
        )
    pd.DataFrame(summary_rows).sort_values("metric_no").to_csv(
        HERE / "visible_metric_validation_summary.csv", index=False, encoding="utf-8-sig"
    )


def add_visible_lag_flag(cases: pd.DataFrame, benchmarks: pd.DataFrame) -> pd.DataFrame:
    below = pd.DataFrame(index=cases.index)
    for metric_key, meta in VISIBLE_META.items():
        thresholds = {
            round_label: float(row["accepted_value"])
            for round_label in ROUNDS
            if (row := official_row(benchmarks, round_label, metric_key, "median")) is not None
        }
        values = numeric(cases[meta["field"]])
        threshold = cases["round"].map(thresholds)
        below[metric_key] = np.where(values.notna() & threshold.notna(), values < threshold, np.nan)
    count = below.notna().sum(axis=1)
    share = below.sum(axis=1, min_count=1) / count
    cases["visible_metric_lagging"] = count.ge(3) & share.ge(0.60)
    return cases


def build_additional_validation(cases: pd.DataFrame, benchmarks: pd.DataFrame) -> None:
    cases = add_visible_lag_flag(cases.copy(), benchmarks)
    lag = cases["visible_metric_lagging"]
    round_sizes = cases.groupby("round").size().to_dict()
    comparison_rows: list[dict] = []
    win_columns: dict[str, pd.Series] = {}

    for metric_key, meta in ADDITIONAL_META.items():
        win = pd.Series(False, index=cases.index)
        for round_label in ROUNDS:
            official = official_row(benchmarks, round_label, metric_key)
            if official is None:
                continue
            values = finite_values(cases, round_label, meta["field"])
            statistic = str(official["statistic"])
            proxy_stat = float(values.mean() if statistic == "mean" else values.median()) if len(values) else np.nan
            official_value = float(official["accepted_value"])
            comparison_rows.append(
                {
                    "round": round_label,
                    "metric_no": meta["no"],
                    "metric_key": metric_key,
                    "metric_label": CORE.METRIC_LABELS[metric_key],
                    "unit": official["unit"],
                    "official_statistic": statistic,
                    "public_pdf_cases": int(round_sizes[round_label]),
                    "official_accepted_n": int(official["accepted_n"]),
                    "pdf_value_n": int(values.count()),
                    "pdf_coverage_pct": 100 * values.count() / round_sizes[round_label],
                    "pdf_comparable_statistic": proxy_stat,
                    "official_accepted_statistic": official_value,
                    "relative_difference_pct": relative_difference(proxy_stat, official_value)
                    if np.isfinite(proxy_stat)
                    else np.nan,
                    "calculation": meta["method"],
                }
            )
            # 現行の定量補完判定は「採択者中央値以上」。No.4は公式値が平均のため対象外。
            if statistic == "median":
                mask = cases["round"].eq(round_label)
                win.loc[mask] = numeric(cases.loc[mask, meta["field"]]).ge(official_value).fillna(False)
        win_columns[metric_key] = win

    comparison = pd.DataFrame(comparison_rows).sort_values(["metric_no", "round"])
    comparison.to_csv(HERE / "additional_metric_validation_by_round.csv", index=False, encoding="utf-8-sig")

    all_wins = pd.DataFrame(win_columns)
    any_other = {
        key: all_wins.drop(columns=key).any(axis=1) for key in ADDITIONAL_META
    }
    summary_rows: list[dict] = []
    for metric_key, meta in ADDITIONAL_META.items():
        values = numeric(cases[meta["field"]])
        available = values.notna()
        part = comparison[comparison["metric_key"].eq(metric_key)]
        lag_available = lag & available
        wins = lag & win_columns[metric_key]
        summary_rows.append(
            {
                "metric_no": meta["no"],
                "metric_key": metric_key,
                "metric_label": CORE.METRIC_LABELS[metric_key],
                "total_value_n": int(available.sum()),
                "total_cases": int(len(cases)),
                "total_coverage_pct": 100 * available.mean(),
                "lagging_group_n": int(lag.sum()),
                "lagging_available_n": int(lag_available.sum()),
                "lagging_coverage_pct": 100 * lag_available.sum() / lag.sum(),
                "lagging_above_official_n": int(wins.sum()),
                "lagging_above_share_of_available_pct": 100 * wins.sum() / lag_available.sum()
                if lag_available.any()
                else np.nan,
                "unique_compensation_n": int((wins & ~any_other[metric_key]).sum()),
                "official_statistic": "/".join(sorted(set(part["official_statistic"]))),
                "round_pdf_counts": " / ".join(
                    f"{row['round']} {int(row['pdf_value_n'])}"
                    for _, row in part.sort_values("round").iterrows()
                ),
                "calculation": meta["method"],
                "median_threshold_eligible": bool((part["official_statistic"] == "median").all()),
            }
        )
    pd.DataFrame(summary_rows).sort_values("metric_no").to_csv(
        HERE / "additional_metric_coverage.csv", index=False, encoding="utf-8-sig"
    )

    overlap = pd.DataFrame(
        [
            {
                "visible_lagging_n": int(lag.sum()),
                "no8_or_no14_win_n": int(
                    (lag & (win_columns["value_added_increase"] | win_columns["value_added_subsidy_ratio"])).sum()
                ),
                "no4_no5_no6_win_n": int(
                    (
                        lag
                        & (
                            win_columns["project_sales_share"]
                            | win_columns["project_sales_cagr"]
                            | win_columns["project_sales_increase"]
                        )
                    ).sum()
                ),
                "project_sales_only_win_n": int(
                    (
                        lag
                        & (
                            win_columns["project_sales_share"]
                            | win_columns["project_sales_cagr"]
                            | win_columns["project_sales_increase"]
                        )
                        & ~(win_columns["value_added_increase"] | win_columns["value_added_subsidy_ratio"])
                    ).sum()
                ),
                "any_added_metric_win_n": int((lag & all_wins.any(axis=1)).sum()),
            }
        ]
    )
    overlap.to_csv(HERE / "additional_metric_overlap.csv", index=False, encoding="utf-8-sig")


def main() -> None:
    cases, benchmarks = prepare_cases()
    build_visible_validation(cases, benchmarks)
    build_additional_validation(cases, benchmarks)


if __name__ == "__main__":
    main()
