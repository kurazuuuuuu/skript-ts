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

サンプルプログラムは [`examples/`](examples/) にあります。v0 の5本
（参加ウェルカム、キットコマンド、チャットログ中継、死亡カウンタ、
スポーンコマンド）、エンジン内蔵機能ごとのサンプル、コア言語
（比較・論理・算術）の `logic.ts`、そしてリスト変数・拡張ループ・
`while`・`wait` の `lists.ts` です。ゴールデンテストのフィクスチャ
も兼ねています。

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
| `listAdd(list, value)` | `add <value> to {list::*}` |
| `listRemove(list, value)` | `remove <value> from {list::*}` |
| `deleteVar(target)` | `delete {var}` / `delete {list::*}` |
| `loopList(list, body)` | `loop {list::*}:` |
| `loopTimes(count, body)` | `loop <n> times:` |
| `loopRange(from, to, body)` | `loop numbers from <a> to <b>:` |
| `whileLoop(cond, body)` | `while <cond>:`（葉条件のみ、下記） |
| `wait(amount, unit)` | `wait <n> ticks` / `seconds` / `minutes` |

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
| `listVar(name)` | `{name::*}` | `%{name::*}%` |
| `listSize(list)` | `size of {name::*}` | `%size of {name::*}%` |
| `loopValue()` | `loop-value` | `%loop-value%` |
| `loopIndex()` | `loop-index` | `%loop-index%` |
| `str(s)` | `"<s>"` | 素のテキスト |
| `num(n)` / `bool(b)` | `42` / `true` | 同じ |
| `item(name)` | `diamond sword` | 同じ |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `plus(a, b)` / `minus(a, b)` / `times(a, b)` / `dividedBy(a, b)` | `(<a> + <b>)` など | `%(<a> + <b>)%` など |
| `remainder(a, b)`（5演算子は `arith(op, a, b)` でも可） | `mod(<a>, <b>)` | `%mod(<a>, <b>)%` |
| `fmt(...parts)` | `"<parts>"` | 外側の文字列に平坦化 |

算術の意味論（本家 Skript 2.17.1 の実挙動で裏取り済み）: 被演算子は
原則として両方とも数値です。例外は `+` で、両方が文字列なら連結に
なります（`"5" + "6"` は数値の 11 ではなく文字列 `"56"`）。それ以外の
型の組み合わせ（文字列と数値の混在も、どちらの順でも）はエラーに
ならず「値なし」になります。除算は実数除算で、ゼロ除算は doubles の
規則に従います（`1 / 0` は Infinity）。出力は常に括弧で囲むため、
Skript 自身の演算子優先順位に依存しません。剰余は Skript の
`mod()` 関数です（Skript に中置の剰余演算子はありません）。数学的
剰余で、結果の符号は除数に一致します（`mod(-1, 10)` は `9`）。
除数がゼロのときは NaN です。

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
| `equals(a, b)` | `<a> is <b>` |
| `notEquals(a, b)` | `<a> is not <b>` |
| `greaterThan(a, b)` | `<a> is greater than <b>` |
| `greaterOrEqual(a, b)` | `<a> is greater than or equal to <b>` |
| `lessThan(a, b)` | `<a> is less than <b>` |
| `lessOrEqual(a, b)` | `<a> is less than or equal to <b>` |
| `and(c1, c2, ...)` / `or(c1, c2, ...)` / `not(c)` | 入れ子の `if`/`else` へ展開（下記） |

比較の意味論（推測ではなく本家 Skript 2.17.1 の実挙動で裏取り済み）:
文字列の等値は **大文字小文字を区別しません**。異なる型の値は決して
等しくなりません（数値の `1` と文字列 `"1"` は非等値）。**値なし**
（未設定の変数）は何とも等しくなく、値なし同士でも等しくありません。
不等値は等値の厳密な否定で、未設定の変数は「0 ではない」が真に
なります。大小比較は数値のみに有効で、文字列や型の混在は偽に
なり、否定形も厳密な否定です（比較不能な組は「より大きくない」が
真）。エンジン jar も同じ意味論をネイティブに実装しています。

