# 申請者中央値未満指標が多い採択案件：外部情報調査

## 正本

- `external_reason_investigation_report.md`：結論、対象補正、共通点、類似採択対照、28社の個別証拠、反証、第6次への含意、追加調査の優先順位
- `company_findings_30.csv`：正本28社と旧集合から外れた2社の個社結論
- `web_evidence_facts.csv`：外部事実、URL、情報時点、情報源区分
- `methodology_roadmap.md`：採択理由をさらに識別する60の方法

当初の29件は、申請公募回の再監査後には28件となる。旧29件からアサヒセイレン中部と八立製作所を除き、浦島観光ホテルを加える。Web調査は両集合を覆う30社で実施し、本文の正本は補正後28件、外れた2件は監査付録とした。

## 解釈上の注意

- 28件は「公開9指標のうち5指標以上を観測でき、同回申請者中央値を下回る比率が60%以上」の採択・交付企業である。全指標が中央値未満という意味ではない。
- No.8、No.10、No.13、No.14には公開PDFからの近似が含まれ、集合は指標定義と境界に敏感である。
- Web調査で見つけた事情は、審査基準と整合する「理由候補」であり、審査点又は採択理由の直接証拠ではない。
- 類似対照も採択企業である。不採択企業との比較ではなく、採択確率や因果効果を推定しない。
- 採択後の資料は実行・結果の検証にだけ使い、採択時点の理由へ遡及させない。

## 再現

このフォルダで、ワークスペース付属のPythonを用いて次を順に実行する。

```powershell
python compile_web_research.py
python derive_policy_addons.py
python audit_control_rounds.py
python compare_matched_controls.py
python build_external_reason_report.py
```

検証条件は次のとおり。

- `validation_errors.txt` が空
- `control_validation_errors.txt` が空
- 正本28社、監査2社、対照28社、対応ペア28組
- 28対応ペアはすべて正しい申請公募回
- レポートに `集計待ち` が残っていない

## 主な中間出力

- `research_batch_1.json` ～ `research_batch_3.json`：正本・監査対象の構造化個社調査
- `control_research_batch_1.json` ～ `control_research_batch_3.json`：類似採択対照の構造化個社調査
- `matched_accepted_pairs_web_corrected.csv`：申請公募回を監査した28対応ペア
- `matched_pair_score_comparison.csv`：8観点の対象・対照ペア比較
- `target_control_feature_comparison.csv`：0～3点コードの閾値別探索比較
- `policy_addon_and_external_commitment_audit.csv`：公式加点候補・外部コミットの公開確認
- `official_source_catalog.csv`：制度・公的データソース

スクリプトの0～3点コードは審査点ではない。公開情報の具体性と検証可能性を、同じ形式で比較するための探索符号である。
