"""採択企業の公開PDFと公式中央値から、採択の補完要因を診断する。

因果推論ではない。非採択企業の個票と審査点が公開されていないため、
採択企業内で「可視7指標が弱くても、別の公開情報で説明できるか」を調べる。
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CASES_PATH = ROOT / "data" / "processed" / "cases.csv"
BENCHMARKS_PATH = ROOT / "data" / "reference" / "official_round_benchmarks.csv"
SALES_SERIES_PATH = ROOT / "data" / "processed" / "sales_series.csv"
PAGES_PATH = ROOT / "data" / "text" / "pages.jsonl"

VISIBLE_METRICS = {
    "company_sales_cagr": "sales_cagr_pct",
    "company_sales_increase": "sales_increase_oku_yen_normalized",
    "labor_cagr": "labor_annual_rate_pct",
    "employee_pay_rate": "employee_pay_annual_rate_pct",
    "employee_pay_total_increase": "employee_pay_total_increase_estimated_oku",
    "officer_pay_rate": "officer_pay_annual_rate_pct",
    "investment_sales_ratio": "investment_sales_ratio_pct",
}

METRIC_LABELS = {
    "company_sales_cagr": "1. 全社年平均売上高成長率",
    "company_sales_increase": "2. 全社売上高増加額",
    "company_pay_schedule_rate": "3. 全社賃上げ予定率",
    "project_sales_share": "4. 全社売上高に対する補助事業売上高の割合",
    "project_sales_cagr": "5. 補助事業年平均売上高成長率",
    "project_sales_increase": "6. 補助事業売上高増加額",
    "labor_cagr": "7. 補助事業年平均労働生産性の伸び",
    "value_added_increase": "8. 補助事業付加価値増加額",
    "employee_pay_rate": "9. 年平均従業員目標賃上げ率",
    "employee_pay_total_increase": "10. 従業員給与支給総額の増加額",
    "officer_pay_rate": "11. 年平均役員目標賃上げ率",
    "officer_pay_total_increase": "12. 役員給与支給総額の増加額",
    "investment_sales_ratio": "13. 全社売上高に対する投資額割合",
    "value_added_subsidy_ratio": "14. 補助金額に対する付加価値増加額割合",
    "local_benchmark_score": "15. ローカルベンチマークの得点",
}

THEMES = {
    "theme_labor_saving": ("省人化", "自動化", "人手不足", "省力化", "ロボット"),
    "theme_innovation": ("革新", "新規性", "差別化", "独自", "高付加価値"),
    "theme_supply_chain": ("サプライチェーン", "国内回帰", "安定供給", "経済安全保障"),
    "theme_green": ("脱炭素", "GX", "環境負荷", "省エネ", "再生可能"),
    "theme_regional_jobs": ("地域雇用", "雇用創出", "地方創生", "地域経済"),
    "theme_global": ("海外展開", "輸出", "グローバル", "海外市場"),
    "theme_new_capacity": ("新工場", "工場建設", "新設", "増産", "生産能力"),
    "theme_market_evidence": ("市場規模", "市場成長", "顧客ニーズ", "受注", "需要"),
}


def num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def official_lookup(bench: pd.DataFrame, statistic: str = "median") -> dict[tuple[str, str], float]:
    x = bench[bench["statistic"].eq(statistic)].copy()
    return {
        (str(row["round"]), row["metric_key"]): float(row["accepted_value"])
        for _, row in x.iterrows()
        if pd.notna(row["accepted_value"])
    }


def add_project_sales_proxies(cases: pd.DataFrame, series: pd.DataFrame) -> pd.DataFrame:
    s = series[series["scope"].astype(str).str.contains("補助事業", na=False)].copy()
    if s.empty:
        for col in ("project_sales_increase_proxy", "project_sales_cagr_proxy", "project_sales_share_proxy"):
            cases[col] = np.nan
        return cases
    for col in ("is_applicant_representative", "is_reported_primary", "is_primary"):
        s[col] = s[col].astype(str).str.lower().isin(("true", "1"))
    s["confidence_sort"] = s["confidence"].map({"high": 3, "medium": 2, "low": 1}).fillna(0)
    s = s.sort_values(
        ["case_id", "is_applicant_representative", "is_reported_primary", "is_primary", "confidence_sort"],
        ascending=[True, False, False, False, False],
    ).drop_duplicates("case_id")
    proxy = s[["case_id", "increase_oku_normalized", "cagr_pct", "target_sales_oku"]].copy()
    proxy = proxy.rename(columns={
        "increase_oku_normalized": "project_sales_increase_proxy",
        "cagr_pct": "project_sales_cagr_proxy",
    })
    proxy["project_sales_share_proxy"] = (
        100 * num(proxy["target_sales_oku"]) /
        num(cases.set_index("case_id").loc[proxy["case_id"], "sales_target_oku_yen"]).to_numpy()
    )
    return cases.merge(proxy.drop(columns="target_sales_oku"), on="case_id", how="left")


def add_text_themes(cases: pd.DataFrame) -> pd.DataFrame:
    text_by_case: dict[str, list[str]] = {}
    with PAGES_PATH.open(encoding="utf-8") as handle:
        for line in handle:
            page = json.loads(line)
            text_by_case.setdefault(str(page["case_id"]), []).append(str(page.get("text", "")))
    full_text = pd.Series({key: "\n".join(value) for key, value in text_by_case.items()})
    for theme, words in THEMES.items():
        cases[theme] = cases["case_id"].astype(str).map(
            lambda case_id: any(word in full_text.get(case_id, "") for word in words)
        )
    return cases


def within_round_percentile(df: pd.DataFrame, column: str) -> pd.Series:
    return df.groupby("round")[column].rank(pct=True, method="average")


def main() -> None:
    warnings.simplefilter("ignore", pd.errors.PerformanceWarning)
    cases = pd.read_csv(CASES_PATH).copy()
    bench = pd.read_csv(BENCHMARKS_PATH)
    sales_series = pd.read_csv(SALES_SERIES_PATH)
    accepted = official_lookup(bench)

    cases["subsidy_oku"] = num(cases["subsidy_million_yen_normalized"]) / 100
    cases["project_cost_oku"] = num(cases["project_cost_million_yen_normalized"]) / 100
    # 百万円 ÷ 億円は、そのまま百分率の数値になる。
    cases["investment_sales_ratio_pct"] = (
        num(cases["project_cost_million_yen_normalized"]) / num(cases["sales_baseline_oku_yen"])
    )
    cases["value_added_increase_proxy_oku"] = (
        num(cases["labor_target_value_man_yen_per_person"]) * num(cases["employees_target_value"])
        - num(cases["labor_base_value_man_yen_per_person"]) * num(cases["employees_base_value"])
    ) / 10000
    cases["value_added_subsidy_ratio_proxy_pct"] = (
        100 * cases["value_added_increase_proxy_oku"] / cases["subsidy_oku"]
    )
    cases["sales_increase_per_subsidy"] = num(cases["sales_increase_oku_yen_normalized"]) / cases["subsidy_oku"]
    cases["payroll_increase_per_subsidy"] = num(cases["employee_pay_total_increase_estimated_oku"]) / cases["subsidy_oku"]
    cases["jobs_increase_per_subsidy_oku"] = (
        num(cases["employees_target_value"]) - num(cases["employees_base_value"])
    ) / cases["subsidy_oku"]
    cases = add_project_sales_proxies(cases, sales_series)
    cases = add_text_themes(cases)

    below_cols = []
    for key, field in VISIBLE_METRICS.items():
        out = f"below_accepted_{key}"
        below_cols.append(out)
        values = num(cases[field])
        thresholds = pd.Series(
            [accepted.get((str(r), key), np.nan) for r in cases["round"]], index=cases.index
        )
        cases[out] = np.where(values.notna() & thresholds.notna(), values < thresholds, np.nan)
    below_frame = cases[below_cols].apply(pd.to_numeric, errors="coerce")
    cases["visible_metric_count"] = below_frame.notna().sum(axis=1)
    cases["below_accepted_count"] = below_frame.sum(axis=1, min_count=1)
    cases["below_accepted_share"] = cases["below_accepted_count"] / cases["visible_metric_count"]
    cases["visible_metric_lagging"] = (
        cases["visible_metric_count"].ge(3) & cases["below_accepted_share"].ge(0.60)
    )

    for key, col in {
        "value_added_increase": "value_added_increase_proxy_oku",
        "value_added_subsidy_ratio": "value_added_subsidy_ratio_proxy_pct",
        "project_sales_increase": "project_sales_increase_proxy",
        "project_sales_cagr": "project_sales_cagr_proxy",
        "project_sales_share": "project_sales_share_proxy",
    }.items():
        threshold = pd.Series([accepted.get((str(r), key), np.nan) for r in cases["round"]], index=cases.index)
        cases[f"above_accepted_{key}_proxy"] = num(cases[col]).ge(threshold) & threshold.notna()
        cases.loc[num(cases[col]).isna(), f"above_accepted_{key}_proxy"] = False

    compensation_cols = [
        "above_accepted_value_added_increase_proxy",
        "above_accepted_value_added_subsidy_ratio_proxy",
        "above_accepted_project_sales_increase_proxy",
        "above_accepted_project_sales_cagr_proxy",
        "above_accepted_project_sales_share_proxy",
    ]
    cases["has_quantitative_compensating_proxy"] = cases[compensation_cols].any(axis=1)
    cases["unresolved_visible_lag"] = cases["visible_metric_lagging"] & ~cases["has_quantitative_compensating_proxy"]

    derived = {
        "subsidy_oku": "補助金額（億円）",
        "project_cost_oku": "事業費（億円）",
        "value_added_increase_proxy_oku": "付加価値増加額・推計（億円）",
        "value_added_subsidy_ratio_proxy_pct": "補助金額に対する付加価値増加額・推計（%）",
        "sales_increase_per_subsidy": "売上高増加額／補助金額（倍）",
        "payroll_increase_per_subsidy": "給与総額増加額／補助金額（倍）",
        "jobs_increase_per_subsidy_oku": "雇用増加数／補助金1億円（人）",
        "investment_sales_ratio_pct": "投資額／全社売上高（%）",
    }
    comparisons = []
    for col, label in derived.items():
        cases[f"pct_{col}"] = within_round_percentile(cases, col)
        a = num(cases.loc[cases["visible_metric_lagging"], col]).dropna()
        b = num(cases.loc[~cases["visible_metric_lagging"], col]).dropna()
        pooled = np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2) if len(a) > 1 and len(b) > 1 else np.nan
        comparisons.append({
            "metric": label,
            "lagging_n": len(a),
            "other_n": len(b),
            "lagging_median": a.median(),
            "other_median": b.median(),
            "lagging_mean": a.mean(),
            "other_mean": b.mean(),
            "standardized_mean_difference": (a.mean() - b.mean()) / pooled if pooled else np.nan,
            "within_round_percentile_difference": (
                cases.loc[cases["visible_metric_lagging"], f"pct_{col}"].mean()
                - cases.loc[~cases["visible_metric_lagging"], f"pct_{col}"].mean()
            ),
        })
    group_comparison = pd.DataFrame(comparisons)

    round_rows = []
    for round_name, group in cases.groupby("round", sort=True):
        lag = group["visible_metric_lagging"]
        round_rows.append({
            "round": round_name,
            "public_pdf_cases": len(group),
            "official_accepted_n": bench.loc[(bench["round"].astype(str).eq(str(round_name))) & bench["accepted_n"].notna(), "accepted_n"].iloc[0],
            "visible_metric_lagging_n": int(lag.sum()),
            "visible_metric_lagging_pct": 100 * lag.mean(),
            "lagging_with_value_added_increase_win_n": int((lag & cases["above_accepted_value_added_increase_proxy"]).sum()),
            "lagging_with_value_added_subsidy_win_n": int((lag & cases["above_accepted_value_added_subsidy_ratio_proxy"]).sum()),
            "lagging_with_any_quantitative_compensation_n": int((lag & cases["has_quantitative_compensating_proxy"]).sum()),
            "unresolved_visible_lag_n": int(cases.loc[group.index, "unresolved_visible_lag"].sum()),
        })
    round_summary = pd.DataFrame(round_rows)

    proxy_validation_rows = []
    for round_name, group in cases.groupby("round", sort=True):
        for key, col, unit in (
            ("value_added_increase", "value_added_increase_proxy_oku", "億円"),
            ("value_added_subsidy_ratio", "value_added_subsidy_ratio_proxy_pct", "%"),
        ):
            official = accepted.get((str(round_name), key), np.nan)
            estimated = num(group[col]).median()
            proxy_validation_rows.append({
                "round": round_name,
                "metric_key": key,
                "unit": unit,
                "proxy_n": int(num(group[col]).notna().sum()),
                "proxy_median": estimated,
                "official_accepted_median": official,
                "relative_difference_pct": 100 * (estimated / official - 1) if official else np.nan,
            })
    proxy_validation = pd.DataFrame(proxy_validation_rows)

    metric_assessment = pd.DataFrame([
        ["14", "補助金額に対する付加価値増加額割合", "最重要候補", "明記", "高", "公開PDF推計の公式中央値再現性が高く、劣後企業の補完説明にも寄与"],
        ["8", "補助事業付加価値増加額", "重要", "明記", "中～高", "集計中央値を概ね再現。従業員範囲の不一致に注意"],
        ["4～6", "補助事業売上高の割合・成長率・増加額", "重要", "明記", "低", "事業固有の成長性を直接表すが公開PDFでの収録が少ない"],
        ["9～10", "従業員賃上げ率・給与総額増加額", "重要", "明記", "高", "政策目的に直結。給与総額／補助金額は効率指標として有用"],
        ["13", "全社売上高に対する投資額割合", "重要", "明記", "高", "企業変革の大きさ。劣後群を単独では救済しにくい"],
        ["新規", "売上高増加額／補助金額", "補助指標", "非明記", "高", "政府支出当たりの売上効果。ただし付加価値より政策定義との距離がある"],
        ["新規", "雇用増加数／補助金1億円", "補助指標", "非明記", "高", "地域雇用効果。職種・賃金・代替雇用を区別できない"],
        ["15等", "ローカルベンチマーク・金融機関確認・加点", "重要だが観測不能", "明記", "低", "財務健全性、実現可能性、加点を公開企業PDFだけでは復元できない"],
        ["定性", "独自性・市場性・波及効果・実現可能性", "重要だが点数化不能", "明記", "低", "審査の中核。文章言及は作れても審査評価そのものではない"],
    ], columns=["number", "indicator", "assessment", "official_status", "public_measurability", "reason"])

    diagnostic_columns = [
        "case_id", "round", "company", "pdf_url", "industry", "subsidy_oku", "project_cost_oku",
        "visible_metric_count", "below_accepted_count", "below_accepted_share", "visible_metric_lagging",
        "value_added_increase_proxy_oku", "value_added_subsidy_ratio_proxy_pct",
        "sales_increase_per_subsidy", "payroll_increase_per_subsidy", "jobs_increase_per_subsidy_oku",
        "project_sales_increase_proxy", "project_sales_cagr_proxy", "project_sales_share_proxy",
        *compensation_cols, "has_quantitative_compensating_proxy", "unresolved_visible_lag",
        *THEMES.keys(), *below_cols,
    ]
    diagnostics = cases[diagnostic_columns].sort_values(
        ["visible_metric_lagging", "below_accepted_share", "visible_metric_count"],
        ascending=[False, False, False],
    )

    lag = cases["visible_metric_lagging"]
    summary = {
        "case_count": int(len(cases)),
        "visible_metric_lagging_definition": "3指標以上観測かつ採択者中央値未満が60%以上",
        "visible_metric_lagging_n": int(lag.sum()),
        "visible_metric_lagging_pct": round(100 * lag.mean(), 1),
        "lagging_above_value_added_increase_n": int((lag & cases["above_accepted_value_added_increase_proxy"]).sum()),
        "lagging_above_value_added_subsidy_ratio_n": int((lag & cases["above_accepted_value_added_subsidy_ratio_proxy"]).sum()),
        "lagging_with_any_quantitative_compensation_n": int((lag & cases["has_quantitative_compensating_proxy"]).sum()),
        "unresolved_visible_lag_n": int(cases["unresolved_visible_lag"].sum()),
        "limitations": [
            "非採択企業の個票と審査点がないため採択要因の因果推論はできない",
            "公式中央値は合否基準ではなく各指標の採択者の半数は中央値未満になる",
            "公開PDF母集団と公募時の採択申請者母集団は一致しない",
            "付加価値推計の従業員数は補助事業従事者で、全社または審査入力値と一致しない可能性がある",
        ],
    }

    diagnostics.to_csv(HERE / "company_diagnostics.csv", index=False, encoding="utf-8-sig")
    round_summary.to_csv(HERE / "round_summary.csv", index=False, encoding="utf-8-sig")
    group_comparison.to_csv(HERE / "group_comparison.csv", index=False, encoding="utf-8-sig")
    metric_assessment.to_csv(HERE / "metric_assessment.csv", index=False, encoding="utf-8-sig")
    proxy_validation.to_csv(HERE / "proxy_validation.csv", index=False, encoding="utf-8-sig")
    (HERE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    theme_rows = []
    for theme in THEMES:
        theme_rows.append(
            f"| {theme} | {100 * cases.loc[lag, theme].mean():.1f}% | "
            f"{100 * cases.loc[~lag, theme].mean():.1f}% |"
        )
    validation_rows = []
    for _, row in proxy_validation.iterrows():
        validation_rows.append(
            f"| {row['round']} | {METRIC_LABELS[row['metric_key']]} | {int(row['proxy_n'])} | "
            f"{row['proxy_median']:.1f} | {row['official_accepted_median']:.1f} | "
            f"{row['relative_difference_pct']:+.1f}% |"
        )
    comparison_rows = []
    for _, row in group_comparison.iterrows():
        comparison_rows.append(
            f"| {row['metric']} | {int(row['lagging_n'])} | {row['lagging_median']:.2f} | "
            f"{row['other_median']:.2f} | {row['within_round_percentile_difference']:+.3f} |"
        )
    report = f"""# 採択企業の公開指標劣後と補完要因の分析

