# `cases.csv` データ定義書

## 1. データの単位と基本ルール

`data/processed/cases.csv` は、交付決定企業の公開PDFを **1申請案件につき1行** に整理した分析用の横持ちデータです。現在は381案件です。列は抽出・監査の拡充に伴い追加されるため、固定列数ではなくヘッダー名で参照してください。

- 文字コード: UTF-8（BOM付きの場合があります）
- 空欄: 原則として不明、記載なし、対象外、値を確定できない、または代表系列なしのいずれかです。**0として扱わないでください**。理由は `*_status`、`*_validation`、`*_raw_evidence` などで確認します。
- 金額: `*_million_yen` は百万円、`*_oku_yen` は億円です。
- 原表記: `*_value_raw` と `*_unit_raw` はPDF記載の値・単位です。`*_value_man_yen_per_person` は主要指標の万円/人換算値です。
- 単位根拠: `*_unit_evidence_*`、`*_unit_validation`、`*_source_box_*` で、ラベル・単位・Boxの対応を確認できます。
- 割合: `*_pct` は百分率の数値です。例: `5.2` は5.2%であり、0.052ではありません。
- 年: `*_year_after_correction` が分析用の補正後年、`*_year_before_correction` が補正前の構造化値、`*_period_label` がPDF原文です。旧互換列の `*_year` は原則として補正後年と同じです。
- 単位可変の指標: 労働生産性・給与・従業員数は、値だけでなく必ず対応する `*_unit` と組み合わせて使います。
- 原文優先: PDF内の数値に不整合がある場合、無理に一つへ修正せず、原文値と検証注記を残しています。

## 2. 売上系列の使い分け

PDFには申請企業単体、連結、グループ、子会社、補助事業など複数の売上系列が併記される場合があります。

- `sales_*`: 申請企業自身の比較に使う代表系列。申請企業単体または「当社」「会社全体」に相当する系列を優先しています。
- `sales_reported_*`: PDFで最も主要に表示されていた系列。グループやコンソーシアム合計の場合もあります。
- 複数系列の全容: `sales_series.csv` と `sales_series_annual.csv` を使います。`cases.csv`だけでは全系列を横持ちしません。

したがって、企業間比較には通常 `sales_*` を使い、PDFの見た目上の主張を再現したい場合は `sales_reported_*` を使います。`sales_representative_review_required=true` の案件は元PDFまたはQA画面で再確認してください。

## 3. 列定義

型はCSV読込後に推奨する型です。CSV上はすべて文字列として読まれることがあります。

### 3.1 案件・ページ・投資額（1–18）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 1 | `case_id` | string | 一意ID | 案件を一意に識別する内部ID。ほかの加工済みデータとの結合キーです。 |
| 2 | `round` | integer | 1–4 | 公募回次。 |
| 3 | `company` | string | 会社名 | 交付決定企業・申請者の名称。表記揺れを含む場合があります。 |
| 4 | `target_entity` | string | 主体名 | 抽出値が主に対象とする企業・法人。申請者以外を含む場合があります。 |
| 5 | `scope` | string | 原文寄り分類 | 案件全体の対象範囲に関する旧来の分類。`applicant`、単体、全社、連結、グループ、不明等が混在するため、売上比較では `sales_representative_scope` を優先します。 |
| 6 | `other_participants` | string | 名称列挙 | 親会社、子会社、共同申請者、コンソーシアム参加者など、申請者以外の関係主体。空欄は確認できる記載なし。 |
| 7 | `page_count` | integer | ページ | 当該PDFの総ページ数。 |
| 8 | `vision_page_count` | integer | ページ | 長期成長ビジョンに使われたページ数。追加ページを含みます。 |
| 9 | `project_page_count` | integer | ページ | 補助事業の概要に使われたページ数。追加ページを含みます。 |
| 10 | `additional_page_count` | integer | ページ | 標準2ページ構成を超える追加ページ数。 |
| 11 | `project_cost_million_yen` | number | 百万円 | 同一申請に含まれる補助対象投資の事業費代表値。複数投資の合計で申請している場合は合計額です。 |
| 12 | `subsidy_million_yen` | number | 百万円 | 同一申請に対する補助額代表値。複数投資の場合は合計額です。 |
| 13 | `subsidy_rate_pct` | number | % | `subsidy_million_yen / project_cost_million_yen × 100` の実額ベース補助率。制度上の名目補助率とは限りません。 |
| 14 | `cost_page` | integer/string | ページ番号 | 事業費・補助額の根拠があるPDFページ。複数ページの場合は表記を確認してください。 |
| 15 | `investment_representative_basis` | string | 判定根拠 | 投資額の代表値を合計、全体、個別のどれとして採用したか、その根拠。 |
| 16 | `cost_source_method` | string | 抽出方法 | 事業費・補助額を確定した方法。現行データは `ai_visual_manual_audit`。 |
| 17 | `cost_validation` | string | 検証状態 | 事業費・補助額の目視確認状態と信頼度。 |
| 18 | `cost_box_transcription` | string | PDF原文 | 事業費・補助額が記載されたBoxの転記。数値確認の根拠として使います。 |

