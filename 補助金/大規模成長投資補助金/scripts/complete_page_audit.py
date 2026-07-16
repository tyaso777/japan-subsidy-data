from __future__ import annotations

import argparse
import csv
import json
from copy import deepcopy
from pathlib import Path


FULL_PAGES = {
    "s1_outline_51": [1, 2, 3, 4, 5],
    "s2_outline_116": [1, 2, 3],
    "s2_outline_141": [1, 2, 3],
    "s2_outline_156": [1, 2, 3],
    "s2_outline_158": [1, 2, 3, 4],
    "s2_outline_159": [1, 2, 3, 4],
    "s2_outline_163": [1, 2, 3],
    "s2_outline_168": [1, 2, 3],
    "s2_outline_178": [1, 2, 3],
}

PAGE_NOTES = {
    "s1_outline_51": "p.3-5の工程図、設備イメージ、工場図面を追加確認。主要数値の追加・変更なし。",
    "s2_outline_116": "p.3の冬期・夏期売上計画を追加確認。2028-2030年の年度別系列を構造化。",
    "s2_outline_141": "p.3の古川工業（参加企業）の事業費・補助額・主要4指標を追加確認。",
    "s2_outline_156": "p.3の補助事業後の物流展開図を追加確認。主要数値の追加・変更なし。",
    "s2_outline_158": "p.3-4の設備・工程詳細を追加確認。主要数値の追加・変更なし。",
    "s2_outline_159": "p.3-4の5温度帯倉庫の差別化説明を追加確認。競合他社数値は申請企業系列に含めない。",
    "s2_outline_163": "p.3の設備別投資額14項目を追加確認。明細合計1,500百万円、表紙総額1,524百万円。",
    "s2_outline_168": "p.3のヨシカワ機械（子会社）の事業費・補助額・主要4指標を追加確認。",
    "s2_outline_178": "p.3の設備導入効果（生産量660→1,500個、稼働8→16時間）を追加確認。主要4指標とは分離。",
}


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows, fields):
    with path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def setv(row, field, value, changes, dataset, key):
    value = "" if value is None else str(value)
    before = str(row.get(field, ""))
    if before == value:
        return
    row[field] = value
    changes.append({
        "dataset": dataset,
        "record_key": key,
        "case_id": row.get("case_id", ""),
        "company": row.get("company", ""),
        "field": field,
        "before": before,
        "after": value,
    })


