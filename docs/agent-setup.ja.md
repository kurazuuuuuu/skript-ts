# エージェント用セットアップガイド

新規クローンから `verify` の合格までを、AI コーディング
エージェント（またはそれを操作する人）が順に実行できる手順です。
各ステップに正確なコマンドと成功の目安を示します。失敗したら、
変則的な方法を試す前に[トラブルシューティング](#トラブルシューティング)を
確認してください。

英語版: [agent-setup.md](agent-setup.md)

## 0. 前提

| ツール | 要件 | 確認コマンド |
|---|---|---|
| Git | 最近のバージョン | `git --version` |
| Node.js | 20 以上 | `node --version` |
| pnpm | 12.15.0（`package.json` の `packageManager` で固定。Corepack が用意します） | `pnpm --version` |
| JDK | 21（Temurin など）— サンドボックスサーバー、エンジンのビルド、`verify` に必要 | `java -version` |

pnpm が無い場合は Corepack を有効化してください: `corepack enable`
（`package.json` に固定されたバージョンを使います）。

## 1. クローンとインストール

```sh
git clone https://github.com/kurazuuuuuu/skript-ts.git
cd skript-ts
pnpm install
```

成功の目安: `node_modules/` ができ、インストールが終了コード 0 で終わる。

## 2. 高速ゲート（サーバー不要）

```sh
pnpm typecheck
pnpm test
```

成功の目安: typecheck が終了コード 0、vitest の実行が全テスト合格。
ゴールデンテストは、全構成要素とサンプルプログラムを
`tests/fixtures/` の期待 `.sk` 出力と比較します。

## 3. サンドボックスサーバーの用意

`verify` は `server/` ディレクトリ（gitignore 対象）から使い捨ての
Paper サーバーを起動します。初回だけ用意してください。

1. レイアウトを作る:

   ```sh
   mkdir -p server/plugins
   ```

2. **Paper 1.21.11** のサーバー jar を `server/paper.jar` に置く
   （https://papermc.io/downloads から 1.21.11 のビルドを取得）。

3. **Skript 2.17.1** のプラグイン jar を `server/plugins/Skript.jar`
   に置く（https://github.com/SkriptLang/Skript/releases の
   リリース 2.17.1 から取得）。

4. `server/eula.txt` で Minecraft の EULA に同意する:

   ```sh
   printf 'eula=true\n' > server/eula.txt
   ```

CLI が Java を探す順序は、`--java <path>` フラグ、`SKRIPT_TS_JAVA`
環境変数、`PATH` 上の `java` です。JDK 21 がデフォルトの `java` で
ない場合は、ステップ4で明示してください
（例: `--java /path/to/jdk21/bin/java`）。

## 4. 初回検証（Skript モード）

リポジトリのルートから:

```sh
bin/skript-ts.mjs verify --json
```

実行内容: 型チェック → サンプルのトランスパイル → サンドボックスへ
配置 → Paper 起動 → ロードチェック（初回ロードと
`skript reload all`）→ mineflayer の振る舞いテスト → 停止。
`--json` では進捗が標準エラーへ出て、結果の JSON が標準出力に
1つだけ出ます。終了コードが 0 なのは全ステージ合格の時だけです。

成功の目安: 終了コード 0 で、JSON の結果が全ステージ緑、
振る舞いテスト27スイート全合格を示すこと。Skript のパースエラーは
`.sk.map.json` のソースマップ経由で TypeScript の位置に
対応付けて報告されます（例: `death.sk:2 → examples/death.ts:5:5`）。
直すのは TypeScript 側で、生成された `.sk` ではありません。

便利なバリエーション:

- `bin/skript-ts.mjs verify --no-behavior` — ロードチェックのみ
  （速い代わりに、振る舞いは証明しません）。
- `bin/skript-ts.mjs build --deploy` — サーバーを起動せずに
  トランスパイルと配置だけを行う。

## 5. エンジン jar（任意、エンジンモードの作業用）

```sh
engine/fetch-libs.sh   # コンパイル用ライブラリを取得し SHA-512 を照合
engine/build.sh        # -> engine/build/skript-ts.jar
bin/skript-ts.mjs verify --engine --json
```

`engine/build.sh` は JDK 21 をまず `$SKRIPT_TS_JDK` から探します。
見つからない場合は `SKRIPT_TS_JDK=/path/to/jdk21` を設定して
ください。`verify --engine` は IR ファイルと jar を配置し、
`Skript.jar` を退避させるので、サンドボックスは Skript プラグイン
**なし**で起動します。その後で通常の `verify` を実行すれば
Skript モードに戻ります。両方のランタイムを同居させないで
ください — スクリプトが2回実行されてしまいます。

自分のサーバーへ入れる場合は、`engine/build/skript-ts.jar` を
そのサーバーの `plugins/` へ、生成された `<name>.ir.json` を
`plugins/skript-ts/scripts/` へコピーします。

## 6. スキルパックのインストール（エージェント駆動の開発用）

`skills` CLI サブコマンドの提供後は、[`skills/`](../skills/) の
スキルパックを次のコマンドでエージェントの skills ディレクトリへ
インストールできます。

```sh
npx github:kurazuuuuuu/skript-ts skills install
```

> **注記:** このコマンドは CLI に `skills` サブコマンドが実装されて
> から有効になります。それまでは `skills/skript-ts/` ディレクトリを
> エージェントの skills ディレクトリへ手動でコピーしてください
> （Claude Code の場合: `~/.claude/skills/`）。

## テンプレートプロンプト

セットアップ一式を別の AI エージェントへ任せる場合は、下の
プロンプトをコピーし、`<プレースホルダ>` を差し替えてエージェント
（Claude Code 等）へ貼ってください。エージェントは
[この文書](#エージェント用セットアップガイド)を自分で辿り、
初回検証の結果まで報告することが期待されます。

```text
skript-ts の開発環境を構築し、リポジトリ自身の指示に従って
初回検証まで実行してください。

リポジトリ: https://github.com/kurazuuuuuu/skript-ts
まずリポジトリルートの AGENTS.md を読み、次に
docs/agent-setup.ja.md の手順を順に辿ってください。

私の環境:
- クローン先: <CLONE_DIR>
- JDK 21 の場所: <JAVA_HOME_OR_PATH_TO_JAVA>（"default" と
  書いた場合は PATH 上の java を使ってください）
- サンドボックスのサーバーディレクトリ: <SERVER_DIR>
  （既定はクローン内の server/ — 指定がなければ既定のまま）
- Paper のバージョン: 1.21.11（このプロジェクトでは固定。
  アップグレードしないでください）
- Skript のバージョン: 2.17.1（同上、固定です）

ルール:
- docs/agent-setup.ja.md に正確に従ってください。別のビルド・
  テスト手順に置き換えず、検証先は使い捨てのサンドボックス
  のみとし、実サーバーへは向けないでください。
- 全ステップを辿ってください: 前提の確認、pnpm install、
  pnpm typecheck、pnpm test、サンドボックスの用意
  （Paper jar、Skript jar、EULA）、最後に
  `bin/skript-ts.mjs verify --json`。
- ステップが失敗したら、変則的な方法を試す前に
  docs/agent-setup.ja.md のトラブルシューティングで原因を
  切り分け、失敗したステップを黙って飛ばさないでください。
- 終わったら報告してください: (1) verify が終了コード 0 で
  振る舞いテストが全て通ったかどうか、(2) 失敗したステップが
  あれば、そのコマンド、エラー出力、切り分けた原因、試した
  こと、(3) 私の環境が文書の前提と違う点。
```

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `verify` で `java` が見つからない／バージョンが違う | JDK 21 がデフォルトになっていません。`--java /path/to/jdk21/bin/java` を渡すか `SKRIPT_TS_JAVA` を設定してください。 |
| `engine/build.sh` で `javac not found` | `SKRIPT_TS_JDK=/path/to/jdk21` を設定して再実行してください。 |
| `engine/fetch-libs.sh` で SHA-512 が一致しない | ダウンロードした jar が壊れているか別バージョンです。`engine/libs/` の該当ファイルを削除して再実行してください。 |
| サーバーが起動しない／ログに EULA のメッセージ | `server/eula.txt` が無いか `eula=true` を含んでいません。ステップ3を確認してください。 |
| Address already in use（ポート25565） | 別のサーバーか、残ったサンドボックスがポートを掴んでいます。止めてください。前回の `probe` が残っている場合は `bin/skript-ts.mjs probe stop` が、プロセスと `session.lock` の残存がないことを確認して停止します。 |
| 生成された `.sk` に Skript がパースエラーを出す | JSON の結果が TypeScript の位置に対応付けてくれます。直すのは `.ts` 側で、生成された `.sk` は編集しません（再生成されます）。構成要素自体が未対応ならサブセットの範囲外です — [reference.ja.md](reference.ja.md) を確認してください。 |
| エンジン内蔵機能を使ったスクリプトで `.sk` が生成されない | 仕様どおりです。内蔵構成要素には `.sk` 形式が無く、ビルドは IR のみを書きます。`verify --engine` で実行してください。 |
| Skript とエンジンの両方がスクリプトを実行しているように見える | 前回の `--engine` 実行でサンドボックスがエンジンモードのまま（またはその逆）になっています。通常の `bin/skript-ts.mjs verify` で Skript モードへ、`verify --engine` でエンジンモードへ戻してください — 各実行がモードを排他的に設定します。 |
| 振る舞いテストがチャットメッセージ待ちでタイムアウトする | サンドボックスのワールドは実行を跨いで残るため、周囲の活動で期待メッセージが埋もれることがあります。`verify` を再実行（プレイヤー状態を消してから起動します）し、コードを変える前に失敗したスイートの期待値を確認してください。 |
