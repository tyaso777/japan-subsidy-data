# 単位の再検証と正規化

## 方針

テンプレートの公募回次だけから単位を決めません。提出企業がテンプレートを変更している例や、同じ回次でも `円/人`、`千円/人`、`万円/人` が混在する例があるためです。各値は、同じ表・Box内の次の情報を対応付けて判定します。

1. 項目ラベル（労働生産性、従業員1人あたり給与支給総額、役員1人あたり給与支給総額等）
2. 数値がある行・列の単位表記
3. Boxの見出しと境界
4. 会社名・当社・単体・連結・子会社等の主体ラベル
5. PDFページと根拠原文

値の画面上の座標だけを根拠にした単位判定は行いません。

## 主要指標

`metrics.csv` と `cases.csv` では、PDFに記載された値と分析用換算値を併存させます。

- `*_value_raw`, `*_unit_raw`: PDF記載の原値・原単位
- `*_value_man_yen_per_person`: 万円/人への換算値
- `normalized_unit`: 正規化後の単位
- `unit_conversion_factor`: 原値に乗じた換算係数
- `unit_evidence_source`, `unit_evidence_text`: 単位判定の根拠
- `unit_validation`: Boxとの一致、訂正、推定等の状態
- `source_box_*`: 対応付けたBox
- `source_entity_label`, `entity_match_status`: 数値の主体に関する判定

換算係数は `円/人 = 0.0001`、`千円/人 = 0.1`、`万円/人 = 1` です。従業員数は金額換算せず、PDFの原単位・注記を保持します。

## 事業費・補助額

`cases.csv` と `cost_validations.csv` では、PDF記載の原値・原単位と百万円換算値を併存させます。

- `project_cost_value_raw`, `project_cost_unit_raw`, `project_cost_raw_converted_million_yen`, `project_cost_million_yen_normalized`
- `subsidy_value_raw`, `subsidy_unit_raw`, `subsidy_raw_converted_million_yen`, `subsidy_million_yen_normalized`
- `cost_unit_validation`

複数の投資案件を合計して補助申請している場合、横持ちの代表値は申請対象合計を採用します。個別投資額は根拠原文に残し、単一値に無理に上書きしません。

億円の丸め表示と千円単位の明細が併記される場合があります。`*_raw_converted_million_yen` は選択した原表記の単純換算、`*_million_yen_normalized` は利用可能な表記のうち精度が高い値を採用した分析値です。

## 売上増加額

`sales_series.csv` では系列ごとに次を保持します。

- `increase_value_raw`, `increase_unit_raw`: PDFの原値・原単位
- `increase_oku_normalized`: 億円換算値
- `increase_unit_source`, `increase_unit_validation`: 単位の根拠と検証状態

会社単体、連結、グループ、子会社、補助事業等が併記される場合は別系列として保持します。`cases.csv` の代表値は申請企業自身と判定できる系列を優先し、PDF上の主系列とは分けています。

## 変更履歴

`data/processed/unit_normalization_changes.csv` は、単位を訂正または補完したセルについて、企業、項目、修正前後、根拠Box、ページを記録します。`unit_revalidation_changes.csv` はそれに加え、原値・原単位からの再換算で金額を精緻化した案件も記録します。`unit_normalization_summary.json` は全体件数を集計します。

再処理は次の順で実行します。

```powershell
node scripts/build_dataset.mjs --source-dir <抽出作業ディレクトリ>
python scripts/normalize_units.py --project-root .
node scripts/verify_dataset.mjs
```

`normalize_units.py` は、既存の変更履歴を保持するため再実行可能です。