def update_audit(project: Path):
    path = project / "data" / "manual_audit" / "full_manual_visual_audit.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_id = {row["case_id"]: row for row in rows}
    for case_id, pages in FULL_PAGES.items():
        row = by_id[case_id]
        row.pop("pages_checked", None)
        row["pages_reviewed"] = pages
        row["audit_method"] = "official_pdf_all_pages_visual_review_at_original_rendered_resolution"
        notes = row.get("notes", [])
        if isinstance(notes, str):
            notes = [notes]
        note = PAGE_NOTES[case_id]
        if note not in notes:
            notes.append(note)
        row["notes"] = notes
        verified = row.get("verified", {})
        if not isinstance(verified, dict):
            verified = {"prior_verified": verified}
        verified["all_pages_reviewed"] = pages
        verified["additional_page_findings"] = note
        row["verified"] = verified
    audit_corrections = {
        "s2_outline_116": [
            {"field": "sales_series_annual", "current": "2029年の冬期・夏期売上点なし",
             "correct": "冬期4.5135億円、夏期2.5488億円を追加", "reason": "p.3年度別表"},
        ],
        "s2_outline_141": [
            {"field": "consortium_sales_series", "current": "基準122.52・増加77.48億円",
             "correct": "基準77.48・増加122.52億円", "reason": "p.1は12,252百万円を売上増加額と明記"},
            {"field": "furukawa_industries_sales_series", "current": "基準22.70・増加12.30億円",
             "correct": "基準12.30・増加22.70億円", "reason": "p.1は2,270百万円を売上増加額と明記"},
            {"field": "project_cost_million_yen", "current": 2131, "correct": 2145,
             "reason": "p.2古川電気工業2,131＋p.3古川工業14百万円"},
            {"field": "subsidy_million_yen", "current": 596, "correct": 600.3,
             "reason": "p.2古川電気工業596＋p.3古川工業4.3百万円"},
            {"field": "participant_metrics", "current": "古川工業系列なし",
             "correct": "p.3主要4指標を別系列で追加", "reason": "参加企業表の未構造化"},
        ],
        "s2_outline_163": [
            {"field": "investment_components", "current": "主要4項目のみ",
             "correct": "p.3設備別14項目を保持（合計1,500百万円）", "reason": "追加ページ明細"},
        ],
        "s2_outline_168": [
            {"field": "participant_metrics", "current": "ヨシカワ機械系列なし",
             "correct": "p.3主要4指標を別系列で追加", "reason": "子会社表の未構造化"},
            {"field": "sales_target_period", "current": "2031年3月期のみ",
             "correct": "明示目標2030年、Box見出し2031年3月期の不一致を併記", "reason": "p.1内部不一致"},
        ],
        "s2_outline_104": [
            {"field": "sales_rate_semantics", "current": "233%を累積増加率として保持",
             "correct": "原文233%は目標/基準比（2.33倍）、分析用累積増加率は133%として分離",
             "reason": "p.1の94億円→219億円グラフと一致"},
        ],
    }
    for case_id, additions in audit_corrections.items():
        corrections = by_id[case_id].get("corrections", [])
        signatures = {(str(c.get("field")), str(c.get("correct"))) for c in corrections}
        for correction in additions:
            signature = (str(correction["field"]), str(correction["correct"]))
            if signature not in signatures:
                corrections.append(correction)
                signatures.add(signature)
        by_id[case_id]["corrections"] = corrections
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n", encoding="utf-8")
    return rows


