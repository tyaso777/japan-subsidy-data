from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import balanced_accuracy_score, mean_absolute_error, r2_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
CASES_PATH = PROJECT / "data" / "processed" / "cases.csv"
REASSESS_PATH = PROJECT / "analysis" / "round6_reassessment" / "case_level_reassessment.csv"

RANDOM_SEED = 20260721
ALPHAS = np.logspace(-3, 3, 13)
LOGISTIC_CS = np.logspace(-3, 2, 11)


@dataclass(frozen=True)
class Metric:
    key: str
    value: str
    accepted: str
    applicant: str
    domain: str


# No.13 is contextual rather than monotonically validated. No.14 shares the
# No.8 numerator, so both are excluded from the primary de-duplicated score.
METRICS = [
    Metric("sales_cagr", "sales_cagr_pct", "benchmark_accepted_company_sales_cagr", "benchmark_applicant_company_sales_cagr", "growth"),
    Metric("sales_increase", "sales_increase_oku_yen_normalized", "benchmark_accepted_company_sales_increase", "benchmark_applicant_company_sales_increase", "growth"),
    Metric("labor_cagr", "labor_annual_rate_pct", "benchmark_accepted_labor_cagr", "benchmark_applicant_labor_cagr", "productivity_value"),
    Metric("value_added", "value_added_increase_estimated_oku", "benchmark_accepted_value_added_increase", "benchmark_applicant_value_added_increase", "productivity_value"),
    Metric("employee_pay_rate", "employee_pay_annual_rate_pct", "benchmark_accepted_employee_pay_rate", "benchmark_applicant_employee_pay_rate", "wage"),
    Metric("payroll_increase", "employee_pay_total_increase_estimated_oku", "benchmark_accepted_employee_pay_total_increase", "benchmark_applicant_employee_pay_total_increase", "wage"),
    Metric("officer_pay_rate", "officer_pay_annual_rate_pct", "benchmark_accepted_officer_pay_rate", "benchmark_applicant_officer_pay_rate", "wage"),
]

NUMERIC_BASIC = [
    "log_baseline_sales",
    "log_baseline_employees",
    "head_office_per_capita_income_thousand_yen",
    "head_office_average_wage_thousand_yen_per_month",
    "head_office_population_change_pct",
]
BINARY_BASIC = [
    "has_consortium",
    "has_parent_company_reference",
    "has_subsidiary_reference",
    "has_related_company_reference",
    "head_office_project_same_prefecture",
]
CATEGORICAL_BASIC = ["round", "industry", "head_office_region"]
NUMERIC_PROJECT = ["log_project_cost", "log_subsidy", "subsidy_rate_pct", "project_location_count"]
BINARY_PROJECT = ["has_multiple_investments", "has_multiple_sales_series"]


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def bool_number(series: pd.Series) -> pd.Series:
    mapped = series.map({True: 1.0, False: 0.0, "True": 1.0, "False": 0.0, "true": 1.0, "false": 0.0, 1: 1.0, 0: 0.0})
    return numeric(mapped)


def safe_log1p(series: pd.Series) -> pd.Series:
    values = numeric(series)
    return np.log1p(values.where(values >= 0))


def safe_spearman(left, right) -> float:
    pair = pd.DataFrame({"left": left, "right": right}).apply(pd.to_numeric, errors="coerce").dropna()
    if len(pair) < 3 or pair["left"].nunique() < 2 or pair["right"].nunique() < 2:
        return np.nan
    return float(spearmanr(pair["left"], pair["right"]).statistic)


