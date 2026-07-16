from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path


METRIC_PREFIX = {
    "labor": "labor",
    "employee_pay": "employee_pay",
    "officer_pay": "officer_pay",
    "employees": "employees",
}
TEXT_FIELDS = {
    "scope", "sales_target_period_label", "sales_baseline_period_label",
    "sales_representative_scope", "sales_reported_scope", "sales_validation",
    "labor_unit_raw", "employee_pay_unit_raw", "officer_pay_unit_raw",
    "officer_pay_unit", "officer_pay_normalized_unit", "officer_pay_status",
}
UNIT_FACTOR = {"円/人": 0.0001, "千円/人": 0.1, "万円/人": 1.0, "百万円/人": 100.0, "人": 1.0}

# Corrections whose ledger field is intentionally explanatory rather than a CSV column.
# All sales amounts below are converted to the cases.csv unit (億円).
PSEUDO_CASE_UPDATES = {
    "s1_outline_2": {"project_cost_million_yen_normalized": 7419.1},
    "s1_outline_24": {"sales_growth_pct": "", "sales_multiple": 1.7},
    "s1_outline_38": {"sales_growth_rate_definition": "target_base_ratio"},
    "s1_outline_56": {
        "labor_base_value": "", "labor_target_value": "", "labor_base_value_raw": "", "labor_target_value_raw": "",
        "labor_annual_rate_pct": "", "labor_entity_match_status": "applicant_not_separately_reported",
        "labor_raw_evidence": "申請企業単独の労働生産性は非記載。高知通運及び高知運輸792→852（+2.5%）は共同系列。",
        "employee_pay_base_value": 350, "employee_pay_target_value": 419, "employee_pay_base_value_raw": 350,
        "employee_pay_target_value_raw": 419, "employee_pay_annual_rate_pct": 6.2,
        "employee_pay_raw_evidence": "申請企業・高知通運350→419万円/人（+6.2%）",
        "employees_base_value": 3, "employees_target_value": 62, "employees_base_value_raw": 3,
        "employees_raw_evidence": "申請企業・高知通運3→62人",
        "employees_target_value_raw": 62, "officer_pay_base_value": "", "officer_pay_target_value": "",
        "officer_pay_base_value_raw": "", "officer_pay_target_value_raw": "", "officer_pay_annual_rate_pct": "",
        "officer_pay_status": "not_separately_reported", "officer_pay_entity_match_status": "applicant_not_separately_reported",
        "officer_pay_raw_evidence": "申請企業単独の役員給与は非記載。0→0（0%）はコンソーシアム全体値。",
    },
    "s1_outline_58": {"sales_target_oku_yen": 147.62844105},
    "s1_outline_82": {"sales_baseline_oku_yen": 17.551, "sales_target_oku_yen": 51.951},
    "s1_outline_85": {"sales_growth_pct": "", "sales_multiple": 2.2},
    "s1_outline_86": {"sales_baseline_oku_yen": 38.333, "sales_target_oku_yen": 72.833},
    "s1_outline_92": {"sales_baseline_oku_yen": 306.667, "sales_target_oku_yen": 398.667},
    "s1_outline_99": {"sales_baseline_oku_yen": 200.0, "sales_target_oku_yen": 300.0},
    "s1_outline_104": {"sales_baseline_oku_yen": 111.905, "sales_target_oku_yen": 158.905},
    "s1_outline_107": {"sales_baseline_oku_yen": 40.0},
    "s1_outline_111": {"sales_baseline_oku_yen": 304.167, "sales_target_oku_yen": 450.167},
    "s1_outline_113": {"sales_increase_oku_yen": 84.28, "sales_baseline_oku_yen": 108.608, "sales_target_oku_yen": 192.888},
    "s1_outline_114": {"sales_baseline_oku_yen": 366.0},
    "s1_outline_115": {"sales_growth_rate_definition": "target_base_ratio"},
    "s1_outline_116": {"scope": "applicant", "sales_growth_rate_definition": "target_base_ratio", "sales_baseline_oku_yen": 40.732, "sales_target_oku_yen": 74.132},
    "s1_outline_117": {"officer_pay_target_value_raw": 7600, "officer_pay_target_value_man_yen_per_person": 7600},
    "s1_outline_118": {"sales_growth_rate_definition": "target_base_ratio", "sales_baseline_oku_yen": 17.5, "sales_target_oku_yen": 38.5},
    "s1_outline_119": {"sales_growth_rate_definition": "target_base_ratio", "sales_baseline_oku_yen": 482.517, "sales_target_oku_yen": 1172.517},
    "s1_outline_121": {"sales_growth_rate_definition": "target_base_ratio", "sales_baseline_oku_yen": 11.236, "sales_target_oku_yen": 21.236},
    "s1_outline_123": {"sales_baseline_oku_yen": 93.878, "sales_target_oku_yen": 139.878},
    "s1_outline_124": {"sales_baseline_oku_yen": 182.672, "sales_target_oku_yen": 341.672},
    "s1_outline_125": {"sales_baseline_oku_yen": 78.545, "sales_target_oku_yen": 144.545},
    "s1_outline_126": {"sales_baseline_oku_yen": 145.054, "sales_target_oku_yen": 209.854},
    "s1_outline_129": {"sales_baseline_oku_yen": 222.067, "sales_target_oku_yen": 302.067},
    "s1_outline_131": {"sales_baseline_oku_yen": 7.271, "sales_target_oku_yen": 62.571},
    "s1_outline_134": {"sales_baseline_oku_yen": 12.0, "sales_target_oku_yen": 42.0},
    "s1_outline_135": {"sales_growth_rate_definition": "cumulative_increase", "sales_baseline_oku_yen": 36.496, "sales_target_oku_yen": 61.496},
    "s1_outline_138": {"sales_baseline_oku_yen": 43.442, "sales_target_oku_yen": 116.642},
    "s1_outline_140": {"sales_baseline_period_label": "2023年3月期（直前期）", "sales_baseline_year": 2023,
                         "sales_baseline_oku_yen": 160, "sales_target_oku_yen": 300,
                         "sales_increase_oku_yen": 140, "sales_growth_pct": 87.5},
    "s1_outline_143": {
        "labor_base_value": 470, "labor_target_value": 869, "labor_base_value_raw": 470, "labor_target_value_raw": 869,
        "labor_annual_rate_pct": 22.8, "labor_raw_evidence": "株式会社ロッキー470→869万円/人（+22.8%）",
        "employee_pay_base_value": 274, "employee_pay_target_value": 317,
        "employee_pay_base_value_raw": 274, "employee_pay_target_value_raw": 317, "employee_pay_annual_rate_pct": 5.0,
        "employee_pay_raw_evidence": "株式会社ロッキー274→317万円/人（+5.0%）",
        "employees_base_value": 474, "employees_target_value": 508, "employees_base_value_raw": 474,
        "employees_target_value_raw": 508, "employees_annual_rate_pct": "", "employees_raw_evidence": "株式会社ロッキー474→508人（率記載なし）",
    },
    "s1_outline_146": {"sales_baseline_oku_yen": 371.5686, "sales_target_oku_yen": 750.5686},
    "s1_outline_147": {"sales_baseline_oku_yen": 15.3331, "sales_target_oku_yen": 55.0, "sales_increase_oku_yen": 39.6669},
    "s1_outline_148": {"employee_pay_base_value": 583, "employee_pay_target_value": 677,
                         "employee_pay_base_value_raw": 583, "employee_pay_target_value_raw": 677,
                         "employee_pay_annual_rate_pct": 5.1,
                         "employee_pay_raw_evidence": "投資拠点・栃木県583→677万円/人（+5.1%）。東京都684→795は別系列。"},
    "s1_outline_151": {"employee_pay_base_value": 277, "employee_pay_target_value": 330,
                         "employee_pay_base_value_raw": 277, "employee_pay_target_value_raw": 330,
                         "employee_pay_annual_rate_pct": 6.0, "officer_pay_base_value": 1500,
                         "officer_pay_target_value": 2000, "officer_pay_base_value_raw": 1500,
                         "officer_pay_target_value_raw": 2000, "officer_pay_annual_rate_pct": 10.1,
                         "officer_pay_status": "full_values",
                         "employee_pay_raw_evidence": "投資拠点・愛媛277→330万円/人（+6.0%）。高知256→305は別系列。",
                         "officer_pay_raw_evidence": "愛媛1,500→2,000万円/人（+10.1%）。高知0→0は別系列の明記値。"},
    "s1_outline_152": {"sales_baseline_oku_yen": 66.0714, "sales_target_oku_yen": 103.0714},
    "s1_outline_155": {"sales_baseline_oku_yen": 214.7059, "sales_target_oku_yen": 365.0, "sales_increase_oku_yen": 150.2941},
    "s1_outline_157": {"sales_baseline_oku_yen": 150, "sales_target_oku_yen": 202, "sales_growth_pct": 35},
    "s1_outline_168": {"sales_baseline_oku_yen": 430.2326, "sales_target_oku_yen": 800.2326},
    "s1_outline_169": {"sales_baseline_oku_yen": "", "sales_target_oku_yen": "", "sales_growth_pct": "",
                         "sales_representative_review_required": "true", "sales_validation": "将来目標ではなく過去比較"},
    "s1_outline_171": {"sales_baseline_oku_yen": 106.1728, "sales_target_oku_yen": 192.1728},
    "s1_outline_173": {"sales_baseline_oku_yen": 102.7008, "sales_target_oku_yen": 130.7008,
                         "sales_baseline_period_label": "24/3期", "sales_baseline_year": 2024,
                         "sales_target_period_label": "29/3期", "sales_target_year": 2029},
    "s1_outline_174": {"sales_baseline_oku_yen": 22.8346, "sales_target_oku_yen": 51.8346},
    "s1_outline_177": {"sales_baseline_oku_yen": 22.7255, "sales_target_oku_yen": 79.6255},
    "s1_outline__208": {"labor_base_value": 16835, "labor_target_value": 32798,
                          "labor_base_value_raw": 16835, "labor_target_value_raw": 32798,
                          "labor_unit_raw": "千円/人", "employee_pay_base_value": 7097,
                          "employee_pay_target_value": 8215, "employee_pay_base_value_raw": 7097,
                          "employee_pay_target_value_raw": 8215, "employee_pay_unit_raw": "千円/人"},
}


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def target_of(c):
    if "to" in c:
        return True, c["to"]
    if "correct" in c:
        return True, c["correct"]
    return False, None


