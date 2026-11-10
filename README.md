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

Prototype (v0), plus a clean-room **engine jar** that executes the
same subset directly on Paper with no Skript plugin involved (see
*Engine jar* below). Versioning uses the date format `vYYYY.MM.DD`
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
| `variable(name)` | `{name}` | `%{name}%` |
| `variable(name, index)` | `{name::%<index>%}` | `%{name::%<index>%}%` |
| `str(s)` | `"<s>"` | raw text |
| `num(n)` / `bool(b)` | `42` / `true` | same |
| `item(name)` | `diamond sword` | same |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `fmt(...parts)` | `"<parts>"` | flattened into the enclosing string |

Note: in `on death` events there is **no** `player` — Skript rejects it
("There's no player in an on death event"). Use `victim()` for the player
who died. This was caught by the real-server verification stage against
Skript 2.17.1, which is exactly what that stage is for.

Note: inside a string, a variable must be wrapped in `%...%` to
interpolate its value. A bare `{...}` in a string is literal text in
Skript (no error — the wrong text is simply sent). The emitter handles
the wrapping; this was caught by the behavior-test stage described
below, not by load checks.

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

## Build & verify CLI

`bin/skript-ts.mjs` (run from the project root) drives the whole
pipeline. Stages are shown one line each: a running stage updates its
own line in place on a TTY, a finished stage stays with a ✓ or ✗, and
non-TTY output falls back to append-only lines.

```sh
# typecheck -> transpile into build/ (add --deploy to also copy into a server)
bin/skript-ts.mjs build [--src examples] [--out build] [--deploy] [--server-dir server]

# full verification against the throwaway sandbox server in server/
bin/skript-ts.mjs verify [--no-behavior] [--no-fresh] [--json]
```

`verify` runs: typecheck → transpile → deploy → server start → script
load check (initial load plus `skript reload all`) → behavior tests →
stop. With `--json`, progress goes to stderr and a single JSON result
(per-stage status, mapped errors, behavior results) is printed to
stdout; the exit code is 0 only when everything passes.

Transpiling also writes a source map next to each `.sk` file
(`<name>.sk.map.json`) recording, for every emitted line, the AST node
path and the TypeScript call site that produced it. When Skript reports
a parse error, `verify` reports it mapped back to the TypeScript
position, e.g. `death.sk:2 → examples/death.ts:5:5 (body[0].body[0])`.

Before booting, `verify` wipes the sandbox's per-player state
(playerdata, Skript `variables.csv`, `ops.json`) so behavior tests
start from a clean slate; pass `--no-fresh` to keep it.

### Behavior tests

