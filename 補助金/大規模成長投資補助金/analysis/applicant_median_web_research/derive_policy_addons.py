from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from compile_web_research import canonical_company, load_batch, write_csv


ROOT = Path(__file__).resolve().parent
CASES_PATH = ROOT.parents[1] / "data" / "processed" / "cases.csv"


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def has_pattern(text: str, pattern: str) -> bool:
    return re.search(pattern, text, re.IGNORECASE) is not None


def main() -> None:
    records: list[dict] = []
    for path in sorted(ROOT.glob("research_batch_*.json")):
        records.extend(load_batch(path))
    cases = {row["case_id"]: row for row in load_csv(CASES_PATH)}

    fields = {
        "financial_confirmation": r"確認書.{0,20}(提出|記載)|金融機関確認書",
        "regional_future_company": r"地域未来牽引企業",
        "regional_economic_plan": r"地域経済牽引事業計画",
        "partnership_declaration": r"パートナーシップ構築宣言",
        "eruboshi": r"えるぼし",
        "kurumin": r"くるみん",
        "health_management": r"健康経営優良法人|健康経営",
        "location_agreement_or_public_commitment": r"立地協定|進出協定|企業立地|自治体.{0,12}(公表|協定|支援)",
        "equity_or_succession_investor": r"事業承継|ファンド|出資|資本参加|M&A|買収|子会社化",
    }

    rows: list[dict] = []
    for record in records:
        facts = record.get("web_facts") or []
        fact_text = "\n".join(
            f"{fact.get('claim', '')} {fact.get('source_title', '')}" for fact in facts
        )
        case = cases.get(record.get("case_id", ""), {})
        row = {
            "case_id": record.get("case_id", ""),
            "company": canonical_company(record.get("company", "")),
            "population": record.get("population", ""),
            "application_round": record.get("application_round", ""),
            "other_participant_confirmed": bool((case.get("other_participants") or "").strip()),
            "other_participants": case.get("other_participants", ""),
            "has_consortium_in_cases": str(case.get("has_consortium", "")).lower() == "true",
        }
        for name, pattern in fields.items():
            row[name] = has_pattern(fact_text, pattern)
        rows.append(row)

    output_fields = [
        "case_id", "company", "population", "application_round",
        "financial_confirmation", "regional_future_company", "regional_economic_plan",
        "partnership_declaration", "eruboshi", "kurumin", "health_management",
        "location_agreement_or_public_commitment", "equity_or_succession_investor",
        "other_participant_confirmed", "other_participants", "has_consortium_in_cases",
    ]
    write_csv(ROOT / "policy_addon_and_external_commitment_audit.csv", rows, output_fields)

    summary = []
    core = [row for row in rows if row["population"] == "core28"]
    for field in output_fields[4:14] + ["has_consortium_in_cases"]:
        count = sum(bool(row[field]) for row in core)
        summary.append(
            {
                "feature": field,
                "core28_n": count,
                "core28_pct": round(count / len(core) * 100, 1) if core else 0,
                "meaning": "公開事実で確認。申請時の加点申告又は審査寄与を意味しない",
            }
        )
    write_csv(
        ROOT / "policy_addon_and_external_commitment_summary.csv",
        summary,
        ["feature", "core28_n", "core28_pct", "meaning"],
    )
    print(json.dumps({"records": len(rows), "core28": len(core)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
