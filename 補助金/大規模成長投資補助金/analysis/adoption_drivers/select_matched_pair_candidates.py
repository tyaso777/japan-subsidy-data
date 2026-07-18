"""Select a stratified set of accepted-company pairs for manual PDF review.

Pairs are matched within the same application round and the same broad industry.
The matching objective favors similar project cost, subsidy amount and baseline
sales, while requiring a visible quantitative-outcome gap.  Five previously
reviewed pairs are retained so the expanded review remains comparable.

This script does *not* score qualitative evidence.  It creates an auditable
review packet from the extracted public-PDF text; qualitative coding is a
separate human-review step.
"""

from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
CASES_PATH = PROJECT_DIR / "data" / "processed" / "cases.csv"
PROFILES_PATH = HERE / "application_profiles.csv"
DIAGNOSTICS_PATH = HERE / "company_diagnostics.csv"
PAGES_PATH = PROJECT_DIR / "data" / "text" / "pages.jsonl"
TMP_DIR = PROJECT_DIR / "tmp" / "pdfs"

ROUND_QUOTAS = {"1次": 8, "2次": 4, "3次": 14, "4次": 14}
MANUFACTURING_CAP = {"1次": 5, "2次": 4, "3次": 8, "4次": 8}

FORCED_PAIRS = [
    ("中本Fine Pack株式会社", "株式会社PXP"),
    ("中央製乳株式会社", "至誠堂製薬株式会社"),
    ("フクビ岡山株式会社", "株式会社キィポーション"),
    ("長野牛乳株式会社", "栄屋乳業株式会社"),
    ("杉プラスチック工業株式会社", "株式会社シー・エス・ケイ"),
]