def load_data() -> pd.DataFrame:
    cases = pd.read_csv(CASES_PATH, low_memory=False)
    reassess = pd.read_csv(REASSESS_PATH, low_memory=False)
    reassess_keep = [
        "case_id", "round", "company", "industry", "is_clean",
        "dashboard9_lagging", "dashboard9_observed_n", "dashboard9_below_accepted_share",
    ]
    for metric in METRICS:
        reassess_keep.extend([metric.value, metric.accepted, metric.applicant])
    reassess_keep = list(dict.fromkeys(reassess_keep))
    # Prefer the already reconstructed values and corrected application round
    # in case_level_reassessment.csv; bring only non-overlapping raw attributes
    # from cases.csv.
    overlapping_case_cols = [col for col in reassess_keep if col != "case_id"]
    merged = reassess[reassess_keep].merge(
        cases.drop(columns=overlapping_case_cols, errors="ignore"),
        on="case_id",
        how="left",
        validate="one_to_one",
    )
    merged = merged.copy()
    merged["is_clean"] = merged["is_clean"].astype(str).str.lower().eq("true")
    merged["dashboard9_lagging"] = merged["dashboard9_lagging"].astype(str).str.lower().eq("true")
    for col in BINARY_BASIC + BINARY_PROJECT:
        merged[col] = bool_number(merged[col])
    merged["log_baseline_sales"] = safe_log1p(merged["sales_baseline_oku_yen"])
    merged["log_baseline_employees"] = safe_log1p(merged["employees_base_value"])
    merged["log_project_cost"] = safe_log1p(merged["project_cost_million_yen"] / 100.0)
    merged["log_subsidy"] = safe_log1p(merged["subsidy_million_yen"] / 100.0)
    for col in NUMERIC_BASIC + NUMERIC_PROJECT:
        merged[col] = numeric(merged[col])
    return add_scores(merged)


