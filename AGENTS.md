# Repository Guidelines

## プロジェクト構成

ts-graph は Git 差分周辺の TypeScript 依存関係を Mermaid で可視化する ESM CLI です。

- `src/cli/`: 引数解析、CLI 起動、出力処理。
- `src/application/`: グラフ生成フローの統合。
- `src/git/`・`src/typescript/`: Git snapshot の取得と依存解析。
- `src/graph/`・`src/mermaid/`・`src/annotations/`: 差分統合、表示範囲選択、描画、注釈検証。
- `tests/`: テスト本体。描画 snapshot は `tests/__snapshots__/`。
- `schemas/`: 注釈用 JSON Schema。`scripts/`: 配布検証とベンチマーク。
- `docs/`: 設計・実装記録。`dist/`: ビルド生成物。

## 開発・検証コマンド

Node.js 24 以上と PATH 上の Git が必要です。パッケージ管理には `pnpm` を使用します。

- `pnpm install --frozen-lockfile`: lockfile に従って依存を導入。
- `pnpm build`: tsdown で `dist/main.mjs` を生成。
- `node dist/main.mjs . --format markdown`: ビルドした CLI で作業ツリーと HEAD を比較。
- `pnpm check`: 整形確認、lint、型検査、全テストを順に実行。
- `pnpm test:integration`: Git・TypeScript・CLI の統合テスト。
- `pnpm test:pack`: 配布 tarball のスモークテスト。
- `pnpm format`: oxfmt で整形。`pnpm lint`・`pnpm typecheck` で個別検証。

## コーディング規約

TypeScript の strict 設定を維持し、型専用 import は `import type` を使用します。
既存コードに合わせ、インデントは 2 スペース、文字列はダブルクォート、文末はセミコロンとします。
oxfmt の行幅設定は 100 です。oxlint は型情報を利用し、警告も失敗として扱います。
未処理の Promise を残さないでください。

ファイル名は `diff-spec.ts` のような kebab-case、関数・変数は camelCase、型は PascalCase にします。
CLI、Git アクセス、解析、描画の責務を各モジュールに保ってください。

## テスト方針

Vitest を Node 環境で使用します。テストは `tests/**/*.test.ts` に配置し、
個別実行には `pnpm exec vitest run tests/graph.test.ts` を使います。
不具合修正には再現ケースを追加し、描画変更時は snapshot 差分を確認してください。
数値のカバレッジ閾値は未設定です。Git・パス・CLI の変更では macOS、Linux、Windows の互換性を確認します。

## コミット・Pull Request

履歴に合わせ、`feat(graph): 差分グラフの選択処理を改善` のように
`type(scope): 日本語の説明` を使用します。scope は必要に応じて省略できます。

PR には変更理由、変更後の挙動、検証コマンドと結果、関連 issue があればその参照を記載してください。
CLI や描画の変更には実行例や出力例を添え、利用方法が変わる場合は `README.md` と `README.ja.md` を更新します。
提出前に `pnpm check` と `pnpm test:pack` を確認してください。

## エージェント向け指示

回答は日本語で行います。プランやタスクリストを作成する場合は `.md` に保存し、`mo <path>` で開きます。
解析対象の branch、index、ソースを書き換えない設計を維持してください。
既存のユーザー変更を保護し、失敗した検証や未確認事項は隠さず報告します。
