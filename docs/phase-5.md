# Phase 5: Mermaid renderer

## 作業計画

- [x] 安定 ID、共通 prefix の折り畳み、directory tree と安全な label escape を実装する。
- [x] Macchiato theme、全 status、rename、凡例、省略 summary と出力形式を実装する。
- [x] Mermaid parser、snapshot、決定性と特殊文字のテストを追加する。
- [x] 品質チェック、build、Section 14 との照合と引き継ぎ更新を行う。

変更は日本語コミットにまとめ、`feat/phase-5` から作業開始時の `feat/phase-4` 向け PR として提供する。

## 実装判断と内部 API

- `renderGraph(graph: SelectedGraph, options?: RenderOptions): string` は副作用のない内部 API。既定は `direction=LR`、`groupDirectories=true`、`legend=true`、`format=mermaid`。Markdown では同じ Mermaid 本体を fenced code block へ格納し、どちらも末尾改行を付ける。
- 入力は Phase 4 が返す正規化・重複排除済みの graph。node、directory、dependency、rename を locale 非依存の path 順に出力し、入力配列を変更しない。cycle はそのまま描画する。
- `stableId(kind, path)` は repository-relative POSIX path の SHA-256 全長と file／directory prefix を使う。選択範囲や grouping の変更で ID は変わらず、凡例や summary とも衝突しない。
- 全 file node の親 directory に共通する先頭 segment を畳む。残る階層は名前付き subgraph とし、node label は basename。flat mode では repository-relative path。root file があれば共通 prefix は畳まない。凡例と summary は directory 計算に含めない。
- `escapeLabel` は引用符、HTML、Mermaid entity、Markdown、区切り文字を decimal entity へ変換し、CRLF／CR／LF だけは生成側で `<br/>` に置換する。`securityLevel=strict`、`htmlLabels=false` で SVG text を使用する。
- `theme.ts` に Macchiato palette、init directive、node class、link style を集約。deleted dependency は Red の破線、rename は Mauve の点線と固定 `renamed` label。実際に出力した dependency、続く rename と同じ順序で linkStyle index を割り当てる。凡例と summary は edge を持たない。
- `RenderOptions.edgeLabels` は `{ from, to, label }` の配列を受け、dependency のみを注釈する。Phase 6 が schema／path normalization／重複／存在を検証してから渡す契約。入力検証を renderer に重複実装しない。
- 空 graph の `No TypeScript changes` node も renderer 内で用意済み。CLI の no-change 判定と終了コードの接続は Phase 6。
- Mermaid `11.17.2` と jsdom `30.0.1` は devDependency のみ。実行時依存や CLI bundle に Mermaid parser／renderer を追加しない。

## 検証結果

- macOS、Node.js `v24.14.1`、pnpm `10.33.0` で確認。
- `pnpm check`: format、type-aware lint、typecheck、全 164 tests 成功。Phase 5 で 21 tests と deterministic snapshot を追加。
- `pnpm build`、ビルド済み CLI の `--help`／`--version` が成功。CLI 接続前のため build は既存機能の回帰確認。
- 実際の `mermaid.parse` で全 node／edge status、rename、cycle、4 direction、grouping／flat、凡例なし、省略 summary、空 graph、Markdown 内の本体、特殊文字と複数行注釈を検証。
- parser 内部 DB も検査し、注入文字列から余分な node／edge、リンク、callback が作られないことと、各 edge に期待する色・線種・linkStyle index が付くことを確認。内部 DB の参照は test に限定する。
- snapshot の内容も確認済み。個別 assertion で共通 prefix、同名 directory、ID の独立性、正確な palette、全 status、入力順の独立性を補完。
- 最初の依存追加は sandbox 内の pnpm store 不一致で失敗。権限付きで既存 store を利用して追加した。品質チェックと test の失敗はなし。

## Section 14 完了条件との照合

| 完了条件                                  | Phase 5 時点の実測・残作業                                   |
| ----------------------------------------- | ------------------------------------------------------------ |
| 全 CLI option の help／README             | help 確認済み。README は Phase 7                             |
| 全 diff mode の読み取り専用 Mermaid 生成  | 既存 Git integration test 成功。CLI 接続は Phase 6           |
| node／dependency の変更状態を単一図で判別 | parser の class／link style と snapshot で確認。CLI 接続待ち |
| Macchiato／凡例／grouping／LR             | renderer test で確認済み                                     |
| depth／max-nodes／exclude の決定性        | 既存 graph test 成功。省略 summary の描画まで確認            |
| inline／file annotation の安全な表示      | label escape／parser test 成功。入力検証と CLI は Phase 6    |
| references／paths／主要構文解析           | 既存 TypeScript fixture test 成功                            |
| stdout／stderr／終了コード／no-change     | 空 graph の描画は確認済み。CLI 統合は Phase 6                |
| format／lint／typecheck／全 test／build   | 全て成功                                                     |
| 3 OS CI                                   | 未実施、Phase 7                                              |
| pack 後の CLI smoke test                  | 未実施、Phase 7                                              |
| 配布ドキュメント／LICENSE／Schema         | Phase 7                                                      |
| npm publish を実行しない                  | 実行していない                                               |

製品全体の Section 14 チェックは CLI 統合と配布検証まで未完了のまま維持する。ブラウザでの SVG／PNG の目視確認、Linux／Windows、10,000 file の性能目標は未検証。

## 確認した公式資料

- [Mermaid flowchart syntax](https://github.com/mermaid-js/mermaid/blob/develop/docs/syntax/flowchart.md): quoted label と decimal entity。
- [Mermaid usage](https://github.com/mermaid-js/mermaid/blob/develop/docs/config/usage.md): async `mermaid.parse` による構文検証。
- [Mermaid directives](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/config/directives.md): `htmlLabels` は global option を使用。
- [Mermaid config schema](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/schemas/config.schema.yaml): strict security と theme の設定。導入版の型定義も併せて確認。
