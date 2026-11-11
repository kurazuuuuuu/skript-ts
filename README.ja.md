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
（比較・論理・算術）の `logic.ts`、リスト変数・拡張ループ・
`while`・`wait` の `lists.ts`、カスタム関数の `functions.ts`、
ゲームプレイイベント（ブロック破壊／設置、クリック、
ダメージ）の `gameplay.ts`、イベントフィルタと取得／
ドロップ／リスポーン／就寝イベントの `events2.ts`、
テキスト操作の `text.ts`、アイテム・インベントリ・GUI の
`gui.ts`、ワールド操作（ブロック、位置、ワールドの時計と
天気）と周期トリガの `world.ts` です。
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
| `onBlockBreak` | `on block break:` |
| `onBlockPlace` | `on block place:` |
| `onRightClick` | `on right click:` |
| `onLeftClick` | `on left click:` |
| `onDamage` | `on damage:` |
| `onPickup` | `on pick up:` |
| `onDrop` | `on drop:` |
| `onRespawn` | `on respawn:` |
| `onBedEnter` | `on bed enter:` |
| `onBedLeave` | `on bed leave:` |

### コマンド
`command(name, argType, body, argOptional?)` — 引数は最大 **1つ**。
`argType` は `"text"` / `"player"` / `"integer"`。省略可能引数は `[<type>]`、
必須引数は `<type>` と出力されます。本体は `trigger:` セクションになります。

### エフェクト（文）
| TypeScript | Skript |
| --- | --- |
| `send(target, message)` | `send "<text>" to <target>`（任意の式。テキストは引用符つき、それ以外は素の値） |
| `broadcast(message)` | `broadcast "<text>"`（任意の式） |
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
| `returnValue(value)` | `return <value>`（`defineFunction` 内） |
| `stopTrigger()` | `stop`（トリガー／関数からの早期終了） |
| `callStmt(name, ...args)` | `<name>(<args>)` を単独の文として |
| `cancelEvent()` | `cancel event`（キャンセル可能なイベントのハンドラ内） |
| `uncancelEvent()` | `uncancel event` |
| `setDamage(value)` | `set damage to <value>`（`onDamage` 内） |
| `replaceAllIn(var, find, repl, caseSensitive?)` | `replace all <find> in {var} with <repl>`（指定時は `with case sensitivity`） |
| `replaceFirstIn(var, find, repl, caseSensitive?)` | `replace first <find> in {var} with <repl>` |

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
| `localVar(name)` / `localVar(name, index)` | `{_name}` / `{_name::%<index>%}` | `%{_name}%` |
| `localList(name)` | `{_name::*}` | `%{_name::*}%` |
| `call(name, ...args)` | `<name>(<args>)` | `%<name>(<args>)%` |
| `listSize(list)` | `size of {name::*}` | `%size of {name::*}%` |
| `loopValue()` | `loop-value` | `%loop-value%` |
| `loopIndex()` | `loop-index` | `%loop-index%` |
| `str(s)` | `"<s>"` | 素のテキスト |
| `num(n)` / `bool(b)` | `42` / `true` | 同じ |
| `item(name)` | `diamond sword` | 同じ |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `eventBlock()` | `event-block` | `%event-block%` |
| `eventItem()` | `event-item` | `%event-item%` |
| `attacker()` | `attacker` | `%attacker%` |
| `damageAmount()` | `damage` | `%damage%` |
| `damageCause()` | `damage cause` | `%damage cause%` |
| `typeOf(e)` | `type of <e>` | `%type of <e>%` |
| `plus(a, b)` / `minus(a, b)` / `times(a, b)` / `dividedBy(a, b)` | `(<a> + <b>)` など | `%(<a> + <b>)%` など |
| `remainder(a, b)`（5演算子は `arith(op, a, b)` でも可） | `mod(<a>, <b>)` | `%mod(<a>, <b>)%` |
| `fmt(...parts)` | `"<parts>"` | 外側の文字列に平坦化 |
| `textLength(t)` | `length of <t>` | `%length of <t>%` |
| `substring(t, from, to)` | `substring of <t> from <a> to <b>` | `%substring of <t> from <a> to <b>%` |
| `firstChars(t, n)` / `lastChars(t, n)` | `first <n> characters of <t>` / `last <n> characters of <t>` | `%first <n> characters of <t>%` など |
| `charAt(t, i)` | `character at <i> in <t>` | `%character at <i> in <t>%` |
| `upperCase(t)` / `lowerCase(t)` | `<t> in uppercase` / `<t> in lowercase` | `%<t> in uppercase%` など |
| `splitText(t, delim, caseSensitive?)` | `split <t> at <d>`（指定時は `with case sensitivity`） | `%split <t> at <d>%` |
| `joinText(list, delim?)` | `join <list>` / `join <list> with <d>` | `%join <list> with <d>%` |
| `colored(t)` / `formatted(t)` | `colored <t>` / `formatted <t>` | `%colored <t>%` など |
| `uncolored(t)` / `unformatted(t)` | `uncolored <t>` / `unformatted <t>` | `%uncolored <t>%` など |

