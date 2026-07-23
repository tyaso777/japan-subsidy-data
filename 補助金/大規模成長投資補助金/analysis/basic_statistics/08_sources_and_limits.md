# 08 出典・限界

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
