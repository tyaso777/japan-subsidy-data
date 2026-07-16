#!/usr/bin/env python3
"""Add raw/normalized units and relink metrics to their source boxes.

Run after the manual visual-audit integration step. Existing canonical numeric
columns are preserved for compatibility; explicit raw-unit and normalized
columns are added alongside them.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path


MONETARY_METRICS = {"labor", "employee_pay", "officer_pay"}
METRIC_LABELS = {
    "labor": ["労働生産性"],
    "employee_pay": ["従業員1人当たり給与支給総額", "従業員1人あたり給与支給総額"],
    "officer_pay": ["役員1人当たり給与支給総額", "役員1人あたり給与支給総額"],
    "employees": ["補助事業に係る従業員数"],
}
METRIC_ORDER = ["labor", "employee_pay", "officer_pay", "employees"]
UNIT_TO_MAN = {"万円/人": 1.0, "千円/人": 0.1, "円/人": 0.0001}
MONEY_TO_MILLION = {"億円": 100.0, "百万円": 1.0, "万円": 0.01, "千円": 0.001, "円": 0.000001}
MONEY_TO_OKU = {"億円": 1.0, "百万円": 0.01, "万円": 0.0001, "千円": 0.00001, "円": 0.00000001}


def read_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore", lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def insert_after(columns: list[str], anchor: str, additions: list[str]) -> list[str]:
    result = [column for column in columns if column not in additions]
    index = result.index(anchor) + 1 if anchor in result else len(result)
    return result[:index] + additions + result[index:]


def base_metric_key(key: str) -> str:
    for candidate in METRIC_ORDER:
        if key == candidate or key.startswith(candidate + "_"):
            return candidate
    return key


def numeric(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def clean_number(value):
    if value is None:
        return ""
    if math.isclose(value, round(value), abs_tol=1e-10):
        return int(round(value))
    return round(value, 8)


def compact(text: str) -> str:
    return re.sub(r"[ \t\u3000]+", "", str(text or "")).replace("１", "1")


def find_metric_box(metric: dict, boxes_by_case_page: dict) -> dict | None:
    candidates = boxes_by_case_page.get((metric["case_id"], str(metric.get("page") or "")), [])
    preferred = [box for box in candidates if box.get("box_type") == "project_targets"]
    return (preferred or candidates or [None])[0]


def metric_unit_evidence(metric: dict, box: dict | None) -> tuple[str, str, str]:
    key = base_metric_key(metric.get("metric_key", ""))
    if box is None:
        return "", "no_box_match", ""
    text = compact(box.get("box_content") or box.get("text") or "")
    normalized_text = text.replace("当り", "当たり")
    anchors = []
    for metric_key in METRIC_ORDER:
        for label in METRIC_LABELS[metric_key]:
            position = normalized_text.find(compact(label).replace("当り", "当たり"))
            if position >= 0:
                anchors.append((position, metric_key))
    anchors.sort()
    starts = [position for position, metric_key in anchors if metric_key == key]
    if starts:
        start = starts[0]
        later = [position for position, _ in anchors if position > start]
        end = min(later) if later else min(len(normalized_text), start + 350)
        segment = normalized_text[start:end]
        if key == "employees":
            if re.search(r"(?:単位[:：]?)?[（(]?人[）)]?", segment):
                return "人", "box_metric_row", segment[:240]
        else:
            match = re.search(r"(万円|千円|円)[/／]人", segment)
            if match:
                return match.group(1) + "/人", "box_metric_row", segment[:240]
    if key in MONETARY_METRICS:
        units = set(match.group(1) + "/人" for match in re.finditer(r"(万円|千円|円)[/／]人", normalized_text))
        if len(units) == 1:
            return next(iter(units)), "box_uniform_unit", normalized_text[:240]
    elif key == "employees" and "従業員数" in normalized_text:
        return "人", "box_uniform_unit", normalized_text[:240]
    return "", "unit_not_found_in_box", normalized_text[:240]


def replace_unit_in_raw(raw: str, old_unit: str, new_unit: str) -> str:
    if not raw or not old_unit or not new_unit or old_unit == new_unit:
        return raw
    old_word = old_unit.replace("/人", "")
    new_word = new_unit.replace("/人", "")
    return raw.replace(old_unit, new_unit).replace(old_word, new_word)


def money_candidates(text: str, factor_map: dict[str, float]) -> list[dict]:
    candidates = []
    pattern = re.compile(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(億円|百万円|万円|千円|円)")
    for match in pattern.finditer(str(text or "")):
        raw_value = float(match.group(1).replace(",", ""))
        raw_unit = match.group(2)
        candidates.append({
            "raw_value": raw_value,
            "raw_text": match.group(1).replace(",", ""),
            "raw_unit": raw_unit,
            "normalized": raw_value * factor_map[raw_unit],
            "start": match.start(),
            "fragment": match.group(0),
        })
    return candidates


def closest_candidate(text: str, current_value, factor_map: dict[str, float], label_pattern: str = "") -> tuple[dict | None, str]:
    current = numeric(current_value)
    if current is None:
        return None, "normalized_value_missing"
    candidates = money_candidates(text, factor_map)
    if not candidates:
        return None, "raw_unit_not_found"
    if label_pattern:
        label_matches = list(re.finditer(label_pattern, str(text or "")))
        if label_matches:
            distances = []
            for candidate in candidates:
                distance = min(abs(candidate["start"] - match.end()) for match in label_matches)
                distances.append((distance, candidate))
            nearby = [candidate for distance, candidate in distances if distance <= 90]
            if nearby:
                candidates = nearby
    selected = min(candidates, key=lambda item: abs(item["normalized"] - current))
    difference = abs(selected["normalized"] - current)
    tolerance = max(0.05, abs(current) * 0.01)
    return selected, "raw_unit_confirmed" if difference <= tolerance else "multiple_or_inconsistent_amounts"


def significant_digits(value) -> int:
    text = re.sub(r"[^0-9.]", "", str(value or ""))
    digits = text.replace(".", "").lstrip("0").rstrip("0")
    return len(digits)


def choose_normalized_precision(current_value, candidate: dict | None) -> tuple[object, str]:
    if candidate is None:
        return current_value, "normalized_existing_only"
    current = numeric(current_value)
    if current is None:
        return clean_number(candidate["normalized"]), "normalized_from_raw_only"
    if significant_digits(candidate.get("raw_text", candidate["raw_value"])) > significant_digits(current_value):
        return clean_number(candidate["normalized"]), "normalized_from_raw_more_precise"
    return clean_number(current), "normalized_existing_more_precise_or_equal"


def explicit_sales_increase(text: str) -> list[dict]:
    factor_map = MONEY_TO_OKU
    patterns = [
        re.compile(r"(?:売上高)?増加(?:額)?[^0-9]{0,40}([0-9][0-9,]*(?:\.[0-9]+)?)\s*(億円|百万円|万円|千円|円)"),
        re.compile(r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(億円|百万円|万円|千円|円)(?:増|の増加)"),
    ]
    result = []
    for pattern in patterns:
        for match in pattern.finditer(str(text or "")):
            raw_value = float(match.group(1).replace(",", ""))
            raw_unit = match.group(2)
            result.append({
                "raw_value": raw_value,
                "raw_unit": raw_unit,
                "normalized": raw_value * factor_map[raw_unit],
                "fragment": match.group(0),
            })
    return result


def choose_sales_increase(series: dict, sales_box_text: str, allow_box: bool) -> tuple[dict | None, str]:
    current = numeric(series.get("increase_oku"))
    if current is None:
        return None, "increase_not_available"
    candidates = explicit_sales_increase(series.get("raw_fragment", ""))
    source = "series_raw_fragment"
    if not candidates:
        raw_candidates = money_candidates(series.get("raw_fragment", ""), MONEY_TO_OKU)
        exact_tolerance = max(0.000001, abs(current) * 0.000001)
        candidates = [candidate for candidate in raw_candidates if abs(candidate["normalized"] - current) <= exact_tolerance]
        source = "series_raw_value_match"
        if not candidates:
            derived = []
            for left_index, left in enumerate(raw_candidates):
                for right in raw_candidates[left_index + 1:]:
                    if left["raw_unit"] != right["raw_unit"]:
                        continue
                    difference = abs(right["raw_value"] - left["raw_value"])
                    normalized = difference * MONEY_TO_OKU[left["raw_unit"]]
                    if abs(normalized - current) <= max(0.000001, abs(current) * 0.0001):
                        derived.append({
                            "raw_value": difference,
                            "raw_unit": left["raw_unit"],
                            "normalized": normalized,
                            "fragment": f"{left['fragment']}→{right['fragment']}の差分",
                        })
            candidates = derived
            source = "series_derived_difference"
        if not candidates:
            global_units = set(re.findall(r"億円|百万円|万円|千円|円", str(series.get("raw_fragment", ""))))
            if len(global_units) == 1:
                raw_unit = next(iter(global_units))
                candidates = [{
                    "raw_value": current / MONEY_TO_OKU[raw_unit],
                    "raw_unit": raw_unit,
                    "normalized": current,
                    "fragment": f"系列原文の共通単位 {raw_unit}",
                }]
                source = "series_global_unit"
    if not candidates and allow_box and str(series.get("is_applicant_representative", "")).lower() == "true":
        candidates = explicit_sales_increase(sales_box_text)
        source = "sales_target_box"
    if not candidates:
        return None, "explicit_increase_unit_not_found"
    selected = min(candidates, key=lambda item: abs(item["normalized"] - current))
    tolerance = max(0.05, abs(current) * 0.01)
    if abs(selected["normalized"] - current) > tolerance:
        status = "stated_value_differs_or_scope_ambiguous"
    elif source == "series_derived_difference":
        status = "derived_difference_match"
    elif source == "series_raw_value_match":
        status = "raw_value_unit_match"
    elif source == "series_global_unit":
        status = "global_unit_match"
    else:
        status = "explicit_unit_match"
    return selected, f"{status}:{source}"


def update_qa_data(qa_path: Path, cases: list[dict]) -> None:
    html = qa_path.read_text(encoding="utf-8")
    start = html.find("const DATA=")
    end = html.find(";\n", start)
    if start < 0 or end < 0:
        raise RuntimeError("Could not locate embedded DATA in qa.html")
    payload = json.dumps(cases, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = html[:start] + "const DATA=" + payload + html[end:]
    metric_table = r'''function metricTable(rows){return '<table><thead><tr><th>指標・原単位</th><th>基準期・原値</th><th>目標期・原値</th><th>万円換算値</th><th>年平均率</th><th>監査・出典</th></tr></thead><tbody>'+rows.map(m=>'<tr><td><b>'+esc(m.metric)+'</b><br><small>'+esc(m.unit_raw||m.unit||'')+'</small><br><small>'+esc(m.entity_match_status||'')+'</small></td><td>'+esc(m.base_period_label||'記載なし')+'<br><small>補正前 '+val(m.base_year_before_correction)+' → 補正後 '+val(m.base_year_after_correction)+'</small><br><b>'+val(m.base_value_raw??m.base_value)+'</b></td><td>'+esc(m.target_period_label||'記載なし')+'<br><small>補正前 '+val(m.target_year_before_correction)+' → 補正後 '+val(m.target_year_after_correction)+'</small><br><b>'+val(m.target_value_raw??m.target_value)+'</b></td><td class="num">'+(m.normalized_unit==='万円/人'?(val(m.base_value_man_yen_per_person)+' → '+val(m.target_value_man_yen_per_person)+'<br><small>万円/人・係数 '+val(m.unit_conversion_factor)+'</small>'):(m.normalized_unit==='人'?(val(m.base_value_raw)+' → '+val(m.target_value_raw)+' 人'):'—'))+'</td><td class="num">'+(m.listed_rate_pct==null?'—':num(m.listed_rate_pct)+'%')+'</td><td class="status">'+esc(m.validation||m.status)+'<br><small>'+esc(m.unit_validation||'')+'</small><br><small>'+esc(m.source_box_label||m.source_box_type||'Box未対応')+'</small><br><button class="source" data-page="'+(m.page||1)+'">p.'+(m.page||1)+'</button><details><summary>表の原文</summary><div class="raw">'+esc(m.raw||'')+'</div></details></td></tr>').join('')+'</tbody></table>'}'''
    html, metric_count = re.subn(r"function metricTable\(rows\)\{[\s\S]*?\}\nfunction salesSeriesTable", metric_table + "\nfunction salesSeriesTable", html, count=1)
    if metric_count != 1:
        raise RuntimeError("Could not replace metricTable in qa.html")
    sales_table = r'''function salesSeriesTable(rows){return '<table><thead><tr><th>系列</th><th>基準期・売上</th><th>目標期・売上</th><th>増加額（原表記）</th><th>増加額（億円換算）</th><th>成長率 / CAGR</th><th>検証</th></tr></thead><tbody>'+rows.map(s=>'<tr><td><span class="pill '+(s.is_applicant_representative?'ok':'')+'">'+esc(s.series_role)+'</span><br><b>'+esc(s.series_label)+'</b><br><small>'+esc(s.extraction_method)+'</small></td><td>'+esc(s.baseline_period_label||'記載なし')+'<br><small>'+val(s.baseline_year_before_correction)+' → '+val(s.baseline_year_after_correction)+'</small><br><b>'+num(s.baseline_sales_oku)+'億円</b></td><td>'+esc(s.target_period_label||'記載なし')+'<br><small>'+val(s.target_year_before_correction)+' → '+val(s.target_year_after_correction)+'</small><br><b>'+num(s.target_sales_oku)+'億円</b></td><td class="num">'+val(s.increase_value_raw)+' '+esc(s.increase_unit_raw||'')+'<br><small>'+esc(s.increase_unit_source||'')+'</small></td><td class="num">'+num(s.increase_oku_normalized??s.increase_oku)+'億円<br><small>'+esc(s.increase_unit_validation||'')+'</small></td><td class="num">'+num(s.growth_rate_pct)+'%<br><small>CAGR '+num(s.cagr_pct)+'%</small></td><td><span class="pill '+(s.review_required?'issue':'ok')+'">'+(s.review_required?'要確認':esc(s.arithmetic_status))+'</span><br><button class="source" data-page="'+(s.page||1)+'">p.'+(s.page||1)+'</button><details><summary>系列原文</summary><div class="raw">'+esc(s.raw_fragment)+'</div></details></td></tr>').join('')+'</tbody></table>'}'''
    html, sales_count = re.subn(r"function salesSeriesTable\(rows\)\{[\s\S]*?\}\nfunction salesSeriesHtml", sales_table + "\nfunction salesSeriesHtml", html, count=1)
    if sales_count != 1:
        raise RuntimeError("Could not replace salesSeriesTable in qa.html")
    project_old = "<div class=\"kv\"><label>事業費</label><b>'+num(r.project_cost_million_yen)+' 百万円</b></div>"
    project_previous = "<div class=\"kv\"><label>事業費（原表記）</label><b>'+val(r.project_cost_value_raw)+' '+esc(r.project_cost_unit_raw||'')+'</b><small>正規化 '+num(r.project_cost_million_yen_normalized??r.project_cost_million_yen)+' 百万円</small></div>"
    project_new = "<div class=\"kv\"><label>事業費（原表記）</label><b>'+val(r.project_cost_value_raw)+' '+esc(r.project_cost_unit_raw||'')+'</b><small>単純換算 '+num(r.project_cost_raw_converted_million_yen)+' / 採用値 '+num(r.project_cost_million_yen_normalized??r.project_cost_million_yen)+' 百万円</small></div>"
    html = html.replace(project_old, project_new).replace(project_previous, project_new)
    subsidy_old = "<div class=\"kv\"><label>補助額</label><b>'+num(r.subsidy_million_yen)+' 百万円</b></div>"
    subsidy_previous = "<div class=\"kv\"><label>補助額（原表記）</label><b>'+val(r.subsidy_value_raw)+' '+esc(r.subsidy_unit_raw||'')+'</b><small>正規化 '+num(r.subsidy_million_yen_normalized??r.subsidy_million_yen)+' 百万円</small></div>"
    subsidy_new = "<div class=\"kv\"><label>補助額（原表記）</label><b>'+val(r.subsidy_value_raw)+' '+esc(r.subsidy_unit_raw||'')+'</b><small>単純換算 '+num(r.subsidy_raw_converted_million_yen)+' / 採用値 '+num(r.subsidy_million_yen_normalized??r.subsidy_million_yen)+' 百万円</small></div>"
    html = html.replace(subsidy_old, subsidy_new).replace(subsidy_previous, subsidy_new)
    qa_path.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    processed = root / "data" / "processed"

    metrics, metric_columns = read_csv(processed / "metrics.csv")
    boxes, _ = read_csv(processed / "boxes.csv")
    cases, case_columns = read_csv(processed / "cases.csv")
    sales_series, sales_columns = read_csv(processed / "sales_series.csv")
    cost_rows, cost_columns = read_csv(processed / "cost_validations.csv")
    html_cases = json.loads((root / "html" / "data" / "cases.json").read_text(encoding="utf-8"))

    boxes_by_case_page = defaultdict(list)
    sales_box_by_case = defaultdict(str)
    for box in boxes:
        boxes_by_case_page[(box["case_id"], str(box.get("page") or ""))].append(box)
        if box.get("box_type") == "sales_target":
            sales_box_by_case[box["case_id"]] += "\n" + (box.get("box_content") or box.get("text") or "")

    changes_path = processed / "unit_normalization_changes.csv"
    changes = read_csv(changes_path)[0] if changes_path.exists() else []
    change_keys = {
        (row.get("case_id", ""), row.get("field", ""), row.get("before", ""), row.get("after", ""))
        for row in changes
    }
    metrics_by_case_key = {}
    metric_additions = [
        "base_value_raw", "target_value_raw", "unit_raw", "base_value_man_yen_per_person",
        "target_value_man_yen_per_person", "normalized_unit", "unit_conversion_factor",
        "unit_evidence_source", "unit_evidence_text", "unit_validation", "source_box_type",
        "source_box_no", "source_box_label", "source_box_match_method", "source_entity_label",
        "entity_match_status",
    ]
    metric_columns = insert_after(metric_columns, "unit", metric_additions)

    for metric in metrics:
        key = base_metric_key(metric.get("metric_key", ""))
        box = find_metric_box(metric, boxes_by_case_page)
        evidence_unit, evidence_source, evidence_text = metric_unit_evidence(metric, box)
        old_unit = metric.get("unit", "")
        new_unit = old_unit
        if evidence_unit and not old_unit:
            new_unit = evidence_unit
        elif key in MONETARY_METRICS and evidence_unit and old_unit != evidence_unit and evidence_source == "box_metric_row":
            new_unit = evidence_unit
        if new_unit != old_unit:
            change = {
                "case_id": metric["case_id"], "round": metric["round"], "company": metric["company"],
                "category": "主要指標", "field": f"{metric['metric_key']}.unit", "before": old_unit,
                "after": new_unit, "reason": f"{evidence_source}の項目行に単位を確認",
                "page": metric.get("page", ""), "source_box": box.get("box_label", "") if box else "",
            }
            change_key = (change["case_id"], change["field"], change["before"], change["after"])
            if change_key not in change_keys:
                changes.append(change)
                change_keys.add(change_key)
            metric["unit"] = new_unit
            metric["raw"] = replace_unit_in_raw(metric.get("raw", ""), old_unit, new_unit)
        unit = metric.get("unit", "")
        metric["base_value_raw"] = metric.get("base_value", "")
        metric["target_value_raw"] = metric.get("target_value", "")
        metric["unit_raw"] = unit
        if key in MONETARY_METRICS and unit in UNIT_TO_MAN:
            factor = UNIT_TO_MAN[unit]
            metric["base_value_man_yen_per_person"] = clean_number(numeric(metric.get("base_value")) * factor) if numeric(metric.get("base_value")) is not None else ""
            metric["target_value_man_yen_per_person"] = clean_number(numeric(metric.get("target_value")) * factor) if numeric(metric.get("target_value")) is not None else ""
            metric["normalized_unit"] = "万円/人"
            metric["unit_conversion_factor"] = factor
            metric["unit_validation"] = "box_confirmed" if evidence_unit == unit else "manual_audit_unit"
        elif key == "employees":
            metric["base_value_man_yen_per_person"] = ""
            metric["target_value_man_yen_per_person"] = ""
            metric["normalized_unit"] = "人"
            metric["unit_conversion_factor"] = 1
            metric["unit_validation"] = "box_confirmed" if evidence_unit == "人" else "manual_audit_unit"
        else:
            metric["base_value_man_yen_per_person"] = ""
            metric["target_value_man_yen_per_person"] = ""
            metric["normalized_unit"] = ""
            metric["unit_conversion_factor"] = ""
            metric["unit_validation"] = "unit_missing_or_unsupported"
        metric["unit_evidence_source"] = evidence_source
        metric["unit_evidence_text"] = evidence_text
        metric["source_box_type"] = box.get("box_type", "") if box else ""
        metric["source_box_no"] = box.get("box_no", "") if box else ""
        metric["source_box_label"] = box.get("box_label", "") if box else ""
        metric["source_box_match_method"] = "case_page_metric_label" if box and evidence_source == "box_metric_row" else "case_page_box"
        metric["source_entity_label"] = metric.get("company", "")
        metric["entity_match_status"] = "applicant_company_representative"
        metrics_by_case_key[(metric["case_id"], metric["metric_key"])] = metric

    case_additions = [
        "project_cost_value_raw", "project_cost_unit_raw", "project_cost_raw_converted_million_yen", "project_cost_million_yen_normalized",
        "subsidy_value_raw", "subsidy_unit_raw", "subsidy_raw_converted_million_yen", "subsidy_million_yen_normalized", "cost_unit_validation",
        "sales_increase_value_raw", "sales_increase_unit_raw", "sales_increase_oku_yen_normalized",
        "sales_increase_unit_validation", "sales_reported_increase_value_raw", "sales_reported_increase_unit_raw",
        "sales_reported_increase_oku_yen_normalized", "sales_reported_increase_unit_validation",
    ]
    case_columns = insert_after(case_columns, "cost_box_transcription", case_additions[:9])
    case_columns = insert_after(case_columns, "sales_increase_oku_yen", case_additions[9:13])
    case_columns = insert_after(case_columns, "sales_reported_increase_oku_yen", case_additions[13:])

    cost_by_case = {row["case_id"]: row for row in cost_rows}
    revalidation_changes = list(changes)
    for case in cases:
        text = case.get("cost_box_transcription", "")
        project_candidate, project_status = closest_candidate(text, case.get("project_cost_million_yen"), MONEY_TO_MILLION, r"事業費|総額|投資")
        subsidy_candidate, subsidy_status = closest_candidate(text, case.get("subsidy_million_yen"), MONEY_TO_MILLION, r"補助(?:額|金)")
        project_normalized, project_precision = choose_normalized_precision(case.get("project_cost_million_yen"), project_candidate)
        subsidy_normalized, subsidy_precision = choose_normalized_precision(case.get("subsidy_million_yen"), subsidy_candidate)
        case["project_cost_value_raw"] = clean_number(project_candidate["raw_value"]) if project_candidate else ""
        case["project_cost_unit_raw"] = project_candidate["raw_unit"] if project_candidate else ""
        case["project_cost_raw_converted_million_yen"] = clean_number(project_candidate["normalized"]) if project_candidate else ""
        case["project_cost_million_yen_normalized"] = project_normalized
        case["subsidy_value_raw"] = clean_number(subsidy_candidate["raw_value"]) if subsidy_candidate else ""
        case["subsidy_unit_raw"] = subsidy_candidate["raw_unit"] if subsidy_candidate else ""
        case["subsidy_raw_converted_million_yen"] = clean_number(subsidy_candidate["normalized"]) if subsidy_candidate else ""
        case["subsidy_million_yen_normalized"] = subsidy_normalized
        case["cost_unit_validation"] = f"project:{project_status},{project_precision}; subsidy:{subsidy_status},{subsidy_precision}"
        for prefix, label in [("project_cost", "事業費"), ("subsidy", "補助額")]:
            old_value = numeric(case.get(f"{prefix}_million_yen"))
            new_value = numeric(case.get(f"{prefix}_million_yen_normalized"))
            if old_value is not None and new_value is not None and not math.isclose(old_value, new_value, rel_tol=1e-12, abs_tol=1e-9):
                revalidation_changes.append({
                    "case_id": case["case_id"], "round": case["round"], "company": case["company"],
                    "category": "事業費・補助額", "field": f"{prefix}_million_yen_normalized",
                    "before": clean_number(old_value), "after": clean_number(new_value),
                    "reason": f"{label}の原値・原単位から百万円換算を再計算",
                    "page": case.get("cost_page", ""), "source_box": "事業費・補助額Box",
                })
        cost = cost_by_case.get(case["case_id"])
        if cost is not None:
            cost.update({
                "project_cost_value_raw": case["project_cost_value_raw"], "project_cost_unit_raw": case["project_cost_unit_raw"],
                "project_cost_raw_converted_million_yen": case["project_cost_raw_converted_million_yen"],
                "cost_million_normalized": case.get("project_cost_million_yen_normalized", ""),
                "subsidy_value_raw": case["subsidy_value_raw"], "subsidy_unit_raw": case["subsidy_unit_raw"],
                "subsidy_raw_converted_million_yen": case["subsidy_raw_converted_million_yen"],
                "subsidy_million_normalized": case.get("subsidy_million_yen_normalized", ""), "unit_validation": case["cost_unit_validation"],
            })

    sales_additions = ["increase_value_raw", "increase_unit_raw", "increase_oku_normalized", "increase_unit_source", "increase_unit_validation"]
    sales_columns = insert_after(sales_columns, "increase_oku", sales_additions)
    sales_by_case_id = defaultdict(list)
    sales_case_counts = defaultdict(int)
    for series in sales_series:
        sales_case_counts[series["case_id"]] += 1
    for series in sales_series:
        candidate, status = choose_sales_increase(series, sales_box_by_case.get(series["case_id"], ""), sales_case_counts[series["case_id"]] == 1)
        series["increase_value_raw"] = clean_number(candidate["raw_value"]) if candidate else ""
        series["increase_unit_raw"] = candidate["raw_unit"] if candidate else ""
        series["increase_oku_normalized"] = clean_number(candidate["normalized"]) if candidate else series.get("increase_oku", "")
        series["increase_unit_source"] = status.split(":", 1)[1] if ":" in status else ""
        series["increase_unit_validation"] = status.split(":", 1)[0]
        sales_by_case_id[series["case_id"]].append(series)

    for case in cases:
        series_rows = sales_by_case_id.get(case["case_id"], [])
        applicant = next((row for row in series_rows if str(row.get("is_applicant_representative", "")).lower() == "true"), None)
        reported = next((row for row in series_rows if str(row.get("is_reported_primary", "")).lower() == "true"), None)
        for prefix, row in [("sales", applicant), ("sales_reported", reported)]:
            case[f"{prefix}_increase_value_raw"] = row.get("increase_value_raw", "") if row else ""
            case[f"{prefix}_increase_unit_raw"] = row.get("increase_unit_raw", "") if row else ""
            case[f"{prefix}_increase_oku_yen_normalized"] = row.get("increase_oku_normalized", "") if row else ""
            case[f"{prefix}_increase_unit_validation"] = row.get("increase_unit_validation", "") if row else ""
        for prefix in METRIC_ORDER:
            metric = metrics_by_case_key.get((case["case_id"], prefix))
            if not metric:
                continue
            if case.get(f"{prefix}_unit", "") != metric.get("unit", ""):
                case[f"{prefix}_unit"] = metric.get("unit", "")
            case[f"{prefix}_raw_evidence"] = metric.get("raw", case.get(f"{prefix}_raw_evidence", ""))
            extra = {
                f"{prefix}_base_value_raw": metric.get("base_value_raw", ""),
                f"{prefix}_target_value_raw": metric.get("target_value_raw", ""),
                f"{prefix}_unit_raw": metric.get("unit_raw", ""),
                f"{prefix}_base_value_man_yen_per_person": metric.get("base_value_man_yen_per_person", ""),
                f"{prefix}_target_value_man_yen_per_person": metric.get("target_value_man_yen_per_person", ""),
                f"{prefix}_normalized_unit": metric.get("normalized_unit", ""),
                f"{prefix}_unit_conversion_factor": metric.get("unit_conversion_factor", ""),
                f"{prefix}_unit_validation": metric.get("unit_validation", ""),
                f"{prefix}_source_box_type": metric.get("source_box_type", ""),
                f"{prefix}_source_box_no": metric.get("source_box_no", ""),
                f"{prefix}_source_box_label": metric.get("source_box_label", ""),
                f"{prefix}_entity_match_status": metric.get("entity_match_status", ""),
            }
            case.update(extra)

    for prefix in METRIC_ORDER:
        additions = [
            f"{prefix}_base_value_raw", f"{prefix}_target_value_raw", f"{prefix}_unit_raw",
            f"{prefix}_base_value_man_yen_per_person", f"{prefix}_target_value_man_yen_per_person",
            f"{prefix}_normalized_unit", f"{prefix}_unit_conversion_factor", f"{prefix}_unit_validation",
            f"{prefix}_source_box_type", f"{prefix}_source_box_no", f"{prefix}_source_box_label",
            f"{prefix}_entity_match_status",
        ]
        case_columns = insert_after(case_columns, f"{prefix}_unit", additions)

    cost_additions = ["project_cost_value_raw", "project_cost_unit_raw", "project_cost_raw_converted_million_yen", "cost_million_normalized", "subsidy_value_raw", "subsidy_unit_raw", "subsidy_raw_converted_million_yen", "subsidy_million_normalized", "unit_validation"]
    cost_columns = insert_after(cost_columns, "subsidy_million", cost_additions)

    # Apply the same additions to the nested JSON used by QA.
    case_csv_by_id = {row["case_id"]: row for row in cases}
    sales_by_series = {row["series_id"]: row for row in sales_series}
    for item in html_cases:
        case = case_csv_by_id[item["case_id"]]
        for field in case_additions:
            item[field] = case.get(field, "")
        item["project_cost_value_raw"] = case.get("project_cost_value_raw", "")
        item["project_cost_unit_raw"] = case.get("project_cost_unit_raw", "")
        item["project_cost_million_yen_normalized"] = case.get("project_cost_million_yen_normalized", "")
        item["subsidy_value_raw"] = case.get("subsidy_value_raw", "")
        item["subsidy_unit_raw"] = case.get("subsidy_unit_raw", "")
        item["subsidy_million_yen_normalized"] = case.get("subsidy_million_yen_normalized", "")
        item["cost_unit_validation"] = case.get("cost_unit_validation", "")
        if isinstance(item.get("cost"), dict):
            item["cost"].update({
                "project_cost_value_raw": case.get("project_cost_value_raw", ""),
                "project_cost_unit_raw": case.get("project_cost_unit_raw", ""),
                "project_cost_raw_converted_million_yen": case.get("project_cost_raw_converted_million_yen", ""),
                "project_cost_million_yen_normalized": case.get("project_cost_million_yen_normalized", ""),
                "subsidy_value_raw": case.get("subsidy_value_raw", ""),
                "subsidy_unit_raw": case.get("subsidy_unit_raw", ""),
                "subsidy_raw_converted_million_yen": case.get("subsidy_raw_converted_million_yen", ""),
                "subsidy_million_yen_normalized": case.get("subsidy_million_yen_normalized", ""),
                "unit_validation": case.get("cost_unit_validation", ""),
            })
        if isinstance(item.get("sales"), dict):
            item["sales"].update({
                "increase_value_raw": case.get("sales_increase_value_raw", ""),
                "increase_unit_raw": case.get("sales_increase_unit_raw", ""),
                "increase_oku_normalized": case.get("sales_increase_oku_yen_normalized", ""),
                "increase_unit_validation": case.get("sales_increase_unit_validation", ""),
            })
        for metric in item.get("metrics", []):
            source = metrics_by_case_key.get((item["case_id"], metric.get("metric_key", "")))
            if source:
                for field in metric_additions + ["unit", "raw"]:
                    metric[field] = source.get(field, "")
        for series in item.get("sales_series", []):
            source = sales_by_series.get(series.get("series_id", ""))
            if source:
                for field in sales_additions:
                    series[field] = source.get(field, "")
        for prefix in METRIC_ORDER:
            for suffix in ["unit", "raw_evidence", "base_value_raw", "target_value_raw", "unit_raw", "base_value_man_yen_per_person", "target_value_man_yen_per_person", "normalized_unit", "unit_conversion_factor", "unit_validation", "source_box_type", "source_box_no", "source_box_label", "entity_match_status"]:
                field = f"{prefix}_{suffix}"
                if field in case:
                    item[field] = case[field]

    changes_columns = ["case_id", "round", "company", "category", "field", "before", "after", "reason", "page", "source_box"]
    write_csv(processed / "metrics.csv", metrics, metric_columns)
    write_csv(processed / "cases.csv", cases, case_columns)
    write_csv(processed / "sales_series.csv", sales_series, sales_columns)
    write_csv(processed / "cost_validations.csv", cost_rows, cost_columns)
    write_csv(changes_path, changes, changes_columns)
    write_csv(processed / "unit_revalidation_changes.csv", revalidation_changes, changes_columns)
    (root / "html" / "data" / "cases.json").write_text(json.dumps(html_cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_qa_data(root / "html" / "qa.html", html_cases)

    summary = {
        "cases": len(cases), "metrics": len(metrics), "sales_series": len(sales_series),
        "metric_unit_changes": len(changes),
        "changed_companies": len({row["case_id"] for row in changes}),
        "revalidation_changes": len(revalidation_changes),
        "revalidation_changed_companies": len({row["case_id"] for row in revalidation_changes}),
        "metric_box_confirmed": sum(row["unit_validation"] == "box_confirmed" for row in metrics),
        "metric_normalized": sum(bool(row["normalized_unit"]) for row in metrics),
        "cost_raw_unit_confirmed": sum("raw_unit_confirmed" in row["cost_unit_validation"] for row in cases),
        "sales_explicit_unit_match": sum(row["increase_unit_validation"] == "explicit_unit_match" for row in sales_series),
        "sales_unit_confirmed": sum(row["increase_unit_validation"] in {"explicit_unit_match", "raw_value_unit_match", "derived_difference_match", "global_unit_match"} for row in sales_series),
    }
    (processed / "unit_normalization_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
