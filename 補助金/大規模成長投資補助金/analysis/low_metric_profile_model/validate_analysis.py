from pathlib import Path

import numpy as np
import pandas as pd
import json


HERE = Path(__file__).resolve().parent


def main() -> None:
    scores = pd.read_csv(HERE / "company_scores.csv")
    performance = pd.read_csv(HERE / "model_performance.csv")
    predictions = pd.read_csv(HERE / "predictions.csv")
    importance = pd.read_csv(HERE / "feature_importance.csv")
    coefficients = pd.read_csv(HERE / "model_coefficients.csv")
    normalization = pd.read_csv(HERE / "scale_normalization_sensitivity.csv")
    blocks = pd.read_csv(HERE / "attribute_block_model_performance.csv")
    adjusted_comparison = pd.read_csv(HERE / "adjusted_index_candidate_comparison.csv")
    adjusted_profiles = pd.read_csv(HERE / "adjusted_company_profiles.csv")
    adjusted_summary = json.loads((HERE / "competitive_adjusted_index_summary.json").read_text(encoding="utf-8"))

    assert len(scores) == 381
    assert scores["case_id"].is_unique
    assert scores["low_score_accepted"].notna().sum() == 357
    assert scores["low_score_applicant"].notna().sum() == 357
    assert np.isfinite(scores[["low_score_accepted", "low_score_applicant"]].to_numpy(float)[~scores[["low_score_accepted", "low_score_applicant"]].isna().to_numpy()]).all()

    overall = performance[performance["held_out_round"] == "ALL_LOGO"]
    required = {
        ("basic", "low_score_accepted"),
        ("basic_project", "low_score_accepted"),
        ("basic_clean", "low_score_accepted"),
        ("basic", "low_score_applicant"),
        ("basic", "lagging_applicant_dedup7"),
        ("basic", "dashboard9_lagging"),
    }
    observed = set(zip(overall["model"], overall["outcome"]))
    assert required <= observed

    prediction_counts = predictions.groupby(["outcome", "model"]).size()
    assert prediction_counts[("low_score_accepted", "basic")] == 357
    assert prediction_counts[("low_score_applicant", "basic")] == 357
    assert predictions["logo_prediction"].notna().all()
    assert len(importance) > 0 and len(coefficients) > 0
    assert (HERE / "report.md").stat().st_size > 1000
    assert (HERE / "normalization_sensitivity_report.md").stat().st_size > 1000

    by_score = normalization.set_index("score_key")
    absolute_employee = by_score.loc["accepted_absolute_amounts", "baseline_employees_within_round_spearman"]
    efficiency_employee = by_score.loc["per_subsidy_public_median", "baseline_employees_within_round_spearman"]
    rate_employee = by_score.loc["accepted_rates", "baseline_employees_within_round_spearman"]
    assert abs(efficiency_employee) < abs(absolute_employee)
    assert rate_employee > 0

    block_overall = blocks[
        (blocks["held_out_round"] == "ALL_LOGO")
        & (blocks["outcome"] == "low_score_accepted")
    ].set_index("model")
    assert block_overall.loc["scale_only", "r2"] > block_overall.loc["industry_only", "r2"]
    assert block_overall.loc["scale_only", "r2"] > block_overall.loc["geography_only", "r2"]
    recommended = adjusted_summary["recommended_candidate"]
    adjusted_by_key = adjusted_comparison.set_index("candidate")
    assert len(adjusted_profiles) == 381
    assert adjusted_profiles["case_id"].is_unique
    assert adjusted_by_key.loc[recommended, "standardized_mean_difference"] < adjusted_by_key.loc["raw_domain_mean", "standardized_mean_difference"]
    assert adjusted_by_key.loc[recommended, "spearman_with_raw_competitiveness"] >= 0.20
    assert adjusted_by_key.loc[recommended, "raw_low_at_or_above_50_pct"] >= 80.0
    assert adjusted_profiles["recommended_adjusted_score"].notna().sum() >= 300
    low = adjusted_profiles[adjusted_profiles["raw_tail_group"] == "raw_low"]
    high = adjusted_profiles[adjusted_profiles["raw_tail_group"] == "raw_high"]
    assert low["adjusted_niche_competitive"].mean() >= 0.90
    assert high["adjusted_niche_competitive"].mean() == 1.0
    assert high["adjusted_niche_competitive"].mean() - low["adjusted_niche_competitive"].mean() <= 0.10
    print("validation passed")


if __name__ == "__main__":
    main()
