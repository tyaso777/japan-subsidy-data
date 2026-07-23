# 公開定量指標の低位プロファイルと企業属性

1～4次の採択・交付決定企業381レコードだけを用い、同じ公募回の公式中央値に対する公開定量指標の低位度と、基礎企業属性・案件構造の関連を探索する分析です。

この分析が推定するのは、採択企業内の条件付き関連です。採択確率、優遇の因果効果、審査配点は推定しません。

## 再現

```powershell
uv sync
uv run python analyze_low_metric_profile.py
uv run python analyze_normalization_sensitivity.py
uv run python build_competitive_adjusted_index.py
uv run python validate_analysis.py
```

主な出力は次のとおりです。

- `report.md`: 基礎企業属性モデルの主分析
- `normalization_sensitivity_report.md`: 業種・地域の寄与と絶対額・率・補助金当たり指標の感度分析
- `model_performance.csv`: 主分析の公募回外性能
- `attribute_block_model_performance.csv`: 属性ブロック別の公募回外性能
- `scale_normalization_sensitivity.csv`: 指標正規化ごとの企業規模相関
- `competitive_adjusted_index_report.md`: 生指標上下群の差を縮小する調整済み競争力指標
- `adjusted_company_profiles.csv`: 調整後スコア、3領域、パレート層
- `feature_effects.csv`、`company_scores.csv`、`summary.json`: 詳細出力