### 3.2 売上成長目標・申請企業の代表系列（19–42）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 19 | `sales_baseline_period_label` | string | PDF原文 | 売上基準時点の原文ラベル。例: `2023年度`、`23/12期`、`現在`。 |
| 20 | `sales_baseline_year_before_correction` | integer | 西暦年 | 年度補正前に構造化できていた年。相対表記や2桁年では空欄の場合があります。 |
| 21 | `sales_baseline_year_after_correction` | integer | 西暦年 | 分析用の補正後年。2桁年は20xx、相対年は基準年を確定できた場合に補正します。 |
| 22 | `sales_baseline_year_correction_method` | string | 方法コード | 基準年をどの規則で補正・確定したか。コードは4章を参照。 |
| 23 | `sales_baseline_year_correction_confidence` | string | high/medium/low | 基準年補正の確信度。空欄は代表系列なし等。 |
| 24 | `sales_baseline_year` | integer | 西暦年 | 旧互換列。原則 `sales_baseline_year_after_correction` と同じです。新規分析では補正後列を使います。 |
| 25 | `sales_baseline_oku_yen` | number | 億円 | 申請企業代表系列の基準時点売上高。逆算値を含む場合は検証列・系列データも確認します。 |
| 26 | `sales_target_period_label` | string | PDF原文 | 売上目標時点の原文ラベル。 |
| 27 | `sales_target_year_before_correction` | integer | 西暦年 | 目標年の補正前構造化値。 |
| 28 | `sales_target_year_after_correction` | integer | 西暦年 | 目標年の分析用補正後値。 |
| 29 | `sales_target_year_correction_method` | string | 方法コード | 目標年をどの規則で補正・確定したか。 |
| 30 | `sales_target_year_correction_confidence` | string | high/medium/low | 目標年補正の確信度。 |
| 31 | `sales_target_year` | integer | 西暦年 | 旧互換列。原則 `sales_target_year_after_correction` と同じです。 |
| 32 | `sales_target_oku_yen` | number | 億円 | 申請企業代表系列の目標売上高。 |
| 33 | `sales_increase_oku_yen` | number | 億円 | 基準から目標までの売上増加額。PDF明記値または整合する算出値。 |
| 34 | `sales_growth_pct` | number | % | PDFで示された、または整理した売上成長率。意味は `sales_growth_rate_definition` と必ず組み合わせます。 |
| 35 | `sales_cagr_pct` | number | %/年 | 基準売上、目標売上、期間から求めた年平均成長率、またはPDF明記のCAGR。 |
| 36 | `sales_growth_rate_definition` | string | 定義コード | `cumulative_increase`、`target_base_ratio`、`cagr`、`stated_undefined`、`not_stated` のいずれか。4章参照。 |
| 37 | `sales_multiple` | number | 倍 | `sales_target_oku_yen / sales_baseline_oku_yen`。例: 1.5は1.5倍。 |
| 38 | `sales_validation` | string | 検証状態 | 売上数値の整合、未判定、PDF原文内不整合、申請企業単体系列なし等。 |
| 39 | `sales_representative_series_id` | string | 系列ID | `sales_series.csv` 内の、申請企業比較用に選んだ系列ID。空欄は該当系列なし。 |
| 40 | `sales_representative_scope` | string | 対象範囲 | 代表系列の主体・範囲。自由記述を含むため、完全な固定カテゴリではありません。 |
| 41 | `sales_representative_reason` | string | 選択理由 | なぜその系列を申請企業の売上代表値に選んだか。代表系列がない理由も記録します。「申請企業単体系列なし」は売上だけの判定であり、労働生産性・給与等の申請企業別数値がないという意味ではありません。 |
| 42 | `sales_representative_review_required` | boolean | true/false | 主体、系列選択、数値に追加確認が必要なら `true`。文字列として読まれた場合は真偽値へ変換します。 |

