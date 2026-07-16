#!/usr/bin/env python3
"""Build analyst-facing structure and quality flags from the audited dataset.

This script is intentionally deterministic.  It does not overwrite source evidence:
raw values, normalized values, alternative candidates, and the reason for every flag
remain available in separate long-form tables.
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
TEXT_DIR = ROOT / "data" / "text"
HTML_CASES = ROOT / "html" / "data" / "cases.json"

CASE_FLAG_FIELDS = [
    "has_multiple_investments",
    "investment_component_count",
    "investment_component_count_method",
    "multiple_investment_review_required",
    "cost_text_numeric_mismatch",
    "cost_multiple_values_present",
    "has_consortium",
    "consortium_member_count",
    "has_parent_company_reference",
    "has_subsidiary_reference",
    "has_related_company_reference",
    "has_multiple_sales_series",
    "sales_series_count",
    "has_mixed_entity_metrics",
    "representative_entity_ambiguous",
    "has_ambiguous_rate_any",
    "ambiguous_rate_count",
    "has_period_ambiguity_any",
    "has_unit_ambiguity_any",
    "has_arithmetic_mismatch_any",
    "has_ocr_uncertainty_any",
    "analysis_exclusion_recommended",
    "analysis_exclusion_reasons",
    "quality_flag_count",
    "critical_quality_flag_count",
]

METRIC_RATE_FIELDS = [
    "rate_value_raw",
    "rate_numeric_pct",
    "rate_definition",
    "rate_interpretation_status",
    "rate_implied_target_value",
    "rate_reconciliation_status",
    "rate_interpretation_note",
    "rate_ambiguous",
]

SALES_RATE_FIELDS = [
    "rate_interpretation_status",
    "rate_ambiguous",
    "rate_interpretation_note",
]

MONEY_RE = re.compile(r"(?<![\d.])([0-9][0-9,]*(?:\.[0-9]+)?)\s*(億円|百万円|万円|千円|円)")
COMPANY_RE = re.compile(r"株式会社|有限会社|合同会社|一般社団法人|医療法人|学校法人|社会福祉法人")
PROJECT_RE = re.compile(r"工場|拠点|センター|施設|ホテル|店舗|事業所|研究所|プラント")
CATEGORY_RE = re.compile(r"建物|建屋|棟|機械|装置|設備|ライン|ソフト|システム|外注|土地|工事|設計|改修|増築|修繕|インフラ|整備|費$")
TOTAL_RE = re.compile(r"合計|総額|全体|計$|補助対象経費")
AMBIGUOUS_YEAR_METHODS = {
    "relative_year_requires_anchor",
    "unresolved_relative_or_missing_context",
    "unresolved_placeholder",
}


def read_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: scalar(row.get(key)) for key in fields})


def scalar(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value


def number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        result = float(text)
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def integer(value: Any) -> int | None:
    n = number(value)
    return int(n) if n is not None and n.is_integer() else None


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def close(a: float | None, b: float | None, abs_tol: float = 0.5, rel_tol: float = 0.001) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) <= max(abs_tol, rel_tol * max(abs(a), abs(b)))


def flatten_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        out: list[str] = []
        for item in value.values():
            out.extend(flatten_strings(item))
        return out
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(flatten_strings(item))
        return out
    return []


def normalized_component_amount(component: dict[str, Any]) -> tuple[float | None, str, str]:
    direct = ["cost_million_yen", "amount_million_yen", "million_yen", "eligible_million_yen"]
    for key in direct:
        val = number(component.get(key))
        if val is not None:
            return val, key, "百万円"
    val = number(component.get("amount_oku"))
    if val is not None:
        return val * 100, "amount_oku", "億円"
    val = number(component.get("amount_thousand_yen"))
    if val is not None:
        return val / 1000, "amount_thousand_yen", "千円"
    val = number(component.get("amount_yen"))
    if val is not None:
        return val / 1_000_000, "amount_yen", "円"
    building = number(component.get("building_million_yen"))
    machinery = number(component.get("machinery_million_yen"))
    if building is not None or machinery is not None:
        return (building or 0) + (machinery or 0), "building_plus_machinery_million_yen", "百万円"
    return None, "", ""


def component_type(label: str) -> tuple[str, str]:
    if TOTAL_RE.search(label):
        return "total", "high"
    if COMPANY_RE.search(label):
        return "entity_or_participant", "high"
    if PROJECT_RE.search(label) and not CATEGORY_RE.search(label):
        return "project_or_location", "medium"
    if CATEGORY_RE.search(label):
        return "cost_category", "medium"
    return "unspecified", "low"


def raw_component_value(component: dict[str, Any], source_key: str) -> Any:
    if source_key == "building_plus_machinery_million_yen":
        return f"{component.get('building_million_yen', '')}+{component.get('machinery_million_yen', '')}"
    return component.get(source_key, "")


def money_factor(unit: str) -> float:
    return {"億円": 100, "百万円": 1, "万円": 0.01, "千円": 0.001, "円": 0.000001}[unit]


def classify_money_candidate(text: str, match: re.Match[str]) -> tuple[str, str]:
    before = text[max(0, match.start() - 32): match.start()]
    after = text[match.end(): match.end() + 16]
    context = before + match.group(0) + after
    immediate = re.split(r"[。、；;（）()]", before)[-1][-18:]
    if re.search(r"補助対象経費", immediate):
        return "eligible_cost", "high"
    if re.search(r"補助(?:金|額|申請)|交付", immediate):
        return "subsidy", "high"
    if re.search(r"明細(?:表)?(?:は|の|:|：)?合計|拠点別(?:記載)?合計|設備明細(?:は)?合計", immediate):
        return "project_cost", "medium"
    if re.search(r"建物|建屋|機械|装置|設備|土地|工事|システム|ソフト", immediate):
        return "cost_component", "high"
    if re.search(r"事業費|総投資額|投資総額|総事業費", immediate):
        return "project_cost", "high"
    if re.search(r"売上|給与|生産性|賃金|人件費", context):
        return "non_cost_amount", "medium"
    if re.search(r"建物|建屋|機械|装置|設備|土地|工事|システム|ソフト", context):
        return "cost_component", "medium"
    return "unclassified_cost_amount", "low"


def extract_money_candidates(case: dict[str, str]) -> list[dict[str, Any]]:
    text = case.get("cost_box_transcription", "") or ""
    matches = list(MONEY_RE.finditer(text))
    out: list[dict[str, Any]] = []
    for idx, match in enumerate(matches, 1):
        raw_value = number(match.group(1))
        unit = match.group(2)
        candidate_type, confidence = classify_money_candidate(text, match)
        before = text[max(0, match.start() - 30): match.start()]
        after = text[match.end(): match.end() + 30]
        out.append({
            "case_id": case["case_id"],
            "round": case.get("round", ""),
            "company": case.get("company", ""),
            "candidate_id": f"{case['case_id']}_cost_{idx}",
            "candidate_type": candidate_type,
            "classification_confidence": confidence,
            "value_raw": raw_value,
            "unit_raw": unit,
            "value_million_yen_normalized": (raw_value * money_factor(unit)) if raw_value is not None else None,
            "context": before + match.group(0) + after,
            "source_page": case.get("cost_page", ""),
            "source_field": "cost_box_transcription",
            "project_cost_representative_million_yen": number(case.get("project_cost_million_yen_normalized")) or number(case.get("project_cost_million_yen")),
            "subsidy_representative_million_yen": number(case.get("subsidy_million_yen_normalized")) or number(case.get("subsidy_million_yen")),
            "pdf_url": case.get("pdf_url", ""),
        })
    # Common templates: "事業費（補助額） xx億円（yy億円）" and
    # "事業費xx億円（yy億円）".  In both, the parenthetical second amount is subsidy.
    between_first_two = text[matches[0].end():matches[1].start()] if len(matches) >= 2 else ""
    common_pair = len(out) >= 2 and "事業費" in text[max(0, matches[0].start() - 24):matches[0].start()]
    parenthetical_pair = common_pair and bool(re.fullmatch(r"\s*[（(]\s*", between_first_two))
    labeled_pair = len(out) >= 2 and bool(re.search(r"事業費.{0,16}補助", text[:matches[1].end()]))
    if parenthetical_pair or labeled_pair:
        out[0]["candidate_type"] = "project_cost"
        out[0]["classification_confidence"] = "high"
        out[1]["candidate_type"] = "subsidy"
        out[1]["classification_confidence"] = "high"
    for row in out:
        value = row["value_million_yen_normalized"]
        if row["candidate_type"] == "project_cost":
            rep = row["project_cost_representative_million_yen"]
        elif row["candidate_type"] == "subsidy":
            rep = row["subsidy_representative_million_yen"]
        else:
            rep = None
        row["difference_from_representative_million_yen"] = (value - rep) if value is not None and rep is not None else None
        row["matches_representative"] = close(value, rep) if rep is not None else ""
    return out


def add_flag(flags: list[dict[str, Any]], case: dict[str, str], code: str, severity: str,
             subject_table: str = "cases", subject_id: str | None = None, metric_key: str = "",
             status: str = "unresolved", value_raw: Any = "", value_normalized: Any = "",
             alternative_value: Any = "", source_page: Any = "", source_box_label: str = "",
             evidence: str = "", resolution_note: str = "") -> None:
    flags.append({
        "case_id": case["case_id"], "round": case.get("round", ""), "company": case.get("company", ""),
        "subject_table": subject_table, "subject_id": subject_id or case["case_id"], "metric_key": metric_key,
        "flag_code": code, "severity": severity, "status": status, "value_raw": value_raw,
        "value_normalized": value_normalized, "alternative_value": alternative_value,
        "source_page": source_page, "source_box_label": source_box_label,
        "evidence": evidence, "resolution_note": resolution_note,
    })


def metric_rate_metadata(row: dict[str, str]) -> dict[str, Any]:
    listed = number(row.get("listed_rate_pct"))
    raw = row.get("raw", "") or ""
    calculated = number(row.get("calculated_rate_pct"))
    diff = abs(listed - calculated) if listed is not None and calculated is not None else None
    if listed is None:
        return {
            "rate_value_raw": "", "rate_numeric_pct": "", "rate_definition": "not_stated",
            "rate_interpretation_status": "not_applicable", "rate_implied_target_value": "",
            "rate_reconciliation_status": "not_testable", "rate_interpretation_note": "率の記載なし",
            "rate_ambiguous": False,
        }
    raw_rate = f"{listed:g}%"
    if "CAGR" in raw.upper() or "年平均" in raw or "上昇率" in raw:
        definition = "annual_average_increase_rate"
        interpretation = "resolved_by_explicit_wording"
        ambiguous = False
        note = "原文に年平均または上昇率の明示あり"
    elif calculated is not None and diff is not None and diff <= 0.5:
        definition = "annual_average_increase_rate"
        interpretation = "resolved_by_arithmetic"
        ambiguous = False
        note = "基準値・目標値・期間から計算した年平均率と整合"
    elif row.get("source_box_type") == "project_targets" or "目標" in row.get("source_box_label", ""):
        definition = "annual_average_increase_rate"
        interpretation = "resolved_by_standard_table_context"
        ambiguous = False
        note = "補助事業目標値表の標準的な年平均上昇率欄として解釈"
    else:
        definition = "stated_undefined"
        interpretation = "ambiguous"
        ambiguous = True
        note = "率はあるが、年平均・累積・到達率の明示と算術確認材料が不足"
    if diff is None:
        reconciliation = "not_testable"
    elif diff <= 0.5:
        reconciliation = "consistent"
    elif diff <= 1.0:
        reconciliation = "rounding_or_period_warning"
    else:
        reconciliation = "mismatch"
    base = number(row.get("base_value"))
    by = integer(row.get("base_year_after_correction")) or integer(row.get("base_year"))
    ty = integer(row.get("target_year_after_correction")) or integer(row.get("target_year"))
    implied = None
    if base is not None and by is not None and ty is not None and ty > by and definition == "annual_average_increase_rate":
        implied = base * ((1 + listed / 100) ** (ty - by))
    return {
        "rate_value_raw": raw_rate, "rate_numeric_pct": listed, "rate_definition": definition,
        "rate_interpretation_status": interpretation, "rate_implied_target_value": round(implied, 6) if implied is not None else "",
        "rate_reconciliation_status": reconciliation, "rate_interpretation_note": note,
        "rate_ambiguous": ambiguous,
    }


def sales_rate_metadata(row: dict[str, str]) -> dict[str, Any]:
    definition = row.get("growth_rate_definition", "") or "not_stated"
    stated = number(row.get("stated_rate_pct"))
    resolved = {"cumulative_increase", "target_base_ratio", "cagr", "reported_target_index_normalized_to_cumulative_increase"}
    if definition in resolved or definition.startswith("資料原文156%="):
        return {"rate_interpretation_status": "resolved", "rate_ambiguous": False,
                "rate_interpretation_note": "率定義を原文または基準値・目標値との算術で確定"}
    if definition == "stated_undefined" and stated is not None:
        return {"rate_interpretation_status": "ambiguous", "rate_ambiguous": True,
                "rate_interpretation_note": "記載率が増加率・到達率・年平均率のいずれか確定できない"}
    return {"rate_interpretation_status": "not_applicable", "rate_ambiguous": False,
            "rate_interpretation_note": "比較対象となる率の記載なし"}


def split_participants(text: str) -> list[str]:
    if not text.strip():
        return []
    parts = re.split(r"[、,，;；\n]+", text)
    return [p.strip(" ・") for p in parts if p.strip(" ・")]


def relation_from_text(text: str, default: str = "participant") -> str:
    if "親会社" in text:
        return "parent"
    if "子会社" in text:
        return "subsidiary"
    if "コンソーシアム" in text or "共同申請" in text:
        return "consortium_member"
    if "関連会社" in text or "関係会社" in text or "グループ会社" in text:
        return "affiliate"
    return default


def load_narrative_text() -> dict[str, str]:
    grouped: dict[str, list[str]] = defaultdict(list)
    path = TEXT_DIR / "narratives.jsonl"
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            case_id = row.get("case_id")
            if case_id:
                grouped[case_id].extend(flatten_strings(row))
    return {key: "\n".join(values) for key, values in grouped.items()}


def main() -> int:
    cases, case_fields = read_csv(PROCESSED / "cases.csv")
    sales, sales_fields = read_csv(PROCESSED / "sales_series.csv")
    metrics, metric_fields = read_csv(PROCESSED / "metrics.csv")
    case_by_id = {row["case_id"]: row for row in cases}
    sales_by_case: dict[str, list[dict[str, str]]] = defaultdict(list)
    metrics_by_case: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in sales:
        sales_by_case[row["case_id"]].append(row)
    for row in metrics:
        metrics_by_case[row["case_id"]].append(row)
    narrative_text = load_narrative_text()

    flags: list[dict[str, Any]] = []
    component_rows: list[dict[str, Any]] = []
    entity_rows: list[dict[str, Any]] = []
    cost_candidates: list[dict[str, Any]] = []
    component_summary: dict[str, dict[str, Any]] = {}

    for case in cases:
        try:
            components = json.loads(case.get("investment_components") or "[]")
        except json.JSONDecodeError:
            components = []
            add_flag(flags, case, "INVESTMENT_COMPONENT_JSON_INVALID", "critical", evidence=case.get("investment_components", ""))
        normalized: list[dict[str, Any]] = []
        for index, component in enumerate(components, 1):
            label = str(component.get("label") or f"内訳{index}")
            ctype, confidence = component_type(label)
            amount, source_key, source_unit = normalized_component_amount(component)
            subsidy = number(component.get("subsidy_million_yen"))
            row = {
                "case_id": case["case_id"], "round": case.get("round", ""), "company": case.get("company", ""),
                "component_id": f"{case['case_id']}_investment_{index}", "component_index": index,
                "component_label": label, "component_type": ctype, "classification_confidence": confidence,
                "entity_name": label if ctype == "entity_or_participant" else "",
                "entity_relation": relation_from_text(label, "participant") if ctype == "entity_or_participant" else "",
                "amount_value_raw": raw_component_value(component, source_key), "amount_unit_raw": source_unit,
                "project_cost_million_yen_normalized": amount, "subsidy_million_yen_normalized": subsidy,
                "included_in_representative_total": False, "source_page": component.get("page", case.get("cost_page", "")),
                "raw_evidence": component.get("raw_evidence", ""),
                "source_json": json.dumps(component, ensure_ascii=False, separators=(",", ":")),
                "pdf_url": case.get("pdf_url", ""),
            }
            normalized.append(row)
        rep = number(case.get("project_cost_million_yen_normalized")) or number(case.get("project_cost_million_yen"))
        non_total = [r for r in normalized if r["component_type"] != "total" and r["project_cost_million_yen_normalized"] is not None]
        non_total_sum = sum(r["project_cost_million_yen_normalized"] for r in non_total)
        if non_total and close(non_total_sum, rep):
            for row in non_total:
                row["included_in_representative_total"] = True
        for row in normalized:
            if row["component_type"] == "total" and close(row["project_cost_million_yen_normalized"], rep):
                row["included_in_representative_total"] = True
        component_rows.extend(normalized)
        explicit_projects = [r for r in normalized if r["component_type"] in {"entity_or_participant", "project_or_location"}]
        count = len(explicit_projects) if explicit_projects else 1
        method = "explicit_entity_or_location_components" if explicit_projects else "single_overall_project_inferred"
        text = "\n".join([
            narrative_text.get(case["case_id"], ""), case.get("other_participants", ""),
            case.get("manual_audit_notes", ""), case.get("cost_box_transcription", ""),
        ])
        possible_multiple = bool(re.search(r"複数(?:の)?(?:投資|案件|拠点|工場)|[二三四五２３４５2-5](?:件|拠点|工場|事業)", text))
        has_multiple = count >= 2
        review_multiple = possible_multiple and not has_multiple
        component_summary[case["case_id"]] = {"count": count, "method": method, "has_multiple": has_multiple, "review": review_multiple}
        if has_multiple:
            add_flag(flags, case, "MULTIPLE_INVESTMENT_COMPONENTS", "info", status="resolved",
                     value_normalized=count, evidence="; ".join(r["component_label"] for r in explicit_projects),
                     resolution_note="代表事業費は同一申請内の合計値を使用")
        elif review_multiple:
            add_flag(flags, case, "MULTIPLE_INVESTMENT_REVIEW_REQUIRED", "warning", evidence="本文に複数案件を示唆する表現あり")

        candidates = extract_money_candidates(case)
        cost_candidates.extend(candidates)
        grouped_values: dict[str, set[float]] = defaultdict(set)
        mismatch_types: list[str] = []
        rounding_types: list[str] = []
        for item in candidates:
            ctype = item["candidate_type"]
            val = item["value_million_yen_normalized"]
            if val is not None and ctype in {"project_cost", "subsidy", "eligible_cost"}:
                grouped_values[ctype].add(round(val, 6))
            if ctype in {"project_cost", "subsidy"} and item["matches_representative"] is False:
                value = item["value_million_yen_normalized"]
                rep_value = item["project_cost_representative_million_yen"] if ctype == "project_cost" else item["subsidy_representative_million_yen"]
                if value is not None and rep_value is not None and abs(value - rep_value) <= max(50, abs(rep_value) * 0.01):
                    rounding_types.append(ctype)
                else:
                    mismatch_types.append(ctype)
        primary_candidates = [x for x in candidates if x["candidate_type"] in {"project_cost", "subsidy"}]
        matched_types = {x["candidate_type"] for x in primary_candidates if x["matches_representative"] is True}
        unmatched_types = set(mismatch_types)
        conflict_hint = bool(re.search(r"不一致|差異|異なる|別範囲|明細(?:表)?(?:は|の|:|：)?合計|拠点別.{0,8}合計|投資会社別明細合計|内訳合計", case.get("cost_box_transcription", "")))
        mismatch = any(t not in matched_types for t in unmatched_types) or bool(unmatched_types & matched_types and conflict_hint)
        multiple_cost_values = any(len(values) > 1 for values in grouped_values.values())
        if mismatch:
            add_flag(flags, case, "COST_TEXT_NUMERIC_MISMATCH", "critical",
                     value_normalized=rep, alternative_value="; ".join(f"{x['candidate_type']}={x['value_million_yen_normalized']}" for x in primary_candidates),
                     source_page=case.get("cost_page", ""), evidence=case.get("cost_box_transcription", ""),
                     resolution_note="本文・Box候補と代表値を併存。分析前にcost_amount_candidates.csvで確認")
        elif rounding_types:
            add_flag(flags, case, "COST_TEXT_NUMERIC_ROUNDING_DIFFERENCE", "warning", status="resolved_with_tolerance",
                     value_normalized=rep, alternative_value="; ".join(f"{x['candidate_type']}={x['value_million_yen_normalized']}" for x in primary_candidates),
                     source_page=case.get("cost_page", ""), evidence=case.get("cost_box_transcription", ""),
                     resolution_note="差は代表値の1%または50百万円以内。丸め・精度差として保持")
        if multiple_cost_values:
            add_flag(flags, case, "MULTIPLE_COST_VALUES_PRESENT", "warning", status="open_context_check",
                     evidence="; ".join(f"{k}:{sorted(v)}" for k, v in grouped_values.items() if len(v) > 1),
                     resolution_note="総投資額・補助対象経費・内訳の概念差を確認")

    # Enrich metric rate semantics before deriving case-level summaries.
    for row in metrics:
        row.update({key: scalar(value) for key, value in metric_rate_metadata(row).items()})
        case = case_by_id[row["case_id"]]
        if truthy(row["rate_ambiguous"]):
            add_flag(flags, case, "RATE_DEFINITION_AMBIGUOUS", "critical", "metrics", row.get("metric_key") or row.get("metric"),
                     row.get("metric_key", ""), value_raw=row.get("rate_value_raw", ""), source_page=row.get("page", ""),
                     source_box_label=row.get("source_box_label", ""), evidence=row.get("raw", ""),
                     resolution_note=row.get("rate_interpretation_note", ""))
        if row.get("rate_reconciliation_status") == "mismatch":
            add_flag(flags, case, "RATE_ARITHMETIC_MISMATCH", "critical", "metrics", row.get("metric_key") or row.get("metric"),
                     row.get("metric_key", ""), value_raw=row.get("listed_rate_pct", ""),
                     alternative_value=row.get("calculated_rate_pct", ""), source_page=row.get("page", ""),
                     source_box_label=row.get("source_box_label", ""), evidence=row.get("raw", ""),
                     resolution_note="PDF記載率と基準値・目標値・期間からの計算率が1ポイント超相違")
        if row.get("unit_validation") == "unit_missing_or_unsupported" and (row.get("base_value") or row.get("target_value")):
            add_flag(flags, case, "UNIT_AMBIGUOUS", "critical", "metrics", row.get("metric_key") or row.get("metric"),
                     row.get("metric_key", ""), value_raw=row.get("unit_raw", ""), value_normalized=row.get("normalized_unit", ""),
                     source_page=row.get("page", ""), evidence=row.get("raw", ""))
        methods = {row.get("base_year_correction_method", ""), row.get("target_year_correction_method", "")}
        if methods & AMBIGUOUS_YEAR_METHODS and (row.get("base_value") or row.get("target_value")):
            add_flag(flags, case, "PERIOD_AMBIGUOUS", "warning", "metrics", row.get("metric_key") or row.get("metric"),
                     row.get("metric_key", ""), value_raw=f"{row.get('base_period_label','')} -> {row.get('target_period_label','')}",
                     value_normalized=f"{row.get('base_year_after_correction','')} -> {row.get('target_year_after_correction','')}",
                     source_page=row.get("page", ""), evidence=row.get("raw", ""))

    for row in sales:
        row.update({key: scalar(value) for key, value in sales_rate_metadata(row).items()})
        case = case_by_id[row["case_id"]]
        if truthy(row["rate_ambiguous"]):
            add_flag(flags, case, "RATE_DEFINITION_AMBIGUOUS", "critical", "sales_series", row.get("series_id", ""), "sales",
                     value_raw=row.get("stated_rate_pct", ""), alternative_value="increase_rate / target_base_ratio / cagr",
                     source_page=row.get("page", ""), evidence=row.get("raw_fragment", ""),
                     resolution_note=row.get("rate_interpretation_note", ""))
        if "不整合" in row.get("arithmetic_status", ""):
            add_flag(flags, case, "SALES_ARITHMETIC_MISMATCH", "critical", "sales_series", row.get("series_id", ""), "sales",
                     value_raw=row.get("stated_rate_pct", ""), value_normalized=row.get("growth_rate_pct", ""),
                     source_page=row.get("page", ""), evidence=row.get("raw_fragment", ""))
        methods = {row.get("baseline_year_correction_method", ""), row.get("target_year_correction_method", "")}
        if methods & AMBIGUOUS_YEAR_METHODS and (row.get("baseline_sales_oku") or row.get("target_sales_oku")):
            add_flag(flags, case, "PERIOD_AMBIGUOUS", "warning", "sales_series", row.get("series_id", ""), "sales",
                     value_raw=f"{row.get('baseline_period_label','')} -> {row.get('target_period_label','')}",
                     value_normalized=f"{row.get('baseline_year_after_correction','')} -> {row.get('target_year_after_correction','')}",
                     source_page=row.get("page", ""), evidence=row.get("raw_fragment", ""))

    # Entity table: applicant, named participants, sales-series entities, and entity-labelled investments.
    for case in cases:
        seen: set[tuple[str, str, str]] = set()
        candidates: list[dict[str, Any]] = [{
            "entity_name": case.get("company", ""), "entity_relation": "applicant", "source_type": "cases.company",
            "appears_in_sales_metric": any(r.get("entity_relation") == "applicant" for r in sales_by_case[case["case_id"]]),
            "appears_in_labor_metric": any(r.get("entity_match_status") == "applicant_company_representative" for r in metrics_by_case[case["case_id"]]),
            "appears_in_cost": True, "source_page": "", "raw_evidence": case.get("company", ""),
        }]
        for participant in split_participants(case.get("other_participants", "")):
            candidates.append({"entity_name": participant, "entity_relation": relation_from_text(participant),
                               "source_type": "cases.other_participants", "appears_in_sales_metric": False,
                               "appears_in_labor_metric": False, "appears_in_cost": False, "source_page": "",
                               "raw_evidence": case.get("other_participants", "")})
        for row in sales_by_case[case["case_id"]]:
            name = row.get("source_entity_label") or row.get("series_label") or case.get("company", "")
            candidates.append({"entity_name": name, "entity_relation": row.get("entity_relation") or row.get("scope") or "unknown",
                               "source_type": "sales_series", "appears_in_sales_metric": True,
                               "appears_in_labor_metric": False, "appears_in_cost": False, "source_page": row.get("page", ""),
                               "raw_evidence": row.get("raw_fragment", "")})
        for row in component_rows:
            if row["case_id"] == case["case_id"] and row["entity_name"]:
                candidates.append({"entity_name": row["entity_name"], "entity_relation": row["entity_relation"],
                                   "source_type": "investment_components", "appears_in_sales_metric": False,
                                   "appears_in_labor_metric": False, "appears_in_cost": True, "source_page": row["source_page"],
                                   "raw_evidence": row["raw_evidence"] or row["component_label"]})
        full_text = "\n".join([narrative_text.get(case["case_id"], ""), case.get("other_participants", ""), case.get("manual_audit_notes", "")])
        consortium_evidence_text = "\n".join([case.get("scope", ""), case.get("other_participants", ""),
                                                 case.get("manual_audit_notes", ""), case.get("cost_box_transcription", "")])
        for keyword, relation in [("親会社", "parent"), ("子会社", "subsidiary"), ("関連会社", "affiliate"), ("関係会社", "affiliate")]:
            if keyword in full_text and not any(c["entity_relation"] == relation for c in candidates):
                candidates.append({"entity_name": "名称未特定", "entity_relation": relation, "source_type": "narrative_keyword",
                                   "appears_in_sales_metric": False, "appears_in_labor_metric": False,
                                   "appears_in_cost": False, "source_page": "", "raw_evidence": keyword})
        for item in candidates:
            key = (item["entity_name"], item["entity_relation"], item["source_type"])
            if key in seen:
                continue
            seen.add(key)
            entity_rows.append({
                "case_id": case["case_id"], "round": case.get("round", ""), "company": case.get("company", ""),
                "entity_id": f"{case['case_id']}_entity_{len(seen)}", **item,
                "is_applicant": item["entity_relation"] == "applicant",
                "is_consortium_member": item["entity_relation"] in {"consortium_member", "participant"} and bool(re.search(r"コンソーシアム|共同申請", consortium_evidence_text)),
                "pdf_url": case.get("pdf_url", ""),
            })

    entities_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in entity_rows:
        entities_by_case[row["case_id"]].append(row)

    # Case-level summaries and corresponding informational flags.
    flags_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in flags:
        flags_by_case[row["case_id"]].append(row)
    for case in cases:
        cid = case["case_id"]
        relations = {r.get("entity_relation", "") for r in sales_by_case[cid] if r.get("entity_relation")}
        full_text = "\n".join([narrative_text.get(cid, ""), case.get("other_participants", ""), case.get("scope", "")])
        consortium_evidence_text = "\n".join([case.get("scope", ""), case.get("other_participants", ""),
                                                 case.get("manual_audit_notes", ""), case.get("cost_box_transcription", "")])
        metric_consortium = any(r.get("entity_match_status") == "consortium_participant" for r in metrics_by_case[cid])
        has_consortium = bool(re.search(r"コンソーシアム|共同申請", consortium_evidence_text)) or metric_consortium or any(truthy(x["is_consortium_member"]) for x in entities_by_case[cid])
        consortium_members = {x["entity_name"] for x in entities_by_case[cid] if truthy(x["is_consortium_member"]) and x["entity_name"] != "名称未特定"}
        if has_consortium:
            add_flag(flags, case, "CONSORTIUM_APPLICATION", "info", status="resolved", value_normalized=len(consortium_members),
                     evidence=case.get("other_participants", "") or "コンソーシアム・共同申請の記載あり")
        parent = "親会社" in full_text or any(x["entity_relation"] == "parent" for x in entities_by_case[cid])
        subsidiary = "子会社" in full_text or "subsidiary" in relations or any(x["entity_relation"] == "subsidiary" for x in entities_by_case[cid])
        affiliate = bool(re.search(r"関連会社|関係会社|グループ会社", full_text)) or "affiliate" in relations
        series_count = len(sales_by_case[cid])
        mixed = len(relations) > 1 or any(x not in {"applicant"} for x in relations)
        representative_ambiguous = truthy(case.get("sales_representative_review_required")) or not case.get("sales_representative_series_id")
        if series_count > 1:
            add_flag(flags, case, "MULTIPLE_SALES_SERIES", "warning", status="resolved" if not representative_ambiguous else "unresolved",
                     value_normalized=series_count, evidence="; ".join(f"{r.get('series_id')}:{r.get('entity_relation')}" for r in sales_by_case[cid]),
                     resolution_note=f"代表系列={case.get('sales_representative_series_id','未確定')}")
        if mixed:
            add_flag(flags, case, "MIXED_ENTITY_METRICS", "warning", status="resolved" if not representative_ambiguous else "unresolved",
                     evidence=", ".join(sorted(relations)))
        if representative_ambiguous:
            add_flag(flags, case, "REPRESENTATIVE_ENTITY_AMBIGUOUS", "critical", value_raw=case.get("sales_representative_series_id", ""),
                     evidence=case.get("sales_representative_reason", ""), resolution_note="申請企業自身の比較系列をPDFで再確認")
        if str(case.get("manual_audit_confidence", "")).lower() not in {"high", ""}:
            add_flag(flags, case, "OCR_OR_VISUAL_UNCERTAINTY", "warning", status="open_context_check",
                     value_raw=case.get("manual_audit_confidence", ""), evidence=case.get("manual_audit_notes", ""))

        # Refresh after adding case-level flags.
        case_flags = [x for x in flags if x["case_id"] == cid]
        codes = {x["flag_code"] for x in case_flags if x["status"] != "resolved" or x["severity"] == "critical"}
        critical = [x for x in case_flags if x["severity"] == "critical" and x["status"] != "resolved"]
        reasons = sorted({x["flag_code"] for x in critical})
        comp = component_summary[cid]
        case.update({
            "has_multiple_investments": comp["has_multiple"],
            "investment_component_count": comp["count"],
            "investment_component_count_method": comp["method"],
            "multiple_investment_review_required": comp["review"],
            "cost_text_numeric_mismatch": "COST_TEXT_NUMERIC_MISMATCH" in {x["flag_code"] for x in case_flags},
            "cost_multiple_values_present": "MULTIPLE_COST_VALUES_PRESENT" in {x["flag_code"] for x in case_flags},
            "has_consortium": has_consortium,
            "consortium_member_count": len(consortium_members),
            "has_parent_company_reference": parent,
            "has_subsidiary_reference": subsidiary,
            "has_related_company_reference": affiliate,
            "has_multiple_sales_series": series_count > 1,
            "sales_series_count": series_count,
            "has_mixed_entity_metrics": mixed,
            "representative_entity_ambiguous": representative_ambiguous,
            "has_ambiguous_rate_any": "RATE_DEFINITION_AMBIGUOUS" in {x["flag_code"] for x in case_flags},
            "ambiguous_rate_count": sum(x["flag_code"] == "RATE_DEFINITION_AMBIGUOUS" for x in case_flags),
            "has_period_ambiguity_any": "PERIOD_AMBIGUOUS" in {x["flag_code"] for x in case_flags},
            "has_unit_ambiguity_any": "UNIT_AMBIGUOUS" in {x["flag_code"] for x in case_flags},
            "has_arithmetic_mismatch_any": bool({"RATE_ARITHMETIC_MISMATCH", "SALES_ARITHMETIC_MISMATCH"} & {x["flag_code"] for x in case_flags}),
            "has_ocr_uncertainty_any": "OCR_OR_VISUAL_UNCERTAINTY" in {x["flag_code"] for x in case_flags},
            "analysis_exclusion_recommended": bool(critical),
            "analysis_exclusion_reasons": "|".join(reasons),
            "quality_flag_count": len(case_flags),
            "critical_quality_flag_count": len(critical),
        })

    # Stable sort and outputs.
    flags.sort(key=lambda r: (r["case_id"], r["severity"], r["flag_code"], r["subject_id"]))
    component_rows.sort(key=lambda r: (r["case_id"], r["component_index"]))
    entity_rows.sort(key=lambda r: (r["case_id"], r["entity_id"]))
    cost_candidates.sort(key=lambda r: (r["case_id"], r["candidate_id"]))
    write_csv(PROCESSED / "cases.csv", cases, case_fields + [x for x in CASE_FLAG_FIELDS if x not in case_fields])
    write_csv(PROCESSED / "metrics.csv", metrics, metric_fields + [x for x in METRIC_RATE_FIELDS if x not in metric_fields])
    write_csv(PROCESSED / "sales_series.csv", sales, sales_fields + [x for x in SALES_RATE_FIELDS if x not in sales_fields])
    write_csv(PROCESSED / "investment_components.csv", component_rows, [
        "case_id", "round", "company", "component_id", "component_index", "component_label", "component_type",
        "classification_confidence", "entity_name", "entity_relation", "amount_value_raw", "amount_unit_raw",
        "project_cost_million_yen_normalized", "subsidy_million_yen_normalized", "included_in_representative_total",
        "source_page", "raw_evidence", "source_json", "pdf_url",
    ])
    write_csv(PROCESSED / "case_entities.csv", entity_rows, [
        "case_id", "round", "company", "entity_id", "entity_name", "entity_relation", "is_applicant",
        "is_consortium_member", "appears_in_sales_metric", "appears_in_labor_metric", "appears_in_cost",
        "source_type", "source_page", "raw_evidence", "pdf_url",
    ])
    write_csv(PROCESSED / "cost_amount_candidates.csv", cost_candidates, [
        "case_id", "round", "company", "candidate_id", "candidate_type", "classification_confidence",
        "value_raw", "unit_raw", "value_million_yen_normalized", "project_cost_representative_million_yen",
        "subsidy_representative_million_yen", "difference_from_representative_million_yen", "matches_representative",
        "context", "source_page", "source_field", "pdf_url",
    ])
    write_csv(PROCESSED / "quality_flags.csv", flags, [
        "case_id", "round", "company", "subject_table", "subject_id", "metric_key", "flag_code", "severity",
        "status", "value_raw", "value_normalized", "alternative_value", "source_page", "source_box_label",
        "evidence", "resolution_note",
    ])

    flags_by_case = defaultdict(list)
    for flag in flags:
        flags_by_case[flag["case_id"]].append(flag)
    if HTML_CASES.exists():
        html_rows = json.loads(HTML_CASES.read_text(encoding="utf-8-sig"))
        for row in html_rows:
            case = case_by_id.get(row.get("case_id"))
            if case:
                for field in CASE_FLAG_FIELDS:
                    row[field] = case.get(field, "")
                row["quality_flags"] = flags_by_case.get(row["case_id"], [])
        HTML_CASES.write_text(json.dumps(html_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "cases": len(cases), "sales_series": len(sales), "metrics": len(metrics),
        "investment_components": len(component_rows), "case_entities": len(entity_rows),
        "cost_amount_candidates": len(cost_candidates), "quality_flags": len(flags),
        "flag_counts": dict(sorted(Counter(x["flag_code"] for x in flags).items())),
        "cases_exclusion_recommended": sum(truthy(x["analysis_exclusion_recommended"]) for x in cases),
    }
    (PROCESSED / "analysis_quality_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
