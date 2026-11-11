# Verification procedure (layer 3)

How to prove a skript-ts change works. The full CLI reference is
the repository's `docs/verification.md`; first-time environment
setup is `docs/agent-setup.md`. This file is the working
procedure and how to read the results.

## The gates, in order

Run all of them from the repository root. A later gate never
excuses a failing earlier one.

1. **Typecheck** — `pnpm typecheck`. Malformed programs must
   die here, before any server is involved.
2. **Golden tests** — `pnpm test`. Every construct and sample
   program is compared against the expected `.sk` in
   `tests/fixtures/`. If you changed an emission on purpose,
   the fixture change is part of your change — review its diff
   like code.
3. **Real server, Skript mode** — `bin/skript-ts.mjs verify`.
   Boots the sandbox Paper server, deploys the emitted `.sk`,
   checks the load (initial load plus `skript reload all`), and
   runs the mineflayer behavior suites in
   `examples/behavior/`.
4. **Real server, engine mode** — `bin/skript-ts.mjs verify
   --engine`, required for anything touching the engine, the
   IR, or engine builtins. Deployment installs the jar and IR
   and renames `Skript.jar` aside; a plain `verify` afterwards
   restores Skript mode. The two runtimes must never be live at
   once (scripts would run twice).

`--json` on `verify` prints one machine-readable result to
stdout (progress moves to stderr); exit code 0 means every
stage passed.

## Reading the results

- **Stage lines**: one line per stage; finished stages keep a
  ✓ or ✗. Read the first ✗ — later stages often fail as a
  consequence.
- **Load errors** are reported mapped back to TypeScript
  positions through the `.sk.map.json` source maps, e.g.
  `death.sk:2 → examples/death.ts:5:5 (body[0].body[0])`.
  Fix the `.ts`; never edit generated `.sk` files.
- **Load check ≠ behavior.** A script can parse perfectly and
  still do the wrong thing (a variable interpolated without
  `%...%` is literal text, for instance). Behavior suites are
  the specification both runtimes must satisfy; a semantic
  change without a behavior test proving it is unfinished.

## Probing unknown semantics

When the reference does not state a behavior, measure it:

1. `bin/skript-ts.mjs probe start` — boots the sandbox once
   under a resident host.
2. Write small hand-written `.sk` probes into a directory and
   run `bin/skript-ts.mjs probe run <probe-dir>
   [--commands <file>] [--out <file>]` — the probes are swapped
   into the scripts folder and reloaded; each console command
   line is sent in turn; the round's log slice lands in the out
   file. Parse errors in a probe are findings, not failures.
3. `bin/skript-ts.mjs probe stop` — shuts down and verifies no
   server process or `session.lock` is left behind.
   `probe status` reports liveness.

Record what you measured in the change (and in
`docs/reference.md` when it generalizes). Never encode a guessed
behavior into the API, the emitter, or the engine.

## Watch mode (engine development)

Against an **already running** engine server:
`bin/skript-ts.mjs watch --server-dir server`. Each save is
typechecked, transpiled and deployed; the engine reloads
without a restart. Byte-identical IR is skipped entirely, and a
failed round leaves the running program untouched. Note that a
reload resets named timers and re-anchors periodical triggers,
while global variables persist — the same semantics as
`/skript reload`.

## Sandbox discipline

- Verification only ever boots the throwaway sandbox in
  `server/`. Never point `--server-dir` at a real server.
- `verify` wipes per-player state (playerdata, `variables.csv`,
  `ops.json`) before booting so behavior tests start clean;
  `--no-fresh` keeps it. The world itself persists between
  runs — behavior tests are written to tolerate that.