論理演算は `.sk` のテキストとしては出力しません。Skript 2.17.1 は
条件位置の接続表現を、試した全ての形（裸・括弧つき・他の条件との
混在）でパース拒否し、一般の `not` 条件も存在しないからです。
そのため `ifElse` は論理を制御フローへ展開します。`and` は2番目の
検査を1番目の中に入れ子にし（else 節を複製）、`or` は else 節側へ
入れ子にし、`not` は else がある場合は分岐交換、ド・モルガンの
適用、そして Skript ネイティブの否定形（`is not ...`、
`does not have permission`）を使い分けます。このサブセットの条件は
純粋（副作用なし）なので、この展開は意味論的に厳密です。エンジン
側は `and`/`or`/`not` を直接評価します。

### リスト・ループ・while・wait

リストの意味論（推測ではなく、本家 Skript 2.17.1 へのプローブで
裏取り済み）。リストは独立した値ではなく、通常の変数ストアにある
`{name::<index>}` エントリの集合です。そのため永続化もスカラーと
同じ経路に乗り、エンジンでは `variables.json` に `name::index`
キーとして個別に保存されます。

- **添字の同定**: 式で計算された添字では、数値 `5` と文字列 `"5"` は
  **同じエントリ**です（同定は文字列表現によります）。変数名と
  文字列添字は大文字小文字を区別しません（小文字化して格納）。
- **走査順**: 文字列添字が先（数値らしい文字列は値の順、それ以外は
  アルファベット順）、その後に数値添字の昇順です。`loopList` は
  `loopValue()` と `loopIndex()` の両方を設定し、添字をテキストとして
  描くときは素の形（`color`、`1`）になります。
- **`listAdd`** は未使用の最小の正整数添字へ追加します。添字を指定して
  消すと**穴が残り**、詰め直しはされません。`deleteVar(listVar(name))`
  でリスト全体を消去しますが、素の `{name}` の削除では消えません。
- **`listRemove`** は一致する要素のうち**最初の1つだけ**（走査順）を
  消します。等値判定はフェーズ11の規則に従います。
- リストをテキストとして使うと `a, b and c` の形に連結されます
  （2要素なら `a and b`、1要素なら要素そのもの）。文字列の中で
  値が無い箇所は `<none>` と描かれます。未設定のスカラーや存在しない
  添字についても同様で、両ランタイム共通です。

ループの形： `loopTimes` は `loopValue()` を 1 から回数まで数え
（小数の回数は切り捨て）、`loopIndex()` は**持ちません**。Skript は
この位置の loop-index をパースエラーとして拒否し（"There's no loop
that matches 'loop-index'"）、プレイヤーループも同様です。添字を
持つのはリストループだけです。`loopRange` は両端を含み、開始が
終了より大きいと降順になります（`numbers from 4 to 2` は 4, 3, 2）。

`whileLoop` は反復のたびに条件を再評価します。ヘッドに置けるのは
葉条件か `not(葉条件)` のみです。`while` のヘッドは `if` のように
制御フローへ展開できず、Skript にはテキストの接続表現が存在しない
（フェーズ11の知見）ため、複合条件の `and`/`or`/`not` はビルダが
構築時に拒否します。

`wait` はトリガの残りを suspend します。後続の処理——囲んでいる
ブロックの残り、囲んでいるループの残りの反復、ループの後の文——は
指定時間の後に順序通り実行されます。Skript 側ではランタイム自身の
遅延挙動、エンジン側では Bukkit スケジューラ上の継続
（continuation）として同じ意味論を実装しています。量は小数も可
（`wait 0.5 seconds`）で、単位は `ticks` / `seconds` / `minutes` です。

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

### skript-db 第1弾: SQL データソース

データソースは値です。ドキュメント化された URL から作って変数に入れて使います（`set(variable("sql"), dataSource(str("sqlite:data.db")))`。skript-db がドキュメントに示す形と同じです）。対応する URL 形式は `sqlite:<パス>`（相対パスは `plugins/skript-ts/data/` 配下に解決）、`mysql://ホスト[:ポート]/db?user=..&password=<redacted> と `postgresql://...` で、認証情報はクエリパラメータで渡します。データソースは実行時のみの値で、`variables.json` には書き出されません（認証情報がファイルに残りません）。作るだけでは接続は開きません。

