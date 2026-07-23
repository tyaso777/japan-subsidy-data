from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ANALYSIS = PROJECT / "analysis"
REFERENCE = PROJECT / "data" / "reference"
PROCESSED = PROJECT / "data" / "processed"


def fmt(value, digits: int = 1) -> str:
    if value is None or pd.isna(value):
        return "—"
    return f"{float(value):,.{digits}f}"


def fmt_official(value) -> str:
    if value is None or pd.isna(value):
        return "—"
    value = float(value)
    digits = 2 if abs(value) < 1 else 1
    return f"{value:,.{digits}f}"


def pct(value, digits: int = 1) -> str:
    return f"{float(value):.{digits}f}%" if value is not None and not pd.isna(value) else "—"


def md_table(headers: list[str], rows: list[list[object]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join("---" for _ in headers) + "|",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return "\n".join(lines)


def write(name: str, content: str) -> None:
    (HERE / name).write_text(content.strip() + "\n", encoding="utf-8")


def load_sources() -> dict[str, object]:
    sources: dict[str, object] = {}
    sources["bench"] = pd.read_csv(REFERENCE / "official_round_benchmarks.csv")
    sources["reconstruction"] = pd.read_csv(ANALYSIS / "round6_reassessment" / "metric_reconstruction_validation.csv")
    sources["round_summary"] = pd.read_csv(ANALYSIS / "round6_reassessment" / "round_summary.csv")
    sources["metric_corr"] = pd.read_csv(ANALYSIS / "round6_reassessment" / "metric_spearman_correlations.csv")
    sources["amount_corr"] = pd.read_csv(ANALYSIS / "low_metric_profile_model" / "project_amount_metric_correlations.csv")
    sources["amount_bands"] = pd.read_csv(ANALYSIS / "low_metric_profile_model" / "project_amount_band_summary.csv")
    sources["attribute_blocks"] = pd.read_csv(ANALYSIS / "low_metric_profile_model" / "attribute_block_model_performance.csv")
    sources["boundary"] = pd.read_csv(ANALYSIS / "applicant_median_residual" / "boundary_sensitivity.csv")
    sources["metric_sensitivity"] = pd.read_csv(ANALYSIS / "applicant_median_residual" / "metric_set_sensitivity.csv")
    sources["round6_summary"] = json.loads((ANALYSIS / "round6_reassessment" / "summary.json").read_text(encoding="utf-8"))
    sources["applicant_summary"] = json.loads((ANALYSIS / "applicant_median_residual" / "summary.json").read_text(encoding="utf-8"))
    sources["quality_summary"] = json.loads((PROCESSED / "analysis_quality_summary.json").read_text(encoding="utf-8"))
    return sources


def build_round_counts(bench: pd.DataFrame, round_summary: pd.DataFrame) -> pd.DataFrame:
    counts = bench[bench["round"].isin(["1次", "2次", "3次", "4次"])][
        ["round", "applicant_n", "accepted_n"]
    ].drop_duplicates("round")
    counts["official_acceptance_rate_pct"] = 100 * counts["accepted_n"] / counts["applicant_n"]
    counts = counts.merge(round_summary[["round", "public_pdf_n", "clean_n"]], on="round", how="left")
    counts["pdf_minus_official_accepted"] = counts["public_pdf_n"] - counts["accepted_n"]
    return counts


def build_gap_summary(bench: pd.DataFrame) -> pd.DataFrame:
    b = bench[bench["round"].isin(["1次", "2次", "3次", "4次"])].copy()
    b["relative_gap_pct"] = np.where(
        pd.to_numeric(b["applicant_value"], errors="coerce").ne(0),
        100 * (pd.to_numeric(b["accepted_value"], errors="coerce") / pd.to_numeric(b["applicant_value"], errors="coerce") - 1),
        np.nan,
    )
    rows = []
    for key, group in b.groupby("metric_key", sort=False):
        rows.append({
            "metric_key": key,
            "metric_label": group["metric_label"].iloc[0],
            "category": group["category"].iloc[0],
            "statistic": group["statistic"].iloc[0],
            "unit": group["unit"].iloc[0],
            "comparability": group["comparability"].iloc[0],
            "rounds_available": len(group),
            "accepted_above_applicant_rounds": int((group["accepted_value"] > group["applicant_value"]).sum()),
            "accepted_below_applicant_rounds": int((group["accepted_value"] < group["applicant_value"]).sum()),
            "median_relative_gap_pct": group["relative_gap_pct"].median(),
            "min_relative_gap_pct": group["relative_gap_pct"].min(),
            "max_relative_gap_pct": group["relative_gap_pct"].max(),
            "round_values": " / ".join(
                f"{r['round']} {fmt_official(r['applicant_value'])}→{fmt_official(r['accepted_value'])}"
                for _, r in group.iterrows()
            ),
        })
    return pd.DataFrame(rows).sort_values(
        ["accepted_above_applicant_rounds", "median_relative_gap_pct"], ascending=[False, False]
    )


def build_reconstruction_summary(reconstruction: pd.DataFrame) -> pd.DataFrame:
    r = reconstruction[
        (reconstruction["sample"] == "all") & reconstruction["round"].isin(["1次", "2次", "3次", "4次"])
    ].copy()
    rows = []
    for key, group in r.groupby("metric_key", sort=False):
        observed = group["observed_n"].sum()
        sample_cases = group["sample_cases"].sum()
        below = group["below_accepted_n"].sum()
        rows.append({
            "metric_key": key,
            "metric_label": group["metric_label"].iloc[0],
            "comparability": group["comparability"].iloc[0],
            "unit": group["unit"].iloc[0],
            "observed_n": int(observed),
            "coverage_pct": 100 * observed / sample_cases,
            "weighted_below_accepted_pct": 100 * below / observed,
            "median_abs_pdf_vs_official_gap_pct": group["median_gap_pct_vs_accepted"].abs().median(),
        })
    return pd.DataFrame(rows)


def doc_00(counts: pd.DataFrame) -> str:
    total_app = int(counts["applicant_n"].sum())
    total_acc = int(counts["accepted_n"].sum())
    return f"""# 基礎統計ノート

1～4次の公式集計と、公開PDFから構造化した採択・交付企業381レコードを分けて読むための短いノート集です。

## 先に押さえる数字

- 公式申請者数合計: **{total_app:,}**
- 公式採択者数合計: **{total_acc:,}**
- 単純合算採択率: **{100 * total_acc / total_app:.1f}%**（回ごとの制度・母集団差があるため参考値）
- 公開PDF企業レコード: **381**
- 現行9指標を5つ以上判定可能: **373**
- 採択者中央値を60%以上の観測指標で下回る: **118 / 373**
- 申請者中央値を同条件で下回る: **28 / 373**

## 読む順番

1. [01 制度規模と採択率](01_program_scale.md)
2. [02 申請者・採択者中央値の差](02_official_median_gaps.md)
3. [03 公開PDF個票の基礎統計](03_public_pdf_statistics.md)
4. [04 指標の読み方](04_metric_reading_guide.md)
5. [05 複数指標で劣る採択企業](05_multi_metric_lagging.md)
6. [06 規模・事業費・指標重複](06_scale_and_redundancy.md)
7. [07 次に考えられる分析](07_next_analysis_questions.md)
8. [08 出典・限界](08_sources_and_limits.md)

## このノート集が答えられること

- どの公式指標で申請者と採択者の代表値に差があるか
- 公開PDFでどの指標をどの程度再現できるか
- 事業費・企業規模・指標重複が比較へ与える影響
- 数指標で劣っていても採択された公開事例が存在するか

## 答えられないこと

不採択企業の個票がないため、企業別の採択確率、指標1単位の因果効果、審査配点は推定できません。公式中央値は合格点ではありません。

## 再生成

このフォルダで、隣接する既存uv環境を使います。

```powershell
uv run --project ..\\low_metric_profile_model python build_basic_statistics.py
```
"""


def doc_01(counts: pd.DataFrame) -> str:
    rows = []
    for _, r in counts.iterrows():
        rows.append([
            r["round"], f"{int(r['applicant_n']):,}", f"{int(r['accepted_n']):,}",
            pct(r["official_acceptance_rate_pct"]), int(r["public_pdf_n"]), int(r["clean_n"]),
        ])
    return f"""# 01 制度規模と採択率

## 公式件数

{md_table(['公募回', '申請者数', '採択者数', '単純採択率', '公開PDFレコード', '主要品質フラグなし'], rows)}

## 読み方

- 1・2次の単純採択率は約15%、3・4次は約49～51%で、大きく異なります。
- この差には予算、申請資格、制度認知、募集条件、申請者構成の変化が含まれます。「3・4次で審査が甘くなった」と件数だけから断定できません。
- 公開PDFレコード数は公式採択申請数と一致しません。共同申請の参加企業、交付決定後の公開範囲、1・2次の収録ラベル差があるためです。

## 実務上の含意

採択チャンスを考えるときは、全回合算24.1%ではなく、対象回の制度条件と申請者構成を使います。さらに、中央値だけでは上位・下位の分布幅が分からないため、企業別確率には変換しません。
"""


def doc_02(gaps: pd.DataFrame) -> str:
    rows = []
    for _, r in gaps.iterrows():
        rows.append([
            r["metric_label"], r["category"], f"{int(r['accepted_above_applicant_rounds'])}/{int(r['rounds_available'])}",
            pct(r["median_relative_gap_pct"]), r["comparability"], r["round_values"],
        ])
    return f"""# 02 申請者・採択者中央値の差

## 公式集計の比較

{md_table(['指標', '審査領域', '採択者>申請者', '代表値差の回次中央値', 'PDF比較', '各回 申請者→採択者'], rows)}

## まず重要な指標

- **売上増加額、補助事業売上増加額、付加価値増加額、給与総額増加額**は、複数回で採択者側が大きい傾向があります。ただし絶対額なので企業・事業規模を強く含みます。
- **売上CAGR、労働生産性上昇率、賃上げ率**も採択者側が高い回が多く、規模中立に近い比較軸です。
- **付加価値増加額／補助金額**は費用対効果として重要ですが、公開PDFでは推計分子を使います。
- **投資額／全社売上高**は採択者側が常に高いわけではなく、単調な「高いほど有利」指標として読まない方が安全です。
- **ローカルベンチマーク得点**の中央値差は比較的小さく、最低限の実現可能性確認に近い可能性があります。

## 中央値から言えないこと

採択者中央値が申請者中央値より高くても、両分布の重なりは分かりません。中央値差が大きい指標が審査配点も大きいとは限らず、企業別の足切り線でもありません。
"""


def doc_03(recon: pd.DataFrame, round_summary: pd.DataFrame, quality: dict) -> str:
    rows = []
    for _, r in recon.iterrows():
        rows.append([
            r["metric_label"], r["comparability"], int(r["observed_n"]), pct(r["coverage_pct"]),
            pct(r["weighted_below_accepted_pct"]), pct(r["median_abs_pdf_vs_official_gap_pct"]),
        ])
    round_rows = [
        [r["round"], int(r["public_pdf_n"]), int(r["clean_n"]), int(r["dashboard9_low_n"]), pct(r["dashboard9_low_pct"])]
        for _, r in round_summary.iterrows()
    ]
    return f"""# 03 公開PDF個票の基礎統計

## 9指標の再現性

{md_table(['指標', '比較区分', '観測n', '収録率', '採択者中央値未満', 'PDF中央値と公式値の絶対乖離'], rows)}

`comparable` は比較的直接比較できる指標、`proxy` は定義差または推計を含む指標です。公式中央値とPDF中央値が近くても、企業別推計が正確とは限りません。

## 回次別の公開PDF

{md_table(['公募回', 'PDFレコード', '主要品質フラグなし', '現行9指標で劣後', '収録内割合'], round_rows)}

## 品質フラグ

- 全381件中、分析除外推奨フラグあり: **{quality['cases_exclusion_recommended']}件**
- 期間曖昧: **{quality['flag_counts']['PERIOD_AMBIGUOUS']}件**
- 率定義曖昧: **{quality['flag_counts']['RATE_DEFINITION_AMBIGUOUS']}件**
- 複数売上系列: **{quality['flag_counts']['MULTIPLE_SALES_SERIES']}件**
- 指標主体混在: **{quality['flag_counts']['MIXED_ENTITY_METRICS']}件**

主分析と品質フラグなし分析を必ず併記します。空欄を0として扱いません。
"""


def doc_04() -> str:
    return """# 04 指標の読み方

## 4種類に分ける

| 種類 | 主な指標 | 読み方 | 主な注意 |
|---|---|---|---|
| 成長率 | 売上CAGR、労働生産性率、賃上げ率 | 規模に対する改善速度 | 基準年・期間・主体、低い基準値からの高成長 |
| 効果総量 | 売上増加額、付加価値増加額、給与総額増加額 | 政策効果の絶対量 | 企業規模・事業費と強く連動 |
| 費用対効果 | 付加価値／補助金、売上増加／補助金 | 政府支出当たり効果 | 小さい分母で高くなりやすい |
| 投資強度・実現性 | 投資額／売上高、ローカルベンチマーク | 変革度、実行可能性 | 高すぎれば財務リスク。単調評価しにくい |

## 指標別の扱い

- **主軸候補**: 売上CAGR、労働生産性上昇率、従業員賃上げ率。比較可能性が相対的に高い。
- **規模調整して使う**: 売上増加額、付加価値増加額、給与総額増加額。
- **二重計上に注意**: 付加価値増加額と付加価値／補助金、従業員賃上げ率と給与総額増加額。
- **参考軸**: 投資額／売上高。方向が安定せず、単純加点しない。
- **PDFでは観測困難**: 補助事業売上高系列、ローカルベンチマーク、審査点、プレゼン評価。

## 基礎統計上の優先順位

| 位置づけ | 指標 | 理由 |
|---|---|---|
| 比較の主軸 | 売上CAGR、労働生産性上昇率 | 1～4次で採択者代表値が申請者代表値を上回り、絶対額より規模依存が小さい |
| 総量の主軸 | 売上増加額、付加価値増加額 | 採択者側との差が大きいが、事業費・企業規模を調整して読む |
| 費用対効果 | 付加価値増加額／補助金額 | 4回すべて採択者側が高い。付加価値増加額との二重計上は避ける |
| 政策目標・閾値 | 従業員・役員賃上げ率 | 採択者側が高い回は多いが差は比較的小さく、同値・目標集中が多い |
| 参考・文脈 | 投資額／全社売上高 | 回によって方向が異なり、高すぎる場合は実現可能性リスクにもなる |

## 推奨する表示

単一総合点より、`成長`、`生産性・付加価値`、`賃金・雇用`、`費用対効果`の4領域を並べます。同じ分子・基礎値を共有する指標を独立した一票として数えません。
"""


def doc_05(round6: dict, applicant: dict, boundary: pd.DataFrame, sensitivity: pd.DataFrame) -> str:
    d = round6["dashboard_compatible"]
    c = applicant["counts"]
    boundary_rows = [
        [pct(100 * r["minimum_relative_gap_below_benchmark"], 0), int(r["flag_n"]), int(r["overlap_with_primary_n"])]
        for _, r in boundary.iterrows()
    ]
    metric_rows = []
    for _, r in sensitivity[(sensitivity["scope"] == "all") & sensitivity["metric_set"].isin([
        "current9", "directional8_no13", "old7_no8_no14", "direct_or_near_direct5", "direct_comparable3"
    ])].iterrows():
        metric_rows.append([r["metric_set"], int(r["eligible_n"]), int(r["flag_n"]), pct(r["flag_pct_of_eligible"]), fmt(r["jaccard_with_current9"], 2)])
    return f"""# 05 複数指標で劣る採択企業

## 事実として確認できること

- 採択者中央値基準: **{d['n']} / {d['eligible_n']}（{d['conditional_pct']:.1f}%）**が、現行9指標を5つ以上観測し、その60%以上で同回採択者中央値未満。
- 主要品質フラグなし: **{d['clean_n']} / {d['clean_eligible_n']}（{100*d['clean_n']/d['clean_eligible_n']:.1f}%）**。
- 申請者中央値基準: **{c['primary_core_n']} / {c['primary_eligible_n']}（{100*c['primary_core_n']/c['primary_eligible_n']:.1f}%）**。
- 申請者中央値基準の28件は、全件に少なくとも1指標の申請者中央値以上が残ります。

したがって「数指標で劣っていたら採択可能性がゼロ」は否定できます。実際に採択・交付された公開例があります。ただし、この比率を申請者の採択確率として使うことはできません。

## 中央値境界への感度

{md_table(['申請者中央値から何%以上低いか', '該当件数', '主定義との共通'], boundary_rows)}

28件の観測208セル中25セルは申請者中央値との差が5%未満です。わずかな丸め・定義差で上下判定が変わる企業を、明確な劣後企業と断定しません。

## 指標集合への感度

{md_table(['指標集合', '判定可能', '該当', '割合', '現行9とのJaccard'], metric_rows)}

該当件数だけでなく企業の顔ぶれも変わります。「低指標企業」は自然に存在する固定集団ではなく、指標選択と閾値で作られる分析区分です。

## チャンスを考える際の表現

言えるのは「複数の公開指標が中央値未満でも採択例は存在する」です。「定性面で必ず逆転できる」「この条件なら採択率は何%」とは言えません。残る候補は、需要の具体性、能力制約、事業転換、地域・供給網、実行可能性、共同申請全体効果、加点、プレゼンです。
"""


def doc_06(amount_corr: pd.DataFrame, metric_corr: pd.DataFrame, blocks: pd.DataFrame) -> str:
    project = amount_corr[amount_corr["amount"] == "project_cost_oku"].copy()
    amount_rows = [
        [r["metric_label"], int(r["n"]), fmt(r["within_round_spearman"], 3)] for _, r in project.iterrows()
    ]
    corr_rows = [
        [r["left_metric"], r["right_metric"], int(r["pair_n"]), fmt(r["spearman_rho"], 3)]
        for _, r in metric_corr.head(8).iterrows()
    ]
    overall = blocks[
        (blocks["held_out_round"] == "ALL_LOGO") & (blocks["outcome"] == "low_score_accepted")
    ]
    block_rows = [
        [r["model"], fmt(r["r2"], 3), fmt(r["spearman"], 3)] for _, r in overall.iterrows()
    ]
    return f"""# 06 規模・事業費・指標重複

## 事業費との関係

同じ公募回内の順位相関です。

{md_table(['指標', 'n', '事業費とのSpearman'], amount_rows)}

- 売上・付加価値・給与の**増加額**は事業費と中程度に連動します。
- 売上CAGR、生産性率、1人当たり賃上げ率は事業費との関係が弱いです。
- 絶対額は事業費帯内比較または連続的な事業費調整を行い、率指標は原則として同回全体で比較します。

## 指標間の重複

{md_table(['指標A', '指標B', '共通n', 'Spearman'], corr_rows)}

No.2・8・10は企業規模を共有し、No.8・14は同じ付加価値分子を共有します。9指標を単純に9票として数えると、同じ強弱を複数回数えます。

## 基礎属性の説明力

公募回を丸ごと外した低位度予測です。

{md_table(['属性ブロック', 'LOGO R²', 'LOGO Spearman'], block_rows)}

企業規模は一定の説明力を持ちますが、業種単独はほぼ説明せず、地域は小さい寄与にとどまります。属性調整は「優遇の証明」ではなく、公開数値が弱く見える構造の確認です。
"""


def doc_07() -> str:
    return """# 07 次に考えられる分析

## 現データだけで優先してできること

1. **回次別の選抜差**: 指標ごとに申請者→採択者中央値差の方向が1～4次で再現するか。
2. **分布統計**: PDF個票について中央値、IQR、10・90パーセンタイル、外れ値、欠損率を回次別に整理。
3. **規模調整効果**: 絶対額を事業費、補助金額、基準売上高、従業員数で調整し、率指標と並べる。
4. **条件付き分位点**: 事業費帯・企業規模帯ごとの中央値と四分位範囲。単純な比率より非線形性を確認しやすい。
5. **指標重複**: 相関行列、領域集約、No.8・14など共通分子の二重計上除去。
6. **欠損構造**: 欠損企業が特定回・業種・規模へ偏るか。欠損を0扱いしない。
7. **品質感度**: 全件、主要品質フラグなし、直接比較可能3指標で結論が変わるか。
8. **複数弱点の深さ**: 未満個数だけでなく、中央値から1%、5%、10%以上離れた弱点数を比較。
9. **特化型プロファイル**: 成長、生産性・付加価値、賃金・雇用、費用対効果のどこに強みがあるか。
10. **共同申請・案件構造**: 単独企業指標が共同申請全体効果を過小表示していないか。

## 追加データがあればできること

- 不採択企業個票があれば、同回・同業種・同規模で採択確率を推定。
- 一次審査通過者があれば、書面審査とプレゼン審査を分けて分析。
- 審査項目別点数があれば、公開指標と実際の評価軸の対応を検証。
- 申請書・不採択理由があれば、定量劣後を補う定性要因を比較。

## 推奨順序

まず「公式中央値差」「PDF分布」「欠損・品質」「規模調整」「指標重複」を固め、その後に複数指標劣後企業のケース分析へ進みます。先に複雑な機械学習を行うより、定義と母集団を揃える方が重要です。
"""


def doc_08() -> str:
    return """# 08 出典・限界

## 主なローカル正本

- `data/reference/official_round_benchmarks.csv`: 公式申請者・採択者代表値、件数、定義、URL
- `analysis/round6_reassessment/metric_reconstruction_validation.csv`: 公開PDF再構成値と公式値の比較
- `analysis/round6_reassessment/case_level_reassessment.csv`: 381企業レコードの指標判定
- `data/processed/cases.csv`: 公開PDF企業マスタ
- `data/processed/analysis_quality_summary.json`: 品質フラグ集計
- `analysis/applicant_median_residual/`: 申請者中央値基準の感度分析
- `analysis/low_metric_profile_model/`: 規模、事業費、正規化の探索分析

## 必ず区別する母集団

1. 公式申請者全体
2. 公式採択申請者
3. 交付決定後にPDF公開された企業レコード
4. そのうち特定指標を再現できた企業
5. 主要品質フラグのない企業

これらは同じ分母ではありません。特に共同申請では、一つの採択案件が複数企業レコードになる場合があります。

## 統計上の限界

- 公式資料は原則中央値で、分散・四分位点・個票を公表していません。
- 「全社売上高に対する補助事業売上高の割合」は平均値で、他の中央値と同列に扱いません。
- 中央値未満は不合格を意味しません。採択者の約半数は各指標で中央値以下です。
- PDFは申請書・審査票ではなく、定義・期間・主体が異なる場合があります。
- 不採択個票がないため、採択確率・因果効果・配点を推定しません。
"""


def main() -> None:
    s = load_sources()
    bench = s["bench"]
    round_summary = s["round_summary"]
    counts = build_round_counts(bench, round_summary)
    gaps = build_gap_summary(bench)
    recon = build_reconstruction_summary(s["reconstruction"])

    counts.to_csv(HERE / "round_counts.csv", index=False, encoding="utf-8-sig")
    gaps.to_csv(HERE / "official_metric_gap_summary.csv", index=False, encoding="utf-8-sig")
    recon.to_csv(HERE / "pdf_metric_reconstruction_summary.csv", index=False, encoding="utf-8-sig")

    write("README.md", doc_00(counts))
    write("01_program_scale.md", doc_01(counts))
    write("02_official_median_gaps.md", doc_02(gaps))
    write("03_public_pdf_statistics.md", doc_03(recon, round_summary, s["quality_summary"]))
    write("04_metric_reading_guide.md", doc_04())
    write("05_multi_metric_lagging.md", doc_05(
        s["round6_summary"], s["applicant_summary"], s["boundary"], s["metric_sensitivity"]
    ))
    write("06_scale_and_redundancy.md", doc_06(s["amount_corr"], s["metric_corr"], s["attribute_blocks"]))
    write("07_next_analysis_questions.md", doc_07())
    write("08_sources_and_limits.md", doc_08())
    print(f"wrote compact basic-statistics notes to {HERE}")


if __name__ == "__main__":
    main()