### 3.3 売上成長目標・PDF上の主系列（43–51）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 43 | `sales_reported_primary_series_id` | string | 系列ID | PDF上で主に提示された売上系列の `sales_series.csv` 内ID。 |
| 44 | `sales_reported_scope` | string | 対象範囲 | PDF主系列の主体・範囲。申請企業単体、連結、グループ、コンソーシアム合計等。 |
| 45 | `sales_reported_baseline_year` | integer | 西暦年 | PDF主系列の基準年。 |
| 46 | `sales_reported_baseline_oku_yen` | number | 億円 | PDF主系列の基準売上高。 |
| 47 | `sales_reported_target_year` | integer | 西暦年 | PDF主系列の目標年。 |
| 48 | `sales_reported_target_oku_yen` | number | 億円 | PDF主系列の目標売上高。 |
| 49 | `sales_reported_increase_oku_yen` | number | 億円 | PDF主系列の売上増加額。 |
| 50 | `sales_reported_growth_pct` | number | % | PDF主系列の成長率。率の意味は元系列・原文も確認してください。 |
| 51 | `sales_reported_cagr_pct` | number | %/年 | PDF主系列の年平均成長率。 |

### 3.4 労働生産性（52–70）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 52 | `labor_base_period_label` | string | PDF原文 | 労働生産性の基準時点ラベル。 |
| 53 | `labor_base_year_before_correction` | integer | 西暦年 | 労働生産性の補正前基準年。 |
| 54 | `labor_base_year_after_correction` | integer | 西暦年 | 労働生産性の分析用補正後基準年。 |
| 55 | `labor_base_year_correction_method` | string | 方法コード | 補正後基準年の決定方法。 |
| 56 | `labor_base_year_correction_confidence` | string | high/medium/low | 基準年補正の確信度。 |
| 57 | `labor_base_year` | integer | 西暦年 | 旧互換列。原則、補正後基準年と同じです。 |
| 58 | `labor_base_value` | number | `labor_unit` | 労働生産性の基準値。単位は案件ごとに確認します。 |
| 59 | `labor_target_period_label` | string | PDF原文 | 労働生産性の目標時点ラベル。 |
| 60 | `labor_target_year_before_correction` | integer | 西暦年 | 労働生産性の補正前目標年。 |
| 61 | `labor_target_year_after_correction` | integer | 西暦年 | 労働生産性の分析用補正後目標年。 |
| 62 | `labor_target_year_correction_method` | string | 方法コード | 補正後目標年の決定方法。 |
| 63 | `labor_target_year_correction_confidence` | string | high/medium/low | 目標年補正の確信度。 |
| 64 | `labor_target_year` | integer | 西暦年 | 旧互換列。原則、補正後目標年と同じです。 |
| 65 | `labor_target_value` | number | `labor_unit` | 労働生産性の目標値。 |
| 66 | `labor_unit` | string | 例: 万円/人 | 労働生産性の基準値・目標値に共通する単位。単位変換前に必ず確認します。 |
| 67 | `labor_annual_rate_pct` | number | %/年 | PDF記載の年平均上昇率。原則として再計算値ではありません。 |
| 68 | `labor_status` | string | 状態コード | 値・率の記載状態。現行では主に `full_values`、`values_without_rate`。 |
| 69 | `labor_validation` | string | 検証状態 | 画像目視で値・率または値のみを確認した結果。 |
| 70 | `labor_raw_evidence` | string | PDF原文 | 労働生産性の表行・根拠原文。 |