def update_cases(project: Path, changes):
    path = project / "data" / "processed" / "cases.csv"
    rows, fields = read_csv(path)
    by_id = {row["case_id"]: row for row in rows}

    c = by_id["s2_outline_141"]
    for field, value in {
        "project_cost_million_yen": 2145,
        "subsidy_million_yen": 600.3,
        "subsidy_rate_pct": 27.985,
        "project_cost_value_raw": 2145,
        "project_cost_unit_raw": "百万円",
        "project_cost_raw_converted_million_yen": 2145,
        "project_cost_million_yen_normalized": 2145,
        "subsidy_value_raw": 600.3,
        "subsidy_unit_raw": "百万円",
        "subsidy_raw_converted_million_yen": 600.3,
        "subsidy_million_yen_normalized": 600.3,
        "investment_representative_basis": "コンソーシアム参加2社の事業費・補助額合計（全ページ目視）",
        "cost_box_transcription": "古川電気工業2,131百万円（596百万円）＋古川工業14百万円（4.3百万円）＝コンソーシアム合計2,145百万円（600.3百万円）。",
        "cost_validation": "全3ページ画像目視確認済み（参加2社合計）",
        "cost_unit_validation": "participant_boxes_confirmed_and_summed",
        "cost_page": "2-3",
        "investment_components": json.dumps([
            {"label": "古川電気工業配分", "amount_million_yen": 2131, "subsidy_million_yen": 596, "page": 2},
            {"label": "古川工業配分", "amount_million_yen": 14, "subsidy_million_yen": 4.3, "page": 3},
            {"label": "最新鋭設備（古川電気工業内訳）", "amount_million_yen": 787, "page": 2},
            {"label": "工場拡張（古川電気工業内訳）", "amount_million_yen": 1000, "page": 2},
        ], ensure_ascii=False, separators=(",", ":")),
    }.items():
        setv(c, field, value, changes, "cases.csv", c["case_id"])

    notes = {
        "sales": "2025年3月期→2032年3月期。増加額／目標額は、コンソーシアム122.52→200億円、古川電気工業99.82→165億円、古川工業22.70→35億円。基準売上は差額で77.48、65.18、12.30億円と逆算。",
        "investment": "コンソーシアム合計事業費2,145百万円、補助額600.3百万円。古川電気工業2,131／596、古川工業14／4.3百万円。",
        "metrics": "p.2古川電気工業とp.3古川工業の主要4指標を別系列で保持。",
        "all_pages": PAGE_NOTES["s2_outline_141"],
    }
    setv(c, "manual_audit_notes", json.dumps(notes, ensure_ascii=False, separators=(",", ":")), changes, "cases.csv", c["case_id"])

    c = by_id["s2_outline_163"]
    components = [
        ("オークマ製複合加工機", 200.526068), ("トウネツ製電気炉", 42.82),
        ("ニデック製横中ぐり盤", 148), ("大和重工製定盤", 20.42),
        ("日本ホイスト製5tクレーン", 13.67), ("中原電気製キュービクル", 49.9),
        ("屋根改修工事", 56.5), ("倉庫兼整備工場建設", 889.012532),
        ("トヨタ製フォークリフト", 4.6394), ("ニチユ製ラクサー", 0.25),
        ("テストスタンド", 50), ("ニッチュー製ショットブラストマシン", 15.152),
        ("三井精機製コンプレッサー", 2), ("栗田工業製塗装ブース", 7.11),
    ]
    setv(c, "investment_components", json.dumps([
        {"label": label, "amount_million_yen": amount, "page": 3} for label, amount in components
    ], ensure_ascii=False, separators=(",", ":")), changes, "cases.csv", c["case_id"])
    old_notes = json.loads(c.get("manual_audit_notes") or "{}")
    old_notes["all_pages"] = PAGE_NOTES["s2_outline_163"]
    old_notes["investment_components_sum_million_yen"] = 1500
    old_notes["investment_components_vs_total"] = "設備明細14項目合計1,500百万円。表紙事業費1,524百万円との差24百万円はPDF上で内訳未明示。"
    setv(c, "manual_audit_notes", json.dumps(old_notes, ensure_ascii=False, separators=(",", ":")), changes, "cases.csv", c["case_id"])

    c = by_id["s2_outline_168"]
    for field, value in {
        "sales_target_period_label": "2030年目標（Box見出しは2031年3月期）",
        "sales_target_year_before_correction": 2030,
        "sales_target_year_after_correction": 2030,
        "sales_target_year": 2030,
        "sales_target_year_correction_method": "explicit_target_with_conflicting_box_header",
        "sales_target_year_correction_confidence": "medium",
        "sales_reported_target_year": 2030,
    }.items():
        setv(c, field, value, changes, "cases.csv", c["case_id"])

    c = by_id["s2_outline_104"]
    for field, value in {
        "sales_growth_pct": 133,
        "sales_growth_rate_definition": "reported_target_index_normalized_to_cumulative_increase",
        "sales_multiple": 2.33,
        "sales_reported_growth_pct": 233,
        "sales_validation": "原文233%は目標/基準比。分析用累積増加率133%と分離。グラフ94→219億円と増加額123億円には丸め差2億円。",
    }.items():
        setv(c, field, value, changes, "cases.csv", c["case_id"])

    for case_id in FULL_PAGES:
        c = by_id[case_id]
        if case_id in {"s2_outline_141", "s2_outline_163"}:
            continue
        old_notes = c.get("manual_audit_notes", "")
        try:
            note_obj = json.loads(old_notes) if old_notes else {}
        except json.JSONDecodeError:
            note_obj = {"prior_note": old_notes}
        note_obj["all_pages"] = PAGE_NOTES[case_id]
        setv(c, "manual_audit_notes", json.dumps(note_obj, ensure_ascii=False, separators=(",", ":")), changes, "cases.csv", c["case_id"])

    write_csv(path, rows, fields)
    return rows, fields


