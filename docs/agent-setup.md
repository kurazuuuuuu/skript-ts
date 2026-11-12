# Agent setup guide

Step-by-step setup for an AI coding agent (or a human driving one)
to get from a fresh clone to a passing `verify` run. Follow the
steps in order; each step lists the exact command and what success
looks like. If a step fails, go to
[Troubleshooting](#troubleshooting) before trying variations.

Japanese version: [agent-setup.ja.md](agent-setup.ja.md)

## 0. Prerequisites

| Tool    | Requirement                                                                                     | Check            |
| ------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| Git     | any recent version                                                                              | `git --version`  |
| Node.js | 20 or newer                                                                                     | `node --version` |
| pnpm    | 12.15.0 (pinned by `packageManager` in `package.json`; Corepack will provide it)                | `pnpm --version` |
| JDK     | 21 (Temurin or any distribution) — needed by the sandbox server, the engine build, and `verify` | `java -version`  |

If pnpm is missing, enable Corepack: `corepack enable` (it reads
the pinned version from `package.json`).

## 1. Clone and install

```sh
git clone https://github.com/kurazuuuuuu/skript-ts.git
cd skript-ts
pnpm install
```

Success: `node_modules/` exists and the install exits 0.

## 2. Fast gates (no server needed)

```sh
pnpm typecheck
pnpm test
```

Success: typecheck exits 0; the vitest run reports all tests
passing. These golden tests compare every construct and sample
program against the expected `.sk` output in `tests/fixtures/`.

## 3. Provision the sandbox server

`verify` boots a throwaway Paper server from the `server/`
directory (gitignored). Provision it once:

1. Create the layout:

   ```sh
   mkdir -p server/plugins
   ```

2. Put a **Paper 1.21.11** server jar at `server/paper.jar`
   (download from https://papermc.io/downloads — pick the 1.21.11
   build).

3. Put a **Skript 2.17.1** plugin jar at `server/plugins/Skript.jar`
   (download from https://github.com/SkriptLang/Skript/releases —
   release 2.17.1).

4. Accept the Minecraft EULA in `server/eula.txt`:

   ```sh
   printf 'eula=true\n' > server/eula.txt
   ```

The CLI finds Java in this order: the `--java <path>` flag, the
`SKRIPT_TS_JAVA` environment variable, then `java` on your `PATH`.
If your JDK 21 is not the default `java`, pass it explicitly in
step 4 (for example `--java /path/to/jdk21/bin/java`).

## 4. First verification (Skript mode)

From the repository root:

```sh
bin/skript-ts.mjs verify --json
```

This runs: typecheck → transpile the examples → deploy into the
sandbox → boot Paper → load check (initial load plus
`skript reload all`) → mineflayer behavior tests → stop. With
`--json`, progress goes to stderr and one JSON result is printed to
stdout; the exit code is 0 only when every stage passes.

Success: exit code 0 and the JSON result reports every stage green,
including all 27 behavior suites. Skript parse errors, if any, are
reported mapped back to TypeScript positions via the `.sk.map.json`
source maps (for example `death.sk:2 → examples/death.ts:5:5`) —
fix the TypeScript, not the generated `.sk`.

Useful variations:

- `bin/skript-ts.mjs verify --no-behavior` — load check only
  (faster; does not prove behavior).
- `bin/skript-ts.mjs build --deploy` — transpile and deploy without
  booting the server.

## 5. Engine jar (optional, for engine-mode work)

```sh
engine/fetch-libs.sh   # download compile-time libs, SHA-512 verified
engine/build.sh        # -> engine/build/skript-ts.jar
bin/skript-ts.mjs verify --engine --json
```

`engine/build.sh` looks for a JDK 21 under `$SKRIPT_TS_JDK` first
and falls back to a conventional tools path; set
`SKRIPT_TS_JDK=/path/to/jdk21` if it is not found. `verify --engine`
deploys the IR files plus the jar and renames `Skript.jar` aside,
so the sandbox runs with **no** Skript plugin; a plain `verify`
afterwards restores Skript mode. Never leave both runtimes
installed — every script would run twice.

To install the jar on your own server instead: copy
`engine/build/skript-ts.jar` into that server's `plugins/` folder
and the generated `<name>.ir.json` files into
`plugins/skript-ts/scripts/`.

## 6. Install the skill pack (for agent-driven development)

The skill pack in [`skills/`](../skills/) installs into your
agent's skills directory with the open agent skills CLI:

```sh
npx skills add kurazuuuuuu/skript-ts
```

This works from any directory and needs nothing but Node.js:
the installer discovers the pack in this repository and places
it in the skills directory of the agent you select (for Claude
Code: `~/.claude/skills/skript-ts/`).

From a clone of this repository, the bundled subcommand does
the same job without the extra tool: after `pnpm install`, run
`./bin/skript-ts.mjs skills install` from the repository root.
It copies `skills/skript-ts/` into `~/.claude/skills/` by
default; `--dir <dir>` chooses a different skills directory and
`--json` prints a machine-readable result. Re-running either
route is safe: files that already match are left untouched.
Copying the `skills/skript-ts/` directory into your agent's
skills directory manually works too.

## Template prompt

To hand this entire setup to another AI agent, copy the prompt
below, replace the `<PLACEHOLDER>` values, and paste it into the
agent (Claude Code or similar). The agent is expected to work
through [this document](#agent-setup-guide) on its own and report
back with the result of the first verification.

```text
Set up the skript-ts development environment and run the first
verification, following the repository's own instructions.

Repository: https://github.com/kurazuuuuuu/skript-ts
Start by reading AGENTS.md at the repository root, then follow
docs/agent-setup.md step by step.

My environment:
- Clone the repository into: <CLONE_DIR>
- JDK 21 is at: <JAVA_HOME_OR_PATH_TO_JAVA> (if this is "default",
  just use the java on PATH)
- Sandbox server directory: <SERVER_DIR> (default: server/ inside
  the clone — keep the default unless I say otherwise)
- Paper version: 1.21.11 (fixed for this project; do not upgrade)
- Skript version: 2.17.1 (fixed for this project; do not upgrade)

Rules:
- Follow docs/agent-setup.md exactly. Do not substitute a different
  build or test procedure, and do not point verification at any
  real server — the throwaway sandbox only.
- Work through every step: prerequisites, pnpm install,
  pnpm typecheck, pnpm test, sandbox provisioning (Paper jar,
  Skript jar, EULA), and finally
  `bin/skript-ts.mjs verify --json`.
- If a step fails, diagnose the cause using the Troubleshooting
  section of docs/agent-setup.md before trying variations, and do
  not skip the failing step silently.
- When you are done, report: (1) whether verify exited 0 and all
  behavior suites passed, (2) for any step that failed, the
  failing command, its error output, what you diagnosed as the
  cause, and what you tried, (3) anything in my environment that
  differs from the document's assumptions.
```

## Troubleshooting

| Symptom                                            | Likely cause and fix                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `java` not found / wrong version during `verify`   | JDK 21 is not the default. Pass `--java /path/to/jdk21/bin/java` or set `SKRIPT_TS_JAVA`.                                                                                                                                                  |
| `javac not found` in `engine/build.sh`             | Set `SKRIPT_TS_JDK=/path/to/jdk21` and re-run.                                                                                                                                                                                             |
| SHA-512 mismatch in `engine/fetch-libs.sh`         | The downloaded jar is corrupt or from a different version. Delete the file in `engine/libs/` and re-run the script.                                                                                                                        |
| Server fails to start / EULA message in the log    | `server/eula.txt` is missing or does not contain `eula=true`. See step 3.                                                                                                                                                                  |
| Address already in use (port 25565)                | Another server (or a leftover sandbox) holds the port. Stop it; if a previous `probe` is still running, `bin/skript-ts.mjs probe stop` shuts it down and verifies no process or `session.lock` remains.                                    |
| Skript reports a parse error for a generated `.sk` | The JSON result maps it back to a TypeScript position. Fix the `.ts` source; never edit generated `.sk` files (they are regenerated). If the construct itself is unsupported, it is outside the subset — see [reference.md](reference.md). |
| A script using engine builtins produces no `.sk`   | Expected: builtin constructs have no `.sk` form. The build writes IR only; run it with `verify --engine`.                                                                                                                                  |
| Both Skript and engine seem to run scripts         | A previous `--engine` run left the sandbox in engine mode (or vice versa). Run a plain `bin/skript-ts.mjs verify` to restore Skript mode, or `verify --engine` for engine mode — each run sets the mode exclusively.                       |
| Behavior tests time out on chat messages           | The sandbox world persists between runs; ambient activity can bury expected messages. Re-run `verify` (it wipes per-player state first) and check the failing suite's expectations before changing code.                                   |
