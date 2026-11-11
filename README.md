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

Sample programs live in [`examples/`](examples/): the five v0
programs (welcome, kit command, chat log relay, death counter, spawn
commands), one per engine builtin, `logic.ts` for the core language
(comparisons, logic, arithmetic), `lists.ts` for list variables,
the extended loops, `while` and `wait`, `functions.ts` for custom
functions, `gameplay.ts` for the gameplay events (block
break/place, clicks, damage), `events2.ts` for the event
filters and the pickup / drop / respawn / bed events,
`text.ts` for the text operations, `gui.ts` for items,
inventories and GUIs, and `world.ts` for world operations
(blocks, locations, the world clock and weather) and the
periodical trigger. They
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
| `onBlockBreak` | `on block break:` |
| `onBlockPlace` | `on block place:` |
| `onRightClick` | `on right click:` |
| `onLeftClick` | `on left click:` |
| `onDamage` | `on damage:` |
| `onPickup` | `on pick up:` |
| `onDrop` | `on drop:` |
| `onRespawn` | `on respawn:` |
| `onBedEnter` | `on bed enter:` |
| `onBedLeave` | `on bed leave:` |

### Commands
`command(name, args, body, options?)` — any number of typed
arguments (see **Command definitions** below for the full
semantics). `args` is either one legacy argument type
(`"text"`, `"player"` or `"integer"`, always optional, with an
optional boolean fourth argument) or a list of `cmdArg(type,
optional?)` specs. Optional arguments emit as `[<type>]`,
required ones as `<type>`. The body becomes the `trigger:`
section.

### Effects (statements)
| TypeScript | Skript |
| --- | --- |
| `send(target, message)` | `send "<text>" to <target>` (any expression; text emits quoted, other expressions bare) |
| `broadcast(message)` | `broadcast "<text>"` (any expression) |
| `give(target, itemName, amount)` | `give <amount> <item> to <target>` |
| `teleport(target, location)` | `teleport <target> to <location>` |
| `set(variable, value)` | `set {var} to <value>` |
| `add(variable, value)` | `add <value> to {var}` |
| `ifElse(cond, then, else?)` | `if <cond>:` … `else:` |
| `loopPlayers(body)` | `loop all players:` |
| `listAdd(list, value)` | `add <value> to {list::*}` |
| `listRemove(list, value)` | `remove <value> from {list::*}` |
| `deleteVar(target)` | `delete {var}` / `delete {list::*}` |
| `loopList(list, body)` | `loop {list::*}:` |
| `loopTimes(count, body)` | `loop <n> times:` |
| `loopRange(from, to, body)` | `loop numbers from <a> to <b>:` |
| `whileLoop(cond, body)` | `while <cond>:` (leaf conditions only, see below) |
| `wait(amount, unit)` | `wait <n> ticks` / `seconds` / `minutes` |
| `returnValue(value)` | `return <value>` (inside `defineFunction`) |
| `stopTrigger()` | `stop` (early exit from a trigger or function) |
| `callStmt(name, ...args)` | `<name>(<args>)` as a bare statement |
| `cancelEvent()` | `cancel event` (in a cancellable event handler) |
| `uncancelEvent()` | `uncancel event` |
| `setDamage(value)` | `set damage to <value>` (inside `onDamage`) |
| `replaceAllIn(var, find, repl, caseSensitive?)` | `replace all <find> in {var} with <repl>` (`with case sensitivity` when asked) |
| `replaceFirstIn(var, find, repl, caseSensitive?)` | `replace first <find> in {var} with <repl>` |

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
| `listVar(name)` | `{name::*}` | `%{name::*}%` |
| `localVar(name)` / `localVar(name, index)` | `{_name}` / `{_name::%<index>%}` | `%{_name}%` |
| `localList(name)` | `{_name::*}` | `%{_name::*}%` |
| `call(name, ...args)` | `<name>(<args>)` | `%<name>(<args>)%` |
| `listSize(list)` | `size of {name::*}` | `%size of {name::*}%` |
| `loopValue()` | `loop-value` | `%loop-value%` |
| `loopIndex()` | `loop-index` | `%loop-index%` |
| `str(s)` | `"<s>"` | raw text |
| `num(n)` / `bool(b)` | `42` / `true` | same |
| `item(name)` | `diamond sword` | same |
| `locationOf(e)` | `location of <e>` | `%location of <e>%` |
| `eventBlock()` | `event-block` | `%event-block%` |
| `eventItem()` | `event-item` | `%event-item%` |
| `attacker()` | `attacker` | `%attacker%` |
| `damageAmount()` | `damage` | `%damage%` |
| `damageCause()` | `damage cause` | `%damage cause%` |
| `typeOf(e)` | `type of <e>` | `%type of <e>%` |
| `plus(a, b)` / `minus(a, b)` / `times(a, b)` / `dividedBy(a, b)` | `(<a> + <b>)` etc. | `%(<a> + <b>)%` etc. |
| `remainder(a, b)` (or `arith(op, a, b)` for any of the five) | `mod(<a>, <b>)` | `%mod(<a>, <b>)%` |
| `fmt(...parts)` | `"<parts>"` | flattened into the enclosing string |
| `textLength(t)` | `length of <t>` | `%length of <t>%` |
| `substring(t, from, to)` | `substring of <t> from <a> to <b>` | `%substring of <t> from <a> to <b>%` |
| `firstChars(t, n)` / `lastChars(t, n)` | `first <n> characters of <t>` / `last <n> characters of <t>` | `%first <n> characters of <t>%` etc. |
| `charAt(t, i)` | `character at <i> in <t>` | `%character at <i> in <t>%` |
| `upperCase(t)` / `lowerCase(t)` | `<t> in uppercase` / `<t> in lowercase` | `%<t> in uppercase%` etc. |
| `splitText(t, delim, caseSensitive?)` | `split <t> at <d>` (`with case sensitivity` when asked) | `%split <t> at <d>%` |
| `joinText(list, delim?)` | `join <list>` / `join <list> with <d>` | `%join <list> with <d>%` |
| `colored(t)` / `formatted(t)` | `colored <t>` / `formatted <t>` | `%colored <t>%` etc. |
| `uncolored(t)` / `unformatted(t)` | `uncolored <t>` / `unformatted <t>` | `%uncolored <t>%` etc. |

