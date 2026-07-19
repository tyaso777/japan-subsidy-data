"""Audit application-round consistency of the 28 matched accepted controls.

The first/second-call records in ``cases.csv`` contain publication-batch labels
that do not always equal the application call.  This audit therefore uses the
fixed, official-list-reconciled crosswalk and never infers the call from the
company-PDF filename.  Third/fourth-call pairs are retained and tagged with
their official selected-project list.

This script writes new audit artifacts only.  It does not modify the original
pair table or either control research batch.
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
RESIDUAL = HERE.parent / "applicant_median_residual"
PAIR_PATH = RESIDUAL / "matched_accepted_pairs.csv"
CROSSWALK_PATH = RESIDUAL / "application_round_crosswalk_1_2.csv"

CORRECTED_PATH = HERE / "matched_accepted_pairs_web_corrected.csv"
AUDIT_CSV_PATH = HERE / "control_round_mismatch_audit.csv"
AUDIT_JSON_PATH = HERE / "control_round_mismatch_audit.json"

OFFICIAL_LISTS = {
    "1次": "https://seichotoushi-hojo.jp/assets/pdf/list_1ji.pdf",
    "2次": "https://seichotoushi-hojo.jp/assets/pdf/list_2ji.pdf",
    "3次": "https://seichotoushi-hojo.jp/assets/pdf/list_3ji.pdf",
    "4次": "https://seichotoushi-hojo.jp/assets/pdf/list_4ji.pdf",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, object]], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def bool_text(value: bool) -> str:
    return "true" if value else "false"


def audit_member(
    case_id: str,
    company: str,
    pair_round: str,
    crosswalk: dict[str, dict[str, str]],
) -> dict[str, object]:
    if pair_round in {"1次", "2次"}:
        record = crosswalk[case_id]
        application_round = record["application_round"]
        round_original = record["round_original"]
        source_url = record["official_source_url"]
        source_method = record["match_method"]
        source_note = record["note"]
    else:
        # The task explicitly keeps third/fourth-call matches unless a conflict
        # is found.  Membership was checked against the corresponding official
        # selected-project list; no earlier-round crosswalk is applicable.
        application_round = pair_round
        round_original = pair_round
        source_url = OFFICIAL_LISTS[pair_round]
        source_method = "official_selected_project_list_membership"
        source_note = ""

    return {
        "case_id": case_id,
        "company": company,
        "round_original": round_original,
        "application_round": application_round,
        "pair_round_match": application_round == pair_round,
        "raw_round_changed_by_crosswalk": round_original != application_round,
        "source_url": source_url,
        "source_method": source_method,
        "source_note": source_note,
    }


def main() -> None:
    pairs = read_csv(PAIR_PATH)
    crosswalk_rows = read_csv(CROSSWALK_PATH)
    crosswalk = {row["case_id"]: row for row in crosswalk_rows}

    assert len(pairs) == 28
    assert len(crosswalk) == 181
    assert len({row["treated_case_id"] for row in pairs}) == 28
    assert len({row["control_case_id"] for row in pairs}) == 28

    audit_rows: list[dict[str, object]] = []
    corrected_rows: list[dict[str, object]] = []
    raw_changed_members: list[dict[str, str]] = []

    for pair_index, pair in enumerate(pairs, start=1):
        pair_round = pair["round"]
        treated = audit_member(
            pair["treated_case_id"], pair["treated_company"], pair_round, crosswalk
        )
        control = audit_member(
            pair["control_case_id"], pair["control_company"], pair_round, crosswalk
        )
        pair_ok = bool(treated["pair_round_match"] and control["pair_round_match"])
        replacement_required = not pair_ok

        if treated["raw_round_changed_by_crosswalk"]:
            raw_changed_members.append(
                {
                    "role": "treated",
                    "case_id": str(treated["case_id"]),
                    "company": str(treated["company"]),
                    "round_original": str(treated["round_original"]),
                    "application_round": str(treated["application_round"]),
                }
            )
        if control["raw_round_changed_by_crosswalk"]:
            raw_changed_members.append(
                {
                    "role": "control",
                    "case_id": str(control["case_id"]),
                    "company": str(control["company"]),
                    "round_original": str(control["round_original"]),
                    "application_round": str(control["application_round"]),
                }
            )

        if pair_ok:
            action = "keep_original_pair"
            reason = (
                "Both members match the pair's application round after applying "
                "the official-list crosswalk; no replacement is required."
            )
        else:
            # This branch is intentionally fatal below: a replacement must be
            # selected and documented rather than silently carried forward.
            action = "replacement_required"
            reason = "At least one member does not match the pair application round."

        audit_rows.append(
            {
                "pair_index": pair_index,
                "pair_round": pair_round,
                "treated_case_id": pair["treated_case_id"],
                "treated_company": pair["treated_company"],
                "treated_round_original": treated["round_original"],
                "treated_application_round": treated["application_round"],
                "treated_pair_round_match": bool_text(bool(treated["pair_round_match"])),
                "treated_round_source_url": treated["source_url"],
                "control_case_id": pair["control_case_id"],
                "control_company": pair["control_company"],
                "control_round_original": control["round_original"],
                "control_application_round": control["application_round"],
                "control_pair_round_match": bool_text(bool(control["pair_round_match"])),
                "control_round_source_url": control["source_url"],
                "pair_application_round_match": bool_text(pair_ok),
                "replacement_required": bool_text(replacement_required),
                "audit_action": action,
                "audit_reason": reason,
                "original_match_distance": pair["match_distance"],
                "original_industry_exact_match": pair["industry_exact_match"],
                "original_shared_scale_variable_n": pair["shared_scale_variable_n"],
            }
        )

        corrected_rows.append(
            {
                **pair,
                "treated_round_original": treated["round_original"],
                "treated_application_round": treated["application_round"],
                "control_round_original": control["round_original"],
                "control_application_round": control["application_round"],
                "pair_application_round_match": bool_text(pair_ok),
                "round_audit_action": action,
                "round_audit_source_treated": treated["source_url"],
                "round_audit_source_control": control["source_url"],
            }
        )

    mismatch_rows = [
        row for row in audit_rows if row["pair_application_round_match"] != "true"
    ]
    replacements = [row for row in audit_rows if row["replacement_required"] == "true"]

    # The two suspected controls are corrected by the crosswalk and already
    # sit in the proper pair-round.  These asserts guard the exact issue that
    # triggered this audit.
    by_control = {row["control_company"]: row for row in audit_rows}
    jet = by_control["株式会社ジェイ・イー・ティ"]
    plan = by_control["株式会社Ｐｌａｎ・Ｄｏ・Ｓｅｅ琉球"]
    assert jet["control_round_original"] == "2次"
    assert jet["control_application_round"] == "1次"
    assert jet["pair_round"] == "1次"
    assert plan["control_round_original"] == "1次"
    assert plan["control_application_round"] == "2次"
    assert plan["pair_round"] == "2次"

    assert not mismatch_rows, mismatch_rows
    assert not replacements, replacements

    audit_fields = list(audit_rows[0])
    corrected_fields = list(corrected_rows[0])
    write_csv(AUDIT_CSV_PATH, audit_rows, audit_fields)
    write_csv(CORRECTED_PATH, corrected_rows, corrected_fields)

    summary = {
        "pair_n": len(audit_rows),
        "treated_unique_n": len({row["treated_case_id"] for row in audit_rows}),
        "control_unique_n": len({row["control_case_id"] for row in audit_rows}),
        "pair_application_round_match_n": sum(
            row["pair_application_round_match"] == "true" for row in audit_rows
        ),
        "pair_application_round_mismatch_n": len(mismatch_rows),
        "replacement_control_n": len(replacements),
        "raw_round_changed_member_n": len(raw_changed_members),
        "raw_round_changed_members": raw_changed_members,
        "pair_count_by_round": dict(Counter(row["pair_round"] for row in audit_rows)),
        "conclusion": (
            "All 28 existing pairs are application-round consistent.  JET and "
            "Plan・Do・See Ryukyu differ only between the raw cases.csv round and "
            "the audited application round, so neither requires replacement."
        ),
        "replacement_research": {
            "required": False,
            "reason": "No control was replaced; the existing web-research batches remain valid.",
        },
        "official_sources": OFFICIAL_LISTS,
        "rows": audit_rows,
    }
    AUDIT_JSON_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "pairs": len(audit_rows),
                "round_mismatches": len(mismatch_rows),
                "replacements": len(replacements),
                "raw_round_changed_members": len(raw_changed_members),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
