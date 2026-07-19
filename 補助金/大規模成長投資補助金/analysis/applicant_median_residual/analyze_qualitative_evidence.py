"""回次補正後28件の公開PDF目視コーディングを統合し、比較可能な記述統計を作る。

このスクリプトは「採択理由」を同定しない。公開された採択企業の概要資料から
説明候補を符号化し、別の採択企業サンプルと比べたときに特有と言えるかを点検する。
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ROUND6 = HERE.parent / "round6_reassessment"
ADOPTION = HERE.parent / "adoption_drivers"
RNG_SEED = 20260719
N_PERMUTATIONS = 20_000

FACTOR_MAP = {
    "A": ("需要の確からしさ", "demand"),
    "B": ("物理的な能力制約", "constraint"),
    "C": ("事業転換・差別化", "transformation"),
    "D": ("供給網・地域の不可欠性", "regional"),
    "E": ("実行準備", "execution"),
    "F": ("資金・自己負担能力", None),
    "G": ("雇用・賃上げの質", None),
    "H": ("政策適合・波及性", "strategic"),
    "I": ("反証の強さ", None),
}


def read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, encoding="utf-8-sig")


def write_csv(frame: pd.DataFrame, name: str) -> None:
    frame.to_csv(HERE / name, index=False, encoding="utf-8-sig")


def normalize_company(value: object) -> str:
    return re.sub(r"[\s　]+", "", str(value or "")).replace("㈱", "株式会社")


def fisher_two_sided(a: int, b: int, c: int, d: int) -> float:
    """2x2表のFisher正確検定（両側、確率が観測値以下の表を合計）。"""
    row1, row2 = a + b, c + d
    col1, total = a + c, a + b + c + d
    if total == 0:
        return float("nan")

    def probability(x: int) -> float:
        return math.comb(col1, x) * math.comb(total - col1, row1 - x) / math.comb(total, row1)

    low = max(0, row1 - (total - col1))
    high = min(row1, col1)
    p_obs = probability(a)
    return min(1.0, sum(probability(x) for x in range(low, high + 1) if probability(x) <= p_obs + 1e-15))


def spearman(a: pd.Series, b: pd.Series) -> float:
    pair = pd.concat([pd.to_numeric(a, errors="coerce"), pd.to_numeric(b, errors="coerce")], axis=1).dropna()
    if len(pair) < 3 or pair.iloc[:, 0].nunique() < 2 or pair.iloc[:, 1].nunique() < 2:
        return float("nan")
    return float(pair.iloc[:, 0].rank().corr(pair.iloc[:, 1].rank()))


def normalize_part(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    for letter in FACTOR_MAP:
        score = f"{letter}_score"
        evidence = f"{letter}_evidence"
        out[score] = pd.to_numeric(out.get(score), errors="coerce")
        if evidence not in out:
            out[evidence] = ""
        source = f"{letter}_source_page_role"
        if source not in out:
            page = out.get(f"{letter}_page", pd.Series("", index=out.index)).fillna("").astype(str)
            role = out.get(f"{letter}_role", pd.Series("", index=out.index)).fillna("").astype(str)
            out[source] = ("p." + page + " / " + role).str.replace(r"^p\.\s*/\s*$", "", regex=True)
    if "primary_legacy_criteria" not in out and "primary_old_round_criterion" in out:
        out["primary_legacy_criteria"] = out["primary_old_round_criterion"]
    for column in [
        "quality_note", "dominant_archetype", "primary_legacy_criteria",
        "fact_summary", "inference_summary", "inference_confidence", "pdf_url",
    ]:
        if column not in out:
            out[column] = ""
    return out


def derive_pattern(row: pd.Series) -> str:
    values = pd.to_numeric(
        pd.Series([row.get(f"{x}_score", 0) for x in "ABCDEF"]),
        errors="coerce",
    ).fillna(0)
    a, b, c, d, e, f = (float(value) for value in values)
    if a + b >= 5:
        return "需要確度×能力制約"
    if c >= 3 and c >= max(a, b, d):
        return "事業転換・垂直統合"
    if d >= 3 and d >= max(a, b, c):
        return "供給網・地域インフラ"
    if e + f >= 5:
        return "実行準備・資金裏付け"
    return "複合型"


def derive_criteria(row: pd.Series) -> str:
    scores = {
        "①経営力": np.nanmean([row.get("A_score"), row.get("C_score"), row.get("F_score")]),
        "②先進性・成長性": np.nanmean([row.get("A_score"), row.get("B_score"), row.get("C_score")]),
        "③地域への波及効果": np.nanmean([row.get("D_score"), row.get("G_score"), row.get("H_score")]),
        "⑤実現可能性": np.nanmean([row.get("E_score"), row.get("F_score")]),
    }
    order = sorted(scores, key=lambda key: (-scores[key], key))
    return "／".join(order[:2])


def combine_coding() -> pd.DataFrame:
    parts = []
    for relative_path in [
        Path("legacy_pre_round_audit") / "qualitative_coding_part_a.csv",
        Path("legacy_pre_round_audit") / "qualitative_coding_part_b.csv",
        Path("qualitative_coding_urashima.csv"),
    ]:
        path = HERE / relative_path
        if not path.exists():
            raise FileNotFoundError(path)
        part = normalize_part(read_csv(path))
        part["coding_part"] = path.name
        parts.append(part)
    frame = pd.concat(parts, ignore_index=True, sort=False)
    # Part A was coded before the official application-round audit. Preserve the
    # underlying judgement, but express its population reference against the
    # corrected 28-case set used by every downstream output.
    if "inference_summary" in frame:
        frame["inference_summary"] = (
            frame["inference_summary"]
            .astype(str)
            .str.replace("29件固有の強さ", "補正後28件に固有の強さ", regex=False)
            .str.replace("29件固有性", "補正後28件への固有性", regex=False)
        )
    core = read_csv(HERE / "core28_company_quantitative_table.csv")
    core_ids = set(core["case_id"])
    frame = frame[frame["case_id"].isin(core_ids)].copy()
    frame = frame.drop(columns=["round"], errors="ignore").merge(
        core[["case_id", "round"]], on="case_id", how="left", validate="one_to_one"
    )
    frame = frame.sort_values(["case_id", "company"], kind="stable").reset_index(drop=True)
    if len(frame) != 28 or frame["case_id"].nunique() != 28:
        raise AssertionError(f"定性コーディングは補正後28件一意である必要があります: rows={len(frame)} unique={frame['case_id'].nunique()}")

    score_columns = [f"{letter}_score" for letter in "ABCDEFGH"]
    frame["strong_factor_n_A_H"] = (frame[score_columns] >= 2).sum(axis=1)
    frame["high_factor_n_A_H"] = (frame[score_columns] >= 3).sum(axis=1)
    frame["strong_factor_labels"] = frame.apply(
        lambda row: "／".join(FACTOR_MAP[x][0] for x in "ABCDEFGH" if row[f"{x}_score"] >= 2), axis=1
    )
    derived = frame.apply(derive_pattern, axis=1)
    frame["explanation_pattern"] = frame["dominant_archetype"].replace("", np.nan).fillna(derived)
    criteria = frame.apply(derive_criteria, axis=1)
    frame["criteria_mapping"] = frame["primary_legacy_criteria"].replace("", np.nan).fillna(criteria)
    frame["local_pdf_relative"] = frame["case_id"].map(
        lambda value: f"../../local_assets/pdfs/{re.sub(r'_+', '_', str(value))}.pdf"
    )
    return frame


def factor_summary(coding: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for letter, (label, _) in FACTOR_MAP.items():
        values = pd.to_numeric(coding[f"{letter}_score"], errors="coerce").dropna()
        rows.append({
            "factor": letter,
            "factor_label": label,
            "n": len(values),
            "mean_score": values.mean(),
            "median_score": values.median(),
            "score_2_or_3_n": int((values >= 2).sum()),
            "score_2_or_3_pct": 100 * (values >= 2).mean(),
            "score_3_n": int((values >= 3).sum()),
            "score_3_pct": 100 * (values >= 3).mean(),
        })
    return pd.DataFrame(rows)


def overlap_consistency(coding: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    old = read_csv(ROUND6 / "focused_qualitative_review_44.csv")
    merged = coding.merge(old, on="case_id", how="inner", suffixes=("_new", "_old"))
    rows = []
    for letter, (label, old_column) in FACTOR_MAP.items():
        if old_column is None or old_column not in merged:
            continue
        new = pd.to_numeric(merged[f"{letter}_score"], errors="coerce")
        prior = pd.to_numeric(merged[old_column], errors="coerce")
        valid = new.notna() & prior.notna()
        delta = new[valid] - prior[valid]
        rows.append({
            "factor": letter,
            "factor_label": label,
            "overlap_n": int(valid.sum()),
            "exact_agreement_pct": 100 * (delta == 0).mean(),
            "within_one_point_pct": 100 * (delta.abs() <= 1).mean(),
            "mean_new_minus_old": delta.mean(),
            "mean_absolute_difference": delta.abs().mean(),
            "spearman_rho": spearman(new[valid], prior[valid]),
        })
    return merged, pd.DataFrame(rows)


def reference_comparison(coding: pd.DataFrame) -> pd.DataFrame:
    """補正後28件の新規符号化と、既存44件から重複を除いた採択企業を記述比較する。"""
    old = read_csv(ROUND6 / "focused_qualitative_review_44.csv")
    old = old[~old["case_id"].isin(set(coding["case_id"]))].copy()
    rows = []
    for letter, (label, old_column) in FACTOR_MAP.items():
        if old_column is None:
            continue
        treated = pd.to_numeric(coding[f"{letter}_score"], errors="coerce").dropna()
        control = pd.to_numeric(old[old_column], errors="coerce").dropna()
        ta, tb = int((treated >= 2).sum()), int((treated < 2).sum())
        ca, cb = int((control >= 2).sum()), int((control < 2).sum())
        rows.append({
            "factor": letter,
            "factor_label": label,
            "core28_n": len(treated),
            "core28_mean": treated.mean(),
            "core28_strong_pct": 100 * ta / len(treated),
            "reference_accepted_n": len(control),
            "reference_accepted_mean": control.mean(),
            "reference_accepted_strong_pct": 100 * ca / len(control),
            "mean_difference": treated.mean() - control.mean(),
            "strong_share_difference_pctpt": 100 * ta / len(treated) - 100 * ca / len(control),
            "fisher_two_sided_p": fisher_two_sided(ta, tb, ca, cb),
            "sampling_warning": "参照群は無作為抽出された不採択企業ではなく、別目的で目視した採択企業",
        })
    return pd.DataFrame(rows)


def within_round_permutation(frame: pd.DataFrame, value_column: str, core_ids: set[str]) -> dict[str, float]:
    work = frame[["case_id", "round", value_column]].copy()
    work[value_column] = pd.to_numeric(work[value_column], errors="coerce")
    work = work.dropna(subset=[value_column])
    work["treated"] = work["case_id"].isin(core_ids)
    treated = work.loc[work["treated"], value_column]
    control = work.loc[~work["treated"], value_column]
    observed = float(treated.mean() - control.mean())
    rng = np.random.default_rng(RNG_SEED + sum(ord(char) for char in value_column))
    extreme = 0
    rounds = []
    for _, group in work.groupby("round", sort=False):
        rounds.append((group[value_column].to_numpy(dtype=float), int(group["treated"].sum())))
    for _ in range(N_PERMUTATIONS):
        treated_values, control_values = [], []
        for values, n_treated in rounds:
            indices = rng.permutation(len(values))
            treated_values.extend(values[indices[:n_treated]])
            control_values.extend(values[indices[n_treated:]])
        simulated = np.mean(treated_values) - np.mean(control_values)
        extreme += abs(simulated) >= abs(observed) - 1e-15
    return {
        "core28_n": len(treated),
        "other_accepted_n": len(control),
        "core28_mean": treated.mean(),
        "core28_median": treated.median(),
        "other_accepted_mean": control.mean(),
        "other_accepted_median": control.median(),
        "mean_difference": observed,
        "within_round_permutation_p": (extreme + 1) / (N_PERMUTATIONS + 1),
    }


def automated_text_comparison(coding: pd.DataFrame) -> pd.DataFrame:
    profiles = read_csv(ADOPTION / "application_profiles.csv")
    core_ids = set(coding["case_id"])
    metrics = {
        "text_evidence_percentile_mean": "5観点テキスト証拠順位の平均",
        "text_management_density_pct": "経営力語句密度の同回順位",
        "text_innovation_market_density_pct": "市場・先進性語句密度の同回順位",
        "text_regional_spillover_density_pct": "地域波及語句密度の同回順位",
        "text_feasibility_density_pct": "実現可能性語句密度の同回順位",
        "text_policy_relevance_density_pct": "政策適合語句密度の同回順位",
        "text_length": "公開PDF抽出文字数",
    }
    rows = []
    for column, label in metrics.items():
        result = within_round_permutation(profiles, column, core_ids)
        rows.append({"metric": column, "metric_label": label, **result})
    return pd.DataFrame(rows)


def theme_comparison(coding: pd.DataFrame) -> pd.DataFrame:
    diagnostics = read_csv(ADOPTION / "company_diagnostics.csv")
    core_ids = set(coding["case_id"])
    diagnostics["treated"] = diagnostics["case_id"].isin(core_ids)
    rows = []
    for column in [name for name in diagnostics if name.startswith("theme_")]:
        values = diagnostics[column].astype(str).str.lower().isin({"true", "1", "yes"})
        ta = int((values & diagnostics["treated"]).sum())
        tb = int((~values & diagnostics["treated"]).sum())
        ca = int((values & ~diagnostics["treated"]).sum())
        cb = int((~values & ~diagnostics["treated"]).sum())
        rows.append({
            "theme": column,
            "core28_yes_n": ta,
            "core28_pct": 100 * ta / (ta + tb),
            "other_accepted_yes_n": ca,
            "other_accepted_pct": 100 * ca / (ca + cb),
            "difference_pctpt": 100 * ta / (ta + tb) - 100 * ca / (ca + cb),
            "fisher_two_sided_p": fisher_two_sided(ta, tb, ca, cb),
        })
    return pd.DataFrame(rows).sort_values("difference_pctpt", ascending=False)


def financial_confirmation(coding: pd.DataFrame) -> pd.DataFrame:
    financial = read_csv(ADOPTION / "external_financial_confirmations.csv")
    financial = financial[financial["round"].isin(["3次", "4次"])].copy()
    financial["company_key"] = financial["company"].map(normalize_company)
    core_keys = set(coding.loc[coding["round"].isin(["3次", "4次"]), "company"].map(normalize_company))
    financial["core28"] = financial["company_key"].isin(core_keys)
    has = financial["has_financial_confirmation"].astype(str).str.lower().isin({"true", "1", "yes"})
    rows = []
    for label, mask in [("28件のうち3・4次", financial["core28"]), ("3・4次のその他採択企業", ~financial["core28"]), ("3・4次採択企業全体", pd.Series(True, index=financial.index))]:
        n = int(mask.sum())
        yes = int((has & mask).sum())
        rows.append({"group": label, "n": n, "with_confirmation_n": yes, "with_confirmation_pct": 100 * yes / n})
    ta = rows[0]["with_confirmation_n"]
    tb = rows[0]["n"] - ta
    ca = rows[1]["with_confirmation_n"]
    cb = rows[1]["n"] - ca
    p = fisher_two_sided(ta, tb, ca, cb)
    for row in rows:
        row["core_vs_other_fisher_p"] = p
        row["interpretation"] = "採択企業間の提出率比較。非採択企業の提出状況がないため採択効果は推定不可。"
    return pd.DataFrame(rows)


def main() -> None:
    coding = combine_coding()
    factors = factor_summary(coding)
    overlap, consistency = overlap_consistency(coding)
    reference = reference_comparison(coding)
    text = automated_text_comparison(coding)
    themes = theme_comparison(coding)
    financial = financial_confirmation(coding)

    write_csv(coding, "qualitative_coding_28.csv")
    write_csv(factors, "qualitative_factor_summary.csv")
    write_csv(consistency, "coding_consistency_overlap.csv")
    write_csv(reference, "qualitative_reference_comparison.csv")
    write_csv(text, "automated_text_comparison.csv")
    write_csv(themes, "theme_prevalence_comparison.csv")
    write_csv(financial, "financial_confirmation_check.csv")

    summary = {
        "coded_company_records": len(coding),
        "clean_company_records": int(coding["is_clean"].astype(str).str.lower().isin({"true", "1"}).sum()),
        "overlap_with_prior_manual_review": int(overlap["case_id"].nunique()),
        "reference_accepted_records": int(read_csv(ROUND6 / "focused_qualitative_review_44.csv")["case_id"].nunique() - overlap["case_id"].nunique()),
        "factor_strong_counts": {row.factor: int(row.score_2_or_3_n) for row in factors.itertuples()},
        "automatic_text_tests": N_PERMUTATIONS,
        "not_identified": ["採択理由", "定性要因の因果効果", "不採択企業との差"],
    }
    (HERE / "qualitative_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
