from __future__ import annotations

import json

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import Ridge
from sklearn.metrics import roc_auc_score

from analyze_low_metric_profile import (
    HERE,
    METRICS,
    make_pipeline,
    safe_spearman,
    select_ridge_alpha,
)
from analyze_normalization_sensitivity import add_normalized_scores
from analyze_low_metric_profile import load_data


DOMAINS = {
    "growth": ["sales_cagr", "sales_increase"],
    "productivity_value": ["labor_cagr", "value_added"],
    "wage": ["employee_pay_rate", "payroll_increase", "officer_pay_rate"],
}

EFFICIENCY_METRICS = {
    "growth": [
        "log_ratio_accepted_sales_cagr",
        "log_ratio_public_round_median_sales_increase_per_subsidy",
    ],
    "productivity_value": [
        "log_ratio_accepted_labor_cagr",
        "log_ratio_public_round_median_value_added_per_subsidy",
    ],
    "wage": [
        "log_ratio_accepted_employee_pay_rate",
        "log_ratio_public_round_median_payroll_increase_per_subsidy",
        "log_ratio_accepted_officer_pay_rate",
    ],
}

CANDIDATE_LABELS = {
    "raw_domain_mean": "生7指標・3領域平均",
    "scale_adjusted_mean": "規模調整・3領域平均",
    "scale_adjusted_compensatory": "規模調整・補完型",
    "context_adjusted_mean": "規模＋業種地域調整・3領域平均",
    "context_adjusted_compensatory": "規模＋業種地域調整・補完型",
    "efficiency_rate_mean": "補助金効率＋率・3領域平均",
    "efficiency_rate_compensatory": "補助金効率＋率・補完型",
    "efficiency_scale_adjusted_mean": "補助金効率＋率・規模再調整平均",
    "efficiency_scale_adjusted_compensatory": "補助金効率＋率・規模再調整補完型",
    "efficiency_scale_sufficiency_balanced": "補助金効率＋率・規模再調整・充足型",
    "efficiency_scale_sufficiency_top2": "補助金効率＋率・規模再調整・上位2領域充足型",
}

CANDIDATE_DOMAIN_PREFIX = {
    "raw_domain_mean": "raw",
    "scale_adjusted_mean": "scale_adjusted",
    "scale_adjusted_compensatory": "scale_adjusted",
    "context_adjusted_mean": "context_adjusted",
    "context_adjusted_compensatory": "context_adjusted",
    "efficiency_rate_mean": "efficiency_rate",
    "efficiency_rate_compensatory": "efficiency_rate",
    "efficiency_scale_adjusted_mean": "efficiency_scale_adjusted",
    "efficiency_scale_adjusted_compensatory": "efficiency_scale_adjusted",
    "efficiency_scale_sufficiency_balanced": "efficiency_scale_adjusted",
    "efficiency_scale_sufficiency_top2": "efficiency_scale_adjusted",
}


def logo_splits(groups: pd.Series):
    groups = groups.reset_index(drop=True)
    for held_out in sorted(groups.dropna().unique()):
        test = np.flatnonzero(groups.to_numpy() == held_out)
        train = np.flatnonzero(groups.to_numpy() != held_out)
        yield held_out, train, test


def cross_fitted_residuals(
    df: pd.DataFrame,
    target_cols: list[str],
    numeric_cols: list[str],
    categorical_cols: list[str],
    prefix: str,
) -> pd.DataFrame:
    result = pd.DataFrame(index=df.index)
    for target in target_cols:
        eligible = df[target].notna()
        sample_cols = list(dict.fromkeys(numeric_cols + categorical_cols + [target, "round"]))
        sample = df.loc[eligible, sample_cols].copy().reset_index()
        x = sample[numeric_cols + categorical_cols]
        y = pd.to_numeric(sample[target], errors="coerce")
        groups = sample["round"]
        predicted = np.full(len(sample), np.nan)
        for _, train, test in logo_splits(groups):
            train_x = x.iloc[train].reset_index(drop=True)
            train_y = y.iloc[train].reset_index(drop=True)
            train_groups = groups.iloc[train].reset_index(drop=True)
            alpha = select_ridge_alpha(
                train_x,
                train_y,
                train_groups,
                numeric_cols,
                categorical_cols,
            )
            model = make_pipeline(numeric_cols, categorical_cols, Ridge(alpha=alpha))
            model.fit(train_x, train_y)
            predicted[test] = model.predict(x.iloc[test])
        residual = y.to_numpy() - predicted
        output_col = f"{prefix}_{target}"
        result[output_col] = np.nan
        result.loc[sample["index"].to_numpy(), output_col] = residual
    return result


