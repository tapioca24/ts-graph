# Handoff: @tapioca24/ts-graph

## 次セッションの目的

[plan.md](./plan.md) の Phase 1–7 を実装済み。Phase 7 の PR は [#7](https://github.com/tapioca24/ts-graph/pull/7)（base: `feat/phase-6`）。3 OS の CI が成功した。ユーザーから依頼された次の作業へ進む。npm publish は別途明示的な依頼があるまで行わない。ユーザーが明示的に変更しない限り、同ファイルを仕様の正として扱うこと。

## 現在の状態

- Phase 2 は `feat/phase-1` から作成した branch `feat/phase-2` で実装。
- Phase 3 は `feat/phase-2` から作成した branch `feat/phase-3` で実装。
- Phase 4 は `feat/phase-3` から作成した branch `feat/phase-4` で実装。
- Phase 5 は `feat/phase-4` から作成した branch `feat/phase-5` で実装。
- Phase 6 は `feat/phase-5` から作成した branch `feat/phase-6` で実装。
- Phase 7 は `feat/phase-6` から作成した branch `feat/phase-7` で実装。PR の base は `feat/phase-6`。
- Phase 1 の package／開発ツール、typed error、logger、path normalization、CLI help／option validation を実装済み。
- 検証結果と実装判断は [phase-1.md](./phase-1.md) に記録済み。unit test 60 件、format、type-aware lint、typecheck、build、ビルド済み CLI の起動確認が成功。
- `node dist/main.mjs --help`／`--version` と通常の graph 生成が動作する。
- CLI の値は `parseOptions` が返す。`generateGraph` が Git revision 解決、解析、graph 選択、annotation 検証、描画を接続する。
- Phase 2 の Git diff specification、change parser、tree/index/working snapshot、cat-file batch reader を実装済み。判断と検証結果は [phase-2.md](./phase-2.md) を参照。
- Phase 3 の snapshot CompilerHost、tsconfig／references、AST 参照抽出、module resolution と snapshot graph を実装済み。判断と検証結果、内部 API は [phase-3.md](./phase-3.md) を参照。118 tests、format、type-aware lint、typecheck、build、CLI help／version が成功。
- Phase 4 の graph 差分統合、rename relation、双方向 BFS、exclude、無変更ノード上限と省略 summary を実装済み。内部 API と検証結果は [phase-4.md](./phase-4.md) を参照。143 tests、format、type-aware lint、typecheck、build、CLI help／version が成功。
- Phase 5 の Mermaid renderer、Macchiato theme、directory grouping、label escape、凡例と省略 summary を実装済み。内部 API と検証結果は [phase-5.md](./phase-5.md) を参照。164 tests、format、type-aware lint、typecheck、build、CLI help／version が成功。
- Phase 6 の annotation 検証、CLI 統合、atomic output、verbose timing、ビルド済み CLI の E2E を実装済み。193 tests が成功。判断、検証結果と完了条件の照合は [phase-6.md](./phase-6.md) を参照。
- Phase 7 の日英 README、MIT LICENSE、annotation JSON Schema、SHA 固定の 3 OS CI、pack smoke test、benchmark を実装済み。
- ローカルで 207 tests、format、type-aware lint、typecheck、build、tarball の 7 ファイル確認と導入済み CLI の help／version／解析が成功。
- benchmark は 10,000 source files／20 changed files の通常 workload で中央値 1.542 秒、最大 peak RSS 515.64 MiB。詳細は [benchmark.md](./benchmark.md)。単一の 10,000 file 循環は Compiler API の stack 上限に達する制約があり、再現 mode を残した。
- Phase 7 の判断と Section 14 の照合結果は [phase-7.md](./phase-7.md)。[CI run 34699013477](https://github.com/tapioca24/ts-graph/actions/runs/34699013477) で Linux の品質／pack と 3 OS integration の全 4 jobs が成功。
- npm publish は行っていない。

## 参照すべき成果物

- 全仕様、CLI 契約、architecture、実装 phase、test matrix、完了条件: [plan.md](./plan.md)
- 初期 README: [README.md](../README.md)

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
2. Phase 7 までの実装記録とPR の最新 CI 状態を確認し、依頼範囲の関連 test を同時に追加する。
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