算術の意味論（本家 Skript 2.17.1 の実挙動で裏取り済み）: 被演算子は
原則として両方とも数値です。例外は `+` で、両方が文字列なら連結に
なります（`"5" + "6"` は数値の 11 ではなく文字列 `"56"`）。それ以外の
型の組み合わせ（文字列と数値の混在も、どちらの順でも）はエラーに
ならず「値なし」になります。**値なしの被演算子は型違いとは別物**
です（フェーズ13のプローブで確定）。4つの中置演算子では、相手が
数値なら値なしは 0 として扱われます（未設定の変数 `+ 100` は `100`、
`* 2` は `0`、`5 /` 未設定 は Infinity）。相手が文字列・真偽値の
場合と、両辺とも値なしの場合は「値なし」になります。除算は実数
除算で、ゼロ除算は doubles の規則に従います（`1 / 0` は Infinity）。
出力は常に括弧で囲むため、Skript 自身の演算子優先順位に依存し
ません。剰余は Skript の `mod()` 関数です（Skript に中置の剰余
演算子はありません）。数学的剰余で、結果の符号は除数に一致します
（`mod(-1, 10)` は `9`）。除数がゼロのときは NaN です。なお
`mod()` は 0 代入をしません（被演算子が値なしなら結果も値なし）。

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
| `contains(a, b)` | `<a> contains <b>` |
| `startsWith(t, prefix)` | `<t> starts with <prefix>` |
| `endsWith(t, suffix)` | `<t> ends with <suffix>` |
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

### カスタム関数

`defineFunction(name, params, returnType, body)` で関数を定義し、
引数は `param(name, type, default?)` で宣言します。型は `number`、
`text`、`boolean`、`player`、`location`、`object` とその複数形
（`numbers`、`texts` など）に加え、単数形のみのゲームプレイ型
`block`、`item`、`entity` があります（後述の「ゲームプレイ
イベント」参照）。複数形の引数は最後尾に1つだけ
置けます（ビルダが強制します）。`returnType` は同じ型名のいずれか、
void 関数は `null` です。本体では引数とローカル変数を
`localVar(name)` / `localList(name)`（`{_name}`、`{_name::*}`）で
扱い、`returnValue(v)` で戻し、`stopTrigger()` で早期終了します。
呼び出しは式の `call(name, ...args)` と文の `callStmt(name, ...args)`
です。定義は Skript の `function` セクションとして出力され、
エンジンは IR から登録します。関数はコア言語であり、同じ
スクリプトが両ランタイムで動きます。

意味論（本家 Skript 2.17.1 へのプローブで裏取り。値の位置でも
文字列の中でも確認済み）：

- **解決はシグネチャ単位**。定義順・ファイル順は無関係で、定義
  より前の呼び出しも、ファイル間の呼び出しも可能です。名前は
  **大文字小文字を区別**します。オーバーロード（同名・引数型違い）
  は引数の型で振り分けられます。Skript は静的に（パース時に）
  解決するため、引数の個数違い・リテラルの型違い・型なし変数
  経由のオーバーロード呼び出しはパースエラーになります。
  エンジンは実行時に引数値の型で解決します（完全一致の型が
  `object` に勝つ）。引数型が静的に分かるプログラムでは観測
  される挙動は一致します。
- **変換は一切起きません**。実行時の型が引数の型と合わない値
  （`"5"` のような数値文字列を `number` 引数へ渡す場合を含む）
  は変換されず、引数が未設定のまま本体が実行されます（その後
  の挙動は本体側の意味論次第で、未設定の引数に対する算術は
  前述の「値なしオペランド」規則に従います）。値なしを明示的
  に渡した場合も同じで、デフォルト値は発動しません。