`dbExecute` は文を1つ実行します。クエリはテキスト式で、リテラル部分は作者自身の SQL、`fmt(...)` の式部分はすべて JDBC パラメータとしてエンジンが束縛し、SQL テキストへは決して埋め込みません。SQL のように見える値もデータとして格納されるため、skript-db の `unsafe` のようなオプトアウトは必要ありません。格納先の変数を渡すと、結果セットは `<変数>::<列名>::<行番号>` の形のエントリに対応付けられ（行は1始まり、変数配下の旧エントリは先に消去されます）、変数自体には行数が入ります。結果セットのない文では、変数に影響行数が入ります。実行は呼び出しスレッドで同期的に行われ、接続は実行ごとに開閉します。失敗は例外にならず、`dbLastError()` で読み取れます。JDBC ドライバはサーバー側が提供します（Paper は SQLite と MySQL のドライバを同梱しています）ので、エンジン jar には同梱しません。サーバーが持たないドライバのデータソースは、最終エラー式を通じて綺麗に失敗します。サンプルは `examples/skriptdb.ts` です。

| TypeScript | 意味 |
| --- | --- |
| `dataSource(url)` | ドキュメント化された URL からデータソース値を作る |
| `dbExecute(ds, query)` | SQL 文を1つ実行する |
| `dbExecute(ds, query, var)` | 実行し、結果／影響行数を変数へ格納する |
| `dbLastError()` | 最後に失敗した実行のメッセージ（成功後は値なし） |

検証は `examples/behavior/skriptdb.behavior.ts` でローカルの SQLite ファイルに対して行います（DDL、パラメータ束縛の insert、格納結果の読み戻し、インジェクション試行のデータ化、エラーの経路）。この環境ではサーバープロセスからの外向き TCP が制限されているためネットワーク DB は実地検証できず、MySQL 等はドキュメント化された URL 契約から実装した未検証の扱いです。検証済みの経路は SQLite です。

### skUtilities 第1弾: テキストファイル中核

skUtilities は GPL-3.0 のアドオンのため、このスライスもエンジン本体と同じく、ドキュメント化された振る舞いのみからのクリーンルーム再実装です（アドオンのコードは参照していません）。看板領域はファイル操作で、今回はその中核（作成、削除、全書き、追記、読み取り、行数と行の取得、存在確認）を対象にします。

パスはテキスト式で、エンジンのファイルルート `plugins/skript-ts/files/` の中に閉じ込められます。相対パスはその配下に解決し、絶対パスと正規化後にルートを抜けるパスは拒否します（文は何もせず、式は値なし、条件は false）。原典はパスについて意図的に非制限的です（README にサーバーへ損害を与えうる旨の注意書きがあります）ので、この閉じ込めはドキュメント化された振る舞いではなく、エンジン側の意図的な安全規則です。`fileCreate` は親ディレクトリと空ファイルを作り、既存ファイルの中身は変えません。`fileWrite` はファイル全体を置き換え（UTF-8）、`fileAppend` はテキスト＋改行を追記し、`fileDelete` は通常ファイルか**空の**ディレクトリだけを消します（再帰削除はありません）。`fileContents` は全文を1つの文字列で返し、`fileLine` は1始まり、`fileLineCount` は行数を数えます（空ファイルは 0）。3つともファイルが無ければ値なしです。失敗は例外にならず、エンジン側に警告ログを残します。サンプルは `examples/skutil.ts` です。

| TypeScript | 意味 |
| --- | --- |
| `fileCreate(path)` | 空ファイルを作成（親も作成）、既存ファイルはそのまま |
| `dirCreate(path)` | ディレクトリを親ごと作成 |
| `fileDelete(path)` | 通常ファイルか空のディレクトリを削除 |
| `fileWrite(path, text)` | ファイル全体をテキストで置き換え |
| `fileAppend(path, text)` | テキスト＋改行をファイルへ追記 |
| `fileContents(path)` | ファイルの全文（無ければ値なし） |
| `fileLine(path, n)` | ファイルの n 行目（1始まり。範囲外・無ければ値なし） |
| `fileLineCount(path)` | ファイルの行数（無ければ値なし） |
| `fileExists(path)` | 条件: そのパスにファイルかディレクトリが存在する |