## 結論

公開PDF381社のうち、可視7指標が3個以上あり、その60%以上で同じ公募回の採択者中央値を下回る企業は **{int(lag.sum())}社（{100 * lag.mean():.1f}%）** でした。ただし、採択者中央値は合格点ではありません。各指標では採択者の半数が中央値未満になるため、「下回ること」自体は矛盾ではありません。

この{int(lag.sum())}社のうち、公開PDFから新たに推計した **8. 補助事業付加価値増加額** が公式採択者中央値以上なのは {int((lag & cases['above_accepted_value_added_increase_proxy']).sum())}社、**14. 補助金額に対する付加価値増加額割合** が以上なのは {int((lag & cases['above_accepted_value_added_subsidy_ratio_proxy']).sum())}社でした。補助事業売上高の疎な公開値も含め、少なくとも一つの追加定量軸で補完できたのは **{int((lag & cases['has_quantitative_compensating_proxy']).sum())}社（{100 * (lag & cases['has_quantitative_compensating_proxy']).sum() / lag.sum():.1f}%）**、残る **{int(cases['unresolved_visible_lag'].sum())}社** は公開定量値だけでは説明できません。

したがって、現時点で最も重要な追加指標は **付加価値増加額／補助金額** です。しかし、それだけで採択を説明するモデルにはなりません。公募要領が明示する独自性、市場成長性、地域波及、金融機関確認、財務健全性、実施体制、プレゼンテーション等が残差の主要候補です。