- **デフォルト値**は省略された末尾の引数にだけ適用されます。
  任意の式が書け、呼び出し時に、引数が1つも束縛される**前に**
  評価されます。グローバル変数は読めますが、引数は見えません。
- **ローカル変数は呼び出しごとの新鮮なフレーム**で、双方向に
  隔離されます。関数は呼び出し側の `{_x}` を見られず、関数内の
  書き込みが外へ漏れることもありません。入れ子の呼び出しも
  再帰（動作します）もそれぞれ独立したフレームを持ち、
  グローバル変数は通常通り共有されます。ローカルリストも
  グローバルと同様に使えます。関数本体には**イベント文脈が
  ありません**。Skript では関数内の `player` はパースエラーで、
  エンジンのコールフレームも空白から始まります。
- **戻り値の規律**。`return` には値が必須です（値なしの
  `return` は Skript ではパースエラー。早期終了には
  `stopTrigger()` を使います）。戻り値の実行時の型が宣言と
  合わない場合、呼び出しは**値なし**になります。値を返す関数が
  return せずに終わった場合も値なしです。複数形の戻り型は
  単一の値を1要素のリストとして包み、型の合わない要素を
  落とします。複数値の結果をスカラー変数へ代入すると値なし
  になります。リスト全体の代入（`set(localList("a"), someList)`）
  は対象を置き換え、反復順に 1..n へ詰め直します。
- **複数形の引数**は、ばらした値（`f(1, 2, 3)`）、リスト全体
  （`f({list::*})`）、単一の値のいずれでも受け取れます。本体の
  中ではローカルリスト `{_name::*}` として見えます。複数形の
  引数へ0個の値で呼ぶ呼び出しは解決されません。
- **関数内の `wait` は呼び出しを切り離します**。呼び出し側は
  wait が始まった瞬間に再開し、式としての呼び出しは値なしに
  なり、本体の残りは遅延の後に単独で実行され続けます。wait の
  後の `return` は Skript では**読み込みエラー**です（"A return
  statement after a delay is useless..."）。読み込める
  プログラムには現れない形であり、エンジンはこの形を受け
  入れて値を捨てます（最終的な意味論は同じです）。

`examples/functions.ts` がこれら全てを exercised し（再帰の
階乗、デフォルト値、オーバーロード、リストを返す関数への
複数形引数の合計、型不一致とスコープのデモ、切り離される
wait）、`examples/behavior/functions.behavior.ts` が両ランタイムで
同一の期待値を検証します。

### ゲームプレイイベント

ゲームプレイイベントはコア言語です。同じスクリプトが Skript
（出力された `.sk`）でもエンジン jar（独自の Bukkit リスナー
から発火）でも動きます。このスライスは**フィルタなしの形**
であり、Skript のフィルタ付き形（`on break of stone:`、
`on damage of player by zombie:`）と次のイベント群は次の節
です。汎用の `on click:`（右／左のペアでカバーします）と
ブロックダメージイベント（Skript 自身のドキュメントが
左クリックイベントを案内しています）は含みません。

イベント値（本家 Skript 2.17.1 へのプローブと振る舞いテストで
裏取り済み）：

- `eventBlock()` はイベント対象のブロックです。空への
  クリックにはブロックがありません。`locationOf(eventBlock())`
  でその位置が得られます。
- `eventItem()` は、**クリック**では手持ちアイテム、**設置**
  では置かれるアイテムです。**破壊**では手持ちの道具では
  なく、壊したブロックの**アイテム形**です（実測で確定：
  剣を持って草を掘っても `grass block` と報告されました）。
  空手のとき値は**存在せず**、文字列の中では `air` ではなく
  `<none>` と読めます。
- ダメージイベントでは `victim()` がダメージを受ける
  エンティティ、`attacker()` が与えたエンティティです。
  `attacker()` は環境ダメージ（落下、溶岩など）では値なし
  です。素の `player()` / `eventPlayer()` はダメージイベント
  では**定義されません**。Skript はパース時に弾き（"There's no
  player in an on damage event"）、エンジンも両方を未設定の
  ままにして倣います。
