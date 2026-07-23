from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent


def main() -> None:
    required_docs = [
        "README.md",
        "01_program_scale.md",
        "02_official_median_gaps.md",
        "03_public_pdf_statistics.md",
        "04_metric_reading_guide.md",
        "05_multi_metric_lagging.md",
        "06_scale_and_redundancy.md",
        "07_next_analysis_questions.md",
        "08_sources_and_limits.md",
    ]
    for name in required_docs:
        path = HERE / name
        assert path.exists() and path.stat().st_size > 500, name
        text = path.read_text(encoding="utf-8")
        assert "NaN" not in text and "nan" not in text, name

    counts = pd.read_csv(HERE / "round_counts.csv")
    gaps = pd.read_csv(HERE / "official_metric_gap_summary.csv")
    reconstruction = pd.read_csv(HERE / "pdf_metric_reconstruction_summary.csv")
    assert counts["applicant_n"].sum() == 1713
    assert counts["accepted_n"].sum() == 412
    assert len(counts) == 4
    assert len(gaps) >= 14
    assert len(reconstruction) == 9
    assert gaps.loc[gaps["metric_key"] == "company_sales_increase", "accepted_above_applicant_rounds"].iloc[0] == 4
    assert gaps.loc[gaps["metric_key"] == "investment_sales_ratio", "accepted_above_applicant_rounds"].iloc[0] == 1
    print("basic statistics validation passed")


if __name__ == "__main__":
    main()
