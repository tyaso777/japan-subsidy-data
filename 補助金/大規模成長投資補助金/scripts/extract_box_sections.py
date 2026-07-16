#!/usr/bin/env python3
"""Add explicit box theme/content fields and recover template-labelled sections.

The source PDFs often use a narrow coloured label cell on the left and a much
larger content region on the right.  Those sections are visually obvious but
were missed by the original rectangle-only extraction because only the label
cell itself is a rectangle.  This script treats the label and its horizontal
band as one semantic box.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber


BOX_COLUMNS = [
    "case_id", "round", "company", "page", "page_role", "box_no",
    "box_type", "box_label", "box_title", "box_theme", "box_content",
    "bbox_x1", "bbox_y1", "bbox_x2", "bbox_y2", "source_method",
    "company_header_masked", "text", "pdf_url",
]


def local_pdf_stem(case_id: str) -> str:
    """Collapse repeated underscores only for the portable local filename."""
    return re.sub(r"_+", "_", str(case_id))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, object]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def compact(text: object) -> str:
    return re.sub(r"\s+", "", str(text or "")).strip()


def clean_text(text: object) -> str:
    lines = []
    for raw in str(text or "").replace("\r", "\n").split("\n"):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def split_theme_content(row: dict[str, object]) -> tuple[str, str]:
    theme = clean_text(row.get("box_theme") or row.get("box_title") or row.get("box_label") or row.get("box_type"))
    text = clean_text(row.get("text"))
    content = clean_text(row.get("box_content"))
    if content:
        return theme, content
    if theme and text.startswith(theme):
        return theme, clean_text(text[len(theme):].lstrip(" ：:・-―—"))
    if theme and compact(text).startswith(compact(theme)):
        # Remove only the leading title while preserving the original line structure.
        lines = text.splitlines()
        consumed = ""
        cut = 0
        for index, line in enumerate(lines):
            consumed += compact(line)
            cut = index + 1
            if len(consumed) >= len(compact(theme)):
                break
        if consumed.startswith(compact(theme)) or compact(theme).startswith(consumed):
            return theme, clean_text("\n".join(lines[cut:]))
    return theme, text


def classify_theme(theme: str) -> tuple[str, str]:
    key = compact(theme)
    if "補助事業" in key and ("背景" in key or "目的" in key):
        return "project_background", "補助事業の背景・目的"
    if "設備投資" in key and "内容" in key:
        return "investment_content", "設備投資の内容"
    if key in {"目標値", "数値目標", "目標"}:
        return "project_targets", "目標値"
    if "事業実施場所" in key or "建設予定地" in key:
        return "project_location", theme
    if "事業効果" in key or "波及効果" in key:
        return "project_effect", theme
    return "other", theme


def overlap_ratio(a: dict, b: dict) -> float:
    overlap = max(0.0, min(a["bottom"], b["bottom"]) - max(a["top"], b["top"]))
    height = max(1.0, min(a["bottom"] - a["top"], b["bottom"] - b["top"]))
    return overlap / height


def extract_labelled_sections(page) -> list[dict[str, object]]:
    width, height = float(page.width), float(page.height)
    candidates = []
    for rect in page.rects:
        rw = float(rect["x1"] - rect["x0"])
        rh = float(rect["bottom"] - rect["top"])
        if not (0.02 * width <= rect["x0"] <= 0.13 * width):
            continue
        if not (0.06 * width <= rw <= 0.18 * width and rh >= 18):
            continue
        if rect["top"] < 0.12 * height or rect["bottom"] > 0.997 * height:
            continue
        label = clean_text(page.crop((rect["x0"], rect["top"], rect["x1"], rect["bottom"])).extract_text(x_tolerance=2, y_tolerance=3) or "")
        theme = compact(label)
        if not theme or len(theme) > 32 or not re.search(r"[一-龠ぁ-んァ-ヶ]", theme):
            continue
        if theme == "項目" or "単位" in theme or re.search(r"労働生産性|給与支給総額|従業員数", theme):
            continue
        # Exclude ordinary table row labels. Semantic side labels normally have
        # a sizeable band and sit very close to the left page margin.
        if rh < 28 and theme not in {"目標値"}:
            continue
        candidates.append({**rect, "theme": theme})

    sections = []
    for rect in candidates:
        content_x0 = float(rect["x1"]) + 2
        content_x1 = width - 18
        # A cost/subsidy label at the far right shares the background row. Stop
        # before it, so the background-purpose content remains semantically pure.
        box_type, label = classify_theme(rect["theme"])
        if box_type == "project_background":
            right_labels = [
                other for other in page.rects
                if other["x0"] > content_x0 + 0.35 * width
                and other["x0"] < width - 0.08 * width
                and overlap_ratio(rect, other) >= 0.5
                and 0.04 * width <= other["x1"] - other["x0"] <= 0.25 * width
            ]
            if right_labels:
                content_x1 = min(float(other["x0"]) for other in right_labels) - 2
        if content_x1 <= content_x0:
            continue
        content = clean_text(page.crop((content_x0, rect["top"], content_x1, rect["bottom"])).extract_text(x_tolerance=2, y_tolerance=3) or "")
        if not content:
            continue
        sections.append({
            "box_type": box_type,
            "box_label": label,
            "box_title": rect["theme"],
            "box_theme": rect["theme"],
            "box_content": content,
            "bbox_x1": round(float(rect["x0"]), 2),
            "bbox_y1": round(float(rect["top"]), 2),
            "bbox_x2": round(content_x1, 2),
            "bbox_y2": round(float(rect["bottom"]), 2),
            "source_method": "template_labeled_section",
            "company_header_masked": "false",
            "text": f"{rect['theme']}\n{content}",
        })
    return sections


def replace_embedded_data(html: str, records: list[dict]) -> str:
    start = html.find("const DATA=")
    end = html.find(";\n", start)
    if start < 0 or end < 0:
        raise ValueError("Could not locate embedded DATA in qa.html")
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"{html[:start]}const DATA={payload}{html[end:]}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    args = parser.parse_args()
    project = args.project_root.resolve()
    output = (args.output_root or project).resolve()

    boxes_path = project / "data" / "processed" / "boxes.csv"
    cases_csv_path = project / "data" / "processed" / "cases.csv"
    manifest_path = project / "data" / "processed" / "pdf_manifest.csv"
    cases_json_path = project / "html" / "data" / "cases.json"
    qa_path = project / "html" / "qa.html"
    boxes = read_csv(boxes_path)
    case_rows = read_csv(cases_csv_path)
    manifest = read_csv(manifest_path)

    for row in boxes:
        theme, content = split_theme_content(row)
        row["box_theme"] = theme
        row["box_content"] = content

    existing = {(row["case_id"], str(row["page"]), compact(row.get("box_theme") or row.get("box_title"))) for row in boxes}
    max_box_no: dict[tuple[str, str], int] = defaultdict(int)
    for row in boxes:
        key = (row["case_id"], str(row["page"]))
        try:
            max_box_no[key] = max(max_box_no[key], int(float(row.get("box_no") or 0)))
        except ValueError:
            pass

    added = []
    missing_pdfs = []
    for item in manifest:
        pdf_path = project / "local_assets" / "pdfs" / f"{local_pdf_stem(item['case_id'])}.pdf"
        if not pdf_path.exists():
            missing_pdfs.append(item["case_id"])
            continue
        with pdfplumber.open(pdf_path) as pdf:
            for page_no, page in enumerate(pdf.pages, start=1):
                for section in extract_labelled_sections(page):
                    identity = (item["case_id"], str(page_no), compact(section["box_theme"]))
                    if identity in existing:
                        continue
                    key = (item["case_id"], str(page_no))
                    max_box_no[key] += 1
                    row = {
                        "case_id": item["case_id"], "round": item["round"], "company": item["company"],
                        "page": page_no, "page_role": "補助事業の概要", "box_no": max_box_no[key],
                        **section, "pdf_url": item["pdf_url"],
                    }
                    boxes.append(row)
                    added.append(row)
                    existing.add(identity)

    boxes.sort(key=lambda row: (row["case_id"], int(float(row["page"])), int(float(row.get("box_no") or 0))))
    write_csv(output / "data" / "processed" / "boxes.csv", boxes, BOX_COLUMNS)
    for row in case_rows:
        if not row.get("sales_representative_series_id"):
            row["sales_representative_reason"] = "売上について申請企業単体系列の記載なし（労働生産性・給与等の申請企業値とは別）"
    write_csv(output / "data" / "processed" / "cases.csv", case_rows, list(case_rows[0]))

    records = json.loads(cases_json_path.read_text(encoding="utf-8"))
    by_case: dict[str, list[dict]] = defaultdict(list)
    for row in boxes:
        by_case[row["case_id"]].append(row)
    for record in records:
        record["boxes"] = by_case.get(record["case_id"], [])
        if not record.get("sales_representative_series_id"):
            record["sales_representative_reason"] = "売上について申請企業単体系列の記載なし（労働生産性・給与等の申請企業値とは別）"
    cases_output = output / "html" / "data" / "cases.json"
    cases_output.parent.mkdir(parents=True, exist_ok=True)
    cases_output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    qa = qa_path.read_text(encoding="utf-8")
    qa = replace_embedded_data(qa, records)
    qa = qa.replace(
        "申請企業自身と判定できる系列がありません。",
        "売上について、申請企業単体と判定できる系列がありません。労働生産性・給与等に申請企業別の値がある場合でも、売上とは別指標です。",
    )
    old_box = "function boxHtml(boxes){return boxes.map(b=>'<div class=\"box\"><div class=\"box-title\"><span>p.'+b.page+' / Box '+b.box_no+'</span><span class=\"pill\">'+esc(b.box_label||b.box_type)+'</span><button class=\"source\" data-page=\"'+b.page+'\">PDFで確認</button></div><div class=\"raw\">'+esc(b.text)+'</div><small>'+esc(b.source_method)+' ・ bbox ['+[b.bbox_x1,b.bbox_y1,b.bbox_x2,b.bbox_y2].map(num).join(', ')+']</small></div>').join('')}"
    new_box = "function boxHtml(boxes){return boxes.map(b=>'<div class=\"box\"><div class=\"box-title\"><span>p.'+b.page+' / Box '+b.box_no+'</span><span class=\"pill\">'+esc(b.box_label||b.box_type)+'</span><button class=\"source\" data-page=\"'+b.page+'\">PDFで確認</button></div><div><b>枠テーマ：</b>'+esc(b.box_theme||b.box_title||b.box_label||'')+'</div><div class=\"raw\"><b>枠内容：</b>\\n'+esc(b.box_content??b.text)+'</div><small>'+esc(b.source_method)+' ・ bbox ['+[b.bbox_x1,b.bbox_y1,b.bbox_x2,b.bbox_y2].map(num).join(', ')+']</small></div>').join('')}"
    if old_box not in qa:
        raise ValueError("Could not locate boxHtml in qa.html")
    qa = qa.replace(old_box, new_box)
    qa_output = output / "html" / "qa.html"
    qa_output.parent.mkdir(parents=True, exist_ok=True)
    qa_output.write_text(qa, encoding="utf-8")

    summary = {
        "existing_boxes": len(boxes) - len(added),
        "added_labelled_sections": len(added),
        "total_boxes": len(boxes),
        "project_background": sum(row["box_type"] == "project_background" for row in boxes),
        "investment_content": sum(row["box_type"] == "investment_content" for row in boxes),
        "project_targets": sum(row["box_type"] == "project_targets" for row in boxes),
        "missing_pdfs": missing_pdfs,
    }
    (output / "box_section_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stats_path = project / "dataset_stats.json"
    if stats_path.exists():
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        stats["boxes"] = len(boxes)
        stats["box_project_background"] = summary["project_background"]
        stats["box_investment_content"] = summary["investment_content"]
        stats["box_project_targets"] = summary["project_targets"]
        (output / "dataset_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
