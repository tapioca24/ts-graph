# Phase 1 作業計画

仕様の正は [plan.md](./plan.md)。作業ブランチは `feat/phase-1`。

- [x] 現行の公式 API とツール構成を確認する。
- [x] package、ビルド、テスト、型検査、lint、format を構成する。
- [x] CLI help・入力検証の契約テストを先に追加する。
- [x] typed error、stderr logger、パス正規化、CLI を実装する。
- [x] 品質チェック、ビルド、CLI 起動を検証し、引き継ぎを更新する。

Phase 2 以降の Git 解析・グラフ生成は今回の対象外。未実装の解析を成功として返さない。

## 検証結果

- 実装前のテスト実行は、実装モジュールが存在しないため失敗することを確認した。
- 実装後は unit test 60 件、format、Oxlint type-aware、typecheck、build が成功した。
- ビルドした CLI を子プロセスとして起動し、help／version は終了コード 0、不正入力は 2、未実装の通常実行は 1 と確認した。エラー時の stdout は空。
- 実測環境: macOS、Node.js 24.14.1、pnpm 10.33.0。Windows パスはホスト非依存の unit test で確認したが、Windows／Linux 実機では未検証。
- Section 14 の製品全体の完了条件は未達。Git 解析、Mermaid、annotation、3 OS CI、配布 smoke test、公開ドキュメントは後続 phase の対象。

## 実装上の判断

- Citty 0.2.2 の `parseArgs` は繰り返し値を保持しないため、Citty の定義から `node:util.parseArgs` の設定を生成する。help と検証のオプション名・既定値は共通の定義を参照する。
- repeatable 以外のオプション重複は入力エラー。tsconfig の同一文字列は重複を除去する。実パスへの解決は後続 phase で行う。
- JSON annotation は文字列として保持し、schema／ファイル読み取り／エッジの存在検証は Phase 6 で行う。
- パス関数は字句上の正規化を行う。symlink 越しの repository 外アクセス防止は snapshot reader 側の責務。

## 参照した公式資料

- [Citty](https://github.com/unjs/citty)
- [Node.js parseArgs](https://nodejs.org/api/util.html#utilparseargsconfig)
- [tsdown dependencies](https://tsdown.dev/options/dependencies)
- [Vitest configuration](https://vitest.dev/config/)
- [Oxlint type-aware](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)
