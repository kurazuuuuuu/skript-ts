# Semantics summary (layer 2)

The canonical semantic reference is the repository's
[`docs/reference.md`](../../docs/reference.md) — every
builder, its emitted `.sk` form, and its probed semantics. This
file is only the highlight reel: the facts that most often
surprise agents writing skript-ts. If anything here and the
reference disagree, the reference (and the behavior tests) win.

All of these were measured against the real Skript 2.17.1, not
derived from documentation or intuition — and the rule for new
questions is the same: probe, don't guess (see
[verification.md](verification.md)).

## Values and equality

- Text equality is **case-insensitive**; trailing spaces matter.
- A missing value (unset variable, absent event value) equals
  **nothing — not even another missing value**. Inequality is
  the exact negation, so `unset is not 0` is true.
- Ordering comparisons are numbers-only; anything else is false.
- Cross-type literal comparisons can be a **parse error** under
  Skript, so a script comparing mismatched literals may not
  load at all.

## Arithmetic

- `+` over two texts concatenates; every other type mix yields
  **no value** (not an error).
- Division is real division; `1/0` is Infinity and execution
  continues.
- A missing operand with a numeric partner counts as **0**
  (`unset + 100` is 100, `5 / unset` is Infinity); with a text
  partner or both missing, the result is no value.
- There is **no infix remainder**: use `remainder(a, b)`,
  which emits `mod(a, b)` with mathematical-modulo semantics
  (sign of the divisor).

## Logic

- Skript 2.17.1 has no usable textual conjunction, so `and` /
  `or` / `not` in `ifElse` are **lowered to control flow** by
  the emitter. They behave exactly — conditions in this subset
  are pure — but deeply nested composites duplicate blocks in
  the emitted `.sk`.
- `whileLoop` heads accept only a leaf condition or `not(leaf)`,
  because a while head cannot be lowered that way.

## Lists

- A list is the set of `{name::<index>}` entries in the variable
  store. Index identity is by **string form**; names and text
  indices are case-insensitive.
- Iteration order: text indices first (numeric-looking ones by
  value, then alphabetical), then numeric indices ascending.
- `listAdd` uses the smallest free positive index; deleting an
  entry leaves a **hole**. `listRemove` deletes only the first
  match.
- Rendered as text, a list joins as `a, b and c`; a missing
  element renders `<none>`.

## Functions

- Resolution is by signature; names are **case-sensitive**;
  file/definition order does not matter.
- **No conversions, ever**: a runtime value that mismatches its
  parameter type leaves the parameter unset, and the body still
  runs. Defaults apply only to omitted trailing arguments and
  are evaluated before binding.
- Locals are a fresh frame per call. Event values (`player()`
  etc.) do not exist inside function bodies.
- A `wait` inside a function **detaches** the call: the caller
  resumes immediately, an expression-call yields no value, and
  a `return` after a wait is a **load error** under Skript.

## Events

- Filtered headers take literal type-name lists only.
- A left click on an entity is an **attack** (the damage
  event), not a click.
- In `onBlockBreak`, `eventItem()` is the broken block in item
  form, **not** the tool in hand. An empty hand means the value
  is absent (renders `<none>`, not `air`).
- Respawn and bed-leave are not cancellable.
- A first join fires both `onFirstJoin` and `onJoin` handlers.

## Text

- Lengths and indices count **UTF-16 code units** (an emoji is
  2). `charAt` is strict; substring-style reads clamp.
- `splitText` is a **literal** split (never regex),
  case-insensitive by default, and keeps trailing empty parts.
- `contains` is case-**insensitive**; `startsWith` / `endsWith`
  are case-**sensitive**. That asymmetry is the original's own.
- Text literals are component-parsed: `&a` in a literal is real
  formatting, equal to the `§` form. Runtime values keep raw
  `&` until passed through `colored()` / `formatted()`.

## Timespans

- A timespan is an integer number of milliseconds; a month is
  30 days, a year 365 days. Add/subtract saturate at 0;
  timespan ÷ timespan is a numeric ratio.
- Periodical triggers (`every(amount, unit)`) take **literal**
  amounts only, first fire one full period after load, and a
  reload re-anchors them.

## Engine-only boundary

Constructs reimplemented from addons (WebSocket, timers, SQL,
files, PlaceholderAPI, HTTP, `env()`) exist only in the engine:
they have no `.sk` form, the emitter throws on them, and the
build writes IR only. Details per builtin are in the
repository's `docs/engine.md`.