- `damageAmount()` はイベントの**現在**の量です。同じ
  ハンドラ内で先行した `setDamage()` の書き換えを反映します。
  量そのものはサーバーの計算です（素手の一撃が `1` になるのは
  攻撃チャージが満タンのときだけ）。エンジンも同じ Bukkit
  イベントを読むため、両ランタイムで同一になります。
- `damageCause()` は原因のテキストです。大半は小文字の名前
  （`fall`、`lava`）ですが、Skript の名前は機械的な変換では
  ありません。エンティティ攻撃は `attack` と印字され（実測で
  確定）、`FIRE_TICK` は `burning` と読めます。
- `cancelEvent()` は背後のイベントをキャンセル済みにします
  （ブロックは残り、ダメージは適用されません）。
  `uncancelEvent()` は同じイベント内での先行キャンセルを
  取り消します。キャンセルできない文脈では何もしません。
- エンティティをテキストとして使うと、プレイヤーは名前、
  それ以外は型名（`iron golem`、`slime`）として読めます。
  両ランタイム共通です。

ブロックとアイテムは値です。`typeOf(v)` は値の Skript 型名を
返し（`grass block`、`dirt`、`player`、`number` など。値なし
には型がありません）、`item("...")` リテラルとの比較が、
ブロックやアイテムの種類を判定する正式な方法です。ブロック
やアイテムをテキストとして使うとその名前として読めます。
関数の引数型と戻り型には単数形の `block`、`item`、`entity`
が使えます（このスライスでは複数形なし）。型付け上の注意点
が1つ、実 Skript の読み込みエラーで確定しています：
`typeOf(...)` が返すのはテキストではなく**型の値**です。
それを返す関数の戻り型は `object` でなければならず、文字列の
中では型の名前として印字されます。

`examples/gameplay.ts` がこれら全てを exercised します（土は
掘れず石は置けない＝どちらもキャンセル、クリックはブロック
とアイテムのラベル付きで通知、ダメージは報告され、名前付き
ボットの1体はキャンセル、もう1体は半減）。
`examples/behavior/gameplay.behavior.ts` が実ボットに掘る・
置く・クリックする・戦わせ、メッセージと結果のワールド状態
（ブロックが消えたか残ったか、体力が減ったか否か）の両方を
両ランタイムで検証します。

### イベントフィルタと追加イベント

フィルタ付きイベント形もコア言語です。クリック対象
エンティティの値と、取得・ドロップ・リスポーン・就寝／
起床の5イベントが加わります。以下はいずれも本家
Skript 2.17.1 で裏取り済みです。ヘッダの形はプローブ
スクリプトで読み込み時に、一致の仕方はサンドボックスの
モブ同士の戦闘を観察して、全セットは mineflayer 振る舞い
テストで両ランタイムとも確認しました。

**フィルタ。** イベントビルダーの末尾に付けるオプション
オブジェクトです。Skript のフィルタ付きヘッダは実行時の
式ではなくスクリプト本文中の**リテラルな型リスト**なので、
フィルタの値は型の**名前**を文字列（1つ、または配列）で
渡します。式にはしません（式にすると「ヘッダに変数が
書ける」という嘘の約束になります）。スロット名はヘッダ
の位置に対応します：

- `onBlockBreak(body, { block })` / `onBlockPlace` —
  `of` スロット： `on block break of stone or cobblestone:`
- `onDamage(body, { victim, attacker })` — `of` と `by`：
  `on damage of player by zombie:`。片側だけのフィルタも
  可能で、`by` のみ（`on damage by zombie:`）がパース
  できて動くことは API を許可する前にプローブで確定済み
  です。
- `onRightClick` / `onLeftClick(body, { block, entity, item })`
  — `on`（クリックしたブロック、またはクリックした
  エンティティ。両方の同時指定は拒否）と `with`（手の
  アイテム）： `on right click on villager:`、
  `on left click with stick:`
- `onPickup` / `onDrop(body, { item })` —
  `on pick up of wheat:`、`on drop of egg or compass:`

一致は Skript の型名で行います。`typeOf()` が印字し、
`item("...")` リテラルが使う名前（`stone`、`grass block`、
`zombie`、`player`）と同じです。リストはヘッダ内で
`a or b`、`a, b or c` と接続します。指定したスロットは
全て一致する必要があり、イベントに値が無いスロットは
決して一致しません（落下ダメージに攻撃者フィルタは
沈黙し、空へのクリックにブロックフィルタは沈黙します）。
エンジンも発火時に Bukkit の値へ同じ規則を適用します。

