# @tapioca24/ts-graph 実装計画

## 1. 目的

TypeScript プロジェクトの任意の Git 差分を起点として、変更ファイルとその周辺のファイル依存関係を 1 枚の Mermaid flowchart に可視化するローカル CLI を実装する。

- npm パッケージ名: `@tapioca24/ts-graph`
- CLI コマンド名: `ts-graph`
- 初期バージョン: `0.1.0`
- ライセンス: MIT
- 今回の完了地点: 実装、ドキュメント、テスト、ビルド、pack 後の動作確認
- npm への publish 自体は行わない

## 2. 設計原則

1. ユーザーの working tree、index、現在の branch を変更しない。
2. TypeScript 自身の module resolution を使い、`paths`、`baseUrl`、package exports、project references を尊重する。
3. 標準出力には生成物だけを出し、警告・診断情報は標準エラーへ分離する。
4. 色だけに依存せず、凡例でも変更状態を伝える。
5. 出力順、ノード ID、探索、切り詰めを決定的にし、同じ入力から同じ Mermaid を生成する。
6. 対象リポジトリのコードや設定を実行せず、読み取り専用で解析する。
7. 参照プロジェクトのコードはコピーせず、公開仕様と出力例を参考に独自実装する。

## 3. スコープ

### 3.1 MVP に含めるもの

- commit、branch、tag、working tree、index を組み合わせた差分指定
- merge base を基準にした比較
- 追加・削除・変更・リネームされたファイルの可視化
- base と target の依存グラフをマージした単一 Mermaid
- 変更ファイルを起点とした依存先・依存元の探索
- tsconfig の project references と、明示された複数 tsconfig
- ファイル／エッジの差分ステータス表示
- 任意の依存エッジへのプレーンテキスト注釈
- Mermaid 本体または Markdown の標準出力／ファイル出力
- macOS、Linux、Windows 対応
- npm 公開可能な package metadata と tarball smoke test

### 3.2 MVP に含めないもの

- GitHub Actions や GitHub PR URL からの取得
- unified diff の stdin 入力
- `git fetch` などの自動ネットワークアクセス
- SVG／PNG のレンダリング、Web UI、ブラウザ起動
- `.vue`、`.svelte`、MDX、Astro など追加コンパイラが必要な形式
- watch mode、コードメトリクス、依存ルール違反検査
- `.ts-graphrc` などの設定ファイル
- npm から利用する公開ライブラリ API
- publish workflow、provenance、Changesets、semantic-release
- 対象プロジェクトが利用している TypeScript の動的ロード

## 4. CLI 仕様

### 4.1 基本構文

```text
ts-graph [target] [compare-with] [options]
```

位置引数の順序は difit と合わせる。`target` が新しい側、`compare-with` が基準側である。

| 入力 | base | target |
| --- | --- | --- |
| `ts-graph` | `HEAD^` | `HEAD` |
| `ts-graph <target>` | `<target>^` | `<target>` |
| `ts-graph <target> <compare-with>` | `<compare-with>` | `<target>` |
| `ts-graph @ main` | `main` | `HEAD` |
| `ts-graph .` | `HEAD` | working tree（staged + unstaged） |
| `ts-graph . main` | `main` | working tree |
| `ts-graph staged` | `HEAD` | index |
| `ts-graph working` | index | working tree |

- `@` は `HEAD` の alias とする。
- `--merge-base` は revision 同士の比較だけで利用でき、base を `merge-base(target, compare-with)` に置き換える。
- `--include-untracked` は `.` または `working` でだけ利用できる。
- `staged` と `working` では第 2 位置引数を受け付けない。
- revision や merge base がローカルに存在しなければ、fetch の例を添えて入力／実行エラーにする。自動 fetch はしない。

### 4.2 オプション

