# 初回の npm 手動公開

対象は `@tapioca24/ts-graph@0.1.0`、公開範囲は public、dist-tag は `latest`。
初回はローカルから公開する。Node.js 24 以上、pnpm 10.33.0、npm CLI、Git、GitHub CLI を用意する。
以下は macOS / Linux の shell 向け。各段階の結果を確認し、失敗した場合は先へ進まない。
この文書の追加時点では未公開。公開準備 PR の作成・マージと npm への公開は別の操作である。

## 1. 公開対象を確定する

公開準備 PR を main にマージしてから、作業ツリーに変更がない checkout で実行する。

```sh
git status --short
git switch main
git pull --ff-only origin main
git rev-parse HEAD
gh run list --workflow ci.yml --branch main --limit 5 --json databaseId,headSha,status,conclusion,url
```

最初の `git status --short` に出力があれば、その変更を整理してから続ける。
HEAD と同じ `headSha` の CI が成功していることを確認する。古い commit の成功では代用しない。
該当 run の quality と Ubuntu・macOS・Windows integration の全4 jobs を確認する。
公開元の HEAD SHA を控える。公開完了まで checkout の内容を変更しない。

## 2. 依存と配布物を検証する

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:pack
```

package metadata は `package.json` を開き、名前 `@tapioca24/ts-graph`、version `0.1.0`、
`publishConfig.access` が `public` であることを確認する。
`test:pack` は `prepack` で build し、7ファイルの同梱内容、別 project に導入した CLI の
help・version・注釈付き解析を検証する。テストは npm へ公開しない。

## 3. npm の認証と version を確認する

```sh
npm whoami --registry=https://registry.npmjs.org
pnpm view @tapioca24/ts-graph versions --json --registry=https://registry.npmjs.org
```

アカウントは `tapioca24` を使用する。未ログインまたは認証期限切れなら
`npm login --registry=https://registry.npmjs.org` を実行し、本人がブラウザでログイン・2FA を完了する。

初回の `view` は E404 が想定される。同名 package が見つかった場合は所有者と公開済み version を確認する。
`0.1.0` が存在する場合は公開を止め、既存公開の状態を確認する。通信エラーを未公開と解釈しない。
E404 だけでは公開権限や名前の利用可否を保証しない。

## 4. 公開内容を dry-run で確認する

repository root の main で実行する。

```sh
pnpm publish --dry-run --publish-branch main --access public --tag latest --registry=https://registry.npmjs.org
git status --short
```

出力の名前・version・同梱ファイルを確認する。想定ファイルは次の7件。

- `package.json`
- `dist/main.mjs`
- `dist/main.mjs.map`
- `README.md`
- `README.ja.md`
- `LICENSE`
- `schemas/annotations.schema.json`

作業ツリーが clean なことを再確認する。dry-run は registry への登録を行わず、公開権限の成功も保証しない。
pnpm の branch・clean・remote 同期のチェックを維持し、失敗時に `--no-git-checks` や `--force` で回避しない。

## 5. 手動公開する

公開を実行すると決めた時点で、同じ checkout から実行する。

```sh
pnpm publish --publish-branch main --access public --tag latest --registry=https://registry.npmjs.org
```

要求される認証・2FA 操作は本人が端末やブラウザの案内に従って完了する。
コマンド成功後に registry の状態を確認する。通信が途中で切れた場合も、再実行前に次の `view` で確認する。
公開した同名・同バージョンは上書きできない。修正が必要なら新しい version として扱う。

## 6. registry からの導入を確認する

```sh
pnpm view @tapioca24/ts-graph@0.1.0 version dist.integrity --json --registry=https://registry.npmjs.org
pnpm view @tapioca24/ts-graph dist-tags --json --registry=https://registry.npmjs.org
```

version が `0.1.0`、`latest` が `0.1.0` を指すことを確認する。
[npm の package ページ](https://www.npmjs.com/package/@tapioca24/ts-graph) で README の表示も確認する。
別の一時ディレクトリで registry からインストールし、実際の bin を起動する。

```sh
release_smoke_dir=$(mktemp -d)
cd "$release_smoke_dir"
printf '%s\n' '{"private":true,"type":"module"}' > package.json
pnpm add -D @tapioca24/ts-graph@0.1.0 --registry=https://registry.npmjs.org
pnpm exec ts-graph --help
pnpm exec ts-graph --version
git init -b main
printf '%s\n' 'node_modules/' > .gitignore
printf '%s\n' '{"compilerOptions":{"noLib":true},"include":["src"]}' > tsconfig.json
mkdir src
printf '%s\n' 'import { b } from "./b"; export const a = b;' > src/a.ts
printf '%s\n' 'export const b = 1;' > src/b.ts
git add .gitignore package.json pnpm-lock.yaml tsconfig.json src
git -c user.name='Release smoke' -c user.email='release-smoke@example.invalid' commit -m 'test: 公開パッケージの解析用fixtureを作成'
printf '%s\n' 'export const b = 2;' > src/b.ts
git status --porcelain
pnpm exec ts-graph . --format markdown
git status --porcelain
git diff -- src/b.ts
```

version が `0.1.0`、解析出力が Mermaid code block で `a.ts` → `b.ts` の依存と
`b.ts` の modified 表示を含むことを確認する。前後の status がどちらも ` M src/b.ts` のみで、
`git diff` に `b = 1` から `b = 2` への変更が残ることを確認する。
この一時 project は本番 registry から取得する。既存の `test:pack` が確認するローカル tarball と区別する。

## 7. 公開記録を残す

元の repository に戻り、公開元の commit を対象に `v0.1.0` tag と GitHub Release を作ることを推奨する。
作成時点の HEAD を無条件に使わず、手順1で控えた公開元 SHA と一致させる。
HANDOFF に公開日時、version、dist-tag、公開元 SHA、導入確認結果を追記する。
tag / GitHub Release の作成と記録更新は公開成功後に行う。

## 参照

- [pnpm 10 publish](https://pnpm.io/10.x/cli/publish): public、dist-tag、dry-run、Git チェック。
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/): 公開済み version の扱い。
- [npm scoped public package](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/): 認証と public 公開。
- [公開準備の調査記録](./npm-release-readiness.md)