def update_sales(project: Path, changes):
    path = project / "data" / "processed" / "sales_series.csv"
    rows, fields = read_csv(path)
    by_id = {row["series_id"]: row for row in rows}
    updates = {
        "s2_outline_141_sales_01": {
            "baseline_sales_oku": 77.48, "target_sales_oku": 200, "increase_oku": 122.52,
            "increase_value_raw": 12252, "increase_unit_raw": "百万円", "increase_oku_normalized": 122.52,
            "increase_unit_source": "explicit_pdf_increase", "increase_unit_validation": "explicit_unit_match",
            "raw_fragment": "コンソーシアム合計：売上増加額12,252百万円、目標20,000百万円、CAGR14.5%。基準売上77.48億円は目標－増加額で逆算。",
        },
        "s2_outline_141_sales_02": {
            "baseline_sales_oku": 65.18, "target_sales_oku": 165, "increase_oku": 99.82,
            "increase_value_raw": 9982, "increase_unit_raw": "百万円", "increase_oku_normalized": 99.82,
            "increase_unit_source": "explicit_pdf_increase", "increase_unit_validation": "explicit_unit_match",
            "raw_fragment": "古川電気工業：売上増加額9,982百万円、目標16,500百万円、CAGR14.2%。基準売上65.18億円は目標－増加額で逆算。",
        },
        "s2_outline_141_sales_03": {
            "baseline_sales_oku": 12.3, "target_sales_oku": 35, "increase_oku": 22.7,
            "increase_value_raw": 2270, "increase_unit_raw": "百万円", "increase_oku_normalized": 22.7,
            "increase_unit_source": "explicit_pdf_increase", "increase_unit_validation": "explicit_unit_match",
            "raw_fragment": "古川工業：売上増加額2,270百万円、目標3,500百万円、CAGR16.1%。基準売上12.30億円は目標－増加額で逆算。",
        },
        "s2_outline_168_sales_01": {
            "baseline_period_label": "2025年3月期", "baseline_year": 2025, "baseline_month": 3,
            "baseline_year_before_correction": 2025, "baseline_year_after_correction": 2025,
            "baseline_month_before_correction": 3, "baseline_month_after_correction": 3,
            "baseline_year_correction_method": "explicit_four_digit_year", "baseline_year_correction_confidence": "high",
            "baseline_period_type": "manual_label", "baseline_year_status": "explicit_four_digit_year",
            "baseline_sales_oku": 79.1, "target_period_label": "2030年目標（Box見出しは2031年3月期）",
            "target_year": 2030, "target_year_before_correction": 2030, "target_year_after_correction": 2030,
            "target_year_correction_method": "explicit_four_digit_year", "target_year_correction_confidence": "high",
            "target_sales_oku": 247.5, "arithmetic_status": "整合（基準値は目標－増加額）",
            "raw_fragment": "明和工業：売上増加額約168.4億円、2030年目標247.5億円、CAGR20.9%。Box見出しは2025年3月期～2031年3月期で1年相違。基準79.1億円は逆算。",
        },
        "s2_outline_168_sales_02": {
            "baseline_period_label": "2025年3月期（共通Box見出し）", "baseline_year": 2025, "baseline_month": 3,
            "baseline_year_before_correction": 2025, "baseline_year_after_correction": 2025,
            "baseline_month_before_correction": 3, "baseline_month_after_correction": 3,
            "baseline_year_correction_method": "explicit_four_digit_year", "baseline_year_correction_confidence": "high",
            "baseline_period_type": "manual_label", "baseline_year_status": "explicit_four_digit_year",
            "baseline_sales_oku": 3.8, "target_period_label": "2030年目標（Box見出しは2031年3月期）",
            "target_year": 2030, "target_year_before_correction": 2030, "target_year_after_correction": 2030,
            "target_year_correction_method": "explicit_four_digit_year", "target_year_correction_confidence": "high",
            "target_sales_oku": 39.4, "arithmetic_status": "整合（基準値は目標－増加額）",
            "raw_fragment": "ヨシカワ機械：売上増加額約35.6億円、2030年目標39.4億円、CAGR47.6%。Box見出しは2025年3月期～2031年3月期。基準3.8億円は逆算。",
        },
        "s2_outline_104_sales_01": {
            "growth_rate_pct": 133, "sales_multiple": 2.33, "stated_rate_pct": 233,
            "growth_rate_definition": "reported_target_index_normalized_to_cumulative_increase",
            "rate_type": "target_base_ratio",
            "arithmetic_status": "PDF原文内丸め差・率定義補正済み",
            "raw_fragment": "売上グラフは24/6時点94億円→工場建設3年後219億円。目標Boxの233%は目標/基準比（約2.33倍）で、分析用累積増加率は133%。原文増加額123億円とグラフ差額125億円には丸め差。",
        },
    }
    for series_id, values in updates.items():
        row = by_id[series_id]
        for field, value in values.items():
            setv(row, field, value, changes, "sales_series.csv", series_id)
    write_csv(path, rows, fields)
    return rows, fields