**クリック対象エンティティ。** `clickedEntity()` は右
クリックが相互作用したエンティティ（Skript の
`clicked entity`）で、ブロックや空へのクリックでは値を
持ちません。エンティティへの右クリックにはクリックした
ブロックはなく、手のアイテムは従来通り `eventItem()` です。

**追加イベント** はいずれも Skript の裸のヘッダと同じ
**プレイヤーの形**です。裸の `on pick up` / `on drop` が
モブでは発火しないことは実地で確認済みです（小麦を拾った
ゾンビでは明示形の `entity pick up` だけが発火しました。
この明示形はサブセット外です）。エンジンもプレイヤー
以外の取得をディスパッチしません：

- `onPickup` — プレイヤーがアイテムを拾う。
  `eventItem()` がそのスタックで、`cancelEvent()` で
  取得を拒否できます。
- `onDrop` — プレイヤーがアイテムを落とす。
  `cancelEvent()` でアイテムはインベントリに残ります
  （振る舞いテストは同じコンパスを2回投げて、一度も
  手を離れなかったことを証明します）。
- `onRespawn` — プレイヤーのリスポーン。**キャンセル
  不可**です（Skript は内部の `cancel event` をパース
  時点で拒否します）。
- `onBedEnter` / `onBedLeave` — `eventBlock()` がベッド
  です。就寝はキャンセル可、起床は不可です。

釣りは意図的に入れていません。Skript 2.17 は状態別の
サブイベント（cast / caught / hooked / bite / escape /
...）に分かれており、それ自体が設計面であることと、
bite のタイミングがランダムで振る舞いテストが不安定に
なるためです。死亡のフィルタ（`on death of zombie:`）も
入れていません。このサブセットの死亡イベントは
プレイヤー専用ですが Skript 側は全エンティティ対象で、
被害者フィルタを付けるとエンジン側が持ち得ない意味論を
約束してしまうためです。

`examples/events2.ts` がこれら全てを使います（フィルタ
付きの破壊・設置・クリック・ダメージ報告、小麦だけを
拾い分ける取得、落とせないコンパス、リスポーンと就寝）
— `examples/behavior/events2.behavior.ts` が両ランタイムで
ボットを駆動して検証します。

### テキスト操作

テキストはコア言語です。同じスクリプトが Skript（出力された
`.sk`）でもエンジン jar でも動きます。以下の意味論はすべて
本家 Skript 2.17.1 へのプローブで裏取り済みで（開発ログ参照）、
いくつかは「当然」の挙動と異なります。

- `textLength(t)` は UTF-16 コードユニット数で数えます
  （絵文字は 2）。対象が値なしなら結果も値なし、空文字列の
  長さは 0 です。
- `substring(t, from, to)` は 1 始まりで両端を含みます。
  範囲は「適合」されます。`from` は 1 へ切り上げ、`to` は
  長さへ切り下げ、適合後の `from` が `to` を超えたら結果は
  **値なし**です（空文字列にはならず、交換もされません）。
  `firstChars(t, n)` / `lastChars(t, n)` は反対側の端を固定
  した同じ規則で、個数 0 以下は値なしです。`charAt(t, i)` は
  厳格で、1..長さ の範囲外は値なし、結果は UTF-16 コード
  ユニット1つです。
- `upperCase(t)` / `lowerCase(t)` は大小変換です。対象が
  値なしなら結果も値なし。単一テキストの操作は、本家の
  複数形と同じく、テキストのリストには要素ごとに適用
  されます。
- `splitText(t, delim[, caseSensitive])` は**リスト**を
  返します。区切りはリテラル照合（正規表現では決してない）
  で、既定は大文字小文字を**区別しません**。末尾の空要素は
  残り（`a,b,,c,` は5要素）、空文字列は空要素1つ、空の
  区切りは1文字ずつの要素＋末尾の空要素、対象が値なしなら
  要素なしです。結果はリスト機構と合成できます。リスト
  変数へ代入すれば、ループ（`loopIndex()` つき）、要素数、
  添字読みが、手で作ったリストとまったく同じに使えます。
  （本家では `size of` や `loop` も split を直接受けます
  —— split へのループには loop-index がありません —— が、
  本サブセットでは要素数とループはリスト変数の形に
  統一しています。）