### 3.5 従業員1人当たり給与支給総額（71–89）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 71 | `employee_pay_base_period_label` | string | PDF原文 | 従業員給与の基準時点ラベル。 |
| 72 | `employee_pay_base_year_before_correction` | integer | 西暦年 | 従業員給与の補正前基準年。 |
| 73 | `employee_pay_base_year_after_correction` | integer | 西暦年 | 従業員給与の分析用補正後基準年。 |
| 74 | `employee_pay_base_year_correction_method` | string | 方法コード | 補正後基準年の決定方法。 |
| 75 | `employee_pay_base_year_correction_confidence` | string | high/medium/low | 基準年補正の確信度。 |
| 76 | `employee_pay_base_year` | integer | 西暦年 | 旧互換列。原則、補正後基準年と同じです。 |
| 77 | `employee_pay_base_value` | number | `employee_pay_unit` | 従業員1人当たり給与支給総額の基準値。 |
| 78 | `employee_pay_target_period_label` | string | PDF原文 | 従業員給与の目標時点ラベル。 |
| 79 | `employee_pay_target_year_before_correction` | integer | 西暦年 | 従業員給与の補正前目標年。 |
| 80 | `employee_pay_target_year_after_correction` | integer | 西暦年 | 従業員給与の分析用補正後目標年。 |
| 81 | `employee_pay_target_year_correction_method` | string | 方法コード | 補正後目標年の決定方法。 |
| 82 | `employee_pay_target_year_correction_confidence` | string | high/medium/low | 目標年補正の確信度。 |
| 83 | `employee_pay_target_year` | integer | 西暦年 | 旧互換列。原則、補正後目標年と同じです。 |
| 84 | `employee_pay_target_value` | number | `employee_pay_unit` | 従業員1人当たり給与支給総額の目標値。 |
| 85 | `employee_pay_unit` | string | 例: 万円/人 | 従業員給与の基準値・目標値の単位。 |
| 86 | `employee_pay_annual_rate_pct` | number | %/年 | PDF記載の従業員給与の年平均上昇率。 |
| 87 | `employee_pay_status` | string | 状態コード | 値・率の記載状態。現行データは `full_values`。 |
| 88 | `employee_pay_validation` | string | 検証状態 | 従業員給与の画像目視確認結果。 |
| 89 | `employee_pay_raw_evidence` | string | PDF原文 | 従業員給与の表行・根拠原文。 |

### 3.6 役員1人当たり給与支給総額（90–108）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 90 | `officer_pay_base_period_label` | string | PDF原文 | 役員給与の基準時点ラベル。金額なし・率のみの場合は空欄になり得ます。 |
| 91 | `officer_pay_base_year_before_correction` | integer | 西暦年 | 役員給与の補正前基準年。 |
| 92 | `officer_pay_base_year_after_correction` | integer | 西暦年 | 役員給与の分析用補正後基準年。 |
| 93 | `officer_pay_base_year_correction_method` | string | 方法コード | 補正後基準年の決定方法。 |
| 94 | `officer_pay_base_year_correction_confidence` | string | high/medium/low | 基準年補正の確信度。 |
| 95 | `officer_pay_base_year` | integer | 西暦年 | 旧互換列。原則、補正後基準年と同じです。 |
| 96 | `officer_pay_base_value` | number | `officer_pay_unit` | 役員1人当たり給与支給総額の基準値。`rate_only` では空欄が正常です。 |
| 97 | `officer_pay_target_period_label` | string | PDF原文 | 役員給与の目標時点ラベル。 |
| 98 | `officer_pay_target_year_before_correction` | integer | 西暦年 | 役員給与の補正前目標年。 |
| 99 | `officer_pay_target_year_after_correction` | integer | 西暦年 | 役員給与の分析用補正後目標年。 |
| 100 | `officer_pay_target_year_correction_method` | string | 方法コード | 補正後目標年の決定方法。 |
| 101 | `officer_pay_target_year_correction_confidence` | string | high/medium/low | 目標年補正の確信度。 |
| 102 | `officer_pay_target_year` | integer | 西暦年 | 旧互換列。原則、補正後目標年と同じです。 |
| 103 | `officer_pay_target_value` | number | `officer_pay_unit` | 役員1人当たり給与支給総額の目標値。`rate_only` では空欄が正常です。 |
| 104 | `officer_pay_unit` | string | 例: 万円/人 | 役員給与の基準値・目標値の単位。率のみの場合は空欄になり得ます。 |
| 105 | `officer_pay_annual_rate_pct` | number | %/年 | PDF記載の役員給与の年平均上昇率。金額がなく、この率だけ記載された案件を含みます。 |
| 106 | `officer_pay_status` | string | 状態コード | `full_values`、`rate_only`、`values_without_rate`、`not_stated`、`not_applicable`。 |
| 107 | `officer_pay_validation` | string | 検証状態 | 値・率あり、率のみ、値のみ、記載なし、該当なしの目視確認結果。 |
| 108 | `officer_pay_raw_evidence` | string | PDF原文 | 役員給与の表行・根拠原文。率のみの根拠確認にも使います。 |