| オプション | 既定値 | 役割 |
| --- | --- | --- |
| `--merge-base` | `false` | merge base を比較基準にする |
| `--include-untracked` | `false` | working tree 比較に untracked file を含める |
| `--cwd <path>` | `process.cwd()` | 対象リポジトリ内の開始ディレクトリ |
| `--tsconfig <path>` | repository root の `tsconfig.json` | 使用する tsconfig。繰り返し可能 |
| `--depth <n\|all>` | `1` | 変更ファイルから双方向に辿る距離 |
| `--max-nodes <n\|all>` | `50` | 無変更の関連ノード数を制限 |
| `--exclude <glob>` | なし | repository root 相対の除外 glob。繰り返し可能 |
| `--direction <LR\|RL\|TB\|BT>` | `LR` | Mermaid flowchart の方向 |
| `--no-group-directories` | grouping 有効 | directory subgraph を無効化 |
| `--no-legend` | legend 有効 | ステータス凡例を無効化 |
| `--edge-label <json>` | なし | エッジ注釈の JSON object／array。繰り返し可能 |
| `--edge-label-file <path>` | なし | エッジ注釈配列を読む JSON ファイル |
| `--format <mermaid\|markdown>` | `mermaid` | 出力形式 |
| `-o, --output <path>` | 標準出力 | 出力先ファイル |
| `--verbose` | `false` | 診断情報と所要時間を標準エラーへ出力 |
| `--help` | - | help を表示 |
| `--version` | - | package version を表示 |

数値オプションは負数、非整数、ゼロが不適切な箇所を入力エラーにする。`--depth 0` は変更ノードだけを表示する有効値とする。

### 4.3 エッジ注釈

inline とファイルの両方で同じ厳密な schema を使う。

```json
[
  {
    "from": "src/a.ts",
    "to": "src/b.ts",
    "label": "ユーザー情報を取得"
  }
]
```

- `from` は import する側、`to` は import される側。
- パスは repository root 相対の POSIX 形式へ正規化する。
- object の配列を標準形とし、inline に限り単一 object も受け付ける。
- 必須フィールド不足、未知フィールド、空ラベル、同じエッジへの重複注釈を入力エラーにする。
- 表示対象に存在しないエッジなら、近い有効候補を含む入力エラーを返す。
- 注釈はプレーンテキストとして HTML／Mermaid 用に escape する。
- 改行は安全な `<br/>` 表示へ変換し、Mermaid の `securityLevel` は `strict` にする。
- 注釈ファイル用 JSON Schema を package に同梱する。

### 4.4 標準出力と終了コード

- 標準出力には Mermaid または Markdown だけを出す。
- 警告、進捗、verbose 情報は標準エラーへ出す。
- `--output` は一時ファイルからの rename で可能な限り atomic に書き換える。
- 対象となる変更がない場合も終了コード `0` とし、`No TypeScript changes` ノードを持つ有効な Mermaid を出す。
- TypeScript ファイルの変更があるのに tsconfig の対象外なら、標準エラーへ警告する。

| 終了コード | 意味 |
| --- | --- |
| `0` | 正常終了。対象なしを含む |
| `1` | Git、filesystem、tsconfig などの実行時エラー |
| `2` | CLI option、annotation などの入力エラー |

## 5. 依存解析仕様

### 5.1 対象ファイル

- 常に対象: `.ts`、`.tsx`、`.mts`、`.cts`、`.d.ts`
- `allowJs` 有効時: `.js`、`.jsx`、`.mjs`、`.cjs`
- `resolveJsonModule` 有効時: import された `.json`
- 常に対象外: `node_modules` 内のファイル、TypeScript 標準ライブラリ
- `test`、`stories` などの暗黙除外は行わない。

### 5.2 対象となる参照

- `import ... from "..."`
- `import type ... from "..."`
- side-effect import
- `export ... from "..."` と `export * from "..."`
- 文字列リテラルを使った `import("...")`
- 文字列リテラルを使った `require("...")`
- tsconfig の `paths`、`baseUrl` と Node.js package resolution で解決された内部ファイル

同じファイル対に複数の参照がある場合、表示エッジは 1 本に集約する。自己参照エッジは除外する。型のみの依存も含める。

### 5.3 tsconfig

