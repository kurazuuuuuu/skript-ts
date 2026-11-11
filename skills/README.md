# skript-ts skill pack

A skill pack that teaches an AI coding agent (Claude Code and
similar SKILL.md-based agents) how to develop with skript-ts:
how to write scripts with the builder API, the semantics that
surprise newcomers, and how to verify changes on a real server.

## Contents

- [`skript-ts/SKILL.md`](skript-ts/SKILL.md) — the skill itself:
  entry point, workflow, and the rules that matter most.
- [`skript-ts/writing-guide.md`](skript-ts/writing-guide.md) —
  layer 1: patterns, recipes, and the mapping from API expressions
  to the Bukkit/Paper classes they hold at runtime.
- [`skript-ts/semantics.md`](skript-ts/semantics.md) — layer 2:
  the verified semantic facts most likely to bite, with the full
  reference linked (the repository's `docs/reference.md` is
  canonical; this file is a summary, not a copy).
- [`skript-ts/verification.md`](skript-ts/verification.md) —
  layer 3: build / verify / probe / watch procedure and how to
  read the gates.

## Install

Once the `skills` CLI subcommand ships:

```sh
npx github:kurazuuuuuu/skript-ts skills install
```

Until then, copy the `skript-ts/` directory into your agent's
skills directory manually (for Claude Code: `~/.claude/skills/`).

## Keeping it in sync

The skill pack is versioned with the repository (date versions,
`vYYYY.MM.DD`). If a construct's behavior seems to differ from
these files, the repository's `docs/reference.md` and the behavior
tests in `examples/behavior/` win — they are the specification.
