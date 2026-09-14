# ts-graph

[English](README.md)

Git 差分の周辺にある TypeScript のファイル依存関係を、1 枚の Mermaid flowchart にします。
任意の revision、staged、working tree を比較し、変更前後の依存を同じ図に表示します。
branch、index、ソースファイルは変更しません。

## 必要環境とインストール

**Node.js 24 以上**と `PATH` 上の Git が必要です。macOS、Linux、Windows に対応します。
ESM の CLI で、解析にはパッケージ自身の TypeScript `^6.0.3` を使います。

解析するプロジェクトにインストールします。

```sh
npm install --save-dev @tapioca24/ts-graph
npx ts-graph --help
npx ts-graph . --format markdown -o graph.md
```

以下では `ts-graph` と記載します。ローカルインストール時は `npx` を前に付けます。

## 比較対象の指定

```text
ts-graph [target] [compare-with] [options]
```

**新しい側を先に、比較基準を後に**指定します。

| コマンド                | Base       | Target                            |
| ----------------------- | ---------- | --------------------------------- |
| `ts-graph`              | `HEAD^`    | `HEAD`                            |
| `ts-graph feature`      | `feature^` | `feature`                         |
| `ts-graph feature main` | `main`     | `feature`                         |
| `ts-graph @ main`       | `main`     | `HEAD`                            |
| `ts-graph .`            | `HEAD`     | working tree（staged + unstaged） |
| `ts-graph . main`       | `main`     | working tree                      |
| `ts-graph staged`       | `HEAD`     | index                             |
| `ts-graph working`      | index      | working tree                      |

ローカルの commit、branch、tag を指定できます。`@` は `HEAD` の別名です。
`staged` と `working` は第 2 位置引数を受け付けません。
既定の比較には親 commit が必要です。初回 commit では `HEAD HEAD` で空の図を出すか、
その後のローカル編集を `.` で比較してください。

```sh
ts-graph feature main --merge-base
ts-graph . --include-untracked
ts-graph working --include-untracked
```

`--merge-base` は base を merge base に置き換え、revision 同士の比較でだけ使えます。
`--include-untracked` は `.` と `working` 専用です。
revision や merge base がなければエラーになります。必要に応じて
`git fetch origin main`、shallow clone なら `git fetch --unshallow` などで履歴を取得してください。
CLI は自動 fetch しません。

## オプション

| オプション                     | 既定値                  | 役割                                               |
| ------------------------------ | ----------------------- | -------------------------------------------------- |
| `--merge-base`                 | `false`                 | revision 間の merge base を基準にする              |
| `--include-untracked`          | `false`                 | `.` / `working` に untracked を含める              |
| `--cwd <path>`                 | 現在のディレクトリ      | 対象 repository 内の開始位置                       |
| `--tsconfig <path>`            | root の `tsconfig.json` | repository root 相対。繰り返し可能                 |
| `--depth <n\|all>`             | `1`                     | 変更から依存先・依存元を辿る距離。`0` も有効       |
| `--max-nodes <n\|all>`         | `50`                    | 無変更の関連ファイル数の上限。正の整数または `all` |
| `--exclude <glob>`             | なし                    | repository root 相対の除外 glob。繰り返し可能      |
| `--direction <LR\|RL\|TB\|BT>` | `LR`                    | 図の向き                                           |
| `--no-group-directories`       | grouping 有効           | 階層をなくし repository 相対パスで表示             |
| `--legend`                     | `false`                 | 変更状態の凡例を表示する                           |
| `--no-legend`                  | 凡例非表示              | 明示的に凡例を非表示にする（互換性のため維持）     |
| `--edge-label <json>`          | なし                    | 注釈 object または array。繰り返し可能             |
| `--edge-label-file <path>`     | なし                    | 注釈配列の JSON ファイル                           |
| `--format <mermaid\|markdown>` | `mermaid`               | Mermaid 本体または Markdown code block             |
| `-o, --output <path>`          | stdout                  | 一時ファイルと rename でファイルへ出力             |
| `--verbose`                    | `false`                 | 診断と所要時間を stderr へ出力                     |
| `-h, --help`                   | —                       | help を表示                                        |
| `-v, --version`                | —                       | package version を表示                             |