- `--tsconfig` 未指定時は repository root の `tsconfig.json` を使う。
- 指定パスは繰り返し可能で、重複を除去する。
- 各 tsconfig の `references` を再帰的に辿る。
- 同じファイルが複数 project に含まれる場合は repository-relative path で 1 ノードに統合し、解決した依存を union する。
- 各 snapshot でその時点の tsconfig 内容を読む。
- 指定 tsconfig が片側だけに存在する場合は存在する側を解析し、両側に存在しない場合はエラーにする。
- 現在インストール済みの `node_modules` は、tsconfig の `extends` と module resolution のために読み取り専用で参照する。
- 通常の型エラーでは失敗させない。
- 解決できない import は警告し、そのエッジだけを除外する。
- tsconfig の構文エラーや project を構築できない状態は実行時エラーにする。

## 6. Git snapshot と差分モデル

### 6.1 Snapshot 実装

working tree や branch を切り替えず、snapshot ごとの読み取り interface を実装する。

```text
SnapshotReader
├── GitTreeSnapshot      commit / tag / branch / tree
├── IndexSnapshot        staged index
└── WorkingTreeSnapshot  current filesystem + optional untracked files
```

- Git tree の列挙には NUL 区切りの `git ls-tree` を使う。
- blob の読み取りには常駐する `git cat-file --batch` process を使い、起動回数を抑える。
- index は stage 0 の entry を対象にし、conflict 中の複数 stage は明示的なエラーにする。
- working tree は filesystem を読み、`--include-untracked` 指定時だけ Git 管理外ファイルを追加する。
- Git コマンドは shell を介さず、引数配列で起動する。
- Windows の separator／drive letter 差を内部境界で正規化する。
- Git LFS pointer や submodule の内容取得は MVP 対象外とし、解析不能な TypeScript file なら警告する。

### 6.2 差分取得

- `git diff --name-status -z -M` 相当の情報から status を構築する。
- `A` は added、`D` は deleted、`M`／type change は modified とする。
- rename は Git の標準 similarity 判定を利用する。
- copy detection は有効化せず、copy 先は added として扱う。
- rename は旧パスを deleted、新パスを added として保持し、両者を rename relation で結ぶ。
- mode だけの変更も Git が modified と報告した場合は modified として表示する。

## 7. グラフモデルと抽出

### 7.1 Snapshot graph

base と target それぞれで次の中間モデルを作る。

```ts
type FileNode = {
  path: string;
};

type DependencyEdge = {
  from: string;
  to: string;
};
```

依存エッジは `from` が import 元、`to` が import 先となる。

### 7.2 統合 graph

base／target の node と edge を集合比較し、状態を付与する。

| 要素 | 状態 |
| --- | --- |
| node | `unchanged`、`added`、`modified`、`deleted` |
| dependency edge | `unchanged`、`added`、`deleted` |
| relation | `renamed` |

- modified node の依存は base／target の両方を保持する。
- base にだけある edge は deleted、target にだけある edge は added とする。
- rename relation は dependency edge と別種として扱う。

### 7.3 関連 graph の抽出

- 変更 node を seed にする。
- dependency edge の向きを無視した隣接 graph 上で BFS し、依存先と依存元の両方向を辿る。
- `depth=1` は直接の依存先・依存元まで、`depth=0` は変更 node だけ、`all` は到達可能範囲すべてとする。
- 表示 node が決まった後、その node 間に存在するすべての dependency edge を含める。
- `--exclude` は変更 node と関連 node の双方へ適用し、除外 node を越えて探索しない。
- glob matching は Node.js 24 で stable な `node:path.matchesGlob` を使う。
- 変更 node は `--max-nodes` の上限外として必ず表示する。
- 無変更 node は、変更 node からの距離、path の辞書順で決定的に採用する。
- 省略が生じた場合は `… N related files omitted` node を追加し、標準エラーにも警告する。

## 8. Mermaid 出力

### 8.1 レイアウト

- `flowchart LR` を既定とする。
- directory hierarchy を `subgraph` で表現する。
- 全表示 node に共通する無意味な先頭 directory は畳む。
- directory grouping は `--no-group-directories` で無効化できる。
- node ID は path そのものではなく、安定した衝突耐性のある ID に変換する。
- node label は basename、フラット表示時は repository-relative path とする。
- node、directory、edge は決定的な順序で出力する。
- cycle を許容し、topological sort は要求しない。

### 8.2 Catppuccin Macchiato

