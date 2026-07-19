"""Generated-output integrity checks for applicant_median_residual."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent


def main() -> None:
    core = pd.read_csv(HERE / "core28_company_quantitative_table.csv")
    correction = pd.read_csv(HERE / "round_correction_impact.csv")
    crosswalk = pd.read_csv(HERE / "application_round_crosswalk_1_2.csv")
    boundary = pd.read_csv(HERE / "boundary_sensitivity.csv")
    sensitivity = pd.read_csv(HERE / "metric_set_sensitivity.csv")
    permutation = pd.read_csv(HERE / "permutation_test_summary.csv")
    pairs = pd.read_csv(HERE / "matched_accepted_pairs.csv")
    financial = pd.read_csv(HERE / "financial_confirmation_comparison.csv")
    structure = pd.read_csv(HERE / "round_adjusted_structure_geography_comparison.csv")
    quality = pd.read_csv(HERE / "quality_indicator_comparison.csv")
    summary = json.loads((HERE / "summary.json").read_text(encoding="utf-8"))

    assert len(core) == 28 and core["case_id"].nunique() == 28
    assert int(core["is_clean"].sum()) == 16
    assert int((core["current9_below_applicant_n"] == core["current9_observed_n_reproduced"]).sum()) == 0

    assert len(crosswalk) == 181 and crosswalk["case_id"].nunique() == 181
    assert crosswalk["application_round"].value_counts().to_dict() == {"1次": 106, "2次": 75}
    assert int((crosswalk["round_original"] != crosswalk["application_round"]).sum()) == 60
    assert int(correction["old_core29"].sum()) == 29
    assert int(correction["new_core28"].sum()) == 28
    assert set(correction.loc[correction["membership_change"] == "removed_after_round_correction", "case_id"]) == {"s1_outline__179", "s1_outline__196"}
    assert set(correction.loc[correction["membership_change"] == "added_after_round_correction", "case_id"]) == {"s1_outline_159"}

    primary = sensitivity[(sensitivity["metric_set"] == "current9") & (sensitivity["scope"] == "all")].iloc[0]
    assert int(primary["eligible_n"]) == 373 and int(primary["flag_n"]) == 28
    directional = sensitivity[(sensitivity["metric_set"] == "directional8_no13") & (sensitivity["scope"] == "all")].iloc[0]
    assert int(directional["flag_n"]) == 30

    perm_primary = permutation[
        (permutation["metric_set"] == "current9")
        & (permutation["scope"] == "all")
        & (permutation["statistic"] == "count_60pct")
    ].iloc[0]
    assert int(perm_primary["observed"]) == 28
    assert int(perm_primary["permutations"]) == 20_000
    assert round(float(perm_primary["permutation_mean"]), 2) == 14.30
    assert float(perm_primary["upper_tail_p"]) == 0.0002999850007499

    assert len(pairs) == 28
    assert pairs["treated_case_id"].nunique() == 28
    assert pairs["control_case_id"].nunique() == 28
    assert pairs["shared_scale_variable_n"].min() >= 2

    fin = financial[financial["sample"] == "core28_round3_4_external_linked"].iloc[0]
    assert int(fin["total_n"]) == 23 and int(fin["confirmation_true_n"]) == 23
    all_fin = financial[financial["sample"] == "all_round3_4_external_records"].iloc[0]
    assert int(all_fin["total_n"]) == 218 and int(all_fin["confirmation_true_n"]) == 213

    consortium = structure[structure["feature"] == "has_consortium"].iloc[0]
    assert round(consortium["core_mean_or_share"], 6) == round(7 / 28, 6)
    assert consortium["bh_q_within_all_features"] < 0.05
    period = quality[quality["quality_indicator"] == "has_period_ambiguity_any"].iloc[0]
    assert int(period["core_flagged_n"]) == 12
    assert period["bh_q_within_quality_indicators"] < 0.05

    counts = summary["counts"]
    assert counts["primary_core_n"] == 28
    assert counts["primary_core_clean_n"] == 16
    assert counts["core_with_any_at_or_above_applicant_n"] == 28
    assert counts["core_all_observed_below_n"] == 0
    assert summary["matching"]["treated_n"] == 28
    assert summary["matching"]["control_n_unique"] == 28
    assert boundary.set_index("minimum_relative_gap_below_benchmark")["flag_n"].astype(int).to_dict() == {0.0: 28, 0.01: 27, 0.05: 20, 0.1: 14}

    print("validation passed: 28 corrected core records, 20,000 permutations, 28 unique matched controls")


if __name__ == "__main__":
    main()