```sh
ts-graph @ main --cwd /path/to/repo
ts-graph . --tsconfig packages/app/tsconfig.json --tsconfig packages/lib/tsconfig.json
ts-graph . --depth 0
ts-graph . --depth all --max-nodes all
ts-graph . --exclude '**/*.test.ts' --exclude 'generated/**'
ts-graph . --direction TB --no-group-directories
ts-graph . --legend
ts-graph . --format markdown --output graph.md --verbose
ts-graph --help
ts-graph --version
```

サブディレクトリから起動しても `--tsconfig` と `--exclude` は repository root 相対です。
注釈ファイルと出力パスは `--cwd`、未指定なら現在のディレクトリが基準です。
出力先の親ディレクトリは事前に作成してください。
glob は shell に展開されないよう引用符で囲みます。例は POSIX shell 向けです。
Windows shell の JSON 引用符処理は異なるため、`--edge-label-file` が便利です。

変更ファイルは明示的に exclude したものを除いて上限の対象外です。
無変更ファイルは距離、次にパスの順で決定的に選びます。除外ファイルを越えて探索しません。
上限による省略は専用ノードと stderr の警告で通知します。test や stories は暗黙に除外しません。

## 図の読み方

矢印は **import するファイルから import されるファイルへ**向きます。型のみの import も含みます。
同じファイル対の複数 import は 1 本にまとめ、自己参照は除きます。循環依存にも対応します。
directory subgraph は共通する先頭ディレクトリを畳みます。既定は左から右のレイアウトで、凡例は非表示です。
`--legend` を指定すると図の下に小さな凡例を配置します。有効時はグループ間の不可視リンクで上下に配置し、
`--direction` は上段の依存関係の図に適用します。凡例が非表示の場合、配置用のグループ・リンクも出力しません。
互換性のため `--no-legend` も引き続き使用でき、明示的に凡例を非表示にします。

