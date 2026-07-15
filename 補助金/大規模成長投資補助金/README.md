# 大規模成長投資補助金 1次～4次・交付決定企業公開PDFデータ

「中堅・中小成長投資補助金」の公式サイトで公開された交付決定企業の取組概要PDFを基に、数値、文章、ページ構成、Box分割結果、検証状態を整理した非公式の研究用データセットです。

## データの出所

交付決定企業の一覧と個別PDF URLは、以下の公式公表ページから取得しました。

| 対象 | 公式公表ページ | 本データのPDF数 | ページ数 |
|---|---|---:|---:|
| 1次 | [1・2次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/1_2ji/koufu/) | 156 | 356 |
| 2次 | [1・2次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/1_2ji/koufu/) | 25 | 63 |
| 3次 | [3・4次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/koufu/) | 107 | 257 |
| 4次 | [3・4次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/koufu/) | 93 | 211 |
| **合計** |  | **381** | **887** |

- 初版の取得・整理日：2026-07-13～2026-07-14
- 個別PDFの公式URLは `data/processed/pdf_manifest.csv` と各データの `pdf_url` 列に保持しています。
- 公式公表ページは「随時更新」とされているため、将来の掲載件数・PDF内容と本データのスナップショットは異なる可能性があります。
- 公式サイトの注記どおり、取組概要PDFの事業費・補助額などは交付申請時点の情報を含み、実績報告後に更新される場合があります。

## 公式中央値資料

公開PDFから再構成した指標と、公式が公表した採択者・申請者全体の中央値を比較する際は、以下を参照しました。

- [1次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/ichiji.pdf)
- [2次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/niji.pdf)
- [1次・2次公募全体における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/information/20250122.pdf)
- [3次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/3ji_median.pdf)
- [4次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/4ji_median.pdf)

公式中央値の「採択者」と、本データが対象とする「HPで取組概要PDFが公開された交付決定企業」は同一母集団とは限りません。また、同じ指標名でも対象企業、対象範囲、基準年、計画期間が異なる場合があるため、比較時は定義を併記してください。

## 収録範囲

- 交付決定企業の取組概要PDF：381件・887ページ
- ページ内Box：1,995件
- 主要4指標：1,524行（381案件 × 4指標）
- 長期成長ビジョン、外発的動機、内発的動機、会社概要、その他Box等の原文
- 事業費、補助額、売上成長目標、労働生産性、従業員給与、役員給与、従業員数

## まず見るファイル

- `data/processed/cases.csv`: 1案件1行の案件マスタ
- `docs/cases_data_dictionary.md`: `cases.csv` 全133列の型・単位・Null・コード値を説明するデータ定義書
- `data/processed/metrics.csv`: 主要4指標の縦持ちデータ
- `data/processed/sales_targets.csv`: 売上成長目標Boxの選択済み抽出結果
- `data/processed/sales_annual.csv`: PDFに明記された年次売上高の縦持ちデータ
- `data/processed/sales_series.csv`: 単体・連結、会社全体・補助事業等を分離した売上系列
- `data/processed/sales_series_annual.csv`: 売上系列ごとの基準・中間・目標時点
- `data/processed/boxes.csv`: ページ内Boxごとの文章・座標・分類
- `data/processed/pdf_manifest.csv`: 公式PDF URL、元ファイル名、ページ数の台帳
- `data/text/narratives.jsonl`: 文章セクションごとの原文
- `data/text/pages.jsonl`: PDF 1ページ1行の全文データ
- `html/index.html`: 案件の検索・一覧用ローカルHTML
- `html/qa.html`: ローカルPDFと抽出値・Box原文を照合する確認用HTML
- `excel/大規模成長投資補助金_1次～4次_統合データ.xlsx`: 検証済みExcelスナップショット

`cases.csv` の事業費・補助額は同一申請内の投資案件合計です。売上の `sales_*` は申請企業自身（単体・当社・会社全体）の比較用代表値、`sales_reported_*` はPDF上の主系列です。連結・親子会社・補助事業等は `sales_series.csv` に別系列として保持します。

## 作成方法の概要

1. 公式公表ページから個別PDF URLを収集。
2. PDFをページ単位で解析し、テキスト、表セル、図形・矩形座標を取得。
3. ページ内の座標を使って文章をBoxごとに分離し、会社名ヘッダーの混入を除外。
4. 事業費・補助額、売上成長目標、主要4指標を構造化。
5. 単位変換、成長率・CAGR・補助率の再計算、年度順序の確認、一部案件の目視確認を実施。
6. 個々のレコードに検証状態、根拠原文、出典ページ、公式PDF URLを保持。

