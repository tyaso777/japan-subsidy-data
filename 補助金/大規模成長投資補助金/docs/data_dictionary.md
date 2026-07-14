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
- `boxes.csv`: 1ページ×1Box1行。
- `narratives.jsonl`: 1案件×1文章セクション1行。
- `pages.jsonl`: PDF 1ページ1行。