- `joinText(list[, delim])` はリストの**テキスト要素**を
  連結します（プレイヤーは名前として数えます）。数値など
  テキストでない要素は変換されず**読み飛ばされます**
  （`(1, "x")` の結合は `"x"`）。残りが空なら値なし、
  既定の区切りは `""` です。split の結果を直接結合する
  こともできます: `joinText(splitText(t, str(",")),
  str("+"))`。
- `contains(a, b)` は、テキスト同士では大文字小文字を
  **区別しない**部分文字列テスト（空の部分は常に対象に
  含まれます）、リストに対しては比較規則による要素の
  所属テストです。`startsWith` / `endsWith` は大文字
  小文字を**区別します**。この非対称は本家自身のもので、
  プローブで固定しました。被演算子が値なしなら偽です。
  3つとも葉条件でネイティブの否定形を持つため、
  `whileLoop` の頭でも使えます。
- `replaceAllIn(var, find, repl[, caseSensitive])` /
  `replaceFirstIn(...)` はスカラー変数の持つテキストを
  書き換えます。リテラル照合で、既定は大文字小文字を
  区別しません。空の検索文字列は全ての隙間（all）または
  先頭（first）への挿入になります。対象が値なし・
  テキストでない場合は何もしません。
- 色: `colored(t)` / `formatted(t)` は `&` コード
  （`&x` の16進数並びを含む）と名前つき MiniMessage 式
  タグ（`<red>`、`<bold>`、閉じタグ、`<reset>`）を書式
  として解釈し、`uncolored(t)` / `unformatted(t)` は
  書式コードを**全て**取り除きます（色もスタイルも）。
  未知のタグ、対応のない閉じタグ、`&#RRGGBB` の形は
  リテラルのまま残ります。文字列リテラル自体も両ラン
  タイムで同じように解釈されます。Skript 2.17 は
  リテラルをテキストコンポーネントとして読み、エンジン
  はリテラルを § コード文字列へ変換します。一方、実行時
  に届く値（チャット文、計算された文字列）の生の `&` は
  `colored` / `formatted` を適用するまでそのままです。
  モデルの境界が1つあります。本家のテキストは
  コンポーネントで、エンジンのテキストは § コード文字列
  です。プレーンテキストの挙動とプレイヤーが目にする
  書式は一致し、解釈済みの値は等価な § リテラルと両
  ランタイムで等しくなりますが（サンプルの `/paeq` と
  `/fmteq` がこれを固定しています）、§ の文字数を数える
  式（色つきチャット文の長さなど）は、コンポーネントに
  数える § が存在しないため、異なり得ます。

`examples/text.ts` がこれら全てを exercised します
（`!` 接頭辞ルールつきの shout コマンド、文字の切り取り、
CSV の分割と結合、テキスト検査、置き換えデモ、paint 系
コマンド）。`examples/behavior/text.behavior.ts` が
観測可能な挙動を両ランタイムで検証します。

### アイテム・インベントリ・GUI

アイテム、インベントリ、GUI はコア言語です。同じスクリプトが
Skript（生成された `.sk`）でもエンジン jar でも動きます。
以下の意味論はすべて本家 Skript 2.17.1 へのプローブ
（コンソールプローブ＋mineflayer ボットによる実 GUI
クリック）で裏取り済みです（開発ログ参照）。

- **アイテム生成**は、任意のアイテム式への接尾辞の合成です。
  `withName(item, nameText)`、`withLore(item, ...lines)`、
  `withAmount(item, countExpr)` — `<item> named <text>`、
  `<item> with lore <a> and <b>`、`<count> of <item>`。
  これらのラッパーは実際のスタックを実体化します。素の
  アイテム名は新しいスタックになり、スタックは複製されて
  メタを書き換えられます。メタ付きスタックの `typeOf` は
  素材のままです。
- **アイテムの表示**: スタックは種別名で表示され、個数が
  2 以上では個数付きの複数形になります（`3 diamond
  swords`）。カスタム名があれば ` named <name>` が付きます。
  lore は表示されません。
- **等価性**: 2 つのスタックの比較は、種別＋個数に加えて、
  **両方**のスタックが持つメタ要素で決まります。名前付き
  スタックと無名スタックは等しく、異なる名前同士は異なり、
  名前の比較は大文字小文字を**区別**し、lore は行単位で
  比較されます。アイテム*リテラル*（や種別名）との比較は
  従来どおり種別のみなので、`eventItem() is item("stone")`
  はメタを無視します。
