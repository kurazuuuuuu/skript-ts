# skript-ts

Write [Skript](https://github.com/SkriptLang/Skript) scripts for Minecraft
(Paper) servers in **typed TypeScript**, and transpile them to `.sk` files.

Skript's English-like DSL has very little training data available to AI
coding agents, so agents write it poorly. TypeScript is the opposite: agents
know it well, and the type checker acts as a mechanical guardrail — a
malformed program fails `tsc` before it ever reaches a server. skript-ts is
a builder-style API that constructs an AST in TypeScript and emits Skript
source from it.

日本語版: [README.ja.md](README.ja.md)

## Status

Current release: `v2026.11.11`. Versioning uses the date format
`vYYYY.MM.DD`.

skript-ts has two runtimes for the same TypeScript programs: a
transpiler that emits `.sk` files for Skript 2.17.1 on Paper 1.21.11,
and a clean-room **engine jar** that executes the same subset directly
on Paper with no Skript plugin involved (see
[docs/engine.md](docs/engine.md)). Both runtimes are held to the same
behavior tests.

## Features

- **Typed builder API** — scripts are ordinary TypeScript; `tsc`
  rejects malformed programs before they ever reach a server.
- **Two runtimes, one program** — transpile to `.sk` for the original
  Skript plugin, or run the same program on the standalone engine jar.
- **Core language** — comparisons, logic and arithmetic, list
  variables, loops / `while` / `wait`, and custom functions, with
  semantics probed against the real Skript 2.17.1 (never guessed).
- **Gameplay surface** — events with literal type filters, items /
  inventories / chest GUIs, world operations and periodical triggers,
  player state and effects, typed command definitions, titles /
  action bars / boss bars, and timespans as values.
- **Engine builtins** — major addon features reimplemented natively
  inside the engine: a WebSocket client and world borders (MundoSK),
  named timers (SharpSK), SQL data sources (skript-db), a sandboxed
  text-file core (skUtilities), PlaceholderAPI bridging (Ersatz),
  plus HTTP requests and `env()` — a skript-ts original extension.
- **Verified against the real thing** — golden tests for the emitted
  `.sk`, and mineflayer behavior tests that boot a real Paper server
  in both modes. Skript parse errors are reported mapped back to
  TypeScript positions via source maps.
- **Hot reload for engine mode** — `watch` redeploys on every save
  and the engine reloads the program without a server restart.

## Quick start

```ts
import {
  script,
  onJoin,
  onFirstJoin,
  broadcast,
  send,
  give,
  set,
  player,
  fmt,
  variable,
  bool,
  emit,
} from "skript-ts";

const prog = script(
  onFirstJoin([
    broadcast(fmt("Welcome, ", player(), "!")),
    give(player(), "wooden sword", 1),
    set(variable("welcomed", player()), bool(true)),
  ]),
  onJoin([send(player(), fmt("Welcome back, ", player()))]),
);

console.log(emit(prog));
```

Output:

```skript
on first join:
    broadcast "Welcome, %player%!"
    give 1 wooden sword to player
    set {welcomed::%player%} to true

on join:
    send "Welcome back, %player%" to player
```

Sample programs live in [`examples/`](examples/): 26 programs covering
the welcome flow, kit / spawn / custom commands, a chat-log relay, a
death counter, the core language (`logic.ts`, `lists.ts`,
`functions.ts`), gameplay events and filters (`gameplay.ts`,
`events2.ts`, `events3.ts`), text operations (`text.ts`), items and
GUIs (`gui.ts`), world operations (`world.ts`), player state
(`state.ts`), display effects and boss bars (`display.ts`,
`bossbar.ts`), timespans (`timespan.ts`), HTTP requests and `env()`
(`http.ts`, `env.ts`), and one sample per engine builtin
(`mundosk.ts`, `sharpsk.ts`, `skriptdb.ts`, `skutil.ts`, `ersatz.ts`).
They double as golden-test fixtures, and the 27 behavior suites in
[`examples/behavior/`](examples/behavior/) run them against a real
server in both modes.

## Documentation

- [Supported subset (SPEC)](docs/reference.md) — every builder, the
  `.sk` form it emits, and its verified semantics. Anything not listed
  there is outside the supported subset.
- [Engine jar and engine builtins](docs/engine.md) — the clean-room
  engine, how to build and verify it, and the addon features
  reimplemented inside it.
- [Verification and the build / verify CLI](docs/verification.md) —
  the two verification stages, the `build` / `verify` / `probe` /
  `watch` commands, and the behavior tests.
- [Agent setup guide](docs/agent-setup.md) — step-by-step setup
  for AI coding agents, including a copy-paste prompt template
  that hands the whole setup to an agent. Agents should also
  read [AGENTS.md](AGENTS.md) first.
- [Skill pack](skills/) — a SKILL.md-based pack that teaches an
  agent how to write skript-ts (writing guide, semantics summary,
  verification procedure).
- [Addon inventory](docs/addon-inventory.md) (Japanese) — the
  pre-port license check and behavior notes for each addon considered
  for the engine.
- [Security policy](SECURITY.md) — how to report a vulnerability
  privately, and how to verify a release's build provenance
  attestation.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 kurazuuuuuu.
