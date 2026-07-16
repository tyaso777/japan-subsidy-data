#!/usr/bin/env python3
"""Revalidate known per-person unit conflicts and derive payroll-total proxies."""

from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
HTML_CASES = ROOT / "html" / "data" / "cases.json"

DERIVED_FIELDS = [
    "employee_pay_total_base_estimated_oku",
    "employee_pay_total_target_estimated_oku",
    "employee_pay_total_increase_estimated_oku",
    "employee_pay_total_calculation_status",
    "employee_pay_total_period_alignment",
    "employee_pay_total_entity_alignment",
    "employee_pay_total_unit_validation",
    "employee_pay_total_increase_analysis_status",
]

OVERRIDES = {
    ("s2_outline_17", "labor"): {
        "source_unit": "百万円/人", "adopted_unit": "万円/人", "factor": 1.0,
        "before_base": "47600", "before_target": "126400",
        "validation": "source_unit_conflict_cell_unit_preferred",
        "reason": "PDF行見出しは百万円/人だが各セルは476万円/人・1,264万円/人と明記",
    },
    ("s2_outline_17", "employee_pay"): {
        "source_unit": "百万円/人", "adopted_unit": "万円/人", "factor": 1.0,
        "before_base": "42700", "before_target": "49500",
        "validation": "source_unit_conflict_cell_unit_preferred",
        "reason": "PDF行見出しは百万円/人だが各セルは427万円/人・495万円/人と明記",
    },
    ("s1_outline_69", "labor"): {
        "source_unit": "万円/人", "adopted_unit": "千円/人", "factor": 0.1,
        "before_base": "10001", "before_target": "11690",
        "validation": "source_unit_conflict_assumed_thousand_yen",
        "reason": "PDFは万円/人表記だが10,001・11,690は千円/人相当と判断。原表記との矛盾を保持",
    },
    ("s1_outline_69", "employee_pay"): {
        "source_unit": "万円/人", "adopted_unit": "千円/人", "factor": 0.1,
        "before_base": "6892", "before_target": "7980",
        "validation": "source_unit_conflict_assumed_thousand_yen",
        "reason": "PDFは万円/人表記だが6,892・7,980は千円/人相当と判断。原表記との矛盾を保持",
    },
}


def read_csv(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows: list[dict], fields: list[str]):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def number(value):
    if value is None or str(value).strip() == "":
        return None
    try:
        result = float(str(value).replace(",", ""))
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def clean(value):
    if value is None:
        return ""
    if math.isclose(value, round(value), abs_tol=1e-10):
        return str(int(round(value)))
    return f"{value:.8f}".rstrip("0").rstrip(".")


def insert_after(fields: list[str], anchor: str, additions: list[str]):
    result = [field for field in fields if field not in additions]
    index = result.index(anchor) + 1 if anchor in result else len(result)
    return result[:index] + additions + result[index:]


def apply_override(metric: dict, rule: dict):
    base = number(metric.get("base_value_raw") or metric.get("base_value"))
    target = number(metric.get("target_value_raw") or metric.get("target_value"))
    metric["unit_raw"] = rule["source_unit"]
    metric["unit"] = rule["adopted_unit"]
    metric["normalized_unit"] = "万円/人"
    metric["unit_conversion_factor"] = clean(rule["factor"])
    metric["base_value_man_yen_per_person"] = clean(base * rule["factor"]) if base is not None else ""
    metric["target_value_man_yen_per_person"] = clean(target * rule["factor"]) if target is not None else ""
    metric["unit_validation"] = rule["validation"]
    metric["unit_evidence_source"] = "pdf_visual_revalidation"
    metric["unit_evidence_text"] = rule["reason"]


def mirror_metric(case: dict, prefix: str, metric: dict):
    for suffix in (
        "unit", "unit_raw", "normalized_unit", "unit_conversion_factor", "unit_validation",
        "base_value_man_yen_per_person", "target_value_man_yen_per_person",
    ):
        case[f"{prefix}_{suffix}"] = metric.get(suffix, "")


def derive_payroll(case: dict):
    pay_base = number(case.get("employee_pay_base_value_man_yen_per_person"))
    pay_target = number(case.get("employee_pay_target_value_man_yen_per_person"))
    employees_base = number(case.get("employees_base_value"))
    employees_target = number(case.get("employees_target_value"))
    values = (pay_base, pay_target, employees_base, employees_target)

    pay_years = (str(case.get("employee_pay_base_year", "")), str(case.get("employee_pay_target_year", "")))
    employee_years = (str(case.get("employees_base_year", "")), str(case.get("employees_target_year", "")))
    pay_labels = (str(case.get("employee_pay_base_period_label", "")), str(case.get("employee_pay_target_period_label", "")))
    employee_labels = (str(case.get("employees_base_period_label", "")), str(case.get("employees_target_period_label", "")))
    compact = lambda value: re.sub(r"[\s　]", "", value).replace("＋", "+")
    shared_box = (
        case.get("employee_pay_source_box_no")
        and case.get("employee_pay_source_box_no") == case.get("employees_source_box_no")
        and case.get("employee_pay_source_box_label") == case.get("employees_source_box_label")
    )
    if all(pay_years + employee_years) and pay_years == employee_years:
        period = "aligned"
    elif all(pay_labels + employee_labels) and tuple(map(compact, pay_labels)) == tuple(map(compact, employee_labels)):
        period = "aligned_by_period_label"
    elif shared_box and not any(value is None for value in values):
        period = "aligned_by_shared_source_box"
    elif all(pay_years + employee_years):
        period = "review_required"
    else:
        period = "unavailable"

    pay_entity = case.get("employee_pay_entity_match_status", "")
    employees_entity = case.get("employees_entity_match_status", "")
    if not pay_entity or not employees_entity:
        entity = "unavailable"
    elif pay_entity == "applicant_company_representative" and employees_entity == "applicant_company_representative":
        entity = "proxy_project_employee_count"
    else:
        entity = "review_required"

    unit = case.get("employee_pay_unit_validation", "") or "unavailable"
    case["employee_pay_total_period_alignment"] = period
    case["employee_pay_total_entity_alignment"] = entity
    case["employee_pay_total_unit_validation"] = unit

    if any(value is None for value in values):
        for field in DERIVED_FIELDS[:3]:
            case[field] = ""
        case["employee_pay_total_calculation_status"] = "unavailable"
        case["employee_pay_total_increase_analysis_status"] = "unavailable"
        return

    base_total = pay_base * employees_base / 10_000
    target_total = pay_target * employees_target / 10_000
    case["employee_pay_total_base_estimated_oku"] = clean(base_total)
    case["employee_pay_total_target_estimated_oku"] = clean(target_total)
    case["employee_pay_total_increase_estimated_oku"] = clean(target_total - base_total)

    if not period.startswith("aligned"):
        status = "calculated_period_review_required"
        analysis = "review_required"
    elif entity == "review_required":
        status = "calculated_entity_review_required"
        analysis = "review_required"
    elif unit in {"unavailable", "unit_missing_or_unsupported", "source_unit_conflict_assumed_thousand_yen"}:
        status = "calculated_unit_review_required"
        analysis = "review_required"
    else:
        status = "calculated_proxy"
        analysis = "usable_with_caution"
    case["employee_pay_total_calculation_status"] = status
    case["employee_pay_total_increase_analysis_status"] = analysis


