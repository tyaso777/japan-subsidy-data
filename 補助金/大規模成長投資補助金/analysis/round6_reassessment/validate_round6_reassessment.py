"""Deterministic integrity checks for the round-6 reassessment outputs."""

from __future__ import annotations

import json
import math
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent
PRIMARY_MIN_OBS = 5
PRIMARY_BELOW_SHARE = 0.60


def bool_mask(series: pd.Series) -> pd.Series:
    """Return a stable Boolean mask for either parsed bools or CSV strings."""
    return series.astype(str).str.strip().str.lower().eq("true")


def assert_close(actual: float, expected: float, *, label: str) -> None:
    assert math.isclose(float(actual), float(expected), rel_tol=1e-10, abs_tol=1e-10), (
        f"{label}: expected {expected}, got {actual}"
    )


def sensitivity_row(
    frame: pd.DataFrame,
    *,
    sample: str,
    metric_set: str,
    min_observed: int,
    below_share_threshold: float,
) -> pd.Series:
    threshold = pd.to_numeric(frame["below_share_threshold"], errors="coerce")
    selected = frame[
        frame["sample"].eq(sample)
        & frame["metric_set"].eq(metric_set)
        & pd.to_numeric(frame["min_observed"], errors="coerce").eq(min_observed)
        & threshold.sub(below_share_threshold).abs().lt(1e-12)
    ]
    assert len(selected) == 1, (
        "sensitivity row must be unique: "
        f"sample={sample}, metric_set={metric_set}, min_observed={min_observed}, "
        f"threshold={below_share_threshold}; found {len(selected)}"
    )
    return selected.iloc[0]


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key == "id" and value:
                self.ids.append(value)


