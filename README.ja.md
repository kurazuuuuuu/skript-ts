# skript-ts

Minecraft（Paper）サーバー向けの [Skript](https://github.com/SkriptLang/Skript)
スクリプトを **型付き TypeScript** で書き、`.sk` ファイルへ変換するトランスパイラです。

Skript の英語風 DSL は AI コーディングエージェントの学習データが極端に少なく、
エージェントがまともに書けません。TypeScript はその逆で、エージェントの学習量が
桁違いに多く、型チェックという機械的なガードレールが効きます。不正なプログラムは
サーバーに届く前に `tsc` で落ちます。skript-ts は TypeScript 上で AST を組み立てる
ビルダー方式の API と、そこから Skript ソースを出力するエミッタを提供します。

English: [README.md](README.md)

## 状態

試作（v0）。これに加えて、同じサブセットを Skript プラグインなしで Paper 上で直接実行するクリーンルーム実装の**エンジン jar**があります（後述の「エンジン jar」節）。バージョニングは日付形式 `vYYYY.MM.DD`（例: `v2026.11.11`）で統一します。

## クイックスタート

```ts
import {
  script, onJoin, onFirstJoin, broadcast, send, give, set,
  player, fmt, variable, bool, emit,
} from "skript-ts";

const prog = script(
  onFirstJoin([
    broadcast(fmt("ようこそ、", player(), " さん！")),
    give(player(), "wooden sword", 1),
    set(variable("welcomed", player()), bool(true)),
  ]),
  onJoin([
    send(player(), fmt("おかえりなさい、", player(), " さん")),
  ]),
);

console.log(emit(prog));
```

出力:

```skript
on first join:
    broadcast "ようこそ、%player% さん！"
    give 1 wooden sword to player
    set {welcomed::%player%} to true

on join:
    send "おかえりなさい、%player% さん" to player
```

完成したサンプルプログラム5本（参加ウェルカム、キットコマンド、チャットログ中継、
死亡カウンタ、スポーンコマンド）は [`examples/`](examples/) にあり、
ゴールデンテストのフィクスチャも兼ねています。

## 対応サブセット（SPEC、v0）

ここに無いものは v0 の範囲外です。

### イベント
| TypeScript | Skript |
| --- | --- |
| `onJoin` | `on join:` |
| `onFirstJoin` | `on first join:` |
| `onQuit` | `on quit:` |
| `onChat` | `on chat:` |
| `onDeath` | `on death:` |

### コマンド
`command(name, argType, body, argOptional?)` — 引数は最大 **1つ**。
`argType` は `"text"` / `"player"` / `"integer"`。省略可能引数は `[<type>]`、
必須引数は `<type>` と出力されます。本体は `trigger:` セクションになります。

### エフェクト（文）
| TypeScript | Skript |
| --- | --- |
| `send(target, text)` | `send "<text>" to <target>` |
| `broadcast(text)` | `broadcast "<text>"` |
| `give(target, itemName, amount)` | `give <amount> <item> to <target>` |
| `teleport(target, location)` | `teleport <target> to <location>` |
| `set(variable, value)` | `set {var} to <value>` |
| `add(variable, value)` | `add <value> to {var}` |
| `ifElse(cond, then, else?)` | `if <cond>:` … `else:` |
| `loopPlayers(body)` | `loop all players:` |

### 式
| TypeScript | 値の位置 | 文字列の中 |
| --- | --- | --- |
| `player()` | `player` | `%player%` |
| `eventPlayer()` | `event-player` | `%event-player%` |
| `loopPlayer()` | `loop-player` | `%loop-player%` |
| `victim()` | `victim` | `%victim%` |
| `argument(n)`（1始まり） | `arg-<n>` | `%arg-<n>%` |
| `chatMessage()` | `message` | `%message%` |
| `variable(name)` | `{name}` | `%{name}%` |
| `variable(name, index)` | `{name::%<index>%}` | `%{name::%<index>%}%` |
| `str(s)` | `"<s>"` | 素のテキスト |
| `num(n)` / `bool(b)` | `42` / `true` | 同じ |
| `item(name)` | `diamond sword` | 同じ |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `fmt(...parts)` | `"<parts>"` | 外側の文字列に平坦化 |

注意: `on death` イベントには `player` が存在せず、Skript にエラーとして
弾かれます（"There's no player in an on death event"）。死亡したプレイヤーは
`victim()` で表します。これは Skript 2.17.1 での実サーバー検証で見つかった
もので、まさにその検証段の存在理由です。

注意: 文字列の中で変数の値を展開するには `%...%` で囲む必要があります。
文字列内の素の `{...}` は Skript ではリテラル文字列として扱われます
（エラーにはならず、誤ったテキストがそのまま送信されます）。この囲みは
エミッタが行います。この問題は読み込み確認ではなく、後述の振る舞い
テストで検出されました。

### 条件
| TypeScript | Skript |
| --- | --- |
| `hasPermission(target, "node")` | `<target> has permission "node"` |
| `isOp(target)` | `<target> is op` |

### 文字列のエスケープ
リテラルテキストは Skript の規則に従います。`"` は `""` に、リテラルな `%` は `%%` に
二重化します。対象は `str()` の値、`fmt()` のリテラル部分、権限文字列で、
出力済みプレースホルダには適用しません。

## 検証

2段構えで、両方必須です。

1. **ゴールデンテスト** — `pnpm typecheck` と `pnpm test`（vitest）。
   全構文要素と全サンプルプログラムを [`tests/fixtures/`](tests/fixtures/) の
   期待 `.sk` 出力と照合します。
2. **実サーバー検証** — 出力したサンプル `.sk` を、Skript プラグインを入れた
   実際の Paper サーバーに読み込ませ、コンソールログに Skript のエラーが
   出ないことを合格条件とします。検証環境は `server/`（gitignore 済み）:
   Paper 1.21.11、Skript 2.17.1、Temurin JDK 21。
   `pnpm exec tsx examples/to-sk-files.ts` で `.sk` を
   `server/plugins/Skript/scripts/` へ再生成できます。

## ビルド／検証 CLI

`bin/skript-ts.mjs`（プロジェクトルートで実行）がパイプライン全体を
駆動します。進捗表示はステージごとに1行で、実行中のステージは TTY では
その行をその場で更新し、終わったステージは ✓／✗ 付きで残ります。
非 TTY では行の追記形式にフォールバックします。

```sh
# 型チェック → build/ へ変換（--deploy でサーバーへも配置）
bin/skript-ts.mjs build [--src examples] [--out build] [--deploy] [--server-dir server]

# server/ の使い捨てサンドボックスに対する全検証
bin/skript-ts.mjs verify [--no-behavior] [--no-fresh] [--json]
```

`verify` のステージは、型チェック → 変換 → 配置 → サーバー起動 →
読み込み確認（初回読み込み＋ `skript reload all`）→ 振る舞いテスト →
停止、です。`--json` では進捗は標準エラーへ出て、標準出力には
ステージ別成否・マッピング済みエラー・振る舞い結果を含む JSON が
1つだけ出ます。終了コードは全合格時のみ 0 です。

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
インベントリの内容を検証できます。同梱のサンプルは、参加時の
ブロードキャストと初回アイテム、`/kit` の権限フロー、OP 向け
チャットログ中継、死亡カウンタをテストします。`examples/behavior/`
を参照してください。

## エンジン jar（Skript プラグインなし）

目標像は「TS で書ける実質的な Skript 本体」であり、単なる変換層ではありません。`engine/` は skript-ts のプログラムを単独で実行する Paper プラグイン（`skript-ts.jar`）です。

- TS 側のビルドは各 `.sk` の隣に **IR** ファイル（`<name>.ir.json`）を出力します。スクリプト AST の JSON で、TS の呼び出し位置情報は含みません
- エンジンは `plugins/skript-ts/scripts/` の IR を読み込み、スクリプトのコマンドをサーバーのコマンドマップへ登録し、サブセットのイベントを受けてエフェクト・式・条件を解釈実行します。変数は `plugins/skript-ts/variables.json` に永続化します
- `/skript-ts reload` で IR フォルダを再読み込みします。読み込みのたびに `Loaded N script(s), M top-level structure(s)` をログに出し、失敗したファイルは `Failed to load <file>: ...` と記録します

エンジンは**クリーンルーム再実装**です。Skript は GPL のためコードは持ち込まず、v0 サブセットの振る舞い契約だけを共有します。その契約は上記 SPEC で規定し、変換された `.sk` を検証するのと同じ mineflayer 振る舞いテスト4本で固定しています（エンジン内蔵機能にはエンジン専用のテストが加わります）。解釈の余地がある点の確定事項: 初回参加では `on first join` と `on join` の両方が発火する（Skript と同じ）、プレイヤーをキーにする変数はプレイヤー名で引く、整数の数値は小数部なしで表示する（`1.0` ではなく `1`）。

### jar のビルド

VM には Java がないため、`~/workspace/tools` の Temurin JDK 21 を使います。コンパイル用ライブラリは `engine/libs/`（gitignore 対象）に置き、初回だけチェックサム検証つきで取得します。Java の HTTPS はこの VM のプロキシを通れないため、取得は curl で行います。

```sh
engine/fetch-libs.sh   # paper-api 等をダウンロード＋SHA-512 検証
engine/build.sh        # -> engine/build/skript-ts.jar
```

### エンジンの検証

```sh
bin/skript-ts.mjs verify --engine [--json]
```

ステージ構成は通常の verify と同じですが、配置で IR を `plugins/skript-ts/scripts/` に置き、`skript-ts.jar` を導入して `Skript.jar` を退避します。つまりサンドボックスは**エンジンだけ**で起動します。読み込み確認は `skript-ts reload` を実行し、エンジンの要約行が配置したスクリプト数と一致し、読み込み失敗がないことを要求します。通常の `verify` を後から実行すると `Skript.jar` が復帰しエンジン jar が除去されるため、2つのモードが混ざることはありません。

## エンジン内蔵機能（アドオンをエンジンへ内蔵）

主要アドオンは別プラグインにはせず、機能をエンジンへネイティブに再実装していく方針です（アドオンごと、文書化された振る舞いのみに基づくクリーンルーム。エンジン本体と同じルール）。内蔵構文には **`.sk` の形がありません**。使ったスクリプトは「エンジン専用」となり、ビルドは IR のみを出力し、Skript モードの配置からは除外され、`emit()` にかけるとエラーになります。内蔵機能の振る舞いテストは `verify --engine` のときだけ本体を実行します（テストコンテキストの `t.mode` で判定し、Skript モードでは何もせず合格）。サンプルは `examples/mundosk.ts` です。

### MundoSK 第1弾: WebSocket クライアント＋ワールドボーダー

WebSocket 接続はスクリプトが選んだ id で名前付けされ、エンジン内に保持されます（実体は JDK 標準の `java.net.http.WebSocket`）。接続が開く前に送信されたメッセージはキューに入り、開いた順に送られます。close イベントは、どちらが切断しても発火します。

| TypeScript | 意味 |
| --- | --- |
| `wsConnect(id, url)` | WebSocket クライアント接続を開く |
| `wsSend(id, text)` | テキストメッセージを送る |
| `wsDisconnect(id)` | 接続を閉じる |
| `onWsOpen(body)` | イベント: 接続が開いた |
| `onWsMessage(body)` | イベント: テキストを受信した |
| `onWsClose(body)` | イベント: 接続が閉じた |
| `wsMessage()` | 受信したテキスト（`onWsMessage` 内） |
| `wsId()` | 接続 id（WebSocket イベント内） |
| `worldOf(target)` | プレイヤー／場所のワールド |
| `borderSize(world)` | そのワールドのボーダーの現在のサイズ |
| `borderCenter(world)` | そのワールドのボーダーの中心位置 |
| `setBorderSize(world, size)` | ボーダーのサイズを設定 |
| `setBorderCenter(world, location)` | ボーダーの中心を設定 |

検証は `examples/behavior/mundosk.behavior.ts`（ローカルの RFC 6455 エコーサーバーに対する 接続→エコー→ブロードキャスト→切断）と `examples/behavior/mundosk-border.behavior.ts`（設定＋読み戻し）で行います。なお WebSocket のテストは、サーバープロセスから外向き TCP が許可されている必要があります。環境側で直接 TCP が拒否されている場合、接続はエンジンのエラーログ経由で綺麗に失敗し、この1本だけがタイムアウトします。

### SharpSK 第1弾: タイマー

SharpSK の大半は他プラグインへのフックで、単独で効く看板機能は名前付きカウントダウンタイマーです。ここでは Bukkit スケジューラの上で再実装しています。タイマーは1秒ごとに進みます。先に残り時間を減らし、残りが正の間は tick イベントが発火し、0 に達すると complete イベントが発火してタイマーは消滅します。停止は complete を発火せずに除去し、一時停止は凍結します（active のまま、tick は止まります）。同名で作り直すとリスタートします。スクリプトのリロードで全タイマーは破棄されます。サンプルは `examples/sharpsk.ts` です。

| TypeScript | 意味 |
| --- | --- |
| `timerCreate(id, seconds)` | 名前付きカウントダウンを開始（同名あれば再開始） |
| `timerStop(id)` | complete を発火せずにタイマーを除去 |
| `timerPause(id)` | カウントダウンを凍結 |
| `timerResume(id)` | 一時停止したタイマーを再開 |
| `onTimerTick(body)` | イベント: タイマーが進んだ（1秒ごと） |
| `onTimerComplete(body)` | イベント: カウントダウンが 0 に達した |
| `timerId()` | タイマーの名前（タイマーイベント内） |
| `timerTimeLeft(name)` | 名前付きタイマーの残り秒数 |
| `timerActive(name)` | 条件: 名前付きタイマーが存在する（実行中または一時停止中） |

検証は `examples/behavior/sharpsk.behavior.ts`（完了までの全カウントダウン、一時停止での凍結、無言の停止）で行います。

## 開発

```sh
pnpm install
pnpm typecheck
pnpm test
```

## ライセンス

MIT — [LICENSE](LICENSE) を参照。Copyright (c) 2026 kurazuuuuuu.
