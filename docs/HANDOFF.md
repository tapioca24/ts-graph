# Handoff: @tapioca24/ts-graph

## 次セッションの目的

[plan.md](./plan.md) に従い、`@tapioca24/ts-graph` の実装と検証を開始する。ユーザーが明示的に変更しない限り、同ファイルを仕様の正として扱うこと。

## 現在の状態

- branch は `main`。既存履歴は初期 commit のみ。
- 元から存在したファイルは、見出しだけの `README.md`。
- ユーザーとの `grilling` を完了し、合意結果を `plan.md` に記録済み。
- `plan.md` は `mo` で開いてある。
- ソースコード、package 構成、依存関係、テスト、CI はまだ未実装。
- 現在の未追跡ファイルは `plan.md` と、この `HANDOFF.md`。
- npm publish や Git commit は行っていない。

## 参照すべき成果物

- 全仕様、CLI 契約、architecture、実装 phase、test matrix、完了条件: [plan.md](./plan.md)
- 初期 README: [README.md](./README.md)

仕様を handoff 内へ再掲しないこと。特に実装前に `plan.md` の次を読むこと。

- Sections 3–4: MVP scope と CLI semantics
- Sections 5–8: TypeScript／Git snapshot／graph／Mermaid の仕様
- Sections 9–10: module boundaries と technology stack
- Sections 11–14: 実装順、test strategy、完了条件
- Section 15: 既知の risk と対策

## 作業上の重要な指示

- ユーザーへの応答は常に日本語で行う。
- Node.js project では `npm`／`npx` より `pnpm`／`pnpm dlx` を優先する。
- Git commit を依頼された場合、commit message は日本語にする。
- 新たな plan／task list を作る場合は Markdown file に書き、`mo <file>` で開く。
- 問題、失敗、test failure を隠す workaround は行わず、状況を正直に報告する。
- worktree の既存変更はユーザーのものとして保全する。特に `plan.md` を不用意に置換しない。
- file edit には `apply_patch` を使う。

## 実装開始時の進め方

1. `plan.md` を最初から最後まで読む。
2. Phase 1 から順に進め、各 phase で関連 test を同時に追加する。
3. 現在の Node.js 24／pnpm 環境を確認してから scaffold する。
4. library API の詳細は記憶に頼らず、現行の公式 documentation で確認する。
5. Git snapshot 実装では branch、working tree、index を変更しないことを integration test で継続的に確認する。
6. stdout purity、deterministic Mermaid、Windows path を後回しにせず、domain boundary の時点で設計へ織り込む。
7. 完了時は `plan.md` Section 14 の全項目を実測結果とともに照合する。

## 既知の調査結果

- TypeScript 7 は stable だが、今回必要な stable programmatic API がないため TypeScript `^6.0.3` を利用する判断で合意済み。
- Node.js minimum はユーザー指定により `>=24`。
- ローカル確認時の環境は Node.js `v24.14.1`、pnpm `10.33.0`、Git `2.55.0`。
- Catppuccin Macchiato の正確な色値、Node.js `path.matchesGlob`、参照 project は `plan.md` Section 8、10、16 に記載済み。
- npm package 名の publish 可否は実際の publish 時に registry で再確認すること。今回 publish はしない。

## 未解決事項

プロダクト仕様上の未解決事項はない。実装中に `plan.md` と両立しない制約が判明した場合は、仕様を黙って変更せず、根拠・選択肢・推奨案をユーザーへ提示して判断を仰ぐこと。

## Suggested skills

- `find-docs`: TypeScript Compiler API、citty、tsdown、Vitest、Oxlint／Oxfmt の現行 API や設定を確認するときに使用する。
- `tdd`: Git snapshot、dependency graph、Mermaid renderer を test-first の red-green-refactor で実装する場合に使用する。
- `difit`: 実装差分がまとまった後、ユーザーが difit review を希望した場合に使用する。
- `git-commit`: ユーザーから commit を明示的に依頼された場合だけ使用する。