Mermaid の init directive と `classDef`／`linkStyle` で図全体を固定テーマ化する。

| 用途 | palette | hex |
| --- | --- | --- |
| canvas | Base | `#24273a` |
| standard node | Surface 0 | `#363a4f` |
| standard text | Text | `#cad3f5` |
| border／subtle edge | Overlay 0 | `#6e738d` |
| added node／edge | Green | `#a6da95` |
| deleted node／edge | Red | `#ed8796` |
| modified node | Peach | `#f5a97f` |
| rename relation | Mauve | `#c6a0f6` |
| text on accent | Base | `#24273a` |

- unchanged dependency: 通常の実線
- added dependency: Green の実線
- deleted dependency: Red の破線
- rename relation: Mauve の点線、固定ラベル `renamed`
- deleted node は Red 背景に加えて破線 border を使う。
- Added／Modified／Deleted の小さな凡例を既定で表示する。
- `--no-legend` で凡例を非表示にできる。

### 8.3 出力形式

- `mermaid`: init directive と flowchart 本体
- `markdown`: `mermaid` fenced code block に本体を格納
- Mermaid renderer は同梱しない。
- test dependency の Mermaid parser で代表的な出力を parse し、構文妥当性を確認する。

## 9. モジュール構成案

```text
src/
├── cli/
│   ├── command.ts            CLI 定義、help、option parsing
│   └── main.ts               shebang、終了コード、stdout/stderr
├── application/
│   └── generate-graph.ts     use case の orchestration
├── git/
│   ├── client.ts             shell 非依存の Git process 実行
│   ├── diff-spec.ts          位置引数と special target の解決
│   ├── changes.ts            name-status と rename の解釈
│   ├── cat-file.ts           batch blob reader
│   └── snapshots.ts          tree/index/working SnapshotReader
├── typescript/
│   ├── config.ts             tsconfig と references の解決
│   ├── compiler-host.ts      snapshot 対応 CompilerHost
│   ├── imports.ts            AST から module specifier を収集
│   └── dependencies.ts       module resolution と snapshot graph
├── graph/
│   ├── model.ts              node/edge/relation の domain model
│   ├── merge.ts              base/target の status 付与
│   └── select.ts             BFS、exclude、node limit
├── mermaid/
│   ├── escape.ts             label/path の安全な変換
│   ├── theme.ts              Macchiato palette
│   └── render.ts             directory tree と Mermaid 生成
├── annotations/
│   ├── schema.ts             runtime validation
│   └── edge-labels.ts        merge、重複／存在チェック
└── errors.ts                 exit code へ写像できる typed errors
```

公開ライブラリ API は設けないが、内部 module は pure function と明示的な interface を中心にし、Git process／filesystem を test double に置換できる構造にする。

## 10. 技術スタック

### 10.1 Runtime

- Node.js `>=24`
- ESM only
- TypeScript `^6.0.3`
  - TypeScript 7 は native compiler へ移行済みだが、現時点で安定した programmatic API がないため採用しない。
- `citty`: CLI 定義
- Git 実行: `node:child_process` を薄く wrap し、shell は使わない。
- glob: `node:path.matchesGlob`
- runtime schema: 小さな厳密 type guard を実装し、annotation 専用依存を増やさない。

### 10.2 Build／quality

- package manager: pnpm 10 系。`packageManager` field で利用版を固定
- bundle: `tsdown`
- test: Vitest stable
- lint: Oxlint type-aware
- format: Oxfmt
- typecheck: `tsc --noEmit`
- TypeScript は dynamic filesystem access を含むため bundle 外に置き、通常の runtime dependency として配布する。

## 11. 実装フェーズ

### Phase 1: Project scaffold と契約の固定

- [ ] `package.json`、`pnpm-lock.yaml`、tsconfig、tsdown、Vitest、Oxlint、Oxfmt を構成する。
- [ ] `@tapioca24/ts-graph@0.1.0`、ESM、Node.js 24、`bin.ts-graph`、公開対象ファイルを設定する。
- [ ] typed error、logger、path normalization の基盤を作る。
- [ ] CLI help と option validation の unit test を先に固定する。

### Phase 2: Git diff specification と snapshot

