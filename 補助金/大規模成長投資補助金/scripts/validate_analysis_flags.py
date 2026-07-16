#!/usr/bin/env python3
"""Validate analyst-facing flags and long-form tables."""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "data" / "processed"


def rows(name: str) -> list[dict[str, str]]:
    with (P / name).open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def truthy(value: str) -> bool:
    return value.strip().lower() in {"true", "1", "yes"}


def main() -> int:
    errors: list[str] = []
    cases = rows("cases.csv")
    metrics = rows("metrics.csv")
    sales = rows("sales_series.csv")
    components = rows("investment_components.csv")
    entities = rows("case_entities.csv")
    amounts = rows("cost_amount_candidates.csv")
    flags = rows("quality_flags.csv")
    case_ids = {r["case_id"] for r in cases}

    if len(cases) != 381 or len(case_ids) != 381:
        errors.append(f"cases expected 381 unique rows, got {len(cases)} rows / {len(case_ids)} ids")
    for name, table in [
        ("metrics", metrics), ("sales_series", sales), ("investment_components", components),
        ("case_entities", entities), ("cost_amount_candidates", amounts), ("quality_flags", flags),
    ]:
        missing = sorted({r.get("case_id", "") for r in table} - case_ids)
        if missing:
            errors.append(f"{name}: unknown case ids {missing[:10]}")

    bool_fields = [
        "has_multiple_investments", "multiple_investment_review_required", "cost_text_numeric_mismatch",
        "cost_multiple_values_present", "has_consortium", "has_parent_company_reference",
        "has_subsidiary_reference", "has_related_company_reference", "has_multiple_sales_series",
        "has_mixed_entity_metrics", "representative_entity_ambiguous", "has_ambiguous_rate_any",
        "has_period_ambiguity_any", "has_unit_ambiguity_any", "has_arithmetic_mismatch_any",
        "has_ocr_uncertainty_any", "analysis_exclusion_recommended",
    ]
    for row in cases:
        for field in bool_fields:
            if row.get(field) not in {"true", "false"}:
                errors.append(f"{row['case_id']}: {field} is not boolean: {row.get(field)!r}")
        reasons = {x for x in row.get("analysis_exclusion_reasons", "").split("|") if x}
        critical = {f["flag_code"] for f in flags if f["case_id"] == row["case_id"] and f["severity"] == "critical" and f["status"] != "resolved"}
        if reasons != critical:
            errors.append(f"{row['case_id']}: exclusion reasons do not match unresolved critical flags")
        if truthy(row["analysis_exclusion_recommended"]) != bool(critical):
            errors.append(f"{row['case_id']}: exclusion boolean does not match critical flags")

    valid_severity = {"critical", "warning", "info"}
    valid_status = {"unresolved", "resolved", "not_applicable", "open_context_check", "resolved_with_tolerance"}
    for flag in flags:
        if flag["severity"] not in valid_severity:
            errors.append(f"invalid severity {flag['severity']} for {flag['case_id']}")
        if flag["status"] not in valid_status:
            errors.append(f"invalid status {flag['status']} for {flag['case_id']}")

    for row in metrics:
        if row.get("rate_ambiguous") not in {"true", "false"}:
            errors.append(f"{row['case_id']}/{row['metric_key']}: invalid metric rate_ambiguous")
        if row.get("rate_interpretation_status") == "ambiguous" and row.get("rate_definition") != "stated_undefined":
            errors.append(f"{row['case_id']}/{row['metric_key']}: ambiguous rate has resolved definition")
    for row in sales:
        if row.get("rate_ambiguous") not in {"true", "false"}:
            errors.append(f"{row['case_id']}/{row['series_id']}: invalid sales rate_ambiguous")

    if HTML := ROOT / "html" / "data" / "cases.json":
        html_rows = json.loads(HTML.read_text(encoding="utf-8-sig"))
        if len(html_rows) != 381 or {r["case_id"] for r in html_rows} != case_ids:
            errors.append("html/data/cases.json case ids do not match cases.csv")
        if any("analysis_exclusion_recommended" not in r for r in html_rows):
            errors.append("html/data/cases.json is missing analysis flags")

    summary = {
        "status": "ERROR" if errors else "OK",
        "cases": len(cases), "metrics": len(metrics), "sales_series": len(sales),
        "investment_components": len(components), "case_entities": len(entities),
        "cost_amount_candidates": len(amounts), "quality_flags": len(flags),
        "exclusion_recommended": sum(truthy(r["analysis_exclusion_recommended"]) for r in cases),
        "flag_counts": dict(sorted(Counter(r["flag_code"] for r in flags).items())),
        "errors": errors[:100],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