### 3.7 補助事業に係る従業員数（109–127）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 109 | `employees_base_period_label` | string | PDF原文 | 従業員数の基準時点ラベル。 |
| 110 | `employees_base_year_before_correction` | integer | 西暦年 | 従業員数の補正前基準年。 |
| 111 | `employees_base_year_after_correction` | integer | 西暦年 | 従業員数の分析用補正後基準年。 |
| 112 | `employees_base_year_correction_method` | string | 方法コード | 補正後基準年の決定方法。 |
| 113 | `employees_base_year_correction_confidence` | string | high/medium/low | 基準年補正の確信度。 |
| 114 | `employees_base_year` | integer | 西暦年 | 旧互換列。原則、補正後基準年と同じです。 |
| 115 | `employees_base_value` | number | `employees_unit` | 補助事業に係る従業員数等の基準値。原文の対象範囲を証拠列で確認します。 |
| 116 | `employees_target_period_label` | string | PDF原文 | 従業員数の目標時点ラベル。 |
| 117 | `employees_target_year_before_correction` | integer | 西暦年 | 従業員数の補正前目標年。 |
| 118 | `employees_target_year_after_correction` | integer | 西暦年 | 従業員数の分析用補正後目標年。 |
| 119 | `employees_target_year_correction_method` | string | 方法コード | 補正後目標年の決定方法。 |
| 120 | `employees_target_year_correction_confidence` | string | high/medium/low | 目標年補正の確信度。 |
| 121 | `employees_target_year` | integer | 西暦年 | 旧互換列。原則、補正後目標年と同じです。 |
| 122 | `employees_target_value` | number | `employees_unit` | 補助事業に係る従業員数等の目標値。 |
| 123 | `employees_unit` | string | 通常は人 | 従業員数の基準値・目標値の単位。原文に対象者の限定があれば併せて確認します。 |
| 124 | `employees_annual_rate_pct` | number | %/年 | PDFに年平均増加率等が明記された場合の率。通常は空欄が多い列です。 |
| 125 | `employees_status` | string | 状態コード | 主に `values_without_rate`、`full_values`、`not_stated`。 |
| 126 | `employees_validation` | string | 検証状態 | 値・率あり、値のみ、記載なしの目視確認結果。 |
| 127 | `employees_raw_evidence` | string | PDF原文 | 従業員数の表行・根拠原文。 |

### 3.8 手動監査・内訳・出典（128–133）

| No. | 列名 | 推奨型 | 単位・形式 | 定義・注意点 |
|---:|---|---|---|---|
| 128 | `manual_audit_confidence` | string | high/medium | PDF画像を案件単位で確認した際の総合確信度。`medium` は元PDF確認を優先します。 |
| 129 | `manual_audit_correction_count` | integer | 件 | 手動監査で修正・補足した項目数。0でもデータが無検証という意味ではありません。 |
| 130 | `manual_audit_notes` | string | 自由記述 | 主体、表構造、複数系列、不整合、読み取り上の注意などの監査メモ。 |
| 131 | `investment_components` | JSON string | JSON配列 | 投資内訳の構造化情報。空の配列は `[]`。キーは案件により `label`、`cost_million_yen`、`subsidy_million_yen`、`amount_million_yen`、根拠原文等があり、必ずしも統一されていません。投資案件数の厳密な列ではありません。 |
| 132 | `manual_audit_corrections` | JSON string | JSON配列 | 手動監査で行った修正内容。空の配列は `[]`。要素には対象フィールド、修正前後、理由、ページ等が含まれますが、旧記録との互換上キーは完全統一されていません。 |
| 133 | `pdf_url` | string | URL | 当該案件の公式公開PDF URL。重要な分析・判断では元PDFを確認します。 |

## 4. コード値の意味

### 4.1 年度補正方法 `*_year_correction_method`

