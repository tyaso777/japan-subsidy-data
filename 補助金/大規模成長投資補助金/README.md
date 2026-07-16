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
- [1次～4次の申請者・採択者指標（公式説明資料）](https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/000058716.pdf)
- [5次公募の申請者・採択者指標](https://chukentou-seichotoushi-hojo.jp/assets/lp/documents/5ji_median.pdf)

公式値は原則として中央値です。ただし「全社売上高に対する補助事業売上高の割合」だけは平均値です。公式値の「採択者」と、本データが対象とする「HPで取組概要PDFが公開された交付決定企業」は同一母集団とは限りません。また、同じ指標名でも対象企業、対象範囲、基準年、計画期間が異なる場合があるため、比較時は定義を併記してください。ダッシュボード用に転記した値は `data/reference/official_round_benchmarks.csv`、値ごとの出典方針と資料差分は [`docs/official_round_benchmarks.md`](docs/official_round_benchmarks.md) にあります。

## 収録範囲

- 交付決定企業の取組概要PDF：381件・887ページ
- ページ内Box：3,055件（既存Boxに加え、左見出し付きセクションを復元）
- 主要4指標：1,524行（381案件 × 4指標）
- 長期成長ビジョン、外発的動機、内発的動機、会社概要、その他Box等の原文
- 事業費、補助額、売上成長目標、労働生産性、従業員給与、役員給与、従業員数

## まず見るファイル

- `data/processed/cases.csv`: 1案件1行の案件マスタ
- `docs/cases_data_dictionary.md`: `cases.csv` の型・単位・Null・コード値を説明するデータ定義書
- `data/processed/metrics.csv`: 主要4指標の縦持ちデータ
- `data/processed/unit_normalization_changes.csv`: 原単位を訂正・補完した企業と項目の監査履歴
- `data/processed/unit_revalidation_changes.csv`: 単位訂正に加え、原値からの再換算で精緻化した金額を含む変更一覧
- `data/processed/payroll_unit_revalidation_changes.csv`: 給与・労働生産性の既知の単位矛盾と採用した分析用換算の履歴
- `data/processed/sales_targets.csv`: 売上成長目標Boxの選択済み抽出結果
- `data/processed/sales_annual.csv`: PDFに明記された年次売上高の縦持ちデータ
- `data/processed/sales_series.csv`: 単体・連結、会社全体・補助事業等を分離した売上系列
- `data/processed/sales_series_annual.csv`: 売上系列ごとの基準・中間・目標時点
- `data/manual_audit/full_manual_visual_audit.jsonl`: 全381案件について、公開PDFの全ページを画像で再確認した監査台帳
- `data/manual_audit/full_manual_visual_audit_changes.csv`: 全件目視監査で実際に変わった列の修正前・修正後
- `data/processed/boxes.csv`: ページ内Boxごとの枠テーマ・枠内容・座標・分類
- `data/processed/pdf_manifest.csv`: 公式PDF URL、元ファイル名、ページ数の台帳
- `data/text/narratives.jsonl`: 文章セクションごとの原文
- `data/text/pages.jsonl`: PDF 1ページ1行の全文データ
- `html/index.html`: 案件の検索・一覧用ローカルHTML
- `html/qa.html`: ローカルPDFと抽出値・Box原文を照合する確認用HTML
- `html/qa_v0.1.html`: `cases.csv` の代表値と指標別信頼性を、ローカルPDFと並べて確認する分析前QA用HTML
- `html/public_metrics_dashboard.html`: 指標・回次・品質フラグを選び、企業別散布図、分布、公式1～5次代表値、原PDFを連動表示する「採択企業 公開指標比較ダッシュボード」
- `docs/payroll_total_estimation.md`: 給与支給総額の近似式、判定列、日生流通運輸倉庫・NAX JAPANの単位再検証
- `excel/大規模成長投資補助金_1次～4次_統合データ.xlsx`: 検証済みExcelスナップショット

`cases.csv` の事業費・補助額は同一申請内の投資案件合計です。売上の `sales_*` は申請企業自身（単体・当社・会社全体）の比較用代表値、`sales_reported_*` はPDF上の主系列です。連結・親子会社・補助事業等は `sales_series.csv` に別系列として保持します。

## 作成方法の概要

1. 公式公表ページから個別PDF URLを収集。
2. PDFをページ単位で解析し、テキスト、表セル、図形・矩形座標を取得。
3. ページ内の座標を使って文章をBoxごとに分離し、会社名ヘッダーの混入を除外。
   左側に見出しセル、右側に本文がある「補助事業の背景・目的」「設備投資の内容」「目標値」等は、横方向の同一セクションとして復元し、`box_theme` と `box_content` に分離。
4. 事業費・補助額、売上成長目標、主要4指標を構造化。
5. 項目ラベル・単位・Box・主体を対応付け、原単位値を保持したまま万円/人・百万円・億円へ換算。成長率・CAGR・補助率も再計算。
6. 個々のレコードに検証状態、根拠原文、出典ページ、公式PDF URLを保持。

詳細は `docs/methodology.md`、`cases.csv` の列定義は [`docs/cases_data_dictionary.md`](docs/cases_data_dictionary.md)、その他データの列定義は `docs/data_dictionary.md`、単位処理は [`docs/unit_normalization.md`](docs/unit_normalization.md)、検証内容は `docs/validation.md` を参照してください。実際に統計分析・回次比較を行う前に、期間・主体・複数系列・欠損値の扱いをまとめた `docs/analysis_data_handling.md` と、案件構造・数値不一致・率の曖昧性・推奨除外条件を定義した [`docs/analysis_quality_flags.md`](docs/analysis_quality_flags.md) を確認してください。

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

続けて原単位・換算値・根拠Boxを付与し、検証します。

`python scripts/normalize_units.py --project-root .`

全件目視監査の反映後、既知の単位矛盾を再検証し、給与支給総額の近似列を生成します。

`python scripts/revalidate_payroll_totals.py`

`python scripts/build_analysis_flags.py`

`python scripts/build_qa_v01.py`

`python scripts/build_analysis_dashboard.py`

`node scripts/verify_dataset.mjs`

## ローカルPDFの準備

`node scripts/prepare_local_pdfs.mjs --source-dir <抽出作業ディレクトリ>`

ローカルPDFから左見出し付きセクションを復元し、`boxes.csv`・QA HTMLへ反映する場合：

`python scripts/extract_box_sections.py --project-root .`

`local_assets/` は `.gitignore` 対象で、GitHubのZIPにはPDF本体が含まれません。ZIPから `qa.html` を開いた場合は右側に案内が表示されるため、［公式PDFを開く］を使用してください。ローカルPDFを準備した環境では、このフォルダのPDFを相対パスで表示します。案件IDと公式URLは元資料名を保持しますが、ローカルPDF名は環境間の互換性のため、連続するアンダースコアを1個に正規化します。例えば案件ID `s1_outline__179` のローカルPDFは `local_assets/pdfs/s1_outline_179.pdf` です。s1・s2とも同じ規則です。

既存のローカルPDFとHTML参照をこの規則へ移行する場合は `python scripts/normalize_local_pdf_names.py --project-root .` を実行します。

## 確認用HTMLの使い方

プロジェクトディレクトリでローカルHTTPサーバーを起動します。

`python -m http.server 8000`

ブラウザで `http://localhost:8000/html/qa.html` を開いてください。検索欄はスペース区切りのAND検索です。例えば `半導体 2029年 売上` と入力すると、すべての語を案件内に含む企業だけを表示します。確認状態とメモはブラウザのローカルストレージに保存され、［確認結果CSV］から書き出せます。

分析に使う代表値を中心に確認するときは `http://localhost:8000/html/qa_v0.1.html` を開きます。画面中央は、案件構造、投資額・補助額、売上成長目標、主要4指標の順です。各値の横に `利用可`、`注意して利用`、`一部のみ`、`要原資料確認`、`値なし` の指標別信頼性を表示します。「先に見る箇所」には、その案件で分析前に注意すべき指標だけを具体的に列挙します。左の会社一覧は［☰ 会社］で開閉でき、状態はブラウザに保存されます。検索はスペース区切りのAND検索です。ページ下部の「cases.csv 全代表列・補助列」では、主画面にない補助列も含めて全スカラー列を確認できます。

`qa_v0.1.html` をデータ更新後に再生成するには、Node.jsを使わず次を実行します。

`python scripts/build_qa_v01.py`

全体分析ページをデータ更新後に再生成する場合：

`python scripts/build_analysis_dashboard.py`

`public_metrics_dashboard.html` では、横軸・縦軸、公募回、指標別信頼性、対象範囲、案件構造・主体・単位・OCR等の除外フラグを指定できます。散布図の企業を選択すると、原PDF、主要値、指標別信頼性、同一次の公式申請者・採択者代表値に対する位置を表示します。公式値との比較のうち、売上CAGR・売上増加額・投資額／売上高は公開PDFの定義と完全には一致しないため「近似比較」です。労働生産性率、従業員給与率、役員給与率も、対象主体や期間が異なる案件では元PDFを確認してください。旧 `analysis_dashboard.html` は新ファイルへの転送用として残しています。

### 別抽出データとの比較（Pythonのみ）

`cases.csv`と別の抽出CSVを比較し、相違・片側欠損を`qa.html`で強調できます。Node.jsやWebサーバーは不要です。

1. [`comparison/canonical_current_fields.mapping.template.json`](comparison/canonical_current_fields.mapping.template.json) をコピーします。
2. `columns`から、外部CSVに存在しない項目を要素ごと削除します。
3. 残した項目の `external`、`external_unit`、`external_multiplier` だけを外部CSVに合わせて設定します。`current`、`current_unit`、`type` は原則変更しません。
4. 比較CSV名とレコード照合キーを設定し、次を実行します。

```powershell
python scripts/build_comparison.py --mapping comparison/my_data.mapping.json
```

`current`側は、単位が統一された分析用列を使います。例えば、従業員給与の基準値は `employee_pay_base_value_man_yen_per_person`（万円/人）、労働生産性の基準値は `labor_base_value_man_yen_per_person`（万円/人）です。`employee_pay_base_value` や `labor_base_value` はPDF原値であり、企業ごとに円/人・千円/人・万円/人が混在するため、全件の差分比較には使いません。

`external_multiplier`は、外部値を`current_unit`へ変換する倍率です。同じ単位なら`1`、外部の億円をcurrentの百万円へ合わせる場合は`100`、外部の千円/人をcurrentの万円/人へ合わせる場合は`0.1`です。外部CSVに存在する項目だけを比較するのが基本です。

少数項目だけを手で組む場合は `comparison/example.mapping.json` も参照できますが、こちらも正規化済みの`current`列を使用しています。

比較CSVをコマンドで指定する場合：

```powershell
python scripts/build_comparison.py --mapping comparison/my_data.mapping.json --input C:\data\other.csv
```

比較結果は`data/processed/comparison_results.csv`と`html/data/comparison_results.json`へ出力され、同じ内容が`html/qa.html`と`html/qa_v0.1.html`に埋め込まれます。`build_comparison.py`は`qa_v0.1.html`も自動再生成します。詳しい設定は[`docs/comparison_qa.md`](docs/comparison_qa.md)を参照してください。

比較表示は初期状態ではOFFです。QA画面上部の［比較検証を開始］または［差分検証を開始］を押すと、不一致企業と相違項目が赤く強調されます。`qa_v0.1.html`では、該当する代表値カード、主要4指標の行、全列一覧の該当列も同時に強調します。

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

初回監査は `data/manual_audit/manual_audit.jsonl`、2026年7月の全件再監査は `data/manual_audit/full_manual_visual_audit.jsonl` にあります。全381案件の全ページを1件ずつ画像で確認し、事業費・補助額、売上系列、主要4指標、期間、主体、単位を再照合しました。実際の変更は `data/manual_audit/full_manual_visual_audit_changes.csv`、手順と注意点は `docs/full_manual_visual_audit.md` を参照してください。

全件再監査台帳をCSV・HTMLへ反映するには、次を実行します。Node.jsは不要です。

`python scripts/apply_full_manual_audit.py --project-root . --ledger-dir <manual_audit_v2_batch*.jsonl のあるフォルダ>`

最終検証では、381 PDF・887ページの実ページ数と監査台帳の確認ページが完全一致することを確認しました。反映後のデータは売上508系列、主要指標1,556レコード、年度別売上466点です。追加ページ監査で判明した参加企業系列や原文内不整合の扱いも`docs/full_manual_visual_audit.md`に記録しています。

追加ページ監査の確定補正を再適用する場合は、次を実行します。

`python scripts/complete_page_audit.py --project-root .`