Load checks prove a script parses; behavior tests prove it *works*.
Tests are TypeScript modules in `<src>/behavior/*.behavior.ts` whose
default export receives a context (`src/behavior.ts`): connect a
[mineflayer](https://github.com/PrismarineJS/mineflayer) bot over a
real connection, wait for chat messages, run console commands, and
assert on inventory. The bundled samples test the welcome broadcast +
first-join item, the `/kit` permission flow, the op chat-log relay, and
the death counter. See `examples/behavior/`.

## Engine jar (no Skript plugin)

The long-term target is a Skript you write in TypeScript — not just a
transpiler feeding the original plugin. `engine/` is a Paper plugin
(`skript-ts.jar`) that executes skript-ts programs by itself:

- The TypeScript build emits an **IR** file next to every `.sk` file
  (`<name>.ir.json`): the script AST as JSON, with TypeScript
  call-site info stripped.
- The engine loads IR files from `plugins/skript-ts/scripts/`,
  registers the script commands on the server command map, listens
  for the subset's events, and interprets effects, expressions, and
  conditions on the server. Variables persist to
  `plugins/skript-ts/variables.json`.
- `/skript-ts reload` re-reads the IR folder; every load logs
  `Loaded N script(s), M top-level structure(s)` (per-file failures
  are logged as `Failed to load <file>: ...`).

The engine is a **clean-room reimplementation**: Skript is GPL, so no
Skript code is used — only the behavior contract of the v0 subset,
which is specified by the SPEC above and locked in by the same
mineflayer behavior tests that validate the transpiled `.sk` files.
The four v0 behavior tests are the specification both runtimes must
satisfy; engine builtins (below) add their own engine-only tests.
Documented interpretation choices where the subset leaves
room: a first join fires both `on first join` and `on join` handlers
(as under Skript); player-keyed variables use the player's name;
whole numbers render without a fraction (`1`, not `1.0`).

### Building the jar

The VM ships no Java; the build uses the Temurin JDK 21 in
`~/workspace/tools`. Compile-time libraries live in `engine/libs/`
(gitignored) and are fetched once with checksum verification —
Java's HTTPS cannot traverse this VM's proxy, which is why the fetch
is done with curl:

```sh
engine/fetch-libs.sh   # download + SHA-512-verify paper-api and friends
engine/build.sh        # -> engine/build/skript-ts.jar
```

### Verifying the engine

```sh
bin/skript-ts.mjs verify --engine [--json]
```

Same stages as the default verify, but deployment puts the IR files
in `plugins/skript-ts/scripts/`, installs `skript-ts.jar`, and
renames `Skript.jar` aside — the sandbox boots with **only** the
engine. The load check runs `skript-ts reload` and requires the
engine's summary line to report exactly the deployed script count
with no load failures. Running a plain `verify` afterwards restores
`Skript.jar` and removes the engine jar, so the two modes never leak
into each other.

## Engine builtins (addon features inside the engine)

Major addons are not separate plugins here: their features are being
reimplemented natively inside the engine, one addon at a time, from
documented behavior only (clean-room, same rule as the engine
itself). Builtin constructs have **no `.sk` form**: a script using
any of them is *engine-only* — the build writes its IR but no `.sk`,
Skript-mode deployment skips it, and calling `emit()` on it throws.
Behavior tests for builtins run only under `verify --engine` (the
test context exposes `t.mode`; under Skript mode they pass without
exercising anything). `examples/mundosk.ts` is the sample program.

### MundoSK slice 1: WebSocket client + world borders

WebSocket connections are named by a script-chosen id and live in
the engine (backed by the JDK's `java.net.http.WebSocket`). Messages
sent before the socket finishes opening are queued and flushed in
order; the close event fires whoever closed the connection.

| TypeScript | Meaning |
| --- | --- |
| `wsConnect(id, url)` | open a WebSocket client connection |
| `wsSend(id, text)` | send a text message |
| `wsDisconnect(id)` | close the connection |
| `onWsOpen(body)` | event: a connection opened |
| `onWsMessage(body)` | event: a text message arrived |
| `onWsClose(body)` | event: a connection closed |
| `wsMessage()` | the received text (inside `onWsMessage`) |
| `wsId()` | the connection id (inside websocket events) |
| `worldOf(target)` | the world of a player / location |
| `borderSize(world)` | current size of the world's border |
| `borderCenter(world)` | center location of the world's border |
| `setBorderSize(world, size)` | set the border size |
| `setBorderCenter(world, location)` | set the border center |

Verified by `examples/behavior/mundosk.behavior.ts` (connect → echo
→ broadcast → close against a local RFC 6455 echo server) and
`examples/behavior/mundosk-border.behavior.ts` (set + read-back).
Note: the websocket test needs the sandbox to permit outbound TCP
from the server process — where direct TCP is denied by the
environment, the connect fails cleanly through the engine's error
logging and only that one test times out.

### SharpSK slice 1: timers

SharpSK's bulk is hooks into other plugins; its standalone headline
feature is named countdown timers, reimplemented here on the Bukkit
scheduler. A timer ticks once per second: the remaining time is
decremented first, the tick event fires while it is still above
zero, and at zero the complete event fires and the timer is gone.
Stopping removes a timer silently; pausing freezes it (still
active, no ticks); creating a timer under an existing name restarts
it. Script reloads drop all timers. `examples/sharpsk.ts` is the
sample program.

| TypeScript | Meaning |
| --- | --- |
| `timerCreate(id, seconds)` | start (or restart) a named countdown |
| `timerStop(id)` | remove a timer without firing complete |
| `timerPause(id)` | freeze a timer's countdown |
| `timerResume(id)` | continue a paused timer |
| `onTimerTick(body)` | event: a timer ticked (once per second) |
| `onTimerComplete(body)` | event: a timer's countdown reached zero |
| `timerId()` | the timer's name (inside timer events) |
| `timerTimeLeft(name)` | seconds remaining on the named timer |
| `timerActive(name)` | condition: the named timer exists (running or paused) |

Verified by `examples/behavior/sharpsk.behavior.ts` (full countdown
to completion, pause freezing the countdown, silent stop).

### skript-db slice 1: SQL data sources

A data source is a value: build one from a documented URL and keep
it in a variable (`set(variable("sql"), dataSource(str("sqlite:data.db")))`),
the pattern skript-db documents. Supported URL forms are
`sqlite:<path>` (relative paths resolve under `plugins/skript-ts/data/`),
`mysql://host[:port]/db?user=..&password=<redacted> `mariadb://...` and
`postgresql://...`; credentials travel as query parameters. Data
sources are runtime-only values — they are never written to
`variables.json`, so credentials stay out of that file — and creating
one opens no connection.

`dbExecute` runs one statement. The query is a text expression: its
literal parts are the author's own SQL, and every expression part of
a `fmt(...)` becomes a JDBC parameter, bound by the engine and never
inlined into the SQL text — a value that looks like SQL is stored as
data, so this design needs no equivalent of skript-db's `unsafe`
opt-out. With a store variable, a result set is mapped to entries
`<var>::<column>::<row>` (rows are 1-based, previous entries under
the variable are cleared first) and the variable itself is set to
the row count; for a statement without a result set the variable
receives the number of affected rows. Execution is synchronous on
the calling thread, with one connection per execution. Failures do
not throw: they are reported through `dbLastError()`. JDBC drivers
come from the server — Paper ships SQLite and MySQL drivers — so
the engine jar bundles none; a data source whose driver the server
does not provide fails cleanly through the last-error expression.
`examples/skriptdb.ts` is the sample program.

| TypeScript | Meaning |
| --- | --- |
| `dataSource(url)` | a data source value from a documented URL |
| `dbExecute(ds, query)` | execute one SQL statement |
| `dbExecute(ds, query, var)` | execute and store the result / affected-row count in a variable |
| `dbLastError()` | the last failed execution's message (no value after a success) |

Verified by `examples/behavior/skriptdb.behavior.ts` against a
local SQLite file (DDL, parameterized inserts, stored result
read-back, an injection attempt stored as data, the error path).
Network databases cannot be exercised in this environment (outbound
TCP from the server process is restricted), so MySQL and friends
are implemented from the documented URL contract but unverified
here; SQLite is the verified path.

### skUtilities slice 1: the text file core

skUtilities is a GPL-3.0 addon, so — like the engine itself — this
slice is a clean-room reimplementation from documented behavior
only; no addon code was consulted. Its flagship area is file
operations, and this slice covers the core of it: create, delete,
write, append, and read text files, count and pick lines, and test
existence.

Paths are text expressions confined to the engine's files root,
`plugins/skript-ts/files/`: relative paths resolve under it, and
absolute paths or paths that escape the root after normalization
are refused — statements do nothing, expressions yield no value,
the condition is false. The original addon is deliberately
non-restrictive about paths (its README warns it can damage a
server), so the confinement is an intentional engine safety rule,
not a documented behavior. `fileCreate` makes parent directories
and an empty file and leaves an existing file's contents
untouched; `fileWrite` replaces the whole file (UTF-8);
`fileAppend` adds the text plus a newline; `fileDelete` removes a
regular file or an *empty* directory (there is no recursive
delete). `fileContents` returns the whole file as one string,
`fileLine` is 1-based, and `fileLineCount` counts lines (an empty
file is 0); all three yield no value for a missing file. Failures
never throw: they log a warning engine side. `examples/skutil.ts`
is the sample program.

| TypeScript | Meaning |
| --- | --- |
| `fileCreate(path)` | create an empty file (and parents), leaving an existing file untouched |
| `dirCreate(path)` | create a directory including parents |
| `fileDelete(path)` | delete a regular file or an empty directory |
| `fileWrite(path, text)` | replace a file's whole contents with the text |
| `fileAppend(path, text)` | append the text plus a newline to a file |
| `fileContents(path)` | the whole text of a file (no value when missing) |
| `fileLine(path, n)` | the 1-based line `n` of a file (no value when out of range / missing) |
| `fileLineCount(path)` | the number of lines in a file (no value when missing) |
| `fileExists(path)` | condition: a file or directory exists at the path |

Verified by `examples/behavior/skutil.behavior.ts` (create →
append → contents read-back → per-line read-back → line count →
a refused `../` escape → delete). The addon's URL features
(text fetch / download) are out of this slice: they need outbound
network access, which this environment restricts from the server
process, so they would be unverifiable here.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 kurazuuuuuu.
