# 外部抽出データとのレコード比較

`cases.csv`と別の抽出CSVをレコード・項目単位で比較し、差異を`qa.html`と`qa_v0.1.html`に表示する機能です。Node.jsやWebサーバーは不要です。Python実行後のHTMLは、従来どおりローカルファイルとして開けます。

## 基本的な使い方

1. 比較CSVを`comparison/`など任意の場所へ置きます。
2. `comparison/canonical_current_fields.mapping.template.json`をコピーします。
3. `columns`から外部CSVに存在しない項目を要素ごと削除します。
4. 残した項目の`external`、`external_unit`、`external_multiplier`を外部CSVに合わせます。`current`、`current_unit`、`type`は原則変更しません。
5. ファイル名と照合キーを設定し、プロジェクトルートで次を実行します。

```powershell
python scripts/build_comparison.py --mapping comparison/my_data.mapping.json
```

比較CSVをコマンドで指定することもできます。

```powershell
python scripts/build_comparison.py `
  --mapping comparison/my_data.mapping.json `
  --input C:\data\other_extraction.csv
```

## canonical current列

`current`側には、`cases.csv`の正規化済み分析列を指定します。テンプレートには、事業費・補助額、売上、労働生産性、従業員給与、役員給与、従業員数、給与総額増加額（推計）の標準的な比較候補を収録しています。外部CSVに存在する項目だけを残すのが基本です。

次のようなPDF原値列は、企業ごとに原単位が異なるため全件比較に使いません。

| 使用しない原値列 | 使用する正規化済み列 | current単位 |
|---|---|---|
| `project_cost_million_yen` | `project_cost_million_yen_normalized` | 百万円 |
| `subsidy_million_yen` | `subsidy_million_yen_normalized` | 百万円 |
| `labor_base_value` | `labor_base_value_man_yen_per_person` | 万円/人 |
| `labor_target_value` | `labor_target_value_man_yen_per_person` | 万円/人 |
| `employee_pay_base_value` | `employee_pay_base_value_man_yen_per_person` | 万円/人 |
| `employee_pay_target_value` | `employee_pay_target_value_man_yen_per_person` | 万円/人 |
| `officer_pay_base_value` | `officer_pay_base_value_man_yen_per_person` | 万円/人 |
| `officer_pay_target_value` | `officer_pay_target_value_man_yen_per_person` | 万円/人 |

原値列と`*_unit`列を組み合わせれば1社ずつの確認はできますが、mapping JSONの`current_unit`は列全体に固定で適用されます。そのため、原単位が混在する列へ一律の単位を指定すると、千円/人の企業が10倍ずれて見えるなどの誤判定が起きます。

`external_multiplier`は外部値を`current_unit`へそろえる倍率です。

| external単位 | current単位 | external_multiplier |
|---|---|---:|
| 百万円 | 百万円 | 1 |
| 億円 | 百万円 | 100 |
| 万円/人 | 万円/人 | 1 |
| 千円/人 | 万円/人 | 0.1 |
| 円/人 | 万円/人 | 0.0001 |

外部CSVの同じ列内でも単位が混在する場合、現在のmappingは行別単位変換を行いません。比較前に外部CSVを1つの単位へ正規化するか、単位ごとに列・ファイルを分けてください。

生成・更新されるファイルは次のとおりです。

- `data/processed/comparison_results.csv`: 1案件×1比較項目の縦持ち結果
- `html/data/comparison_results.json`: 同じ結果のJSON
- `html/qa.html`: 比較結果を埋め込んだQA画面
- `html/qa_v0.1.html`: 比較結果を埋め込んだ代表項目QA画面（自動再生成）

QA画面を開いただけでは比較表示は有効になりません。`qa.html`は［比較検証を開始］、`qa_v0.1.html`は［差分検証を開始］を押した場合にだけ、不一致を持つ企業が赤く表示され、案件詳細の相違項目・片側欠損項目も強調されます。`qa_v0.1.html`では代表値カード、主要4指標の行、全列一覧の該当列にも強調が連動します。終了ボタンを押すと通常表示へ戻ります。比較結果が未生成の場合、ボタンは［比較データなし］として無効になります。

比較状態の選択欄から、差異・欠損あり、値の相違、片側欠損、全項目一致で企業を絞り込めます。この選択欄も差分検証中だけ有効です。

QA画面だけ先に対応させる場合は次を実行します。

```powershell
python scripts/build_comparison.py --install-only
```

## レコード照合

`record_keys`は上から順に試します。最初に一意に一致したキーを採用します。推奨順は次のとおりです。

1. `case_id`
2. 採択回＋企業名

企業名の正規化では全角・半角、空白、`㈱`・`(株)`を調整しますが、株式会社の前後移動や企業名の推測はしません。複数候補がある場合は`record_ambiguous`、対応レコードがない場合は`external_only`または`current_only`になります。

## 列対応と比較ルール

`columns`の各要素で、現在列と外部列を対応させます。

| 設定 | 内容 |
|---|---|
| `current` | `cases.csv`の列名 |
| `external` | 比較CSVの列名 |
| `label` | QA画面の表示名 |
| `type` | `number`、`percentage`、`year`、`text` |
| `absolute_tolerance` | 数値の絶対許容差 |
| `relative_tolerance` | 現在値に対する相対許容差。例：`0.001` |
| `external_multiplier` | 外部値の単位変換倍率。億円→百万円は`100` |
| `current_multiplier` | 現在値側の単位変換倍率 |
| `null_values` | 空欄相当とする外部表記 |

年度は`2024`のほか、`24年度`、`FY24`、`24/3期`を2024として比較します。相対年だけの表記は基準年を推測せず、正規化エラーとして目立たせます。

## 比較状態

| 状態 | 意味 |
|---|---|
| `equal` | 正規化後に一致 |
| `within_tolerance` | 指定した許容差内 |
| `different` | 許容差を超える相違 |
| `current_missing` | `cases.csv`だけ空欄 |
| `external_missing` | 比較CSVだけ空欄 |
| `both_missing` | 双方空欄 |
| `normalization_error` | 数値・年度等を解釈できない |
| `current_only` | 比較CSVに対応案件がない |
| `external_only` | `cases.csv`に対応案件がない |
| `record_ambiguous` | レコード候補が複数ある |

## 分析上の注意

数値が異なっていても、申請企業単体・グループ・子会社・補助事業など対象範囲が違う場合があります。列対応JSONでは、同じ定義の項目同士だけを対応させてください。特に`cases.csv`の`sales_*`は申請企業代表系列で、`sales_reported_*`はPDF上の主系列です。外部データがどちらを採用しているか不明な場合は、別マッピングで比較するか、差異を抽出誤りと即断せずPDFで確認してください。

## 3行テストデータ

`comparison/test_3rows.csv`は、`cases.csv`の一部列だけを持つ動作確認用データです。

- 1行目：6比較項目がすべて一致
- 2行目：売上高成長率と労働生産性基準値だけ意図的に不一致
- 3行目：売上高成長率は双方空欄、労働生産性基準値は比較データ側だけ空欄

事業費・補助額は億円、労働生産性基準値は千円/人で記載し、`comparison/test_3rows.mapping.json`で`cases.csv`の百万円・万円/人へ変換します。これは機能検証用であり、正しい再抽出結果として分析には使用しないでください。

```powershell
python scripts/build_comparison.py --mapping comparison/test_3rows.mapping.json
```
