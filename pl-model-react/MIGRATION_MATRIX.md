# BLUEPRINT → React 完全移行マトリクス

`done` は、ドメインテストまたはUIテスト、ビルド、1280px実ブラウザ確認のいずれか適切な証跡を持つ機能です。

| ID | 機能 | 状態 | 主な証跡 |
|---|---|---|---|
| DEF-01 | 区間定義の追加・削除・名称・順序 | done | `definition-page.test.tsx`、制度JS round-trip |
| DEF-02 | 特別年の追加・削除・期間開始/終了/過去実績＋調整年 | done | `definition-page.test.tsx`、`timeline.test.ts` |
| DEF-03 | 制度JSの読込・上書き・名前を付けて保存 | done | `program-file.test.ts`、File System Access API fallback |
| DEF-04 | 共通数値定義の追加・編集・削除・依存検証 | done | `definition-graph.test.ts`、`formula-engine.test.ts` |
| DEF-05 | 経営指標の追加・編集・削除・使用切替 | done | `definition-page.test.tsx` |
| DEF-06 | 任意個数A–Z時点・相対年・期間種別自動判定 | done | `definition-page.test.tsx`、`metrics.test.ts` |
| DEF-07 | 制度JSONの直接編集・検証・適用 | done | `definition-page.test.tsx` |
| ACT-01 | 過去実績を固定区間として開始・終了年編集、後続期間連動 | done | `actuals-page.test.tsx`、`timeline.test.ts` |
| ACT-02 | 全社B/S・ベースP/L・補助P/Lの同時3期入力 | done | `actuals-page.test.tsx` |
| ACT-03 | 自動計算行の個別省略、統一列幅・決算期呼称 | done | `actuals-page.test.tsx` |
| ACT-04 | 特別年の呼称・基準・解決年の個社画面表示とP/L年度見出し注入 | done | `actuals-page.test.tsx`、1280px実画面 |
| ACT-05 | B/S 1-25 EBITDA有利子負債倍率 | done | `actuals-page.test.tsx` |
| FCT-01 | 全調整水準を期間別に表示、値・最小・最大を同時編集 | done | `forecast-page.test.tsx`、1280px実画面 |
| FCT-02 | 期間分割・解除、設定列・全チャート境界線同期 | done | `forecast-page.test.tsx`、実ブラウザ操作 |
| FCT-03 | 複利成長・線形pt変化 | done | `forecast-engine.test.ts` |
| FCT-04 | 開始時増減・毎年固定・単年以降・当年のみ・成長加速度 | done | `forecast-engine.test.ts`、`forecast-page.test.tsx` |
| FCT-05 | 水準からベース/補助P/L生成と全社合算、前年比指標 | done | `financials.test.ts`、`forecast-engine.test.ts` |
| FCT-06 | チャート/PL表/事業比較の表示切替 | done | `forecast-page.test.tsx` |
| FCT-07 | 将来PLの入力行・計算行の直接編集と水準逆算 | done | `forecast-page.test.tsx`、実ブラウザ操作 |
| FCT-08 | チャート点のキーボード/ポインタ操作、ドラッグ中更新、一括Undo | done | `forecast-page.test.tsx`、実ブラウザ操作 |
| FCT-09 | 0基準・負値・段階的な読みやすい上限・超過時拡張・復帰時縮小 | done | `chart-scale.test.ts` |
| FCT-10 | 売上利益、前年比、収益性、原価、販管費、人件費、利益以下、FTE、給与、生産性の詳細10チャート | done | `forecast-page.test.tsx` |
| FCT-11 | 全社/ベース/補助の売上・利益・FTE・給与・利益率・生産性比較 | done | `forecast-page.test.tsx` |
| MET-01 | 指標一覧のコンパクト表示と一括編集 | done | `forecast-page.test.tsx` |
| MET-02 | 可変/固定参照のバレット表現、未達/達成の色表現 | done | `forecast-page.test.tsx` |
| MET-03 | 固定参照指標の実績入力 | done | `metrics.test.ts`、`model-store.test.ts` |
| MET-04 | company/base/subsidy対象範囲と相対時点評価 | done | `metrics.test.ts` |
| OPT-01 | 複数目標から非破壊の水準変更案を作成 | done | `optimization.test.ts` |
| OPT-02 | 変化方向・勢いと適用率0–100%、Undo | done | `forecast-page.test.tsx`、`model-store.test.ts` |
| LOG-01 | 共通数値定義の依存順・循環/未定義検証 | done | `logic-page.test.tsx`、`definition-graph.test.ts` |
| LOG-02 | P/L順一覧と参照項目・設定値・全下流影響先 | done | `logic-page.test.tsx`、`pl-logic.ts` |
| HIS-01 | 編集・分割・ドラッグ・最適化を含むUndo/RedoとCtrl+Z/Y | done | `model-store.test.ts`、`forecast-page.test.tsx` |
| IO-01 | 案件JSONの読込・上書き・別名保存・全状態round-trip | done | `model-file.test.ts` |
| IO-02 | 単一HTML＋同階層の外部制度JS | done | Vite single-file build、`program-file.test.ts` |
| IO-03 | 0区間・重複ID・区間/特別年の参照切れを制度読込時に拒否 | done | `program-file.test.ts`、`program-editor.test.ts` |
| QA-01 | BLUEPRINT主要機能の受入スイート | done | 17ファイル・78テスト |
| QA-02 | 1280px実画面・横溢れ・主要操作・console確認 | done | document幅1265/viewport1280、console error 0 |

## 設計境界

- `domain/program` 相当: 制度定義、スキーマ、相対時点、外部JS。企業データを持たない。
- `domain/forecast`: 期間、ドライバー、効果レイヤー、P/L生成、逆算。Reactに依存しない。
- `domain/metrics`: 数値定義、指標式、時点解決、判定。文字列式は専用パーサーで評価し `eval` を使わない。
- `domain/optimization`: 現在モデルと提案モデルの差分、適用率補間。
- `store`: Zustandの単一モデルストア、コマンド単位履歴、内部金額は円。
- `features`: ドメインAPIを利用し、会計計算や式評価をコンポーネントへ置かない。

## TDD運用

1. 期待動作を表す失敗テストを追加（Red）。
2. 最小のドメイン/UI実装で通す（Green）。
3. 型・定義表・純粋関数へ重複を集約（Refactor）。
4. 全テスト、TypeScript build、実ブラウザの順で確認する。
