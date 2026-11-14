# Engine jar and engine builtins

The clean-room engine that runs skript-ts programs on Paper with
no Skript plugin, and the addon features reimplemented natively
inside it. Moved out of the README; the language itself is
specified in [reference.md](reference.md).

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
Skript code is used — only the behavior contract of the supported subset,
which is specified by the [SPEC](reference.md) and locked in by the
same mineflayer behavior tests that validate the transpiled `.sk`
files. The 27 behavior suites in
[`examples/behavior/`](../examples/behavior/) are the specification
both runtimes must satisfy; engine builtins (below) add their own
engine-only tests.
Documented interpretation choices where the subset leaves
room: a first join fires both `on first join` and `on join` handlers
(as under Skript); player-keyed variables use the player's UUID (see
"Variable keys and player identity" below); whole numbers render
without a fraction (`1`, not `1.0`).

### Variable keys and player identity

A variable index that is a player — `{growth::%player%}` — is
stored under the player's **UUID** (`growth::e5240337-...`), so a
player who renames keeps their data. Only the storage key
differs: a player still displays as their name in messages, in
`nameOf`, and everywhere else a player is rendered as text.

The legacy name form stays available for stores written before
UUID keying: `"variables": {"playerKeysUseUuid": false}` in
`plugins/skript-ts/config.json` keys player indices by name
again. Note the trade-off that makes it legacy: under name
keying, a rename orphans the player's data under their old name.

While UUID keying is in effect, the engine migrates a loaded
store once per startup: every index segment (the part after the
variable name — a player only ever appears as an index) that
exactly equals a known player's name is rewritten to that
player's UUID. The
name → UUID map comes from the server's own offline-player
records and only includes names belonging to exactly one UUID —
a name that changed hands is ambiguous in the old format and is
left alone. Nothing is deleted: an entry whose UUID key already
exists stays name-keyed (counted in the startup log line), and
entries whose player cannot be resolved stay name-keyed too;
both remain reachable by switching the legacy option on. A plain
text index that merely equals a player's name is
indistinguishable from a player index in the store format and
migrates with it.

That indistinguishability is the migration's known hazard
(feedback B6-2): data keyed by a player-name _string_ — written
through the name as text rather than through the player value —
moves to the UUID key too and is no longer reachable by that
string. Limiting the migration to player-derived keys is not
possible for existing stores: the format records no provenance
for a key segment, so a player-derived segment and a string
segment are the same bytes, and "player-derived only" would
mean migrating nothing. The safeguard is therefore a warning,
not a filter (decided in feedback lane fb3-keys): before
anything moves, the migration logs a WARNING counting the
candidate entries and naming example keys, and the startup log
line afterwards reports the per-category counts — candidates
examined, entries moved (labelled as containing both
player-derived and name-spelling string keys), conflicts left
name-keyed, and names shared by more than one UUID left
unmapped. An operator who keys data by player-name strings can
stop the server and select the legacy option instead. The
migration logic and this contract are pinned by
`engine/tests/VariablesMigrationTest.java` (run
`engine/test.sh`).

In `.sk` mode the transpiled text is the same `{growth::%player%}`
either way; which key form is used is Skript's own config
setting, `use player UUIDs in variable names` in
`plugins/Skript/config.sk`.

Sample: `examples/uuidvars.ts`; verified by
`examples/behavior/uuidvars.behavior.ts`, which reads the stored
key segment back in-game and asserts it is the bot's UUID.

### Building the jar

The build needs a JDK 21: `engine/build.sh` uses `$SKRIPT_TS_JDK`
when set and otherwise falls back to a conventional tools path
(see [agent-setup.md](agent-setup.md) step 5). Compile-time
libraries live in `engine/libs/` (the jars are gitignored) and
are fetched once with SHA-512 checksum verification; the fetch
is done with curl (see `engine/fetch-libs.sh`):

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
any of them is _engine-only_ — the build writes its IR but no `.sk`,
Skript-mode deployment skips it, and calling `emit()` on it throws.
Behavior tests for builtins run only under `verify --engine` (the
test context exposes `t.mode`; under Skript mode they pass without
exercising anything). `examples/mundosk.ts` is the sample program.

### MundoSK slice 1: WebSocket client + world borders