def main() -> None:
    cases = pd.read_csv(HERE / "case_level_reassessment.csv", low_memory=False)
    qualitative = pd.read_csv(HERE / "focused_qualitative_review_44.csv")
    studies = pd.read_csv(HERE / "fully_below_case_studies.csv")
    deduplicated_all_below = pd.read_csv(HERE / "all_deduplicated_metrics_below_cases.csv")
    validation = pd.read_csv(HERE / "metric_reconstruction_validation.csv")
    sensitivity = pd.read_csv(HERE / "lagging_definition_sensitivity.csv")
    robustness = pd.read_csv(HERE / "metric_set_robustness.csv")
    value_added_loro = pd.read_csv(HERE / "value_added_leave_one_round_out.csv")
    pair_comparison = pd.read_csv(HERE / "qualitative_pair_comparison.csv")
    gaps = pd.read_csv(HERE / "official_applicant_accepted_gap_summary.csv")
    framework = pd.read_csv(HERE / "round6_numeric_framework.csv")
    sources = pd.read_csv(HERE / "source_manifest.csv")
    summary = json.loads((HERE / "summary.json").read_text(encoding="utf-8"))
    report = (HERE / "round6_adoption_reassessment_report.html").read_text(encoding="utf-8")

    assert len(cases) == 381 and cases["case_id"].nunique() == 381
    clean = bool_mask(cases["is_clean"])
    dashboard_low = bool_mask(cases["dashboard9_lagging"])
    directional_low = bool_mask(cases["directional8_lagging"])
    dashboard_eligible = pd.to_numeric(cases["dashboard9_observed_n"], errors="coerce").ge(PRIMARY_MIN_OBS)
    directional_eligible = pd.to_numeric(cases["directional8_observed_n"], errors="coerce").ge(PRIMARY_MIN_OBS)

    assert int(dashboard_low.sum()) == 118
    assert int(directional_low.sum()) == 113
    assert int(dashboard_eligible.sum()) == 373
    assert int((clean & dashboard_eligible).sum()) == 199
    assert int(directional_eligible.sum()) == 371
    assert int((clean & directional_eligible).sum()) == 198

    strict_applicant_majority = pd.to_numeric(
        cases["dashboard9_strict_above_applicant_share"], errors="coerce"
    ).gt(0.5)
    assert int((dashboard_low & strict_applicant_majority).sum()) == 58

    strict_components = pd.to_numeric(cases["strict_component_win_n"], errors="coerce")
    assert int((directional_low & strict_components.ge(2)).sum()) == 39
    assert int((directional_low & strict_components.eq(1)).sum()) == 65
    assert int((directional_low & strict_components.eq(0)).sum()) == 9

    all_observed_below = bool_mask(cases["directional_all_observed_below_accepted"])
    assert int(all_observed_below.sum()) == 5
    assert len(studies) == 5 and studies["company"].nunique() == 5
    assert len(deduplicated_all_below) == 7
    assert deduplicated_all_below["company"].nunique() == 7
    assert len(qualitative) == 44 and qualitative["company"].nunique() == 44
    assert int(qualitative["core_strong_n"].ge(3).sum()) == 42
    assert len(validation) == 72
    assert len(gaps) == 15
    assert len(framework) == 7
    dashboard_summary = summary["dashboard_compatible"]
    directional_summary = summary["directional_primary"]
    robustness_summary = summary["robustness"]
    assert dashboard_summary["n"] == 118
    assert dashboard_summary["eligible_n"] == 373
    assert dashboard_summary["clean_eligible_n"] == 199
    assert dashboard_summary["strict_above_applicant_majority_n"] == 58
    assert directional_summary["n"] == 113
    assert directional_summary["eligible_n"] == 371
    assert directional_summary["clean_eligible_n"] == 198
    assert directional_summary["strict_two_or_more_component_n"] == 39
    assert directional_summary["strict_one_component_n"] == 65
    assert directional_summary["strict_zero_component_n"] == 9
    assert robustness_summary["deduplicated_all_below_n"] == 7
    assert set(robustness_summary["deduplicated_all_below_companies"]) == set(
        deduplicated_all_below["company"]
    )
    assert summary["focused_qualitative_review"]["reviewed_n"] == 44
    assert sources.loc[sources["source_type"].eq("official"), "location"].str.startswith("https://").all()

    expected_robustness = {
        "現行9指標": (118, 58, 373, 199),
        "No.13除外8指標": (113, 55, 371, 198),
        "No.14除外8指標": (118, 56, 364, 195),
        "No.8除外8指標": (101, 44, 364, 195),
        "No.13・14除外7指標": (134, 64, 374, 199),
        "構成単位3領域": (164, 78, 381, 202),
        "絶対効果3指標": (176, 94, 372, 198),
        "率4指標": (128, 65, 323, 171),
    }
    assert robustness["specification"].is_unique
    assert set(robustness["specification"]) == set(expected_robustness)
    for specification, (expected_n, expected_clean_n, expected_eligible_n, expected_clean_eligible_n) in expected_robustness.items():
        row = robustness.loc[robustness["specification"].eq(specification)].iloc[0]
        assert int(row["n"]) == expected_n, specification
        assert int(row["clean_n"]) == expected_clean_n, specification
        assert int(row["eligible_n"]) == expected_eligible_n, specification
        assert int(row["clean_eligible_n"]) == expected_clean_eligible_n, specification
        assert_close(
            row["conditional_pct"],
            100 * expected_n / expected_eligible_n,
            label=f"robustness conditional prevalence {specification}",
        )
        assert_close(
            row["clean_conditional_pct"],
            100 * expected_clean_n / expected_clean_eligible_n,
            label=f"robustness clean conditional prevalence {specification}",
        )
        assert robustness_summary["metric_set_counts"][specification] == expected_n

    required_sensitivity_columns = {"eligible_n", "eligible_pct", "conditional_lagging_pct"}
    assert required_sensitivity_columns.issubset(sensitivity.columns)
    numeric_sensitivity = sensitivity[
        ["lagging_n", "sample_n", "eligible_n", "eligible_pct", "conditional_lagging_pct"]
    ].apply(pd.to_numeric, errors="coerce")
    assert numeric_sensitivity.notna().all().all()
    assert (numeric_sensitivity["lagging_n"] <= numeric_sensitivity["eligible_n"]).all()
    expected_eligible_pct = 100 * numeric_sensitivity["eligible_n"] / numeric_sensitivity["sample_n"]
    expected_conditional_pct = 100 * numeric_sensitivity["lagging_n"] / numeric_sensitivity["eligible_n"]
    assert (numeric_sensitivity["eligible_pct"] - expected_eligible_pct).abs().max() < 1e-10
    assert (numeric_sensitivity["conditional_lagging_pct"] - expected_conditional_pct).abs().max() < 1e-10

    sensitivity_expectations = [
        ("all", "dashboard_9", 118, 373),
        ("clean", "dashboard_9", 58, 199),
        ("all", "directional_8_no13", 113, 371),
        ("clean", "directional_8_no13", 55, 198),
    ]
    for sample, metric_set, expected_low_n, expected_eligible_n in sensitivity_expectations:
        row = sensitivity_row(
            sensitivity,
            sample=sample,
            metric_set=metric_set,
            min_observed=PRIMARY_MIN_OBS,
            below_share_threshold=PRIMARY_BELOW_SHARE,
        )
        assert int(row["lagging_n"]) == expected_low_n
        assert int(row["eligible_n"]) == expected_eligible_n
        assert_close(
            row["conditional_lagging_pct"],
            100 * expected_low_n / expected_eligible_n,
            label=f"conditional prevalence {sample}/{metric_set}",
        )

    assert len(value_added_loro) == 4
    assert set(value_added_loro["round"]) == {"1次", "2次", "3次", "4次"}
    assert value_added_loro["round"].is_unique
    assert pd.to_numeric(value_added_loro["training_rounds_n"], errors="coerce").eq(3).all()
    assert pd.to_numeric(value_added_loro["observed_n"], errors="coerce").gt(0).all()
    for column in ["loro_factor", "heldout_predicted_median", "heldout_error_pct"]:
        assert pd.to_numeric(value_added_loro[column], errors="coerce").notna().all(), column

    assert len(pair_comparison) == 6
    assert pair_comparison["factor"].nunique() == 6
    assert pd.to_numeric(pair_comparison["pair_count"], errors="coerce").eq(40).all()
    bonferroni = pd.to_numeric(pair_comparison["bonferroni_p_6"], errors="coerce")
    assert bonferroni.notna().all()
    assert bonferroni.between(0.05, 1.0, inclusive="both").all()

    parser = IdParser()
    parser.feed(report)
    duplicates = [item for item, count in Counter(parser.ids).items() if count > 1]
    assert not duplicates, f"duplicate HTML ids: {duplicates}"
    for section_id in [
        "conclusion", "scope", "data", "definition", "quant", "qual", "five",
        "official", "round6", "targets", "recipe", "cases", "limitations",
    ]:
        assert section_id in parser.ids
    assert ">NaN<" not in report
    assert "const cases =" in report
    assert "方向中立" not in report
    false_majority_wording = [
        "観測指標の過半数が申請者代表値以上",
        "80社は観測指標の過半数",
        "80/118社が過半数",
    ]
    for wording in false_majority_wording:
        assert wording not in report, f"false majority wording remains: {wording}"
    assert "観測指標の半数以上が申請者代表値以上" in report
    assert "代表値を厳密に上回る場合だけ数えると39／65／9" in report
    print("round6 reassessment validation: OK")


if __name__ == "__main__":
    main()