- **メタの読み取り**: `nameOf(item)` はカスタム名で、
  名前が無いアイテムでは値なしです（インベントリでは
  タイトル、プレイヤーでは名前）。`loreOf(item)` は lore の
  行をリストで返し、lore が無ければ値なしです。
  `amountOf(item)` はスタックの個数です（リスト値では
  リストのサイズ。本家の汎用 amount 式と同じ）。
- **メタの文**: `setItemName(var, text)`、
  `setItemLore(var, ...lines)`、`setItemAmount(var, count)`
  は、スカラー変数が保持するアイテムを書き換えます
  （`set name of {v} to ...` など）。変数が素の種別名を
  保持していれば先に実体化され、アイテム値を持たない
  変数は変更されません。`giveItem(player, item)` は
  アイテム式（メタ込み）をプレイヤーへ渡します。
- **値としてのインベントリ**: `chestInventory(rows[,
  title])` は新しい仮想チェストインベントリを作ります
  （行数は 1..6 に丸め）。プレイヤーとは独立に存在します。
  `currentInventoryOf(player)` はプレイヤーが開いている
  インベントリ（何も開いていなければ本家同様に本人の
  クラフトインベントリ）、`eventInventory()` は
  インベントリイベントのトップインベントリです。
  `slotItem(inv, slot)` は 0 始まりのスロットを読み
  （空スロットは値なし）、`setSlot(inv, slot, item)` は
  書き込みます。インベントリとしてプレイヤーを渡すと
  本人のインベントリを指し、値なしのアイテムはスロットを
  空にします。`openInventory(player, inv)` はインベントリ
  値を開き、`openGui(player, rows[, title])` はチェスト
  GUI を作って開く一文形式、`closeInventory(player)` は
  表示を閉じます。
- **インベントリイベント**: `onInventoryClick` は、スクリプト
  GUI でもバニラのコンテナでも、全てのインベントリ
  クリックで発火します。中では `eventItem()` がクリック
  されたスロットのアイテム（空スロットは値なし）、
  `eventInventory()` がビューのトップインベントリ、
  `clickedSlotIndex()` がクリックされたインベントリ内の
  スロット番号（自分の下部インベントリのクリックは
  その左上から数える）、`clickedRawSlotIndex()` がビュー
  全体での番号です。中の `cancelEvent()` が GUI の標準的な
  守りで、キャンセルされたクリックは何も動かしません。
  `onInventoryClose` は、スクリプトからでもプレイヤーの
  操作でも、表示が閉じた時に発火します。

テキストと同様のモデル境界が1つあります。表示名と lore は
Skript ではコンポーネント、エンジンでは § コード文字列で、
メタの境界で変換されます。プレイヤーに見える装飾は一致し、
コード無しの名前の読み取りも一致します。

`examples/gui.ts` がこれら全てを使います。メタの文で
名前と lore 付きの剣を作る `/gem`、読み戻す `/geminfo`、
クリックハンドラに守られたチェスト GUI `/menu` です。
`examples/behavior/gui.behavior.ts` はボットに両ランタイムで
全フローを実演させ、キャンセルされたクリックで GUI の
ダイヤがボットのインベントリに入らないことまで確認します。

このスライスの対象外（記録済み、今後の候補）:
インベントリのドラッグイベント（クリックをキャンセルした
GUI でもドラッグはアイテムを動かし得ます）、スロットへの
add/remove 形式、カーソルスロット、名前・lore・個数以外の
メタ（エンチャントなど）。

### ワールド操作と周期イベント

ブロック、位置、ワールドの状態、周期トリガはコア言語
です。同じスクリプトが Skript（出力された `.sk`）でも
エンジン jar でも動きます。以下の意味論はすべて本家
Skript 2.17.1 に対してプローブで裏取りしました
（コンソールプローブ複数ラウンド。詳細は開発ログ）:

- **値としてのブロックと位置**: `blockAt(loc)` は
  位置のブロック（`block at %location%`）、
  `setBlockAt(loc, item)` はアイテムのマテリアルを
  その位置に書きます（`set block at ... to ...`。
  air アイテムでブロックが消えます）。ブロックの
  印字は `'<種別>' at <cx>, <cy>, <cz> in world
  '<名前>'` で座標は**中心**であり、ブロックの
  `locationOf` は中心位置です。エンジンも両形式を
  再現します。