Arithmetic semantics (verified against the real Skript 2.17.1):
operands must both be numbers, except that `+` over two texts
concatenates them — `"5" + "6"` is the text `"56"`, never `11`.
Every other type combination (a text and a number, in either
order) yields *no value*: not an error, just an absent result.
A *missing* operand is different from a wrong-typed one (pinned
down by the phase-13 probes): for the four infix operators it
counts as 0 when the other side is a number — an unset variable
`+ 100` is `100`, `* 2` is `0`, `5 /` unset is Infinity — while
a text or boolean partner, or both sides missing, yields no
value. Division is real division and follows doubles at zero
(`1 / 0` is Infinity). Emission always parenthesizes, so the
emitted tree does not depend on Skript's own precedence. The
remainder is Skript's `mod()` function (there is no infix
remainder operator in Skript): the mathematical modulo, whose
result takes the divisor's sign — `mod(-1, 10)` is `9` — and
NaN for a zero divisor; `mod()` never substitutes 0 for a
missing operand (a missing operand makes it valueless).

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
| `equals(a, b)` | `<a> is <b>` |
| `notEquals(a, b)` | `<a> is not <b>` |
| `greaterThan(a, b)` | `<a> is greater than <b>` |
| `greaterOrEqual(a, b)` | `<a> is greater than or equal to <b>` |
| `lessThan(a, b)` | `<a> is less than <b>` |
| `lessOrEqual(a, b)` | `<a> is less than or equal to <b>` |
| `contains(a, b)` | `<a> contains <b>` |
| `startsWith(t, prefix)` | `<t> starts with <prefix>` |
| `endsWith(t, suffix)` | `<t> ends with <suffix>` |
| `and(c1, c2, ...)` / `or(c1, c2, ...)` / `not(c)` | lowered to nested `if`/`else` (see below) |

Comparison semantics (verified against the real Skript 2.17.1,
not assumed): text equality is **case-insensitive**; a value is
never equal to a value of a different type (the number `1` is not
equal to the text `"1"`); a *missing* value (an unset variable)
is not equal to anything — not even to another missing value —
and inequality is the exact negation of equality, so an unset
variable *is* "not 0". Ordering compares numbers only: ordering
a text, or mixing types, is false, and the negated ordering forms
are exact negations too (an incomparable pair *is* "not greater
than"). The engine jar implements the same semantics natively.

Logic has no textual form in the `.sk` output: Skript 2.17.1
rejects every conjunction form probed for it (bare, parenthesized,
mixed with other conditions — all fail to parse), and it has no
general `not` condition. So `ifElse` lowers logic to control flow
instead: `and` nests the second check inside the first (the else
branch is duplicated), `or` nests it in the else branch, and `not`
swaps branches when an else exists, applies De Morgan over
`and`/`or`, and otherwise uses Skript's native negated leaf forms
(`is not ...`, `does not have permission`). Conditions in this
subset are pure, so the lowering is semantically exact; the
engine evaluates `and`/`or`/`not` directly.

### Lists, loops, while and wait

List semantics (verified against the real Skript 2.17.1 with
probe scripts, not assumed). A list is not a separate value: it is
the set of `{name::<index>}` entries in the ordinary variable
store, so lists persist exactly like scalars (in the engine, as
individual `name::index` keys in `variables.json`).

- **Index identity**: for indices computed by an expression, the
  number `5` and the text `"5"` are the *same* entry — identity is
  by string form. Variable names and text indices are
  case-insensitive (stored lowercased).
- **Iteration order**: text indices first (numeric-looking texts
  ordered by value, then the rest alphabetically), then numeric
  indices ascending. `loopList` sets both `loopValue()` and
  `loopIndex()`; rendered as text, an index appears in its plain
  form (`color`, `1`).
- **`listAdd`** appends at the smallest unused positive integer
  index. Deleting an index leaves a **hole** — entries are never
  renumbered. `deleteVar(listVar(name))` clears the whole list;
  deleting the bare `{name}` variable does not.
- **`listRemove`** deletes only the *first* matching element (in
  iteration order), using the phase-11 equality rules.
- A list used as text joins as `a, b and c` (`a and b` for two, the
  element itself for one). A missing value inside a string renders
  as `<none>` — this applies to unset scalars and missing indices
  too, in both runtimes.

Loop forms: `loopTimes` counts `loopValue()` from 1 to the count
(a fractional count floors) and has **no** `loopIndex()` — Skript
rejects it there ("There's no loop that matches 'loop-index'"),
and the player loop is the same; only the list loop provides an
index. `loopRange` is inclusive and descends when the start is
greater than the end (`numbers from 4 to 2` yields 4, 3, 2).

`whileLoop` re-evaluates its condition before every iteration.
The head accepts a leaf condition or `not(leaf)` only: a `while`
head cannot be lowered to control flow the way an `if` can, and
Skript has no textual conjunction (the phase-11 finding), so the
builder rejects `and`/`or`/`not` of a composite at build time.

`wait` suspends the rest of the trigger: everything after it —
the remainder of enclosing blocks, the remaining iterations of an
enclosing loop, the statements after the loop — runs after the
duration, in order. In Skript this is the runtime's own delay
behavior; the engine implements the same continuation semantics
on the Bukkit scheduler. Amounts may be fractional (`wait 0.5
seconds`); units are `ticks`, `seconds` and `minutes`.

### Custom functions

`defineFunction(name, params, returnType, body)` defines a
function; `param(name, type, default?)` declares a parameter.
Types are `number`, `text`, `boolean`, `player`, `location`,
`object` and their plurals (`numbers`, `texts`, ...), plus the
singular-only gameplay types `block`, `item` and `entity` (see
*Gameplay events* below). A plural
parameter must be last, and at most one is allowed (the builder
enforces both). `returnType` is one of the same type names, or
`null` for a void function. Inside the body, parameters and
locals are `localVar(name)` / `localList(name)` (`{_name}`,
`{_name::*}`); `returnValue(v)` returns, `stopTrigger()` exits
early, `call(name, ...args)` calls as an expression and
`callStmt(name, ...args)` as a statement. Definitions emit as
Skript `function` sections; the engine registers them from the
IR. Functions are core language — the same script runs under
both runtimes.

Semantics (verified against the real Skript 2.17.1 with probe
scripts, in value and string positions alike):

- **Resolution is by signature.** Definition order and file
  order do not matter — a function can be called before its
  definition, across files too. Names are **case-sensitive**.
  Overloads (same name, different parameter types) dispatch by
  the argument types. Skript resolves statically, at parse time:
  a wrong arity, a wrongly-typed literal, or an overload called
  through an untyped variable is a parse error there. The engine
  resolves at runtime by the argument values' types (exact-type
  parameters beat `object`); the observable behavior agrees for
  every program whose argument types are statically known.
