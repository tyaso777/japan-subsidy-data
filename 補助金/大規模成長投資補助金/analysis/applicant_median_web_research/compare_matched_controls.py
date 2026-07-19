from __future__ import annotations

import csv
import json
import math
from collections import Counter
from pathlib import Path

from compile_web_research import SCORE_FIELDS, canonical_company, load_batch, write_csv


ROOT = Path(__file__).resolve().parent
PAIR_PATH = ROOT / "matched_accepted_pairs_web_corrected.csv"


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def fisher_two_sided(a: int, b: int, c: int, d: int) -> float:
    row1 = a + b
    row2 = c + d
    col1 = a + c
    total = row1 + row2

    def probability(x: int) -> float:
        return math.comb(col1, x) * math.comb(total - col1, row1 - x) / math.comb(total, row1)

    low = max(0, row1 - (total - col1))
    high = min(row1, col1)
    observed = probability(a)
    return min(1.0, sum(probability(x) for x in range(low, high + 1) if probability(x) <= observed + 1e-15))


def sign_test_two_sided(positive: int, negative: int) -> float:
    n = positive + negative
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, k) for k in range(0, min(positive, negative) + 1)) / (2**n)
    return min(1.0, 2 * tail)


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    """Return Benjamini-Hochberg adjusted q-values in input order."""
    n = len(p_values)
    order = sorted(range(n), key=lambda index: p_values[index])
    adjusted = [1.0] * n
    running = 1.0
    for reverse_rank, index in enumerate(reversed(order), start=1):
        rank = n - reverse_rank + 1
        running = min(running, p_values[index] * n / rank)
        adjusted[index] = min(1.0, running)
    return adjusted


def load_records(pattern: str) -> list[dict]:
    records: list[dict] = []
    for path in sorted(ROOT.glob(pattern)):
        records.extend(load_batch(path))
    return records