配色は [Catppuccin Macchiato](https://github.com/catppuccin/catppuccin#-palette) です。

| 要素               | 表示                                           | 意味                                     |
| ------------------ | ---------------------------------------------- | ---------------------------------------- |
| 無変更ファイル     | Surface 0 `#363a4f`                            | 両方の解析 snapshot に存在               |
| 追加ファイル・依存 | Green `#a6da95`                                | target のみに存在                        |
| 変更ファイル       | Yellow `#eed49f`                               | Git 上の変更あり                         |
| 削除ファイル       | Red `#ed8796`、破線 border                     | base のみに存在                          |
| 無変更依存         | Overlay 0 `#6e738d`、実線                      | 両 snapshot に存在                       |
| 削除依存           | Red、破線矢印                                  | base のみに存在                          |
| rename relation    | Mauve `#c6a0f6`、点線／破線と `renamed` ラベル | 削除された旧パスと追加された新パスを結ぶ |

背景は Base `#24273a`、通常の文字は Text `#cad3f5`、アクセント上の文字は Base です。
rename relation は依存とは別の関係です。Git の標準 similarity 判定を使い、copy は追加として扱います。
変更ファイルは変更前後の依存を両方保持します。赤い矢印は過去に削除した import を示します。

## 依存エッジへの注釈

`labels.json` を作成します。

```json
[{ "from": "src/a.ts", "to": "src/b.ts", "label": "ユーザー情報を取得" }]
```

```sh
ts-graph . --edge-label-file labels.json
ts-graph . --edge-label '{"from":"src/a.ts","to":"src/b.ts","label":"ユーザー情報を取得"}'
ts-graph . --edge-label '[{"from":"src/a.ts","to":"src/b.ts","label":"ユーザー情報を取得"}]'
```

フィールドは `from`、`to`、`label` のみで、すべて空白だけではない文字列が必要です。
ファイルは配列を必須とし、inline は単一 object も受け付けます。
パスは repository root 相対の POSIX 形式へ正規化します。絶対パスや repository 外への移動は拒否します。
注釈はプレーンテキストです。HTML と Mermaid の文字は escape し、改行を安全な `<br/>` に変換します。
Mermaid は `securityLevel: strict` を使います。

inline と file の注釈は統合されます。パス正規化後を含め、同じエッジへの重複は入力エラーです。
depth・exclude・上限の適用後に **表示される依存エッジ** だけを指定できます。
存在しない場合は近い有効候補を案内します。rename relation には注釈できません。

注釈ファイル用の [JSON Schema](schemas/annotations.schema.json) を同梱しています。
エディタの schema 関連付けに
`node_modules/@tapioca24/ts-graph/schemas/annotations.schema.json` を指定してください。
パスの安全性、重複、表示エッジの存在は CLI が追加検証します。JSON Schema だけでは graph の存在判定はできません。

## 出力とエラー

graph 生成時の stdout は Mermaid／Markdown だけです。警告と verbose 計測は stderr に出します。
`--output` 時の stdout は空で、可能な環境では rename で出力先を置換します。
help と version は要求されたテキストを出力します。

| 終了コード | 意味                                                     |
| ---------- | -------------------------------------------------------- |
| `0`        | 成功。`No TypeScript changes` ノードを持つ有効な図も含む |
| `1`        | Git・filesystem・tsconfig などの実行時エラー             |
| `2`        | CLI 引数または注釈の入力エラー                           |

解決できない import は、そのエッジだけを省き、デフォルトでは通知しません。
`--verbose` 時のみ、Node.js 標準モジュールも含めてスキップした import を stderr に出力します。
例: `Skipped unresolved import "node:child_process" in "src/git/cat-file.ts"`。
通常の型エラーでは解析を止めません。
tsconfig の構文エラーや project を構築できない状態は失敗します。
変更した TypeScript ファイルが選択 project の対象外なら警告します。

## 解析対象と制約

- `.ts`、`.tsx`、`.mts`、`.cts`、`.d.ts` を解析します。`allowJs` 有効時は `.js`、`.jsx`、`.mjs`、
  `.cjs`、`resolveJsonModule` 有効時は import された `.json` も対象です。
- static／type／side-effect import、re-export、文字列リテラルの `import()`／`require()` を扱います。
  動的に計算された module 名は解析しません。
- TypeScript の module resolution に従い `paths`、`baseUrl`、package exports、内部 workspace package
  を解決します。project references を再帰的に辿り、複数 project のファイルを repository 相対パスで統合します。
- 各 snapshot 時点の tsconfig を読みます。選択 config が片側だけにあっても解析しますが、両側になければエラーです。
  外部解決と `extends` は現在の `node_modules` を使うため、過去の依存と一致しない場合があります。
  外部 package と TypeScript 標準 library はノードに含めません。
- checkout や staging を行わず、対象コードや設定を実行しません。conflict 中の index は明示的に失敗します。
  Git LFS の download と submodule の内部解析は非対応です。解析不能な TypeScript 内容は警告します。
- `.vue`、`.svelte`、MDX、Astro、watch、依存ルール検査、公開 library API、PR URL 取得、stdin の unified diff、
  自動ネットワークアクセスには対応しません。
- 出力は Mermaid テキストです。SVG／PNG renderer やブラウザ UI は同梱しません。別途 Mermaid viewer を利用してください。
  viewer のポリシーによって theme directive が上書きされる場合があります。
- 極端に深い依存列は TypeScript Compiler API の stack 上限に達する場合があります。
  ローカルでは 10,000 file の単一循環で失敗しました。`--depth` が制限するのは表示範囲です。

## 開発と性能確認

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:integration
pnpm test:pack
pnpm benchmark
```

`test:pack` は build と pack 後にファイル許可リストを確認し、一時 project に tarball と本番依存を導入します。
導入された bin で help、version、注釈付き解析を検証します。registry 接続または cache と `tar` が必要です。
CI は Linux で品質と pack、Linux／macOS／Windows の Node.js 24 で Git・TypeScript・CLI integration test を実行します。
Actions は commit SHA で固定しています。

benchmark は 10,000 source files／20 changed files の 2 commit を depth 1 で比較し、
新規 process で 3 回計測します。目安は約 10 秒、peak RSS 1 GiB 未満で、CI の hard gate にはしません。
generator の再利用、計測範囲と結果は
[benchmark 手順](https://github.com/tapioca24/ts-graph/blob/main/docs/benchmark.md) を参照してください。

## 着想とライセンス

[delta-typescript-graph-action](https://github.com/ysk8hori/delta-typescript-graph-action)、
[typescript-graph](https://github.com/ysk8hori/typescript-graph)、
[difit](https://github.com/yoshiko-pg/difit) から着想を得ました。target／base の引数順は difit に合わせています。
これらのソースコードをコピーせず、独自に実装しています。配色は Catppuccin Macchiato です。
[MIT License](LICENSE) で提供します。
