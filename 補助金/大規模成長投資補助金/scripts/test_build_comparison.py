import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("build_comparison.py")
SPEC = importlib.util.spec_from_file_location("build_comparison", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class ComparisonTests(unittest.TestCase):
    def test_compare_with_unit_year_and_missing(self):
        current = [{
            "case_id": "c1", "round": "1次", "company": "株式会社テスト",
            "project_cost_million_yen": "5000", "subsidy_million_yen": "1500",
            "labor_base_year_after_correction": "2024", "officer_pay_annual_rate_pct": "",
        }]
        external = [{
            "案件ID": "c1", "採択回": "第1次", "企業名": "(株)テスト",
            "事業費": "5,000", "補助額_億円": "15", "労働基準年": "24年度", "役員率": "5.1%",
        }]
        mapping = {
            "dataset_id": "fixture", "record_keys": [{"current": ["case_id"], "external": ["案件ID"]}],
            "columns": [
                {"current": "project_cost_million_yen", "external": "事業費", "type": "number"},
                {"current": "subsidy_million_yen", "external": "補助額_億円", "type": "number", "external_multiplier": 100},
                {"current": "labor_base_year_after_correction", "external": "労働基準年", "type": "year"},
                {"current": "officer_pay_annual_rate_pct", "external": "役員率", "type": "percentage"},
            ],
        }
        rows, summary = MODULE.compare_dataset(current, external, mapping)
        self.assertEqual([r["status"] for r in rows], ["equal", "equal", "equal", "current_missing"])
        self.assertEqual(summary["matched_records"], 1)

    def test_fallback_company_round_matching(self):
        current = [{"case_id": "c2", "round": "2次", "company": "株式会社 サンプル", "value": "10"}]
        external = [{"ID": "", "回": "第2次", "企業": "(株)サンプル", "値": "12"}]
        mapping = {
            "dataset_id": "fixture",
            "record_keys": [
                {"current": ["case_id"], "external": ["ID"]},
                {"current": ["round", "company"], "external": ["回", "企業"], "normalizers": ["round", "company"]},
            ],
            "columns": [{"current": "value", "external": "値", "type": "number"}],
        }
        rows, _ = MODULE.compare_dataset(current, external, mapping)
        self.assertEqual(rows[0]["status"], "different")
        self.assertEqual(rows[0]["match_method"], "key_2")

    def test_thousand_yen_external_matches_normalized_man_yen_current(self):
        current = [{
            "case_id": "tonox", "company": "株式会社トノックス",
            "employee_pay_base_value_man_yen_per_person": "516.9",
            "employee_pay_target_value_man_yen_per_person": "633.8",
        }]
        external = [{
            "案件ID": "tonox", "企業名": "株式会社トノックス",
            "給与基準値_千円人": "5,169", "給与目標値_千円人": "6,338",
        }]
        rule = {
            "type": "number", "current_unit": "万円/人", "external_unit": "千円/人",
            "external_multiplier": 0.1, "absolute_tolerance": 0.01,
        }
        mapping = {
            "dataset_id": "fixture",
            "record_keys": [{"current": ["case_id"], "external": ["案件ID"]}],
            "columns": [
                {**rule, "current": "employee_pay_base_value_man_yen_per_person", "external": "給与基準値_千円人"},
                {**rule, "current": "employee_pay_target_value_man_yen_per_person", "external": "給与目標値_千円人"},
            ],
        }
        rows, _ = MODULE.compare_dataset(current, external, mapping)
        self.assertEqual([row["status"] for row in rows], ["equal", "equal"])
        self.assertAlmostEqual(rows[0]["external_normalized"], 516.9)
        self.assertAlmostEqual(rows[1]["external_normalized"], 633.8)

    def test_html_injection_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "qa.html"
            path.write_text("<html><body><script>const DATA=[{case_id:'c1'}];function reviewState(id){return reviews[id]}</script></body></html>", encoding="utf-8")
            payload = {"datasets": [], "rows": []}
            MODULE.inject_qa(path, payload)
            MODULE.inject_qa(path, payload)
            html = path.read_text(encoding="utf-8")
            self.assertEqual(html.count(MODULE.ADDON_START), 1)
            self.assertEqual(html.count("const STORE='growth-investment-qa-v1'"), 1)
            self.assertIn("COMPARISON_PAYLOAD", html)
            self.assertIn("comparisonRun", html)

    def test_missing_mapping_column_fails_loudly(self):
        current = [{"case_id": "c1", "company": "テスト"}]
        external = [{"案件ID": "c1", "企業名": "テスト"}]
        mapping = {
            "record_keys": [{"current": ["case_id"], "external": ["案件ID"]}],
            "columns": [{"current": "missing_current", "external": "missing_external"}],
        }
        with self.assertRaisesRegex(ValueError, "存在しない列"):
            MODULE.validate_mapping_columns(current, external, mapping)


if __name__ == "__main__":
    unittest.main()
