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

Prototype (v0). Versioning uses the date format `vYYYY.MM.DD`
(e.g. `v2026.11.11`).

## Quick start

```ts
import {
  script, onJoin, onFirstJoin, broadcast, send, give, set,
  player, fmt, variable, bool, emit,
} from "skript-ts";

const prog = script(
  onFirstJoin([
    broadcast(fmt("Welcome, ", player(), "!")),
    give(player(), "wooden sword", 1),
    set(variable("welcomed", player()), bool(true)),
  ]),
  onJoin([
    send(player(), fmt("Welcome back, ", player())),
  ]),
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

Five complete sample programs live in [`examples/`](examples/)
(welcome, kit command, chat log relay, death counter, spawn commands) and
double as golden-test fixtures.

## Supported subset (SPEC, v0)

Anything not listed here is out of scope for v0.

### Events
| TypeScript | Skript |
| --- | --- |
| `onJoin` | `on join:` |
| `onFirstJoin` | `on first join:` |
| `onQuit` | `on quit:` |
| `onChat` | `on chat:` |
| `onDeath` | `on death:` |

### Commands
`command(name, argType, body, argOptional?)` — at most **one** argument.
`argType` is `"text"`, `"player"`, or `"integer"`; optional arguments emit
as `[<type>]`, required ones as `<type>`. The body becomes the `trigger:`
section.

### Effects (statements)
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

### Expressions
| TypeScript | value position | inside a string |
| --- | --- | --- |
| `player()` | `player` | `%player%` |
| `eventPlayer()` | `event-player` | `%event-player%` |
| `loopPlayer()` | `loop-player` | `%loop-player%` |
| `victim()` | `victim` | `%victim%` |
| `argument(n)` (1-based) | `arg-<n>` | `%arg-<n>%` |
| `chatMessage()` | `message` | `%message%` |
| `variable(name)` | `{name}` | `{name}` |
| `variable(name, index)` | `{name::%<index>%}` | `{name::%<index>%}` |
| `str(s)` | `"<s>"` | raw text |
| `num(n)` / `bool(b)` | `42` / `true` | same |
| `item(name)` | `diamond sword` | same |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `fmt(...parts)` | `"<parts>"` | flattened into the enclosing string |

Note: in `on death` events there is **no** `player` — Skript rejects it
("There's no player in an on death event"). Use `victim()` for the player
who died. This was caught by the real-server verification stage against
Skript 2.17.1, which is exactly what that stage is for.

### Conditions
| TypeScript | Skript |
| --- | --- |
| `hasPermission(target, "node")` | `<target> has permission "node"` |
| `isOp(target)` | `<target> is op` |

### String escaping
Literal text follows Skript's escaping: `"` is doubled (`""`) and a literal
`%` is doubled (`%%`). This applies to `str()` values, the literal parts of
`fmt()`, and permission strings — never to emitted placeholders.

## Verification

Two stages, both required:

1. **Golden tests** — `pnpm typecheck` and `pnpm test` (vitest). Every
   construct and every sample program is compared against expected `.sk`
   output in [`tests/fixtures/`](tests/fixtures/).
2. **Real server check** — the emitted sample `.sk` files are loaded by an
   actual Paper server with the Skript plugin, and the console log must
   show no Skript errors. The server harness lives in `server/`
   (gitignored): Paper 1.21.11, Skript 2.17.1, Temurin JDK 21.
   `pnpm exec tsx examples/to-sk-files.ts` regenerates the `.sk` files
   into `server/plugins/Skript/scripts/`.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 kurazuuuuuu.
