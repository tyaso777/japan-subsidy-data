# データ辞書

## 共通キー

- `case_id`: 抽出系内の案件ID。
- `round`: 公募回（1次～4次）。
- `company`: PDFに記載された企業名。
- `pdf_url`: 公式PDFへのURL。

## 主な単位

- `*_million_yen`: 百万円。
- `*_oku_yen`: 億円。
- `*_pct`: パーセント値。例：5.2は5.2%。
- `bbox_x1/y1/x2/y2`: PDFページ上のBox座標。

## テーブル粒度

- `cases.csv`: 1案件1行。
- `metrics.csv`: 1案件×1指標1行。原則と1案件4行。
- `sales_targets.csv`: 1案件1行の選択済み売上目標。
- `sales_annual.csv`: 1案件×1売上年1行。
- `sales_series.csv`: 1案件×1売上系列1行。単体・連結、会社全体・補助事業等を分離。
- `sales_series_annual.csv`: 1売上系列×1時点1行。
- `boxes.csv`: 1ページ×1Box1行。
- `narratives.jsonl`: 1案件×1文章セクション1行。
- `pages.jsonl`: PDF 1ページ1行。
- `cost_validations.csv`: 事業費・補助額の原値、原単位、百万円換算値と検証根拠。
- `unit_normalization_changes.csv`: 項目ラベル・単位・Boxを照合して訂正または補完した単位の履歴。
- `unit_revalidation_changes.csv`: 単位訂正と、原値・原単位から再計算して精緻化した換算値の履歴。

## 原単位と換算値

- 主要指標は `base_value_raw`、`target_value_raw`、`unit_raw` にPDFの原表記を保持し、金額指標は `base_value_man_yen_per_person`、`target_value_man_yen_per_person` に万円/人換算値を持つ。
- 事業費・補助額は `*_value_raw`、`*_unit_raw`、原表記の単純換算 `*_raw_converted_million_yen`、精度を比較して採用した `*_million_yen_normalized` を併存させる。
- 売上増加額は `increase_value_raw`、`increase_unit_raw` と `increase_oku_normalized` を併存させる。
- `sales_multiple` はPDFに「1.7倍」「33倍」等と記載された倍率、または基準値・目標値から導出した倍率。`growth_rate_pct` と混同しない。たとえば1.7倍は170%成長ではなく、累積増加率に直す場合は70%である。
- 単位は公募回次ではなく、同一Box内の項目ラベル・単位・主体との対応で判定する。詳細は `unit_normalization.md` を参照。

## Box列

- `box_type`: 分析用の分類。例：`project_background`、`investment_content`、`project_targets`、`other`。
- `box_label`: 表示用の標準ラベル。
- `box_title`: 従来互換のBox見出し。
- `box_theme`: PDF上の枠テーマ・見出し。独自見出しは原文のまま保持する。
- `box_content`: 見出しを除いた枠本文。全文検索やテーマ別比較にはこの列を使う。
- `text`: 従来互換の「テーマ＋本文」。新規分析では `box_theme` と `box_content` を優先する。
- `source_method=template_labeled_section`: 左側の色付き見出しセルと右側の本文領域を、座標から一つのセクションとして復元した行。
- `補助事業の背景・目的`、`設備投資の内容`、`目標値`は、標準テンプレート上で検出できる場合にそれぞれ独立Boxとして保持する。変則レイアウトや見出し自体がないPDFでは存在しない場合がある。

## 案件代表値

- 事業費・補助額は、同一申請に含まれる複数投資案件の合計額を代表値とする。
- `sales_*`: 申請企業自身の比較用代表系列。単体・当社・会社全体を優先する。
- `sales_representative_series_id`: 申請企業代表に選んだ売上系列ID。
- `sales_representative_reason`: 代表系列の選定理由。
- `sales_reported_*`: PDFで先頭または主目標として掲げられた系列。
- 申請企業自身の系列が確認できず、連結・親子会社等の系列しかない場合、`sales_*` は空欄とする。

## 売上期間

- `*_period_label`: PDFの原文表記（例：`24/3期`）。
- `*_year_before_correction`: PDFに現れた年の数値部分。`24/3期`なら`24`、`2024年度`なら`2024`。相対年だけで年数値がない場合はnull。
- `*_year_after_correction`: 分析用の補正後年。2桁年・FYは20yyとし、`5年後`等は同じ系列の基準年から計算できる場合に補正する。
- `*_year`: 後方互換用で、原則として`*_year_after_correction`と同じ。
- `*_year_correction_method`, `*_year_correction_confidence`: 補正方法と信頼度。
- 月についても`*_month_before_correction`, `*_month_after_correction`を保持する。
- `review_required`: 年度解釈、系列分離、算術に目視確認が必要な場合に真。

標準補正で解決できない`直近期`、`基準年度`等を追加補完する場合は既存列を上書きせず、分析用の補完年、補完ルール、信頼度、補完フラグを別列で追加する。詳しくは `analysis_data_handling.md` を参照。
