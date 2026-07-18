"""Aggregate the 40-pair manual review of public company PDFs.

The sample contains accepted companies only.  It is designed to test how an
accepted company with a lower public quantitative profile can be supported by
qualitative evidence; it cannot estimate the probability of adoption.
"""

from __future__ import annotations

import csv
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any, Callable


HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
TMP_DIR = PROJECT_DIR / "tmp" / "pdfs"
CANDIDATES_PATH = TMP_DIR / "large_pair_candidates.csv"
CODES_PATH = HERE / "expanded_pair_manual_codes.csv"

COMPANY_OUTPUT = HERE / "expanded_pair_company_coding.csv"
PAIR_OUTPUT = HERE / "expanded_matched_pair_review.csv"
FACTOR_OUTPUT = HERE / "expanded_pair_factor_summary.csv"
SENSITIVITY_OUTPUT = HERE / "expanded_pair_sensitivity.csv"
SUMMARY_OUTPUT = HERE / "expanded_pair_summary.json"
REPORT_OUTPUT = HERE / "expanded_matched_pair_report.md"

FACTORS = (
    ("demand", "需要根拠の具体性"),
    ("constraint", "能力制約の明確さ"),
    ("transformation", "事業・工程の構造転換"),
    ("regional", "地域供給網・代替困難性"),
    ("execution", "実行確度"),
    ("strategic", "政策・戦略分野との整合"),
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def as_bool(value: Any) -> bool:
    return str(value).strip().lower() == "true"


def to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def f3(value: float) -> str:
    return f"{value:.3f}"


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return (math.nan, math.nan)
    p = successes / total
    denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return center - half, center + half


def sign_test_p(left_wins: int, right_wins: int) -> float:
    total = left_wins + right_wins
    if total == 0:
        return 1.0
    tail = min(left_wins, right_wins)
    probability = sum(math.comb(total, k) for k in range(tail + 1)) / (2**total)
    return min(1.0, 2 * probability)


def score_list(rows: list[dict[str, Any]], side: str, factor: str) -> list[int]:
    return [int(row[f"{side}_{factor}"]) for row in rows]


def factor_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for factor, label in FACTORS:
        lower = score_list(rows, "lower", factor)
        higher = score_list(rows, "higher", factor)
        lower_strong = sum(value >= 2 for value in lower)
        higher_strong = sum(value >= 2 for value in higher)
        lower_very_strong = sum(value == 3 for value in lower)
        higher_very_strong = sum(value == 3 for value in higher)
        lower_ci = wilson_interval(lower_strong, len(rows))
        higher_ci = wilson_interval(higher_strong, len(rows))
        lower_wins = sum(a > b for a, b in zip(lower, higher))
        higher_wins = sum(a < b for a, b in zip(lower, higher))
        ties = len(rows) - lower_wins - higher_wins
        output.append(
            {
                "factor": factor,
                "factor_ja": label,
                "pair_count": len(rows),
                "lower_mean_score": f3(sum(lower) / len(lower)),
                "higher_mean_score": f3(sum(higher) / len(higher)),
                "mean_score_gap_lower_minus_higher": f3(
                    (sum(lower) - sum(higher)) / len(rows)
                ),
                "lower_strong_count": lower_strong,
                "lower_strong_share": f3(lower_strong / len(rows)),
                "lower_strong_wilson95_low": f3(lower_ci[0]),
                "lower_strong_wilson95_high": f3(lower_ci[1]),
                "higher_strong_count": higher_strong,
                "higher_strong_share": f3(higher_strong / len(rows)),
                "higher_strong_wilson95_low": f3(higher_ci[0]),
                "higher_strong_wilson95_high": f3(higher_ci[1]),
                "lower_score3_count": lower_very_strong,
                "lower_score3_share": f3(lower_very_strong / len(rows)),
                "higher_score3_count": higher_very_strong,
                "higher_score3_share": f3(higher_very_strong / len(rows)),
                "lower_score_higher_pairs": lower_wins,
                "equal_score_pairs": ties,
                "higher_score_higher_pairs": higher_wins,
                "paired_sign_test_p": f3(sign_test_p(lower_wins, higher_wins)),
            }
        )
    return output


def strong_names(row: dict[str, Any], side: str, threshold: int = 2) -> str:
    return " / ".join(
        label for factor, label in FACTORS if int(row[f"{side}_{factor}"]) >= threshold
    )


def make_pair_rows(
    candidates: list[dict[str, str]], codes: list[dict[str, str]]
) -> list[dict[str, Any]]:
    candidate_map = {row["pair_id"]: row for row in candidates}
    code_map = {row["pair_id"]: row for row in codes}
    if candidate_map.keys() != code_map.keys():
        missing_codes = sorted(candidate_map.keys() - code_map.keys())
        missing_candidates = sorted(code_map.keys() - candidate_map.keys())
        raise ValueError(
            f"Pair IDs differ: missing codes={missing_codes}, missing candidates={missing_candidates}"
        )

    output: list[dict[str, Any]] = []
    for pair_id in sorted(candidate_map):
        candidate = candidate_map[pair_id]
        code = code_map[pair_id]
        row: dict[str, Any] = {
            "pair_id": pair_id,
            "round": candidate["round"],
            "industry": candidate["industry"],
            "lower_company": candidate["focal_company"],
            "higher_company": candidate["comparison_company"],
            "lower_quantitative_score": candidate["focal_quantitative_score"],
            "higher_quantitative_score": candidate["comparison_quantitative_score"],
            "quantitative_score_gap": candidate["quantitative_score_gap"],
            "match_distance": candidate["match_distance"],
            "lower_project_cost_oku": candidate["focal_project_cost_oku"],
            "higher_project_cost_oku": candidate["comparison_project_cost_oku"],
            "lower_subsidy_oku": candidate["focal_subsidy_oku"],
            "higher_subsidy_oku": candidate["comparison_subsidy_oku"],
            "lower_baseline_sales_oku": candidate["focal_baseline_sales_oku"],
            "higher_baseline_sales_oku": candidate["comparison_baseline_sales_oku"],
            "forced_prior_review": candidate["forced_prior_review"],
            "lower_analysis_exclusion_recommended": candidate[
                "focal_analysis_exclusion_recommended"
            ],
            "higher_analysis_exclusion_recommended": candidate[
                "comparison_analysis_exclusion_recommended"
            ],
        }
        for factor, _ in FACTORS:
            row[f"lower_{factor}"] = int(code[f"lower_{factor}"])
            row[f"higher_{factor}"] = int(code[f"higher_{factor}"])
        row["lower_qualitative_total"] = sum(
            row[f"lower_{factor}"] for factor, _ in FACTORS
        )
        row["higher_qualitative_total"] = sum(
            row[f"higher_{factor}"] for factor, _ in FACTORS
        )
        row["lower_core_strong_count"] = sum(
            row[f"lower_{factor}"] >= 2
            for factor in ("demand", "constraint", "transformation", "regional")
        )
        row["higher_core_strong_count"] = sum(
            row[f"higher_{factor}"] >= 2
            for factor in ("demand", "constraint", "transformation", "regional")
        )
        row["lower_strong_factors"] = strong_names(row, "lower")
        row["higher_strong_factors"] = strong_names(row, "higher")
        row["lower_evidence"] = code["lower_evidence"]
        row["higher_evidence"] = code["higher_evidence"]
        row["pair_interpretation"] = code["pair_interpretation"]
        row["coding_confidence"] = code["coding_confidence"]
        row["lower_pdf_url"] = candidate["focal_pdf_url"]
        row["higher_pdf_url"] = candidate["comparison_pdf_url"]
        output.append(row)
    return output


def make_company_rows(pair_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in pair_rows:
        for side, role in (("lower", "公開定量スコア低位"), ("higher", "公開定量スコア高位")):
            item: dict[str, Any] = {
                "pair_id": row["pair_id"],
                "round": row["round"],
                "industry": row["industry"],
                "pair_role": role,
                "company": row[f"{side}_company"],
                "quantitative_score": row[f"{side}_quantitative_score"],
                "project_cost_oku": row[f"{side}_project_cost_oku"],
                "subsidy_oku": row[f"{side}_subsidy_oku"],
            }
            for factor, _ in FACTORS:
                item[factor] = row[f"{side}_{factor}"]
            item["qualitative_total"] = row[f"{side}_qualitative_total"]
            item["core_strong_count"] = row[f"{side}_core_strong_count"]
            item["strong_factors"] = row[f"{side}_strong_factors"]
            item["evidence"] = row[f"{side}_evidence"]
            item["coding_confidence"] = row["coding_confidence"]
            item["analysis_exclusion_recommended"] = row[
                f"{side}_analysis_exclusion_recommended"
            ]
            item["pdf_url"] = row[f"{side}_pdf_url"]
            output.append(item)
    return output


def sensitivity_rows(pair_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selectors: tuple[tuple[str, Callable[[dict[str, Any]], bool]], ...] = (
        ("all_40", lambda row: True),
        ("new_35_only", lambda row: not as_bool(row["forced_prior_review"])),
        (
            "clean_numeric_only",
            lambda row: not as_bool(row["lower_analysis_exclusion_recommended"])
            and not as_bool(row["higher_analysis_exclusion_recommended"]),
        ),
        ("high_confidence_only", lambda row: row["coding_confidence"] == "high"),
        ("rounds_3_4", lambda row: row["round"] in {"3次", "4次"}),
        ("manufacturing", lambda row: row["industry"] == "製造業"),
        ("non_manufacturing", lambda row: row["industry"] != "製造業"),
    )
    output: list[dict[str, Any]] = []
    for subset, selector in selectors:
        rows = [row for row in pair_rows if selector(row)]
        if not rows:
            continue
        for factor, label in FACTORS:
            lower = score_list(rows, "lower", factor)
            higher = score_list(rows, "higher", factor)
            output.append(
                {
                    "subset": subset,
                    "pair_count": len(rows),
                    "measure": factor,
                    "measure_ja": label,
                    "lower_strong_share": f3(sum(x >= 2 for x in lower) / len(rows)),
                    "higher_strong_share": f3(sum(x >= 2 for x in higher) / len(rows)),
                    "lower_mean_score": f3(sum(lower) / len(rows)),
                    "higher_mean_score": f3(sum(higher) / len(rows)),
                }
            )
        lower_core2 = sum(row["lower_core_strong_count"] >= 2 for row in rows)
        lower_core3 = sum(row["lower_core_strong_count"] >= 3 for row in rows)
        lower_core_score3_two = sum(
            sum(row[f"lower_{factor}"] == 3 for factor in ("demand", "constraint", "transformation", "regional")) >= 2
            for row in rows
        )
        output.extend(
            [
                {
                    "subset": subset,
                    "pair_count": len(rows),
                    "measure": "core_at_least_2",
                    "measure_ja": "中核4要因のうち2要因以上が強い",
                    "lower_strong_share": f3(lower_core2 / len(rows)),
                    "higher_strong_share": "",
                    "lower_mean_score": "",
                    "higher_mean_score": "",
                },
                {
                    "subset": subset,
                    "pair_count": len(rows),
                    "measure": "core_at_least_3",
                    "measure_ja": "中核4要因のうち3要因以上が強い",
                    "lower_strong_share": f3(lower_core3 / len(rows)),
                    "higher_strong_share": "",
                    "lower_mean_score": "",
                    "higher_mean_score": "",
                },
                {
                    "subset": subset,
                    "pair_count": len(rows),
                    "measure": "core_score3_at_least_2",
                    "measure_ja": "中核4要因のうち厳格3点が2要因以上",
                    "lower_strong_share": f3(lower_core_score3_two / len(rows)),
                    "higher_strong_share": "",
                    "lower_mean_score": "",
                    "higher_mean_score": "",
                },
            ]
        )
    return output


def pct(value: float) -> str:
    return f"{100 * value:.1f}%"


def build_summary(pair_rows: list[dict[str, Any]], factors: list[dict[str, Any]]) -> dict[str, Any]:
    pair_count = len(pair_rows)
    lower_core2 = sum(row["lower_core_strong_count"] >= 2 for row in pair_rows)
    lower_core3 = sum(row["lower_core_strong_count"] >= 3 for row in pair_rows)
    lower_core_score3_two = sum(
        sum(row[f"lower_{factor}"] == 3 for factor in ("demand", "constraint", "transformation", "regional")) >= 2
        for row in pair_rows
    )
    lower_qual_wins = sum(
        row["lower_qualitative_total"] > row["higher_qualitative_total"]
        for row in pair_rows
    )
    ties = sum(
        row["lower_qualitative_total"] == row["higher_qualitative_total"]
        for row in pair_rows
    )
    factor_frequency = {
        row["factor"]: {
            "label": row["factor_ja"],
            "lower_strong_share": float(row["lower_strong_share"]),
            "higher_strong_share": float(row["higher_strong_share"]),
        }
        for row in factors
    }
    return {
        "pair_count": pair_count,
        "company_count": pair_count * 2,
        "prior_pair_count": sum(as_bool(row["forced_prior_review"]) for row in pair_rows),
        "new_pair_count": sum(not as_bool(row["forced_prior_review"]) for row in pair_rows),
        "round_counts": dict(Counter(row["round"] for row in pair_rows)),
        "industry_counts": dict(Counter(row["industry"] for row in pair_rows)),
        "lower_core_two_or_more_count": lower_core2,
        "lower_core_two_or_more_share": lower_core2 / pair_count,
        "lower_core_three_or_more_count": lower_core3,
        "lower_core_three_or_more_share": lower_core3 / pair_count,
        "lower_core_score3_two_or_more_count": lower_core_score3_two,
        "lower_core_score3_two_or_more_share": lower_core_score3_two / pair_count,
        "lower_qualitative_total_higher_count": lower_qual_wins,
        "equal_qualitative_total_count": ties,
        "higher_qualitative_total_higher_count": pair_count - lower_qual_wins - ties,
        "factor_frequency": factor_frequency,
        "interpretation_boundary": (
            "採択企業同士の比較であり、採択確率・因果効果・審査点を推定するものではない"
        ),
    }


def make_report(
    pair_rows: list[dict[str, Any]],
    factors: list[dict[str, Any]],
    summary: dict[str, Any],
) -> str:
    factor_map = {row["factor"]: row for row in factors}
    demand = factor_map["demand"]
    constraint = factor_map["constraint"]
    transformation = factor_map["transformation"]
    regional = factor_map["regional"]
    execution = factor_map["execution"]
    strategic = factor_map["strategic"]

    lines = [
        "# 採択企業40ペア・公開PDF目視精査",
        "",
        "## 結論",
        "",
        (
            f"5ペアから **40ペア（80社）** へ拡張した。公開定量スコアが低い側でも、"
            f"中核4要因（需要・能力制約・構造転換・地域性）のうち2要因以上が強い案件は "
            f"**{summary['lower_core_two_or_more_count']}/{summary['pair_count']}件 "
            f"({pct(summary['lower_core_two_or_more_share'])})**、3要因以上は "
            f"**{summary['lower_core_three_or_more_count']}/{summary['pair_count']}件 "
            f"({pct(summary['lower_core_three_or_more_share'])})** だった。さらに3点だけを採る厳格判定でも、"
            f"中核4要因のうち2要因以上が3点の案件は **{summary['lower_core_score3_two_or_more_count']}/"
            f"{summary['pair_count']}件 ({pct(summary['lower_core_score3_two_or_more_share'])})** だった。"
        ),
        "",
        (
            "したがって、最初の5ペアで見えた「数値中央値未満でも、具体需要・能力制約・"
            "構造転換・地域供給網で補う」という現象は、少数例だけの偶然とは考えにくい。"
            "ただし、これは採択企業内の説明分析であり、非採択企業に同じ表現がどれだけあるかは未観測である。"
        ),
        "",
        "## 何を比較したか",
        "",
        "- 1～4次の採択・交付決定企業から、同じ公募回・同じ大分類業種でペアを作った。",
        "- 事業費、補助金額、基準売上高が近く、公開5軸の定量スコアに差がある企業を組み合わせた。",
        "- 既存の5ペアを固定し、新たに35ペアを加えた。企業の重複はない。",
        "- 各社の公開PDF本文を読み、6要因を0～3点で符号化した。2点以上を「強い」とした。",
        "- 公開5軸は、成長・生産性、効果絶対額、補助金効率、賃金・雇用、企業変革投資の各パーセンタイルを合成した相対スコアである。審査点そのものではない。",
        "- 抽出本文だけに依存しないよう、L02・L13・L27・L38の両社、計8社は公式PDF原画面も目視照合し、顧客・能力制約・設備・地域性の判定根拠が一致することを確認した。",
        "",
        "### 符号化基準",
        "",
        "| 点 | 判定 |",
        "|---:|---|",
        "| 0 | 記載なし、または判断不能 |",
        "| 1 | 一般的な市場説明・方針のみ |",
        "| 2 | 対象顧客、工程、地域、設備など案件固有の根拠がある |",
        "| 3 | 実名顧客・受注・数量・待機期間・取得済み用地・認証・実証など検証可能な根拠がある |",
        "",
        "## 6要因の頻度",
        "",
        "| 要因 | 低定量側で2点以上 | 高定量側で2点以上 | 低側3点 | 高側3点 | 低側平均 | 高側平均 | ペア内符号検定 p値 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in factors:
        lines.append(
            f"| {row['factor_ja']} | {row['lower_strong_count']}/{row['pair_count']} "
            f"({pct(float(row['lower_strong_share']))}) | {row['higher_strong_count']}/{row['pair_count']} "
            f"({pct(float(row['higher_strong_share']))}) | {row['lower_score3_count']}/{row['pair_count']} "
            f"({pct(float(row['lower_score3_share']))}) | {row['higher_score3_count']}/{row['pair_count']} "
            f"({pct(float(row['higher_score3_share']))}) | {row['lower_mean_score']} | "
            f"{row['higher_mean_score']} | {row['paired_sign_test_p']} |"
        )
    lines.extend(
        [
            "",
            (
                "95% Wilson区間はCSVに収録した。対象は無作為標本ではないため、区間とp値は"
                "一般母集団への厳密な推測ではなく、40ペア内の偏りの大きさを確認する補助情報である。"
            ),
            "",
            "## 得られた知見",
            "",
            "### 1. 最も再現性が高いのは「現在の制約 → 投資 → 解消後能力」の因果鎖",
            "",
            (
                f"能力制約は低定量側でも {constraint['lower_strong_count']}/{constraint['pair_count']}件 "
                f"({pct(float(constraint['lower_strong_share']))}) が強かった。単に市場が伸びると書くより、"
                "現状の能力、失注・待機・外注・満床の状態、投資後能力を同じ単位で示した案件が強い。"
            ),
            "",
            "### 2. 顧客名・増産要請・受注残は、中央値未満を説明する最も直接的な証拠",
            "",
            (
                f"需要根拠が強い低定量側は {demand['lower_strong_count']}/{demand['pair_count']}件 "
                f"({pct(float(demand['lower_strong_share']))})。特に、顧客の実名、増産要請、引合い、"
                "受注残、待機期間がある案件は、将来値が単なる計画値ではないことを示せる。"
            ),
            "",
            "### 3. 単なる設備増設より、内製化・統合・ODM化・サービス化が強い",
            "",
            (
                f"構造転換は低定量側でも {transformation['lower_strong_count']}/{transformation['pair_count']}件 "
                f"({pct(float(transformation['lower_strong_share']))})。工場統合、外注工程の内製化、"
                "OEMからODM、物流から3PL、素材から完成品など、投資後に競争力の源泉が変わる案件が目立つ。"
            ),
            "",
            "### 4. 地域性は「雇用人数」だけでなく、代替不能な供給機能で効く",
            "",
            (
                f"地域要因が強い低定量側は {regional['lower_strong_count']}/{regional['pair_count']}件 "
                f"({pct(float(regional['lower_strong_share']))})。地域唯一の加工・保管機能、農水産物の"
                "受け皿、港湾コールドチェーン、災害時供給、アンカー企業の地域投資との連動が有効だった。"
            ),
            "",
            "### 5. 実行確度と政策適合は補助線であり、単独では弱い",
            "",
            (
                f"実行確度が強い低定量側は {execution['lower_strong_count']}/{execution['pair_count']}件、"
                f"政策整合は {strategic['lower_strong_count']}/{strategic['pair_count']}件。用地、認証、実証、"
                "共同開発、資金計画は重要だが、需要と能力制約の説明が弱いまま政策用語を置くだけでは足りない。"
            ),
            "",
            "### 6. 文章が強くても数値が高いとは限らない",
            "",
            (
                f"6要因合計で低定量側が高定量側を上回ったペアは "
                f"{summary['lower_qualitative_total_higher_count']}件、同点は "
                f"{summary['equal_qualitative_total_count']}件だった。公開定量値と案件の質的説明は別軸であり、"
                "中央値未満を即座に不合格とみなすのは適切でない。"
            ),
            "",
            "### 7. ペア内で差が明瞭だったのは実行確度",
            "",
            (
                "6要因のうち、ペア内符号検定で高定量側が明瞭に上回ったのは実行確度だけだった "
                f"(p={execution['paired_sign_test_p']})。需要の魅力だけでなく、用地、設計、許認可、認証、"
                "実証、資金、立上げ工程を証拠化することが、数値の高い案件に近づく実務上の差になり得る。"
            ),
            "",
            "### 反例・弱い組合せ",
            "",
            "中核4要因のうち2要因しか強くなかった低定量側は4社だった。これらは、別の要因が特に具体的だった。",
            "",
            "- くまさんメディクス: 構造転換・地域性は弱いが、半導体メーカーの増産要請と用地・150人規模工場が具体的。",
            "- 信光陸運: 能力制約・地域性は弱いが、食品保管への事業転換、連携先、工期・場所が具体的。",
            "- ZACROS: 需要・地域性は弱いが、3m幅塗工という能力制約とポートフォリオ転換が具体的。",
            "- フォース: 需要・地域性は弱いが、再生砂処理制約、完全3R、設備計画が具体的。",
            "",
            "つまり、4要因全部を満たす必要はないが、弱い要因を埋めるだけの案件固有の強い証拠が最低2本は必要、という読みが妥当である。",
            "",
            "## 第6次公募のコンサルで使う順序",
            "",
            "1. まず制度下限と財務整合を満たし、売上・賃金・雇用・付加価値の計算根拠を追跡可能にする。",
            "2. 顧客要請を、顧客名または顧客属性、案件数、受注残、数量、納期で証拠化する。",
            "3. 現状能力、需要、投資後能力を同じ単位で並べ、稼働率と立上げ曲線も示す。",
            "4. 設備の列挙ではなく、内製化率、工程数、リードタイム、歩留まり、原価、提供範囲がどう変わるかを示す。",
            "5. 用地、許認可、認証、設計、見積、採用、資金調達、顧客評価の証拠を添える。",
            "6. 地域の代替困難性と政策的重要性を、固有名詞・数量・供給網の図で補強する。",
            "7. 補助金1億円当たりの売上増、付加価値増、給与総額増、雇用増を併記し、費用対効果を説明する。",
            "",
            "数値中央値を上回ることは有利だが、それだけで十分ではない。逆に中央値未満なら、"
            "上の2～6を一般論ではなく証拠で厚くする必要がある。特に「需要証拠 × 能力制約 × 実行確度」の"
            "3点セットを最低ラインとし、構造転換または地域の代替困難性を第四の柱にする。",
            "",
            "## 40ペアの監査表",
            "",
            "| ID | 回 | 業種 | 公開定量スコア低位 | 低位側の主な根拠 | 公開定量スコア高位 | 高位側の主な根拠 |",
            "|---|---|---|---|---|---|---|",
        ]
    )
    for row in pair_rows:
        lines.append(
            f"| {row['pair_id']} | {row['round']} | {row['industry']} | "
            f"{row['lower_company']} ({row['lower_quantitative_score']}) | {row['lower_evidence']} | "
            f"{row['higher_company']} ({row['higher_quantitative_score']}) | {row['higher_evidence']} |"
        )
    lines.extend(
        [
            "",
            "## 信頼性と限界",
            "",
            "- 5ペアから40ペアへ増やし、80社を重複なく確認したため、最初の所見の安定性は大きく改善した。",
            "- 同一回・同一業種・近い投資規模で比較し、3～4次、製造業のみ、非製造業のみ、旧5ペア除外でも感度表を作成した。",
            "- ただし標本は無作為抽出ではなく、定量差と比較可能性を優先した目的抽出である。",
            "- 公開PDFは採択・交付決定企業のみで、非採択企業の個票や審査点はない。よって採択確率や因果効果は推定できない。",
            "- 公開文章は採択理由書ではない。審査時資料から編集・要約されている可能性がある。",
            "- 同じ判定者による符号化なので一貫性はあるが、独立した第二判定者との一致率は未検証である。",
            "",
            "次に信頼性をさらに上げるには、非採択申請の匿名個票、一次審査通過・不通過、審査項目別点数の"
            "いずれかが必要である。取得できない場合は、公開採択案件を対象に第二判定者が同じ80社を再符号化し、"
            "Cohen's kappaまたは重み付きkappaを確認するのが現実的である。",
            "",
            "## ファイル",
            "",
            "- `expanded_matched_pair_review.csv`: 40ペアの数値・6要因・根拠・PDF URL",
            "- `expanded_pair_company_coding.csv`: 80社の企業単位データ",
            "- `expanded_pair_factor_summary.csv`: 要因別頻度、Wilson 95%区間、ペア内符号検定",
            "- `expanded_pair_sensitivity.csv`: 旧5ペア除外、3～4次、業種別などの感度分析",
            "- `expanded_pair_manual_codes.csv`: 人手符号化の原票",
            "",
            "## 根拠資料",
            "",
            "各企業の根拠URLはCSVに個別収録した。資料は大規模成長投資補助金事務局が公開する企業別PDFである。",
        ]
    )
    return "\n".join(lines) + "\n"


def validate(pair_rows: list[dict[str, Any]]) -> None:
    if len(pair_rows) != 40:
        raise ValueError(f"Expected 40 pairs, got {len(pair_rows)}")
    companies = [
        row[side]
        for row in pair_rows
        for side in ("lower_company", "higher_company")
    ]
    if len(companies) != len(set(companies)):
        raise ValueError("Companies are not unique across pairs")
    for row in pair_rows:
        for side in ("lower", "higher"):
            for factor, _ in FACTORS:
                score = int(row[f"{side}_{factor}"])
                if score not in {0, 1, 2, 3}:
                    raise ValueError(f"Invalid score {score}: {row['pair_id']} {side} {factor}")
        if float(row["lower_quantitative_score"]) > float(row["higher_quantitative_score"]):
            raise ValueError(f"Pair order is invalid: {row['pair_id']}")


def main() -> None:
    candidates = read_csv(CANDIDATES_PATH)
    codes = read_csv(CODES_PATH)
    pair_rows = make_pair_rows(candidates, codes)
    validate(pair_rows)
    company_rows = make_company_rows(pair_rows)
    factors = factor_summary(pair_rows)
    sensitivity = sensitivity_rows(pair_rows)
    summary = build_summary(pair_rows, factors)

    write_csv(PAIR_OUTPUT, pair_rows)
    write_csv(COMPANY_OUTPUT, company_rows)
    write_csv(FACTOR_OUTPUT, factors)
    write_csv(SENSITIVITY_OUTPUT, sensitivity)
    SUMMARY_OUTPUT.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    REPORT_OUTPUT.write_text(
        make_report(pair_rows, factors, summary), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
