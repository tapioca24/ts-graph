# Phase 4: Diff graph の統合と選択

## 作業計画

- [x] base／target と Git changes から node／edge status、rename relation を統合する。
- [x] 双方向 BFS、depth、exclude、変更ノードを保持する上限と省略情報を実装する。
- [x] 全 status、循環、決定的順序、複数 tsconfig の union を検証する。
- [x] 品質チェックと build を実行し、引き継ぎを更新する。

検証済みの変更を日本語コミットにまとめ、`feat/phase-4` から作業開始時の `feat/phase-3` 向け PR を作成する。

## 実装判断と内部 API

- `mergeGraphs(base, target, changes)` は `DiffGraph` を返す。入力は Phase 3 の `SnapshotGraph` と Phase 2 の `Changes`。node の追加／削除は snapshot の集合差、共通 node の modified は Git の変更情報から判定する。解析対象外の Git 変更を node として追加しない。
- 同じ file pair の edge は重複排除し、自己依存を除外する。base だけの edge は deleted、target だけなら added、両方なら unchanged。rename は旧／新の解析済み node を結ぶ `renames` に保持し、dependency と分離する。
- `selectGraph(graph, options?, warn?)` は `SelectedGraph` を返す。既定は `depth=1`、`maxNodes=50`、除外なし。変更 node を全て seed にし、dependency の向きを無視した multi-source BFS で最短距離を計算する。rename relation は探索に使わない。
- `node:path.posix.matchesGlob` で repository-relative POSIX path に除外 glob を適用し、OS によらず同じ境界を使う。変更 node も除外対象であり、除外 node を越えて探索しない。dotfile は Node.js の glob semantics に従い、`**/.*` などで明示的に指定する。
- depth 内の到達可能ノードを探索してから、無変更 node を距離・path 辞書順で上限まで採用する。変更 node は上限外。表示 node 間の dependency と rename を全て保持し、node／edge／relation を path 順に返す。入力配列は変更しない。
- 省略時は `omitted: { count, label }` を返し、同じ label を `warn` callback に一度通知する。label は `… N related files omitted`。summary をファイルの path に偽装せず、Phase 5 で専用 node として描画する。Phase 6 では `warn` を stderr logger に接続する。
- tsconfig だけの変更で全 source の所属が同じ場合、edge の差分は保持するが、source に変更 node がなければ選択結果は空になる。仕様の「変更 node を seed」に従い、edge の変化を source の modified として扱わない。

## 検証結果

- macOS、Node.js `v24.14.1`、pnpm `10.33.0` で確認。
- `pnpm check`: format、type-aware lint、typecheck、全 143 tests 成功。Phase 4 で単体 24 tests と複数 tsconfig の fixture 1 test を追加。
- `pnpm build`、ビルド済み CLI の `--help`／`--version` が成功。graph の CLI 接続は Phase 6 のため、この build は既存 CLI の回帰確認。
- 全 node／edge status、mode-only 変更、rename、空／片側 graph、重複、特殊 path、循環、depth 0／1／2／all、exclude、複数 seed、上限、正確な省略数、既定値、入力不変性、決定的順序を検証。
- 複数の明示 tsconfig が同じ source を異なる alias へ解決する fixture で、両 snapshot の union、差分 status、選択結果と config 順序の独立性を確認。
- tree／index／working の既存 integration test に merge／select を接続し、index bytes、HEAD、branch、status、作業中 config の不変性を継続確認。
- 最初の品質チェックはテスト中の logger method の直接参照に対する `unbound-method` lint で失敗。arrow callback に修正し、全チェックを再実行して成功。

## Section 14 完了条件との照合

探索の決定性を domain test で確認し、現時点の品質チェック・build は成功。project references／paths／主要構文の既存テストも成功。npm publish は実行していない。

CLI help は確認済みだが README への全 option 記載、全 diff mode の Mermaid 生成、変更状態の描画、Macchiato／凡例／grouping／layout、annotation、統合 CLI の出力と終了コード、3 OS CI、pack smoke test、配布ドキュメントと Schema は後続 Phase 5–7。製品全体の Section 14 チェックは未完了のまま維持する。Linux／Windows、10,000 file の性能目標は未検証。

## 確認した公式資料

- [Node.js path API](https://nodejs.org/api/path.html#pathmatchesglobpath-pattern): `matchesGlob` と `posix`。Context7 では Node.js 本体が検索できなかったため公式資料を参照し、Node.js 24 の実行環境でも glob の挙動をテストした。