## 何をもって「劣後」としたか

- 比較対象: 全社売上高CAGR、全社売上高増加額、労働生産性、従業員賃上げ率、従業員給与総額増加額、役員賃上げ率、投資額／売上高の可視7指標
- 条件: 3指標以上観測でき、採択者中央値未満が60%以上
- これは感度分析用の便宜的定義で、公式の足切り条件ではない
- 公式中央値の母集団と、交付決定後に公開された企業PDFの母集団は一致しない。特に1次は公式採択109件に対し公開PDF156社、2次は85件に対し25社である

## 最重要候補: 付加価値増加額／補助金額

推計式は `(目標労働生産性×目標従業員数－基準労働生産性×基準従業員数)÷10,000`（億円）です。これを補助金額で割りました。企業単位では従業員数の主体範囲が一致しない可能性がありますが、公募回別の中央値は公式値にかなり近くなりました。

| 公募回 | 指標 | 推計可能社数 | 推計中央値 | 公式採択者中央値 | 乖離 |
|---|---|---:|---:|---:|---:|
{chr(10).join(validation_rows)}

特に補助金額比率は1次・3次・4次で公式中央値との差が約5%以内です。2次は約20%の差があり、母集団差と主体差に注意が必要です。この集計再現性と、公募要領が費用対効果として明示している点から、ダッシュボードにない指標の中では第一候補です。

