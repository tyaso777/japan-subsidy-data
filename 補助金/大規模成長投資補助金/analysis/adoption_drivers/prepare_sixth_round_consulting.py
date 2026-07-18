"""Prepare practical evidence tables for sixth-round application consulting.

This script combines three sources:

1. Official fifth-round benchmark statistics published with the sixth-round
   pre-release materials.
2. Accepted-company public PDFs already normalized in ``cases.csv``.
3. Official accepted-company lists for rounds 3 to 5, including whether a
   financial-institution confirmation was submitted.

The matched-pair narrative is a human review of public PDFs.  It is deliberately
kept as an explicit mapping below so the judgment is reviewable instead of being
presented as an opaque model output.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import tempfile
import urllib.request
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent.parent
CASES_PATH = PROJECT_DIR / "data" / "processed" / "cases.csv"
BENCHMARK_PATH = PROJECT_DIR / "data" / "reference" / "official_round_benchmarks.csv"

OFFICIAL_LIST_URLS = {
    3: "https://seichotoushi-hojo.jp/assets/pdf/list_3ji.pdf",
    4: "https://seichotoushi-hojo.jp/assets/pdf/list_4ji.pdf",
    5: "https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/list_5ji.pdf",
}

SIXTH_OVERVIEW_URL = (
    "https://chukentou-seichotoushi-hojo.jp/assets/documents/common/gaiyou_6ji.pdf"
)
FIFTH_MEDIAN_URL = (
    "https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/5ji_median.pdf"
)


PAIR_REVIEWS = [
    {
        "pair_id": "P01",
        "focal_company": "中本Fine Pack株式会社",
        "comparison_company": "株式会社PXP",
        "match_basis": "3次・事業費35～37億円・補助金約9.6億円",
        "focal_public_evidence": (
            "大口顧客エフピコからのPET増産要請、PET資源循環、工場集約、物流短縮、"
            "自動化を一つの因果鎖として説明。"
        ),
        "comparison_public_evidence": (
            "次世代CIGSタンデム太陽電池の研究開発から量産への移行、世界市場、"
            "エネルギー安全保障を結合。"
        ),
        "manual_interpretation": (
            "公開数値が相対的に小さくても、実名需要→現状ボトルネック→設備→能力・"
            "物流改善が具体的なら通り得る。一方、戦略分野で桁違いの売上を置く場合は、"
            "量産歩留まり・顧客認証・資金の実行証拠が不可欠。"
        ),
    },
    {
        "pair_id": "P02",
        "focal_company": "中央製乳株式会社",
        "comparison_company": "至誠堂製薬株式会社",
        "match_basis": "3次・事業費58～66億円・補助金15～16億円",
        "focal_public_evidence": (
            "生乳供給基盤の維持、新しいチルドカップ分野、年3,500万個能力、"
            "充填工程の要員30%削減・5人から1人以下を説明。"
        ),
        "comparison_public_evidence": (
            "大手製薬OEM需要、15か国輸出、能力10倍、夜間無人運転、"
            "データインテグリティ対応、自己資本比率60%目標を説明。"
        ),
        "manual_interpretation": (
            "同規模なら、顧客・輸出先・能力倍率・省人化・財務耐久性まで数値がつながる"
            "計画が強い。新市場型でも、受注見込みと単価・数量の積み上げを足すべき。"
        ),
    },
    {
        "pair_id": "P03",
        "focal_company": "フクビ岡山株式会社",
        "comparison_company": "株式会社キィポーション",
        "match_basis": "4次・事業費約37億円・補助金約9億円",
        "focal_public_evidence": (
            "断熱規制強化、グループ戦略、フェノール断熱材の供給能力増強、"
            "建築物の省エネ政策との整合を説明。"
        ),
        "comparison_public_evidence": (
            "OEMから企画・設計・製造一貫のODMへの転換、5工場統合、FSSC、海外展開、"
            "複数顧客の受注、女性雇用を説明。"
        ),
        "manual_interpretation": (
            "規制追い風だけでなく、顧客別受注、単価、設備能力、稼働率を結ぶと強い。"
            "単なる増産より、ODM化など利益率が変わる事業モデル転換が説明力を持つ。"
        ),
    },
    {
        "pair_id": "P04",
        "focal_company": "長野牛乳株式会社",
        "comparison_company": "栄屋乳業株式会社",
        "match_basis": "3次・食品製造・大型新工場投資（事業費61～89億円）",
        "focal_public_evidence": (
            "既存設備が能力上限、4ライン整備、能力2倍超、販路拡大、"
            "地域酪農の供給網維持を説明。"
        ),
        "comparison_public_evidence": (
            "ニッチトップブランド、国内外の冷凍デザート、次世代冷凍技術、"
            "スマート工場と大幅雇用増を説明。"
        ),
        "manual_interpretation": (
            "雇用増が小さくても、需要超過の解消と地域サプライチェーン維持という"
            "防衛的・基盤的効果は補完要因になる。数量×単価×稼働率の上限検証は必要。"
        ),
    },
    {
        "pair_id": "P05",
        "focal_company": "杉プラスチック工業株式会社",
        "comparison_company": "株式会社シー・エス・ケイ",
        "match_basis": "4次・事業費17.7～20億円・補助金4.9～5.9億円",
        "focal_public_evidence": (
            "PET・多品種対応、資源循環、顧客増産要請、スマートファクトリーを説明。"
        ),
        "comparison_public_evidence": (
            "3工場2倉庫の統合、工程一貫自動化、国内回帰・インフラ需要、"
            "厚板・再エネ市場への展開、再教育を説明。"
        ),
        "manual_interpretation": (
            "省力化率だけが近くても差はつく。統合で解消する制約、新市場への販売経路、"
            "売上増の選択肢の数を示すことが重要。"
        ),
    },
]


NUMERIC_STRATEGY = [
    {
        "no": 1,
        "metric": "全社年平均売上高成長率",
        "unit": "%/年",
        "statistic": "中央値",
        "fifth_all_applicants": 20,
        "fifth_accepted": 21,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "21%以上",
        "stretch_target": "25%以上（受注・能力の積上げがある場合）",
        "consulting_use": "会社全体が投資後も成長軌道に入ることを示す",
        "caution": "1ポイント差しかなく単独の判別力は弱い。過去実績と整合させる。",
    },
    {
        "no": 2,
        "metric": "全社売上高増加額",
        "unit": "億円",
        "statistic": "中央値",
        "fifth_all_applicants": 67.1,
        "fifth_accepted": 82.4,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "82.4以上",
        "stretch_target": "100以上",
        "consulting_use": "投資の絶対的な経済効果を示す",
        "caution": "企業規模の影響が大きいので、補助事業増加額・費用対効果と併記する。",
    },
    {
        "no": 3,
        "metric": "全社賃上げ予定率",
        "unit": "%/年",
        "statistic": "中央値",
        "fifth_all_applicants": 2.3,
        "fifth_accepted": 2.5,
        "sixth_official_floor": "事業期間中は少なくとも物価上昇率程度（資料例3.2%）",
        "practical_competitive_target": "最新物価率を上回る水準。現時点の作業仮説は3.5～4.0%以上",
        "stretch_target": "4.0%以上を毎年継続できる資金計画",
        "consulting_use": "足下の全社的な還元姿勢を示す",
        "caution": "第5次中央値は第6次の競争水準に使わない。申請直前の最新物価率で更新する。",
    },
    {
        "no": 4,
        "metric": "補助事業売上高／全社売上高",
        "unit": "%",
        "statistic": "平均値",
        "fifth_all_applicants": 80,
        "fifth_accepted": 89,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "中核事業なら89%前後を参考",
        "stretch_target": "数値を最大化せず、全社ポートフォリオ上の必然性を説明",
        "consulting_use": "投資が会社変革の中心であることを示す",
        "caution": "既存事業が大きい企業には不利な構造。比率を作為的に上げない。",
    },
    {
        "no": 5,
        "metric": "補助事業の年平均売上高成長率",
        "unit": "%/年",
        "statistic": "中央値",
        "fifth_all_applicants": 22,
        "fifth_accepted": 22,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "22%以上",
        "stretch_target": "25%以上（顧客別数量で裏付け）",
        "consulting_use": "投資対象事業そのものの成長速度を示す",
        "caution": "採択・申請者中央値が同じで単独の判別力は弱い。",
    },
    {
        "no": 6,
        "metric": "補助事業の売上高増加額",
        "unit": "億円",
        "statistic": "中央値",
        "fifth_all_applicants": 57.4,
        "fifth_accepted": 74.8,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "74.8以上",
        "stretch_target": "90以上",
        "consulting_use": "設備投資と直接つながる絶対効果を示す",
        "caution": "顧客×単価×数量、能力×稼働率の二方向から照合する。",
    },
    {
        "no": 7,
        "metric": "補助事業の労働生産性年平均成長率",
        "unit": "%/年",
        "statistic": "中央値",
        "fifth_all_applicants": 21,
        "fifth_accepted": 21,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "21%以上",
        "stretch_target": "25%以上",
        "consulting_use": "賃上げ原資を生む生産性向上を示す",
        "caution": "採択・申請者中央値が同じ。付加価値額、人数、給与の整合を優先する。",
    },
    {
        "no": 8,
        "metric": "補助事業の付加価値増加額",
        "unit": "億円",
        "statistic": "中央値",
        "fifth_all_applicants": 19.9,
        "fifth_accepted": 28.1,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "28.1以上",
        "stretch_target": "35以上",
        "consulting_use": "売上ではなく利益・給与・減価償却を含む経済価値を示す",
        "caution": "様式2の補助事業P/Lから作る。公開PDFの人数×1人給与はproxyに限定する。",
    },
    {
        "no": 9,
        "metric": "補助事業従業員1人当たり給与支給額の年平均成長率",
        "unit": "%/年",
        "statistic": "中央値",
        "fifth_all_applicants": 6.5,
        "fifth_accepted": 7.0,
        "sixth_official_floor": "一般5.0%以上／100億宣言企業4.5%以上",
        "practical_competitive_target": "7.0%以上",
        "stretch_target": "7.5～8.0%以上（返還リスクに耐える場合）",
        "consulting_use": "法定要件を超えた人への還元を示す",
        "caution": "未達は返還につながり得る。楽観売上ではなく固定費耐性から逆算する。",
    },
    {
        "no": 10,
        "metric": "補助事業従業員給与支給総額の増加額",
        "unit": "億円",
        "statistic": "中央値",
        "fifth_all_applicants": 2.8,
        "fifth_accepted": 3.9,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "3.9以上",
        "stretch_target": "5.0以上",
        "consulting_use": "賃上げ率と雇用増を合わせた地域所得効果を示す",
        "caution": "様式2の補助事業P/L給与総額を使用。全社給与総額ではない。",
    },
    {
        "no": 11,
        "metric": "投資額／全社売上高",
        "unit": "%",
        "statistic": "中央値",
        "fifth_all_applicants": 64,
        "fifth_accepted": 61,
        "sixth_official_floor": "一般20億円／100億宣言企業15億円の投資額要件",
        "practical_competitive_target": "50～70%を文脈確認用に使う",
        "stretch_target": "最大化しない",
        "consulting_use": "会社規模に対する投資の大胆さと財務負担を確認する",
        "caution": "採択者中央値の方が低い。高比率自体は有利とは読めない。",
    },
    {
        "no": 12,
        "metric": "付加価値増加額／補助金額",
        "unit": "%",
        "statistic": "中央値",
        "fifth_all_applicants": 171,
        "fifth_accepted": 213,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "213%以上",
        "stretch_target": "250%以上",
        "consulting_use": "税金1円当たりの付加価値効果を示す中心KPI",
        "caution": "分子を過大計上しない。1/4補助を選べる場合は比率も改善する。",
    },
    {
        "no": 13,
        "metric": "ローカルベンチマーク財務分析結果",
        "unit": "点",
        "statistic": "中央値",
        "fifth_all_applicants": 23,
        "fifth_accepted": 23,
        "sixth_official_floor": "なし",
        "practical_competitive_target": "23以上を健全性確認の目安",
        "stretch_target": "点数より融資・出資の実行確度を高める",
        "consulting_use": "申請企業の財務健全性を確認する",
        "caution": "採択・申請者中央値が同じ。単独の差別化指標ではない。",
    },
]

TREND_METRICS = {
    "company_sales_cagr": "全社年平均売上高成長率",
    "company_sales_increase": "全社売上高増加額",
    "project_sales_increase": "補助事業売上高増加額",
    "value_added_increase": "補助事業付加価値増加額",
    "employee_pay_rate": "補助事業従業員1人当たり給与CAGR",
    "employee_pay_total_increase": "補助事業従業員給与総額増加額",
    "value_added_subsidy_ratio": "付加価値増加額／補助金額",
}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\u3000", " ").split())


def read_cases() -> dict[str, dict[str, str]]:
    with CASES_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return {row["company"]: row for row in rows}


def number(row: dict[str, str], field: str, divisor: float = 1.0) -> str:
    raw = row.get(field, "")
    if raw in (None, ""):
        return ""
    value = float(raw) / divisor
    return f"{value:.6f}".rstrip("0").rstrip(".")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        raise ValueError(f"No rows for {path}")
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def build_matched_pairs(cases: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    metric_fields = {
        "project_cost_oku": ("project_cost_million_yen", 100.0),
        "subsidy_oku": ("subsidy_million_yen", 100.0),
        "sales_increase_oku": ("sales_increase_oku_yen", 1.0),
        "sales_cagr_pct": ("sales_cagr_pct", 1.0),
        "labor_productivity_cagr_pct": ("labor_annual_rate_pct", 1.0),
        "employee_pay_cagr_pct": ("employee_pay_annual_rate_pct", 1.0),
        "employees_base": ("employees_base_value", 1.0),
        "employees_target": ("employees_target_value", 1.0),
        "payroll_increase_proxy_oku": (
            "employee_pay_total_increase_estimated_oku",
            1.0,
        ),
    }
    for review in PAIR_REVIEWS:
        focal = cases[review["focal_company"]]
        comparison = cases[review["comparison_company"]]
        row: dict[str, Any] = {
            "pair_id": review["pair_id"],
            "round": focal["round"],
            "focal_company": focal["company"],
            "comparison_company": comparison["company"],
            "match_basis": review["match_basis"],
        }
        for label, (field, divisor) in metric_fields.items():
            row[f"focal_{label}"] = number(focal, field, divisor)
            row[f"comparison_{label}"] = number(comparison, field, divisor)
        row.update(
            {
                "focal_public_evidence": review["focal_public_evidence"],
                "comparison_public_evidence": review[
                    "comparison_public_evidence"
                ],
                "manual_interpretation": review["manual_interpretation"],
                "focal_pdf_url": focal["pdf_url"],
                "comparison_pdf_url": comparison["pdf_url"],
                "review_method": "同一公募回・近い投資規模を抽出後、公開PDF本文を人手精査",
            }
        )
        output.append(row)
    return output


def build_benchmark_trends() -> list[dict[str, Any]]:
    with BENCHMARK_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        benchmarks = list(csv.DictReader(handle))
    output: list[dict[str, Any]] = []
    for metric_key, display_label in TREND_METRICS.items():
        selected = {
            row["round"]: row for row in benchmarks if row["metric_key"] == metric_key
        }
        first = selected["1次"]
        fifth = selected["5次"]
        accepted_values = [float(selected[f"{round_no}次"]["accepted_value"]) for round_no in range(1, 6)]
        output.append(
            {
                "metric_key": metric_key,
                "metric": display_label,
                "unit": fifth["unit"],
                "accepted_round_1": first["accepted_value"],
                "accepted_round_2": selected["2次"]["accepted_value"],
                "accepted_round_3": selected["3次"]["accepted_value"],
                "accepted_round_4": selected["4次"]["accepted_value"],
                "accepted_round_5": fifth["accepted_value"],
                "all_applicants_round_5": fifth["applicant_value"],
                "round_5_accepted_gap": round(
                    float(fifth["accepted_value"]) - float(fifth["applicant_value"]), 3
                ),
                "accepted_change_round_1_to_5": round(
                    float(fifth["accepted_value"]) - float(first["accepted_value"]), 3
                ),
                "accepted_strictly_increasing": all(
                    later > earlier
                    for earlier, later in zip(accepted_values, accepted_values[1:])
                ),
                "source_url": fifth["source_url"],
            }
        )
    return output


def download_official_lists(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for round_no, url in OFFICIAL_LIST_URLS.items():
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 subsidy-analysis/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            (target_dir / f"list_{round_no}ji.pdf").write_bytes(response.read())


def parse_financial_confirmations(pdf_dir: Path) -> list[dict[str, Any]]:
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover - environment guidance
        raise RuntimeError("pdfplumber is required to parse official PDF lists") from exc

    retrieved_at = dt.date.today().isoformat()
    output: list[dict[str, Any]] = []
    for round_no, source_url in OFFICIAL_LIST_URLS.items():
        pdf_path = pdf_dir / f"list_{round_no}ji.pdf"
        if not pdf_path.exists():
            raise FileNotFoundError(
                f"Missing {pdf_path}. Run with --refresh-external or set --pdf-dir."
            )
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                for table in page.extract_tables():
                    for raw_row in table:
                        if len(raw_row) < 7:
                            continue
                        cells = [clean_text(value) for value in raw_row]
                        if cells[2] == "事業者名" or not cells[2]:
                            continue
                        output.append(
                            {
                                "round": f"{round_no}次",
                                "project_location": cells[0],
                                "head_office_location": cells[1],
                                "company": cells[2],
                                "corporate_number": cells[3],
                                "consortium_member": cells[4],
                                "plan_name": cells[5],
                                "financial_institution": cells[6],
                                "has_financial_confirmation": bool(cells[6]),
                                "official_list_url": source_url,
                                "retrieved_at": retrieved_at,
                            }
                        )
    return output


def build_financial_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for round_no in (3, 4, 5):
        selected = [row for row in rows if row["round"] == f"{round_no}次"]
        confirmed = [row for row in selected if row["has_financial_confirmation"]]
        missing = [row["company"] for row in selected if not row["has_financial_confirmation"]]
        summary.append(
            {
                "round": f"{round_no}次",
                "accepted_count": len(selected),
                "with_financial_confirmation_count": len(confirmed),
                "confirmation_share_pct": round(100 * len(confirmed) / len(selected), 1),
                "without_confirmation_companies": "／".join(missing),
                "interpretation": (
                    "採択企業内の提出率。非採択企業との比較がないため採択効果や因果は推定不可。"
                ),
                "official_list_url": OFFICIAL_LIST_URLS[round_no],
            }
        )
    return summary


def validate_outputs(
    pairs: list[dict[str, Any]],
    confirmations: list[dict[str, Any]],
    summary: list[dict[str, Any]],
    trends: list[dict[str, Any]],
) -> None:
    expected_counts = {"3次": 116, "4次": 102, "5次": 77}
    actual_counts = {
        round_label: sum(row["round"] == round_label for row in confirmations)
        for round_label in expected_counts
    }
    if actual_counts != expected_counts:
        raise ValueError(
            f"Official list row counts changed: expected={expected_counts}, actual={actual_counts}"
        )
    if len(pairs) != len(PAIR_REVIEWS):
        raise ValueError("Matched pair output is incomplete")
    if len(summary) != 3 or len(NUMERIC_STRATEGY) != 13 or len(trends) != 7:
        raise ValueError("Summary or numeric strategy is incomplete")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        default=PROJECT_DIR / "tmp" / "pdfs",
        help="Directory containing list_3ji.pdf, list_4ji.pdf, list_5ji.pdf",
    )
    parser.add_argument(
        "--refresh-external",
        action="store_true",
        help="Download the three official accepted-company lists before parsing",
    )
    args = parser.parse_args()

    if args.refresh_external:
        with tempfile.TemporaryDirectory(prefix="sixth_round_lists_") as temp_dir:
            pdf_dir = Path(temp_dir)
            download_official_lists(pdf_dir)
            confirmations = parse_financial_confirmations(pdf_dir)
    else:
        confirmations = parse_financial_confirmations(args.pdf_dir)

    cases = read_cases()
    pairs = build_matched_pairs(cases)
    financial_summary = build_financial_summary(confirmations)
    benchmark_trends = build_benchmark_trends()
    validate_outputs(pairs, confirmations, financial_summary, benchmark_trends)

    write_csv(HERE / "matched_pair_review.csv", pairs)
    write_csv(HERE / "sixth_round_numeric_strategy.csv", NUMERIC_STRATEGY)
    write_csv(HERE / "sixth_round_benchmark_trends.csv", benchmark_trends)
    write_csv(HERE / "external_financial_confirmations.csv", confirmations)
    write_csv(
        HERE / "external_financial_confirmation_summary.csv",
        financial_summary,
    )
    print(f"Wrote {len(pairs)} manually reviewed pairs")
    print(f"Wrote {len(NUMERIC_STRATEGY)} sixth-round strategy metrics")
    print(f"Wrote {len(benchmark_trends)} first-to-fifth benchmark trends")
    print(f"Wrote {len(confirmations)} official financial-confirmation records")


if __name__ == "__main__":
    main()
