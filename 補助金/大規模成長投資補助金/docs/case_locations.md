# 本社所在地・事業実施場所データ

## 収録方針

`data/processed/case_locations.csv` は、交付決定企業の所在地を **1所在地につき1行** で保持します。`data/processed/cases.csv` には、都道府県での集計や絞り込みに使いやすい集約列を付加します。

正本は、経済産業省「中堅・中小成長投資補助金」の交付決定企業ページです。

- 1・2次：[補助金交付が決定した企業](https://seichotoushi-hojo.jp/1_2ji/koufu/)
- 3・4次：[補助金交付が決定した企業](https://seichotoushi-hojo.jp/koufu/)
- 1・2次ページの公開JSON：`https://seichotoushi-hojo.jp/assets/data/koufu.json?260715`
- 3・4次ページの公開JSON：`https://seichotoushi-hojo.jp/assets/data/koufu-renew.json?26070702`

公式ページは「随時更新」と明記されているため、JSONのローカルスナップショット、各行の `source_*`、`retrieved_at` を残します。案件との結合は会社名ではなく、公式取組概要PDFのURLパスで行います。

事業実施場所の都道府県は各 `shop_office` 住所原文から抽出します。公式JSONの `area_name_sub` は検索フィルター用の都道府県一覧であり、複数の住所行と位置対応せず、住所原文にある都道府県の一部を省く案件もあるため、住所順の対応表や完全な正本としては使用しません。

## 現行ページにない2案件

381案件のうち379案件は、交付決定ページの現行JSONとPDF URLで完全一致します。次の2案件は現行JSONにないため、公式の[1次公募 採択案件一覧](https://seichotoushi-hojo.jp/assets/pdf/list_1ji.pdf)にある都道府県のみを補完します。

- 株式会社ビッグハウス：本社 宮崎県、事業実施場所 宮崎県
- 株式会社マグナ・ワイヤレス：本社 東京都、事業実施場所 東京都

この2案件は `location_detail_level=prefecture_only`、`location_match_status=official_adoption_list_prefecture_fallback` です。現行の交付決定ページから確認できる379案件は、それぞれ `full_address`、`exact_pdf_url` です。採択案件一覧は交付決定ページとは公表段階が異なるため、2案件の町・番地を推測して補いません。

## ファイルと主な列

### `case_locations.csv`

- `location_type`: `head_office` または `project`
- `location_sequence`: 同じ案件・所在地種別内の順番
- `address_raw`: 公式データの住所原文。都道府県のみの補完行では都道府県名
- `prefecture`, `municipality`: 集計用の地域列
- `location_status`: `published`、`planned`、`undecided`
- `detail_level`: `full_address`、`planned`、`undecided` または `prefecture_only`
- `source_stage`: `grant_decision_page` または `adoption_list`
- `source_page_url`, `source_data_url`, `source_record_id`, `retrieved_at`: 出典追跡用

### `cases.csv` の集約列

- `industry`
- `head_office_address`, `head_office_prefecture`, `head_office_municipality`
- `project_location_count`
- `project_location_addresses`, `project_location_prefectures`, `project_location_municipalities`
- `project_location_statuses`, `has_undecided_project_location`
- `head_office_project_same_prefecture`
- `location_detail_level`, `location_match_status`
- `location_source_page_url`, `location_source_data_url`, `location_retrieved_at`

複数所在地は `case_locations.csv` を正本とし、`cases.csv` の複数値は ` | ` 区切りです。`project_location_prefectures` と `project_location_municipalities` は重複を除きますが、`project_location_count` は公式住所行数を数えます。

住所原文に「予定」「造成中」がある行は `planned`、「未定」「未確定」がある行は `undecided` とします。案件集約列の `location_detail_level` はそれぞれ `contains_planned`、`contains_undecided` です。所在地が予定・未定のケースを、都道府県中心地などで補完しません。

`municipality` は住所原文からの機械抽出です。株式会社ファインの事業実施場所原文「兵庫県赤穂郡間み氷張奥甲931」は市町村接尾辞を判定できないため、都道府県は兵庫県のまま保持し、市町村だけ空欄にしています。原文を書き換えて推測補完はしません。

## 更新手順

公開JSONを再取得し、明細・案件マスタ・HTML用JSONを更新します。

```powershell
python scripts/update_case_locations.py --refresh --retrieved-at YYYY-MM-DD
```

ネットワークを使わず、保存済みスナップショットから再生成する場合は `--refresh` を外します。`cases.csv` を再生成する処理を実行した後は、この所在地更新スクリプトも再実行してください。
