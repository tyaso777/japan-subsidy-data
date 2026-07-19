from __future__ import annotations

import csv
import json
from collections import Counter
from itertools import combinations
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCORE_FIELDS = [
    "demand",
    "capacity_constraint",
    "business_transformation",
    "regional_supply_chain",
    "policy_fit",
    "execution_finance",
    "crisis_or_succession",
    "external_validation",
]
EXPECTED = {
    "千寿製薬株式会社": ("core28", "1次"),
    "株式会社オティックスホールディングス": ("core28", "1次"),
    "株式会社松尾製作所": ("core28", "1次"),
    "株式会社ホテルニューアワジ": ("core28", "2次"),
    "浦島観光ホテル株式会社": ("core28", "2次"),
    "ときわ製作所株式会社": ("core28", "3次"),
    "八戸酒造株式会社": ("core28", "3次"),
    "山崎商事運輸株式会社": ("core28", "3次"),
    "株式会社シュゼット・ホールディングス": ("core28", "3次"),
    "株式会社モリシタ": ("core28", "3次"),
    "株式会社北海道ちぬやファーム": ("core28", "3次"),
    "株式会社高木製作所": ("core28", "3次"),
    "高知食糧株式会社": ("core28", "3次"),
    "オギハラ食品株式会社": ("core28", "4次"),
    "フクビ岡山株式会社": ("core28", "4次"),
    "リバードコーポレーション株式会社": ("core28", "4次"),
    "南島酒販株式会社": ("core28", "4次"),
    "奥伊吹観光株式会社": ("core28", "4次"),
    "明和工業株式会社": ("core28", "4次"),
    "株式会社ファーストライン": ("core28", "4次"),
    "株式会社博多屋": ("core28", "4次"),
    "株式会社エム・ケー・ケー": ("core28", "4次"),
    "株式会社コスモス食品": ("core28", "4次"),
    "株式会社サン海苔": ("core28", "4次"),
    "株式会社ニシムタ": ("core28", "4次"),
    "株式会社ヤマキ食品": ("core28", "4次"),
    "株式会社レクザム": ("core28", "4次"),
    "株式会社環境整備産業": ("core28", "4次"),
    "株式会社八立製作所": ("removed_after_round_correction", "1次"),
    "アサヒセイレン中部株式会社": ("removed_after_round_correction", "1次"),
}


def normalize_company(value: str) -> str:
    return "".join((value or "").replace("　", " ").split())


def company_stem(value: str) -> str:
    stem = normalize_company(value)
    for token in ("株式会社", "有限会社", "合同会社"):
        stem = stem.replace(token, "")
    return stem


def canonical_company(value: str) -> str:
    normalized = normalize_company(value)
    if normalized in EXPECTED:
        return normalized
    candidates = [company for company in EXPECTED if company_stem(company) == company_stem(normalized)]
    return candidates[0] if len(candidates) == 1 else normalized