- [ ] `target`／`compare-with`／special target を domain model へ変換する。
- [ ] revision 検証、parent、merge base、repository root の解決を実装する。
- [ ] NUL 区切りの change status parser と rename model を実装する。
- [ ] Git tree、index、working tree の `SnapshotReader` を実装する。
- [ ] `git cat-file --batch` の lifecycle、error、cleanup を実装する。
- [ ] 一時 Git repository を使う integration test で全 diff mode を確認する。

### Phase 3: TypeScript dependency analyzer

- [ ] snapshot 対応の tsconfig parser と project reference traversal を実装する。
- [ ] custom `CompilerHost` と module resolution host を実装する。
- [ ] static/type/side-effect import、re-export、dynamic import、require を抽出する。
- [ ] 内部ソースだけを正規化し、edge を重複排除する。
- [ ] `paths`、project references、allowJs、resolveJsonModule の fixture test を追加する。
- [ ] 型エラー継続、unresolved import 警告、壊れた tsconfig の失敗を検証する。

### Phase 4: Diff graph の統合と選択

- [ ] base／target graph の node・edge status を計算する。
- [ ] rename relation と旧／新 node を統合する。
- [ ] 双方向 BFS と `depth` を実装する。
- [ ] exclude glob と探索打ち切りを実装する。
- [ ] changed node を保持する `max-nodes` と省略 summary を実装する。
- [ ] 複数 tsconfig 間の node／edge union をテストする。

### Phase 5: Mermaid renderer

- [ ] 安定 node ID、label escape、directory tree renderer を実装する。
- [ ] Macchiato の init directive、node class、edge style を実装する。
- [ ] added／modified／deleted legend と omitted node を実装する。
- [ ] renamed／added／deleted dependency の link style とラベルを実装する。
- [ ] raw Mermaid と Markdown renderer を実装する。
- [ ] Mermaid parser test と deterministic snapshot test を追加する。

### Phase 6: Edge annotation と CLI 統合

- [ ] inline JSON object／array と JSON file の parser を実装する。
- [ ] strict schema、重複、存在、候補表示、escape を実装する。
- [ ] stdout／stderr 分離、atomic output、verbose timing を実装する。
- [ ] no-change graph と終了コード `0`／`1`／`2` を実装する。
- [ ] build 後の `ts-graph` を起動する end-to-end test を追加する。

### Phase 7: 配布準備とドキュメント

- [ ] `README.md` に英語の導入、全 CLI 例、色と edge semantics、制約を書く。
- [ ] `README.ja.md` に同内容の日本語版を書く。
- [ ] `delta-typescript-graph-action`、`typescript-graph`、`difit` から着想を得たことを明記する。
- [ ] MIT `LICENSE` と annotation JSON Schema を追加する。
- [ ] `pnpm pack` の内容を検証し、tarball を一時 project へ導入する smoke test を作る。
- [ ] GitHub Actions で品質チェックと 3 OS integration test を構成する。
- [ ] 10,000 file 相当の benchmark generator／runner と計測手順を追加する。

## 12. テスト戦略

### 12.1 Unit test

- diff spec の全組み合わせと不正な組み合わせ
- NUL、安全でない path 文字、rename、mode change を含む status parsing
- path normalization と repository 外への path traversal 拒否
- import／export／dynamic import／require の AST 抽出
- graph merge の全 node／edge status
- cycle を含む BFS、depth、exclude、node limit、決定的順序
- Mermaid／HTML の escape、Unicode、改行、引用符
- annotation schema、重複、存在しない edge の候補
- Catppuccin の正確な palette と link style
- stdout／stderr、終了コード、no-change 出力

### 12.2 Fixture test

- relative import と directory index
- `baseUrl`／`paths`
- package exports と workspace package
- project references と複数 tsconfig
- `.tsx`、`.mts`、`.cts`、`.d.ts`
- `allowJs` と `resolveJsonModule`
- type-only import、side-effect import、re-export、dynamic import、require
- unresolved import と型エラーを含む project
- 同じ file pair の複数 import と循環依存

### 12.3 Git／CLI integration test

