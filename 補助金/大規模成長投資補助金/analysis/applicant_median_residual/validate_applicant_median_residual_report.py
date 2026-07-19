"""回次補正後28件レポートのデータ・HTML整合性を検証する。"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

import pandas as pd


HERE = Path(__file__).resolve().parent


class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.hrefs: list[str] = []
        self.scripts: list[str] = []
        self._script: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(str(values["id"]))
        if tag == "a" and values.get("href"):
            self.hrefs.append(str(values["href"]))
        if tag == "script" and not values.get("src"):
            self._script = []

    def handle_data(self, data: str) -> None:
        if self._script is not None:
            self._script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script is not None:
            self.scripts.append("".join(self._script))
            self._script = None


def read(name: str) -> pd.DataFrame:
    return pd.read_csv(HERE / name, encoding="utf-8-sig")


def main() -> None:
    core = read("core28_company_quantitative_table.csv")
    coding = read("qualitative_coding_28.csv")
    correction = read("round_correction_impact.csv")
    pairs = read("matched_accepted_pairs.csv")
    permutation = read("permutation_test_summary.csv")
    report_path = HERE / "applicant_median_residual_report.html"
    report = report_path.read_text(encoding="utf-8")
    quantitative_readme = (HERE / "README_quantitative_residual.md").read_text(encoding="utf-8")

    assert len(core) == 28 and core["case_id"].nunique() == 28
    assert len(coding) == 28 and coding["case_id"].nunique() == 28
    assert set(core["case_id"]) == set(coding["case_id"])
    clean_values = core["is_clean"].map(lambda value: str(value).strip().lower() in {"true", "1", "1.0", "yes"})
    assert int(clean_values.sum()) == 16
    assert int((core["current9_below_applicant_n"] < core["current9_observed_n_reproduced"]).sum()) == 28

    for letter in "ABCDEFGHI":
        scores = pd.to_numeric(coding[f"{letter}_score"], errors="raise")
        assert scores.between(0, 3).all(), letter
        assert coding[f"{letter}_evidence"].fillna("").str.strip().ne("").all(), letter
        assert coding[f"{letter}_source_page_role"].fillna("").str.strip().ne("").all(), letter

    assert len(pairs) == 28
    assert pairs["treated_case_id"].nunique() == 28
    assert pairs["control_case_id"].nunique() == 28
    primary = permutation[
        (permutation["metric_set"] == "current9")
        & (permutation["scope"] == "all")
        & (permutation["statistic"] == "count_60pct")
    ].iloc[0]
    assert int(primary["permutations"]) == 20_000
    assert float(primary["observed"]) == 28
    assert 14.2 < float(primary["permutation_mean"]) < 14.4

    parser = AuditParser()
    parser.feed(report)
    assert len(parser.ids) == len(set(parser.ids)), "HTML idが重複"
    for required_id in [
        "conclusion", "definition", "official", "quant", "hypotheses", "qual",
        "archetypes", "cases", "round6", "limits", "sources", "caseSearch",
    ]:
        assert required_id in parser.ids, required_id
    assert report.count('class="case-card"') == 28
    assert report.count("ローカルPDF") == 28
    below_columns = [f"below_applicant_no{number}" for number in [1, 2, 7, 8, 9, 10, 11, 13, 14]]
    expected_below = sum(int(pd.to_numeric(core[column], errors="coerce").eq(1).sum()) for column in below_columns)
    expected_observed = sum(int(pd.to_numeric(core[column], errors="coerce").notna().sum()) for column in below_columns)
    assert report.count('class="status below"') == expected_below
    assert report.count('class="status above"') == expected_observed - expected_below
    value_columns = {
        1: "sales_cagr_pct", 2: "sales_increase_oku_yen_normalized", 7: "labor_annual_rate_pct",
        8: "value_added_increase_estimated_oku", 9: "employee_pay_annual_rate_pct",
        10: "employee_pay_total_increase_estimated_oku", 11: "officer_pay_annual_rate_pct",
        13: "investment_sales_ratio_pct", 14: "value_added_subsidy_ratio_proxy_pct",
    }
    for number, value_column in value_columns.items():
        observed_n = int(pd.to_numeric(core[value_column], errors="coerce").notna().sum())
        below_n = int(pd.to_numeric(core[f"below_applicant_no{number}"], errors="coerce").eq(1).sum())
        assert f"<td>{below_n}/{observed_n}</td>" in report, (number, below_n, observed_n)
    assert "最終分析対象は28件" in report
    assert "181件中60件" in report
    assert "上側 p=0.00030" in report
    assert "アサヒセイレン中部" in report and "八立製作所" in report and "浦島観光ホテル" in report
    assert "29件固有" not in report
    assert "@media(max-width:980px){.layout{display:block}.toc{position:sticky" in report
    assert ".toc button{display:none}" not in report
    assert int(correction["old_core29"].sum()) == 29 and int(correction["new_core28"].sum()) == 28
    assert "No.1、2、7、8、9、10、11、13、14" in quantitative_readme
    assert "6指標を観測でき、そのうち5指標が中央値未満" in quantitative_readme
    assert "No.1、2、3、4" not in quantitative_readme
    assert not (HERE / "core29_company_quantitative_table.csv").exists()
    assert not (HERE / "qualitative_coding_29.csv").exists()
    for legacy_name in [
        "evidence_part_a.md", "evidence_part_b.md",
        "qualitative_coding_part_a.csv", "qualitative_coding_part_b.csv",
    ]:
        assert (HERE / "legacy_pre_round_audit" / legacy_name).exists(), legacy_name
    assert "�" not in report
    assert not re.search(r"(?i)(?<![A-Za-z])nan(?![A-Za-z])", report)

    missing_links = []
    for href in parser.hrefs:
        if href.startswith(("http://", "https://", "#", "mailto:")):
            continue
        target = (HERE / unquote(href)).resolve()
        if not target.exists():
            missing_links.append((href, str(target)))
    assert not missing_links, missing_links[:5]

    print("validation passed")
    print(f"core={len(core)}, clean=16, case_cards=28, local_links=28, scripts={len(parser.scripts)}")


if __name__ == "__main__":
    main()
