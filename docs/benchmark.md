# Benchmark

## 実行手順 / Reproduction

Node.js 24、pnpm 10、Git が必要です。repository root で実行します。

```sh
pnpm install --frozen-lockfile
pnpm benchmark
```

一時 Git repository に 10,000 個の TypeScript source file を作成し、20 個を変更した
2 commit を比較します。generator と build の時間は計測に含めません。
既定は 100 file ごとの循環 module を 100 個作り、変更を等間隔で配置します。
各 file は 1 本の import を持ち、全 10,000 file が tsconfig の対象です。
base／target の両方を解析し、`depth=1`、既定の `max-nodes=50` を使います。
この配置では変更 20 file と関連 40 file の合計 60 file が表示されます。

The default fixture has 100 cyclic modules of 100 files each, 10,000 imports, and
20 evenly spaced modifications. Both snapshots include all files; depth only limits
the displayed graph. This is a synthetic workload, not a claim about every project.

generator だけの実行は生成先パスを stdout に出します。既存 directory は変更しません。
次のコマンドでは、表示されたパスを 2 行目の `/path/from/generator` に指定します。

```sh
pnpm --silent benchmark:generate 10000 20
pnpm benchmark /path/from/generator 3
```

引数は generator が `[files=10000] [changed=20] [modules|chain=modules]`、
runner が `[fixture-path] [runs=3]` です。runner 自身が生成した一時 directory は終了時に削除します。
手動生成した fixture は再利用のため残します。不要になったら生成先だけを削除してください。

## 計測範囲 / Measurement boundaries

- 各 run は build 済み CLI を新しい Node process で起動します。wall time は process 起動から終了までです。
  TypeScript import／CLI 起動も含みます。3 回の出力の完全一致も検証します。
- OS の file cache は消去しません。fresh process であっても cold disk の測定ではありません。
- `Git snapshots and changes`: revision 解決、Git tree／index 列挙、diff 取得。
- `Blob reads and snapshot hosts`: 2 snapshot の blob 読み取りと同期 CompilerHost 用メモリへの格納。
  blob の byte I/O だけを分離した数値ではありません。
- `Base/Target tsconfig`: config 読み取り、glob 展開、project references。
- `Base/Target Program construction`: TypeScript Program の構築。TypeScript 内部の import 解決も含みます。
- `Base/Target Dependency resolution`: AST 参照抽出、明示的 module resolution、node／edge の収集。
  複数 project は同じ stage 名を繰り返して記録します。
- `TypeScript analysis`: 上記解析全体の合計。内訳と重複するため足し合わせません。
- `Graph merge and selection`: 差分統合、対象外警告、BFS、上限適用。
- `Annotations and render`: 注釈検証、Mermaid 生成。
- `Generation total`: snapshot の終了処理を含む生成時間。`Output` は出力時間です。
- peak RSS は子 Node process 自身の `process.resourceUsage().maxRSS`（KiB）を MiB に換算します。
  短いメモリピークも含みますが、別 process の Git や親 runner のメモリは含みません。
  値の定義は [Node.js 24 process documentation](https://nodejs.org/docs/latest-v24.x/api/process.html#processresourceusage) を参照してください。

目標は一般的な開発マシンで約 10 秒、peak memory 1 GiB 未満です。
環境差があるため CI の hard gate にはしません。runner は median wall time、最大 peak RSS、
OS／CPU／Node／メモリ容量、file 数と change 数を記録します。
プロジェクトの依存形状、ファイルサイズ、外部依存、OS cache で結果は変わります。

Timings are non-gating. Peak RSS covers the CLI's Node process, not aggregate process-tree
memory. Program construction also performs internal module resolution, while the
dependency stage measures the explicit extraction pass. Stage totals overlap as described above.

## 深い依存列の制約 / Deep dependency limitation

10,000 file 全体を 1 個の長い循環にした初回実験では、TypeScript の Program 構築中に
`Maximum call stack size exceeded` で失敗しました（Node.js 24.14.1／TypeScript 6.0.3）。
`depth=1` は表示範囲だけに作用するため、この解析時の制約を回避しません。
成功扱いにはせず、次の generator mode で再現可能にしています。

```sh
pnpm --silent benchmark:generate 10000 20 chain
pnpm benchmark /path/from/generator 1
```

この mode は既定環境では失敗する可能性があります。stack size の拡大や、解析意味論を変える
`noResolve` の強制は行っていません。通常の循環依存は既存テストと `modules` workload で確認します。

A single 10,000-file import cycle exceeded the Compiler API's call stack in the local
experiment. The `chain` fixture preserves that reproducer; the default `modules`
workload measures bounded cycles. No stack-size override or resolver bypass is used.

## 実測結果

2026-09-12、Apple M5（10 logical CPU）／24 GiB RAM、macOS Darwin 25.6.0 arm64、
Node.js 24.14.1、pnpm 10.33.0、TypeScript 6.0.3。上記の既定 `modules` workload で計測しました。

| Run | Wall time | Peak RSS   |
| --- | --------- | ---------- |
| 1   | 2.178 秒  | 512.69 MiB |
| 2   | 1.541 秒  | 511.88 MiB |
| 3   | 1.542 秒  | 515.64 MiB |

中央値 1.542 秒、最大 peak RSS 515.64 MiB。3 回とも出力は完全一致し、60 file／40 dependency edge、警告なしでした。
通常 workload は両目標を満たしました。単一の長い循環の失敗は上記のとおり別に記録しています。

Run 3 の内訳（ms）: Git snapshots 54.5、blob reads／hosts 323.1、base tsconfig 36.2、
base Program 393.4、base dependencies 117.7、target tsconfig 30.9、target Program 336.6、
target dependencies 112.7、graph merge／selection 11.6、annotations／render 0.8。
TypeScript analysis 合計 1354.2、generation total 1421.8、output 0.1。
初回の blob reads／hosts は 941.8 ms で、後続 run は OS cache の影響を受けています。