CATEGORY_KEYWORDS = {
    "需要証拠": (
        "顧客",
        "受注",
        "要請",
        "引き合い",
        "引合",
        "注文",
        "販売先",
        "取引先",
        "契約",
        "内示",
    ),
    "能力制約": (
        "能力",
        "限界",
        "ボトルネック",
        "スペース",
        "老朽",
        "人手不足",
        "逼迫",
        "リードタイム",
        "外注",
    ),
    "事業モデル変革": (
        "内製",
        "統合",
        "一貫",
        "ODM",
        "OEM",
        "新規事業",
        "新市場",
        "海外",
        "輸出",
        "高付加価値",
        "転換",
    ),
    "地域代替困難性": (
        "地域",
        "地元",
        "雇用",
        "仕入",
        "生産者",
        "供給網",
        "サプライチェーン",
        "農家",
        "酪農",
        "災害",
    ),
    "実行可能性": (
        "用地",
        "取得",
        "設計",
        "認証",
        "銀行",
        "金融",
        "資金",
        "実証",
        "共同開発",
        "特許",
        "許可",
    ),
    "政策戦略適合": (
        "半導体",
        "GX",
        "脱炭素",
        "経済安全保障",
        "医療",
        "医薬",
        "防衛",
        "宇宙",
        "生成AI",
        "AI",
        "食料安全保障",
        "資源循環",
    ),
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def positive(value: Any) -> float | None:
    number = to_float(value)
    return number if number is not None and number > 0 else None


def log_ratio(left: float | None, right: float | None) -> float:
    if left is None or right is None:
        return 0.45
    return abs(math.log(left / right))


def industry_group(industry: str) -> str:
    if industry == "製造業":
        return "製造業"
    return industry or "業種不明"


def load_records() -> dict[str, dict[str, Any]]:
    cases = {row["company"]: row for row in read_csv(CASES_PATH)}
    profiles = {row["company"]: row for row in read_csv(PROFILES_PATH)}
    diagnostics = {row["company"]: row for row in read_csv(DIAGNOSTICS_PATH)}
    records: dict[str, dict[str, Any]] = {}
    for company, case in cases.items():
        profile = profiles.get(company)
        diagnostic = diagnostics.get(company)
        if not profile or not diagnostic:
            continue
        score = to_float(profile.get("quantitative_axis_mean"))
        visible_count = to_float(diagnostic.get("visible_metric_count"))
        cost = positive(case.get("project_cost_million_yen"))
        subsidy = positive(case.get("subsidy_million_yen"))
        if score is None or visible_count is None or visible_count < 4 or cost is None:
            continue
        records[company] = {
            "company": company,
            "case_id": case["case_id"],
            "round": case["round"],
            "industry": case["industry"],
            "industry_group": industry_group(case["industry"]),
            "project_cost_oku": cost / 100.0,
            "subsidy_oku": subsidy / 100.0 if subsidy is not None else None,
            "baseline_sales_oku": positive(case.get("sales_baseline_oku_yen")),
            "quantitative_score": score,
            "visible_metric_count": int(visible_count),
            "analysis_exclusion_recommended": str(
                case.get("analysis_exclusion_recommended", "")
            ).lower()
            == "true",
            "sales_increase_oku": to_float(case.get("sales_increase_oku_yen")),
            "labor_cagr_pct": to_float(case.get("labor_annual_rate_pct")),
            "employee_pay_cagr_pct": to_float(case.get("employee_pay_annual_rate_pct")),
            "payroll_increase_proxy_oku": to_float(
                case.get("employee_pay_total_increase_estimated_oku")
            ),
            "employees_base": to_float(case.get("employees_base_value")),
            "employees_target": to_float(case.get("employees_target_value")),
            "pdf_url": case["pdf_url"],
        }
    return records


def pair_candidate(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any] | None:
    if left["analysis_exclusion_recommended"] or right["analysis_exclusion_recommended"]:
        return None
    if left["round"] != right["round"]:
        return None
    if left["industry_group"] != right["industry_group"]:
        return None
    score_gap = abs(left["quantitative_score"] - right["quantitative_score"])
    if score_gap < 0.08:
        return None
    cost_distance = log_ratio(left["project_cost_oku"], right["project_cost_oku"])
    subsidy_distance = log_ratio(left["subsidy_oku"], right["subsidy_oku"])
    sales_distance = log_ratio(left["baseline_sales_oku"], right["baseline_sales_oku"])
    if cost_distance > math.log(2.0) or subsidy_distance > math.log(2.2):
        return None
    if left["baseline_sales_oku"] and right["baseline_sales_oku"]:
        if sales_distance > math.log(4.0):
            return None
    focal, comparison = sorted(
        (left, right), key=lambda row: row["quantitative_score"]
    )
    match_distance = cost_distance + 0.45 * subsidy_distance + 0.25 * sales_distance
    selection_score = match_distance - min(score_gap, 1.0) * 0.20
    return {
        "focal": focal,
        "comparison": comparison,
        "score_gap": score_gap,
        "match_distance": match_distance,
        "selection_score": selection_score,
    }


def make_forced_pairs(records: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for left_name, right_name in FORCED_PAIRS:
        left = records[left_name]
        right = records[right_name]
        candidate = pair_candidate(left, right)
        if candidate is None:
            focal, comparison = sorted(
                (left, right), key=lambda row: row["quantitative_score"]
            )
            candidate = {
                "focal": focal,
                "comparison": comparison,
                "score_gap": abs(
                    focal["quantitative_score"] - comparison["quantitative_score"]
                ),
                "match_distance": (
                    log_ratio(focal["project_cost_oku"], comparison["project_cost_oku"])
                    + 0.45
                    * log_ratio(focal["subsidy_oku"], comparison["subsidy_oku"])
                    + 0.25
                    * log_ratio(
                        focal["baseline_sales_oku"], comparison["baseline_sales_oku"]
                    )
                ),
                "selection_score": 0.0,
            }
        candidate["forced_prior_review"] = True
        output.append(candidate)
    return output


def select_pairs(records: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    selected = make_forced_pairs(records)
    used = {
        row[side]["company"] for row in selected for side in ("focal", "comparison")
    }
    round_counts = defaultdict(int)
    manufacturing_counts = defaultdict(int)
    for row in selected:
        round_label = row["focal"]["round"]
        round_counts[round_label] += 1
        if row["focal"]["industry_group"] == "製造業":
            manufacturing_counts[round_label] += 1

    candidates: list[dict[str, Any]] = []
    rows = list(records.values())
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            candidate = pair_candidate(left, right)
            if candidate:
                candidate["forced_prior_review"] = False
                candidates.append(candidate)
    candidates.sort(key=lambda row: row["selection_score"])

    while any(round_counts[r] < quota for r, quota in ROUND_QUOTAS.items()):
        added = False
        for candidate in candidates:
            focal = candidate["focal"]
            comparison = candidate["comparison"]
            round_label = focal["round"]
            if round_counts[round_label] >= ROUND_QUOTAS[round_label]:
                continue
            if focal["company"] in used or comparison["company"] in used:
                continue
            is_manufacturing = focal["industry_group"] == "製造業"
            if (
                is_manufacturing
                and manufacturing_counts[round_label]
                >= MANUFACTURING_CAP[round_label]
            ):
                continue
            selected.append(candidate)
            used.update((focal["company"], comparison["company"]))
            round_counts[round_label] += 1
            if is_manufacturing:
                manufacturing_counts[round_label] += 1
            candidates.remove(candidate)
            added = True
            break
        if not added:
            # Relax only the manufacturing cap; never relax same-round/industry
            # matching or the unique-company rule.
            for candidate in candidates:
                focal = candidate["focal"]
                comparison = candidate["comparison"]
                round_label = focal["round"]
                if round_counts[round_label] >= ROUND_QUOTAS[round_label]:
                    continue
                if focal["company"] in used or comparison["company"] in used:
                    continue
                selected.append(candidate)
                used.update((focal["company"], comparison["company"]))
                round_counts[round_label] += 1
                if focal["industry_group"] == "製造業":
                    manufacturing_counts[round_label] += 1
                candidates.remove(candidate)
                added = True
                break
        if not added:
            raise RuntimeError(
                f"Could not fill quotas: counts={dict(round_counts)}, quotas={ROUND_QUOTAS}"
            )

    selected.sort(
        key=lambda row: (
            int(row["focal"]["round"].replace("次", "")),
            row["focal"]["industry_group"] != "製造業",
            row["focal"]["industry_group"],
            row["match_distance"],
        )
    )
    return selected


def load_pages() -> dict[str, list[dict[str, Any]]]:
    pages: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with PAGES_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            pages[row["case_id"]].append(row)
    for case_pages in pages.values():
        case_pages.sort(key=lambda row: row["page"])
    return pages


def fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


def candidate_rows(pairs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for index, pair in enumerate(pairs, start=1):
        focal = pair["focal"]
        comparison = pair["comparison"]
        output.append(
            {
                "pair_id": f"L{index:02d}",
                "round": focal["round"],
                "industry": focal["industry_group"],
                "focal_company": focal["company"],
                "comparison_company": comparison["company"],
                "focal_quantitative_score": fmt(focal["quantitative_score"]),
                "comparison_quantitative_score": fmt(comparison["quantitative_score"]),
                "quantitative_score_gap": fmt(pair["score_gap"]),
                "match_distance": fmt(pair["match_distance"]),
                "focal_project_cost_oku": fmt(focal["project_cost_oku"]),
                "comparison_project_cost_oku": fmt(comparison["project_cost_oku"]),
                "focal_subsidy_oku": fmt(focal["subsidy_oku"]),
                "comparison_subsidy_oku": fmt(comparison["subsidy_oku"]),
                "focal_baseline_sales_oku": fmt(focal["baseline_sales_oku"]),
                "comparison_baseline_sales_oku": fmt(comparison["baseline_sales_oku"]),
                "focal_sales_increase_oku": fmt(focal["sales_increase_oku"]),
                "comparison_sales_increase_oku": fmt(comparison["sales_increase_oku"]),
                "focal_labor_cagr_pct": fmt(focal["labor_cagr_pct"]),
                "comparison_labor_cagr_pct": fmt(comparison["labor_cagr_pct"]),
                "focal_employee_pay_cagr_pct": fmt(focal["employee_pay_cagr_pct"]),
                "comparison_employee_pay_cagr_pct": fmt(
                    comparison["employee_pay_cagr_pct"]
                ),
                "focal_payroll_increase_proxy_oku": fmt(
                    focal["payroll_increase_proxy_oku"]
                ),
                "comparison_payroll_increase_proxy_oku": fmt(
                    comparison["payroll_increase_proxy_oku"]
                ),
                "forced_prior_review": pair["forced_prior_review"],
                "focal_analysis_exclusion_recommended": focal[
                    "analysis_exclusion_recommended"
                ],
                "comparison_analysis_exclusion_recommended": comparison[
                    "analysis_exclusion_recommended"
                ],
                "focal_pdf_url": focal["pdf_url"],
                "comparison_pdf_url": comparison["pdf_url"],
                "focal_case_id": focal["case_id"],
                "comparison_case_id": comparison["case_id"],
            }
        )
    return output


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_review_packet(
    path: Path,
    rows: list[dict[str, Any]],
    pages: dict[str, list[dict[str, Any]]],
) -> None:
    sections = [
        "# Large matched-pair manual review packet",
        "",
        "This is an intermediate review artifact generated from public PDF text.",
        "",
    ]
    for row in rows:
        sections.extend(
            [
                f"## {row['pair_id']} | {row['round']} | {row['industry']}",
                "",
                (
                    f"LOWER: {row['focal_company']} | quantitative={row['focal_quantitative_score']} "
                    f"| cost={row['focal_project_cost_oku']}億 | subsidy={row['focal_subsidy_oku']}億"
                ),
                (
                    f"HIGHER: {row['comparison_company']} | quantitative={row['comparison_quantitative_score']} "
                    f"| cost={row['comparison_project_cost_oku']}億 | subsidy={row['comparison_subsidy_oku']}億"
                ),
                "",
            ]
        )
        for side, case_field, company_field in (
            ("LOWER", "focal_case_id", "focal_company"),
            ("HIGHER", "comparison_case_id", "comparison_company"),
        ):
            sections.extend([f"### {side}: {row[company_field]}", ""])
            for page in pages[row[case_field]]:
                sections.extend(
                    [
                        f"#### Page {page['page']} - {page['role']}",
                        "",
                        page["text"].strip(),
                        "",
                    ]
                )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(sections), encoding="utf-8")


def evidence_sentences(text: str, keywords: tuple[str, ...], limit: int = 3) -> list[str]:
    normalized = re.sub(r"\s+", " ", text)
    chunks = [part.strip() for part in re.split(r"[。●•]", normalized) if part.strip()]
    ranked: list[tuple[int, int, str]] = []
    seen: set[str] = set()
    for chunk in chunks:
        if len(chunk) < 18 or chunk in seen:
            continue
        hits = sum(keyword.lower() in chunk.lower() for keyword in keywords)
        if not hits:
            continue
        seen.add(chunk)
        numeric_bonus = int(bool(re.search(r"\d", chunk)))
        ranked.append((hits, numeric_bonus, chunk))
    ranked.sort(key=lambda item: (-item[0], -item[1], len(item[2])))
    return [item[2][:360] for item in ranked[:limit]]


def write_review_briefs(
    path: Path,
    rows: list[dict[str, Any]],
    pages: dict[str, list[dict[str, Any]]],
) -> None:
    sections = [
        "# Targeted evidence briefs for manual coding",
        "",
        "Keyword extraction is a reading aid only; final scores require human review.",
        "",
    ]
    for row in rows:
        sections.extend(
            [
                f"## {row['pair_id']} | {row['round']} | {row['industry']}",
                "",
            ]
        )
        for side, case_field, company_field in (
            ("LOWER", "focal_case_id", "focal_company"),
            ("HIGHER", "comparison_case_id", "comparison_company"),
        ):
            text = "\n".join(page["text"] for page in pages[row[case_field]])
            sections.extend(
                [
                    f"### {side}: {row[company_field]}",
                    "",
                    (
                        "Numeric: "
                        f"cost={row['focal_project_cost_oku' if side == 'LOWER' else 'comparison_project_cost_oku']}億, "
                        f"sales increase={row['focal_sales_increase_oku' if side == 'LOWER' else 'comparison_sales_increase_oku']}億, "
                        f"labor CAGR={row['focal_labor_cagr_pct' if side == 'LOWER' else 'comparison_labor_cagr_pct']}%, "
                        f"pay CAGR={row['focal_employee_pay_cagr_pct' if side == 'LOWER' else 'comparison_employee_pay_cagr_pct']}%"
                    ),
                    "",
                ]
            )
            for category, keywords in CATEGORY_KEYWORDS.items():
                hits = evidence_sentences(text, keywords)
                sections.append(f"- {category}:")
                if hits:
                    sections.extend(f"  - {hit}" for hit in hits)
                else:
                    sections.append("  - （抽出なし）")
            sections.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(sections), encoding="utf-8")


def main() -> None:
    records = load_records()
    pairs = select_pairs(records)
    rows = candidate_rows(pairs)
    pages = load_pages()
    output_csv = TMP_DIR / "large_pair_candidates.csv"
    output_packet = TMP_DIR / "large_pair_review_packet.md"
    output_briefs = TMP_DIR / "large_pair_review_briefs.md"
    write_csv(output_csv, rows)
    write_review_packet(output_packet, rows, pages)
    write_review_briefs(output_briefs, rows, pages)
    counts = defaultdict(int)
    for row in rows:
        counts[(row["round"], row["industry"])] += 1
    print(f"Selected {len(rows)} unique-company pairs")
    print(f"Round counts: {dict((r, sum(x['round'] == r for x in rows)) for r in ROUND_QUOTAS)}")
    print(f"Strata: {dict(counts)}")
    print(output_csv)
    print(output_packet)
    print(output_briefs)


if __name__ == "__main__":
    main()
