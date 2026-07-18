# 第6次申請に向けた「採択者中央値未満案件」の再分析

現行の `public_metrics_dashboard.html` と同じ9指標を起点に、1～4次の公開企業PDF 381社を再分類し、1～5次の公式代表値、第6次事前公開資料、既存40ペアの目視評価、新規24社の目視評価を統合した分析です。

最初に [round6_adoption_reassessment_report.html](round6_adoption_reassessment_report.html) を開いてください。数値の意味、ケース検索、第6次の申請設計まで一つの資料にまとめています。

## 結論の要点

- 現行9指標のうち5指標以上を観測でき、60%以上が同回の採択者中央値未満だった企業は118/381社です。
- ただし118社中117社は少なくとも1指標で申請者代表値以上、80社は観測指標の過半数で申請者代表値以上でした。「採択者中央値未満」は「申請者全体でも弱い」と同義ではありません。
- No.13（投資額／全社売上高）は高いほど良いとはいえないため、方向性分析から外しました。残る8指標で同じ定義に該当する113社のうち、42社は成長・生産性／付加価値・賃金の2領域以上、66社は1領域で採択者中央値以上でした。公開定量で補完が見つからないのは5社です。
- 現行低位44社を目視すると、事業・工程の構造転換44/44、能力制約42/44、実行確度42/44、政策整合42/44、地域・供給網40/44、具体的需要33/44が2点以上でした。ただし採択企業のみの目的抽出・単独非盲検評価であり、採否識別力ではありません。
- 第6次では、中央値を機械的に超えることより、需要→能力制約→投資仕様→数量・売上→付加価値・賃金→地域波及→国費当たり効果を同じ数量単位で接続し、足下の全社賃上げ、資金確度、モニタリング、補助金の必要性まで証拠化することが重要です。

## 再現方法

このフォルダで次を実行します。

```powershell
python analyze_round6_reassessment.py
python build_round6_reassessment_report.py
python validate_round6_reassessment.py
```

分析定義の詳細は [methodology.md](methodology.md) を参照してください。

## 主な成果物

| ファイル | 内容 |
|---|---|
| `round6_adoption_reassessment_report.html` | 専門家向け統合レポート |
| `case_level_reassessment.csv` | 381社の現行9指標・方向性8指標判定、公式比較、説明レベル |
| `lagging_definition_sensitivity.csv` | 指標集合・最低観測数・未満割合の感度分析 |
| `metric_reconstruction_validation.csv` | 公募回別の件数、中央値、平均、標準偏差、分散、公式値との差 |
| `focused_qualitative_review_44.csv` | 現行低位44社の6要素目視コードと根拠 |
| `focused_qualitative_factor_summary.csv` | 44社の目視要素集計 |
| `fully_below_case_studies.csv` | 方向性8指標の観測値がすべて採択者中央値未満の5社 |
| `official_applicant_accepted_gaps_by_round.csv` | 公式15指標の申請者・採択者差（1～5次） |
| `round6_numeric_framework.csv` | 5次公式値、1～5次傾向参照、検討用ストレッチ |
| `round6_official_changes.csv` | 第6次の変更点と申請実務への変換 |
| `source_manifest.csv` | ローカル・公式出典一覧 |

## 重要な注意

非採択企業の個票と審査項目別得点は公開されていません。この分析から採択確率、因果効果、審査配点は推定できません。また、第6次資料は事前公開版に基づくため、正式公募開始時に[公式ダウンロードページ](https://chukentou-seichotoushi-hojo.jp/download/)との差分確認が必要です。
