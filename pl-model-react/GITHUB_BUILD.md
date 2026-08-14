# GitHubでビルド済み成果物を取得する

`main` ブランチへ `pl-model-react` 関連の変更がpushされると、GitHub Actionsの
`Build PL Model React` ワークフローが自動でテストとビルドを実行します。

## ダウンロード方法

1. GitHubの `Actions` を開く。
2. `Build PL Model React` の最新の成功した実行を開く。
3. 画面下部の `Artifacts` から `pl-model-react-dist` をダウンロードする。
4. ZIPを展開し、`index.html` と `subsidy-program.js` を同じフォルダに置いて使う。

成果物は30日間保存されます。必要なときはActions画面の `Run workflow` から
手動でも再作成できます。

依存関係のインストールは `pl-model-react/package-lock.json` を基準にし、npmの
キャッシュを利用します。Tailwind CSSが使用する環境別のoptional依存も含めて
インストールします。
