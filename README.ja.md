# skript-ts

Minecraft（Paper）サーバー向けの [Skript](https://github.com/SkriptLang/Skript)
スクリプトを**型付き TypeScript** で書き、`.sk` ファイルへ変換するツールです。

Skript の英語風 DSL は AI コーディングエージェント向けの学習データが
ほとんど無く、エージェントはうまく書けません。TypeScript はその逆で、
エージェントが熟知しており、型チェッカが機械的なガードレールになります。
不正なプログラムはサーバーに届く前に `tsc` で落ちます。skript-ts は
TypeScript で AST を構築し、そこから Skript ソースを出力する
ビルダー形式の API です。

English: [README.md](README.md)

## 状態

現在のリリースは `v2026.11.11`。バージョニングは日付形式
`vYYYY.MM.DD` で統一します。

skript-ts には、同じ TypeScript プログラムに対する2つの実行系が
あります。Paper 1.21.11 上の Skript 2.17.1 向けに `.sk` を出力する
トランスパイラと、同じサブセットを Skript プラグインなしで Paper 上で
直接実行するクリーンルーム実装の**エンジン jar**
（[docs/engine.ja.md](docs/engine.ja.md)）です。どちらの実行系も
同じ振る舞いテストで検証しています。

## 特徴

- **型付きビルダー API** — スクリプトは通常の TypeScript で、
  不正なプログラムはサーバーに届く前に `tsc` が弾きます。
- **2つの実行系、1つのプログラム** — 本家 Skript プラグイン向けに
  `.sk` へ変換するか、同じプログラムを単独のエンジン jar で
  実行するか選べます。
- **コア言語** — 比較・論理・算術、リスト変数、ループ／`while`／
  `wait`、カスタム関数。意味論は本家 Skript 2.17.1 への実測で
  確定しています（推測では決めていません）。
- **ゲームプレイの表面** — リテラル型フィルタ付きイベント、
  アイテム／インベントリ／チェスト GUI、ワールド操作と周期
  トリガ、プレイヤー状態とエフェクト、型付きコマンド定義、
  タイトル／アクションバー／ボスバー、値としてのタイムスパン。
- **エンジン内蔵機能** — 主要アドオンの機能をエンジンへ
  クリーンルーム再実装しています。WebSocket クライアントと
  ワールドボーダー（MundoSK）、名前付きタイマー（SharpSK）、
  SQL データソース（skript-db）、サンドボックス化された
  テキストファイル中核（skUtilities）、PlaceholderAPI 連携
  （Ersatz）、そして skript-ts 独自拡張の HTTP リクエストと
  `env()` です。
- **実物での検証** — 出力 `.sk` のゴールデンテストと、実 Paper
  サーバーを両モードで起動する mineflayer 振る舞いテスト。
  Skript のパースエラーはソースマップ経由で TypeScript の
  位置へ対応付けて報告します。
- **エンジンモードのホットリロード** — `watch` が保存のたびに
  再配置し、エンジンがサーバー再起動なしで再読み込みします。

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

サンプルプログラムは [`examples/`](examples/) に26本あります。
参加ウェルカム、キット／スポーン／カスタムコマンド、チャット
ログ中継、死亡カウンタ、コア言語（`logic.ts`、`lists.ts`、
`functions.ts`）、ゲームプレイイベントとフィルタ
（`gameplay.ts`、`events2.ts`、`events3.ts`）、テキスト操作
（`text.ts`）、アイテムと GUI（`gui.ts`）、ワールド操作
（`world.ts`）、プレイヤー状態（`state.ts`）、表示エフェクトと
ボスバー（`display.ts`、`bossbar.ts`）、タイムスパン
（`timespan.ts`）、HTTP リクエストと `env()`（`http.ts`、
`env.ts`）、エンジン内蔵機能ごとのサンプル（`mundosk.ts`、
`sharpsk.ts`、`skriptdb.ts`、`skutil.ts`、`ersatz.ts`）です。
ゴールデンテストのフィクスチャを兼ね、
[`examples/behavior/`](examples/behavior/) の27本の振る舞い
テストが両モードの実サーバーで検証します。

## ドキュメント

- [対応サブセット（SPEC）](docs/reference.ja.md) — 全ビルダー、
  出力される `.sk` 形式、検証済みの意味論。ここに無いものは
  対応範囲外です。
- [エンジン jar とエンジン内蔵機能](docs/engine.ja.md) —
  クリーンルーム実装のエンジン、そのビルドと検証、内蔵した
  アドオン機能について。
- [検証とビルド／検証 CLI](docs/verification.ja.md) — 2段階の
  検証、`build`／`verify`／`probe`／`watch` コマンド、
  振る舞いテストについて。
- [アドオン棚卸し](docs/addon-inventory.md) — エンジンへ
  内蔵するアドオンごとの、移植前ライセンス確認と振る舞いの
  メモ。

## 開発

```sh
pnpm install
pnpm typecheck
pnpm test
```

## ライセンス

MIT — [LICENSE](LICENSE) を参照。Copyright (c) 2026 kurazuuuuuu.
