# 採択企業の「補完要因」分析

## 目的

公開企業PDFの指標が申請者・採択者中央値を下回る企業について、別の定量指標が弱さを補っているかを診断します。既存ダッシュボードは変更しません。

これは採択要因の因果推論ではありません。非採択企業の個票、審査項目別点数、プレゼンテーション評価が公開されていないためです。「採択企業内で、公開情報により説明できる範囲」を明確にする分析です。

## 実行

```powershell
python analyze_adoption_drivers.py
```

入力は `data/processed/cases.csv`、`data/reference/official_round_benchmarks.csv`、`data/processed/sales_series.csv`、`data/text/pages.jsonl` です。

出力:

- `company_diagnostics.csv`: 企業別の劣後数、補助金効率、補完指標、文章テーマ
- `round_summary.csv`: 公募回別の集計
- `group_comparison.csv`: 可視指標劣後群とその他採択企業の比較
- `metric_assessment.csv`: 指標の重要性、公式上の位置付け、測定可能性
- `summary.json`: 主要集計値

深掘り分析:

- `deepen_adoption_profiles.py`: 5つの定量軸、採択プロファイル、文章根拠密度、パレート支配を計算
- `application_profiles.csv`: 企業別の採択プロファイルと審査項目別文章特徴
- `profile_summary.csv`: 採択プロファイル別集計
- `criteria_evidence_summary.csv`: 公開文章の審査項目別根拠密度
- `threshold_sensitivity.csv`: 「強い軸」の閾値を変えた感度分析
- `applicant_benchmark_summary.csv`: 採択者中央値未満でも申請者中央値以上かを集計
- `deep_dive_report.md`: 「どういう申請が通るのか」の詳細な解釈と申請スコアカード

第6次公募向け相談資料:

- `prepare_sixth_round_consulting.py`: 第5次公式中央値、類似企業の目視精査、3～5次の金融機関確認データを統合
- `sixth_round_consulting_guide.md`: 第6次の数値目線、数値の作り方、5ペアの精査、相談時の判定基準
- `sixth_round_numeric_strategy.csv`: 13指標の制度下限・採択者中央値・実務目標
- `sixth_round_benchmark_trends.csv`: 主要7指標の1次～5次採択者中央値の推移
- `matched_pair_review.csv`: 同一公募回・近い投資規模でそろえた5ペアの数値と人手精査所見
- `external_financial_confirmations.csv`: 3～5次の公式採択案件一覧にある金融機関確認の全295件
- `external_financial_confirmation_summary.csv`: 公募回別の金融機関確認提出率

40ペアへの目視精査拡張:

- `select_matched_pair_candidates.py`: 同一公募回・同一業種・近い投資規模で40ペア（80社）を重複なく選定し、公開PDF本文の精査票を一時生成
- `expanded_pair_manual_codes.csv`: 需要、能力制約、構造転換、地域性、実行確度、政策整合を0～3点で目視符号化した原票
- `analyze_expanded_matched_pairs.py`: 符号化原票を集計し、信頼区間・ペア内符号検定・部分標本感度分析を生成
- `expanded_matched_pair_report.md`: 40ペアの結論、全ペア監査表、第6次公募への含意
- `expanded_matched_pair_review.csv`: 40ペアの数値・6要因・根拠・企業別公式PDF URL
- `expanded_pair_company_coding.csv`: 80社の企業単位データ
- `expanded_pair_factor_summary.csv`: 要因別頻度、Wilson 95%区間、ペア内符号検定
- `expanded_pair_sensitivity.csv`: 旧5ペア除外、3～4次、製造業／非製造業などの感度分析
- `expanded_pair_review.xlsx`: 上記の表と方法・出典をまとめた閲覧用Excel
- `expanded_matched_pair_dashboard.html`: 主要結果、6要因比較、80社散布図、40ペアの根拠をまとめた単独HTML
- `build_expanded_pair_dashboard.py`: CSV・JSONから上記HTMLを再生成

再生成:

```powershell
python select_matched_pair_candidates.py
python analyze_expanded_matched_pairs.py
python build_expanded_pair_dashboard.py
```

この環境ではOS標準の `python` がPython 2の場合があるため、実際にはPython 3.10以降を使用してください。`select_matched_pair_candidates.py` が作る `tmp/pdfs` の精査票は中間ファイルで、Git管理対象ではありません。

外部データを再取得して更新する場合:

```powershell
python prepare_sixth_round_consulting.py --refresh-external
```

ローカルに公式PDFを保存済みの場合は、`--pdf-dir` で `list_3ji.pdf`、`list_4ji.pdf`、`list_5ji.pdf` のあるフォルダを指定できます。

## 判定ルール

- 可視7指標のうち3指標以上が観測でき、採択者中央値を下回る比率が60%以上の企業を「可視指標劣後」とします。
- 中央値は足切り基準ではありません。採択者の半数が各指標の中央値を下回るため、複数指標を束ねて診断します。
- 付加価値増加額の公開PDF推計は、`(目標労働生産性×目標従業員数－基準労働生産性×基準従業員数)÷10,000`（億円）です。従業員数の主体範囲が審査入力と一致する保証はないため、企業別の公式値ではなく「proxy」としています。

## 公式根拠

- [第4次公募 公募要領](https://seichotoushi-hojo.jp/assets/pdf/outline_4ji.pdf): 経営力、先進性・成長性、地域への波及効果、大規模投資・費用対効果、実現可能性、加点項目
- [第3次公募 補助金の概要](https://seichotoushi-hojo.jp/assets/pdf/about_3ji.pdf): 補助金額に対する付加価値増加額などの費用対効果
- [第1次公募 一次審査結果](https://seichotoushi-hojo.jp/1_2ji/information/2024/05/28.html): 一次審査・プレゼンテーション審査の存在
- [第1次公募 採択結果](https://seichotoushi-hojo.jp/1_2ji/information/2024/06/21.html)
- [第2次公募 採択結果](https://seichotoushi-hojo.jp/1_2ji/information/2024/11/07.html)
- [第3次公募 採択結果](https://seichotoushi-hojo.jp/information/2025/06/30.html)
- [第4次公募 採択結果](https://seichotoushi-hojo.jp/information/2025/10/10.html)

## 注意

公開企業PDFは交付決定企業を中心とするデータで、公募時の「採択申請者」母集団と一対一ではありません。特に1次・2次はラベルと母集団差に注意してください。文章テーマは単語の言及有無であり、審査上の評価や点数ではありません。