- **位置**: `location(x, y, z)` はサーバーのメイン
  ワールドに位置を作り、`location(x, y, z, world)`
  はワールド式を取ります。印字は `x: <x>, y: <y>,
  z: <z>, yaw: <yaw>, pitch: <pitch> in
  '<ワールド>'` です。`xOf` / `yOf` / `zOf` は
  座標を読みます（`x-coordinate of ...`）。
  `offsetLocation(loc, dx, dy, dz)` はベクトルで
  位置をずらします（`%location% ~ vector(...)`）。
  成分は式です。
- **相対ブロック**: `relativeBlock(target,
  direction[, amount])` はブロックまたは位置から
  方向へ進んだブロックです。`above`、`below`、
  `north`、`south`、`east`、`west`（絶対方向）と
  `front` / `behind`（向き相対: 対象位置の向きに
  従い、ブロック自体の位置は南向きです）。出力
  形式は方向ごとに異なります（`block above %t%`、
  `block 2 north of %t%`、`block in front of %t%`、
  `block behind %t%`。すべてプローブ済み）。
- **ワールド**: `world("name")` は名前による
  ワールドです（未知の名前は無値）。`worldOf(target)`
  は——このフェーズでコア言語になりました（MundoSK
  スライスではエンジン内蔵でした）——プレイヤー・
  位置・ブロックのワールドを読みます。
- **ワールドの時計**: `worldTime(world)` は
  ワールドの時計を `H:MM` テキストで読みます
  （`time in %world%`）。0 ティックで `6:00`、
  6000 で `12:00`、18000 で `0:00` です。
  `setWorldTime(world, value)` で設定します。値は
  `clockTime("13:00")` リテラルか、時計テキストを
  運ぶ式（`worldTime` を入れた変数の往復も
  プローブ済み）です。本家の timespan 形式は
  パースできますが効果を裏取りできなかったため、
  意図的に対象外とします。時刻の算術もサブセット
  には含みません。
- **天気**: `worldWeather(world)` は `clear`、
  `rain`、`thunder` を読み（`weather in %world%`）、
  `setWorldWeather(world, name)` はリテラル名で
  設定します。天気の値は `weatherType("rain")`
  リテラルと比較します——出力は**裸**の形式
  （`is rain`）です。引用符付きテキスト形式は
  パースできますが決して等しくならず、プレーンな
  テキストは変換されません（テキスト変数からの
  設定は本家でも無言で無効です。いずれも
  プローブ済み）。
- **周期イベント**: `every(amount, unit, body)` は
  周期トリガです（`every 3 seconds:`）。量は数値
  **リテラル**のみです（式の周期は本家のパーサが
  弾きます）。分数も使えます（`every 2.5 seconds`
  は周期通りに発火）。単位は `ticks` / `seconds` /
  `minutes`。初回発火はロードから1周期後で、
  リロードでスケジュールは再アンカーされます
  （時刻付きログでプローブ済み）。本体には
  イベント文脈がありません（関数本体と同様）。

本家側のクセがこの一族（と変数に対する `typeOf`）
に当てはまります: Skript 2.17.1 はこれらの複合式を
文字列補間の中ではパースしません——値の位置専用
です。変数に代入してから変数を補間してください
（サンプルはそうしています）。エンジン側にこの
制限はありません。

`examples/world.ts` が一通りを exercise します——
3秒ハートビートの周期トリガ、`/wstat` / `/wday` /
`/wnight` / `/wcalm` / `/wstorm` のワールド状態
コマンド、`/wpos` の座標読み返し、`/wbuild` と
`/wraze` の実ブロック設置と除去——そして
`examples/behavior/world.behavior.ts` が両
ランタイムでボットに全フローを駆動させ、
ハートビートの周期測定も含みます。

このスライスの対象外（記録済み、今後の候補）:
*エンティティ*からの向き相対オフセット（位置の
形式はプローブ済みで収録。エンティティの向きは
実機での向きプローブ設計が別途必要です）と、
ワールド時刻の算術です。

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
| `worldOf(target)` | プレイヤー／場所のワールド（フェーズ18でコア言語へ昇格。*ワールド操作と周期イベント* を参照。このスライス起源としてここにも記載） |
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
