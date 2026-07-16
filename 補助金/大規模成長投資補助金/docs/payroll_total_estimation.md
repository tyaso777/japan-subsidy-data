# 従業員給与支給総額の推計と単位再検証

## 算式

公開PDFから取得した値を使い、次の近似値を `cases.csv` に追加します。

- `employee_pay_total_base_estimated_oku` = 基準時1人当たり給与（万円/人）×基準従業員数÷10,000
- `employee_pay_total_target_estimated_oku` = 目標時1人当たり給与（万円/人）×目標従業員数÷10,000
- `employee_pay_total_increase_estimated_oku` = 目標時給与総額－基準時給与総額

公開PDFの従業員数は「補助事業に係る従業員数」です。全従業員数ではない場合があるため、公式の「従業員給与支給総額の増加額」と同一定義ではなく、原則として近似値です。

## 判定列

| 列 | 内容 |
|---|---|
| `employee_pay_total_calculation_status` | 算出不能、近似算出、期間・主体・単位の再確認要否 |
| `employee_pay_total_period_alignment` | 給与と従業員数の基準年・目標年が一致するか |
| `employee_pay_total_entity_alignment` | 主体の対応。`proxy_project_employee_count` は補助事業従業員数を使った近似 |
| `employee_pay_total_unit_validation` | 1人当たり給与の単位検証状態 |
| `employee_pay_total_increase_analysis_status` | ダッシュボードの品質絞り込みに使う分析可否 |

## 個別の単位補正

### 日生流通運輸倉庫株式会社

公式PDF: https://seichotoushi-hojo.jp/assets/pdf/koufu_3_4ji/outline_17.pdf

表の行見出しは「百万円/人」ですが、各セルには「476万円/人」「1,264万円/人」「427万円/人」「495万円/人」と明記されています。セルの単位と年平均上昇率を優先し、分析用の係数を1としました。

- 給与: 427→495万円/人
- 補助事業従業員数: 140→268人
- 給与総額近似: 5.978→13.266億円、増加7.288億円
- 単位状態: `source_unit_conflict_cell_unit_preferred`

### NAX JAPAN株式会社

公式PDF: https://seichotoushi-hojo.jp/assets/pdf/koufu/outline_69.pdf

PDFは「万円/人」と表記していますが、労働生産性10,001→11,690、給与6,892→7,980という桁は千円/人相当と判断しました。原表記を `unit_raw` に保持しつつ、分析用には係数0.1を採用します。この補正は資料内の明示単位と矛盾する推定なので、要確認状態を維持します。

- 給与: 689.2→798.0万円/人
- 補助事業従業員数: 209→227人
- 給与総額近似: 14.40428→18.1146億円、増加3.71032億円
- 単位状態: `source_unit_conflict_assumed_thousand_yen`

補正の機械可読な履歴は `data/processed/payroll_unit_revalidation_changes.csv` に保存します。再生成は `python scripts/revalidate_payroll_totals.py` で行います。
