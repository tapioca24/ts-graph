# Phase 2: Git diff specification と snapshot

作業ブランチ: `feat/phase-2`。PR の base: `feat/phase-1`。

## 作業計画

- [x] Git process、diff specification、revision 解決を実装する。
- [x] NUL 区切りの変更情報と rename relation を実装する。
- [x] tree／index／working tree の読み取りと cat-file lifecycle を実装する。
- [x] 一時 Git repository で全比較モード、異常系、読み取り専用性を検証する。
- [x] 品質チェック、handoff 更新を行う。

検証済みの変更を日本語コミットにまとめ、`feat/phase-1` 向けに PR を作成する。

## 検証結果と実装判断

- Node.js `v24.14.1`、pnpm `10.33.0`、Git `2.55.0`、macOS で検証。
- `pnpm check`（format、type-aware lint、typecheck、97 tests）、`pnpm build`、ビルド済み CLI の `--version` が成功。Linux／Windows での実測は未実施。
- `openComparison(cwd, input, warn)` が repository root、解決済み specification、base/target reader、changes、`close()` を返す。利用側は必ず `finally` で `close()` を呼ぶ。
- `SnapshotReader.listFiles()` はソート済みの固定リスト、`readFile()` は非同期の Buffer 読み取り。tree/index は列挙時の object ID を保持し、working は読み取り時点の filesystem を参照する。Phase 3 の同期 CompilerHost では必要な snapshot 内容を先に読み込む設計が必要。
- batch process は比較ごとに 1 つ共有し、並行要求を直列化する。バイナリ、空 blob、2 MiB blob、起動失敗、欠損 object、非 blob、壊れた応答、途中 EOF、読み取り途中の close、二重 close を検証。
- revision、tag、tree、parent、merge base、特殊 target、untracked、rename、copy、mode change、submodule、conflict、空差分を検証。復元した untracked が base と同じ内容・mode なら変更から除外する。
- dirty な working tree、index のバイト列、HEAD、branch、status が実行前後で同一であることを検証。
- Git の外部 diff、textconv、clean/process filter、fsmonitor をプロセス内で無効化する。optional lock と partial clone の lazy fetch も無効化する。対象 repository の設定は変更しない。
- Git 出力のパスには POSIX separator が保証されるため、CLI 向けの `normalizeRepoPath` を適用せず、POSIX 上のリテラルなバックスラッシュを保存する。Windows 上ではドライブ指定・バックスラッシュを含む Git パスを拒否する。
- symlink と submodule は内容を追跡せず、ソース拡張子なら warning callback へ通知する。LFS pointer も解析対象から外して警告する。working file の repository 外への symlink 解決を拒否する。
- macOS の一時ディレクトリには `/var` と `/private/var` の別名があるため、fixture は `realpath` で統一する。

## Section 14 完了条件との照合

Phase 2 は Git 基盤までが対象。Mermaid 生成、TypeScript 解析、annotation、配布物・README・3 OS CI・pack smoke test は Phase 3–7 に残るため、Section 14 の製品全体のチェックは未完了のまま維持する。CLI help は Phase 1 のまま動作し、通常実行は後続 phase の統合待ち。npm publish は行っていない。

## 確認した公式資料

- [Git rev-parse](https://git-scm.com/docs/git-rev-parse): `--verify --end-of-options` と object type の検証。
- [Git ls-files](https://git-scm.com/docs/git-ls-files): stage と NUL 区切りの列挙。
- [Git cat-file](https://git-scm.com/docs/git-cat-file): batch protocol。
- [Node.js child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html): shell 非依存の spawn、error/close lifecycle。
