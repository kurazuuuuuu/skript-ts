# Verification and the build / verify CLI

How skript-ts is verified, and the CLI that drives building and
verification. Moved out of the README.

## Verification

Two stages, both required:

1. **Golden tests** — `pnpm typecheck` and `pnpm test` (vitest). Every
   construct and every sample program is compared against expected `.sk`
   output in [`tests/fixtures/`](../tests/fixtures/).
2. **Real server check** — the emitted sample `.sk` files are loaded by an
   actual Paper server with the Skript plugin, and the console log must
   show no Skript errors. The server harness lives in `server/`
   (gitignored): Paper 1.21.11, Skript 2.17.1, Temurin JDK 21.
   `pnpm exec tsx examples/to-sk-files.ts` regenerates the `.sk` files
   of the five core samples (welcome, kit, chatlog, death, spawn) into
   `server/plugins/Skript/scripts/` for manual runs; the CLI's
   `build --deploy` and `verify` deploy the full sample set.

## Build & verify CLI

`bin/skript-ts.mjs` (run from the project root) drives the whole
pipeline. Stages are shown one line each: a running stage updates its
own line in place on a TTY, a finished stage stays with a ✓ or ✗, and
non-TTY output falls back to append-only lines.

```sh
# typecheck -> transpile into build/ (add --deploy to also copy into a server)
bin/skript-ts.mjs build [--src examples] [--out build] [--deploy] [--engine] [--server-dir server] [--json]

# full verification against the throwaway sandbox server in server/
bin/skript-ts.mjs verify [--engine] [--no-behavior] [--no-fresh] [--json]
```

`verify` runs: typecheck → transpile → deploy → server start → script
load check (initial load plus `skript reload all`) → behavior tests →
stop. With `--json`, progress goes to stderr and a single JSON result
(per-stage status, mapped errors, behavior results) is printed to
stdout; the exit code is 0 only when everything passes.

For semantics probes there is a resident mode: `probe start` boots the
sandbox once under a background host process, each
`probe run <probe-dir> [--commands <file>]` swaps the hand-written
`.sk` probes into the scripts folder and reloads instead of rebooting,
and `probe stop` shuts it down (verifying no process or `session.lock`
is left behind). `probe status` reports whether it is running.

For engine-mode development there is a watch loop:
`bin/skript-ts.mjs watch --server-dir server [--src <dir>] [--yes]`
runs against a server that is **already running** with the engine jar
(watch never starts or stops it). Each save is typechecked, transpiled
and deployed, and the engine reloads it without a restart: the CLI
writes a `reload.request` marker into the plugin data folder only
after the deploy completes, the engine polls for it, reloads, and
answers with `reload.status`. Byte-identical IR is skipped entirely
(no deploy, no reload), and a failed round leaves the running program
untouched. Note that a reload resets named timers and re-anchors
periodical triggers (first fire one full period after the reload)
while global variables persist — the same semantics as Skript's
`/skript reload`. Because the deploy target is a live server,
`--server-dir` is required explicitly, and the target (server dir,
world, MOTD, deploy folder) is confirmed before the first round.

Transpiling also writes a source map next to each `.sk` file
(`<name>.sk.map.json`) recording, for every emitted line, the AST node
path and the TypeScript call site that produced it. When Skript reports
a parse error, `verify` reports it mapped back to the TypeScript
position, e.g. `death.sk:2 → examples/death.ts:5:5 (body[0].body[0])`.

Before booting, `verify` wipes the sandbox's per-player state
(playerdata, Skript `variables.csv`, `ops.json`) so behavior tests
start from a clean slate; pass `--no-fresh` to keep it.

### Behavior tests

Load checks prove a script parses; behavior tests prove it _works_.
Tests are TypeScript modules in `<src>/behavior/*.behavior.ts` whose
default export receives a context (`src/behavior.ts`): connect a
[mineflayer](https://github.com/PrismarineJS/mineflayer) bot over a
real connection, wait for chat messages, run console commands, and
assert on inventory. There are 27 suites in
[`examples/behavior/`](../examples/behavior/), covering the welcome
broadcast and first-join item, the `/kit` permission flow, the op
chat-log relay, the death counter, and every later area (logic, lists,
functions, gameplay, events, text, GUIs, world, player state, display,
timespans, boss bars, command definitions, HTTP) plus the engine
builtins.

## CI and releases

GitHub Actions (`.github/workflows/ci.yml`) runs the fast gates
(`pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`) and
the engine jar build on every push and pull request. `pnpm check`
is the Vite+ toolchain check: Oxfmt format check, Oxlint, and the
tsgolint type check in one pass (see `vite.config.ts`). The server-backed
`verify` above is not part of CI v1 — booting a real Paper server is
heavy, so behavior verification stays on the Freestyle verification
farm. Pushing a `v*` tag runs `.github/workflows/release.yml`, which
re-runs the fast gates and the dependency audit, builds
`skript-ts.jar`, and publishes a GitHub Release (as a prerelease)
with the jar, a CLI bundle zip and a SHA-256 checksum file attached;
the artifacts and the checksum file carry signed build-provenance
attestations (see [SECURITY.md](../SECURITY.md)).