def metric_clone(template, entity, page, base, target, rate, raw, relation):
    row = deepcopy(template)
    row["source_entity_label"] = entity
    row["entity_match_status"] = relation
    row["page"] = str(page)
    row["base_period_label"] = "基準年度"
    row["target_period_label"] = "事業化報告3年目"
    row["base_year"] = row["target_year"] = ""
    row["base_year_before_correction"] = row["base_year_after_correction"] = ""
    row["target_year_before_correction"] = row["target_year_after_correction"] = ""
    row["base_year_correction_method"] = row["target_year_correction_method"] = "unresolved_relative_or_missing_context"
    row["base_year_correction_confidence"] = row["target_year_correction_confidence"] = "low"
    row["year_status"] = "unresolved_relative_or_missing_context → unresolved_relative_or_missing_context"
    row["base_value"] = row["base_value_raw"] = "" if base is None else str(base)
    row["target_value"] = row["target_value_raw"] = "" if target is None else str(target)
    row["listed_rate_pct"] = "" if rate is None else str(rate)
    row["raw"] = raw
    row["raw_support"] = "true"
    row["source_method"] = "ai_visual_manual_audit"
    row["source_box_type"] = "project_targets"
    row["source_box_no"] = "2"
    row["source_box_label"] = "目標値（参加企業）"
    row["source_box_match_method"] = "case_page_metric_label"
    row["unit_evidence_source"] = "visual_table_unit"
    row["unit_evidence_text"] = raw
    row["unit_validation"] = "box_confirmed"
    row["validation"] = "全ページ画像目視確認済み"
    if row["metric_key"] == "employees":
        row["unit"] = row["unit_raw"] = row["normalized_unit"] = "人"
        row["unit_conversion_factor"] = "1"
        row["base_value_man_yen_per_person"] = row["target_value_man_yen_per_person"] = ""
        row["status"] = "values_without_rate"
        row["rate_only"] = "false"
    else:
        row["unit"] = row["unit_raw"] = "千円/人"
        row["normalized_unit"] = "万円/人"
        row["unit_conversion_factor"] = "0.1"
        row["base_value_man_yen_per_person"] = "" if base is None else str(base / 10)
        row["target_value_man_yen_per_person"] = "" if target is None else str(target / 10)
        row["status"] = "rate_only" if base is None and target is None and rate is not None else "full_values"
        row["rate_only"] = "true" if row["status"] == "rate_only" else "false"
    return row