## 劣後群とその他採択企業の比較

| 指標 | 劣後群n | 劣後群中央値 | その他中央値 | 公募回内百分位の平均差 |
|---|---:|---:|---:|---:|
{chr(10).join(comparison_rows)}

劣後群は、補助金額・事業費・付加価値増加額・投資強度でも概ね小さい側です。したがって「既存指標は弱いが、単純な規模や政府支出当たり効果だけは高い」という一つの説明で全社を括れません。一方、給与総額／補助金額の差は小さく、雇用・賃金面の効率が部分的な補完要因である可能性は残ります。

## 重要指標の優先順位

1. **14. 補助金額に対する付加価値増加額割合**: 政策上明示された費用対効果。公開PDF推計の集計再現性も高い。
2. **8. 補助事業付加価値増加額**: 絶対的な経済効果。小さい補助案件を率だけで過大評価しないため、1と併用する。
3. **4～6. 補助事業売上高の割合・CAGR・増加額**: 全社指標より、補助対象プロジェクト自体の成長性を直接測る。ただし現データでは企業別収録が少ない。
4. **9～10. 従業員賃上げ率・給与総額増加額**: 政策目的に直結。新規案として給与総額増加額／補助金額を併記する。
5. **新規: 雇用増加数／補助金1億円、売上高増加額／補助金額**: 地域雇用と政府支出効率を見やすくする補助指標。ただし公式の付加価値指標を代替しない。
6. **13. 投資額／全社売上高**: 企業変革の大きさを表すが、公開基準売上高は公式分母と異なる場合がある。
7. **15. ローカルベンチマーク、金融機関確認、認定・加点**: 重要だが公開企業PDFだけでは復元困難。
8. **定性審査**: 独自性、模倣困難性、市場の伸び、地域サプライチェーン、実施体制、工程、顧客・市場の確からしさ、プレゼンテーション。残る{int(cases['unresolved_visible_lag'].sum())}社の説明に不可欠と考えられる。