def load_batch(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("companies", "cases", "records", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    raise ValueError(f"Unsupported JSON shape: {path}")


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    batch_paths = sorted(ROOT.glob("research_batch_*.json"))
    if not batch_paths:
        raise SystemExit("research_batch_*.json がありません")

    records: list[dict] = []
    for path in batch_paths:
        records.extend(load_batch(path))

    errors: list[str] = []
    seen: Counter[str] = Counter()
    for record in records:
        company = canonical_company(record.get("company", ""))
        record["company"] = company
        seen[company] += 1
        if company not in EXPECTED:
            errors.append(f"対象外又は表記不一致: {company}")
            continue
        expected_population, expected_round = EXPECTED[company]
        if record.get("population") != expected_population:
            errors.append(
                f"population不一致: {company}: {record.get('population')} != {expected_population}"
            )
        if record.get("application_round") != expected_round:
            errors.append(
                f"round不一致: {company}: {record.get('application_round')} != {expected_round}"
            )
        scores = record.get("scores") or {}
        for field in SCORE_FIELDS:
            value = scores.get(field)
            if not isinstance(value, int) or value not in range(4):
                errors.append(f"score不正: {company}.{field}={value}")
        facts = record.get("web_facts") or []
        if len(facts) < 2:
            errors.append(f"外部事実が2件未満: {company}={len(facts)}")
        urls = {fact.get("url") for fact in facts if fact.get("url")}
        if len(urls) < 2:
            errors.append(f"独立URLが2件未満: {company}={len(urls)}")
        for fact in facts:
            if not str(fact.get("claim", "")).strip():
                errors.append(f"claim不足: {company}: {fact.get('url')}")
            if not str(fact.get("source_title", "")).strip():
                errors.append(f"source_title不足: {company}: {fact.get('url')}")
            if fact.get("timing") not in {
                "pre_or_contemporaneous",
                "post_adoption",
                "undated",
            }:
                errors.append(f"timing不正: {company}: {fact.get('timing')}")
            if fact.get("source_type") not in {
                "company", "government", "customer_supplier", "finance", "media", "other"
            }:
                errors.append(f"source_type不正: {company}: {fact.get('source_type')}")
            if not str(fact.get("published_at", "")).strip():
                errors.append(f"published_at不足: {company}: {fact.get('url')}")
            if not str(fact.get("url", "")).startswith(("https://", "http://")):
                errors.append(f"URL不正: {company}: {fact.get('url')}")

    missing = sorted(set(EXPECTED) - set(seen))
    duplicates = sorted(company for company, count in seen.items() if count != 1)
    if missing:
        errors.append("不足企業: " + "、".join(missing))
    if duplicates:
        errors.append("重複企業: " + "、".join(duplicates))

    fact_rows: list[dict] = []
    company_rows: list[dict] = []
    for record in sorted(records, key=lambda row: (row.get("application_round", ""), row.get("company", ""))):
        company = record["company"]
        facts = record.get("web_facts") or []
        scores = record.get("scores") or {}
        timings = Counter(fact.get("timing", "") for fact in facts)
        source_types = Counter(fact.get("source_type", "") for fact in facts)
        row = {
            "case_id": record.get("case_id", ""),
            "company": company,
            "population": record.get("population", ""),
            "application_round": record.get("application_round", ""),
            "identity_check": record.get("identity_check", ""),
            "fact_n": len(facts),
            "unique_url_n": len({fact.get("url") for fact in facts if fact.get("url")}),
            "pre_or_contemporaneous_n": timings["pre_or_contemporaneous"],
            "post_adoption_n": timings["post_adoption"],
            "undated_n": timings["undated"],
            "primary_source_n": sum(
                source_types[key] for key in ("company", "government", "customer_supplier", "finance")
            ),
            "score_total": sum(int(scores.get(field, 0) or 0) for field in SCORE_FIELDS),
            "strong_feature_n": sum(int(scores.get(field, 0) or 0) >= 2 for field in SCORE_FIELDS),
            **{field: scores.get(field, "") for field in SCORE_FIELDS},
            "plausible_reason": record.get("plausible_reason", ""),
            "counterevidence": record.get("counterevidence", ""),
            "confidence": record.get("confidence", ""),
            "research_gaps": record.get("research_gaps", ""),
        }
        company_rows.append(row)
        for index, fact in enumerate(facts, start=1):
            fact_rows.append(
                {
                    "case_id": record.get("case_id", ""),
                    "company": company,
                    "population": record.get("population", ""),
                    "application_round": record.get("application_round", ""),
                    "fact_no": index,
                    "claim": fact.get("claim", ""),
                    "timing": fact.get("timing", ""),
                    "source_title": fact.get("source_title", ""),
                    "url": fact.get("url", ""),
                    "source_type": fact.get("source_type", ""),
                    "published_at": fact.get("published_at", ""),
                }
            )

    core = [row for row in company_rows if row["population"] == "core28"]
    commonality_rows: list[dict] = []
    for feature in SCORE_FIELDS:
        for threshold in (1, 2, 3):
            n = sum(int(row[feature]) >= threshold for row in core)
            commonality_rows.append(
                {
                    "feature": feature,
                    "threshold": f">={threshold}",
                    "core28_n": n,
                    "core28_pct": round(n / len(core) * 100, 1) if core else 0,
                }
            )

    pair_rows: list[dict] = []
    for left, right in combinations(SCORE_FIELDS, 2):
        n = sum(int(row[left]) >= 2 and int(row[right]) >= 2 for row in core)
        pair_rows.append(
            {
                "feature_1": left,
                "feature_2": right,
                "core28_n_both_ge2": n,
                "core28_pct_both_ge2": round(n / len(core) * 100, 1) if core else 0,
            }
        )
    pair_rows.sort(key=lambda row: (-row["core28_n_both_ge2"], row["feature_1"], row["feature_2"]))

    company_fields = [
        "case_id", "company", "population", "application_round", "identity_check",
        "fact_n", "unique_url_n", "pre_or_contemporaneous_n", "post_adoption_n", "undated_n",
        "primary_source_n", "score_total", "strong_feature_n", *SCORE_FIELDS,
        "plausible_reason", "counterevidence", "confidence", "research_gaps",
    ]
    fact_fields = [
        "case_id", "company", "population", "application_round", "fact_no", "claim", "timing",
        "source_title", "url", "source_type", "published_at",
    ]
    write_csv(ROOT / "company_findings_30.csv", company_rows, company_fields)
    write_csv(ROOT / "web_evidence_facts.csv", fact_rows, fact_fields)
    write_csv(
        ROOT / "commonality_summary.csv",
        commonality_rows,
        ["feature", "threshold", "core28_n", "core28_pct"],
    )
    write_csv(
        ROOT / "feature_pair_summary.csv",
        pair_rows,
        ["feature_1", "feature_2", "core28_n_both_ge2", "core28_pct_both_ge2"],
    )
    (ROOT / "web_research_compiled.json").write_text(
        json.dumps(
            {
                "record_n": len(records),
                "core28_n": len(core),
                "errors": errors,
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (ROOT / "validation_errors.txt").write_text(
        "\n".join(errors) + ("\n" if errors else ""), encoding="utf-8"
    )
    print(json.dumps({"records": len(records), "core28": len(core), "errors": len(errors)}, ensure_ascii=False))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
