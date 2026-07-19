"""Build the audited 1st/2nd-call application-round crosswalk.

The original ``round`` field is retained as ``round_original``.  The audited
``application_round`` is a fixed case-id crosswalk established by manual
reconciliation against the official selected-project lists below, not by the
company-PDF filename (``outline_`` versus ``outline__``).  Two post-publication
legal-name changes were resolved by corporate number; the remaining records
are deliberately labelled ``manual_official_list_reconciliation`` rather than
claiming that this script itself performs a fresh name match.

Official sources (retrieved/visually reconciled 2026-07-19):
  * 1st call: https://seichotoushi-hojo.jp/assets/pdf/list_1ji.pdf
  * 2nd call: https://seichotoushi-hojo.jp/assets/pdf/list_2ji.pdf
  * 2nd-call additional selection:
    https://seichotoushi-hojo.jp/assets/pdf/list_2ji_tsuika.pdf

This script intentionally writes only the crosswalk beside itself.  It does
not modify cases.csv or any existing analysis output.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
CASES_CSV = PROJECT_ROOT / "data" / "processed" / "cases.csv"
OUTPUT_CSV = HERE / "application_round_crosswalk_1_2.csv"

SOURCE_1 = "https://seichotoushi-hojo.jp/assets/pdf/list_1ji.pdf"
SOURCE_2 = "https://seichotoushi-hojo.jp/assets/pdf/list_2ji.pdf"
SOURCE_2_ADDITIONAL = (
    "https://seichotoushi-hojo.jp/assets/pdf/list_2ji_tsuika.pdf"
)

# The 75 collected cases reconciled to the official 2nd-call lists.  The
# remaining 106 of the 181 s1 cases reconcile to the official 1st-call list.
# Keeping this set explicit makes the audit result deterministic and reviewable.
TRUE_SECOND_SINGLE_NUMBERS = {
    108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 120, 121, 122,
    123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 134, 135, 136, 137,
    138, 139, 140, 141, 143, 145, 148, 149, 150, 151, 152, 153, 154, 155,
    156, 157, 158, 159, 162, 166, 167, 168, 169, 171, 173, 174, 177,
}
TRUE_SECOND_DOUBLE_NUMBERS = {
    181, 182, 183, 184, 189, 190, 191, 192, 194, 195,
    197, 198, 199, 201, 202, 203, 204, 205, 206, 208,
}
TRUE_SECOND_IDS = {
    f"s1_outline_{number}" for number in TRUE_SECOND_SINGLE_NUMBERS
} | {
    f"s1_outline__{number}" for number in TRUE_SECOND_DOUBLE_NUMBERS
}

# Names transcribed from the official 2nd-call *additional* selection list.
# They distinguish the exact source PDF for each collected 2nd-call case.
SECOND_ADDITIONAL_OFFICIAL_NAMES = {
    "さいほく鉄工株式会社",
    "株式会社ヨコオデイリーフーズ",
    "株式会社カナイ",
    "平和食品工業株式会社",
    "菊池食品工業株式会社",
    "株式会社ジャンボリア",
    "旭陽電気株式会社",
    "新日本金属工業株式会社",
    "株式会社ミダック",
    "株式会社コンメックス",
    "高末株式会社",
    "信光陸運株式会社",
    "中央紙通商株式会社",
    "株式会社かねふくめんたいパーク",
    "長﨑ジャッキ株式会社",
    "クリエイトワン株式会社",
    "泉南乳業株式会社",
    "ヤマトミシン製造株式会社",
    "株式会社中西製作所",
    "岸和田製鋼株式会社",
    "株式会社井沢鉄工所",
    "ハマダコンフェクト株式会社",
    "メック株式会社",
    "まねき食品株式会社",
    "株式会社福山臨床検査センター",
    "土佐鶴酒造株式会社",
    "MHT株式会社",
    "吉田海運ロジソリューションズ株式会社",
    "株式会社永井運送",
    "株式会社Ｐｌａｎ・Ｄｏ・Ｓｅｅ琉球",
}

# Two companies changed legal name after the official 2nd-call list was issued.
ALIASES = {
    "s1_outline__194": (
        "藤森工業株式会社",
        "6011101056965",
        "Current name ZACROS; official list uses former name Fujimori Kogyo.",
    ),
    "s1_outline__202": (
        "東京アライドコーヒーロースターズ株式会社",
        "6010801007716",
        "Current name Allied Coffee Roasters; official list uses former Tokyo name.",
    ),
}


def normalize_company(value: str) -> str:
    """Normalize typography while preserving the legal company name."""

    value = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"[\s\u3000]+", "", value).casefold()


def load_s1_cases() -> list[dict[str, str]]:
    with CASES_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row["case_id"].startswith("s1_")]
    assert len(rows) == 181, f"Expected 181 s1 cases, got {len(rows)}"
    assert {row["round"] for row in rows} == {"1次", "2次"}
    assert len({row["case_id"] for row in rows}) == 181, "Duplicate case_id"
    return rows


def build_rows(cases: list[dict[str, str]]) -> list[dict[str, str]]:
    case_ids = {row["case_id"] for row in cases}
    assert len(TRUE_SECOND_SINGLE_NUMBERS) == 55
    assert len(TRUE_SECOND_DOUBLE_NUMBERS) == 20
    assert len(TRUE_SECOND_IDS) == 75
    assert TRUE_SECOND_IDS <= case_ids, "Audited 2nd-call case_id missing from cases.csv"

    additional_names = {
        normalize_company(name) for name in SECOND_ADDITIONAL_OFFICIAL_NAMES
    }
    output: list[dict[str, str]] = []

    for row in cases:
        case_id = row["case_id"]
        company = row["company"]
        application_round = "2次" if case_id in TRUE_SECOND_IDS else "1次"

        if application_round == "1次":
            source_url = SOURCE_1
        elif normalize_company(company) in additional_names:
            source_url = SOURCE_2_ADDITIONAL
        else:
            source_url = SOURCE_2

        if case_id in ALIASES:
            official_name, corporate_number, alias_note = ALIASES[case_id]
            match_method = "official_name_alias_corporate_number"
            note = (
                f"Official name={official_name}; corporate number={corporate_number}. "
                f"{alias_note}"
            )
        else:
            match_method = "manual_official_list_reconciliation"
            note = ""

        if row["round"] != application_round:
            correction = (
                f"Corrected: stored round {row['round']} conflicts with official "
                f"{application_round} selection list."
            )
            note = f"{note} {correction}".strip()

        output.append(
            {
                "case_id": case_id,
                "company": company,
                "round_original": row["round"],
                "application_round": application_round,
                "match_method": match_method,
                "official_source_url": source_url,
                "note": note,
            }
        )

    return output


def validate(rows: list[dict[str, str]]) -> None:
    true_counts = Counter(row["application_round"] for row in rows)
    assert true_counts == Counter({"1次": 106, "2次": 75}), true_counts

    cross = Counter(
        (row["round_original"], row["application_round"]) for row in rows
    )
    expected_cross = Counter(
        {
            ("1次", "1次"): 101,
            ("1次", "2次"): 55,
            ("2次", "1次"): 5,
            ("2次", "2次"): 20,
        }
    )
    assert cross == expected_cross, (cross, expected_cross)
    mismatch_count = sum(
        count for (old, new), count in cross.items() if old != new
    )
    assert mismatch_count == 60

    source_counts = Counter(row["official_source_url"] for row in rows)
    assert source_counts[SOURCE_1] == 106
    assert source_counts[SOURCE_2] == 52
    assert source_counts[SOURCE_2_ADDITIONAL] == 23

    alias_counts = Counter(row["match_method"] for row in rows)
    assert alias_counts["official_name_alias_corporate_number"] == 2
    assert alias_counts["manual_official_list_reconciliation"] == 179

    # Known positive and negative controls from the audit.
    by_id = {row["case_id"]: row for row in rows}
    assert by_id["s1_outline__179"]["application_round"] == "1次"
    assert by_id["s1_outline_169"]["application_round"] == "2次"
    assert by_id["s1_outline_1"]["application_round"] == "1次"
    assert by_id["s1_outline__208"]["application_round"] == "2次"


def write_rows(rows: list[dict[str, str]]) -> None:
    fields = [
        "case_id",
        "company",
        "round_original",
        "application_round",
        "match_method",
        "official_source_url",
        "note",
    ]
    with OUTPUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    rows = build_rows(load_s1_cases())
    validate(rows)
    write_rows(rows)
    print(f"Wrote {len(rows)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