def update_metrics(project: Path, changes):
    path = project / "data" / "processed" / "metrics.csv"
    rows, fields = read_csv(path)
    specs = {
        "s2_outline_141": ("古川工業株式会社", "consortium_participant", {
            "labor": (4760, 9968, 27.9, "古川工業：労働生産性4,760→9,968千円/人、年平均+27.9%。"),
            "employee_pay": (3838, 4754, 7.4, "古川工業：従業員給与3,838→4,754千円/人、年平均+7.4%。"),
            "officer_pay": (None, None, 6.6, "古川工業：役員給与は値なし、年平均+6.6%のみ。"),
            "employees": (98, 100, None, "古川工業：補助事業に係る従業員数98→100人。"),
        }),
        "s2_outline_168": ("株式会社ヨシカワ機械", "subsidiary_participant", {
            "labor": (14812, 30959, 27.9, "ヨシカワ機械：労働生産性14,812→30,959千円/人、年平均+27.9%。"),
            "employee_pay": (3705, 4475, 6.5, "ヨシカワ機械：従業員給与3,705→4,475千円/人、年平均+6.5%。"),
            "officer_pay": (None, None, 6.5, "ヨシカワ機械：役員給与は値なし、年平均+6.5%のみ。"),
            "employees": (33, 48, None, "ヨシカワ機械：補助事業に係る従業員数33→48人。"),
        }),
    }
    for case_id, (entity, relation, values) in specs.items():
        templates = {r["metric_key"]: r for r in rows if r["case_id"] == case_id and r.get("entity_match_status") == "applicant_company_representative"}
        rows = [r for r in rows if not (r["case_id"] == case_id and r.get("source_entity_label") == entity)]
        for metric_key, (base, target, rate, raw) in values.items():
            row = metric_clone(templates[metric_key], entity, 3, base, target, rate, raw, relation)
            rows.append(row)
            key = f"{case_id}|{entity}|{metric_key}"
            for field in ("base_value", "target_value", "listed_rate_pct", "unit", "source_entity_label", "page"):
                changes.append({"dataset": "metrics.csv", "record_key": key, "case_id": case_id,
                                "company": row["company"], "field": field, "before": "", "after": row.get(field, "")})
    metric_order = {key: index for index, key in enumerate(("labor", "employee_pay", "officer_pay", "employees"))}
    rows.sort(key=lambda r: (r["case_id"], 0 if r.get("entity_match_status") == "applicant_company_representative" else 1,
                             r.get("source_entity_label", ""), metric_order.get(r["metric_key"], 99), r["metric_key"]))
    write_csv(path, rows, fields)
    return rows, fields


def annual_row(template, series_id, label, point_type, period, year, value, page):
    row = deepcopy(template)
    row.update({"series_id": series_id, "series_label": label, "point_type": point_type,
                "period_label": period, "year_before_correction": str(year), "year_after_correction": str(year),
                "year_correction_method": "explicit_four_digit_year", "year": str(year),
                "sales_oku_yen": str(value), "page": str(page)})
    return row