| コード | 意味 |
|---|---|
| `existing_normalized_year` | 既に4桁西暦として構造化されており、その値を採用。 |
| `four_digit_year_from_label` | 原文ラベル中の4桁年から取得。 |
| `two_digit_year_assume_2000s` | `yy/mm`、`yy年`等の2桁年を20yyと解釈。 |
| `two_digit_fy_assume_2000s` | `FYyy`等を20yy年度と解釈。 |
| `relative_year_from_corrected_baseline` | `5年後`等を、確定した基準年から加算して算出。 |
| `relative_year_requires_anchor` | 相対年だが、基準となる年の追加確認が必要。 |
| `unresolved_relative_or_missing_context` | 相対表記または文脈不足で西暦年を確定できない。 |
| `unresolved_placeholder` | `20xx年度`等のプレースホルダーで確定できない。 |
| `missing` | 年の記載・確定値がない。 |

補正後年があっても、会計年度の開始月・終了月までは統一していません。`23/12期`を2023として比較する場合も、12月期であることは `*_period_label` にしか残らないため、月単位分析では原文ラベルを併用してください。

### 4.2 指標状態 `*_status`

| コード | 意味 | 空欄値の扱い |
|---|---|---|
| `full_values` | 基準値・目標値があり、通常は年平均率も記載。 | 個別空欄があれば要確認。 |
| `values_without_rate` | 基準値・目標値はあるが、年平均率の記載なし。 | `*_annual_rate_pct` の空欄は正常。 |
| `rate_only` | 金額等の基準値・目標値はなく、年平均率だけ記載。役員給与で多い。 | 基準値・目標値・単位の空欄は正常。 |
| `not_stated` | 当該指標の記載を確認できない。 | 指標列の空欄は「0」ではなく記載なし。 |
| `not_applicable` | PDF上で該当なし等と明示。 | 指標列の空欄は対象外。 |

### 4.3 売上成長率定義 `sales_growth_rate_definition`

| コード | `sales_growth_pct` の意味 |
|---|---|
| `cumulative_increase` | `(目標売上 − 基準売上) / 基準売上 × 100` 型の累積増加率。 |
| `target_base_ratio` | `目標売上 / 基準売上 × 100` 型の到達比率。100%が基準と同額。 |
| `cagr` | 年平均成長率。 |
| `stated_undefined` | PDFに率は記載されているが、累積・到達比率・CAGRの定義を一意に確定できない。 |
| `not_stated` | 売上成長率の数値記載なし。 |

### 4.4 検証・確信度

- `*_validation`: その指標についての目視確認結果や数値整合性。`整合`でも主体・単位・期間が企業間で同一とは限りません。
- `*_year_correction_confidence`: 年度補正だけの確信度です。指標値全体の確信度ではありません。
- `manual_audit_confidence`: 案件全体の画像監査上の確信度です。
- `sales_representative_review_required`: 売上の代表系列選択について追加確認が必要かを示します。

## 5. 分析時の推奨前処理

1. `case_id` の一意性を確認する。
2. 数値列を数値型、`sales_representative_review_required` を真偽値へ変換する。
3. 年は原則 `*_year_after_correction` を使い、`confidence=low` や未解決方法を除外または別集計する。
4. 単位可変列は `*_unit` ごとに分けるか、明示的に共通単位へ換算する。
5. 売上は分析目的に応じて `sales_*` と `sales_reported_*` を選び、複数系列分析では `sales_series.csv` を使う。
6. `*_status` が `rate_only`、`not_stated`、`not_applicable` の空欄をゼロ補完しない。
7. `sales_validation` が不整合、`manual_audit_confidence=medium`、または代表系列要確認の案件は `pdf_url` から元PDFを確認する。
8. 厳格比較では `analysis_exclusion_recommended=false` を基本母集団とし、目的に応じて個別のフラグを戻す。

## 6. 分析用要約フラグ

`cases.csv` の末尾には、複数投資、金額不一致、コンソーシアム・関係会社、複数系列、率・期間・単位・算術の曖昧性を表す列を追加している。`analysis_exclusion_recommended` は未解決の重大フラグが1件以上ある場合に真、`analysis_exclusion_reasons` は該当コードを `|` で連結したもの。各列の完全な定義、縦持ち詳細表、除外基準は [`analysis_quality_flags.md`](analysis_quality_flags.md) を参照してください。

より詳しい分析上の注意は [`analysis_data_handling.md`](analysis_data_handling.md)、抽出・検証方法は [`methodology.md`](methodology.md) と [`validation.md`](validation.md) を参照してください。
