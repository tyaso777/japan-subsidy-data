#!/usr/bin/env python3
"""Join official head-office and project locations to the case master.

The grant-decision pages publish their records as JSON.  This script keeps a
dated local snapshot, produces a one-location-per-row table, and appends a
small set of analysis-friendly summary columns to cases.csv and cases.json.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse


ROOT = Path(__file__).resolve().parent.parent
CASES_CSV = ROOT / "data" / "processed" / "cases.csv"
CASES_JSON = ROOT / "html" / "data" / "cases.json"
LOCATIONS_CSV = ROOT / "data" / "processed" / "case_locations.csv"
SUMMARY_JSON = ROOT / "data" / "processed" / "location_update_summary.json"
FALLBACKS_CSV = ROOT / "data" / "reference" / "location_fallbacks.csv"

BASE_URL = "https://seichotoushi-hojo.jp"
SOURCES = (
    {
        "cohort": "1_2",
        "page_url": f"{BASE_URL}/1_2ji/koufu/",
        "data_url": f"{BASE_URL}/assets/data/koufu.json?260715",
        "snapshot": ROOT / "data" / "reference" / "official_grant_locations_1_2.json",
    },
    {
        "cohort": "3_4",
        "page_url": f"{BASE_URL}/koufu/",
        "data_url": f"{BASE_URL}/assets/data/koufu-renew.json?26070702",
        "snapshot": ROOT / "data" / "reference" / "official_grant_locations_3_4.json",
    },
)

SUMMARY_FIELDS = [
    "industry",
    "head_office_address",
    "head_office_prefecture",
    "head_office_municipality",
    "project_location_count",
    "project_location_addresses",
    "project_location_prefectures",
    "project_location_municipalities",
    "project_location_statuses",
    "has_undecided_project_location",
    "head_office_project_same_prefecture",
    "location_detail_level",
    "location_match_status",
    "location_source_page_url",
    "location_source_data_url",
    "location_retrieved_at",
]

LOCATION_FIELDS = [
    "case_id",
    "round",
    "company",
    "location_type",
    "location_sequence",
    "address_raw",
    "prefecture",
    "municipality",
    "location_status",
    "detail_level",
    "industry",
    "pdf_url",
    "source_stage",
    "source_page_url",
    "source_data_url",
    "source_record_id",
    "retrieved_at",
]

PREFECTURES = (
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Download the current official JSON before rebuilding outputs.",
    )
    parser.add_argument(
        "--retrieved-at",
        default=date.today().isoformat(),
        help="Source retrieval date (YYYY-MM-DD). Defaults to today.",
    )
    return parser.parse_args()


def download_json(url: str) -> list[dict]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; subsidy-location-dataset/1.0)",
            "Referer": f"{BASE_URL}/koufu/",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def load_sources(refresh: bool) -> list[tuple[dict, dict]]:
    loaded: list[tuple[dict, dict]] = []
    for source in SOURCES:
        snapshot = source["snapshot"]
        if refresh:
            records = download_json(source["data_url"])
            snapshot.write_text(
                json.dumps(records, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        elif snapshot.exists():
            records = json.loads(snapshot.read_text(encoding="utf-8"))
        else:
            raise FileNotFoundError(f"Missing {snapshot}; rerun with --refresh")
        loaded.extend((source, record) for record in records)
    return loaded


def pdf_path(url: str) -> str:
    return urlparse(urljoin(BASE_URL, str(url))).path


def read_csv(path: Path) -> tuple[list[dict], list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), list(reader.fieldnames or [])


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def prefecture_from_address(address: str) -> str:
    return next((name for name in PREFECTURES if str(address).startswith(name)), "")


def municipality_from_address(address: str, prefecture: str) -> str:
    text = str(address).strip()
    if not text or text == prefecture:
        return ""
    while prefecture and text.startswith(prefecture):
        text = text[len(prefecture):]
    patterns = (
        r"^(.+?市.+?区)",
        r"^(.+?郡.+?[町村])",
        r"^(.+?区)",
        r"^(.+?[市町村])",
    )
    for pattern in patterns:
        match = re.match(pattern, text)
        if match:
            return match.group(1)
    return ""


def unique_join(values: list[str]) -> str:
    return " | ".join(dict.fromkeys(value for value in values if value))


def location_row(
    case: dict,
    *,
    location_type: str,
    sequence: int,
    address: str,
    prefecture: str,
    detail_level: str,
    industry: str,
    source_stage: str,
    page_url: str,
    data_url: str,
    source_record_id: str,
    retrieved_at: str,
) -> dict:
    if re.search(r"未定|未確定", address):
        location_status = "undecided"
    elif re.search(r"予定|造成中", address):
        location_status = "planned"
    else:
        location_status = "published"
    return {
        "case_id": case["case_id"],
        "round": case["round"],
        "company": case["company"],
        "location_type": location_type,
        "location_sequence": sequence,
        "address_raw": address,
        "prefecture": prefecture,
        "municipality": municipality_from_address(address, prefecture),
        "location_status": location_status,
        "detail_level": detail_level,
        "industry": industry,
        "pdf_url": case["pdf_url"],
        "source_stage": source_stage,
        "source_page_url": page_url,
        "source_data_url": data_url,
        "source_record_id": source_record_id,
        "retrieved_at": retrieved_at,
    }


def rows_from_official(case: dict, source: dict, record: dict, retrieved_at: str) -> list[dict]:
    industry = str(record.get("category_name", "")).strip()
    head_address = str(record.get("shop_location", "")).strip()
    head_prefecture = str(record.get("area_name", "")).strip() or prefecture_from_address(head_address)
    common = {
        "industry": industry,
        "source_stage": "grant_decision_page",
        "page_url": source["page_url"],
        "data_url": source["data_url"],
        "source_record_id": str(record.get("id", "")),
        "retrieved_at": retrieved_at,
    }
    rows = [
        location_row(
            case,
            location_type="head_office",
            sequence=1,
            address=head_address,
            prefecture=head_prefecture,
            detail_level="full_address",
            **common,
        )
    ]
    addresses = [str(value).strip() for value in record.get("shop_office", []) if str(value).strip()]
    prefectures = [str(value).strip() for value in record.get("area_name_sub", [])]
    for index, address in enumerate(addresses):
        # area_name_sub is a de-duplicated filter list on some records, not a
        # positionally aligned list. The address itself is therefore primary.
        prefecture = prefecture_from_address(address)
        if not prefecture and len(prefectures) == 1:
            prefecture = prefectures[0]
        if not prefecture:
            raise ValueError(
                f"Cannot identify project prefecture for {case['case_id']}: {address!r}"
            )
        rows.append(
            location_row(
                case,
                location_type="project",
                sequence=index + 1,
                address=address,
                prefecture=prefecture,
                detail_level=(
                    "undecided"
                    if re.search(r"未定|未確定", address)
                    else "planned"
                    if re.search(r"予定|造成中", address)
                    else "full_address"
                ),
                **common,
            )
        )
    published_prefectures = {value for value in prefectures if value}
    derived_prefectures = {row["prefecture"] for row in rows if row["location_type"] == "project"}
    if published_prefectures and not published_prefectures.issubset(derived_prefectures):
        raise ValueError(
            f"Project-prefecture set mismatch for {case['case_id']}: "
            f"published={sorted(published_prefectures)!r}, derived={sorted(derived_prefectures)!r}"
        )
    return rows


def load_fallbacks() -> dict[str, dict]:
    rows, _ = read_csv(FALLBACKS_CSV)
    return {row["case_id"]: row for row in rows}


def rows_from_fallback(case: dict, fallback: dict, retrieved_at: str) -> list[dict]:
    page_url = fallback["source_url"]
    common = {
        "detail_level": "prefecture_only",
        "industry": fallback.get("industry", ""),
        "source_stage": fallback.get("source_stage", "adoption_list"),
        "page_url": page_url,
        "data_url": "",
        "source_record_id": fallback.get("corporate_number", ""),
        "retrieved_at": retrieved_at,
    }
    rows = [
        location_row(
            case,
            location_type="head_office",
            sequence=1,
            address=fallback["head_office_prefecture"],
            prefecture=fallback["head_office_prefecture"],
            **common,
        )
    ]
    for index, prefecture in enumerate(filter(None, fallback["project_prefectures"].split("|"))):
        prefecture = prefecture.strip()
        rows.append(
            location_row(
                case,
                location_type="project",
                sequence=index + 1,
                address=prefecture,
                prefecture=prefecture,
                **common,
            )
        )
    return rows


def summarize(rows: list[dict], match_status: str) -> dict:
    head = next(row for row in rows if row["location_type"] == "head_office")
    projects = [row for row in rows if row["location_type"] == "project"]
    project_prefectures = [row["prefecture"] for row in projects]
    project_statuses = [row["location_status"] for row in projects]
    same = bool(project_prefectures) and all(value == head["prefecture"] for value in project_prefectures)
    detail_level = (
        "contains_undecided"
        if "undecided" in project_statuses
        else "contains_planned"
        if "planned" in project_statuses
        else head["detail_level"]
    )
    return {
        "industry": head["industry"],
        "head_office_address": head["address_raw"],
        "head_office_prefecture": head["prefecture"],
        "head_office_municipality": head["municipality"],
        "project_location_count": str(len(projects)),
        "project_location_addresses": unique_join([row["address_raw"] for row in projects]),
        "project_location_prefectures": unique_join(project_prefectures),
        "project_location_municipalities": unique_join([row["municipality"] for row in projects]),
        "project_location_statuses": unique_join(project_statuses),
        "has_undecided_project_location": "true" if "undecided" in project_statuses else "false",
        "head_office_project_same_prefecture": "true" if same else "false",
        "location_detail_level": detail_level,
        "location_match_status": match_status,
        "location_source_page_url": head["source_page_url"],
        "location_source_data_url": head["source_data_url"],
        "location_retrieved_at": head["retrieved_at"],
    }


def main() -> None:
    args = parse_args()
    cases, fields = read_csv(CASES_CSV)
    official = load_sources(args.refresh)
    by_pdf: dict[str, tuple[dict, dict]] = {}
    for source, record in official:
        key = pdf_path(record.get("shop_url", ""))
        if key in by_pdf:
            raise ValueError(f"Duplicate official PDF path: {key}")
        by_pdf[key] = (source, record)
    fallbacks = load_fallbacks()

    detail_rows: list[dict] = []
    summaries: dict[str, dict] = {}
    for case in cases:
        match = by_pdf.get(pdf_path(case["pdf_url"]))
        if match:
            source, record = match
            rows = rows_from_official(case, source, record, args.retrieved_at)
            status = "exact_pdf_url"
        elif case["case_id"] in fallbacks:
            rows = rows_from_fallback(case, fallbacks[case["case_id"]], args.retrieved_at)
            status = "official_adoption_list_prefecture_fallback"
        else:
            raise ValueError(f"No official location match or fallback for {case['case_id']} {case['company']}")
        if not any(row["location_type"] == "project" for row in rows):
            raise ValueError(f"No project location for {case['case_id']}")
        detail_rows.extend(rows)
        summaries[case["case_id"]] = summarize(rows, status)

    for case in cases:
        case.update(summaries[case["case_id"]])
    fields = [field for field in fields if field not in SUMMARY_FIELDS] + SUMMARY_FIELDS
    write_csv(CASES_CSV, cases, fields)
    write_csv(LOCATIONS_CSV, detail_rows, LOCATION_FIELDS)

    if CASES_JSON.exists():
        json_cases = json.loads(CASES_JSON.read_text(encoding="utf-8"))
        for case in json_cases:
            case.update(summaries[case["case_id"]])
        CASES_JSON.write_text(json.dumps(json_cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    match_counts = Counter(summary["location_match_status"] for summary in summaries.values())
    detail_counts = Counter(summary["location_detail_level"] for summary in summaries.values())
    project_status_counts = Counter(
        row["location_status"] for row in detail_rows if row["location_type"] == "project"
    )
    output = {
        "retrieved_at": args.retrieved_at,
        "case_count": len(cases),
        "location_row_count": len(detail_rows),
        "head_office_row_count": sum(row["location_type"] == "head_office" for row in detail_rows),
        "project_row_count": sum(row["location_type"] == "project" for row in detail_rows),
        "multiple_project_location_case_count": sum(
            int(summary["project_location_count"]) > 1 for summary in summaries.values()
        ),
        "match_status_counts": dict(sorted(match_counts.items())),
        "detail_level_counts": dict(sorted(detail_counts.items())),
        "project_location_status_counts": dict(sorted(project_status_counts.items())),
        "full_address_missing_municipality_row_count": sum(
            row["detail_level"] == "full_address" and not row["municipality"]
            for row in detail_rows
        ),
        "sources": [
            {
                "cohort": source["cohort"],
                "page_url": source["page_url"],
                "data_url": source["data_url"],
                "snapshot": str(source["snapshot"].relative_to(ROOT)).replace("\\", "/"),
            }
            for source in SOURCES
        ],
    }
    SUMMARY_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