def within_round_percentiles(df: pd.DataFrame, columns: list[str], prefix: str) -> list[str]:
    output_cols = []
    for col in columns:
        out = f"{prefix}_{col}"
        df[out] = df.groupby("round")[col].rank(method="average", pct=True) * 100.0
        output_cols.append(out)
    return output_cols


def domain_scores(df: pd.DataFrame, metric_columns: dict[str, list[str]], prefix: str) -> list[str]:
    output = []
    for domain, columns in metric_columns.items():
        col = f"{prefix}_domain_{domain}"
        values = df[columns]
        df[col] = values.median(axis=1, skipna=True)
        df.loc[values.notna().sum(axis=1) == 0, col] = np.nan
        output.append(col)
    return output


def aggregate_domains(df: pd.DataFrame, domain_cols: list[str], prefix: str) -> None:
    values = df[domain_cols]
    observed = values.notna().sum(axis=1)
    mean_score = values.mean(axis=1, skipna=True)
    top_two = values.apply(
        lambda row: row.dropna().nlargest(min(2, row.notna().sum())).mean() if row.notna().sum() else np.nan,
        axis=1,
    )
    df[f"{prefix}_mean"] = mean_score.where(observed >= 2)
    # Fixed ex-ante blend: retains all-domain performance while allowing two
    # strong domains to compensate partly for one weak domain.
    df[f"{prefix}_compensatory"] = (0.6 * mean_score + 0.4 * top_two).where(observed >= 2)