def scalar(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def number(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except ValueError:
        return None


def canonical_rate_definition(text):
    s = str(text)
    if "cumulative_increase" in s:
        return "cumulative_increase"
    if "target_base_ratio" in s or "target_as_percent_of_baseline" in s or "index_ratio" in s:
        return "target_base_ratio"
    if "cagr" in s.lower():
        return "cagr"
    return s


def normalized_year(label):
    s = str(label or "")
    m = re.search(r"(?<!\d)(20\d{2})(?!\d)", s)
    if m:
        return int(m.group(1)), "explicit_four_digit_year", "high"
    m = re.search(r"(?<!\d)(\d{2})(?:年|/\d{1,2}|期)", s)
    if m:
        return 2000 + int(m.group(1)), "two_digit_year_assume_2000s", "medium"
    return None, "unresolved_relative_or_missing_context", "low"


def normalize_period_fields(row, label_field, before_field, after_field, year_field,
                            method_field, confidence_field, month_before_field=None,
                            month_after_field=None, month_field=None):
    label = str(row.get(label_field, "") or "")
    four = re.search(r"(?<!\d)(20\d{2})(?!\d)", label)
    two = None if four else re.search(r"(?<!\d)(\d{2})(?=(?:年|/\d{1,2}|期|$))", label)
    month = re.search(r"(?:20\d{2}|\d{2})[年/]\s*(\d{1,2})(?:月|期)?", label)
    if four:
        if row.get(after_field) or row.get(year_field):
            return
        raw_year = int(four.group(1)); corrected = raw_year
        method, confidence = "explicit_four_digit_year", "high"
    elif two:
        raw_year = int(two.group(1)); corrected = 2000 + raw_year
        method, confidence = "two_digit_year_assume_2000s", "medium"
    else:
        return
    row[before_field] = scalar(raw_year)
    row[after_field] = scalar(corrected)
    row[year_field] = scalar(corrected)
    row[method_field] = method
    row[confidence_field] = confidence
    if month and month_before_field and month_after_field and month_field:
        value = int(month.group(1))
        row[month_before_field] = scalar(value)
        row[month_after_field] = scalar(value)
        row[month_field] = scalar(value)


def load_audits(ledger_dir: Path):
    audits = []
    for path in sorted(ledger_dir.glob("manual_audit_v2_batch*.jsonl")):
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.strip():
                audits.append(json.loads(line))
    ids = [r["case_id"] for r in audits]
    if len(ids) != 381 or len(set(ids)) != 381:
        raise RuntimeError(f"audit ledger must contain 381 unique cases: rows={len(ids)} unique={len(set(ids))}")
    return audits


def apply_special(case, correction):
    cid, field = case["case_id"], correction.get("field", "")
    has, target = target_of(correction)
    if not has:
        return False
    special = {
        ("s1_outline_84", "sales_baseline_oku_yen"): 14.7,
        ("s1_outline_117", "sales_growth_pct"): 245,
        ("s1_outline_117", "officer_pay_target_value"): 7600,
        ("s1_outline_117", "officer_pay_annual_rate_pct"): 5.35,
        ("s1_outline_159", "project_cost_million_yen"): 7590,
        ("s1_outline_159", "subsidy_million_yen"): 1430,
        ("s1_outline_164", "sales_baseline_oku_yen"): 81.6,
    }
    key = (cid, field)
    if key in special:
        case[field] = scalar(special[key])
        return True
    if field == "cost_box_transcription" and cid == "s1_outline_5":
        case[field] = case[field].replace("約30.5億円", "35.0億円")
        return True
    return False


def update_metric_normalization(row):
    key = row.get("metric_key", "")
    unit = row.get("unit_raw") or row.get("unit") or ""
    row["unit"] = unit
    if key == "employees":
        row["normalized_unit"] = "人"
        row["unit_conversion_factor"] = "1"
        return
    factor = UNIT_FACTOR.get(unit)
    if factor is None:
        return
    row["normalized_unit"] = "万円/人"
    row["unit_conversion_factor"] = scalar(factor)
    for side in ("base", "target"):
        raw = row.get(f"{side}_value_raw") or row.get(f"{side}_value")
        n = number(raw)
        row[f"{side}_value_man_yen_per_person"] = scalar(n * factor) if n is not None else ""


def update_qa(project: Path, cases, sales, metrics, audits):
    json_path = project / "html" / "data" / "cases.json"
    items = json.loads(json_path.read_text(encoding="utf-8"))
    case_by_id = {r["case_id"]: r for r in cases}
    sales_by_id = {r["series_id"]: r for r in sales}
    metrics_by_key = {(r["case_id"], r["metric_key"]): r for r in metrics}
    audit_by_id = {r["case_id"]: r for r in audits}
    for item in items:
        case = case_by_id[item["case_id"]]
        for k, v in case.items():
            if k in item or k.startswith(("sales_", "labor_", "employee_pay_", "officer_pay_", "employees_", "manual_audit_")):
                item[k] = v
        audit = audit_by_id[item["case_id"]]
        item["manual_audit_confidence"] = "high"
        item["manual_audit_pages"] = audit.get("pages_reviewed", [])
        item["manual_audit_correction_count"] = len(audit.get("corrections", []))
        item["manual_audit_notes"] = json.dumps(audit.get("verified", {}), ensure_ascii=False)
        item["manual_audit_corrections"] = audit.get("corrections", [])
        s = item.get("sales")
        if isinstance(s, dict):
            s.update({
                "baseline_year": case.get("sales_baseline_year", ""),
                "baseline_sales_oku": case.get("sales_baseline_oku_yen", ""),
                "target_year": case.get("sales_target_year", ""),
                "target_sales_oku": case.get("sales_target_oku_yen", ""),
                "increase_oku": case.get("sales_increase_oku_yen", ""),
                "growth_rate_pct": case.get("sales_growth_pct", ""),
                "cagr_pct": case.get("sales_cagr_pct", ""),
                "growth_rate_definition": case.get("sales_growth_rate_definition", ""),
                "multiple": case.get("sales_multiple", ""),
                "validation_status": case.get("sales_validation", ""),
            })
        for nested in item.get("sales_series", []):
            src = sales_by_id.get(nested.get("series_id", ""))
            if src:
                nested.update(src)
                nested["baseline_sales_oku"] = src.get("baseline_sales_oku", "")
                nested["target_sales_oku"] = src.get("target_sales_oku", "")
        for nested in item.get("metrics", []):
            src = metrics_by_key.get((item["case_id"], nested.get("metric_key", "")))
            if src:
                nested.update(src)
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    json_path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    qa = project / "html" / "qa.html"
    html = qa.read_text(encoding="utf-8")
    start = html.find("const DATA=")
    end = html.find(";\n", start)
    if start < 0 or end < 0:
        raise RuntimeError("const DATA not found in qa.html")
    html = html[:start] + "const DATA=" + payload + html[end:]
    html = html.replace(
        "+'%<br><small>CAGR '+num(s.cagr_pct)+'%</small>",
        "+'%<br><small>CAGR '+num(s.cagr_pct)+'% / 倍率 '+num(s.sales_multiple)+'倍</small>",
    )
    qa.write_text(html, encoding="utf-8")

    # The table-view index has a separate embedded DATA payload.
    index = project / "html" / "index.html"
    index_html = index.read_text(encoding="utf-8")
    index_start = index_html.find("const DATA=")
    index_end = index_html.find(";\n", index_start)
    if index_start >= 0 and index_end >= 0:
        index_items = json.loads(index_html[index_start + len("const DATA="):index_end])
        for item in index_items:
            source = case_by_id[item["case_id"]]
            for key, value in source.items():
                if key in item or key.startswith(("sales_", "labor_", "employee_pay_", "officer_pay_", "employees_", "manual_audit_")):
                    item[key] = value
        index_payload = json.dumps(index_items, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        index.write_text(index_html[:index_start] + "const DATA=" + index_payload + index_html[index_end:], encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-root", required=True)
    ap.add_argument("--ledger-dir", required=True)
    args = ap.parse_args()
    project = Path(args.project_root)
    ledger_dir = Path(args.ledger_dir)
    processed = project / "data" / "processed"
    audits = load_audits(ledger_dir)
    cases, case_fields = read_csv(processed / "cases.csv")
    sales, sales_fields = read_csv(processed / "sales_series.csv")
    metrics, metric_fields = read_csv(processed / "metrics.csv")
    annual, annual_fields = read_csv(processed / "sales_series_annual.csv")
    sales_targets, sales_target_fields = read_csv(processed / "sales_targets.csv")
    validations, validation_fields = read_csv(processed / "validations.csv")
    cost_validations, cost_validation_fields = read_csv(processed / "cost_validations.csv")
    before_cases = copy.deepcopy(cases)
    before_sales = copy.deepcopy(sales)
    before_metrics = copy.deepcopy(metrics)
    if "sales_multiple" not in sales_fields:
        sales_fields.insert(sales_fields.index("growth_rate_pct") + 1, "sales_multiple")
        for row in sales:
            row["sales_multiple"] = ""
    if len(cases) != 381:
        raise RuntimeError(f"cases.csv rows={len(cases)}")
    case_by_id = {r["case_id"]: r for r in cases}
    sales_by_case = defaultdict(list)
    for row in sales:
        sales_by_case[row["case_id"]].append(row)
    metrics_by_case_key = {(r["case_id"], r["metric_key"]): r for r in metrics}
    applied = []
    unresolved = []
    for audit in audits:
        case = case_by_id[audit["case_id"]]
        case["manual_audit_confidence"] = "high"
        case["manual_audit_correction_count"] = str(len(audit.get("corrections", [])))
        case["manual_audit_notes"] = json.dumps(audit.get("verified", {}), ensure_ascii=False)
        case["manual_audit_corrections"] = json.dumps(audit.get("corrections", []), ensure_ascii=False, separators=(",", ":"))
        for correction in audit.get("corrections", []):
            field = correction.get("field", "")
            has, target = target_of(correction)
            if not has:
                unresolved.append({"case_id": case["case_id"], **correction})
                continue
            before = case.get(field, "")
            done = apply_special(case, correction)
            if not done and field in case:
                if field == "sales_growth_rate_definition":
                    case[field] = canonical_rate_definition(target)
                    done = True
                elif isinstance(target, (int, float)) or target is None or field in TEXT_FIELDS:
                    case[field] = scalar(target)
                    done = True
            if not done and field == "sales_target_year_raw":
                case["sales_target_period_label"] = scalar(target)
                y, method, conf = normalized_year(target)
                case["sales_target_year_before_correction"] = ""
                case["sales_target_year_after_correction"] = scalar(y)
                case["sales_target_year"] = scalar(y)
                case["sales_target_year_correction_method"] = method
                case["sales_target_year_correction_confidence"] = conf
                done = True
            if not done and field == "sales_baseline_year_raw":
                case["sales_baseline_period_label"] = scalar(target)
                y, method, conf = normalized_year(target)
                case["sales_baseline_year_before_correction"] = ""
                case["sales_baseline_year_after_correction"] = scalar(y)
                case["sales_baseline_year"] = scalar(y)
                case["sales_baseline_year_correction_method"] = method
                case["sales_baseline_year_correction_confidence"] = conf
                done = True
            if not done and field == "sales_growth_pct_reported":
                # 原文率。既存の成長率が空欄の場合だけ代表列へ採用し、系列の stated_rate_pct には常に保持する。
                if not case.get("sales_growth_pct"):
                    case["sales_growth_pct"] = scalar(target)
                done = True
            if done:
                applied.append({"case_id": case["case_id"], "field": field, "before": before, "after": case.get(field, target)})
            else:
                unresolved.append({"case_id": case["case_id"], **correction})

    # Apply explanatory-ledger corrections that resolve to representative case columns.
    for cid, updates in PSEUDO_CASE_UPDATES.items():
        case = case_by_id[cid]
        for field, value in updates.items():
            before = case.get(field, "")
            case[field] = scalar(value)
            applied.append({"case_id": cid, "field": field, "before": before, "after": case[field]})

    # Long-form sales corrections and secondary series retained separately from the case representative.
    for row in sales:
        cid, label = row["case_id"], row.get("series_label", "")
        if cid == "s1_outline_24":
            row["growth_rate_pct"] = ""
            row["sales_multiple"] = "1.8" if "連結" in label else "1.7"
        elif cid == "s1_outline_38":
            row["growth_rate_definition"] = row["rate_type"] = "target_base_ratio"
        elif cid == "s1_outline_63":
            row["sales_multiple"] = "2.2" if "2030" in label else "7.3"
        elif cid == "s1_outline_85":
            row["growth_rate_pct"] = ""
            row["sales_multiple"] = "2.2"
        elif cid == "s1_outline_101":
            row["is_applicant_representative"] = "true" if "中期・単体" in label else "false"
        elif cid == "s1_outline_168" and label == "連結":
            row["baseline_sales_oku"] = "527.7778"; row["target_sales_oku"] = "907.7778"
        elif cid == "s1_outline_173" and label == "連結":
            row["baseline_sales_oku"] = "123.9576"; row["target_sales_oku"] = "155.9576"
        elif cid == "s1_outline_174" and label == "Plan・Do・See":
            row["baseline_sales_oku"] = "38.4615"; row["target_sales_oku"] = "78.4615"
        elif cid == "s1_outline_177" and label == "連結":
            row["baseline_sales_oku"] = "23.389"; row["target_sales_oku"] = "81.789"

    # Raw-period and normalized-year dual representation.
    for case in cases:
        for side in ("baseline", "target"):
            normalize_period_fields(
                case, f"sales_{side}_period_label", f"sales_{side}_year_before_correction",
                f"sales_{side}_year_after_correction", f"sales_{side}_year",
                f"sales_{side}_year_correction_method", f"sales_{side}_year_correction_confidence",
            )
    for row in sales:
        for side in ("baseline", "target"):
            normalize_period_fields(
                row, f"{side}_period_label", f"{side}_year_before_correction", f"{side}_year_after_correction",
                f"{side}_year", f"{side}_year_correction_method", f"{side}_year_correction_confidence",
                f"{side}_month_before_correction", f"{side}_month_after_correction", f"{side}_month",
            )
    for row in metrics:
        for side in ("base", "target"):
            normalize_period_fields(
                row, f"{side}_period_label", f"{side}_year_before_correction", f"{side}_year_after_correction",
                f"{side}_year", f"{side}_year_correction_method", f"{side}_year_correction_confidence",
            )

    # Correct cases whose applicant representative flag changed after the visual review.
    for cid in ("s1_outline_101",):
        row = next(r for r in sales_by_case[cid] if r.get("is_applicant_representative", "").lower() == "true")
        case = case_by_id[cid]
        case["sales_representative_series_id"] = row["series_id"]
        case["sales_representative_scope"] = row["series_label"]
        case["sales_baseline_period_label"] = row.get("baseline_period_label", "")
        case["sales_baseline_year"] = row.get("baseline_year", "")
        case["sales_baseline_oku_yen"] = row.get("baseline_sales_oku", "")
        case["sales_target_period_label"] = row.get("target_period_label", "")
        case["sales_target_year"] = row.get("target_year", "")
        case["sales_target_oku_yen"] = row.get("target_sales_oku", "")
        case["sales_increase_oku_yen"] = row.get("increase_oku", "")
        case["sales_growth_pct"] = row.get("growth_rate_pct", "")
        case["sales_cagr_pct"] = row.get("cagr_pct", "")

    # Keep normalized cost fields aligned only where the adopted total itself was corrected.
    for case in cases:
        if case["case_id"] in {"s1_outline_159", "s1_outline__199", "s1_outline__205", "s2_outline_5"}:
            case["project_cost_million_yen_normalized"] = case["project_cost_million_yen"]
        if case["case_id"] == "s1_outline_159":
            case["subsidy_million_yen_normalized"] = case["subsidy_million_yen"]

        # Mirror case representative sales to the correct long-form series.
        rows = sales_by_case[case["case_id"]]
        applicant = next((r for r in rows if r.get("is_applicant_representative", "").lower() == "true"), None)
        reported = next((r for r in rows if r.get("is_reported_primary", "").lower() == "true"), None)
        for prefix, row in (("sales", applicant), ("sales_reported", reported)):
            if not row:
                continue
            mapping = {
                "baseline_period_label": "baseline_period_label", "baseline_year": "baseline_year",
                "baseline_oku_yen": "baseline_sales_oku", "target_period_label": "target_period_label",
                "target_year": "target_year", "target_oku_yen": "target_sales_oku",
                "increase_oku_yen": "increase_oku", "growth_pct": "growth_rate_pct", "cagr_pct": "cagr_pct",
            }
            for suffix, dest in mapping.items():
                source = f"{prefix}_{suffix}"
                if source in case:
                    row[dest] = case[source]
            if prefix == "sales":
                row["growth_rate_definition"] = case.get("sales_growth_rate_definition", row.get("growth_rate_definition", ""))
                row["rate_type"] = row["growth_rate_definition"]
                row["stated_rate_pct"] = case.get("sales_growth_pct", row.get("stated_rate_pct", ""))
                row["increase_oku_normalized"] = case.get("sales_increase_oku_yen_normalized") or case.get("sales_increase_oku_yen", "")
            else:
                row["stated_rate_pct"] = case.get("sales_reported_growth_pct", row.get("stated_rate_pct", ""))

        # Mirror representative metric columns and recompute raw-unit conversions.
        for prefix, metric_key in METRIC_PREFIX.items():
            metric = metrics_by_case_key.get((case["case_id"], metric_key))
            if not metric:
                continue
            metric_mapping = (("base_value", "base_value"), ("target_value", "target_value"),
                              ("base_value_raw", "base_value_raw"), ("target_value_raw", "target_value_raw"),
                              ("unit_raw", "unit_raw"), ("annual_rate_pct", "listed_rate_pct"), ("raw_evidence", "raw"),
                              ("normalized_unit", "normalized_unit"), ("unit_conversion_factor", "unit_conversion_factor"))
            needs_update = any(
                f"{prefix}_{suffix}" in case and str(case.get(f"{prefix}_{suffix}", "")) != str(metric.get(dest, ""))
                for suffix, dest in metric_mapping
            )
            if not needs_update:
                continue
            for suffix, dest in metric_mapping:
                source = f"{prefix}_{suffix}"
                if source in case:
                    metric[dest] = case[source]
            update_metric_normalization(metric)
            case[f"{prefix}_unit"] = metric.get("unit", "")
            case[f"{prefix}_base_value_man_yen_per_person"] = metric.get("base_value_man_yen_per_person", "")
            case[f"{prefix}_target_value_man_yen_per_person"] = metric.get("target_value_man_yen_per_person", "")
            case[f"{prefix}_normalized_unit"] = metric.get("normalized_unit", "")
            case[f"{prefix}_unit_conversion_factor"] = metric.get("unit_conversion_factor", "")

    # Update endpoint rows already present in annual series.
    sales_by_id = {r["series_id"]: r for r in sales}
    for point in annual:
        series = sales_by_id.get(point.get("series_id", ""))
        if not series:
            continue
        if point.get("point_type") == "baseline":
            point["period_label"] = series.get("baseline_period_label", "")
            point["year"] = series.get("baseline_year", "")
            point["sales_oku_yen"] = series.get("baseline_sales_oku", "")
        elif point.get("point_type") == "target":
            point["period_label"] = series.get("target_period_label", "")
            point["year"] = series.get("target_year", "")
            point["sales_oku_yen"] = series.get("target_sales_oku", "")

    # Explicit intermediate annual values visible in the PDFs.
    annual_additions = {
        "s1_outline_43": [(2022, 599), (2023, 643), (2024, 688), (2025, 736), (2026, 788), (2027, 843), (2028, 902), (2029, 965), (2030, 1032)],
        "s1_outline_89": [(2025, 165), (2026, 170), (2027, 177), (2028, 184), (2029, 192)],
        "s2_outline_154": [(2024, 7), (2025, 13), (2026, 25), (2027, 35), (2028, 40), (2029, 45), (2030, 50)],
        "s2_outline_156": [(2024, 75), (2027, 91), (2030, 152)],
    }
    annual_keys = {(r["series_id"], r.get("year", ""), r.get("sales_oku_yen", "")) for r in annual}
    for cid, points in annual_additions.items():
        representative = next((r for r in sales_by_case[cid] if r.get("is_applicant_representative", "").lower() == "true"), sales_by_case[cid][0])
        for year, amount in points:
            key = (representative["series_id"], str(year), scalar(amount))
            if key in annual_keys:
                continue
            annual.append({
                "case_id": cid, "round": representative.get("round", ""), "company": representative.get("company", ""),
                "series_id": representative["series_id"], "series_label": representative.get("series_label", ""),
                "point_type": "intermediate", "period_label": str(year), "year_before_correction": str(year),
                "year_after_correction": str(year), "year_correction_method": "explicit_four_digit_year", "year": str(year),
                "month_before_correction": "", "month_after_correction": "", "month": "", "sales_oku_yen": scalar(amount),
                "page": representative.get("page", "1"), "pdf_url": representative.get("pdf_url", ""),
            })
            annual_keys.add(key)

    # Synchronize compatibility tables so they do not retain pre-audit values.
    for row in sales_targets:
        candidates = sales_by_case[row["case_id"]]
        source = next((r for r in candidates if r.get("is_reported_primary", "").lower() == "true"), candidates[0] if candidates else None)
        if not source:
            continue
        mapping = {
            "baseline_period_label": "baseline_period_label", "baseline_year_before_correction": "baseline_year_before_correction",
            "baseline_year_after_correction": "baseline_year_after_correction", "baseline_year_correction_method": "baseline_year_correction_method",
            "baseline_year": "baseline_year", "baseline_sales_oku": "baseline_sales_oku",
            "target_period_label": "target_period_label", "target_year_before_correction": "target_year_before_correction",
            "target_year_after_correction": "target_year_after_correction", "target_year_correction_method": "target_year_correction_method",
            "target_year": "target_year", "target_sales_oku": "target_sales_oku", "increase_oku": "increase_oku",
            "stated_rate_pct": "stated_rate_pct", "stated_rate_type": "rate_type", "calculated_cagr_pct": "cagr_pct",
            "validation_status": "arithmetic_status", "raw": "raw_fragment",
        }
        for dest, src in mapping.items():
            row[dest] = source.get(src, "")

    metric_lookup = {(r["case_id"], r["metric_key"]): r for r in metrics}
    for row in validations:
        source = metric_lookup.get((row["case_id"], row["metric_key"]))
        if not source:
            continue
        for field in validation_fields:
            if field in source:
                row[field] = source[field]

    for row in cost_validations:
        source = case_by_id[row["case_id"]]
        row["box_transcription"] = source.get("cost_box_transcription", row.get("box_transcription", ""))
        row["cost_million"] = source.get("project_cost_million_yen", "")
        row["subsidy_million"] = source.get("subsidy_million_yen", "")
        row["cost_million_normalized"] = source.get("project_cost_million_yen_normalized", "")
        row["subsidy_million_normalized"] = source.get("subsidy_million_yen_normalized", "")
        row["subsidy_rate_pct"] = source.get("subsidy_rate_pct", "")

    write_csv(processed / "cases.csv", cases, case_fields)
    write_csv(processed / "sales_series.csv", sales, sales_fields)
    write_csv(processed / "metrics.csv", metrics, metric_fields)
    write_csv(processed / "sales_series_annual.csv", annual, annual_fields)
    write_csv(processed / "sales_annual.csv", annual, annual_fields)
    write_csv(processed / "sales_targets.csv", sales_targets, sales_target_fields)
    write_csv(processed / "validations.csv", validations, validation_fields)
    write_csv(processed / "cost_validations.csv", cost_validations, cost_validation_fields)
    audit_out = project / "data" / "manual_audit" / "full_manual_visual_audit.jsonl"
    audit_out.parent.mkdir(parents=True, exist_ok=True)
    audit_out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in audits) + "\n", encoding="utf-8")

    # Machine-readable, exact before/after list for every material data correction.
    change_rows = []
    def collect_changes(dataset, before_rows, after_rows, keys):
        before_map = {tuple(r.get(k, "") for k in keys): r for r in before_rows}
        for after in after_rows:
            key = tuple(after.get(k, "") for k in keys)
            before = before_map.get(key, {})
            for field in after:
                if field.startswith("manual_audit_") or before.get(field, "") == after.get(field, ""):
                    continue
                change_rows.append({
                    "dataset": dataset, "record_key": "|".join(key), "case_id": after.get("case_id", ""),
                    "company": after.get("company", ""), "field": field,
                    "before": before.get(field, ""), "after": after.get(field, ""),
                })
    collect_changes("cases.csv", before_cases, cases, ("case_id",))
    collect_changes("sales_series.csv", before_sales, sales, ("series_id",))
    collect_changes("metrics.csv", before_metrics, metrics, ("case_id", "metric_key"))
    write_csv(project / "data" / "manual_audit" / "full_manual_visual_audit_changes.csv", change_rows,
              ["dataset", "record_key", "case_id", "company", "field", "before", "after"])
    update_qa(project, cases, sales, metrics, audits)
    report = {
        "status": "ok", "cases": len(cases), "audits": len(audits), "applied": len(applied),
        "material_field_changes": len(change_rows),
        "material_changed_cases": len({r["case_id"] for r in change_rows}),
        "unresolved_annotations": len(unresolved), "unresolved": unresolved,
    }
    (ledger_dir / "apply_full_manual_audit_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "unresolved"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
