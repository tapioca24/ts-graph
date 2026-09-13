# Phase 3: TypeScript dependency analyzer

## 作業計画

- [x] snapshot の同期読み取り層、tsconfig と references の再帰解析を実装する。
- [x] CompilerHost、AST 参照抽出、TypeScript module resolution と graph の union を実装する。
- [x] fixture と Git integration test で snapshot の分離、対応構文、設定、エラーを検証する。
- [x] 品質チェックと build を実行し、引き継ぎを更新する。

検証済みの変更を日本語コミットにまとめ、`feat/phase-3` から `feat/phase-2` 向け PR を作成する。

## 実装判断と内部 API

- `analyzeSnapshot(root, snapshot, configs?, warn?)` は `SnapshotGraph` を返す。`analyzeComparison(root, base, target, configs?, warn?)` は両側の graph を返し、指定 config が片側にしかない場合を許容、両側にない場合を実行時エラーにする。config は root 相対または絶対パス、既定は `tsconfig.json`。
- 同期 Compiler API の前段で snapshot の内容をメモリへ読み込む。repository 内の不足ファイルを現在の filesystem から補完しない。インストール済み node_modules は読み取り専用で参照し、workspace symlink の参照先が repository 内なら package.json を含めて snapshot を使う。
- `getParsedCommandLineOfConfigFile` で JSONC、extends、options を解析し、references を再帰的に辿る。参照循環、欠損 config／明示ソース、設定の構文・オプションエラーは `RuntimeError`。通常の型診断は要求しない。
- TypeScript の公開 Compiler API を使う。仮想ディレクトリの include／exclude は tsconfig の `*`、`?`、`**` を扱い、親ディレクトリ、隠しファイル、リテラルの角括弧、ディレクトリ除外について TypeScript 本体の探索結果と照合する。
- `resolveModuleName` と参照位置ごとの resolution mode を使い、NodeNext の import／require conditions、paths、baseUrl、package exports を尊重する。Program に入らない require 先も再帰解析する。
- static／type／side-effect import、re-export、文字列 dynamic import／require に加え、import-equals と import type expression を扱う。非リテラルと template literal は対象外。
- 各 project の内部 source を repository 相対 POSIX path で union。node／edge はソートし、同じ file pair と自己 edge を除去する。警告は callback に集約し、CompilerHost の write は拒否、trace は標準出力へ出さない。
- 全ファイルを先読みするため、大きな非ソース資産を含む repository のメモリ使用量は未計測。Phase 7 の benchmark で評価する。CLI への接続、変更ファイルが tsconfig 対象外の場合の警告は Phase 6。

## 検証結果

- Node.js `v24.14.1`、pnpm `10.33.0`、TypeScript `6.0.3`、macOS で検証。
- `pnpm check`: format、type-aware lint、typecheck、全 118 tests が成功。Phase 3 の追加分は 21 tests。
- `pnpm build`、`node dist/main.mjs --help`、`node dist/main.mjs --version` が成功。
- fixture で対応構文、循環依存、重複排除、project union、JS／JSON、extends、内部／外部 package、型エラー継続、未解決警告、異常設定を検証。
- 実際の Git repository で tree／index／working の異なる tsconfig を解析し、依存先の違いと、index bytes／HEAD／branch／status／作業中 config が実行後も同一であることを確認。
- 最初の fixture で NodeNext の dynamic import の拡張子要件と、同名別拡張子の優先順位を誤って期待していたため失敗。拡張子明示と独立したファイル名で検証目的を明確化して修正した。

## Section 14 完了条件との照合

project references／paths／主要 module syntax と、現時点の品質チェック・build を確認済み。製品全体の完了チェックは後続 Phase 4–7 の統合を含むため未完了のまま維持する。

CLI help は動作するが README の全 option 記載、全 diff mode の Mermaid 生成、変更状態・テーマ・探索・annotation、統合 CLI の出力／終了コード、3 OS CI、pack smoke test、配布ファイルは未完了。Linux／Windows、性能目標は未検証。npm publish は行っていない。

## 確認した公式資料

- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API): custom CompilerHost、Program、module resolution。
- インストール済み `typescript/lib/typescript.d.ts`: config parser、resolution mode、implied node format の公開 API。
