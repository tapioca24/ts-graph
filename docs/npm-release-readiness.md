# npm 初回公開までの残作業

調査日: 2026-09-13。対象: `main` / `06d09c33f3bb3948129247e9ad5e4b4a7819ec53`。
調査後、ユーザーの依頼に従って公開準備のドキュメントを更新した。公開、認証設定変更、workflow 追加は実行していない。

## 結論

今回確認した範囲では、初回公開を妨げる実装・品質上の問題は見つからなかった。
初回はローカルから手動公開する方針でユーザーと合意済み。
日英 README と HANDOFF を更新し、[手動公開手順](./releasing.md) を追加した。
残作業は公開準備 PR のマージ、公開対象 main の最終確認、手動公開と公開後検証である。
`docs/plan.md` では名前 `@tapioca24/ts-graph`、初期バージョン `0.1.0` が合意済み。
公開 workflow、provenance、Changesets、semantic-release は元の MVP 対象外であり、必須の実装漏れではない。

## 確認済みの状態

| 項目             | 調査結果                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Git              | 開始時の作業ツリーは clean。Phase 1〜7 は main に統合済み。ローカル tag はなし                                              |
| GitHub           | public repository、default branch は main。PR #7 は main 向けにマージ済み                                                   |
| 最新 main CI     | quality、Ubuntu・macOS・Windows integration の全4 jobs が成功                                                               |
| ローカル品質     | `pnpm check` 成功。format、lint、typecheck、10 files / 207 tests                                                            |
| 配布検証         | `pnpm test:pack` 成功。7ファイルの内容検査、別 project への導入、CLI help・version・注釈付き解析、不変性を確認              |
| package metadata | name、version、MIT、repository、bin、files、ESM、Node >=24、`publishConfig.access: public` を設定済み                       |
| ビルド           | `prepack` で build。shebang を検証。TypeScript・citty は runtime dependencies                                               |
| npm 認証         | `npm whoami` は `tapioca24`。メール確認済み、2FA は `auth-and-writes`、pending なし                                         |
| npm registry     | `npm view @tapioca24/ts-graph ... --registry=https://registry.npmjs.org` は E404。閲覧可能な同名 package は確認できなかった |
| 環境             | Node v24.14.1、pnpm 10.33.0、npm 11.11.0                                                                                    |

E404 は名前の確保や publish 権限の保証ではない。公開時に同名・同バージョンの有無を再確認し、registry の応答で最終判断する。
2FA の設定確認は、公開時の認証操作が完了したことを意味しない。

配布テストの初回実行は sandbox の DNS 制限（ENOTFOUND）で依存取得に失敗した。
ネットワーク許可後の再実行で成功した。テストや判定条件は変更していない。

最新 CI: <https://github.com/tapioca24/ts-graph/actions/runs/34741880004>
PR #7: <https://github.com/tapioca24/ts-graph/pull/7>

## 公開前・公開時の残作業

README と HANDOFF の更新は本変更で完了。公開手順を追加済み。
この変更後の `pnpm check` は 10 files / 207 tests を含めて成功した。
`pnpm test:pack` も更新した README を含む7ファイルと、導入した CLI の help・version・注釈付き解析を検証して成功した。
公開準備 PR の CI 結果は PR の checks と説明欄に記録する。マージ後の main CI は公開時に別途確認する。

| 優先度     | 作業                                                   | 完了条件                                                                                                    |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| PR マージ  | 公開準備 PR を main にマージする                       | レビューと PR の CI を確認してマージ                                                                        |
| 最終検証   | 公開対象の commit と成果物を確定し、変更後の検証を行う | `pnpm check`、`pnpm test:pack`、公開対象 commit の CI が成功し、同梱内容・名前・version・public 設定を確認  |
| 公開時確認 | registry の名前・version と認証を再確認                | `@tapioca24/ts-graph@0.1.0` が未使用で、想定アカウントの認証が有効。手動方式では必要な 2FA 操作を本人が完了 |
| 公開       | 別途、明示的な公開依頼を受けて実行                     | npm registry に public として 0.1.0 を登録。通常公開を採用する場合の dist-tag は latest                     |
| 公開後検証 | registry から新規環境へ導入して動作確認                | version、dist-tag、README 表示、`ts-graph --help`・`--version`・代表的な解析を確認                          |

tag `v0.1.0`、GitHub Release、リリースノートは公開 commit を追跡しやすくするため推奨するが、npm の必須条件ではない。
keywords・homepage・bugs metadata の追加も任意であり、公開を止める理由にはしない。

## 合意済みの公開方式

初回はローカルから手動公開する。既存の pnpm ベースの build / pack 検証を利用する。
公開 workflow、Trusted Publisher 設定、公開自動化は今回の残作業に含めない。
この方針合意は公開実行の依頼ではなく、実際の公開は別途明示的な依頼後に行う。

## 将来の自動化に関する参考情報

Actions を選ぶ場合は、公開 trigger、対象 commit、tag と package version の一致、検証 job の成功条件を定め、
公開 workflow と npm 側の Trusted Publisher 設定を追加する。
OIDC では GitHub-hosted runner、`id-token: write`、対応する npm CLI が必要。
公式手順は package settings での登録を前提とするため、未公開 package の初回登録手順も別途確認する。
staged publishing は既存 package 専用であり、新規 package の初回公開には使えない。

## 既知の制約と調査範囲

10,000ファイルの単一循環では Compiler API の stack 上限に達する既知の制約がある。
README と benchmark 記録に記載済みで、今回新たに発見した公開阻害要因ではない。
全ソースの追加コードレビューや benchmark の再測定は行っていない。
3 OS の確認は最新 GitHub CI に基づき、今回のローカル実行は macOS のみ。

## 公式資料

- [scoped public package の公開](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/): direct publish の認証条件と public 公開。
- [2FA と公開条件](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/): 2FA または対応 token による公開。
- [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/): OIDC、package settings、GitHub-hosted runner、npm >=11.5.1 / Node >=22.14.0。
- [Staged Publishing](https://docs.npmjs.com/staged-publishing/): 既存 package、npm >=11.15.0 などの前提条件。

npm 公式サイトと Context7 の npm ドキュメント検索で確認した。認証・公開要件は実行時にも再確認する。