- **No conversions.** A value whose runtime type does not match
  its parameter — including a numeric text like `"5"` passed to
  a `number` parameter — is not converted: the parameter is
  simply left unset and the body still runs. (What happens next
  is the body's own semantics: arithmetic over the unset
  parameter applies the missing-operand rule above.) A missing
  value passed explicitly does the same and does **not** trigger
  the parameter's default.
- **Defaults** apply only to omitted trailing arguments. They
  are arbitrary expressions, evaluated at call time *before* any
  parameter is bound: they can read globals, but they cannot see
  the arguments.
- **Locals are a fresh frame per call**, isolated in both
  directions: a function cannot see its caller's `{_x}`, and its
  own writes never leak back. Nested calls and recursion (which
  works) each get their own frame; globals are shared normally.
  Local lists work like global ones. Function bodies have **no
  event context** — under Skript, `player` inside a function is
  a parse error; the engine's call frames likewise start blank.
- **Return discipline.** `return` requires a value (a bare
  `return` is a parse error under Skript; use `stopTrigger()`).
  A returned value whose runtime type mismatches the declared
  return type makes the call yield *no value*. A value function
  that never returns also yields no value. A plural return type
  wraps a single value into a one-element list and drops
  mismatched elements; assigning a multi-value result to a
  scalar variable yields no value. Whole-list assignment
  (`set(localList("a"), someList)`) replaces the target and
  renumbers to 1..n in iteration order.
- **Plural parameters** accept spread values (`f(1, 2, 3)`), a
  whole list (`f({list::*})`), or a single value; inside, the
  parameter is the local list `{_name::*}`. Calling with zero
  values for a plural parameter does not resolve.