def update_annual(project: Path, changes):
    path = project / "data" / "processed" / "sales_series_annual.csv"
    rows, fields = read_csv(path)
    rows = [row for row in rows if row.get("sales_oku_yen") not in ("", None)]
    template = rows[0]
    desired = [
        ("s2_outline_116", "s2_outline_116_sales_02", "冬期事業売上", "intermediate", "2029年9月期", 2029, 4.5135, 3),
        ("s2_outline_116", "s2_outline_116_sales_03", "夏期事業売上", "intermediate", "2029年9月期", 2029, 2.5488, 3),
        ("s2_outline_141", "s2_outline_141_sales_01", "コンソーシアム合計", "baseline", "2025年3月期", 2025, 77.48, 1),
        ("s2_outline_141", "s2_outline_141_sales_02", "古川電気工業（申請者）", "baseline", "2025年3月期", 2025, 65.18, 1),
        ("s2_outline_141", "s2_outline_141_sales_03", "古川工業", "baseline", "2025年3月期", 2025, 12.3, 1),
        ("s2_outline_168", "s2_outline_168_sales_01", "明和工業", "baseline", "2025年3月期", 2025, 79.1, 1),
        ("s2_outline_168", "s2_outline_168_sales_01", "明和工業", "target", "2030年目標（見出しは2031年3月期）", 2030, 247.5, 1),
        ("s2_outline_168", "s2_outline_168_sales_02", "ヨシカワ機械", "baseline", "2025年3月期", 2025, 3.8, 1),
        ("s2_outline_168", "s2_outline_168_sales_02", "ヨシカワ機械", "target", "2030年目標（見出しは2031年3月期）", 2030, 39.4, 1),
    ]
    keys = {(case_id, series_id, point_type) for case_id, series_id, _, point_type, *_ in desired if case_id != "s2_outline_116"}
    rows = [r for r in rows if (r["case_id"], r["series_id"], r["point_type"]) not in keys]
    rows = [r for r in rows if not (r["case_id"] == "s2_outline_116" and r["series_id"] in {"s2_outline_116_sales_02", "s2_outline_116_sales_03"} and r["year"] == "2029")]
    case_meta = {r["case_id"]: r for r in read_csv(project / "data" / "processed" / "cases.csv")[0]}
    for case_id, series_id, label, point_type, period, year, value, page in desired:
        row = annual_row(template, series_id, label, point_type, period, year, value, page)
        row["case_id"] = case_id
        row["round"] = case_meta[case_id]["round"]
        row["company"] = case_meta[case_id]["company"]
        row["pdf_url"] = case_meta[case_id]["pdf_url"]
        rows.append(row)
        changes.append({"dataset": "sales_series_annual.csv", "record_key": f"{series_id}|{year}|{point_type}",
                        "case_id": case_id, "company": row["company"], "field": "sales_oku_yen",
                        "before": "", "after": str(value)})
    rows.sort(key=lambda r: (r["case_id"], r["series_id"], int(r["year"]) if r.get("year", "").isdigit() else 9999, r["point_type"]))
    write_csv(path, rows, fields)
    write_csv(project / "data" / "processed" / "sales_annual.csv", rows, fields)
    return rows


def sync_compatibility(project: Path, cases, case_fields, sales):
    processed = project / "data" / "processed"
    case_by_id = {r["case_id"]: r for r in cases}
    for filename in ("validations.csv", "cost_validations.csv"):
        path = processed / filename
        rows, fields = read_csv(path)
        for row in rows:
            source = case_by_id.get(row.get("case_id"))
            if source:
                for field in fields:
                    if field in source:
                        row[field] = source[field]
        write_csv(path, rows, fields)
    target_path = processed / "sales_targets.csv"
    target_rows, target_fields = read_csv(target_path)
    applicant = {r["case_id"]: r for r in sales if r.get("is_applicant_representative") == "true"}
    for row in target_rows:
        source = applicant.get(row["case_id"])
        if not source:
            continue
        mapping = {"baseline_year": "baseline_year", "baseline_sales_oku": "baseline_sales_oku",
                   "target_year": "target_year", "target_sales_oku": "target_sales_oku",
                   "increase_oku": "increase_oku", "growth_rate_pct": "growth_rate_pct", "cagr_pct": "cagr_pct"}
        for dest, src in mapping.items():
            if dest in row:
                row[dest] = source.get(src, "")
    write_csv(target_path, target_rows, target_fields)


