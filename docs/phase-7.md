# Phase 7: 配布準備とドキュメント

## 作業計画

- [x] 日英 README、MIT LICENSE、annotation JSON Schema を追加する。
- [x] tarball の内容と一時 project での CLI 動作を検証する。
- [x] SHA 固定の Actions で品質チェックと 3 OS integration test を構成する。
- [x] 10,000 source files／20 changed files の generator と性能計測を実装する。
- [x] 全品質チェック、pack、benchmark を実行し、完了条件と照合する。
- [x] 日本語コミットを作成し、`feat/phase-6` 向け PR と CI 結果を確認する。

PR: [#7](https://github.com/tapioca24/ts-graph/pull/7)（`feat/phase-7` → `feat/phase-6`）。実装 commit `5fb6391`、Windows テスト移植性修正 `ee13369`。

## 検証結果

Node.js v24.14.1、pnpm 10.33.0、Git 2.55.0、macOS arm64 で検証。

- `pnpm check`: format、type-aware lint、typecheck、10 test files／207 tests が成功。
- 配布 JSON Schema を Ajv 2020-12 で実際に compile／validate し、構造検証と runtime parser の整合性を確認。
  Ajv は devDependency のみで、runtime dependency は citty と TypeScript のまま。
- 日英 README と help の全 option 掲載を CLI 定義と照合するテストを追加。
- `--verbose` の blob／tsconfig／Program／依存解決内訳を追加し、stderr だけに出ることを既存 E2E で確認。
- benchmark は中央値 1.542 秒、最大 peak RSS 515.64 MiB。条件と内訳は [benchmark.md](./benchmark.md) を参照。
- npm publish は実行していない。
- `pnpm test:pack`: 7 ファイルの allowlist、導入された CLI の help／version／注釈付き解析、解析後の clean repository を確認して成功。最初の依存取得は sandbox 内の DNS 制限で失敗したため、ネットワーク許可後に再実行した。

## 実装判断と制約

- annotation file の JSON Schema は配列と厳密なフィールド構造を定義する。
  パス正規化・repository 外の拒否・重複・表示エッジの存在は引き続き runtime の責務。
- pack smoke は `prepack` による build、tarball の allowlist、tarball の一時 project への本番依存導入、
  導入された bin での help／version／注釈付き graph 生成を検証する。
- mise の standalone pnpm は JS ファイルではないため、`npm_execpath` の JS 版は Node で、
  native 版は直接起動する。shell は使わない。
- CI は Linux で品質と pack、3 OS で Git／TypeScript／CLI integration を実行する。
  既存の POSIX 特有の file name／symlink テストの Windows skip は維持する。
- 初回 Windows CI は絶対パスの separator だけの比較差異 2 件と、8 回 CLI を起動する注釈テストの 5 秒 timeout で失敗。
  絶対パスの比較を `path.normalize` で揃え、注釈 E2E だけを既存の複数起動 E2E と同じ 30 秒にした。
  path の内容、graph、終了コードなどの assertion とテスト件数は維持し、skip は追加していない。
- benchmark の 10,000 file 単一循環では Compiler API の call stack 上限に到達した。
  通常 workload は 100 file ごとの循環 module とし、失敗した topology も `chain` mode として再現可能に残した。
  README に制約を明記し、stack size 変更や `noResolve` による回避は行っていない。

## plan.md Section 14 との照合

| 完了条件                                         | 根拠／状態                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 全 CLI option の help／README 掲載               | distribution test で日英 README と CLI 定義を照合、成功                                                 |
| 全 diff mode と working tree／index／branch 不変 | CLI E2E と Git integration 成功                                                                         |
| 全 node status、rename、追加／削除依存           | CLI E2E、graph unit test、Mermaid parse 成功                                                            |
| Macchiato、凡例、grouping、LR                    | Mermaid unit／snapshot／parser test 成功                                                                |
| depth／max-nodes／exclude の決定性               | graph tests と benchmark の出力完全一致                                                                 |
| inline／file annotation の安全性                 | annotations、CLI E2E、JSON Schema tests 成功                                                            |
| references／paths／TS・JS syntax                 | TypeScript fixture tests 成功                                                                           |
| stdout／stderr／終了コード                       | CLI E2E と run tests 成功                                                                               |
| format／lint／typecheck／全 test／build          | `pnpm check` 成功、CLI E2E 内で build 成功                                                              |
| macOS／Linux／Windows CI                         | [CI run 34699013477](https://github.com/tapioca24/ts-graph/actions/runs/34699013477) の全 4 jobs が成功 |
| tarball から help と解析                         | `pnpm test:pack` 成功                                                                                   |
| README／日本語版／LICENSE／Schema の同梱         | tarball 内 7 ファイルの allowlist 照合で確認済み                                                        |
| npm publish 未実行                               | 実行していない                                                                                          |