def build_scores(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    raw_metric_cols = [f"log_ratio_accepted_{metric.key}" for metric in METRICS]
    raw_pct_cols = within_round_percentiles(df, raw_metric_cols, "raw_pct")
    raw_by_key = dict(zip([metric.key for metric in METRICS], raw_pct_cols))
    raw_domains = domain_scores(
        df,
        {domain: [raw_by_key[key] for key in keys] for domain, keys in DOMAINS.items()},
        "raw",
    )
    aggregate_domains(df, raw_domains, "raw_domain")

    scale_resid = cross_fitted_residuals(
        df,
        raw_metric_cols,
        ["log_baseline_sales", "log_baseline_employees"],
        ["round"],
        "scale_resid",
    )
    df = pd.concat([df, scale_resid], axis=1)
    scale_resid_cols = list(scale_resid.columns)
    scale_pct_cols = within_round_percentiles(df, scale_resid_cols, "scale_pct")
    scale_by_key = dict(zip([metric.key for metric in METRICS], scale_pct_cols))
    scale_domains = domain_scores(
        df,
        {domain: [scale_by_key[key] for key in keys] for domain, keys in DOMAINS.items()},
        "scale_adjusted",
    )
    aggregate_domains(df, scale_domains, "scale_adjusted")

    context_resid = cross_fitted_residuals(
        df,
        raw_metric_cols,
        [
            "log_baseline_sales",
            "log_baseline_employees",
            "head_office_per_capita_income_thousand_yen",
            "head_office_average_wage_thousand_yen_per_month",
            "head_office_population_change_pct",
        ],
        ["round", "industry", "head_office_region"],
        "context_resid",
    )
    df = pd.concat([df, context_resid], axis=1)
    context_pct_cols = within_round_percentiles(df, list(context_resid.columns), "context_pct")
    context_by_key = dict(zip([metric.key for metric in METRICS], context_pct_cols))
    context_domains = domain_scores(
        df,
        {domain: [context_by_key[key] for key in keys] for domain, keys in DOMAINS.items()},
        "context_adjusted",
    )
    aggregate_domains(df, context_domains, "context_adjusted")

    efficiency_source_cols = [col for cols in EFFICIENCY_METRICS.values() for col in cols]
    efficiency_pct_cols = within_round_percentiles(df, efficiency_source_cols, "efficiency_pct")
    efficiency_map = dict(zip(efficiency_source_cols, efficiency_pct_cols))
    efficiency_domains = domain_scores(
        df,
        {domain: [efficiency_map[col] for col in cols] for domain, cols in EFFICIENCY_METRICS.items()},
        "efficiency_rate",
    )
    aggregate_domains(df, efficiency_domains, "efficiency_rate")

    efficiency_resid = cross_fitted_residuals(
        df,
        efficiency_source_cols,
        ["log_baseline_sales", "log_baseline_employees"],
        ["round"],
        "efficiency_scale_resid",
    )
    df = pd.concat([df, efficiency_resid], axis=1)
    efficiency_resid_pct = within_round_percentiles(df, list(efficiency_resid.columns), "efficiency_scale_pct")
    efficiency_resid_map = dict(zip(efficiency_source_cols, efficiency_resid_pct))
    efficiency_scale_domains = domain_scores(
        df,
        {domain: [efficiency_resid_map[col] for col in cols] for domain, cols in EFFICIENCY_METRICS.items()},
        "efficiency_scale_adjusted",
    )
    aggregate_domains(df, efficiency_scale_domains, "efficiency_scale_adjusted")
    # Satisficing specification: once a domain reaches the within-round
    # accepted-company median (50th percentile), further strength does not
    # widen the attractiveness gap. This encodes a threshold/compensation
    # hypothesis rather than unbounded linear scoring.
    sufficiency = (df[efficiency_scale_domains].clip(lower=0, upper=50) / 50.0) * 100.0
    sufficiency_observed = sufficiency.notna().sum(axis=1)
    sufficiency_mean = sufficiency.mean(axis=1, skipna=True)
    sufficiency_top2 = sufficiency.apply(
        lambda row: row.dropna().nlargest(min(2, row.notna().sum())).mean() if row.notna().sum() else np.nan,
        axis=1,
    )
    df["efficiency_scale_sufficiency_balanced"] = (
        0.6 * sufficiency_mean + 0.4 * sufficiency_top2
    ).where(sufficiency_observed >= 2)
    df["efficiency_scale_sufficiency_top2"] = sufficiency_top2.where(sufficiency_observed >= 2)

    return df


def assign_raw_groups(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    # low_score_accepted is positive when the raw published profile is weak.
    low_cut = df.groupby("round")["low_score_accepted"].transform(lambda s: s.quantile(0.75))
    high_cut = df.groupby("round")["low_score_accepted"].transform(lambda s: s.quantile(0.25))
    df["raw_tail_group"] = "middle"
    df.loc[df["low_score_accepted"].ge(low_cut) & df["low_score_accepted"].notna(), "raw_tail_group"] = "raw_low"
    df.loc[df["low_score_accepted"].le(high_cut) & df["low_score_accepted"].notna(), "raw_tail_group"] = "raw_high"
    df.loc[df["low_score_accepted"].isna(), "raw_tail_group"] = "not_eligible"
    return df


def pooled_smd(low: pd.Series, high: pd.Series) -> float:
    low = pd.to_numeric(low, errors="coerce").dropna()
    high = pd.to_numeric(high, errors="coerce").dropna()
    if len(low) < 2 or len(high) < 2:
        return np.nan
    pooled = np.sqrt(((len(low) - 1) * low.var(ddof=1) + (len(high) - 1) * high.var(ddof=1)) / (len(low) + len(high) - 2))
    return (high.mean() - low.mean()) / pooled if pooled > 0 else np.nan


def compare_candidates(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = []
    round_rows = []
    raw_competitiveness = -pd.to_numeric(df["low_score_accepted"], errors="coerce")
    for candidate, label in CANDIDATE_LABELS.items():
        valid = df[candidate].notna() & df["raw_tail_group"].isin(["raw_low", "raw_high"])
        low = df.loc[valid & df["raw_tail_group"].eq("raw_low"), candidate]
        high = df.loc[valid & df["raw_tail_group"].eq("raw_high"), candidate]
        y = df.loc[valid, "raw_tail_group"].eq("raw_high").astype(int)
        score = df.loc[valid, candidate]
        rows.append({
            "candidate": candidate,
            "label": label,
            "eligible_n": int(df[candidate].notna().sum()),
            "raw_low_n": len(low),
            "raw_high_n": len(high),
            "raw_low_mean": low.mean(),
            "raw_high_mean": high.mean(),
            "high_minus_low_points": high.mean() - low.mean(),
            "standardized_mean_difference": pooled_smd(low, high),
            "tail_auc": roc_auc_score(y, score) if y.nunique() == 2 else np.nan,
            "spearman_with_raw_competitiveness": safe_spearman(df[candidate], raw_competitiveness),
            "raw_low_at_or_above_50_pct": 100 * low.ge(50).mean(),
            "raw_high_at_or_above_50_pct": 100 * high.ge(50).mean(),
            "all_iqr": df[candidate].quantile(0.75) - df[candidate].quantile(0.25),
        })
        for round_name, group in df[valid].groupby("round"):
            round_low = group.loc[group["raw_tail_group"].eq("raw_low"), candidate]
            round_high = group.loc[group["raw_tail_group"].eq("raw_high"), candidate]
            round_rows.append({
                "candidate": candidate,
                "round": round_name,
                "raw_low_n": len(round_low),
                "raw_high_n": len(round_high),
                "high_minus_low_points": round_high.mean() - round_low.mean(),
                "standardized_mean_difference": pooled_smd(round_low, round_high),
            })
    comparison = pd.DataFrame(rows)
    comparison["eligible_for_recommendation"] = (
        comparison["eligible_n"].ge(300)
        & comparison["spearman_with_raw_competitiveness"].ge(0.20)
        & comparison["candidate"].ne("raw_domain_mean")
    )
    comparison["recommendation_objective"] = comparison["standardized_mean_difference"].abs()
    return comparison, pd.DataFrame(round_rows)


def pareto_layers(df: pd.DataFrame, domain_cols: list[str]) -> pd.Series:
    values = df[domain_cols].to_numpy(float)
    layers = np.full(len(df), np.nan)
    remaining = np.flatnonzero(np.isfinite(values).sum(axis=1) == len(domain_cols))
    layer = 1
    while len(remaining):
        current = []
        for idx in remaining:
            others = remaining[remaining != idx]
            dominated = np.any(
                np.all(values[others] >= values[idx], axis=1)
                & np.any(values[others] > values[idx], axis=1)
            )
            if not dominated:
                current.append(idx)
        if not current:
            break
        layers[current] = layer
        remaining = np.setdiff1d(remaining, np.asarray(current), assume_unique=False)
        layer += 1
    return pd.Series(layers, index=df.index)


def write_report(df: pd.DataFrame, comparison: pd.DataFrame, by_round: pd.DataFrame, recommended: str) -> None:
    comp = comparison.set_index("candidate")
    raw = comp.loc["raw_domain_mean"]
    rec = comp.loc[recommended]
    rec_round = by_round[by_round["candidate"] == recommended]
    label = CANDIDATE_LABELS[recommended]
    low_group = df[df["raw_tail_group"] == "raw_low"]
    high_group = df[df["raw_tail_group"] == "raw_high"]
    low_niche_pct = 100 * low_group["adjusted_niche_competitive"].mean()
    high_niche_pct = 100 * high_group["adjusted_niche_competitive"].mean()
    low_broad_pct = 100 * low_group["adjusted_broad_competitive"].mean()
    high_broad_pct = 100 * high_group["adjusted_broad_competitive"].mean()
    table_rows = []
    for candidate in CANDIDATE_LABELS:
        r = comp.loc[candidate]
        table_rows.append(
            f"| {r['label']} | {int(r['eligible_n'])} | {r['raw_low_mean']:.1f} | {r['raw_high_mean']:.1f} | "
            f"{r['high_minus_low_points']:.1f} | {r['standardized_mean_difference']:.2f} | "
            f"{r['spearman_with_raw_competitiveness']:.2f} | {r['raw_low_at_or_above_50_pct']:.1f}% |"
        )
    round_rows = "\n".join(
        f"| {r['round']} | {r['high_minus_low_points']:.1f} | {r['standardized_mean_difference']:.2f} |"
        for _, r in rec_round.iterrows()
    )
    if recommended.startswith("efficiency_scale_sufficiency"):
        method_text = """1. 売上増加額／補助金、付加価値増加額／補助金、給与総額増加額／補助金と、売上・生産性・賃金の率指標を使う。
2. 各指標について、当該公募回を除く3回から基準売上高・基準従業員数による期待値を推定し、実績との差を規模調整値とする。
3. 規模調整値を同回内百分位へ変換し、成長、付加価値・生産性、賃金の3領域にまとめる。
4. 各領域は50パーセンタイルで100点に到達し、それ以上は加点しない充足度へ変換する。
5. 充足型では `0.6×3領域の平均充足度 + 0.4×上位2領域の平均充足度` とする。上位2領域型では上位2領域だけを使う。"""
        weight_note = "中央値での飽和と40%の補完部分は分析前に固定した仕様で、上下差が最小になる閾値や連続重みを探索したものではありません。"
    elif recommended.startswith("efficiency_scale_adjusted"):
        method_text = """1. 売上増加額／補助金、付加価値増加額／補助金、給与総額増加額／補助金と、売上・生産性・賃金の率指標を使う。
2. 各指標について、当該公募回を除く3回から基準売上高・基準従業員数による期待値を推定し、実績との差を規模調整値とする。
3. 規模調整値を同回内百分位へ変換し、成長、付加価値・生産性、賃金の3領域にまとめる。
4. 平均型は3領域平均、補完型は `0.6×3領域平均 + 0.4×上位2領域平均` とする。"""
        weight_note = "補完型の40%は分析前に固定した比率で、上下差が最小になる連続重みを探索したものではありません。"
    elif recommended.startswith("context_adjusted"):
        method_text = """1. 7指標を同回採択者中央値に対する対数比へ変換する。
2. 当該公募回を除く3回から、基準売上高、基準従業員数、業種、地域経済、本社地域による期待値を推定する。
3. 実績と期待値との差を同回内百分位に変換し、成長、付加価値・生産性、賃金の3領域にまとめる。
4. 平均型は3領域平均、補完型は `0.6×3領域平均 + 0.4×上位2領域平均` とする。"""
        weight_note = "補完型の40%は分析前に固定した比率で、上下差が最小になる連続重みを探索したものではありません。"
    else:
        method_text = """1. 各指標を同回内百分位へ変換する。
2. 成長、付加価値・生産性、賃金の3領域にまとめる。
3. 平均型は3領域平均、補完型は `0.6×3領域平均 + 0.4×上位2領域平均` とする。"""
        weight_note = "候補式は比較前に固定し、上下差が最小になる連続重みは探索していません。"
    report = f"""# 生指標上下群の差を縮小する調整済み競争力指標

## 推奨案

探索した固定仕様のうち、採択者生指標との順位相関を0.20以上残し、300社以上を評価できるという制約下で、上下群の標準化差が最小だったのは **{label}** です。

生指標下位・上位群は、調整前に同回内の生低位度の下位25%・上位25%として固定しました。調整式は当該公募回を使わず、残る3回で学習しています。

- 生3領域平均の上下差: {raw['high_minus_low_points']:.1f}点、標準化差 {raw['standardized_mean_difference']:.2f}
- 推奨調整後の上下差: {rec['high_minus_low_points']:.1f}点、標準化差 {rec['standardized_mean_difference']:.2f}
- 生競争力とのSpearman相関: {rec['spearman_with_raw_competitiveness']:.2f}
- 生指標下位群のうち調整後50点以上: {rec['raw_low_at_or_above_50_pct']:.1f}%
- 生指標上位群のうち調整後50点以上: {rec['raw_high_at_or_above_50_pct']:.1f}%

単一の連続点より、3領域の競争力セットとして見ると差はさらに縮みます。

- ニッチ競争力（調整後3領域の少なくとも1つが同回採択企業の25パーセンタイル以上）: 生下位群 {low_niche_pct:.1f}%、生上位群 {high_niche_pct:.1f}%
- 広域競争力（2領域以上が25パーセンタイル以上）: 生下位群 {low_broad_pct:.1f}%、生上位群 {high_broad_pct:.1f}%

差は縮小しますがゼロにはなりません。元指標との関係を完全に切らず、候補ごとに規模または業種・地域を含む事前属性による期待値との差と、複数領域の補完を反映した結果です。

## 候補比較

| 指標案 | n | 生下位群平均 | 生上位群平均 | 差 | 標準化差 | 生競争力との相関 | 生下位群50点以上 |
|---|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(table_rows)}

標準化差が小さいほど、生指標上下群の差が縮んでいます。ただし相関が極端に低い案は、生指標の経済的内容を失っている可能性があります。

## 推奨指標の作り方

{method_text}

{weight_note}

## 公募回別の未見回結果

| 公募回 | 上下差 | 標準化差 |
|---|---:|---:|
{round_rows}

公募回ごとの差が大きく異なる場合、共通指標としてではなく回別の制度・企業構成差として扱う必要があります。

## パレート層

推奨調整後の3領域について、他社に全領域で上回られない企業を第1パレート層としました。これは総合点とは別に、「平均では低くても固有の強みがある企業」を残すための分類です。`adjusted_company_profiles.csv` に収録しています。

ただし本分析では、生指標下位群は第1パレート層には残りませんでした。したがって「完全に他社へ支配されない」という強い条件より、下位25%フロンティアを一領域以上で超えるニッチ競争力の方が、今回の仮説に適した主分類です。

## 解釈上の限界

- 採択企業だけを使った「採択整合的」指標で、採択確率や真の審査点ではありません。
- 生指標上下群の差が縮む候補を比較しているため、探索的な結果です。
- 基準売上高の欠損は学習パイプライン内で補完され、欠損指標も説明変数として入ります。
- 業種・地域を調整すると、その属性に由来する実質的な政策効果まで除く可能性があります。
- 補助金効率型の基準には、公式申請者中央値ではなく同回公開企業中央値を含みます。
- 調整後も下位に残る企業は、定性審査、共同申請全体効果、加点、実現可能性など公開数値外の検討対象です。
"""
    (HERE / "competitive_adjusted_index_report.md").write_text(report, encoding="utf-8")


def main() -> None:
    df = assign_raw_groups(add_normalized_scores(load_data()))
    df = build_scores(df)
    comparison, by_round = compare_candidates(df)
    eligible = comparison[comparison["eligible_for_recommendation"]]
    if eligible.empty:
        raise RuntimeError("No candidate met the pre-specified recommendation constraints")
    recommended = eligible.sort_values("recommendation_objective").iloc[0]["candidate"]

    recommended_prefix = CANDIDATE_DOMAIN_PREFIX[recommended]
    domain_cols = [
        f"{recommended_prefix}_domain_growth",
        f"{recommended_prefix}_domain_productivity_value",
        f"{recommended_prefix}_domain_wage",
    ]
    df["recommended_adjusted_score"] = df[recommended]
    df["recommended_sufficiency_50"] = df["recommended_adjusted_score"].ge(50)
    domain_values = df[domain_cols]
    df["adjusted_domains_at_or_above_25_n"] = domain_values.ge(25).sum(axis=1)
    df["adjusted_niche_competitive"] = df["adjusted_domains_at_or_above_25_n"].ge(1)
    df["adjusted_broad_competitive"] = df["adjusted_domains_at_or_above_25_n"].ge(2)
    df["recommended_pareto_layer"] = np.nan
    for _, group in df.groupby("round"):
        df.loc[group.index, "recommended_pareto_layer"] = pareto_layers(group, domain_cols)
    df["recommended_index_key"] = recommended

    profile_cols = [
        "case_id", "round", "company", "industry", "head_office_region", "raw_tail_group",
        "low_score_accepted", "raw_domain_mean", recommended,
        "recommended_adjusted_score", "recommended_sufficiency_50",
        "adjusted_domains_at_or_above_25_n", "adjusted_niche_competitive",
        "adjusted_broad_competitive", "recommended_pareto_layer",
        *domain_cols,
        "log_baseline_sales", "log_baseline_employees", "has_consortium",
    ]
    df[profile_cols].to_csv(HERE / "adjusted_company_profiles.csv", index=False, encoding="utf-8-sig")
    comparison.to_csv(HERE / "adjusted_index_candidate_comparison.csv", index=False, encoding="utf-8-sig")
    by_round.to_csv(HERE / "adjusted_index_round_stability.csv", index=False, encoding="utf-8-sig")
    summary = {
        "recommended_candidate": recommended,
        "recommended_label": CANDIDATE_LABELS[recommended],
        "raw_group_definition": "within-round bottom/top quartiles of low_score_accepted",
        "recommendation_constraints": {
            "eligible_n_min": 300,
            "spearman_with_raw_competitiveness_min": 0.20,
            "candidate_formulas_fixed_before_comparison": True,
        },
        "proposed_metric_set": {
            "continuous_score": recommended,
            "niche_competitive": "at least one adjusted domain at or above within-round accepted-company 25th percentile",
            "broad_competitive": "at least two adjusted domains at or above within-round accepted-company 25th percentile",
            "domains": ["growth", "productivity_value", "wage"],
        },
        "not_identified": ["acceptance probability", "official review score", "causal preferential treatment"],
    }
    (HERE / "competitive_adjusted_index_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_report(df, comparison, by_round, recommended)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(comparison.sort_values("standardized_mean_difference").to_string(index=False))


if __name__ == "__main__":
    main()
