from pathlib import Path

import pandas as pd
from scipy.stats import spearmanr


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
SOURCE = PROJECT / "analysis" / "round6_reassessment" / "case_level_reassessment.csv"

AMOUNTS = {
    "project_cost_oku": "事業費",
    "subsidy_oku": "補助金額",
}
METRICS = {
    "sales_cagr_pct": "売上高CAGR",
    "labor_annual_rate_pct": "労働生産性上昇率",
    "employee_pay_annual_rate_pct": "1人当たり従業員給与上昇率",
    "officer_pay_annual_rate_pct": "役員給与上昇率",
    "sales_increase_oku_yen_normalized": "売上増加額",
    "value_added_increase_estimated_oku": "付加価値増加額",
    "employee_pay_total_increase_estimated_oku": "給与総額増加額",
}


def within_round_rank_correlation(df: pd.DataFrame, amount: str, metric: str) -> tuple[int, float]:
    pair = df[["round", amount, metric]].copy()
    pair[amount] = pd.to_numeric(pair[amount], errors="coerce")
    pair[metric] = pd.to_numeric(pair[metric], errors="coerce")
    pair = pair.dropna()
    pair["amount_rank"] = pair.groupby("round")[amount].rank(pct=True)
    pair["metric_rank"] = pair.groupby("round")[metric].rank(pct=True)
    return len(pair), float(spearmanr(pair["amount_rank"], pair["metric_rank"]).statistic)


def main() -> None:
    df = pd.read_csv(SOURCE, low_memory=False)
    correlation_rows = []
    band_rows = []
    for amount, amount_label in AMOUNTS.items():
        amount_value = pd.to_numeric(df[amount], errors="coerce")
        df[f"{amount}_quartile"] = amount_value.groupby(df["round"]).transform(
            lambda s: pd.qcut(s.rank(method="first"), 4, labels=["Q1小", "Q2", "Q3", "Q4大"])
        )
        for metric, metric_label in METRICS.items():
            n, rho = within_round_rank_correlation(df, amount, metric)
            correlation_rows.append({
                "amount": amount,
                "amount_label": amount_label,
                "metric": metric,
                "metric_label": metric_label,
                "n": n,
                "within_round_spearman": rho,
            })
            values = pd.to_numeric(df[metric], errors="coerce")
            grouped = pd.DataFrame({"band": df[f"{amount}_quartile"], "value": values}).groupby(
                "band", observed=True
            )["value"]
            for band, group in grouped:
                band_rows.append({
                    "amount": amount,
                    "amount_label": amount_label,
                    "metric": metric,
                    "metric_label": metric_label,
                    "band": band,
                    "n": int(group.notna().sum()),
                    "median": group.median(),
                    "mean": group.mean(),
                })
    correlations = pd.DataFrame(correlation_rows)
    bands = pd.DataFrame(band_rows)
    correlations.to_csv(HERE / "project_amount_metric_correlations.csv", index=False, encoding="utf-8-sig")
    bands.to_csv(HERE / "project_amount_band_summary.csv", index=False, encoding="utf-8-sig")
    print(correlations.to_string(index=False))
    print("\n事業費四分位・率指標中央値")
    print(
        bands[
            (bands["amount"] == "project_cost_oku")
            & bands["metric"].isin([
                "sales_cagr_pct", "labor_annual_rate_pct", "employee_pay_annual_rate_pct"
            ])
        ][["metric_label", "band", "n", "median"]].to_string(index=False)
    )


if __name__ == "__main__":
    main()