def main() -> None:
    pairs = read_csv(PAIR_PATH)
    target_records = load_records("research_batch_*.json")
    control_records = load_records("control_research_batch_*.json")

    target_by_company = {canonical_company(row.get("company", "")): row for row in target_records}

    # アサヒセイレン中部は回次補正で対象群から外れたが、既存マッチングでは対照企業である。
    # 対象30社調査の同社レコードを対照側にも再利用し、同じ事実を二重調査しない。
    asahi = target_by_company.get("アサヒセイレン中部株式会社")
    if asahi and not any(canonical_company(row.get("company", "")) == "アサヒセイレン中部株式会社" for row in control_records):
        control_records.append({**asahi, "population": "matched_accepted_control"})

    expected_controls = {canonical_company(pair["control_company"]): pair for pair in pairs}
    canonical_controls: dict[str, dict] = {}
    errors: list[str] = []
    for record in control_records:
        company = canonical_company(record.get("company", ""))
        record["company"] = company
        if company not in expected_controls:
            errors.append(f"対象外対照企業: {company}")
            continue
        if company in canonical_controls:
            errors.append(f"対照企業重複: {company}")
        expected_pair = expected_controls[company]
        if record.get("case_id") != expected_pair["control_case_id"]:
            errors.append(
                f"対照case_id不一致: {company}: {record.get('case_id')} != {expected_pair['control_case_id']}"
            )
        if record.get("application_round") != expected_pair["round"]:
            errors.append(
                f"対照round不一致: {company}: {record.get('application_round')} != {expected_pair['round']}"
            )
        if record.get("population") != "matched_accepted_control":
            errors.append(f"対照population不一致: {company}: {record.get('population')}")
        scores = record.get("scores") or {}
        for feature in SCORE_FIELDS:
            value = scores.get(feature)
            if not isinstance(value, int) or value not in range(4):
                errors.append(f"対照score不正: {company}.{feature}={value}")
        facts = record.get("web_facts") or []
        if len(facts) < 2:
            errors.append(f"対照外部事実が2件未満: {company}={len(facts)}")
        urls = {fact.get("url") for fact in facts if fact.get("url")}
        if len(urls) < 2:
            errors.append(f"対照独立URLが2件未満: {company}={len(urls)}")
        for fact in facts:
            if fact.get("timing") not in {
                "pre_or_contemporaneous", "post_adoption", "undated"
            }:
                errors.append(f"対照timing不正: {company}: {fact.get('timing')}")
            if not str(fact.get("url", "")).startswith(("https://", "http://")):
                errors.append(f"対照URL不正: {company}: {fact.get('url')}")
            if not str(fact.get("source_title", "")).strip():
                errors.append(f"対照source_title不足: {company}: {fact.get('url')}")
        canonical_controls[company] = record

    missing_controls = sorted(set(expected_controls) - set(canonical_controls))
    if missing_controls:
        errors.append("不足対照企業: " + "、".join(missing_controls))

    pair_rows: list[dict] = []
    control_rows: list[dict] = []
    for pair in pairs:
        treated = canonical_company(pair["treated_company"])
        control = canonical_company(pair["control_company"])
        target_record = target_by_company.get(treated)
        control_record = canonical_controls.get(control)
        if target_record is None:
            errors.append(f"対象群レコード不足: {treated}")
            continue
        if control_record is None:
            continue
        target_scores = target_record.get("scores") or {}
        control_scores = control_record.get("scores") or {}
        row = {
            "round": pair["round"],
            "treated_case_id": pair["treated_case_id"],
            "treated_company": treated,
            "control_case_id": pair["control_case_id"],
            "control_company": control,
        }
        for feature in SCORE_FIELDS:
            tv = int(target_scores.get(feature, 0))
            cv = int(control_scores.get(feature, 0))
            row[f"treated_{feature}"] = tv
            row[f"control_{feature}"] = cv
            row[f"diff_{feature}"] = tv - cv
        pair_rows.append(row)

        facts = control_record.get("web_facts") or []
        timings = Counter(fact.get("timing", "") for fact in facts)
        control_rows.append(
            {
                "case_id": pair["control_case_id"],
                "company": control,
                "application_round": pair["round"],
                "matched_treated_company": treated,
                "fact_n": len(facts),
                "unique_url_n": len({fact.get("url") for fact in facts if fact.get("url")}),
                "pre_or_contemporaneous_n": timings["pre_or_contemporaneous"],
                "post_adoption_n": timings["post_adoption"],
                "undated_n": timings["undated"],
                "score_total": sum(int(control_scores.get(feature, 0)) for feature in SCORE_FIELDS),
                **{feature: control_scores.get(feature, "") for feature in SCORE_FIELDS},
                "plausible_reason": control_record.get("plausible_reason", ""),
                "counterevidence": control_record.get("counterevidence", ""),
                "confidence": control_record.get("confidence", ""),
                "research_gaps": control_record.get("research_gaps", ""),
            }
        )

    comparison_rows: list[dict] = []
    target_core = [row for row in target_records if row.get("population") == "core28"]
    for feature in SCORE_FIELDS:
        for threshold in (1, 2, 3):
            target_yes = sum(int((row.get("scores") or {}).get(feature, 0)) >= threshold for row in target_core)
            control_yes = sum(int((row.get("scores") or {}).get(feature, 0)) >= threshold for row in canonical_controls.values())
            target_no = len(target_core) - target_yes
            control_no = len(canonical_controls) - control_yes
            odds_ratio = ((target_yes + 0.5) * (control_no + 0.5)) / ((target_no + 0.5) * (control_yes + 0.5))
            comparison_rows.append(
                {
                    "feature": feature,
                    "threshold": f">={threshold}",
                    "target_n": target_yes,
                    "target_pct": round(target_yes / len(target_core) * 100, 1) if target_core else 0,
                    "control_n": control_yes,
                    "control_pct": round(control_yes / len(canonical_controls) * 100, 1) if canonical_controls else 0,
                    "difference_pct_point": round(
                        (target_yes / len(target_core) - control_yes / len(canonical_controls)) * 100, 1
                    ) if target_core and canonical_controls else 0,
                    "odds_ratio_haldane": round(odds_ratio, 3),
                    "fisher_two_sided_p": round(fisher_two_sided(target_yes, target_no, control_yes, control_no), 6),
                }
            )

    comparison_q = benjamini_hochberg(
        [float(row["fisher_two_sided_p"]) for row in comparison_rows]
    )
    for row, q_value in zip(comparison_rows, comparison_q):
        row["fisher_bh_q_24tests"] = round(q_value, 6)

    matched_summary: list[dict] = []
    for feature in SCORE_FIELDS:
        diffs = [int(row[f"diff_{feature}"]) for row in pair_rows]
        positive = sum(value > 0 for value in diffs)
        equal = sum(value == 0 for value in diffs)
        negative = sum(value < 0 for value in diffs)
        matched_summary.append(
            {
                "feature": feature,
                "pair_n": len(diffs),
                "target_higher_n": positive,
                "equal_n": equal,
                "target_lower_n": negative,
                "mean_paired_difference": round(sum(diffs) / len(diffs), 3) if diffs else "",
                "sign_test_two_sided_p": round(sign_test_two_sided(positive, negative), 6),
            }
        )


    matched_q = benjamini_hochberg(
        [float(row["sign_test_two_sided_p"]) for row in matched_summary]
    )
    for row, q_value in zip(matched_summary, matched_q):
        row["sign_test_bh_q_8tests"] = round(q_value, 6)

    control_fields = [
        "case_id", "company", "application_round", "matched_treated_company", "fact_n", "unique_url_n",
        "pre_or_contemporaneous_n", "post_adoption_n", "undated_n", "score_total", *SCORE_FIELDS,
        "plausible_reason", "counterevidence", "confidence", "research_gaps",
    ]
    pair_fields = [
        "round", "treated_case_id", "treated_company", "control_case_id", "control_company",
        *[item for feature in SCORE_FIELDS for item in (f"treated_{feature}", f"control_{feature}", f"diff_{feature}")],
    ]
    write_csv(ROOT / "matched_control_findings_28.csv", control_rows, control_fields)
    write_csv(ROOT / "matched_pair_score_comparison.csv", pair_rows, pair_fields)
    write_csv(
        ROOT / "target_control_feature_comparison.csv",
        comparison_rows,
        ["feature", "threshold", "target_n", "target_pct", "control_n", "control_pct", "difference_pct_point", "odds_ratio_haldane", "fisher_two_sided_p", "fisher_bh_q_24tests"],
    )
    write_csv(
        ROOT / "matched_pair_summary.csv",
        matched_summary,
        ["feature", "pair_n", "target_higher_n", "equal_n", "target_lower_n", "mean_paired_difference", "sign_test_two_sided_p", "sign_test_bh_q_8tests"],
    )
    (ROOT / "control_validation_errors.txt").write_text(
        "\n".join(errors) + ("\n" if errors else ""), encoding="utf-8"
    )
    print(json.dumps({"controls": len(canonical_controls), "pairs": len(pair_rows), "errors": len(errors)}, ensure_ascii=False))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