絶対額と補助金効率は二者択一ではありません。`付加価値増加額` と `付加価値増加額／補助金額` の2軸を中心に、賃金・雇用・実現可能性を加えるのが最も筋が良い構成です。

## 文章テーマの探索

| 単語テーマ | 劣後群の言及率 | その他の言及率 |
|---|---:|---:|
{chr(10).join(theme_rows)}

単純なキーワード言及率には大差がありませんでした。採択理由を文章から推定するには、単語の有無ではなく「主張の具体性」「市場根拠」「競合との差」「工程と資金調達」「地域波及の数量化」を人手または評価ルーブリック付きモデルで採点する必要があります。

## 例外企業の読み方

- 可視指標が全て中央値未満でも、株式会社イズミテクノ、株式会社キド、安田工業株式会社、化成工業株式会社などは付加価値／補助金の推計が採択者中央値以上で、費用対効果が補完要因の候補です。
- 株式会社八立製作所、株式会社タカラ倉庫運輸サービス等は、この追加定量軸でも説明できません。定性審査、加点、財務・実現可能性、または公開PDFと審査入力値の差を確認すべきケースです。
- 個社の「採択理由」と断定するには、審査結果通知や申請書、面接評価が必要です。

## 公式根拠と限界

[第4次公募の公募要領](https://seichotoushi-hojo.jp/assets/pdf/outline_4ji.pdf)は、経営力、先進性・成長性、地域への波及効果、大規模投資・費用対効果、実現可能性を審査項目に挙げ、補助金額に対する付加価値増加額、金融機関確認、各種認定等も扱っています。[第3次公募の概要](https://seichotoushi-hojo.jp/assets/pdf/about_3ji.pdf)にも費用対効果が明示されています。一次審査後にはプレゼンテーション審査があることも[第1次公募の案内](https://seichotoushi-hojo.jp/1_2ji/information/2024/05/28.html)から確認できます。

非採択企業の同じ15指標、審査項目別点数、加点、プレゼン評価がないため、ロジスティック回帰や機械学習で「採択確率への重要度」を推定することはできません。本分析が示すのは採択の因果ではなく、公開情報で観察できる補完関係です。
"""
    (HERE / "report.md").write_text(report, encoding="utf-8")

    assert len(diagnostics) == 381
    assert int(lag.sum()) >= 100
    assert (cases["value_added_subsidy_ratio_proxy_pct"].notna().sum()) >= 350
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