def main():
    cases, case_fields = read_csv(PROCESSED / "cases.csv")
    metrics, metric_fields = read_csv(PROCESSED / "metrics.csv")
    validations, validation_fields = read_csv(PROCESSED / "validations.csv")
    case_by_id = {row["case_id"]: row for row in cases}
    metric_by_key = {(row["case_id"], row.get("metric_key", "")): row for row in metrics}
    validation_by_key = {(row["case_id"], row.get("metric_key", "")): row for row in validations}
    changes = []

    for key, rule in OVERRIDES.items():
        metric = metric_by_key[key]
        before_base = rule["before_base"]
        before_target = rule["before_target"]
        apply_override(metric, rule)
        validation = validation_by_key.get(key)
        if validation:
            apply_override(validation, rule)
        case = case_by_id[key[0]]
        mirror_metric(case, key[1], metric)
        case[f"{key[1]}_values_analysis_status"] = (
            "review_required" if rule["validation"] == "source_unit_conflict_assumed_thousand_yen"
            else "usable_with_caution"
        )
        case[f"{key[1]}_values_analysis_reasons"] = rule["validation"]
        case["has_unit_ambiguity_any"] = "true"
        changes.append({
            "case_id": key[0], "company": metric.get("company", ""), "metric_key": key[1],
            "source_unit_raw": rule["source_unit"], "adopted_analysis_unit": rule["adopted_unit"],
            "conversion_factor_to_man_yen": clean(rule["factor"]),
            "before_base_man_yen_per_person": before_base,
            "after_base_man_yen_per_person": metric["base_value_man_yen_per_person"],
            "before_target_man_yen_per_person": before_target,
            "after_target_man_yen_per_person": metric["target_value_man_yen_per_person"],
            "unit_validation": rule["validation"], "reason": rule["reason"],
            "pdf_url": case.get("pdf_url", ""),
        })

    for case in cases:
        derive_payroll(case)

    case_fields = insert_after(case_fields, "employees_unit_validation", DERIVED_FIELDS)
    write_csv(PROCESSED / "cases.csv", cases, case_fields)
    write_csv(PROCESSED / "metrics.csv", metrics, metric_fields)
    write_csv(PROCESSED / "validations.csv", validations, validation_fields)
    write_csv(PROCESSED / "payroll_unit_revalidation_changes.csv", changes, list(changes[0]))

    html_rows = json.loads(HTML_CASES.read_text(encoding="utf-8"))
    for item in html_rows:
        case = case_by_id[item["case_id"]]
        for field in DERIVED_FIELDS:
            item[field] = case.get(field, "")
        for prefix in ("labor", "employee_pay"):
            for suffix in (
                "unit", "unit_raw", "normalized_unit", "unit_conversion_factor", "unit_validation",
                "base_value_man_yen_per_person", "target_value_man_yen_per_person",
            ):
                item[f"{prefix}_{suffix}"] = case.get(f"{prefix}_{suffix}", "")
        for nested in item.get("metrics", []):
            for stale_field in (
                "rate_value_raw", "rate_numeric_pct", "rate_definition", "rate_interpretation_status",
                "rate_implied_target_value", "rate_reconciliation_status", "rate_interpretation_note", "rate_ambiguous",
            ):
                nested.pop(stale_field, None)
            source = metric_by_key.get((item["case_id"], nested.get("metric_key", "")))
            if source:
                for field in (
                    "unit", "unit_raw", "normalized_unit", "unit_conversion_factor", "unit_validation",
                    "base_value_man_yen_per_person", "target_value_man_yen_per_person",
                    "unit_evidence_source", "unit_evidence_text",
                ):
                    nested[field] = source.get(field, "")
    HTML_CASES.write_text(json.dumps(html_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "cases": len(cases),
        "unit_overrides": len(changes),
        "payroll_calculated": sum(bool(row["employee_pay_total_increase_estimated_oku"]) for row in cases),
        "payroll_period_aligned": sum(row["employee_pay_total_period_alignment"].startswith("aligned") for row in cases),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