詳細は `docs/methodology.md`、`cases.csv` の完全な列定義は [`docs/cases_data_dictionary.md`](docs/cases_data_dictionary.md)、その他データの列定義は `docs/data_dictionary.md`、検証内容は `docs/validation.md` を参照してください。実際に統計分析・回次比較を行う前に、期間・主体・複数系列・欠損値の扱いをまとめた `docs/analysis_data_handling.md` も確認してください。

## 重要な注意点

- 本リポジトリは経済産業省・補助金事務局の公式データセットではありません。
- 本データに含まれるのは公開PDFのある交付決定企業です。不採択案件がないため、このデータ単独から採択確率や審査上の因果効果は推定できません。
- 数値と文章は機械抽出後にBox位置、表セル、数式検算、一部目視確認で検証していますが、誤抽出が残る可能性があります。重要な判断に使う場合は必ず元PDFを確認してください。
- 空欄は必ずしも「記載なし」を意味しません。抽出不能、対象外、年平均率のみ記載等を含むため、検証状態列も併せて確認してください。
- 親会社、子会社、共同申請者等が併記される場合、数値の対象範囲が申請企業単体とは限りません。`target_entity` と `scope` を確認してください。

## 著作権・利用上の注意

収録元のPDF・文章・図表の著作権や利用条件は、各公開元に帰属します。本リポジトリはPDF本体をGitに収録せず、出典URLと抽出・構造化したデータを保持します。利用者は公開元の条件と適用法令を確認してください。

## 再生成

`node scripts/build_dataset.mjs --source-dir <抽出作業ディレクトリ>`

## ローカルPDFの準備

`node scripts/prepare_local_pdfs.mjs --source-dir <抽出作業ディレクトリ>`

`local_assets/` は `.gitignore` 対象です。確認用HTMLはこのフォルダのPDFを相対パスで表示します。

## 確認用HTMLの使い方

プロジェクトディレクトリでローカルHTTPサーバーを起動します。

`python -m http.server 8000`

ブラウザで `http://localhost:8000/html/qa.html` を開いてください。検索欄はスペース区切りのAND検索です。例えば `半導体 2029年 売上` と入力すると、すべての語を案件内に含む企業だけを表示します。確認状態とメモはブラウザのローカルストレージに保存され、［確認結果CSV］から書き出せます。

### 別抽出データとの比較（Pythonのみ）

`cases.csv`と別の抽出CSVを比較し、相違・片側欠損を`qa.html`で強調できます。Node.jsやWebサーバーは不要です。

1. `comparison/example.mapping.json`をコピーして、比較CSV名・レコード照合キー・列対応を設定します。
2. 次を実行します。

```powershell
python scripts/build_comparison.py --mapping comparison/my_data.mapping.json
```

比較CSVをコマンドで指定する場合：

```powershell
python scripts/build_comparison.py --mapping comparison/my_data.mapping.json --input C:\data\other.csv
```

比較結果は`data/processed/comparison_results.csv`と`html/data/comparison_results.json`へ出力され、同じ内容が`html/qa.html`に埋め込まれます。詳しい設定は[`docs/comparison_qa.md`](docs/comparison_qa.md)を参照してください。

比較表示は初期状態ではOFFです。QA画面上部の［比較検証を開始］を押すと、不一致企業と相違項目が赤く強調されます。

動作確認用として、`comparison/test_3rows.csv`と`comparison/test_3rows.mapping.json`を収録しています。このテストデータには意図的な不一致と欠損が含まれます。

## 生成AIによる全件画像監査

381案件・887ページについて、PDFをページ画像として1件ずつ確認しました。単純な横一行OCRではなく、Box・表・主体の位置関係を見ながら次を整理しています。

- 売上目標は申請企業、グループ、親会社、子会社、関連会社、補助事業などを別系列として保持
- 投資案件が複数ある場合、補助対象となる同一申請内の合計額を代表値として保持
- 労働生産性、従業員給与、役員給与、従業員数を表の行・列単位で確認
- 役員給与は金額がなく年平均上昇率だけ記載されたケースも `rate_only` として保持
- `23/12期`、`FY28`、`30年`などは原文ラベルと補正前年を残したうえで、分析用の補正後年を2023、2028、2030として保持
- `5年後`、`基準年度+3年後`などは、同じ系列の基準年を確定できる場合に基準年から補正後年を算出
- PDF内で数値同士が一致しない場合、推測値へ置き換えず原文値と不整合注記を保持

監査結果は `data/manual_audit/manual_audit.jsonl`、監査スキーマは `data/manual_audit/schema.json` にあります。横断検証と二巡目確認の記録は `docs/cross_batch_validation.md`、`docs/sales_numeric_validation.md`、`docs/recheck_*.md` を参照してください。

監査結果をCSV・HTMLへ反映するには、次を実行します。

`node scripts/integrate_manual_audit.mjs <project-dir> <stage-dir>`