- no argument、single revision、two revisions、`@`
- `--merge-base`
- `.`, `staged`, `working`, `--include-untracked`
- added、deleted、modified、rename、依存 edge の追加／削除
- tsconfig 自体の追加／削除／変更
- dirty working tree と index が実行後も変化しないこと
- branch と HEAD が実行後も変化しないこと
- `--cwd` と repository subdirectory からの起動
- Mermaid／Markdown の stdout と file output
- inline／file annotation
- `--verbose` と warning が stdout を汚さないこと
- pack 済み tarball からの CLI 起動

### 12.4 CI matrix

- Node.js 24
- Ubuntu latest
- macOS latest
- Windows latest

Linux では format、lint、typecheck、unit／fixture test、build、pack smoke test を実行する。3 OS では Git／CLI integration test を実行する。workflow 内の third-party action は commit SHA で固定する。

## 13. 性能確認

目標ケース:

- tsconfig 対象 10,000 source files
- changed files 20
- `depth=1`
- base／target の 2 snapshot
- 一般的な開発マシンで約 10 秒以内
- peak memory 1 GB 未満

マシン差が大きいため CI の hard gate にはせず、再現可能な generator と計測コマンドを残す。計測箇所は Git 列挙、blob 読み取り、tsconfig、program 構築、dependency 解決、graph merge、render に分ける。

## 14. 完了条件

- [ ] 合意済みの全 CLI option が help と README に記載されている。
- [ ] 全 diff mode で working tree、index、branch を変更せず Mermaid を生成できる。
- [ ] added／deleted／modified／renamed node と added／deleted dependency を 1 枚で判別できる。
- [ ] Macchiato の指定色、凡例、directory grouping、LR layout が反映される。
- [ ] `depth`、`max-nodes`、`exclude` が決定的に動作する。
- [ ] edge annotation が inline／file の両方で安全に表示される。
- [ ] project references、paths、主要な TypeScript／JavaScript module syntax を解析できる。
- [ ] no-change、warning、入力エラー、実行時エラーが規定の stdout／stderr／終了コードになる。
- [ ] format、lint、typecheck、全 test、build が成功する。
- [ ] macOS／Linux／Windows の CI が成功する。
- [ ] `pnpm pack` の成果物から `ts-graph --help` と代表的な解析が成功する。
- [ ] README、README.ja.md、LICENSE、JSON Schema が package に含まれる。
- [ ] npm publish を実行していない。

## 15. 主なリスクと対策

| リスク | 対策 |
| --- | --- |
| Git revision を仮想 FS 化すると module resolution が複雑 | `SnapshotReader` と CompilerHost を分離し、tree/index/working で共通 contract test を実行 |
| base 時点と現在の `node_modules` が一致しない | repository 内依存を主対象とし、外部解決失敗は warning。制約を README に記載 |
| TypeScript 7 に programmatic API がない | TypeScript `^6.0.3` を明示し、解析 backend 境界を設ける |
| Windows path と Git の NUL 出力 | shell を使わず Buffer と NUL 区切りで処理し、3 OS integration test を実行 |
| Mermaid label injection／構文破壊 | path を node ID に使わず、全表示文字列を central escape 関数へ通す |
| 大規模 project で graph が肥大化 | depth 1、無変更 node 上限 50、距離優先の決定的切り詰め、benchmark を用意 |
| 単一統合 graph で過去 edge を現行 edge と誤認 | deleted edge を Red の破線、added edge を Green にして凡例で説明 |
| snapshot test の更新で不具合を見落とす | domain object の個別 assertion と Mermaid parse test を併用 |

## 16. 参考資料

- [delta-typescript-graph-action](https://github.com/ysk8hori/delta-typescript-graph-action)
- [typescript-graph](https://github.com/ysk8hori/typescript-graph)
- [difit](https://github.com/yoshiko-pg/difit)
- [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [TypeScript Compiler API repository](https://github.com/microsoft/TypeScript)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [`path.matchesGlob`](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern)
- [Catppuccin palette](https://github.com/catppuccin/catppuccin#-palette)
- [Citty](https://github.com/unjs/citty)
- [tsdown](https://tsdown.dev/)
- [Vitest](https://vitest.dev/)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)