- **A `wait` inside a function detaches the call**: the caller
  resumes the moment the wait starts, a call used as an
  expression yields no value, and the rest of the body continues
  on its own after the delay. A `return` after a wait is a
  **load error** under Skript ("A return statement after a delay
  is useless..."), so loadable programs never contain one; the
  engine accepts the shape and drops the value — the same net
  semantics.

`examples/functions.ts` exercises all of this (a recursive
factorial, defaults, overloads, a plural-parameter sum over a
list-returning function, the mismatch and scope demos, the
detaching wait), and `examples/behavior/functions.behavior.ts`
asserts the identical expectations under both runtimes.

### Gameplay events

The gameplay events are core language: the same script runs
under Skript (as emitted `.sk`) and under the engine jar (which
fires them from its own Bukkit listeners). This slice is the
*unfiltered* forms; the filtered variants (`on break of
stone:`, `on damage of player by zombie:`) and the next batch
of events are the following section. The generic `on click:`
(the right/left pair covers it) and the block-damage event
(Skript's own docs point at the left-click event for that) are
not included.

Event values (verified against the real Skript 2.17.1 with probe
scripts and the behavior test):

- `eventBlock()` is the block the event is about; a click into
  air has no block. `locationOf(eventBlock())` gives its
  location.
- `eventItem()` is the item in hand for **click** events and the
  item being placed for **place** events. In **break** events it
  is the broken block *in item form*, **not** the tool in hand
  (pinned live: digging grass with a sword in hand reported
  `grass block`). An empty hand means the value is *absent* —
  inside a string it reads `<none>`, not `air`.
- In damage events, `victim()` is the entity taking damage and
  `attacker()` the entity that caused it; `attacker()` has no
  value for environmental damage (fall, lava, ...). The bare
  `player()` / `eventPlayer()` are **not defined** in damage
  events — Skript rejects them at parse time ("There's no
  player in an on damage event"), and the engine mirrors that by
  leaving both unset there.
- `damageAmount()` is the event's *current* amount: it reflects
  `setDamage()` writes made earlier in the same handler. The
  amount itself is the server's computation (a fist hit is `1`
  only at full attack charge), identical under both runtimes
  because the engine reads the same Bukkit event.
- `damageCause()` is the cause as a text. Most causes read as
  their lowercase name (`fall`, `lava`), but Skript's names are
  not a mechanical transform: an entity attack prints as
  `attack` (pinned live), and `FIRE_TICK` reads `burning`.
- `cancelEvent()` flags the underlying event cancelled — the
  block stays, the damage is not applied — and
  `uncancelEvent()` undoes a cancellation made earlier in the
  same event. Outside a cancellable event they do nothing.
- An entity used as text reads as its name for players and as
  its type name (`iron golem`, `slime`) for everything else, in
  both runtimes.

Blocks and items are values: `typeOf(v)` yields a value's
Skript type name (`grass block`, `dirt`, `player`, `number`,
...; a missing value has no type), and comparing it against an
`item("...")` literal is the supported way to test what a block
or item is. A block or item used as text reads as that name.
Function parameters and return types accept the singular types
`block`, `item` and `entity` (no plurals in this slice). One
typing quirk, pinned by a load error on the real Skript:
`typeOf(...)` yields a *type value*, not a text — a function
returning it must declare the `object` return type; it still
prints as the type's name inside strings.

`examples/gameplay.ts` exercises all of this — dirt cannot be
broken and stone cannot be placed (both cancelled), clicks are
announced with their block and item labels, and damage is
reported, cancelled for one named bot and halved for another —
and `examples/behavior/gameplay.behavior.ts` drives real bots
through it (digging, placing, clicking, fighting) and asserts
both the messages and the resulting world state (block gone or
still there, health lost or not) under both runtimes.

### Event filters and more events

The filtered event forms are core language too, along with
the clicked-entity value and five more events — pickup, drop,
respawn, and bed enter/leave. Everything below was verified
against the real Skript 2.17.1: the header shapes by probe
scripts at load time, the matching by watching sandbox mobs
hurt each other, and the full set by a mineflayer behavior
test under both runtimes.

**Filters.** A filter is a trailing options object on the
event builders. Skript's filtered headers are *literal type
lists* in the script text, not runtime expressions, so the
filter values are the type **names** as plain strings — one
name or an array — never expressions (an expression would
falsely promise that variables work in a header). The slots
are named after the header positions:

- `onBlockBreak(body, { block })` / `onBlockPlace` — the
  `of` slot: `on block break of stone or cobblestone:`.
- `onDamage(body, { victim, attacker })` — `of` and `by`:
  `on damage of player by zombie:`. Either side may be
  filtered alone — a by-only header (`on damage by zombie:`)
  parses and works, which the probe pinned before the API
  allowed it.
- `onRightClick` / `onLeftClick(body, { block, entity, item })`
  — `on` (clicked block *or* clicked entity; both together
  are rejected) and `with` (the item in hand):
  `on right click on villager:`, `on left click with stick:`.
- `onPickup` / `onDrop(body, { item })` — `on pick up of
  wheat:`, `on drop of egg or compass:`.

Matching is by Skript type name — the same names `typeOf()`
prints and `item("...")` literals use (`stone`,
`grass block`, `zombie`, `player`); a list joins as `a or b`
or `a, b or c` in the header. Every slot present must match,
and a slot whose value the event does not have never matches:
an attacker filter stays silent for fall damage, a block
filter for an air click. The engine evaluates the same rule
over its Bukkit values when an event fires.

**Clicked entity.** `clickedEntity()` is the entity a right
click interacted with (`clicked entity` in Skript), with no
value for block or air clicks. Right-clicking an entity has
no clicked block; the hand item is still `eventItem()`.

**The new events** are the *player* forms, like Skript's bare
headers — verified live that the bare `on pick up` /
`on drop` do **not** fire for mobs (a zombie taking wheat
fired only Skript's explicit `entity pick up` variant, which
is not in this subset), so the engine does not dispatch
non-player pickups either:

- `onPickup` — a player picks up an item. `eventItem()` is
  the stack; `cancelEvent()` refuses the pickup.
- `onDrop` — a player drops an item. `cancelEvent()` keeps
  the item in the inventory (the behavior test tosses the
  same compass twice to prove it never left).
- `onRespawn` — a player respawns. **Not cancellable**:
  Skript rejects `cancel event` inside it at parse time.
- `onBedEnter` / `onBedLeave` — `eventBlock()` is the bed;
  entering is cancellable, leaving is not.

Fishing is deliberately not here: Skript 2.17 splits it into
state sub-events (cast / caught / hooked / bite / escape /
...), a design surface of its own, and its bite timing is
random, which makes for flaky behavior tests. Death filters
(`on death of zombie:`) are also not included: the subset's
death event is player-only while Skript's covers any entity,
so a victim filter would promise semantics the engine half
cannot have.

`examples/events2.ts` exercises all of it — filtered breaks,
places, clicks and damage reports, wheat pickups singled
out, an undroppable compass, respawns and bed use — and
`examples/behavior/events2.behavior.ts` drives a bot through
it under both runtimes.

### Text operations

Texts are core language: the same script runs under Skript
(as emitted `.sk`) and under the engine jar. Every semantic
below was probed against the real Skript 2.17.1 (see the
development log) — several differ from the "obvious" behavior:

- `textLength(t)` counts UTF-16 code units (an emoji counts
  2), like Java strings. A missing text yields no value; an
  empty text has length 0.
- `substring(t, from, to)` is 1-based and inclusive at both
  ends. The range is *fitted*: `from` is clamped up to 1 and
  `to` down to the length, and when the fitted `from` exceeds
  the fitted `to` the result is **no value** (not an empty
  text, never swapped). `firstChars(t, n)` / `lastChars(t, n)`
  are the same rule with the other end pinned, so a count of
  0 or less yields no value. `charAt(t, i)` is strict instead:
  an index outside 1..length yields no value, and the result
  is a single UTF-16 code unit.
- `upperCase(t)` / `lowerCase(t)` convert case; a missing
  text yields no value. The single-text operations map
  element-wise over a list of texts, like the original's
  plural forms.
- `splitText(t, delim[, caseSensitive])` yields a **list**:
  the delimiter matches literally (never a regex) and
  case-**insensitively** by default; the trailing empty part
  is kept (`a,b,,c,` → 5 parts); an empty text is one empty
  part; an empty delimiter yields one part per character
  plus a trailing empty part; a missing text yields no
  values. The result composes with the list machinery —
  assign it to a list variable to loop it (with
  `loopIndex()`), size it, or read its entries, exactly like
  a list built by hand. (In Skript itself, `size of` and
  `loop` also accept a split directly — a loop over a split
  has no loop-index there; this subset keeps sizes and
  loops list-variable-shaped.)
- `joinText(list[, delim])` concatenates a list's **text**
  elements (players count as their name). Numbers and other
  non-text elements are **skipped**, not converted — joining
  `(1, "x")` yields `"x"`. An empty remainder yields no
  value; the default delimiter is `""`. A split result can
  be joined directly: `joinText(splitText(t, str(",")),
  str("+"))`.
- `contains(a, b)`: for texts, a case-**insensitive**
  substring test (an empty part is always contained); for a
  list container, element membership under the comparison
  rules. `startsWith` / `endsWith` are case-**sensitive** —
  the asymmetry is the original's own, pinned by probes.
  Missing operands are false. All three are leaf conditions
  with native negated forms, so they work in `whileLoop`
  heads too.
- `replaceAllIn(var, find, repl[, caseSensitive])` /
  `replaceFirstIn(...)` rewrite the text a scalar variable
  holds: literal, case-insensitive matching by default; an
  empty search text inserts the replacement at every gap
  (all) or at the start (first); a missing or non-text
  target is left untouched.
- Colors: `colored(t)` / `formatted(t)` parse `&` codes
  (including the `&x` hex sequence) and the named
  MiniMessage-style tags (`<red>`, `<bold>`, closing tags,
  `<reset>`) into formatting; `uncolored(t)` /
  `unformatted(t)` strip **all** formatting codes (colors
  and styles alike). Unknown tags, stray closing tags and
  the `&#RRGGBB` form stay literal. String literals are
  parsed the same way in both runtimes — Skript 2.17 reads
  literals as text components, and the engine converts
  literals to §-coded strings — while values that arrive at
  runtime (chat text, computed strings) keep their raw `&`
  characters until `colored` / `formatted` is applied.
  One model boundary: Skript's texts are components and the
  engine's are §-coded strings. Plain-text behavior and the
  formatting a player sees agree, and a parsed value
  compares equal to the equivalent § literal in both
  runtimes (the `/paeq` and `/fmteq` commands of the sample
  pin this), but an expression that *counts* § characters —
  the length of a color-coded chat message, say — can
  differ, because a component has no § characters to count.

`examples/text.ts` exercises all of it — a shout command
with a `!` prefix rule, character surgery, CSV splitting and
joining, text checks, replace demos and the paint commands —
and `examples/behavior/text.behavior.ts` asserts the
observable behavior under both runtimes.

### Items, inventories and GUIs

Items, inventories and GUIs are core language: the same
script runs under Skript (as emitted `.sk`) and under the
engine jar. Every semantic below was probed against the
real Skript 2.17.1 (console probes plus a mineflayer bot
clicking through a live GUI; see the development log):

- **Item construction** composes suffixes over any
  item-valued expression: `withName(item, nameText)`,
  `withLore(item, ...lines)` and `withAmount(item,
  countExpr)` — `<item> named <text>`, `<item> with lore
  <a> and <b>`, `<count> of <item>`. The wrappers
  materialize a real stack: a bare item name becomes a
  fresh stack, a stack is cloned and re-meta'd.
  `typeOf` of a meta'd stack is still its material.
- **Item printing**: a stack prints as its type name,
  pluralized with its amount above 1 (`3 diamond
  swords`), plus ` named <name>` when it carries a
  custom name. Lore never prints.
- **Equality**: two stacks compare by type + amount plus
  the meta fields **both** stacks carry — a named stack
  equals a plain one, two differently named stacks
  differ, names compare case-**sensitively**, and lore
  compares line by line. A stack compared against an
  item *literal* (or a type name) still compares by type
  only, so `eventItem() is item("stone")` ignores meta.
- **Meta reads**: `nameOf(item)` is the custom name — no
  value when the item is unnamed (for an inventory it is
  the title; for a player, their name). `loreOf(item)`
  is the lore lines as a list — no value when there is
  no lore. `amountOf(item)` is the stack size (for a
  list value it is the list size, like the original's
  generic amount expression).
- **Meta statements**: `setItemName(var, text)`,
  `setItemLore(var, ...lines)` and `setItemAmount(var,
  count)` rewrite the item a scalar variable holds
  (`set name of {v} to ...` and friends). A variable
  holding a bare type name is materialized first; a
  variable with no item value is left untouched.
  `giveItem(player, item)` hands an item-valued
  expression (meta included) to a player.
- **Inventories as values**: `chestInventory(rows[,
  title])` creates a fresh virtual chest inventory (rows
  clamp to 1..6) that exists independently of any
  player; `currentInventoryOf(player)` is the inventory
  the player is viewing (their own crafting inventory
  when nothing is open, as in the original);
  `eventInventory()` is the top inventory of an
  inventory event. `slotItem(inv, slot)` reads a
  0-based slot (an empty slot has no value) and
  `setSlot(inv, slot, item)` writes one — a player used
  as the inventory means their own inventory, and a
  valueless item clears the slot. `openInventory(player,
  inv)` shows an inventory value; `openGui(player,
  rows[, title])` builds and opens a chest GUI in one
  statement; `closeInventory(player)` closes the view.
- **Inventory events**: `onInventoryClick` fires for
  every inventory click, in script GUIs and vanilla
  containers alike. Inside, `eventItem()` is the clicked
  slot's item (no value for an empty slot),
  `eventInventory()` the view's top inventory,
  `clickedSlotIndex()` the slot's index within the
  inventory that was clicked (a click in the player's
  own bottom inventory counts from its top-left), and
  `clickedRawSlotIndex()` the index within the whole
  view. `cancelEvent()` inside is the standard GUI
  guard: a cancelled click moves nothing.
  `onInventoryClose` fires when a view closes, by
  script or by the player.

One model boundary, as with texts: display names and
lore are components in Skript and §-coded strings in
the engine, converted at the meta boundary — the
formatting a player sees agrees, and plain-text reads
(the name without codes) match.

`examples/gui.ts` exercises all of it — a `/gem`
command that builds a named, lored sword through the
meta statements, a `/geminfo` read-back, and a `/menu`
chest GUI guarded by its click handler — and
`examples/behavior/gui.behavior.ts` drives a bot
through the whole flow under both runtimes, including
the cancelled click that keeps the GUI's diamond out
of the bot's inventory.

Out of scope for this slice (recorded, not forgotten):
inventory drag events (a drag can still move items in
a GUI whose clicks are cancelled), slot add/remove
forms, the cursor slot, and enchantment / other meta
beyond name, lore and amount.

### World operations and periodical events

Blocks, locations, world state and the periodical
trigger are core language: the same script runs under
Skript (as emitted `.sk`) and under the engine jar.
Every semantic below was probed against the real
Skript 2.17.1 (console probe rounds; see the
development log):

- **Blocks and locations as values**: `blockAt(loc)`
  is the block at a location (`block at %location%`);
  `setBlockAt(loc, item)` writes an item's material
  there (`set block at ... to ...`; an air item clears
  the block). A block prints as `'<type>' at <cx>,
  <cy>, <cz> in world '<name>'` with its **center**
  coordinates, and `locationOf` a block is its center
  location — the engine reproduces both forms.
- **Locations**: `location(x, y, z)` builds a location
  in the server's main world; `location(x, y, z,
  world)` takes a world expression. A location prints
  as `x: <x>, y: <y>, z: <z>, yaw: <yaw>, pitch:
  <pitch> in '<world>'`. `xOf` / `yOf` / `zOf` read
  coordinates (`x-coordinate of ...`).
  `offsetLocation(loc, dx, dy, dz)` shifts a location
  by a vector (`%location% ~ vector(...)`); the
  components are expressions.
- **Relative blocks**: `relativeBlock(target,
  direction[, amount])` is the block in a direction
  from a block or location — `above`, `below`,
  `north`, `south`, `east`, `west` (absolute) and
  `front` / `behind` (facing-relative: they follow the
  target location's direction; a block's own location
  faces south). The emitted shapes differ per
  direction (`block above %t%`, `block 2 north of
  %t%`, `block in front of %t%`, `block behind %t%`),
  all probed.
- **Worlds**: `world("name")` is a world by name (no
  value for an unknown name). `worldOf(target)` —
  core since this phase; it was an engine builtin in
  the MundoSK slice — reads the world of a player,
  location or block.
- **World clock**: `worldTime(world)` reads the
  world's clock as an `H:MM` text (`time in %world%`):
  0 ticks reads `6:00`, 6000 `12:00`, 18000 `0:00`.
  `setWorldTime(world, value)` sets it; the value is a
  `clockTime("13:00")` literal or any expression
  carrying a clock text (a variable set from
  `worldTime` round-trips — probed). The original's
  timespan set form parses but its effect could not
  be verified, so it is deliberately not offered;
  time arithmetic is not part of the subset.
- **Weather**: `worldWeather(world)` reads `clear`,
  `rain` or `thunder` (`weather in %world%`);
  `setWorldWeather(world, name)` sets it by literal
  name. Weather values compare against the
  `weatherType("rain")` literal — emitted **bare**
  (`is rain`): the quoted text form parses but never
  compares equal, and a plain text does not convert
  (setting weather from a text variable silently does
  nothing in the original — both probed).
- **Periodical events**: `every(amount, unit, body)`
  is the periodical trigger (`every 3 seconds:`). The
  amount is a number **literal** — the original
  rejects expression periods at parse time — and may
  be fractional (`every 2.5 seconds` fires on
  cadence); units are `ticks` / `seconds` / `minutes`.
  The first firing comes one full period after the
  script loads, and a reload re-anchors the schedule
  (probed with timed logs). The body runs with no
  event context, like a function body.

One original-side quirk applies to this family (and
to `typeOf` over a variable): Skript 2.17.1 does not
parse these composite expressions inside string
interpolations — they are value-position constructs
there. Assign to a variable first and interpolate the
variable, as the sample does; the engine has no such
restriction.

`examples/world.ts` exercises all of it — a 3-second
heartbeat periodical, `/wstat` / `/wday` / `/wnight` /
`/wcalm` / `/wstorm` world-state commands, `/wpos`
coordinate read-back, and `/wbuild` + `/wraze`
placing and clearing real blocks — and
`examples/behavior/world.behavior.ts` drives a bot
through the whole flow under both runtimes, including
measuring the heartbeat's cadence.

Out of scope for this slice (recorded, not
forgotten): facing-relative offsets from *entities*
(the location form is probed and included; an
entity's facing needs a live-facing probe design),
and world time arithmetic.

### Player state and effects

Player / entity state reads and writes, potion
effects, and the spawn / drop / sound effects are
core language: the same script runs under Skript
(as emitted `.sk`) and under the engine jar. Every
semantic below was probed against the real Skript
2.17.1 with NBT ground truth read back through the
server console (see the development log):

- **Units — the load-bearing fact**: health and
  max health are in **hearts** (half the Bukkit hit
  points): a full-health player reads `10`, and
  fractions are exact (`6.3` hearts is 12.6 HP).
  Food level is in **drumsticks** (half the food
  points); saturation is **not scaled**. The engine
  applies the same ×2 / ÷2 conversions, so both
  runtimes agree numerically.
- **State expressions**: `healthOf(t)`,
  `maxHealthOf(t)` (any living entity),
  `foodLevelOf(p)`, `saturationOf(p)` (players),
  `gameModeOf(p)` (the mode's name as text),
  `experienceOf(p)`, `levelOf(p)`.
- **State writes**: `setHealth`, `setMaxHealth`,
  `setFoodLevel`, `setSaturation`, `setExperience`,
  `setLevel` — each in the expression's own units.
  Probed behavior: health writes clamp to the
  maximum and `0` kills; a food write rounds to
  whole food points (`6.3` drumsticks lands on 13
  points); saturation is not clamped to the food
  level; setting max health rewrites the attribute
  base and leaves current health alone; setting
  the level preserves the progress fraction
  (total 47 → set level 2 → total reads 21);
  setting the experience sets the total exactly
  and re-derives level + progress. `heal(t)` refills
  to full, `heal(t, n)` heals `n` hearts. The
  generic changers `addTo(expr, n)` /
  `removeFrom(expr, n)` cover the health, food,
  experience and level expressions (`add 41 to
  experience of player`).
- **Game mode**: like weather in phase 18, the
  value does not interconvert with plain text —
  a quoted-text comparison is a parse error in the
  original and a set from a text variable silently
  does nothing (both probed). So `gameModeOf`
  returns the name for display, `setGameMode(p,
  "creative")` takes a validated literal, and
  comparisons use the `gameModeType("creative")`
  literal, emitted bare (`is creative`).
- **Experience**: `experienceOf` is the **total**
  points, computed from level + progress — not the
  raw total field, which goes stale under script
  writes (probed). One observability note: when a
  single trigger writes experience several times,
  the server syncs only the final state to the
  client, so behavior tests assert intermediate
  totals through script readbacks.
- **Potions**: `applyPotion(t, type[, {level,
  durationSeconds}])` and `removePotion(t, type)`.
  The type is a validated display name (`"speed"`,
  `"fire resistance"`, `"instant health"`, ... —
  all 31 vanilla names probed, plus `swiftness` as
  an alias of speed). Defaults in the original,
  probed from the entity's NBT: **level 1** and a
  **30-second** duration (600 ticks) when no
  duration is given. The original has **no
  remove-all form** (three candidate phrasings all
  failed to parse), so none is offered; remove one
  type per statement. Instant health / damage are
  ordinary types here, with one platform quirk:
  on this Paper version an applied instant effect
  also lingers as a stored, decaying effect entry
  (observed in NBT) — the engine makes the same
  Bukkit call, so the behavior matches.
- **Spawn**: `spawnEntity(type, at[, count])`
  spawns at a location or at an entity;
  `lastSpawnedEntity()` reads the most recent
  spawn (`last spawned entity`), and `typeOf` it
  prints its type name.
- **Drop**: `dropItem(itemExpr, at)` drops an
  item-valued expression (phase-17 stacks compose,
  meta included) into the world at a location or
  entity.
- **Sound**: `playSound(name, at)` plays a sound
  by registry name (`"block.note_block.pling"`)
  at a location or entity. The original resolves
  the name through the sound registry (the packet
  carries the registry id — probed at the wire
  level) and the engine does the same. There are
  deliberately **no volume / pitch options**: the
  volume form does not parse in the original, and
  its pitch form parses but does not change the
  wire pitch (0.5 and 2 both arrived as 1).

`examples/state.ts` exercises all of it — `/ststat`
state read-back, `/stset`, `/stheal`, `/stgm`
game-mode round-trip, `/stxp` + `/stxpfrac`
experience flows, `/stmax`, the potion trio
`/stfx` / `/stpoison` / `/stcure`, `/stinstant`,
`/stspawn`, `/stdrop` and `/stsound` — and
`examples/behavior/state.behavior.ts` drives a bot
through the whole flow under both runtimes,
asserting on the bot's own health, food, game
mode, experience level, visible entities,
inventory and received sound packets.

Out of scope for this slice (recorded, not
forgotten): applying several potion types in one
statement (the original parses `and` lists; the
subset takes one type per statement), a
remove-all potion form (does not exist in the
original), the generic add / remove changers over
max health and saturation (unprobed for those two
expressions), and food / game-mode state on
non-player entities (player-only in the
original's type system).

### Command definitions

Commands take any number of typed arguments, plus the
`permission`, `usage` and `aliases` section entries — core
language, identical under Skript and under the engine jar.
Every behavior below was probed against the real Skript
2.17.1 (see the development log): the original registers its
commands with **Brigadier**, so argument failures are
vanilla Brigadier messages and the trigger never runs; the
engine's matcher reproduces them exactly.

- **Arguments**: `command(name, [cmdArg(type, optional?),
  ...], body, options?)`. Types: `"text"`, `"player"`,
  `"offlinePlayer"`, `"integer"`, `"number"`, `"boolean"`,
  `"item"`; `argument(n)` reads the parsed value (1-based)
  in the body. The legacy single-argument form is unchanged.
- **Parsing**: a `player` argument resolves an **online**
  player by full name, case-insensitively; an offline or
  unknown name fails with `No player was found` (no context
  line) and selectors (`@a`, ...) are rejected. `integer`
  is Brigadier's long (`Expected long`, `Invalid long
  '...'`), `number` its double (`Expected double`),
  `boolean` only the lowercase literals `true` / `false`.
  An `item` argument is one token, a namespaced item id
  (`diamond_sword`, `minecraft:diamond_sword`); unknown ids
  fail with `Unknown item 'minecraft:...'`. `offlinePlayer`
  accepts **any** name. A `text` argument takes one token —
  or the rest of the line in last position. A bad value,
  leftover tokens (`Incorrect argument for command`) and
  missing required arguments all fail the invocation; the
  feedback is **one** chat message: the reason, a newline,
  and a `<--[HERE]` context line.
- **Optional arguments** (`[<type>]`): omitting one yields
  no value; a supplied value is still validated. Optional
  arguments before required ones **backtrack** — in
  `[<integer>] <text>`, the input `hello` reads as the text.
  **Argument defaults are not offered**: the original's
  `[<type> = <expr>]` form loads but is broken (probed: a
  supplied value fails dispatch, an omitted one never
  applies the default), so the subset has no defaults.
- **Sections**: `permission` (a sender without it cannot
  address the command — the failure reads like an unknown
  command, operator and console senders pass), `usage`
  (sent verbatim, and only for the missing-argument
  failure), `aliases` (extra names, with or without a
  leading slash). **`permission message` is not offered**:
  deprecated in the original and never delivered (probed).

`examples/commands.ts` exercises all of it — `/cpoke`,
`/croll`, `/citem`, `/ctell`, `/cmix`, `/coff`, `/cadmin`,
`/cuse`, `/calias` (+ `/ca2`, `/ca3`) — and
`examples/behavior/commands.behavior.ts` drives two bots
through the whole flow under both runtimes, including the
exact failure messages and the permission gate seen from a
sender without the permission.

Deliberate divergences and deferrals (recorded): the
engine matches whole space-separated tokens where
Brigadier's reader can stop mid-token (junk fused to a
number is a whole-token error here, not a partial parse);
tab completion is the platform default in engine mode
versus Brigadier's suggestions; `executable by` /
`prefix` / cooldown sections and expression-typed custom
arguments are out of scope for this slice.

### Display effects and boss bars

Titles, the action bar, and boss bars — core language,
identical under Skript and under the engine jar. Every
behavior below was probed against the real Skript 2.17.1
with the client's packets captured raw (see the
development log).

- **Titles**: `sendTitle(target, text, options?)` with
  `options.subtitle` and literal timing options `fadeIn` /
  `stay` / `fadeOut` (each `{ amount, unit }`, fractional
  amounts allowed). The emitted tail comes **after** the
  target — `... to player for 5 seconds with fadein 1
  second and fade out 1 second` (putting `for` before `to`
  is a parse error in the original). Wire behavior: with
  **no** timing given, no times packet is sent at all (the
  client keeps its previous timings); with **any** timing
  given, one times packet precedes the text packets and the
  unspecified parts are filled with the defaults **fade-in
  10 / stay 70 / fade-out 20 ticks**. Packets go out in the
  order times → subtitle → title. A title-only send sends
  no subtitle packet and vice versa. `sendSubtitle(target,
  text, timingOptions?)` is the subtitle-only form.
  `clearTitle(target)` hides the title; `resetTitle(target)`
  also resets the timings (one packet, carrying the reset
  flag). Title texts are any expression, stringified like a
  chat message.
- **Action bar**: `sendActionBar(target, message)` — one
  packet, no timing concept.
- **Boss bars** (core since Skript 2.16): the create
  expression `bossBar({ title?, color? })` makes a bar
  value — fresh bars have an empty title, progress 1, a
  white color and a solid style (all read off the add
  packet). `setBossBarTitle` / `setBossBarColor` (a literal
  name: pink, blue, red, green, yellow, purple, white) /
  `setBossBarProgress` write the properties — progress is
  a **fraction** 0..1 that the original clamps (writing 50
  reads back 1; percent literals in hand-written Skript are
  the same fraction divided by 100). `addBossBarViewer` /
  `removeBossBarViewer` manage the viewer set, and
  `bossBarTitleOf` / `bossBarProgressOf` read the
  properties back. **A bar cannot be saved**: storing one
  in a persistent variable is a load error in the original
  ("a boss bar cannot be saved"), so bars live in locals;
  the engine keeps the value in memory and drops it on
  variable save instead of erroring (recorded divergence).

`examples/display.ts` exercises all of it — a timed title
with subtitle and an action bar on join, the `/dtplain`,
`/dtstay`, `/dtsub`, `/dtclear`, `/dtreset` and `/dbar`
commands, and the `/dbshow` / `/dbfresh` boss bar
lifecycles — and `examples/behavior/display.behavior.ts`
asserts on the client's actual title / action bar /
boss bar packets under both runtimes.

Deliberate deferrals (recorded): **keyed** boss bars (the
keyed + color + title create form does not even parse in
the original, and keyed bars are persistent server storage
addressed by key — a lifecycle of their own), the section
creation form (`set {_b} to a boss bar:` with an
event-bossbar body — this subset has no section
expressions; the one-line create plus the property
statements cover the same ground), bar **styles** (notches)
and the darken-sky / fog / boss-music **flags** (both parse
and run in the original; outside this slice's
create / show / progress scope), expression timespans for
title timings (the original accepts a timespan variable;
this subset has no timespan value type, so timings are
literals like the periodical amount), and plural audiences
as title targets (the original's `%audiences%`; this
subset's sends target one player, as elsewhere).

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
| `worldOf(target)` | the world of a player / location (promoted to core language in phase 18 — see *World operations and periodical events*; it stays listed here as this slice's origin) |
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

| TypeScript | Meaning |
| --- | --- |
| `placeholderValue(player, text)` | evaluate PAPI placeholders in a text for a player (bare name or whole-string form) |
| `onPlaceholderRequest(prefix, body)` | event: a placeholder under this prefix was requested |
| `placeholderIdentifier()` | the parameter part of the request (inside the event) |
| `placeholderPrefix()` | the prefix that matched (inside the event) |
| `setPlaceholderResult(text)` | answer the placeholder request being handled |

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

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 kurazuuuuuu.
