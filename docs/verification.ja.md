# 検証とビルド／検証 CLI

skript-ts の検証方法と、ビルドと検証を駆動する CLI の説明です。
README から移設しました。

## 検証

2段構えで、両方必須です。

1. **ゴールデンテスト** — `pnpm typecheck` と `pnpm test`（vitest）。
   全構文要素と全サンプルプログラムを [`tests/fixtures/`](../tests/fixtures/) の
   期待 `.sk` 出力と照合します。
2. **実サーバー検証** — 出力したサンプル `.sk` を、Skript プラグインを入れた
   実際の Paper サーバーに読み込ませ、コンソールログに Skript のエラーが
   出ないことを合格条件とします。検証環境は `server/`（gitignore 済み）:
   Paper 1.21.11、Skript 2.17.1、Temurin JDK 21。
   `pnpm exec tsx examples/to-sk-files.ts` で、中核サンプル5本
   （welcome、kit、chatlog、death、spawn）の `.sk` を手動実行用に
   `server/plugins/Skript/scripts/` へ再生成できます。全サンプルの
   配置は CLI の `build --deploy` と `verify` が行います。

## ビルド／検証 CLI

`bin/skript-ts.mjs`（プロジェクトルートで実行）がパイプライン全体を
駆動します。進捗表示はステージごとに1行で、実行中のステージは TTY では
その行をその場で更新し、終わったステージは ✓／✗ 付きで残ります。
非 TTY では行の追記形式にフォールバックします。

```sh
# 型チェック → build/ へ変換（--deploy でサーバーへも配置）
bin/skript-ts.mjs build [--src examples] [--out build] [--deploy] [--engine] [--server-dir server] [--json]

# server/ の使い捨てサンドボックスに対する全検証
bin/skript-ts.mjs verify [--engine] [--no-behavior] [--no-fresh] [--json]
```

`verify` のステージは、型チェック → 変換 → 配置 → サーバー起動 →
読み込み確認（初回読み込み＋ `skript reload all`）→ 振る舞いテスト →
停止、です。`--json` では進捗は標準エラーへ出て、標準出力には
ステージ別成否・マッピング済みエラー・振る舞い結果を含む JSON が
1つだけ出ます。終了コードは全合格時のみ 0 です。

意味論プローブ向けの常駐モードもあります。`probe start` で
サンドボックスをバックグラウンドのホストプロセス配下に1回だけ
起動し、`probe run <probe-dir> [--commands <file>]` は手書きの
`.sk` プローブを scripts フォルダへ差し替えて再起動ではなく
リロードで回します。`probe stop` は残留プロセスと `session.lock` が
無いことを確認して停止し、`probe status` で起動状態を確認できます。

エンジンモードの開発向けに watch ループもあります。
`bin/skript-ts.mjs watch --server-dir server [--src <dir>] [--yes]` は、
エンジン jar で**すでに起動している**サーバーに対して動きます
（watch がサーバーを起動・停止することはありません）。保存のたびに
型チェック→変換→配置が走り、エンジンが再起動なしでリロードします。
CLI は配置の完了後にだけプラグインのデータフォルダへ
`reload.request` マーカーを書き、エンジンはそれをポーリングで
拾ってリロードし、`reload.status` で応答します。IR がバイト単位で
同一の場合は配置もリロードも丸ごとスキップされ、失敗したラウンドは
稼働中のプログラムに触れません。なおリロードでは名前付きタイマーが
リセットされ、periodical トリガーは再アンカーされます（初回発火は
リロードの1周期後）。グローバル変数は保持されます — 本家 Skript の
`/skript reload` と同じ意味論です。配置先が稼働中サーバーのため
`--server-dir` の明示が必須で、初回ラウンド前に配置先（サーバー
ディレクトリ、ワールド、MOTD、配置フォルダ）の確認を行います。

変換時には各 `.sk` の隣にソースマップ（`<name>.sk.map.json`）も出力され、
各行について生成元の AST ノードパスと TypeScript の呼び出し位置を
記録します。Skript がパースエラーを出した場合、`verify` はそれを
TypeScript 側の位置へ変換して報告します
（例: `death.sk:2 → examples/death.ts:5:5 (body[0].body[0])`）。

起動前に、`verify` はサンドボックスのプレイヤー状態（playerdata、
Skript の `variables.csv`、`ops.json`）を消去し、振る舞いテストが
まっさらな状態から始まるようにします。残す場合は `--no-fresh` を
指定します。

### 振る舞いテスト

読み込み確認は「パースできること」の証明で、振る舞いテストは
「実際に動くこと」の証明です。テストは `<src>/behavior/*.behavior.ts`
の TypeScript モジュールで、デフォルトエクスポートがコンテキスト
（`src/behavior.ts`）を受け取ります。[mineflayer](https://github.com/PrismarineJS/mineflayer)
のボットを実接続させ、チャットメッセージの到着、コンソールコマンド、
インベントリの内容を検証できます。`examples/behavior/` には27本のスイートがあり、参加時の
ブロードキャストと初回アイテム、`/kit` の権限フロー、OP 向け
チャットログ中継、死亡カウンタに加え、後続の全領域（論理、リスト、
関数、ゲームプレイ、イベント、テキスト、GUI、ワールド、プレイヤー
状態、表示、タイムスパン、ボスバー、コマンド定義、HTTP）と
エンジン内蔵機能をカバーします。

## CI とリリース

GitHub Actions（`.github/workflows/ci.yml`）は push と pull request の
たびに fast gates（`pnpm install --frozen-lockfile`、`pnpm check`、
`pnpm test`）とエンジン jar のビルドを実行します。`pnpm check` は
Vite+ のツールチェーン検査で、Oxfmt のフォーマットチェック、Oxlint、
tsgolint の型チェックを一括で実行します（`vite.config.ts` 参照）。上記のサーバーを
使う `verify` は CI v1 には含めません。実 Paper サーバーの起動が
重いため、振る舞い検証は Freestyle の検証ファームが担当します。
`v*` タグを push すると `.github/workflows/release.yml` が走り、
fast gates と依存関係監査を再実行して `skript-ts.jar` をビルドし、
jar と CLI 一式の zip と SHA-256 チェックサムファイルを添付した
GitHub Release（プレリリース）を作成します。成果物とチェックサム
ファイルには署名付きのビルド証明（attestation）が付きます
（[SECURITY.md](../SECURITY.md) 参照）。