def update_html(project: Path, cases, sales, metrics, audits):
    json_path = project / "html" / "data" / "cases.json"
    items = json.loads(json_path.read_text(encoding="utf-8"))
    case_by_id = {r["case_id"]: r for r in cases}
    sales_by_case = {}
    metrics_by_case = {}
    for row in sales:
        sales_by_case.setdefault(row["case_id"], []).append(row)
    for row in metrics:
        metrics_by_case.setdefault(row["case_id"], []).append(row)
    audit_by_id = {r["case_id"]: r for r in audits}
    for item in items:
        case = case_by_id[item["case_id"]]
        for key, value in case.items():
            if key in item or key.startswith(("sales_", "labor_", "employee_pay_", "officer_pay_", "employees_", "manual_audit_")):
                item[key] = value
        item["sales_series"] = sales_by_case.get(item["case_id"], [])
        item["metrics"] = metrics_by_case.get(item["case_id"], [])
        audit = audit_by_id[item["case_id"]]
        item["manual_audit_pages"] = audit.get("pages_reviewed", [])
        item["manual_audit_notes"] = json.dumps(audit.get("verified", {}), ensure_ascii=False)
        item["manual_audit_corrections"] = audit.get("corrections", [])
        item["manual_audit_correction_count"] = len(audit.get("corrections", []))
        if item["case_id"] in {"s2_outline_141", "s2_outline_163", "s2_outline_168"}:
            components = json.loads(case.get("investment_components") or "[]")
            item["investment_components"] = components
            if isinstance(item.get("cost"), dict):
                item["cost"]["total_cost_million_yen"] = float(case["project_cost_million_yen"])
                item["cost"]["total_subsidy_million_yen"] = float(case["subsidy_million_yen"])
                item["cost"]["components"] = components
                item["cost"]["transcription"] = case.get("cost_box_transcription", "")
    json_path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    payload = json.dumps(items, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    for filename in ("qa.html", "index.html"):
        path = project / "html" / filename
        html = path.read_text(encoding="utf-8")
        start = html.find("const DATA=")
        end = html.find(";\n", start)
        if start < 0 or end < 0:
            raise RuntimeError(f"const DATA not found in {filename}")
        html = html[:start] + "const DATA=" + payload + html[end:]
        if filename == "qa.html":
            old = "<td><b>'+esc(m.metric)+'</b><br><small>'+esc(m.unit_raw||m.unit||'')+'</small><br><small>'+esc(m.entity_match_status||'')+'</small>"
            new = "<td><b>'+esc(m.metric)+'</b><br><small>'+esc(m.source_entity_label||m.company||'')+'</small><br><small>'+esc(m.unit_raw||m.unit||'')+'</small><br><small>'+esc(m.entity_match_status||'')+'</small>"
            if old in html:
                html = html.replace(old, new, 1)
        path.write_text(html, encoding="utf-8")


def update_change_log(project: Path, changes):
    path = project / "data" / "manual_audit" / "full_manual_visual_audit_changes.csv"
    rows, fields = read_csv(path)
    dedupe = {(r["dataset"], r["record_key"], r["field"], r["after"]) for r in rows}
    for change in changes:
        key = (change["dataset"], change["record_key"], change["field"], change["after"])
        if key not in dedupe:
            rows.append(change)
            dedupe.add(key)
    write_csv(path, rows, fields)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args()
    project = Path(args.project_root)
    changes = []
    audits = update_audit(project)
    cases, case_fields = update_cases(project, changes)
    audit_by_id = {row["case_id"]: row for row in audits}
    for case in cases:
        audit = audit_by_id[case["case_id"]]
        setv(case, "manual_audit_correction_count", len(audit.get("corrections", [])),
             changes, "cases.csv", case["case_id"])
        setv(case, "manual_audit_corrections",
             json.dumps(audit.get("corrections", []), ensure_ascii=False, separators=(",", ":")),
             changes, "cases.csv", case["case_id"])
    write_csv(project / "data" / "processed" / "cases.csv", cases, case_fields)
    sales, _ = update_sales(project, changes)
    metrics, _ = update_metrics(project, changes)
    update_annual(project, changes)
    sync_compatibility(project, cases, case_fields, sales)
    update_html(project, cases, sales, metrics, audits)
    update_change_log(project, changes)
    print(json.dumps({"status": "ok", "new_changes": len(changes), "metrics_rows": len(metrics),
                      "sales_rows": len(sales)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