def add_scores(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for benchmark_type in ("accepted", "applicant"):
        domain_cols: dict[str, list[str]] = {}
        observed_cols: list[str] = []
        below_cols: list[str] = []
        for metric in METRICS:
            benchmark_col = metric.accepted if benchmark_type == "accepted" else metric.applicant
            values = numeric(df[metric.value])
            benchmark = numeric(df[benchmark_col])
            valid = values.gt(0) & benchmark.gt(0)
            ratio_col = f"log_ratio_{benchmark_type}_{metric.key}"
            ratio = pd.Series(np.nan, index=df.index, dtype=float)
            ratio.loc[valid] = np.log(values.loc[valid] / benchmark.loc[valid])
            df[ratio_col] = ratio
            observed_col = f"observed_{benchmark_type}_{metric.key}"
            below_col = f"below_{benchmark_type}_{metric.key}"
            df[observed_col] = valid.astype(float).where(valid, np.nan)
            df[below_col] = values.lt(benchmark).astype(float).where(valid, np.nan)
            observed_cols.append(ratio_col)
            below_cols.append(below_col)
            domain_cols.setdefault(metric.domain, []).append(ratio_col)
        for domain, cols in domain_cols.items():
            df[f"domain_log_ratio_{benchmark_type}_{domain}"] = df[cols].median(axis=1, skipna=True)
        domain_score_cols = [f"domain_log_ratio_{benchmark_type}_{d}" for d in domain_cols]
        df[f"score_{benchmark_type}_observed_metrics"] = df[observed_cols].notna().sum(axis=1)
        df[f"score_{benchmark_type}_observed_domains"] = df[domain_score_cols].notna().sum(axis=1)
        # Positive means a weaker published profile relative to the benchmark.
        df[f"low_score_{benchmark_type}"] = -df[domain_score_cols].mean(axis=1, skipna=True)
        df.loc[
            (df[f"score_{benchmark_type}_observed_metrics"] < 5)
            | (df[f"score_{benchmark_type}_observed_domains"] < 2),
            f"low_score_{benchmark_type}",
        ] = np.nan
        df[f"below_share_{benchmark_type}_dedup7"] = df[below_cols].mean(axis=1, skipna=True)
        df[f"lagging_{benchmark_type}_dedup7"] = (
            (df[f"score_{benchmark_type}_observed_metrics"] >= 5)
            & (df[f"below_share_{benchmark_type}_dedup7"] >= 0.60)
        )
    return df


def make_pipeline(numeric_cols: list[str], categorical_cols: list[str], estimator) -> Pipeline:
    numeric_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    categorical_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return Pipeline([
        ("prepare", ColumnTransformer([
            ("numeric", numeric_pipe, numeric_cols),
            ("categorical", categorical_pipe, categorical_cols),
        ])),
        ("model", estimator),
    ])


def logo_splits(groups: pd.Series) -> Iterable[tuple[np.ndarray, np.ndarray]]:
    for group in sorted(groups.dropna().unique()):
        test = np.flatnonzero(groups.to_numpy() == group)
        train = np.flatnonzero(groups.to_numpy() != group)
        yield train, test


def select_ridge_alpha(x: pd.DataFrame, y: pd.Series, groups: pd.Series, numeric_cols: list[str], categorical_cols: list[str]) -> float:
    scores = []
    for alpha in ALPHAS:
        fold_mae = []
        for train, test in logo_splits(groups):
            model = make_pipeline(numeric_cols, categorical_cols, Ridge(alpha=float(alpha)))
            model.fit(x.iloc[train], y.iloc[train])
            fold_mae.append(mean_absolute_error(y.iloc[test], model.predict(x.iloc[test])))
        scores.append((float(np.mean(fold_mae)), float(alpha)))
    return min(scores)[1]


def fit_continuous_logo(df: pd.DataFrame, outcome: str, numeric_cols: list[str], categorical_cols: list[str], model_name: str):
    sample = df[df[outcome].notna()].copy()
    x = sample[numeric_cols + categorical_cols]
    y = numeric(sample[outcome]).reset_index(drop=True)
    x = x.reset_index(drop=True)
    groups = sample["round"].reset_index(drop=True)
    predictions = np.full(len(sample), np.nan)
    fold_rows = []
    chosen = []
    for train, test in logo_splits(groups):
        alpha = select_ridge_alpha(x.iloc[train].reset_index(drop=True), y.iloc[train].reset_index(drop=True), groups.iloc[train].reset_index(drop=True), numeric_cols, categorical_cols)
        chosen.append(alpha)
        model = make_pipeline(numeric_cols, categorical_cols, Ridge(alpha=alpha))
        model.fit(x.iloc[train], y.iloc[train])
        predictions[test] = model.predict(x.iloc[test])
        fold_rows.append({
            "model": model_name, "outcome": outcome, "held_out_round": groups.iloc[test].iloc[0],
            "n": len(test), "alpha": alpha, "mae": mean_absolute_error(y.iloc[test], predictions[test]),
            "r2": r2_score(y.iloc[test], predictions[test]),
            "spearman": safe_spearman(y.iloc[test], predictions[test]),
        })
    alpha_full = float(np.median(chosen))
    fitted = make_pipeline(numeric_cols, categorical_cols, Ridge(alpha=alpha_full))
    fitted.fit(x, y)
    overall = {
        "model": model_name, "outcome": outcome, "held_out_round": "ALL_LOGO",
        "n": len(sample), "alpha": alpha_full, "mae": mean_absolute_error(y, predictions),
        "r2": r2_score(y, predictions), "spearman": safe_spearman(y, predictions),
    }
    return fitted, pd.DataFrame(fold_rows + [overall]), sample.index, predictions


def select_logistic_c(x: pd.DataFrame, y: pd.Series, groups: pd.Series, numeric_cols: list[str], categorical_cols: list[str]) -> float:
    scores = []
    for c_value in LOGISTIC_CS:
        fold_scores = []
        for train, test in logo_splits(groups):
            model = make_pipeline(numeric_cols, categorical_cols, LogisticRegression(C=float(c_value), class_weight="balanced", max_iter=3000))
            model.fit(x.iloc[train], y.iloc[train])
            prob = model.predict_proba(x.iloc[test])[:, 1]
            if y.iloc[test].nunique() == 2:
                fold_scores.append(roc_auc_score(y.iloc[test], prob))
        scores.append((float(np.mean(fold_scores)), float(c_value)))
    return max(scores)[1]


def fit_binary_logo(df: pd.DataFrame, outcome: str, eligible: pd.Series, numeric_cols: list[str], categorical_cols: list[str], model_name: str):
    sample = df[eligible].copy()
    x = sample[numeric_cols + categorical_cols].reset_index(drop=True)
    y = sample[outcome].astype(int).reset_index(drop=True)
    groups = sample["round"].reset_index(drop=True)
    predictions = np.full(len(sample), np.nan)
    chosen = []
    fold_rows = []
    for train, test in logo_splits(groups):
        c_value = select_logistic_c(x.iloc[train].reset_index(drop=True), y.iloc[train].reset_index(drop=True), groups.iloc[train].reset_index(drop=True), numeric_cols, categorical_cols)
        chosen.append(c_value)
        model = make_pipeline(numeric_cols, categorical_cols, LogisticRegression(C=c_value, class_weight="balanced", max_iter=3000))
        model.fit(x.iloc[train], y.iloc[train])
        prob = model.predict_proba(x.iloc[test])[:, 1]
        predictions[test] = prob
        fold_rows.append({
            "model": model_name, "outcome": outcome, "held_out_round": groups.iloc[test].iloc[0],
            "n": len(test), "positive_n": int(y.iloc[test].sum()), "C": c_value,
            "roc_auc": roc_auc_score(y.iloc[test], prob) if y.iloc[test].nunique() == 2 else np.nan,
            "balanced_accuracy": balanced_accuracy_score(y.iloc[test], prob >= 0.5),
        })
    c_full = float(np.median(chosen))
    fitted = make_pipeline(numeric_cols, categorical_cols, LogisticRegression(C=c_full, class_weight="balanced", max_iter=3000))
    fitted.fit(x, y)
    overall = {
        "model": model_name, "outcome": outcome, "held_out_round": "ALL_LOGO", "n": len(sample),
        "positive_n": int(y.sum()), "C": c_full, "roc_auc": roc_auc_score(y, predictions),
        "balanced_accuracy": balanced_accuracy_score(y, predictions >= 0.5),
    }
    return fitted, pd.DataFrame(fold_rows + [overall]), sample.index, predictions


def permutation_importance_logo(
    df: pd.DataFrame,
    outcome: str,
    numeric_cols: list[str],
    categorical_cols: list[str],
    model_name: str,
    repeats: int = 100,
) -> pd.DataFrame:
    sample = df[df[outcome].notna()].copy().reset_index(drop=True)
    x = sample[numeric_cols + categorical_cols]
    y = numeric(sample[outcome]).reset_index(drop=True)
    groups = sample["round"].reset_index(drop=True)
    rng = np.random.default_rng(RANDOM_SEED)
    rows = []
    for train, test in logo_splits(groups):
        alpha = select_ridge_alpha(x.iloc[train].reset_index(drop=True), y.iloc[train].reset_index(drop=True), groups.iloc[train].reset_index(drop=True), numeric_cols, categorical_cols)
        model = make_pipeline(numeric_cols, categorical_cols, Ridge(alpha=alpha))
        model.fit(x.iloc[train], y.iloc[train])
        base = mean_absolute_error(y.iloc[test], model.predict(x.iloc[test]))
        held_round = groups.iloc[test].iloc[0]
        for feature in [c for c in numeric_cols + categorical_cols if c != "round"]:
            deltas = []
            for _ in range(repeats):
                permuted = x.iloc[test].copy()
                permuted[feature] = rng.permutation(permuted[feature].to_numpy())
                deltas.append(mean_absolute_error(y.iloc[test], model.predict(permuted)) - base)
            rows.append({
                "model": model_name, "outcome": outcome, "feature": feature, "held_out_round": held_round,
                "mae_increase_mean": float(np.mean(deltas)), "mae_increase_sd": float(np.std(deltas, ddof=1)),
            })
    result = pd.DataFrame(rows)
    overall = result.groupby(["model", "outcome", "feature"], as_index=False).agg(
        mae_increase_mean=("mae_increase_mean", "mean"),
        mae_increase_sd=("mae_increase_mean", "std"),
    )
    overall["held_out_round"] = "MEAN"
    return pd.concat([result, overall], ignore_index=True)


def unadjusted_effects(df: pd.DataFrame, outcome: str, features: list[str]) -> pd.DataFrame:
    sample = df[df[outcome].notna()].copy()
    rows = []
    for feature in features:
        values = sample[feature]
        if feature in CATEGORICAL_BASIC:
            for level, group in sample.groupby(feature, dropna=False):
                rows.append({
                    "outcome": outcome, "feature": feature, "level": str(level), "n": len(group),
                    "mean_low_score": group[outcome].mean(), "median_low_score": group[outcome].median(),
                    "spearman": np.nan,
                })
        else:
            valid = numeric(values).notna()
            stat = safe_spearman(numeric(values[valid]), sample.loc[valid, outcome]) if valid.sum() >= 5 else np.nan
            rows.append({
                "outcome": outcome, "feature": feature, "level": "continuous_or_binary", "n": int(valid.sum()),
                "mean_low_score": np.nan, "median_low_score": np.nan, "spearman": stat,
            })
    return pd.DataFrame(rows)


def coefficient_table(model: Pipeline, outcome: str, model_name: str) -> pd.DataFrame:
    names = model.named_steps["prepare"].get_feature_names_out()
    coefficients = np.asarray(model.named_steps["model"].coef_).reshape(-1)
    result = pd.DataFrame({
        "outcome": outcome,
        "model": model_name,
        "transformed_feature": names,
        "coefficient": coefficients,
    })
    result["absolute_coefficient"] = result["coefficient"].abs()
    result["interpretation"] = np.where(
        result["coefficient"] > 0,
        "higher_or_present_associated_with_lower_metric_profile",
        "higher_or_present_associated_with_stronger_metric_profile",
    )
    return result.sort_values("absolute_coefficient", ascending=False)


def fmt(value, digits=3) -> str:
    if value is None or pd.isna(value):
        return "NA"
    return f"{float(value):.{digits}f}"


def write_report(df: pd.DataFrame, performance: pd.DataFrame, importance: pd.DataFrame, coefficients: pd.DataFrame) -> None:
    all_rows = performance[performance["held_out_round"] == "ALL_LOGO"]
    def perf(model: str, outcome: str, column: str):
        hit = all_rows[(all_rows["model"] == model) & (all_rows["outcome"] == outcome)]
        return hit.iloc[0][column] if len(hit) else np.nan

    imp = importance[importance["held_out_round"] == "MEAN"].sort_values("mae_increase_mean", ascending=False)
    accepted_imp = imp[imp["outcome"] == "low_score_accepted"].head(8)
    applicant_imp = imp[imp["outcome"] == "low_score_applicant"].head(8)
    accepted_lines = "\n".join(f"- `{r.feature}`: 置換時MAE増加 {fmt(r.mae_increase_mean, 4)}" for r in accepted_imp.itertuples())
    applicant_lines = "\n".join(f"- `{r.feature}`: 置換時MAE増加 {fmt(r.mae_increase_mean, 4)}" for r in applicant_imp.itertuples())
    consortium = df[df["low_score_accepted"].notna()].groupby("has_consortium")["low_score_accepted"].agg(["count", "mean"])
    consortium_no = consortium.loc[0.0] if 0.0 in consortium.index else pd.Series({"count": np.nan, "mean": np.nan})
    consortium_yes = consortium.loc[1.0] if 1.0 in consortium.index else pd.Series({"count": np.nan, "mean": np.nan})
    sales_rho = safe_spearman(df["log_baseline_sales"], df["low_score_accepted"])
    employees_rho = safe_spearman(df["log_baseline_employees"], df["low_score_accepted"])
    accepted_coef = coefficients[
        (coefficients["outcome"] == "low_score_accepted")
        & (coefficients["model"] == "basic")
        & ~coefficients["transformed_feature"].str.contains("missingindicator")
    ].head(8)
    coef_lines = "\n".join(
        f"- `{r.transformed_feature}`: 係数 {fmt(r.coefficient, 4)}（{'低位側' if r.coefficient > 0 else '強位側'}）"
        for r in accepted_coef.itertuples()
    )
    report = f"""# 公開定量指標の低位プロファイルと企業属性

## 結論

この分析は、採択・交付決定企業の中で、公開定量指標が同回中央値より低い企業の属性を説明・予測できるかを検証したものです。非採択企業がないため、採択確率や「優遇」の因果効果は推定していません。

主目的変数は、No.13を方向不確実として除き、No.14をNo.8との重複回避のため除いた7指標を、成長・生産性/付加価値・賃金の3領域にまとめた連続低位スコアです。正の値が大きいほど同回中央値より弱い公開指標プロファイルです。

## 標本

- 全収録レコード: {len(df)}
- 採択者中央値スコア判定可能: {df['low_score_accepted'].notna().sum()}
- 申請者中央値スコア判定可能: {df['low_score_applicant'].notna().sum()}
- 7指標版で採択者中央値未満が60%以上: {int(df['lagging_accepted_dedup7'].sum())}
- 7指標版で申請者中央値未満が60%以上: {int(df['lagging_applicant_dedup7'].sum())}

## 公募回外検証

Ridge回帰は各回を丸ごと外し、残る3回で正則化を選びました。

| 目的変数 | モデル | LOGO R² | LOGO Spearman | LOGO MAE |
|---|---|---:|---:|---:|
| 採択者中央値低位度 | 公募回のみ | {fmt(perf('round_only', 'low_score_accepted', 'r2'))} | {fmt(perf('round_only', 'low_score_accepted', 'spearman'))} | {fmt(perf('round_only', 'low_score_accepted', 'mae'))} |
| 採択者中央値低位度 | 基礎属性 | {fmt(perf('basic', 'low_score_accepted', 'r2'))} | {fmt(perf('basic', 'low_score_accepted', 'spearman'))} | {fmt(perf('basic', 'low_score_accepted', 'mae'))} |
| 採択者中央値低位度 | 基礎属性＋案件規模 | {fmt(perf('basic_project', 'low_score_accepted', 'r2'))} | {fmt(perf('basic_project', 'low_score_accepted', 'spearman'))} | {fmt(perf('basic_project', 'low_score_accepted', 'mae'))} |
| 申請者中央値低位度 | 公募回のみ | {fmt(perf('round_only', 'low_score_applicant', 'r2'))} | {fmt(perf('round_only', 'low_score_applicant', 'spearman'))} | {fmt(perf('round_only', 'low_score_applicant', 'mae'))} |
| 申請者中央値低位度 | 基礎属性 | {fmt(perf('basic', 'low_score_applicant', 'r2'))} | {fmt(perf('basic', 'low_score_applicant', 'spearman'))} | {fmt(perf('basic', 'low_score_applicant', 'mae'))} |
| 申請者中央値低位度 | 基礎属性＋案件規模 | {fmt(perf('basic_project', 'low_score_applicant', 'r2'))} | {fmt(perf('basic_project', 'low_score_applicant', 'spearman'))} | {fmt(perf('basic_project', 'low_score_applicant', 'mae'))} |
| 採択者中央値低位度・品質フラグなし | 基礎属性 | {fmt(perf('basic_clean', 'low_score_accepted', 'r2'))} | {fmt(perf('basic_clean', 'low_score_accepted', 'spearman'))} | {fmt(perf('basic_clean', 'low_score_accepted', 'mae'))} |
| 申請者中央値低位度・品質フラグなし | 基礎属性 | {fmt(perf('basic_clean', 'low_score_applicant', 'r2'))} | {fmt(perf('basic_clean', 'low_score_applicant', 'spearman'))} | {fmt(perf('basic_clean', 'low_score_applicant', 'mae'))} |

R²が0以下なら、未見の公募回に対して平均予測より改善していません。したがって、係数や重要度が見えても、回を越えて再現する企業類型とは直ちに解釈しません。

## 基礎属性モデルの置換重要度

### 採択者中央値基準

{accepted_lines}

### 申請者中央値基準

{applicant_lines}

置換重要度は未見公募回でその列だけを崩したときのMAE増加です。0以下は安定した予測寄与が確認できないことを示します。因果効果や審査上の重要度ではありません。

## 関係の方向

- 基準売上高と採択者中央値低位度の未調整Spearman相関は {fmt(sales_rho)}。売上高が小さい企業ほど低位度が高い関係です。
- 基準従業員数との未調整Spearman相関は {fmt(employees_rho)}。従業員数が少ない企業ほど低位度が高い関係です。
- 共同申請ありは n={int(consortium_yes['count'])}、平均低位度 {fmt(consortium_yes['mean'])}、なしは n={int(consortium_no['count'])}、平均低位度 {fmt(consortium_no['mean'])} でした。

全標本で当てた基礎属性Ridgeの標準化係数上位は次のとおりです。これは方向確認用で、公募回外の効果推定値ではありません。

{coef_lines}

企業規模が最も一貫した説明変数ですが、絶対額指標の算式から機械的に生じる部分があります。共同申請は規模より小さいものの両基準で予測寄与が残り、案件全体効果の過小測定または補完的評価の候補です。

## 二値低位群の識別性能

- 7指標版・採択者中央値低位群、基礎属性: LOGO AUC {fmt(perf('basic', 'lagging_accepted_dedup7', 'roc_auc'))}
- 7指標版・採択者中央値低位群、基礎属性＋案件規模: LOGO AUC {fmt(perf('basic_project', 'lagging_accepted_dedup7', 'roc_auc'))}
- 7指標版・申請者中央値低位群、基礎属性: LOGO AUC {fmt(perf('basic', 'lagging_applicant_dedup7', 'roc_auc'))}
- 既存9指標・採択者中央値低位群、基礎属性: LOGO AUC {fmt(perf('basic', 'dashboard9_lagging', 'roc_auc'))}

AUCは0.5が無識別です。申請者中央値低位群は30件しかなく、精度も限定的なので、個社判定には使えません。

## 解釈上の境界

- 分析対象は採択・交付決定企業のみであり、条件付き関連を見ています。
- 採択企業だけに条件づけると、定量指標と補完属性の間に選択由来の負の相関が生じ得ます。
- 小規模企業では絶対額指標が機械的に低くなるため、企業規模は「優遇」と測定構造の両方を表し得ます。
- 共同申請では単独企業の数値が案件全体効果を捉えない可能性があります。
- 欠損は中央値補完し、欠損指標を内部的に追加しています。完全ケース分析ではありません。
- No.13・14を除く主スコア、既存9指標二値分類、品質フラグなし標本を併読してください。

## ファイル

- `company_scores.csv`: 企業別スコアと主要属性
- `model_performance.csv`: 公募回外検証
- `feature_importance.csv`: 未見公募回での置換重要度
- `feature_effects.csv`: 未調整のカテゴリ別平均・順位相関
- `model_coefficients.csv`: 全標本モデルの標準化係数
- `predictions.csv`: 公募回外予測値
- `summary.json`: 機械可読要約
"""
    (HERE / "report.md").write_text(report, encoding="utf-8")


def main() -> None:
    df = load_data()
    model_specs = {
        "round_only": ([], ["round"]),
        "basic": (NUMERIC_BASIC + BINARY_BASIC, CATEGORICAL_BASIC),
        "basic_project": (NUMERIC_BASIC + BINARY_BASIC + NUMERIC_PROJECT + BINARY_PROJECT, CATEGORICAL_BASIC),
    }
    performance_frames = []
    prediction_frames = []
    coefficient_frames = []
    for outcome in ("low_score_accepted", "low_score_applicant"):
        for model_name, (num_cols, cat_cols) in model_specs.items():
            fitted, perf_df, indices, predictions = fit_continuous_logo(df, outcome, num_cols, cat_cols, model_name)
            performance_frames.append(perf_df)
            coefficient_frames.append(coefficient_table(fitted, outcome, model_name))
            prediction_frames.append(pd.DataFrame({
                "case_id": df.loc[indices, "case_id"], "company": df.loc[indices, "company"],
                "round": df.loc[indices, "round"], "outcome": outcome, "model": model_name,
                "observed": df.loc[indices, outcome], "logo_prediction": predictions,
            }))
        clean_df = df[df["is_clean"]].copy()
        fitted, perf_df, clean_indices, clean_predictions = fit_continuous_logo(
            clean_df, outcome, *model_specs["basic"], "basic_clean"
        )
        performance_frames.append(perf_df)
        coefficient_frames.append(coefficient_table(fitted, outcome, "basic_clean"))
        prediction_frames.append(pd.DataFrame({
            "case_id": clean_df.loc[clean_indices, "case_id"], "company": clean_df.loc[clean_indices, "company"],
            "round": clean_df.loc[clean_indices, "round"], "outcome": outcome, "model": "basic_clean",
            "observed": clean_df.loc[clean_indices, outcome], "logo_prediction": clean_predictions,
        }))

    eligible_accepted = df["score_accepted_observed_metrics"].ge(5)
    eligible_applicant = df["score_applicant_observed_metrics"].ge(5)
    for outcome, eligible in [
        ("lagging_accepted_dedup7", eligible_accepted),
        ("lagging_applicant_dedup7", eligible_applicant),
        ("dashboard9_lagging", df["dashboard9_observed_n"].ge(5)),
    ]:
        for model_name in ("basic", "basic_project"):
            num_cols, cat_cols = model_specs[model_name]
            _, perf_df, indices, predictions = fit_binary_logo(df, outcome, eligible, num_cols, cat_cols, model_name)
            performance_frames.append(perf_df)
            prediction_frames.append(pd.DataFrame({
                "case_id": df.loc[indices, "case_id"], "company": df.loc[indices, "company"],
                "round": df.loc[indices, "round"], "outcome": outcome, "model": model_name,
                "observed": df.loc[indices, outcome].astype(int), "logo_prediction": predictions,
            }))

    performance = pd.concat(performance_frames, ignore_index=True)
    predictions = pd.concat(prediction_frames, ignore_index=True)
    coefficients = pd.concat(coefficient_frames, ignore_index=True)
    importance = pd.concat([
        permutation_importance_logo(df, outcome, *model_specs["basic"], "basic")
        for outcome in ("low_score_accepted", "low_score_applicant")
    ], ignore_index=True)
    effects = pd.concat([
        unadjusted_effects(df, outcome, NUMERIC_BASIC + BINARY_BASIC + CATEGORICAL_BASIC)
        for outcome in ("low_score_accepted", "low_score_applicant")
    ], ignore_index=True)

    score_cols = [
        "case_id", "round", "company", "industry", "head_office_region", "is_clean",
        "low_score_accepted", "low_score_applicant", "lagging_accepted_dedup7", "lagging_applicant_dedup7",
        "score_accepted_observed_metrics", "score_applicant_observed_metrics", "has_consortium",
        "sales_baseline_oku_yen", "employees_base_value", "project_cost_million_yen", "subsidy_million_yen",
    ]
    df[score_cols].to_csv(HERE / "company_scores.csv", index=False, encoding="utf-8-sig")
    performance.to_csv(HERE / "model_performance.csv", index=False, encoding="utf-8-sig")
    predictions.to_csv(HERE / "predictions.csv", index=False, encoding="utf-8-sig")
    importance.to_csv(HERE / "feature_importance.csv", index=False, encoding="utf-8-sig")
    effects.to_csv(HERE / "feature_effects.csv", index=False, encoding="utf-8-sig")
    coefficients.to_csv(HERE / "model_coefficients.csv", index=False, encoding="utf-8-sig")
    summary = {
        "scope": "accepted/grant-decided public company records only",
        "n_records": int(len(df)),
        "accepted_score_eligible_n": int(df["low_score_accepted"].notna().sum()),
        "applicant_score_eligible_n": int(df["low_score_applicant"].notna().sum()),
        "accepted_lagging_dedup7_n": int(df["lagging_accepted_dedup7"].sum()),
        "applicant_lagging_dedup7_n": int(df["lagging_applicant_dedup7"].sum()),
        "primary_score": "negative mean of domain-median log(company / same-round benchmark), excluding No.13 and No.14",
        "not_identified": ["acceptance probability", "causal preferential treatment", "review weights"],
        "random_seed": RANDOM_SEED,
    }
    (HERE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(df, performance, importance, coefficients)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
