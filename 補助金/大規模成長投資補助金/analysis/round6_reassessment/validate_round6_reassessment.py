"""Deterministic integrity checks for the round-6 reassessment outputs."""

from __future__ import annotations

import json
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent


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
    validation = pd.read_csv(HERE / "metric_reconstruction_validation.csv")
    gaps = pd.read_csv(HERE / "official_applicant_accepted_gap_summary.csv")
    framework = pd.read_csv(HERE / "round6_numeric_framework.csv")
    sources = pd.read_csv(HERE / "source_manifest.csv")
    summary = json.loads((HERE / "summary.json").read_text(encoding="utf-8"))
    report = (HERE / "round6_adoption_reassessment_report.html").read_text(encoding="utf-8")

    assert len(cases) == 381
    assert int(cases["dashboard9_lagging"].sum()) == 118
    assert int(cases["directional8_lagging"].sum()) == 113
    assert int(cases["directional_all_observed_below_accepted"].sum()) == 5
    assert len(studies) == 5 and studies["company"].nunique() == 5
    assert len(qualitative) == 44 and qualitative["company"].nunique() == 44
    assert int(qualitative["core_strong_n"].ge(3).sum()) == 42
    assert len(validation) == 72
    assert len(gaps) == 15
    assert len(framework) == 7
    assert summary["dashboard_compatible"]["n"] == 118
    assert summary["directional_primary"]["n"] == 113
    assert summary["focused_qualitative_review"]["reviewed_n"] == 44
    assert sources.loc[sources["source_type"].eq("official"), "location"].str.startswith("https://").all()

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
    print("round6 reassessment validation: OK")


if __name__ == "__main__":
    main()
