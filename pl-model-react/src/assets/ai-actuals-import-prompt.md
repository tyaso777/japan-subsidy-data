# 過去実績JSON変換プロンプト

添付したB/S・P/L資料を読み取り、同時に添付した `actuals-import.schema.json` に適合するJSONを1件作成してください。

## 絶対条件

- 回答はJSONだけにし、Markdownのコードフェンスや説明文を付けないでください。
- 資料に記載のない値、対応関係を断定できない値は推測せず `null` にしてください。
- 年度は西暦へ統一し、`years` には古い年度から1年刻みで連続して格納してください。
- 資料の金額単位を確認し、`amountUnit` を `yen`、`thousand-yen`、`million-yen` のいずれかで指定してください。値は資料記載の単位のまま転記し、AI側で円換算しないでください。
- 負数はJSONの負数で表現してください。括弧書き、△、▲は負数として解釈してください。
- 比率、利益、合計などアプリが自動計算する項目は出力しないでください。
- 資料上の科目を入力項目へ対応できない場合は、元の科目名と理由を `unmappedItems` に記録してください。
- 読み取りや事業区分に関する注意点は `notes` に記録してください。
- 使用した資料名は `sourceFiles` に記録してください。
- ベース事業と補助事業の区分が資料に明記されていない場合、金額を推測配分しないでください。明確に全てベース事業として扱う指示がない限り、該当する事業P/Lは空配列にし、`notes` に記録してください。

## B/S入力項目

| JSONキー | 財務科目 |
| --- | --- |
| assets | 資産総額 |
| currentAssets | 流動資産 |
| cash | 現金及び預金 |
| fixedAssets | 固定資産 |
| tangibleAssets | 有形固定資産 |
| buildings | 建物及び構築物 |
| machinery | 機械装置等 |
| land | 土地 |
| intangibleAssets | 無形固定資産 |
| software | ソフトウェア |
| liabilities | 負債総額 |
| currentLiabilities | 流動負債 |
| shortTermDebt | 短期借入金 |
| fixedLiabilities | 固定負債 |
| longTermDebt | 長期借入金 |
| netAssets | 純資産総額 |
| shareholderEquity | 株主資本 |
| capital | 資本金 |
| capex | 新規設備投資による支出 |

## P/L入力項目

| JSONキー | 財務科目 |
| --- | --- |
| sales | 売上高 |
| cogs | 売上原価 |
| cogsDepreciation | 売上原価に含まれる減価償却費 |
| employeeSalary | 従業員給与 |
| employeeBonus | 従業員賞与 |
| officerCompensation | 役員報酬 |
| officerBonus | 役員賞与 |
| sgaDepreciation | 販管費に含まれる減価償却費 |
| researchDevelopment | 研究開発費 |
| otherSga | その他販管費 |
| nonOperating | 営業外損益（収益－費用の純額） |
| extraordinary | 特別損益（利益－損失の純額） |
| netIncome | 当期純利益 |
| headcount | 従業員数（就業時間換算/FTE） |
| officerCount | 役員数 |

## 出力前の検査

1. JSON Schemaにないキーを出力していないか確認してください。
2. 各レコードの `year` が `years` に含まれているか確認してください。
3. 同じ区分・同じ年度のレコードが重複していないか確認してください。
4. 合計値と内訳値を混同していないか確認してください。
5. 自動計算項目を推測生成していないか確認してください。

## 具体例

次は構造と記法を示す例です。年度、金額単位、値、資料名はコピーせず、必ず添付資料の内容に置き換えてください。資料に存在しない値は、例から補わず `null` にしてください。

```json
{
  "format": "pl-model-actuals",
  "version": "1",
  "amountUnit": "million-yen",
  "years": [2023, 2024, 2025],
  "balanceSheets": [
    {
      "year": 2023,
      "values": {
        "assets": 1000,
        "cash": 180,
        "capex": null
      }
    },
    {
      "year": 2024,
      "values": {
        "assets": 1100,
        "cash": 195,
        "capex": null
      }
    },
    {
      "year": 2025,
      "values": {
        "assets": 1200,
        "cash": 210,
        "capex": 80
      }
    }
  ],
  "profitAndLoss": {
    "base": [
      {
        "year": 2023,
        "values": {
          "sales": 900,
          "cogs": 570,
          "employeeSalary": 112,
          "employeeBonus": 6,
          "headcount": 110,
          "officerCount": 4
        }
      },
      {
        "year": 2024,
        "values": {
          "sales": 950,
          "cogs": 600,
          "employeeSalary": 118,
          "employeeBonus": 6,
          "headcount": 114,
          "officerCount": 4
        }
      },
      {
        "year": 2025,
        "values": {
          "sales": 1000,
          "cogs": 620,
          "employeeSalary": 125.5,
          "employeeBonus": 6.5,
          "headcount": 118,
          "officerCount": 4
        }
      }
    ],
    "subsidy": []
  },
  "sourceFiles": ["決算資料.pdf"],
  "unmappedItems": ["支払利息：対応する入力項目がないため未反映"],
  "notes": ["資料に事業区分がないため、P/Lはベース事業として記録"]
}
```
