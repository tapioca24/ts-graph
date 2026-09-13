# Phase 6: Edge annotation と CLI 統合

## 作業計画

- 注釈の JSON 検証、正規化、重複・表示対象チェックを実装する。
- Git、解析、graph 選択、描画を接続し、atomic output と timing を追加する。
- ビルド済み CLI の E2E と unit test を追加し、品質チェックを実行する。
- 完了条件を照合し、引き継ぎを更新してコミット・PR を作成する。

## 実装判断と検証結果

- `parseAnnotations` は inline の object／array と file の array を共通 schema で検証する。未知・欠落フィールド、非文字列、空文字を拒否し、path は repository 相対 POSIX 形式へ正規化する。
- `validateEdgeLabels` は正規化後の重複と表示対象 edge の存在を検証する。不一致なら from／to の編集距離と辞書順で最大 3 件の有効候補を返す。rename relation は注釈対象外。
- `generateGraph` は comparison を finally で閉じる。警告、段階別 timing、件数は stderr、完成した生成物だけを stdout に出す。
- annotation file／output の相対パスは `--cwd`（既定は起動 directory）基準。tsconfig は既存 analyzer と同じ repository root 基準。注釈の from／to も repository root 基準。
- output は同じ directory にランダム名の一時ファイルを排他的に作成し、書き込み・close 後に rename する。失敗時は一時ファイルを掃除し、入力／解析エラーでは既存出力に触れない。
- E2E で不完全な tsconfig `{` が成功する既存問題を発見。`getParsedCommandLineOfConfigFile` の戻り値だけでは拾えない構文診断を、`parseConfigFileTextToJson` で取得するよう修正。extends 先も回帰テストを追加。
- Node.js v24.14.1、pnpm 10.33.0、macOS で 193 tests が成功。E2E の beforeAll で tsdown を実行し、毎回新しい `dist/main.mjs` を別プロセスで起動する。
- API は [Node.js 24 fs documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html) と Context7 の TypeScript 公式ソースで確認。Node.js の Context7 検索は適切な結果がなく、公式サイトで確認した。

## Section 14 完了条件の照合

| 条件                                          | Phase 6 時点の結果・根拠                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 全 option の help／README                     | help は既存 command test で確認。README 拡充は Phase 7                                                       |
| 全 diff mode と Git 状態の不変性              | E2E で 11 パターンを実行し、HEAD、branch、status、index の bytes、変更中 source の bytes を照合              |
| file／dependency／rename の差分               | E2E で added／deleted／modified、rename relation、依存追加・削除を確認                                       |
| Macchiato／凡例／grouping／LR                 | 既存 Mermaid test と CLI E2E が成功                                                                          |
| depth／max-nodes／exclude の決定性            | 既存 graph test、E2E の隠れた edge 注釈拒否と省略警告で確認                                                  |
| inline／file 注釈の安全性                     | unit と E2E で正規化、重複、存在、候補、HTML／Mermaid escape と strict を確認                                |
| references／paths／主要構文                   | 既存 TypeScript fixture test と複数 tsconfig E2E が成功                                                      |
| no-change／warning／終了コード                | E2E で 0／1／2、stdout purity、既存ファイルの保全を確認                                                      |
| format／lint／typecheck／test／build          | `pnpm check`（193 tests）と `pnpm build` が成功。build 後の `--help`／`--version`、`git diff --check` も成功 |
| 3 OS CI                                       | 未実施、Phase 7                                                                                              |
| pack からの起動                               | 未実施、Phase 7                                                                                              |
| README／日本語 README／LICENSE／Schema の同梱 | 未実施、Phase 7                                                                                              |
| npm publish なし                              | 実行していない                                                                                               |