WebSocket connections are named by a script-chosen id and live in
the engine (backed by the JDK's `java.net.http.WebSocket`). Messages
sent before the socket finishes opening are queued and flushed in
order; the close event fires whoever closed the connection.

| TypeScript                         | Meaning                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wsConnect(id, url)`               | open a WebSocket client connection                                                                                                                                   |
| `wsSend(id, text)`                 | send a text message                                                                                                                                                  |
| `wsDisconnect(id)`                 | close the connection                                                                                                                                                 |
| `onWsOpen(body)`                   | event: a connection opened                                                                                                                                           |
| `onWsMessage(body)`                | event: a text message arrived                                                                                                                                        |
| `onWsClose(body)`                  | event: a connection closed                                                                                                                                           |
| `wsMessage()`                      | the received text (inside `onWsMessage`)                                                                                                                             |
| `wsId()`                           | the connection id (inside websocket events)                                                                                                                          |
| `worldOf(target)`                  | the world of a player / location (promoted to core language in phase 18 — see _World operations and periodical events_; it stays listed here as this slice's origin) |
| `borderSize(world)`                | current size of the world's border                                                                                                                                   |
| `borderCenter(world)`              | center location of the world's border                                                                                                                                |
| `setBorderSize(world, size)`       | set the border size                                                                                                                                                  |
| `setBorderCenter(world, location)` | set the border center                                                                                                                                                |

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

| TypeScript                 | Meaning                                               |
| -------------------------- | ----------------------------------------------------- |
| `timerCreate(id, seconds)` | start (or restart) a named countdown                  |
| `timerStop(id)`            | remove a timer without firing complete                |
| `timerPause(id)`           | freeze a timer's countdown                            |
| `timerResume(id)`          | continue a paused timer                               |
| `onTimerTick(body)`        | event: a timer ticked (once per second)               |
| `onTimerComplete(body)`    | event: a timer's countdown reached zero               |
| `timerId()`                | the timer's name (inside timer events)                |
| `timerTimeLeft(name)`      | seconds remaining on the named timer                  |
| `timerActive(name)`        | condition: the named timer exists (running or paused) |

Verified by `examples/behavior/sharpsk.behavior.ts` (full countdown
to completion, pause freezing the countdown, silent stop).

### skript-db slice 1: SQL data sources

A data source is a value: build one from a documented URL and keep
it in a variable (`set(variable("sql"), dataSource(str("sqlite:data.db")))`),
the pattern skript-db documents. Supported URL forms are
`sqlite:<path>` (relative paths resolve under `plugins/skript-ts/data/`),
`mysql://host[:port]/db?user=..&password=<redacted> `mariadb://...`and`postgresql://...`; credentials travel as query parameters. Data
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

| TypeScript                  | Meaning                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `dataSource(url)`           | a data source value from a documented URL                       |
| `dbExecute(ds, query)`      | execute one SQL statement                                       |
| `dbExecute(ds, query, var)` | execute and store the result / affected-row count in a variable |
| `dbLastError()`             | the last failed execution's message (no value after a success)  |

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
regular file or an _empty_ directory (there is no recursive
delete). `fileContents` returns the whole file as one string,
`fileLine` is 1-based, and `fileLineCount` counts lines (an empty
file is 0); all three yield no value for a missing file. Failures
never throw: they log a warning engine side. `examples/skutil.ts`
is the sample program.

| TypeScript               | Meaning                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `fileCreate(path)`       | create an empty file (and parents), leaving an existing file untouched |
| `dirCreate(path)`        | create a directory including parents                                   |
| `fileDelete(path)`       | delete a regular file or an empty directory                            |
| `fileWrite(path, text)`  | replace a file's whole contents with the text                          |
| `fileAppend(path, text)` | append the text plus a newline to a file                               |
| `fileContents(path)`     | the whole text of a file (no value when missing)                       |
| `fileLine(path, n)`      | the 1-based line `n` of a file (no value when out of range / missing)  |
| `fileLineCount(path)`    | the number of lines in a file (no value when missing)                  |
| `fileExists(path)`       | condition: a file or directory exists at the path                      |

Verified by `examples/behavior/skutil.behavior.ts` (create →
append → contents read-back → per-line read-back → line count →
a refused `../` escape → delete). The addon's URL features
(text fetch / download) are out of this slice: they need outbound
network access, which this environment restricts from the server
process, so they would be unverifiable here.

### Ersatz slice 1: PlaceholderAPI integration

Ersatz is the PlaceholderAPI bridge for Skript; this slice
reimplements that bridge inside the engine, clean-room from
documented behavior (the addon is GPL-3.0 and no addon code was
consulted; its provenance was pinned down first — the author is
Pikachu920, and the surviving repository, now under a renamed
account, is the author's own, GPL-3.0 licensed from its first day;
see `docs/addon-inventory.md`). PlaceholderAPI itself stays an
external plugin: the engine lists it under `softdepend`, the
verify harness deploys the official 2.12.3 jar next to the engine
in the sandbox (fetched checksum-pinned by `engine/fetch-libs.sh`),
and on a server without PlaceholderAPI the bridge is simply
inactive — the read expression yields no value and request events
never fire.

Reading: `placeholderValue(player, text)` evaluates the PAPI
placeholders in a text for that player. A text holding no `%...%`
token is treated as a single placeholder name (the documented
bare form, e.g. `player_ping`); a text holding tokens is
formatted as a whole. Placeholders nobody resolves stay in the
text literally, per PAPI's own contract.

Serving: `onPlaceholderRequest(prefix, body)` makes the script
answer PAPI requests for that prefix (an expansion identifier).
Inside the body, `placeholderIdentifier()` is the parameter part
of the request (`%prefix_<identifier>%`), `placeholderPrefix()`
is the prefix that matched, and `player()` is the player the
value is computed for (no value for offline/console requests).
`setPlaceholderResult(text)` supplies the answer; a handler that
never sets a result leaves the placeholder unresolved.
Registrations mirror the loaded program and are re-synced on
every script reload. Requests that arrive off the main thread
are hopped onto it with a bounded wait. `examples/ersatz.ts` is
the sample program.

| TypeScript                           | Meaning                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `placeholderValue(player, text)`     | evaluate PAPI placeholders in a text for a player (bare name or whole-string form) |
| `onPlaceholderRequest(prefix, body)` | event: a placeholder under this prefix was requested                               |
| `placeholderIdentifier()`            | the parameter part of the request (inside the event)                               |
| `placeholderPrefix()`                | the prefix that matched (inside the event)                                         |
| `setPlaceholderResult(text)`         | answer the placeholder request being handled                                       |

Verified by `examples/behavior/ersatz.behavior.ts` as a full
round trip through the real PlaceholderAPI plugin: the script
serves two prefixes of its own and reads them back (the bare
name form, a whole string with literal text around a token, and
the second prefix resolving the target player's name), and an
unresolvable placeholder stays literal. Relational placeholders
(a feature the successor addon added later) and
MVdWPlaceholderAPI (a different plugin) are out of this slice.
Since the core language gained a text-equality condition
(phase 11), handlers can also branch on the identifier: the
sample answers the player's own name for `%skriptts_name%` and
echoes every other identifier.

### Phase 26: HTTP requests and `env()` (a skript-ts original extension)

Original Skript has no HTTP client, so this slice is an original
extension of skript-ts, shaped to fit the existing event and
continuation model: a request is fired asynchronously and its
completion re-enters the script as an event.

| TypeScript                           | Meaning                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `httpFetch(id, url, opts?)`          | statement: start an async GET; the body returns as text                |
| `httpDownload(id, url, path, opts?)` | statement: start an async GET that saves the body under the files root |
| `onHttpResponse(body)`               | event: a request completed (successfully or not)                       |
| `httpId()`                           | the completion's id (event only)                                       |
| `httpStatus()`                       | the HTTP status code (event only)                                      |
| `httpBody()`                         | the response body of a fetch (event only)                              |
| `httpError()`                        | the failure kind, or no value on success (event only)                  |
| `httpSavedPath()`                    | where a download was saved, relative to the files root (event only)    |
| `httpOk()`                           | condition: the completion carries no error                             |

`id` is a non-empty literal the script chooses to tell its own
requests apart; `opts.timeoutSeconds` bounds the whole request
(1–120, default deadline 15 s). Failure kinds are `policy`,
`network`, `timeout`, `size`, `io` and `busy`; `httpError()`
returns the kind only — detail goes to the server log, because
URLs may carry secrets. Bodies are capped at 8 MiB, the connect
timeout is 5 s, at most 8 requests run at once (further requests
complete as `busy`), and redirects are followed manually for at
most 3 hops, re-validated at every hop. A download writes to a
temporary `.part` file and is renamed into place atomically; it
saves the body whatever the HTTP status is, so scripts check
`httpStatus()` themselves.

SSRF policy (default): `http`/`https` only, no user info in the
URL, ports 80/443 only, and every resolved address — for the
initial URL and each redirect hop — is checked; loopback,
link-local, site-local (RFC 1918, fc00::/7), CGNAT (100.64/10),
unspecified and multicast addresses are refused as `policy`.
For development fixtures there is an escape hatch:
`"http": {"allowPrivateAddresses": true}` in
`plugins/skript-ts/config.json` allows private targets and all
ports, and the engine logs a loud warning when it is on. Do not
use it on a production server. One known limitation: the JDK
re-resolves the host name when it connects, so a DNS rebinding
window remains between the check and the connection.

`env(name)` resolves `System.getenv(name)` on the server and
yields no value when the variable is unset. The JVM inherits the
environment of whatever launched the server, so changing a
variable requires a server restart — scripts cannot set or
refresh values at runtime.

Samples: `examples/http.ts` (nine commands against a local echo
server) and `examples/env.ts`; verified by
`examples/behavior/http.behavior.ts`, which asserts the success,
404, redirect, oversize, timeout, policy-refusal and
download/read-back paths plus the `env()` behavior on a real
server.

Network databases (skript-db slice) were verified on a real VM
in this phase: MySQL 8.0 works through the Connector/J driver
Paper ships, and PostgreSQL 16 works when its driver is supplied
to the plugin (for example merged into the jar or via plugin
libraries) — the engine initializes the scheme's well-known
driver class before connecting, because such a driver registers
with `DriverManager` only once its class is loaded. The
`mariadb://` URL form fails cleanly through `dbLastError()` when
no MariaDB driver is present.
