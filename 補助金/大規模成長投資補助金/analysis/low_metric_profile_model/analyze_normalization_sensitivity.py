from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from analyze_low_metric_profile import (
    BINARY_BASIC,
    CATEGORICAL_BASIC,
    HERE,
    NUMERIC_BASIC,
    fit_continuous_logo,
    load_data,
    safe_spearman,
)


def positive_log_ratio(value: pd.Series, benchmark: pd.Series) -> pd.Series:
    value = pd.to_numeric(value, errors="coerce")
    benchmark = pd.to_numeric(benchmark, errors="coerce")
    valid = value.gt(0) & benchmark.gt(0)
    result = pd.Series(np.nan, index=value.index, dtype=float)
    result.loc[valid] = np.log(value.loc[valid] / benchmark.loc[valid])
    return result


def mean_low_score(df: pd.DataFrame, columns: list[str], minimum_observed: int) -> pd.Series:
    values = df[columns]
    score = -values.mean(axis=1, skipna=True)
    score[values.notna().sum(axis=1) < minimum_observed] = np.nan
    return score


def add_normalized_scores(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    absolute_keys = ["sales_increase", "value_added", "payroll_increase"]
    rate_keys = ["sales_cagr", "labor_cagr", "employee_pay_rate", "officer_pay_rate"]
    for benchmark in ("accepted", "applicant"):
        absolute_cols = [f"log_ratio_{benchmark}_{key}" for key in absolute_keys]
        rate_cols = [f"log_ratio_{benchmark}_{key}" for key in rate_keys]
        df[f"low_score_absolute_{benchmark}"] = mean_low_score(df, absolute_cols, 2)
        df[f"low_score_rate_{benchmark}"] = mean_low_score(df, rate_cols, 3)

    subsidy_oku = pd.to_numeric(df["subsidy_million_yen"], errors="coerce") / 100.0
    subsidy_valid = subsidy_oku.gt(0)
    efficiency_values = {
        "sales_increase_per_subsidy": pd.to_numeric(df["sales_increase_oku_yen_normalized"], errors="coerce") / subsidy_oku,
        "value_added_per_subsidy": pd.to_numeric(df["value_added_increase_estimated_oku"], errors="coerce") / subsidy_oku,
        "payroll_increase_per_subsidy": pd.to_numeric(df["employee_pay_total_increase_estimated_oku"], errors="coerce") / subsidy_oku,
    }
    efficiency_log_ratios = []
    for key, values in efficiency_values.items():
        values = values.where(subsidy_valid & values.gt(0))
        df[key] = values
        benchmark = values.groupby(df["round"]).transform("median")
        col = f"log_ratio_public_round_median_{key}"
        df[col] = positive_log_ratio(values, benchmark)
        efficiency_log_ratios.append(col)
    df["low_score_efficiency_public_median"] = mean_low_score(df, efficiency_log_ratios, 2)
    return df


def within_round_rank_correlation(df: pd.DataFrame, feature: str, outcome: str) -> tuple[int, float]:
    pair = df[["round", feature, outcome]].copy()
    pair[feature] = pd.to_numeric(pair[feature], errors="coerce")
    pair[outcome] = pd.to_numeric(pair[outcome], errors="coerce")
    pair = pair.dropna()
    if len(pair) < 5:
        return len(pair), np.nan
    pair["feature_rank"] = pair.groupby("round")[feature].rank(method="average", pct=True)
    pair["outcome_rank"] = pair.groupby("round")[outcome].rank(method="average", pct=True)
    return len(pair), safe_spearman(pair["feature_rank"], pair["outcome_rank"])


def score_scale_associations(df: pd.DataFrame) -> pd.DataFrame:
    definitions = {
        "accepted_deduplicated_domain": ("low_score_accepted", "採択者中央値比・重複調整3領域"),
        "applicant_deduplicated_domain": ("low_score_applicant", "申請者中央値比・重複調整3領域"),
        "accepted_absolute_amounts": ("low_score_absolute_accepted", "採択者中央値比・絶対額3指標"),
        "applicant_absolute_amounts": ("low_score_absolute_applicant", "申請者中央値比・絶対額3指標"),
        "accepted_rates": ("low_score_rate_accepted", "採択者中央値比・率4指標"),
        "applicant_rates": ("low_score_rate_applicant", "申請者中央値比・率4指標"),
        "per_subsidy_public_median": ("low_score_efficiency_public_median", "補助金当たり3指標・同回公開企業中央値比"),
    }
    rows = []
    for key, (outcome, label) in definitions.items():
        sales_n, sales_rho = within_round_rank_correlation(df, "log_baseline_sales", outcome)
        employee_n, employee_rho = within_round_rank_correlation(df, "log_baseline_employees", outcome)
        rows.append({
            "score_key": key,
            "score_label": label,
            "outcome": outcome,
            "eligible_n": int(df[outcome].notna().sum()),
            "baseline_sales_n": sales_n,
            "baseline_sales_within_round_spearman": sales_rho,
            "baseline_employees_n": employee_n,
            "baseline_employees_within_round_spearman": employee_rho,
        })
    return pd.DataFrame(rows)


def block_models(df: pd.DataFrame) -> pd.DataFrame:
    geography_numeric = [
        "head_office_per_capita_income_thousand_yen",
        "head_office_average_wage_thousand_yen_per_month",
        "head_office_population_change_pct",
    ]
    structure_binary = BINARY_BASIC
    specs = {
        "round_only": ([], ["round"]),
        "scale_only": (["log_baseline_sales", "log_baseline_employees"], ["round"]),
        "industry_only": ([], ["round", "industry"]),
        "geography_only": (geography_numeric, ["round", "head_office_region"]),
        "structure_only": (structure_binary, ["round"]),
        "industry_geography": (geography_numeric, ["round", "industry", "head_office_region"]),
        "full_basic": (NUMERIC_BASIC + BINARY_BASIC, CATEGORICAL_BASIC),
    }
    frames = []
    for outcome in ("low_score_accepted", "low_score_applicant"):
        for model_name, (numeric_cols, categorical_cols) in specs.items():
            _, performance, _, _ = fit_continuous_logo(
                df, outcome, numeric_cols, categorical_cols, model_name
            )
            frames.append(performance)
    result = pd.concat(frames, ignore_index=True)
    overall = result[result["held_out_round"] == "ALL_LOGO"].copy()
    baseline = overall[overall["model"] == "round_only"][["outcome", "r2", "mae"]].rename(
        columns={"r2": "round_only_r2", "mae": "round_only_mae"}
    )
    result = result.merge(baseline, on="outcome", how="left")
    result["r2_gain_vs_round_only"] = result["r2"] - result["round_only_r2"]
    result["mae_reduction_vs_round_only"] = result["round_only_mae"] - result["mae"]
    return result


def fmt(value, digits=3) -> str:
    if pd.isna(value):
        return "NA"
    return f"{float(value):.{digits}f}"


def write_report(blocks: pd.DataFrame, associations: pd.DataFrame) -> None:
    overall = blocks[blocks["held_out_round"] == "ALL_LOGO"].copy()

    def row(outcome: str, model: str) -> pd.Series:
        return overall[(overall["outcome"] == outcome) & (overall["model"] == model)].iloc[0]

    def assoc(key: str) -> pd.Series:
        return associations[associations["score_key"] == key].iloc[0]

    absolute = assoc("accepted_absolute_amounts")
    rates = assoc("accepted_rates")
    efficiency = assoc("per_subsidy_public_median")
    report = f"""# 業種・地域と補助金当たり正規化の感度分析

## 結論

業種だけ、地域だけでは、未見の公募回における公開指標低位度をほとんど説明できません。企業規模は明確な説明力を持ち、共同申請等の案件構造にも小さい追加信号があります。

一方、絶対額指標を補助金額当たりへ変換すると、企業規模との相関は大きく弱まります。ただし完全には消えず、特に基準売上高との関係が一部残ります。したがって「小規模企業への補完的採択」のように見える現象のかなりの部分は絶対額指標の算式に依存しますが、すべてが算式だけではありません。

## 属性ブロック別の公募回外性能

### 採択者中央値基準

| 説明変数 | LOGO R² | LOGO Spearman | R²改善（公募回のみ比） |
|---|---:|---:|---:|
| 公募回のみ | {fmt(row('low_score_accepted', 'round_only')['r2'])} | {fmt(row('low_score_accepted', 'round_only')['spearman'])} | 0.000 |
| 企業規模のみ | {fmt(row('low_score_accepted', 'scale_only')['r2'])} | {fmt(row('low_score_accepted', 'scale_only')['spearman'])} | {fmt(row('low_score_accepted', 'scale_only')['r2_gain_vs_round_only'])} |
| 業種のみ | {fmt(row('low_score_accepted', 'industry_only')['r2'])} | {fmt(row('low_score_accepted', 'industry_only')['spearman'])} | {fmt(row('low_score_accepted', 'industry_only')['r2_gain_vs_round_only'])} |
| 地域・地域経済のみ | {fmt(row('low_score_accepted', 'geography_only')['r2'])} | {fmt(row('low_score_accepted', 'geography_only')['spearman'])} | {fmt(row('low_score_accepted', 'geography_only')['r2_gain_vs_round_only'])} |
| 共同申請等の構造のみ | {fmt(row('low_score_accepted', 'structure_only')['r2'])} | {fmt(row('low_score_accepted', 'structure_only')['spearman'])} | {fmt(row('low_score_accepted', 'structure_only')['r2_gain_vs_round_only'])} |
| 業種＋地域 | {fmt(row('low_score_accepted', 'industry_geography')['r2'])} | {fmt(row('low_score_accepted', 'industry_geography')['spearman'])} | {fmt(row('low_score_accepted', 'industry_geography')['r2_gain_vs_round_only'])} |
| 全基礎属性 | {fmt(row('low_score_accepted', 'full_basic')['r2'])} | {fmt(row('low_score_accepted', 'full_basic')['spearman'])} | {fmt(row('low_score_accepted', 'full_basic')['r2_gain_vs_round_only'])} |

### 申請者中央値基準

| 説明変数 | LOGO R² | LOGO Spearman | R²改善（公募回のみ比） |
|---|---:|---:|---:|
| 公募回のみ | {fmt(row('low_score_applicant', 'round_only')['r2'])} | {fmt(row('low_score_applicant', 'round_only')['spearman'])} | 0.000 |
| 企業規模のみ | {fmt(row('low_score_applicant', 'scale_only')['r2'])} | {fmt(row('low_score_applicant', 'scale_only')['spearman'])} | {fmt(row('low_score_applicant', 'scale_only')['r2_gain_vs_round_only'])} |
| 業種のみ | {fmt(row('low_score_applicant', 'industry_only')['r2'])} | {fmt(row('low_score_applicant', 'industry_only')['spearman'])} | {fmt(row('low_score_applicant', 'industry_only')['r2_gain_vs_round_only'])} |
| 地域・地域経済のみ | {fmt(row('low_score_applicant', 'geography_only')['r2'])} | {fmt(row('low_score_applicant', 'geography_only')['spearman'])} | {fmt(row('low_score_applicant', 'geography_only')['r2_gain_vs_round_only'])} |
| 共同申請等の構造のみ | {fmt(row('low_score_applicant', 'structure_only')['r2'])} | {fmt(row('low_score_applicant', 'structure_only')['spearman'])} | {fmt(row('low_score_applicant', 'structure_only')['r2_gain_vs_round_only'])} |
| 業種＋地域 | {fmt(row('low_score_applicant', 'industry_geography')['r2'])} | {fmt(row('low_score_applicant', 'industry_geography')['spearman'])} | {fmt(row('low_score_applicant', 'industry_geography')['r2_gain_vs_round_only'])} |
| 全基礎属性 | {fmt(row('low_score_applicant', 'full_basic')['r2'])} | {fmt(row('low_score_applicant', 'full_basic')['spearman'])} | {fmt(row('low_score_applicant', 'full_basic')['r2_gain_vs_round_only'])} |

R²が負の場合、未見公募回では平均予測より悪いことを表します。業種・地域の係数が個別に見えても、回を越えて再現する説明力は乏しいという判定です。

## 指標正規化と企業規模の関係

すべて同じ公募回内で順位化してからSpearman相関を計算しました。低位スコアは値が大きいほど弱い指標プロファイルなので、負の相関は「規模が小さいほど指標が弱い」を意味します。

| 指標構成 | 判定可能n | 基準売上高との相関 | 基準従業員数との相関 |
|---|---:|---:|---:|
| 採択者中央値比・絶対額3指標 | {int(absolute['eligible_n'])} | {fmt(absolute['baseline_sales_within_round_spearman'])} (n={int(absolute['baseline_sales_n'])}) | {fmt(absolute['baseline_employees_within_round_spearman'])} (n={int(absolute['baseline_employees_n'])}) |
| 採択者中央値比・率4指標 | {int(rates['eligible_n'])} | {fmt(rates['baseline_sales_within_round_spearman'])} (n={int(rates['baseline_sales_n'])}) | {fmt(rates['baseline_employees_within_round_spearman'])} (n={int(rates['baseline_employees_n'])}) |
| 補助金当たり3指標・同回公開企業中央値比 | {int(efficiency['eligible_n'])} | {fmt(efficiency['baseline_sales_within_round_spearman'])} (n={int(efficiency['baseline_sales_n'])}) | {fmt(efficiency['baseline_employees_within_round_spearman'])} (n={int(efficiency['baseline_employees_n'])}) |

補助金当たりスコアは、売上増加額／補助金、付加価値増加額／補助金、給与総額増加額／補助金のうち2指標以上がある企業を対象としています。後二者には同一の給与・雇用推計が入るため、独立した3指標ではありません。

## 解釈

1. 業種構成だけで「低指標企業が採択される理由」を説明するのは難しいです。
2. 地域ブロックや地域所得・賃金・人口変化にも、安定した単独説明力はほぼありません。
3. 絶対額指標では小規模企業が構造的に不利に見えます。
4. 補助金額当たりにすると規模効果は弱まりますが、分母である補助金額自体が企業規模・案件規模と連動するため、完全な規模中立にはなりません。
5. 率指標と補助金当たり指標は「効率」、絶対額指標は「政策効果の総量」を測るため、どちらか一方へ統一せず二軸で示すのが妥当です。
6. 小規模企業が効率指標では強く、絶対額だけで弱い場合は「優遇」より「総量と効率の評価軸の違い」と表現すべきです。

## 限界

- 補助金当たり複合スコアの基準は、公式申請者中央値ではなく同回の公開企業中央値です。
- 基準売上高は欠損が多く、相関の標本は全357社より小さいです。
- 採択企業内分析なので、業種・地域・規模が採択確率へ与える効果は推定していません。
"""
    (HERE / "normalization_sensitivity_report.md").write_text(report, encoding="utf-8")


def main() -> None:
    df = add_normalized_scores(load_data())
    associations = score_scale_associations(df)
    blocks = block_models(df)
    associations.to_csv(HERE / "scale_normalization_sensitivity.csv", index=False, encoding="utf-8-sig")
    blocks.to_csv(HERE / "attribute_block_model_performance.csv", index=False, encoding="utf-8-sig")
    write_report(blocks, associations)
    print(associations.to_string(index=False))


if __name__ == "__main__":
    main()
