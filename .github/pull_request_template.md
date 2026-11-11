## Summary

<!-- What changed and why. -->

## Checks

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `bin/skript-ts.mjs verify` passes (real Paper + Skript)
- [ ] `bin/skript-ts.mjs verify --engine` passes (if the engine changed)

## Semantics

- [ ] Behavior changes were probed against the real Skript 2.17.1, not guessed
- [ ] `docs/reference.md` / `docs/reference.ja.md` updated for subset changes

## Clean room

- [ ] No code copied from Skript or addon sources; spec/behavior-based only
