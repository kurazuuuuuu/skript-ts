# AGENTS.md

Guidance for AI coding agents working in this repository. Read this
file first; it is the entry point. Human readers should start with
[README.md](README.md).

## What this project is

skript-ts lets you write Minecraft (Paper) server scripts in typed
TypeScript instead of Skript's English-like DSL. A builder API in
`src/api.ts` constructs an AST; the emitter produces `.sk` files for
Skript 2.17.1 on Paper 1.21.11, and a clean-room engine jar
(`engine/`) executes the same programs directly on Paper with no
Skript plugin. Both runtimes must satisfy the same behavior tests.

## Set up before you change anything

Follow [docs/agent-setup.md](docs/agent-setup.md) step by step: it
covers prerequisites (Node + pnpm, JDK 21), the sandbox server the
verification harness boots, the first `verify` run, and
troubleshooting. Do not improvise a different setup — the harness
expects the layout described there.

There is also a copy-paste prompt template in that document
("Template prompt") for handing the whole setup to another agent.

## Working rules

- **Stay inside the supported subset.** The canonical list of
  builders and their semantics is [docs/reference.md](docs/reference.md).
  Anything not listed there is unsupported. Adding support for a new
  construct is a library change (API + emitter + engine + tests),
  never a script-level shortcut.
- **One TypeScript file per emitted `.sk` file**, same relative path
  and name, so source maps stay meaningful.
- **Statement bodies are arrays.** Event builders, command bodies,
  loop bodies and `if` branches all take arrays of statements.
  Passing a bare statement is the most common generator mistake.
- **Compose message text with `fmt()`** and expression parts; let the
  emitter handle Skript string escaping (quotes and percent signs
  are doubled for you).
- **Use `victim()` in death events**, not `player()` — Skript has no
  player in an `on death` event and rejects it at load time.
- **Variables are dynamic by design** (Skript compatibility). The
  writing side is typed; values read back from the variable store
  are intentionally loose-typed. Do not "fix" this.
- **Never point verification at a real server.** The CLI boots the
  throwaway sandbox in `server/` only.
- A skill pack for developing with skript-ts lives in
  [`skills/`](skills/) (writing guide, semantics summary,
  verification procedure).

## Contributing

### Development flow and gates

Every change must pass, in order:

1. `pnpm typecheck` — the type checker is the first guardrail.
2. `pnpm test` — golden tests compare every construct and sample
   program against the expected `.sk` output in `tests/fixtures/`.
3. `bin/skript-ts.mjs verify` — boots a real Paper server, checks
   that the emitted scripts load under Skript 2.17.1 with no
   errors, and runs the mineflayer behavior suites in
   `examples/behavior/`. Engine-side changes also need
   `bin/skript-ts.mjs verify --engine`.

Load checks only prove a script parses; behavior tests are what
catch semantic bugs. A change that is green on 1–2 but untested on
a real server is not done.

### Clean-room principle

Skript and several addons are GPL. This project reimplements
behavior **from specifications and observed behavior only** — never
copy code from Skript or from an addon. Before porting any addon
feature, check its license in
[docs/addon-inventory.md](docs/addon-inventory.md); addons without a
license file are never ported. The engine jar contains no Skript
code, only the behavior contract that the behavior tests pin down.

### Semantics are probed, never guessed

Skript semantics are full of surprises (case-insensitive text
equality, an unset variable not equalling anything — not even
another unset variable, `mod()` being a function rather than an
operator, and so on). When you need a semantic fact that
[docs/reference.md](docs/reference.md) does not state, determine it
empirically: write a small probe script, run it against the real
Skript on the sandbox server (the resident `probe` commands exist
for exactly this), and record the result in the reference. Do not
encode a guessed behavior into the API, the emitter, or the engine.

### Versioning and license

- Versions use the date format `vYYYY.MM.DD` (for example
  `v2026.11.11`); the same value goes into `package.json`'s
  `version` field without the leading `v`.
- The project is MIT licensed — see [LICENSE](LICENSE).
  Contributions are accepted under the same license.