検証は `examples/behavior/skutil.behavior.ts` で行います（作成→追記→全文の読み戻し→行ごとの読み戻し→行数→`../` 脱出の拒否→削除）。アドオンの URL 系機能（テキスト取得・ダウンロード）はこの環境ではサーバープロセスからの外向きネットワークが制限され検証できないため、今回の対象外です。

### Ersatz 第1弾: PlaceholderAPI 連携

Ersatz は Skript と PlaceholderAPI の橋渡しアドオンで、このスライスはその橋渡しをエンジンへ内蔵するクリーンルーム再実装です（GPL-3.0 のためアドオンのコードは参照していません。着手前に出所も確定させました。原著作者は Pikachu920 で、現存リポジトリは改名済みアカウント配下にある著者本人のもので、初日から GPL-3.0 です。詳細は `docs/addon-inventory.md`）。PlaceholderAPI 自体は外部プラグインのままです。エンジンは `softdepend` で任意依存とし、検証ハーネスは公式 2.12.3 の jar（`engine/fetch-libs.sh` がチェックサム固定で取得）をエンジンと並べてサンドボックスへ配置します。PlaceholderAPI の無いサーバーでは橋渡しは単に無効で、取得式は値なし、リクエストイベントは発火しません。

読み取り側: `placeholderValue(player, text)` は、そのプレイヤーについてテキスト中の PAPI プレースホルダを評価します。`%...%` を含まないテキストは単一のプレースホルダ名として扱い（文書化された裸名の形。例: `player_ping`）、トークンを含むテキストは文字列全体を置換します。誰も解決できないプレースホルダは、PAPI 自身の契約通り文字列にそのまま残ります。

提供側: `onPlaceholderRequest(prefix, body)` で、その prefix（PAPI 拡張の識別子）へのリクエストにスクリプトが応答します。本文では `placeholderIdentifier()` がリクエストのパラメータ部（`%prefix_<identifier>%`）、`placeholderPrefix()` がマッチした prefix、`player()` が評価対象のプレイヤー（オフライン／コンソール由来では値なし）です。`setPlaceholderResult(text)` で返答を決め、設定しなければそのプレースホルダは未解決のままになります。登録はロードされたプログラムに追随し、スクリプトのリロードごとに再同期します。メインスレッド外から来たリクエストは、上限つきでメインスレッドへ移して処理します。サンプルは `examples/ersatz.ts` です。

| TypeScript | 意味 |
| --- | --- |
| `placeholderValue(player, text)` | テキスト中の PAPI プレースホルダをプレイヤーについて評価（裸名／全体置換） |
| `onPlaceholderRequest(prefix, body)` | イベント: その prefix のプレースホルダが要求された |
| `placeholderIdentifier()` | リクエストのパラメータ部（イベント内） |
| `placeholderPrefix()` | マッチした prefix（イベント内） |
| `setPlaceholderResult(text)` | 処理中のリクエストへ返答する |

検証は `examples/behavior/ersatz.behavior.ts` で、実物の PlaceholderAPI を通した往復として行います（自前の2つの prefix を提供し、裸名・前後にリテラルを持つ全体置換・対象プレイヤー名の解決を読み戻し、解決できないプレースホルダがリテラルのまま残ることも確認）。relational プレースホルダ（後継アドオンで追加された発展機能）と MVdWPlaceholderAPI（別プラグイン）は今回の対象外です。コア言語に文字列の等値条件が加わった（フェーズ11）ため、ハンドラは identifier で分岐もできます。サンプルでは `%skriptts_name%` にプレイヤー自身の名前を返し、それ以外の identifier はエコーします。

## 開発

```sh
pnpm install
pnpm typecheck
pnpm test
```

## ライセンス

MIT — [LICENSE](LICENSE) を参照。Copyright (c) 2026 kurazuuuuuu.
