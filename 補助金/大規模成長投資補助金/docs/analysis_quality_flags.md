# 分析用フラグと除外基準

この文書は、`cases.csv` を統計分析担当者へ渡す際の品質フラグ、複数値の扱い、推奨除外基準を定義します。フラグは「採択上不利だった」ことを示すものではなく、企業間で同じ意味の数値として比較できるかを示します。

## 1. 推奨するテーブルの使い分け

| ファイル | 粒度 | 用途 |
|---|---|---|
| `cases.csv` | 1案件1行 | 代表値と案件単位の要約フラグ |
| `investment_components.csv` | 1投資内訳1行 | 工場・拠点・参加会社・費目別の投資額 |
| `case_entities.csv` | 1関係主体1行 | 申請企業、親子会社、共同申請者、売上系列の主体 |
| `cost_amount_candidates.csv` | 1金額記載1行 | 本文・Boxに現れた事業費、補助額、補助対象経費、内訳候補 |
| `quality_flags.csv` | 1品質問題1行 | 問題の対象値、重要度、根拠、代替値、解決状態 |
| `metrics.csv` | 1案件×指標系列1行 | 労働生産性、従業員給与、役員給与、従業員数と率定義 |
| `sales_series.csv` | 1売上系列1行 | 申請企業、グループ、子会社、事業別の売上系列 |

## 2. `cases.csv` の要約フラグ

### 投資構造

- `has_multiple_investments`: 会社・工場・拠点等で明示的に複数の投資単位を識別できた場合に真。設備費目が複数あるだけでは真にしない。
- `investment_component_count`: 識別できた投資単位数。明示的な境界がなければ申請全体を1件とする。
- `investment_component_count_method`: 件数の判定方法。
- `multiple_investment_review_required`: 本文に複数案件を示唆するが、構造化内訳だけでは確定できない場合に真。

### 事業費・補助額

- `cost_text_numeric_mismatch`: 代表値と、本文・明細合計等の同じ概念と判断した金額が許容差を超えて一致しない。
- `cost_multiple_values_present`: 同じ金額種別について複数候補がある。総投資額と補助対象経費など概念が違う金額は、`cost_amount_candidates.csv` の `candidate_type` で区別する。
- `COST_TEXT_NUMERIC_ROUNDING_DIFFERENCE`: 差が代表値の1%または50百万円以内で、丸め・表示精度差として保持したもの。

不一致時も、どちらか一方へ上書きしません。`cost_amount_candidates.csv` に原値、原単位、百万円換算値、代表値との差、前後文を併存させます。

### 申請主体・系列

- `has_consortium`, `consortium_member_count`: 共同申請、コンソーシアムまたは参加者別指標を明示的に確認できた場合。
- `has_parent_company_reference`, `has_subsidiary_reference`, `has_related_company_reference`: 当該関係主体の記載がある場合。記載があることと、その数値を代表値に採用したことは同じではない。
- `has_multiple_sales_series`, `sales_series_count`: 売上系列が複数ある場合。
- `has_mixed_entity_metrics`: 申請企業、グループ、子会社、事業等の異なる対象範囲が混在する場合。
- `representative_entity_ambiguous`: 申請企業自身の代表系列を一意に確定できない、または代表系列の追加確認が必要な場合。

### 品質要約

- `has_ambiguous_rate_any`: 定義不明の率が1件以上ある。
- `has_period_ambiguity_any`: 基準年・目標年を確定できない値がある。
- `has_unit_ambiguity_any`: 原単位と換算単位の対応を確定できない値がある。
- `has_arithmetic_mismatch_any`: 基準値、目標値、期間、記載率の算術が一致しない。
- `has_ocr_uncertainty_any`: 画像目視またはOCRの確信度に注意が必要。
- `analysis_exclusion_recommended`: 未解決の `critical` フラグが1件以上ある。
- `analysis_exclusion_reasons`: 未解決の重大フラグコードを `|` で連結。

## 3. 指標別の分析可否

案件全体の `analysis_exclusion_recommended` は最も厳しい全用途共通フラグであり、特定指標の分析母集団を作る際にそのまま使うと過剰除外になる。`cases.csv` には次の指標別ステータスを持たせる。

