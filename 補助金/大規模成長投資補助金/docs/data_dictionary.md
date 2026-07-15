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

## 案件代表値

- 事業費・補助額は、同一申請に含まれる複数投資案件の合計額を代表値とする。
- `sales_*`: 申請企業自身の比較用代表系列。単体・当社・会社全体を優先する。
- `sales_representative_series_id`: 申請企業代表に選んだ売上系列ID。
- `sales_representative_reason`: 代表系列の選定理由。
- `sales_reported_*`: PDFで先頭または主目標として掲げられた系列。
- 申請企業自身の系列が確認できず、連結・親子会社等の系列しかない場合、`sales_*` は空欄とする。

## 売上期間

- `*_period_label`: PDFの原文表記（例：`24/3期`）。
- `*_year_before_correction`: PDF目視監査時点の年。2桁年・FY・相対年等はnull。
- `*_year_after_correction`: 分析用の補正後年。2桁年・FYは20yyとし、`5年後`等は同じ系列の基準年から計算できる場合に補正する。
- `*_year`: 後方互換用で、原則として`*_year_after_correction`と同じ。
- `*_year_correction_method`, `*_year_correction_confidence`: 補正方法と信頼度。
- 月についても`*_month_before_correction`, `*_month_after_correction`を保持する。
- `review_required`: 年度解釈、系列分離、算術に目視確認が必要な場合に真。

標準補正で解決できない`直近期`、`基準年度`等を追加補完する場合は既存列を上書きせず、分析用の補完年、補完ルール、信頼度、補完フラグを別列で追加する。詳しくは `analysis_data_handling.md` を参照。
