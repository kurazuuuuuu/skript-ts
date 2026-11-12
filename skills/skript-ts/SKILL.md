---
name: skript-ts
description: Develop Minecraft Paper server scripts with skript-ts — typed TypeScript that transpiles to Skript (.sk) or runs on the skript-ts engine jar. Use when writing, reviewing, or debugging skript-ts programs, or when extending the skript-ts library itself. Covers the builder API, verified Skript semantics, and the real-server verification workflow.
---

# skript-ts

Write Minecraft (Paper) server behavior as typed TypeScript
instead of Skript's English-like DSL. A program is an ordinary
TypeScript module that builds an AST with builder functions from
the project's `src/api.ts` and emits it with `emit()` from
`src/index.ts` (in this repository the import path is
`"skript-ts"`). Two runtimes execute the same program: the
transpiled `.sk` under Skript 2.17.1 on Paper 1.21.11, and the
clean-room engine jar with no Skript plugin.

## Read in this order

1. [writing-guide.md](writing-guide.md) — how to write: module
   shape, patterns, recipes, and what each expression holds at
   runtime (mapped to the Bukkit classes you already know).
2. [type-map.md](type-map.md) — the complete type
   correspondence: every value-returning builder mapped to the
   Bukkit/Paper class it holds at runtime, the closed name
   sets `tsc` checks, and where the static typing goes next.
3. [semantics.md](semantics.md) — the verified semantic facts
   that differ from intuition. The full canonical reference is
   the repository's `docs/reference.md`; anything not listed
   there is outside the supported subset.
4. [verification.md](verification.md) — how to prove a change:
   golden gates first, then a real server. A script that merely
   parses is not verified.

## The workflow

1. Write the program as builders — never hand-write `.sk` text.
2. `pnpm typecheck` and `pnpm test` (golden tests against
   `tests/fixtures/`).
3. `bin/skript-ts.mjs verify` boots a real Paper server, loads
   the emitted scripts under Skript, and runs the mineflayer
   behavior suites. Engine-affecting work also needs
   `bin/skript-ts.mjs verify --engine`.
4. If a semantic question comes up that the reference does not
   answer, probe it against the real Skript (see
   verification.md) — never guess semantics.

## Rules that bite first

- **Bodies are arrays.** Every event builder, command body, loop
  body and `if` branch takes an array of statements.
- **One TS file per `.sk` file**, same relative path and name.
- **Use `fmt()`** to compose messages from expressions; the
  emitter doubles quotes and percent signs for you.
- **Use `victim()` in death events** — `player()` there is a
  load error under Skript.
- **Stay inside the subset.** A construct outside
  `docs/reference.md` is a library change (API + emitter +
  engine + tests), not a script trick.
- **Variables are dynamic by design.** Values from the variable
  store are loose-typed on purpose (Skript compatibility).
- **Engine builtins have no `.sk` form.** A program using one is
  engine-only: the build writes IR only, and it runs under
  `verify --engine`.