- `project_cost_analysis_status`, `subsidy_analysis_status`
- `sales_values_analysis_status`, `sales_rate_analysis_status`
- `labor_values_analysis_status`, `labor_rate_analysis_status`
- `employee_pay_values_analysis_status`, `employee_pay_rate_analysis_status`
- `officer_pay_values_analysis_status`, `officer_pay_rate_analysis_status`
- `employees_values_analysis_status`, `employees_rate_analysis_status`

各ステータスの意味は次のとおり。

| 状態 | 扱い |
|---|---|
| `ready` | 当該値・率について、現在の検証範囲で比較利用可能。 |
| `usable_with_caution` | 値は利用できるが、期間、丸め、複数候補等の注意がある。感度分析を推奨。 |
| `partial` | 基準値・目標値の片方だけなど、限定的な分析にのみ利用可能。 |
| `review_required` | 主体、率定義、単位、算術または金額不一致が未解決。厳格比較から除外。 |
| `unavailable` | 当該値・率が記載されていない。ゼロとして扱わない。 |

対応する `*_analysis_reasons` に理由コードを `|` 区切りで保持する。売上率が `review_required` でも、売上絶対値や労働生産性が `ready` なら、それらの分析には案件を残せる。

## 4. 率の解釈

すべての率は数値だけで使わず、次の定義列と組み合わせます。

| `rate_definition` | 意味 |
|---|---|
| `increase_rate` / `cumulative_increase` | `(目標－基準)÷基準×100`。129%増なら目標は基準の2.29倍。 |
| `target_base_ratio` | `目標÷基準×100`。129%なら目標は基準の1.29倍。 |
| `multiple` | 基準に対する倍率。 |
| `cagr` | 売上高等の年平均成長率。 |
| `annual_average_increase_rate` | 労働生産性・給与等の年平均上昇率。 |
| `stated_undefined` | 率は記載されるが、増加率・到達率・年平均率のいずれか確定できない。 |
| `not_stated` | 率の記載なし。 |

`rate_interpretation_status` は、明示文言、算術、標準表の文脈のどれで解釈したかを示します。`rate_ambiguous=true` は厳格比較から除外してください。`rate_reconciliation_status=mismatch` はPDF記載率と基準値・目標値・期間からの計算率が1ポイント超相違するものです。

## 5. `quality_flags.csv`

- `subject_table`, `subject_id`, `metric_key`: 問題が案件全体、売上系列、主要指標のどれに属するか。
- `flag_code`: 問題の標準コード。
- `severity`: `critical`、`warning`、`info`。
- `status`: `unresolved`、`resolved`、`resolved_with_tolerance`、`open_context_check` 等。
- `value_raw`, `value_normalized`, `alternative_value`: 原値、採用値、別候補。
- `source_page`, `source_box_label`, `evidence`: PDFへ戻るための根拠。
- `resolution_note`: 採用・保留・許容差の判断理由。

`critical` でも `status=resolved` なら除外理由には含めません。問題を発見した履歴と、現在も未解決であることを区別します。

## 6. 推奨分析母集団

### 厳格比較用

次を満たす案件だけを使用します。

1. 分析する項目に対応する `*_analysis_status` が `ready`。必要に応じて `usable_with_caution` も含め、別集計する。
2. 率分析では比較対象系列の `rate_ambiguous=false`
3. 主体を申請企業に揃える場合は、`sales_representative_scope` または `entity_relation` が申請企業を示す
4. 金額比較では `cost_text_numeric_mismatch=false`
5. 年度比較では、対象列の補正方法が未解決でない
6. 欠損はゼロ補完せず、`status=rate_only`、`not_stated`、`not_applicable` を区別する

### 全件探索用

381件を残し、フラグを層別条件または説明変数として使います。ただし、不採択案件が含まれないため、これらのフラグから採択確率や審査上の因果効果を推定することはできません。

## 7. 再生成・検証

```powershell
python scripts/build_analysis_flags.py
python scripts/validate_analysis_flags.py
```

生成後の件数とフラグ分布は `data/processed/analysis_quality_summary.json` に保存します。判定規則を変更した場合は、CSVだけを手修正せず生成処理と定義書を同時に更新してください。
