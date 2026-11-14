# Supported subset (SPEC)

The full specification of the supported subset: every builder in
`src/api.ts`, the `.sk` form it emits, and the semantics verified
against the real Skript 2.17.1. Anything not listed here is outside
the supported subset. Moved out of the README; see the
[engine documentation](engine.md) for the standalone runtime and
[verification](verification.md) for how all of this is tested.

Anything not listed here is outside the supported subset.

## Events

| TypeScript     | Skript            |
| -------------- | ----------------- |
| `onJoin`       | `on join:`        |
| `onFirstJoin`  | `on first join:`  |
| `onQuit`       | `on quit:`        |
| `onChat`       | `on chat:`        |
| `onDeath`      | `on death:`       |
| `onBlockBreak` | `on block break:` |
| `onBlockPlace` | `on block place:` |
| `onRightClick` | `on right click:` |
| `onLeftClick`  | `on left click:`  |
| `onDamage`     | `on damage:`      |
| `onPickup`     | `on pick up:`     |
| `onDrop`       | `on drop:`        |
| `onRespawn`    | `on respawn:`     |
| `onBedEnter`   | `on bed enter:`   |
| `onBedLeave`   | `on bed leave:`   |

## Commands

`command(name, args, body, options?)` — any number of typed
arguments (see **Command definitions** below for the full
semantics). `args` is either one legacy argument type
(`"text"`, `"player"` or `"integer"`, always optional, with an
optional boolean fourth argument) or a list of `cmdArg(type,
optional?)` specs. Optional arguments emit as `[<type>]`,
required ones as `<type>`. The body becomes the `trigger:`
section.

## Effects (statements)

| TypeScript                                        | Skript                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `send(target, message)`                           | `send "<text>" to <target>` (any expression; text emits quoted, other expressions bare) |
| `broadcast(message)`                              | `broadcast "<text>"` (any expression)                                                   |
| `give(target, itemName, amount)`                  | `give <amount> <item> to <target>`                                                      |
| `teleport(target, location)`                      | `teleport <target> to <location>`                                                       |
| `set(variable, value)`                            | `set {var} to <value>`                                                                  |
| `add(variable, value)`                            | `add <value> to {var}`                                                                  |
| `ifElse(cond, then, else?)`                       | `if <cond>:` … `else:` (a boolean expression as `cond` emits as `<expr> is true`)       |
| `when(cond, ...body)`                             | `if <cond>:` … (sugar for `ifElse(cond, body)`)                                         |
| `unless(cond, ...body)`                           | sugar for `ifElse(not(cond), body)` — lowered through `not`, never an empty-then `if`   |
| `stopIf(cond)`                                    | `if <cond>:` / `stop` (sugar for `ifElse(cond, [stopTrigger()])`)                       |
| `loopPlayers(body)`                               | `loop all players:`                                                                     |
| `listAdd(list, value)`                            | `add <value> to {list::*}`                                                              |
| `listRemove(list, value)`                         | `remove <value> from {list::*}`                                                         |
| `deleteVar(target)`                               | `delete {var}` / `delete {list::*}`                                                     |
| `loopList(list, body)`                            | `loop {list::*}:`                                                                       |
| `loopTimes(count, body)`                          | `loop <n> times:`                                                                       |
| `loopRange(from, to, body)`                       | `loop numbers from <a> to <b>:`                                                         |
| `whileLoop(cond, body)`                           | `while <cond>:` (leaf conditions only, see below)                                       |
| `wait(amount, unit)`                              | `wait <n> ticks` / `seconds` / `minutes`                                                |
| `returnValue(value)`                              | `return <value>` (inside `defineFunction`)                                              |
| `stopTrigger()`                                   | `stop` (early exit from a trigger or function)                                          |
| `callStmt(name, ...args)`                         | `<name>(<args>)` as a bare statement                                                    |
| `cancelEvent()`                                   | `cancel event` (in a cancellable event handler)                                         |
| `uncancelEvent()`                                 | `uncancel event`                                                                        |
| `setDamage(value)`                                | `set damage to <value>` (inside `onDamage`)                                             |
| `replaceAllIn(var, find, repl, caseSensitive?)`   | `replace all <find> in {var} with <repl>` (`with case sensitivity` when asked)          |
| `replaceFirstIn(var, find, repl, caseSensitive?)` | `replace first <find> in {var} with <repl>`                                             |

## Expressions

Plain JavaScript literals are accepted in value positions
(feedback E1): anywhere a builder takes a value — comparison
and arithmetic operands, math-function and random-draw
arguments, `set` / `add` / `remove` values, list add / remove
values, `contains` / `startsWith` / `endsWith` parts, function
call arguments, `param` defaults, `returnValue`, `setDamage`,
and `send` / `broadcast` messages — a `string`, `number` or
`boolean` may be written directly instead of wrapping it in
`str()` / `num()` / `bool()`. The builder converts the literal
automatically (`plus(x, 1)`, `equals(state, true)`,
`set(v, "hello")`), so the AST, the emitted `.sk` and the IR
are identical to the explicitly wrapped form. Structural and
target parameters (variable targets, locations, inventories,
players, …) are not value positions and still take built
expressions. See `examples/literals.ts`.

| TypeScript                                                       | value position                                               | inside a string                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `player()`                                                       | `player`                                                     | `%player%`                             |
| `eventPlayer()`                                                  | `event-player`                                               | `%event-player%`                       |
| `loopPlayer()`                                                   | `loop-player`                                                | `%loop-player%`                        |
| `victim()`                                                       | `victim`                                                     | `%victim%`                             |
| `argument(n)` (1-based)                                          | `arg-<n>`                                                    | `%arg-<n>%`                            |
| `chatMessage()`                                                  | `message`                                                    | `%message%`                            |
| `variable(name)`                                                 | `{name}`                                                     | `%{name}%`                             |
| `variable(name, index)`                                          | `{name::%<index>%}`                                          | `%{name::%<index>%}%`                  |
| `listVar(name)`                                                  | `{name::*}`                                                  | `%{name::*}%`                          |
| `localVar(name)` / `localVar(name, index)`                       | `{_name}` / `{_name::%<index>%}`                             | `%{_name}%`                            |
| `localList(name)`                                                | `{_name::*}`                                                 | `%{_name::*}%`                         |
| `call(name, ...args)`                                            | `<name>(<args>)`                                             | `%<name>(<args>)%`                     |
| `listSize(list)`                                                 | `size of {name::*}`                                          | `%size of {name::*}%`                  |
| `sortedList(list)`                                               | `sorted {name::*}`                                           | `%sorted {name::*}%`                   |
| `loopValue()`                                                    | `loop-value`                                                 | `%loop-value%`                         |
| `loopIndex()`                                                    | `loop-index`                                                 | `%loop-index%`                         |
| `str(s)`                                                         | `"<s>"`                                                      | raw text                               |
| `num(n)` / `bool(b)`                                             | `42` / `true`                                                | same                                   |
| `item(name)`                                                     | `diamond sword`                                              | same                                   |
| `locationOf(e)`                                                  | `location of <e>`                                            | `%location of <e>%`                    |
| `eventBlock()`                                                   | `event-block`                                                | `%event-block%`                        |
| `eventItem()`                                                    | `event-item`                                                 | `%event-item%`                         |
| `toolOf(target)`                                                 | `tool of <target>`                                           | `%tool of <target>%`                   |
| `offHandToolOf(target)`                                          | `offhand tool of <target>`                                   | `%offhand tool of <target>%`           |
| `attacker()`                                                     | `attacker`                                                   | `%attacker%`                           |
| `damageAmount()`                                                 | `damage`                                                     | `%damage%`                             |
| `damageCause()`                                                  | `damage cause`                                               | `%damage cause%`                       |
| `typeOf(e)`                                                      | `type of <e>`                                                | `%type of <e>%`                        |
| `plus(a, b)` / `minus(a, b)` / `times(a, b)` / `dividedBy(a, b)` | `(<a> + <b>)` etc.                                           | `%(<a> + <b>)%` etc.                   |
| `remainder(a, b)` (or `arith(op, a, b)` for any of the five)     | `mod(<a>, <b>)`                                              | `%mod(<a>, <b>)%`                      |
| `randomNumber(a, b)`                                             | `random number between <a> and <b>`                          | `%random number between <a> and <b>%`  |
| `randomInteger(a, b)`                                            | `random integer between <a> and <b>`                         | `%random integer between <a> and <b>%` |
| `floor(e)` / `ceil(e)` / `abs(e)` / `sqrt(e)`                    | `floor(<e>)` etc.                                            | `%floor(<e>)%` etc.                    |
| `round(e)` / `round(e, places)`                                  | `round(<e>)` / `round(<e>, <places>)`                        | `%round(<e>)%` etc.                    |
| `min(...es)` / `max(...es)` (one or more arguments)              | `min(<es>)` / `max(<es>)`                                    | `%min(<es>)%` etc.                     |
| `fmt(...parts)`                                                  | `"<parts>"`                                                  | flattened into the enclosing string    |
| `` t`...${e}...` `` (tagged template)                            | `"<parts>"`                                                  | flattened into the enclosing string    |
| `textLength(t)`                                                  | `length of <t>`                                              | `%length of <t>%`                      |
| `substring(t, from, to)`                                         | `substring of <t> from <a> to <b>`                           | `%substring of <t> from <a> to <b>%`   |
| `firstChars(t, n)` / `lastChars(t, n)`                           | `first <n> characters of <t>` / `last <n> characters of <t>` | `%first <n> characters of <t>%` etc.   |
| `charAt(t, i)`                                                   | `character at <i> in <t>`                                    | `%character at <i> in <t>%`            |
| `upperCase(t)` / `lowerCase(t)`                                  | `<t> in uppercase` / `<t> in lowercase`                      | `%<t> in uppercase%` etc.              |
| `splitText(t, delim, caseSensitive?)`                            | `split <t> at <d>` (`with case sensitivity` when asked)      | `%split <t> at <d>%`                   |
| `joinText(list, delim?)`                                         | `join <list>` / `join <list> with <d>`                       | `%join <list> with <d>%`               |
| `colored(t)` / `formatted(t)`                                    | `colored <t>` / `formatted <t>`                              | `%colored <t>%` etc.                   |
| `uncolored(t)` / `unformatted(t)`                                | `uncolored <t>` / `unformatted <t>`                          | `%uncolored <t>%` etc.                 |

Tagged templates: `` t`&a${label} &f+${amount} XP` `` is sugar
over `fmt()` — it builds the same format node, so it emits
exactly what the `fmt()`-written equivalent emits (`` t`a${x}b` ``
is `fmt("a", x, "b")`). Interpolated expressions become
expression parts; interpolated strings, numbers and booleans
merge into the adjacent literal text (numbers and booleans via
`String(value)`), and empty literal parts are dropped. The
literal parts are ordinary `fmt()` literal text, so `&` color
codes in them work exactly as in `fmt()`. `examples/tagged.ts`
exercises it in `send` / `broadcast` and composed inside
`fmt()` (and the other way round).

Arithmetic semantics (verified against the real Skript 2.17.1):
operands must both be numbers, except that `+` over two texts
concatenates them — `"5" + "6"` is the text `"56"`, never `11`.
Every other type combination (a text and a number, in either
order) yields _no value_: not an error, just an absent result.
A _missing_ operand is different from a wrong-typed one (pinned
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

Randomness semantics (verified against the real Skript 2.17.1):
every evaluation of a draw expression draws fresh — there is
no seed, so no draw is reproducible, in either runtime. Both
bounds must be numbers; a missing or non-number bound yields
_no value_ (a text bound in the original is a load error only
when it is a literal — a text held in a variable yields no
value at run time, exactly as the engine does). Reversed
bounds are swapped before drawing. `randomNumber` is uniform
over the range (equal bounds yield the bound itself).
`randomInteger` draws uniformly over the whole numbers inside
the closed range — the lower bound fits up and the upper bound
fits down — so `randomInteger(1.5, 3.5)` draws from {2, 3},
`randomInteger(-3.5, -1.5)` from {-3, -2}, and
`randomInteger(1, 3)` from {1, 2, 3}. A range holding no whole
number (`randomInteger(1.2, 1.8)`) yields _no value_, not an
error.
Math functions (phase 29; verified against the real Skript
2.17.1). All seven yield _no value_ when an operand is missing
or not a number — a numeric text such as `"2.5"` does not
count, and unlike the infix operators there is no 0
substitution. `floor` and `ceil` return whole numbers:
`floor(2.5)` is `2`, `floor(-2.5)` is `-3`, `ceil(-0.5)` is
`0`. At the extremes they saturate like a Java `(long)` cast:
`floor(NaN)` is `0`, and `floor(Infinity)` and `floor(1e19)`
both clamp to `9223372036854775807`. `abs` and `sqrt` are the
plain double operations (`abs(-0.5)` is `0.5`, `sqrt(2)` is
about `1.41`, the root of a negative is NaN). `min` and `max`
take one or more arguments — zero arguments is a parse error
in Skript, so the builders throw a RangeError instead. Only
the numeric arguments compete: missing and non-number
arguments drop out silently (`min(unset, 5)` is `5`), and a
NaN candidate loses to any non-NaN candidate in either
position; if every candidate is NaN the result is NaN, and
with no numeric candidate the result has no value.

`round` rounds in three regimes, by its places argument
(which defaults to 0; a missing or non-number places counts
as 0, and a fractional places truncates toward zero, so
`round(1.2345, 2.9)` rounds at 2 places). At 0 places — and
in the one-argument form — halves round toward positive
infinity: `round(2.5)` is `3`, `round(-2.5)` is `-2`,
`round(-0.5)` is `0`. (This is Skript's own `round()`
function; it is unrelated to the separate half-truncation
convention settled for title timings.) At positive places
the value's decimal representation is rounded, halves away
from zero: `round(2.675, 2)` is `2.68`, `round(1.005, 2)` is
`1.01`, `round(-0.125, 2)` is `-0.13`. At negative places a
whole-number-typed value (a long, such as an integer literal
in Skript mode) passes through unchanged — `round(15, -1)`
is `15` — while any other value is first rounded to a whole
number by the 0-places rule and that whole number is then
rounded at the tens/hundreds place by the same rule:
`round(14.9, -1)` is `20`, `round(123.456, -1)` is `120`,
`round(-14.9, -1)` is `-10`. One engine divergence follows
from the engine's number representation: literals and
command arguments are doubles under the engine, so an
integral literal follows the double path there
(`round(15, -1)` evaluates to `20` under the engine, `15`
under Skript); a long produced at runtime (for example a
`floor()` result held in a variable) passes through in both
runtimes.

Note: in `on death` events there is **no** `player` — Skript rejects it
("There's no player in an on death event"). Use `victim()` for the player
who died. This was caught by the real-server verification stage against
Skript 2.17.1, which is exactly what that stage is for.

Note: inside a string, a variable must be wrapped in `%...%` to
interpolate its value. A bare `{...}` in a string is literal text in
Skript (no error — the wrong text is simply sent). The emitter handles
the wrapping; this was caught by the behavior-test stage described
below, not by load checks.

## Conditions

| TypeScript                                        | Skript                                    |
| ------------------------------------------------- | ----------------------------------------- |
| `hasPermission(target, "node")`                   | `<target> has permission "node"`          |
| `hasItem(target, item)`                           | `<target> has <item>`                     |
| `canHoldItem(target, item)`                       | `<target> can hold <item>`                |
| `isOp(target)`                                    | `<target> is op`                          |
| `equals(a, b)`                                    | `<a> is <b>`                              |
| `notEquals(a, b)`                                 | `<a> is not <b>`                          |
| `greaterThan(a, b)`                               | `<a> is greater than <b>`                 |
| `greaterOrEqual(a, b)`                            | `<a> is greater than or equal to <b>`     |
| `lessThan(a, b)`                                  | `<a> is less than <b>`                    |
| `lessOrEqual(a, b)`                               | `<a> is less than or equal to <b>`        |
| `contains(a, b)`                                  | `<a> contains <b>`                        |
| `startsWith(t, prefix)`                           | `<t> starts with <prefix>`                |
| `endsWith(t, suffix)`                             | `<t> ends with <suffix>`                  |
| `eventCancelled()`                                | `event is cancelled`                      |
| `isSet(target)`                                   | `<target> is set`                         |
| `chance(p)`                                       | `chance of <p>`                           |
| `and(c1, c2, ...)` / `or(c1, c2, ...)` / `not(c)` | lowered to nested `if`/`else` (see below) |
| a boolean expression (`CondLike`)                 | `<expr> is true` (see below)              |

Comparison semantics (verified against the real Skript 2.17.1,
not assumed): text equality is **case-insensitive**; a value is
never equal to a value of a different type (the number `1` is not
equal to the text `"1"`); a _missing_ value (an unset variable)
is not equal to anything — not even to another missing value —
and inequality is the exact negation of equality, so an unset
variable _is_ "not 0". Ordering compares numbers only: ordering
a text, or mixing types, is false, and the negated ordering forms
are exact negations too (an incomparable pair _is_ "not greater
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

Boolean expressions as conditions (feedback E3; probed against
the real Skript 2.17.1): a bare boolean expression is **not** a
valid Skript condition — `if {_t}:` and `if myBoolFn():` are
parse errors — but the comparison form parses and behaves
correctly for function calls, variables and while heads
(`if pbool(true) is true:`, `if {_t} is true:`,
`while {_go} is true:`). So wherever a condition is expected —
`ifElse`, `whileLoop`, `and`, `or`, `not`, and the sugar
builders below — a boolean expression is accepted too (the
`CondLike` type, `Cond | Expr`): a boolean variable, a boolean
literal, or the result of a boolean-returning `defineFunction`,
for example. The builders lower it at the API level to
`equals(expr, true)`, emitted as `<expr> is true`; a real
condition passes through unchanged, so existing programs emit
byte-identical output. Because the lowered form is a leaf
(`equals`) condition, a boolean expression also works as a
`whileLoop` head. The engine evaluates the same `equals`
against `true` natively, so both runtimes agree — including
the missing-value rule: an unset boolean variable is not equal
to anything, so the condition is false (and its negation true).

Condition sugar (feedback E4): three statement builders over
any `CondLike` —

- `when(cond, ...body)` is `ifElse(cond, body)`: the body runs
  when the condition holds.
- `unless(cond, ...body)` is `ifElse(not(cond), body)`: the
  body runs when the condition does **not** hold. It lowers
  through `not` (branch swap / native negated leaf forms),
  never through an `if`/`else` with an empty then branch —
  empty sections are risky in Skript.
- `stopIf(cond)` is `ifElse(cond, [stopTrigger()])`: the
  current trigger ends at once when the condition holds.

`examples/boolcond.ts` exercises all of this — a boolean
variable and a boolean-returning function call used directly
as `ifElse` conditions, a boolean variable as a `whileLoop`
head, `and`/`or`/`not` over boolean expressions, and the
`when` / `unless` / `stopIf` flows (including a `stopIf` that
does not fire) — and `examples/behavior/boolcond.behavior.ts`
asserts the identical expectations under both runtimes.
Presence semantics (verified against the real Skript 2.17.1):
`isSet(target)` answers feedback C4's "is the variable set"
need — it is true when the target expression _has_ a value,
whatever that value is. Both the positive form (`<expr> is
set`) and its native negation (`<expr> is not set`, used for
`not(isSet(...))` and negated `whileLoop` heads) were probed
for local variables, global variables, and function-call
results: a function that returns nothing yields "not set",
one that returns a value yields "set". Presence is not
content: a variable holding an empty text `""`, the number
`0`, or `false` _is_ set; only genuine absence — an unset
variable, a deleted variable, a call with no return — is not
set. It is a leaf condition, so it works in `ifElse`, in
`and`/`or`/`not` logic, and as a `whileLoop` head. The engine
implements the same rule over its no-value representation
(`null`, or an empty multi-value).
`examples/isset.ts` exercises all of it and
`examples/behavior/isset.behavior.ts` asserts the identical
expectations under both runtimes.

Chance semantics (verified against the real Skript 2.17.1):
the argument is a _fraction_ — `chance(0.5)` succeeds half the
time. That is the original's own percent model: its `50%`
literal is the number 0.5, and writing the percent sign after
an expression (`chance of {p}%`) divides it by 100. A value of
1 or more always succeeds, a negative value never does, and a
missing or non-number value never succeeds. Every check draws
again, so `chance` also works as a `whileLoop` head (each
iteration re-draws). One asymmetry: the original has **no
negated chance form**, so `not(chance(...))` lowers only when
the `if` has an else branch (branch swap); without one the
build fails with an explicit error, and `whileLoop` rejects a
negated chance head outright. (The original itself would
accept an empty `if chance ...:` section with only a load
warning, which could encode the negation; skript-ts chooses
the explicit build error over emitting warning-generating
output.)

## Lists, loops, while and wait

List semantics (verified against the real Skript 2.17.1 with
probe scripts, not assumed). A list is not a separate value: it is
the set of `{name::<index>}` entries in the ordinary variable
store, so lists persist exactly like scalars (in the engine, as
individual `name::index` keys in `variables.json`).

- **Index identity**: for indices computed by an expression, the
  number `5` and the text `"5"` are the _same_ entry — identity is
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
- **`listRemove`** deletes only the _first_ matching element (in
  iteration order), using the phase-11 equality rules.
- **`sortedList(list)`** (`sorted <list>`, feedback C5) yields the
  list's entries sorted ascending, like `listSize` over any
  list-valued expression (a list variable, a local list, a
  `splitText` result, a function call, ...). Probed against the
  real Skript 2.17.1: homogeneous lists only — all-number lists
  sort ascending numerically (`3, 1, 2` → `1, 2, 3`), all-text
  lists sort ascending case-insensitively (`banana, Apple,
  cherry` → `Apple, banana, cherry`), and anything else — a
  mixed number/text list, items, players, an empty list — yields
  no value. Descending order is not part of this addition: no
  reversed / descending form is offered.
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
A boolean expression is accepted as the head too: it lowers to
the leaf `equals(expr, true)` (see _Conditions_ above), emitted
as `while <expr> is true:`.

`wait` suspends the rest of the trigger: everything after it —
the remainder of enclosing blocks, the remaining iterations of an
enclosing loop, the statements after the loop — runs after the
duration, in order. In Skript this is the runtime's own delay
behavior; the engine implements the same continuation semantics
on the Bukkit scheduler. Amounts may be fractional (`wait 0.5
seconds`); units are `ticks`, `seconds` and `minutes`.

## Variable handles

Typed handles are pure API sugar over the variable builders —
they centralize the key construction for one variable name and
build exactly the same AST, so there is no new `.sk` form and
no runtime difference.

`playerVar(name)` (feedback E6) handles one player-indexed
global variable. The player expression passed to each method
is the index — the per-player slot:

| TypeScript                              | Equivalent builder form                 |
| --------------------------------------- | --------------------------------------- |
| `playerVar(name).of(player)`            | `variable(name, player)`                |
| `playerVar(name).set(player, value)`    | `set(variable(name, player), value)`    |
| `playerVar(name).add(player, value)`    | `add(variable(name, player), value)`    |
| `playerVar(name).remove(player, value)` | `remove(variable(name, player), value)` |
| `playerVar(name).delete(player)`        | `deleteVar(variable(name, player))`     |

`localHandle(name)` (feedback E7) handles one local variable,
for use inside a trigger or a `defineFunction` body:
`get()` is `localVar(name)`, and `set(value)` / `add(value)` /
`remove(value)` / `delete()` are the corresponding statements
over `localVar(name)`.

The writing methods accept an `Expr` or a plain string /
number / boolean literal, which is normalized (`str()` /
`num()` / `bool()`); an `Expr` passes through unchanged. Both
constructors reject an empty name with a RangeError at the
definition site (`variable()` itself performs no name check;
`localVar()`'s non-empty rule is applied eagerly).

Keying note: in the engine, a player used as a variable index
keys by the player's **UUID** (feedback B6), so a handle's
slots survive a rename. Skript mode emits the same
`{name::%player%}` text, and the player index expands per the
server's Skript configuration (its "use player UUIDs in
variable names" setting). `examples/varhandles.ts` shows an
economy flow built on both handles.

## Custom functions

`defineFunction(name, params, returnType, body)` defines a
function; `param(name, type, default?)` declares a parameter.
Types are `number`, `text`, `boolean`, `player`, `location`,
`object` and their plurals (`numbers`, `texts`, ...), plus the
singular-only gameplay types `block`, `item` and `entity` (see
_Gameplay events_ below). A plural
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

**Typed handles: `defineFn`.** `defineFn(name, params,
returnType, body)` runs the same validation as `defineFunction`
and returns a _typed handle_ instead of the bare definition, so
calls through it are checked by the type checker (the string
forms above are unchecked: a misspelled name is just a string,
and `call` / `callStmt` accept any expressions in any count).
`param()` carries its type as a literal, and a handle call's
arguments are a mapped tuple over the parameters' type literals:

- `handle.definition` is the `TopLevel` definition
  `defineFunction` produced. `script()` accepts handles directly
  wherever a definition belongs — it unwraps `.definition` — so
  a handle can be passed to `script()` as-is.
- For a non-void return type the handle itself is callable:
  `handle(...args)` builds the same call expression as
  `call(name, ...args)`. For a void function the handle is **not**
  callable as an expression at the type level; only `.stmt` and
  `.definition` exist on it.
- `handle.stmt(...args)` builds the `callStmt(name, ...args)`
  statement, for void and value functions alike.
- Argument kinds follow the declared type: a `number` parameter
  takes a JS number or an expression, `text` a string or an
  expression, `boolean` a boolean or an expression (the JS
  primitives are normalized to number / text / boolean literals),
  every other singular type an expression only, and a plural
  parameter one expression or an array of expressions (flattened
  into the call's arguments, so a plural call through a handle
  reads `f([a, b])` where `call("f", a, b)` spreads them).
- One argument per declared parameter is the type-level shape.
  At runtime the handle validates the count again (a `RangeError`
  on the wrong arity, for callers that bypass the types), lets
  trailing parameters with defaults be omitted just like a
  `defineFunction` call, and rejects an argument whose JS kind
  does not match its parameter.

`examples/fnhandles.ts` exercises all of this — an
`mmoXp(player, text) :: number` function called through its
handle in expression and statement positions, a void handle used
only via `.stmt`, and a plural parameter passed an array — and
carries the compile-time negative checks (wrong arity, a text
literal in a player slot, a void handle called as an expression)
as suppressed type errors in a never-called function.

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
  are arbitrary expressions, evaluated at call time _before_ any
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
  return type makes the call yield _no value_. A value function
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

## Gameplay events

The gameplay events are core language: the same script runs
under Skript (as emitted `.sk`) and under the engine jar (which
fires them from its own Bukkit listeners). This slice is the
_unfiltered_ forms; the filtered variants (`on break of
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
  is the broken block _in item form_, **not** the tool in hand
  (pinned live: digging grass with a sword in hand reported
  `grass block`). An empty hand means the value is _absent_ —
  inside a string it reads `<none>`, not `air`.
- `toolOf(player())` is the item in the player's **main hand** —
  the tool the event-item of a break is not. It is not an event
  value: it reads the live hand in any context that has a player
  value, so a break handler can write the two apart (the
  behavior test pins it: digging grass with a diamond sword in
  hand reports block item `grass block` and tool
  `diamond sword`). `offHandToolOf(player())` is the same read
  for the **off hand**. An empty hand reads as the `air` item
  here — unlike the event-item above, whose empty hand has no
  value at all: the tool expressions follow Skript's
  player-tool expression, whose empty hand is air (probed on
  the real Skript: both hands report `0 airs`, type `air`).
  Only a non-player target has no value.
- In damage events, `victim()` is the entity taking damage and
  `attacker()` the entity that caused it; `attacker()` has no
  value for environmental damage (fall, lava, ...). The bare
  `player()` / `eventPlayer()` are **not defined** in damage
  events — Skript rejects them at parse time ("There's no
  player in an on damage event"), and the engine mirrors that by
  leaving both unset there.
- A **projectile damager resolves to its shooter**:
  `attacker()` is the entity that shot the projectile, never
  the projectile itself (pinned live: a snow golem's snowballs
  and a skeleton's arrows both read the shooter as the
  attacker, the damage header's `by` filter matches the
  shooter, and a death by projectile credits the shooter).
  The engine mirrors this for entity shooters; a projectile
  from a non-entity source (a dispenser) keeps the projectile
  itself as the attacker.
- `damageAmount()` is the event's _current_ amount: it reflects
  `setDamage()` writes made earlier in the same handler. The
  amount itself is the server's computation (a fist hit is `1`
  only at full attack charge), identical under both runtimes
  because the engine reads the same Bukkit event.
- `damageCause()` is the cause as a text. Most causes read as
  their lowercase name (`fall`, `lava`), but Skript's names are
  not a mechanical transform: an entity attack prints as
  `attack` (pinned live), and `FIRE_TICK` reads `burning`. A
  mob's **arrow** hit also reads `attack`, while a snow
  golem's **snowball** hit reads `projectile` (both pinned
  live).
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
`typeOf(...)` yields a _type value_, not a text — a function
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

## Event filters and more events

The filtered event forms are core language too, along with
the clicked-entity value and five more events — pickup, drop,
respawn, and bed enter/leave. Everything below was verified
against the real Skript 2.17.1: the header shapes by probe
scripts at load time, the matching by watching sandbox mobs
hurt each other, and the full set by a mineflayer behavior
test under both runtimes.

**Filters.** A filter is a trailing options object on the
event builders. Skript's filtered headers are _literal type
lists_ in the script text, not runtime expressions, so the
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
  — `on` (clicked block _or_ clicked entity; both together
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

**The new events** are the _player_ forms, like Skript's bare
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
cannot have. **Update (generalized events, below):** both
gaps are closed — death is generalized to every entity with
its victim filter, the entity pickup/drop forms exist, and
the fishing family is in, with the random bite timing tamed
by the test design described there.

`examples/events2.ts` exercises all of it — filtered breaks,
places, clicks and damage reports, wheat pickups singled
out, an undroppable compass, respawns and bed use — and
`examples/behavior/events2.behavior.ts` drives a bot through
it under both runtimes.

## Event cancellation state and handler priority

Core language, like everything above: the same script runs
under Skript and under the engine. Everything here was
probed against the real Skript 2.17.1 (six one-level damage
handlers, with and without a cancelling handler among them,
a dedicated probe for the undeclared handler's dispatch
slot, plus parse probes for the header shapes).

**Reading the state.** `eventCancelled()` is the condition
`event is cancelled` (native negation `event is not
cancelled`; the `the event is cancelled` spelling also
parses but is not emitted). It is a leaf condition, so it
works in `ifElse`, in `and`/`or`/`not` logic, and as a
`whileLoop` head. What it reads is the _live_ state of the
event being handled — which, given the dispatch rule below,
means: **false when the handler starts, true after the
handler itself calls `cancelEvent()`, false again after
`uncancelEvent()`**. In an event that cannot be cancelled
(respawn, bed leave) it always reads false — the condition
parses there too — and outside an event (a command, a
function body) the engine reads false.

**Priorities.** Every event builder accepts a `priority`:
the filtered builders carry it in their filter object
(`onDamage(body, { victim: "zombie", priority: "highest" })`),
the unfiltered ones in a trailing options object
(`onJoin(body, { priority: "low" })`). The value is one of
`"lowest" | "low" | "normal" | "high" | "highest" |
"monitor"` — anything else is rejected by the builder (an
unknown level is a parse error in Skript). It emits the
header suffix `with priority <level>`, always **after**
every filter slot: `on damage of zombie with priority
highest:`. With no priority declared the header is exactly
the old form — but read the dispatch note below before
assuming where such a handler runs. There is no
`priority:` section line: that shape is a parse error in
the original.

**Dispatch order and the skip rule.** Handlers for one
event run slot by slot — **lowest → low → normal → high →
highest → monitor** — and handlers in the same slot run in
declaration order (a first join's `firstJoin` and `join`
handlers share one ladder). One probed subtlety decides
where existing code sits on that ladder: **a handler with
no priority declared dispatches in the _high_ slot, not
the normal one** — interleaved by declaration order with
the explicit-`high` handlers. Only an explicit `"normal"`
lands in the normal slot. (Probed directly: an undeclared
handler declared before an explicit-`normal` one still ran
after it, and before an explicit-`highest` one.) And once
the event is cancelled, **no later handler runs at all** —
monitor included. A handler only ever starts while the
event is un-cancelled. That is the mechanic behind the
safe-zone pattern from real server work: put the guard
that cancels at an early priority (`lowest`, `low` or
`normal` — all ahead of the high slot where undeclared
handlers sit) and the XP/reward handler at `highest` or
`monitor`, and a cancelled hit never reaches the reward
handler — no per-module area checks needed. (Reading
`eventCancelled()` at the top of the late handler and
stopping is the belt-and-braces form; the skip rule is what
actually closes the hole.) A handler body suspended by a
`wait` is the one exception to reason about: the remaining
handlers start while it waits, as under Skript, so a cancel
issued only after a wait cannot hold them back.

**One recorded divergence (cross-plugin interleaving).**
Skript registers each trigger as its own Bukkit listener at
the trigger's priority, so its handlers interleave with
_other plugins'_ listeners phase by phase. The engine
dispatches its whole handler set from its own listeners,
which are registered at Bukkit's default (normal) priority:
priorities order the script's handlers among themselves,
and the skip rule applies inside that set — including the
case where the event arrives already cancelled by an
earlier-phase plugin, in which case no handler runs — but
relative to other plugins the engine acts as one
normal-phase listener. A protection plugin that cancels at,
say, the high phase therefore cannot hold back engine
handlers the way it holds back a high-priority Skript
trigger.

`examples/priority.ts` exercises all of it — eight damage
handlers declared out of order around a low-priority guard
that cancels hits on one named bot, including an undeclared
handler pinning the high-slot rule — and
`examples/behavior/priority.behavior.ts` asserts the exact
broadcast sequence per victim (and the guarded bot's
untouched health) under both runtimes.

## Text operations

Texts are core language: the same script runs under Skript
(as emitted `.sk`) and under the engine jar. Every semantic
below was probed against the real Skript 2.17.1 (see the
development log) — several differ from the "obvious" behavior:

- `textLength(t)` counts UTF-16 code units (an emoji counts
  2), like Java strings. A missing text yields no value; an
  empty text has length 0.
- `substring(t, from, to)` is 1-based and inclusive at both
  ends. The range is _fitted_: `from` is clamped up to 1 and
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
  pin this), but an expression that _counts_ § characters —
  the length of a color-coded chat message, say — can
  differ, because a component has no § characters to count.

`examples/text.ts` exercises all of it — a shout command
with a `!` prefix rule, character surgery, CSV splitting and
joining, text checks, replace demos and the paint commands —
and `examples/behavior/text.behavior.ts` asserts the
observable behavior under both runtimes.

## Items, inventories and GUIs

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
  a **directional** meta match: the right-hand stack is
  a pattern, and every meta field it specifies — a name
  (compared case-**sensitively**), lore lines, an
  enchantment set — must be matched exactly by the
  left-hand stack, while fields it does not specify
  leave the left free. So an enchanted, named stack
  `is` a plain one, but not the other way round; and
  when the pattern is enchanted, extra enchantments on
  the left fail the match too. A stack compared against
  an item _literal_ (or a type name) specifies no meta,
  so `eventItem() is item("stone")` ignores meta
  entirely. (A phase-17 summary described this rule as
  symmetric both-carry; direction probes in phase 28
  corrected it.)
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
  expression (meta included) to a player. Overflow:
  if the item does not fit — in whole or in part — the
  part that does not fit drops naturally at the
  player's feet instead of vanishing, so it can be
  picked back up once space exists (the engine drops
  exactly the un-fitted remainder reported by the
  inventory add; `examples/giveoverflow.ts` and
  `examples/behavior/giveoverflow.behavior.ts` pin
  the flow).
- **Hidden item tags (engine-only)**: names and lore
  can be faked by a modified client, so authenticity
  markers live in the item's PersistentDataContainer,
  which Skript cannot access at all — the three tag
  builders are engine builtins, and a script using any
  of them deploys IR-only. `setItemTag(var, key, value)`
  writes a tag into the item a scalar variable holds
  (mirroring `setItemName`: a bare type name is
  materialized first, a variable with no item value is
  a no-op, and a value that is not text / number /
  boolean is a no-op). `itemTag(item, key)` reads the
  tag value back — no value when the tag is missing,
  the item has no meta, or the value is not an item.
  `hasItemTag(item, key)` is the leaf-condition form —
  false in exactly those cases. Keys are validated at
  build time: lowercase `[a-z0-9._-]` only; the engine
  namespaces every key with the plugin's own
  NamespacedKey (`skript-ts`), so script tags can
  neither collide with nor read another plugin's tags.
  Type mapping: text -> PDC `STRING`, number -> PDC
  `DOUBLE`, boolean -> PDC `BYTE` (1/0, read back as a
  boolean). Tags persist through the engine's variable
  store: the `__item` encoding carries them alongside
  material / amount / name / lore, so a tagged stack in
  a global variable keeps its tags across restarts;
  saves written before tags existed have no tag field
  and still decode (as untagged stacks).
  `examples/itemtags.ts` exercises all of it — a
  `/tagitem` command that stamps a sword with a text,
  a number and a boolean tag, and a `/tagcheck` command
  that reads them back and branches on `hasItemTag` —
  and `examples/behavior/itemtags.behavior.ts` drives a
  bot through the flow under the engine.
- **Held items**: `toolOf(player)` is the item in the
  player's main hand (`tool of %player%`, Skript's
  player-tool expression) and `offHandToolOf(player)` the
  item in the off hand (`offhand tool of %player%`). An
  empty hand reads as the `air` item (the tool expressions
  have a value for an empty hand; event-item does not).
  They read the live hand wherever a player value exists;
  in a block break the main-hand read is the digging tool,
  where `eventItem()` is the broken block instead (see the
  gameplay events section).
- **Inventories as values**: `chestInventory(rows[,
  title])` creates a fresh virtual chest inventory (rows
  clamp to 1..6) that exists independently of any
  player; `currentInventoryOf(player)` is the inventory
  the player is viewing (their own crafting inventory
  when nothing is open, as in the original);
  `eventInventory()` is the top inventory of an
  inventory event. `slotItem(inv, slot)` reads a
  0-based slot — an in-range empty slot reads as an
  **air item of amount 0** (it is set, its type is air;
  an out-of-range slot has no value) — and
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
- **Inventory operations**: `hasItem(target, item)`
  tests whether an inventory holds at least the item
  pattern's amount (`<target> has <item>`; negated
  `<target> does not have <item>`), and
  `itemCountIn(target, item)` counts the matching
  items (`amount of <item> in <target>`). Matching is
  the directional rule from Equality above: a bare
  pattern matches named stacks, a named pattern
  matches only its own. A player target reads the
  player's whole inventory — main storage, armor and
  offhand all count. `removeItem(target, item)`
  removes up to the pattern's amount in slot order
  and `removeAllItems(target, item)` removes every
  match (`remove <item> from <target>` / `remove all
  <item> from <target>`); a remove that asks for more
  than the inventory holds is partial — it removes
  what exists and never fails. `canHoldItem(target,
  item)` (`<target> can hold <item>`; negated `can't
  hold`) applies the original's stricter capacity
  rule instead: only the 36 storage slots count
  (armor and offhand never do), an empty slot fits a
  full max-size stack of the pattern's material, and
  a partial stack only takes more of an exactly
  similar stack (meta equal both ways) — an empty
  inventory holds 2304 diamonds but only 36 diamond
  swords. `freeSpaceFor(target, item)` returns that
  capacity as a number, but the original has **no
  expression** for it (every free-space amount form
  failed to parse in probes), so it is
  **engine-only**: scripts using it deploy IR-only.
  All of the above was probed against the real
  Skript 2.17.1.

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

Phase 28 (GUI slice 2) adds drags, slot add/remove and
enchantments, all probed against the real Skript
2.17.1:

- **Drag events**: `onInventoryDrag` fires for every
  inventory drag. `eventInventory()` is the view's top
  inventory (even for bottom-only drags) and
  `eventItem()` is the cursor item as it will be
  **after** the drag — an air item of amount 0, never
  no-value, when the drag distributes everything.
  `draggedSlots()` is the list of slot values that
  actually receive items, loopable with `loopList`;
  `slotIndexOf(slotValue)` is a slot's index within
  its own inventory (bottom slots use the player
  inventory's numbering). `cancelEvent()` stops the
  distribution — but cancelling **clicks** does not: a
  GUI whose click handler cancels everything still
  lets drags through (the original has the same hole,
  and the behavior test pins it). No event value
  exposes the drag's button or mode in the original.
  `clickedClickType()` reads a click event's type
  (`left mouse button`, `left mouse button with
  shift`, `drop key`, …).
- **Slot / inventory add and remove**:
  `addToSlot(inv, slot, item)`, `removeFromSlot(inv,
  slot, item)`, `addToInventory(inv, item)` and
  `removeFromInventory(inv, item)` are the original's
  generic add/remove changers, restricted to item
  operands (a bare number is a build-time error, like
  the original's load error). Slot add onto an empty
  slot is a set: it may exceed the material max and is
  uncapped in a player inventory, but caps at 99 in a
  chest-like inventory. Onto an occupied slot it
  merges only similar stacks — similarity is the
  symmetric both-carry rule over name, lore and
  enchantments, and the result keeps the slot stack's
  meta — capped at the material max, which can shrink
  an over-max stack; anything else silently drops the
  operand. Inventory add merges similar partial stacks
  in slot order, then fills empty slots at the
  material max, then silently drops the remainder.
  Removes match by material only (meta is ignored on
  both sides) and empty the slot they drain.
- **Enchantments**: `withEnchantment(itemLiteral,
  name, level)` composes the literal suffix
  (`diamond sword of sharpness 5`); in a literal chain
  the suffix order is count, item, enchantments, name,
  lore — the name-first order parses but silently
  evaluates to no value. Names are the space forms
  (`fire aspect`, `binding curse`); the level is a
  build-time integer. `enchantItem(var, name, level)`
  and `enchantSlot(inv, slot, name, level)` are the
  effect form for variable-held and slotted items:
  incompatible enchantments and over-cap levels apply,
  and level 0 removes. `enchantmentLevelOf(item,
  name)` reads a level (no value when absent) and
  `enchantmentsOf(item)` the print forms as a list
  (`sharpness 5`; the curses print as `curse of
  binding` / `curse of vanishing`). Enchanted items in
  variables persist across a server restart in both
  runtimes. List machinery is not limited to list
  variables: `loopList` and `listSize` accept any
  list-valued expression, such as `draggedSlots()`.
- **Cursor (engine-only)**: the original has no cursor
  syntax at all — every spelling is a parse error, and
  the click / drag events reject the cursor
  event-value — so `eventCursor()` (a click or drag
  event's pre-click / pre-drag cursor item, no value
  when empty) and `setCursorItem(player, item)` are
  engine builtins: building such a script for Skript
  is a build-time error. Inside a click or drag event
  the replacement is applied as the event completes —
  the event's own cursor setter does not survive the
  click's resolution on Paper (probed: the server sent
  the replacement, then a resync whose carried item
  was the vanilla click outcome), so the engine sets
  the clicker's cursor a tick later; anywhere else it
  sets the player's cursor directly.

`examples/gui2.ts` and `examples/behavior/gui2.behavior.ts`
cover all of it under both runtimes;
`examples/gui2cursor.ts` and its behavior test cover
the cursor slice under the engine.

Still out of scope (recorded, not forgotten):
meta beyond name, lore, amount and enchantments
(durability, item flags, custom model data), and the
drag's button/mode (not exposed by the original).

## World operations and periodical events

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
forgotten): facing-relative offsets from _entities_
(the location form is probed and included; an
entity's facing needs a live-facing probe design),
and world time arithmetic.

## World paint: shapes and fills

Bulk world building composed as _shape × fill_:
a shape value describes a set of block positions, a
fill value decides which material each position
gets, and the `paint` statement writes the whole
region as **one engine operation** — never as a
sequence of per-block statements. This family is
**engine-only** (an engine builtin, like the addon
slices): the bulk single-operation semantics and the
seeded, position-pure material selection below have
no Skript text form, so the emitter throws on these
kinds, scripts using them deploy as IR only, and
Skript-mode deployment skips them. Shapes and fills
are runtime-only values (like data sources): they
can be stored in variables and reused, but are never
persisted across restarts.

Shapes (positions are block positions; a location
contributes its block coordinates, and the first
location's world anchors the whole shape):

| TS builder                         | Shape                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cuboid(from, to)`                 | every block between the two corner locations, inclusive, in either corner order                                                                                   |
| `sphere(center, radius)`           | every block whose integer offset from the center block satisfies dx²+dy²+dz² ≤ radius²                                                                            |
| `cylinder(center, radius, height)` | dx²+dz² ≤ radius² over the center block, from its Y up `height` layers (a layer count: rounded, at least 1)                                                       |
| `blockLine(from, to)`              | the blocks on the segment between the two locations, stepped along the dominant axis with per-axis rounding, so the line stays connected; both endpoints included |

A negative radius, or a cylinder height of zero or
less, paints nothing.

Fills (the item expressions resolve to materials by
the same rules as `setBlockAt` — a stack's type, a
type name, or a block's type):

| TS builder                                          | Fill                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `uniformFill(item)`                                 | that item's material at every position                                          |
| `mixFill([[item, weight], ...], seed?)`             | per position, one entry picked by cumulative weight                             |
| `noiseFill(base, spot, { scale?, amount?, seed? })` | the spot material where a seeded value noise peaks, the base material elsewhere |

- **Determinism is the contract**: mix and noise
  selection is a pure function of (seed, x, y, z) —
  a splitmix64-style position hash — so repainting
  the same shape with the same fill reproduces the
  same world exactly, on any run and any server.
  The pattern depends on the absolute world
  coordinates: the same shape painted somewhere else
  gets a different, still reproducible, pattern.
  Seeds are builder-level numbers (default 0),
  truncated to whole numbers by the engine.
- **Mix**: weights are relative (normalized at pick
  time) and must be positive; entries whose item
  resolves to no material are dropped when the fill
  is evaluated, and if none remain the fill has no
  value and the paint is a no-op.
- **Noise**: 3D value noise — hashed lattice values
  on a grid of `scale`-block cells (default 4),
  trilinearly interpolated with smoothstep weights.
  A position gets the spot material when its noise
  value reaches `1 - amount`; `amount` (default
  0.5) is the _approximate_ spot coverage, because
  value noise is not uniformly distributed. Amount
  0 paints all base, amount 1 paints all spot. A
  side whose item resolves to no material leaves
  its positions untouched.

The statement: `paint(shape, fill)` writes every
position of the shape; `paint(shape, fill,
{ replace: item })` writes only positions currently
holding the replace item's material — and a replace
item that resolves to no material makes the whole
statement a no-op rather than degrading into an
unrestricted paint. Blocks already holding the
picked material are left untouched, and writes
apply **no physics updates** (placed gravel does
not fall, water does not flow from the write).
Reading a position's block loads its chunk, as with
`blockAt`.

`examples/paint.ts` drives the family from commands
anchored at the player's feet — noise- and
weight-mixed floors, a wall with replace-restricted
repaints, a rising line, a sphere and a cylinder —
and `examples/behavior/paint.behavior.ts` verifies
the geometry and the seed reproducibility against a
live server under the engine.

## Player state and effects

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

## Command definitions

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

## Display effects and boss bars

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

- **Keyed boss bars, styles, flags, sections** (phase 24,
  probed on 2.17.1): `keyedBossBar(key, { title?, color? })`
  creates a bar in the server's persistent boss bar storage;
  evaluating the create **replaces** any bar stored under
  the key with a fresh one (empty title, progress **0** —
  the vanilla custom-bossbar default). `keyedBossBarOf(key)`
  fetches by key: a missing key yields no value and never
  creates a bar. Keys are full namespaced keys (a bare key
  lives in `minecraft:`; lowercase letters, digits, `.`
  `_` `-`, plus `/` in the key part) — an invalid key is a
  runtime error in the original and yields nothing here.
  `deleteKeyedBossBar(key)` removes a stored bar (a silent
  no-op when missing). Keyed bars **can** be saved: a
  persistent variable records the key and resolves it on
  load. They survive restarts — except progress, which the
  vanilla storage does not save and which reads back 0.
  `bossBarKeyOf(bar)` reads the full `namespace:key` text
  (not set for plain bars). `setBossBarStyle(bar, style)`
  writes a style literal (`solid`, `6 notches`, `10
  notches`, `12 notches`, `20 notches`);
  `bossBarStyleOf(bar)` reads it back as `solid` or
  `N segments` (the original's asymmetric spellings).
  `setBossBarFlag(bar, flag, enabled)` with flags
  `darkenSky` / `createFog` / `playBossMusic` emits the
  make / make-no-longer effects; the conditions
  `bossBarDarkensSky` / `bossBarCreatesFog` /
  `bossBarPlaysBossMusic` read them (fresh bars have all
  flags off). `createBossBarSection(target, body, { key?,
  color? })` is the section creation form: the body
  addresses the new bar as `eventBossBar()` (`event-bossbar`)
  and the target is bound after the body runs; the section
  head takes a color but no title clause (the docs'
  keyed+title section example does not parse in the
  original — set the title in the body). Recorded, not
  reproduced: deleting the keyed **create** expression
  crashes the original (ClassCastException), so deletion
  here emits the fetch form; and the enclosing event's
  `player` is not visible inside a section in the original
  either.

`examples/display.ts` exercises all of it — a timed title
with subtitle and an action bar on join, the `/dtplain`,
`/dtstay`, `/dtsub`, `/dtclear`, `/dtreset` and `/dbar`
commands, and the `/dbshow` / `/dbfresh` boss bar
lifecycles — and `examples/behavior/display.behavior.ts`
asserts on the client's actual title / action bar /
boss bar packets under both runtimes.

`examples/bossbar.ts` runs the keyed battery as the
`/bossbar` command, and
`examples/behavior/bossbar.behavior.ts` asserts the
narrated sequence (create / reset / style / flag / key /
sections / variable storage / delete) and the shown bar's
wire packet under both runtimes.

Deliberate deferrals (recorded): plural audiences as title
targets (the original's `%audiences%`; this subset's sends
target one player, as elsewhere).

## Generalized events: death, entity pickup/drop and fishing

The v0 event set started player-shaped; this section
generalizes it to the shapes the original has, all as core
language (TS API, `.sk` emitter and jar engine with identical
semantics), with every rule below probed against the real
Skript 2.17.1 — header parsing by probe scripts, runtime
matching by driving mobs, a fishing bot and console damage
on the sandbox server.

**Death covers every living entity now.** `onDeath(body)`
fires for any entity's death, and takes the victim filter
from the _Event filters_ section's family:
`onDeath(body, { victim })` — `on death of zombie or
skeleton:`. Inside, `victim()` is the dead entity and
`attacker()` is the damager of its **last damage cause**
when that cause was an entity attack — _any_ entity, probed:
a zombie killed by an iron golem reads attacker
`iron golem`, a command kill reads no attacker, a player's
sword kill reads `player`. A projectile killing blow
resolves to the shooter, exactly as in damage events: a
snow golem shot dead by a skeleton reads attacker
`skeleton` (pinned live). Three honest limits, all probed:
the header has **no attacker filter** (`on death … by
player:` does not parse in the original, so none is
offered); `player` does not exist in a death event in the
original (a parse error there — write `victim()`; for a
player victim the engine still fills the player values, so
v0 handlers keep working); and the event is not cancellable
in either runtime (a `cancelEvent()` inside is the
established no-op).

**Entity pickup and drop.** `onEntityPickup(body, { item })`
and `onEntityDrop(body, { item })` are the explicit entity
forms (`on entity pick up of wheat:`, `on entity drop of
egg:`), with the phase-16 `{ item }` filter. The new value
`eventEntity()` is the entity the event is about. The forms
differ in who they cover, exactly as probed: entity pickup
fires for **every** picker, players included (a player
pickup fires the bare form _and_ this one, with
`eventEntity()` = the player), while entity drop never
fires for a player (a player's toss is only the bare form —
the two are different Bukkit events underneath). In an
entity drop, `droppedItemEntity()` is the dropped item as
an entity and `itemOfEntity(entity)` reads the stack it
carries (`item of event-dropped item`); the stack is also
`eventItem()`. Cancelling works in both forms.

**Fishing** is a family of state sub-events, not one event —
the original has no generic `on fishing:` at all (a parse
error). Each Bukkit fishing state has its sub-event, plus
one state-change event that fires for all of them:

| builder                | header                     | state name          |
| ---------------------- | -------------------------- | ------------------- |
| `onFishCast`           | `on fishing line cast:`    | `fishing line cast` |
| `onFishApproach`       | `on fish approaching:`     | `lured`             |
| `onFishBite`           | `on fish bite:`            | `bite`              |
| `onFishCaught`         | `on fish caught:`          | `fish caught`       |
| `onEntityHooked`       | `on entity hooked:`        | `entity caught`     |
| `onHookInGround`       | `on bobber in ground:`     | `bobber in ground`  |
| `onFishEscape`         | `on fish escape:`          | `fish escape`       |
| `onFishReelIn`         | `on fishing rod reel in:`  | `reel in`           |
| `onFishingStateChange` | `on fishing state change:` | (any)               |

The state names are what `eventFishingState()` prints;
`fishingState("bite")` builds the matching literal (unknown
names are rejected at build time), so a state-change handler
can branch: `if equals(eventFishingState(), fishingState("bite"))`.
`fishingHook()` is the bobber (its type name prints as
`fish hook`). In the two catch states `eventEntity()` is
the caught thing: for a fish it is the item entity, and
`itemOfEntity(eventEntity())` is the caught stack; for an
entity catch it is the hooked entity (also `hookedEntity()`).
Fishing events have **no event-item** — the original rejects
it at parse time. The fishing wait-time / bite-time
expressions are not offered: they are timespan-valued, and
this subset has no timespan value type yet (the same
prerequisite as the title timings).

The bite timing is the original's random draw, so the
behavior tests tame it instead of fighting it: a deep,
wide pond (a shallow pool stalls the approach and the bite
never comes — found by probing), a Lure III rod, and the
escape tested through its deterministic route (a bite that
is not reeled in becomes an escape about a second later).

`examples/events3.ts` exercises all of it — filtered mob and
player deaths, mob and player pickups, a chicken's egg drop,
and the full fishing family with a state-change logger —
and `examples/behavior/events3.behavior.ts`,
`fishing.behavior.ts` and `fishing2.behavior.ts` drive bots
through it under both runtimes. One honest exception:
`onHookInGround` is implemented and golden-tested, but the
behavior tests do not assert it — extended probing (dry
rests, shallow water, a raised reef, wall impacts, reeling
a resting bobber, even a slime bouncing on it) never made
Bukkit produce the IN_GROUND state on demand in the test
sandbox, so there is no deterministic trigger to assert
against. Both runtimes dispatch it from the same Bukkit
event the original wraps, so it fires exactly when the
platform produces it — the original has the same platform
dependency.

## Timespans as values

Timespans are now a first-class value type on all three paths (TS API, .sk emitter, jar engine), with every rule probed against the real Skript 2.17.1. A timespan is a whole number of milliseconds (a month is 30 days, a year is 365 days); the literal builder `timespan(amount, unit)` covers all eight units — ticks, seconds, minutes, hours, days, weeks, months, years — and rounds the amount to the nearest millisecond.

Printing decomposes greedily from years down to minutes and shows the sub-minute remainder as seconds rounded to two decimals without carry: 59.999 seconds prints "60 seconds" and 119.999 seconds prints "1 minute and 60 seconds"; a unit is singular only for an exact count of one, so 999 milliseconds prints "1 seconds"; zero prints "0 seconds" and the infinite value prints "forever".

**Arithmetic.** Addition and subtraction work between two timespans — subtraction saturates at zero, and if either operand is infinite the result is infinite for both operations (even eternity minus eternity); multiplication takes a number on either side (a negative or NaN factor yields no value, a zero factor yields zero even for eternity, overflow yields eternity).

Division by a number truncates toward zero in milliseconds (dividing by zero yields eternity unless the dividend is zero), while dividing two timespans yields their numeric ratio; any other mix with numbers or texts yields no value. A missing operand counts as the other side's zero — as the number zero for multiplication — and two missing operands yield no value.

Comparisons order by milliseconds (5 seconds equals 100 ticks), eternity is greater than every finite value and equal to itself, and against numbers or texts both equality and ordering are false. The engine's number printing was aligned to the original in passing: fractional numbers print rounded to two decimals (5 / 3 prints "1.67").

Timespans store in local and global variables and in list elements, persist in the engine's variable store, and type function parameters and returns as `timespan` / `timespans` (plurals collect; defaults allowed).

**Unlocked by the value type.** `waitFor(value)` emits the original's `wait <timespan>` and accepts a variable or an arithmetic result (the literal wait is unchanged). Title and subtitle timings accept expressions — a literal, a variable or arithmetic — with unspecified parts, and parts whose expression has no value, falling back to the original's 10 / 70 / 20 tick defaults.

The fishing expressions `fishingWaitTime("min" | "max")`, `fishingBiteTime()` and `fishingApproachAngle("min" | "max")` read the current hook inside fishing events — at cast they read 5 seconds, 30 seconds, 0 seconds, 0 and 360 degrees — and the matching setters retune it; outside fishing events the reads have no value and the writes do nothing. The add / remove statements on variables accept timespans (remove saturates at zero); `remove(variable, value)` is new for variables in general.

**Probed and not adopted.** World time does not combine with timespans in the original — setting world time to a timespan is a changer error and `time in world + 2 hours` has no value — so the phase-18 exclusion stands; a periodical with a variable period (`every {_t}:`) parses but was never observed firing, so periodic events stay literal-only.

The "minecraft" unit family (1 minecraft day measured at 20 minutes) is a separate literal grammar and is left for later; composite literals (`2 hours, 30 minutes`) exist in the original — adjacent literal arguments even merge into one inside a function call — but the API composes with `plus()` instead.

Three grammar edges were found by load-checking: a bare timespan literal cannot be a string interpolation, a literal number cannot be a `%{...}%` list index, and a statically typed timespan-versus-number condition is a load-time error (through variables it evaluates to false, as the semantics require).

## Dates and the current time

A **date** is an instant in time with millisecond precision — the value behind cooldowns and deadlines (feedback C3). `now()` is the moment the expression evaluates, `unixTimestamp(date)` reads a date as seconds since the unix epoch, `dateFromUnix(seconds)` builds a date back from epoch seconds, and `differenceBetween(a, b)` is the gap between two values. Dates are core language: the builders emit the original's expressions and the engine evaluates the same IR. Everything in this section was probed against the real Skript 2.17.1 (November 2026) rather than assumed, and several corners differ from the obvious guess.

**Conversions.** The unix timestamp is fractional: the milliseconds ride along as the fraction, so `unixTimestamp(now())` reads like `1794541239.13`, and the pair round-trips at millisecond precision. The reverse form is `unix date of <number>`; there is no `date from unix timestamp ...` form (a parse error). Wrong-typed operands split by form: through a variable they have no value, but a literal of the wrong type (`unix timestamp of 5`, `unix date of "abc"`) is a load-time error, because the original types these expressions' arguments.

**Differences.** `differenceBetween` is the original's `difference between ... and ...` and is always absolute: two dates yield the gap as a timespan — either direction gives the same value, and a date against itself gives 0 seconds — two timespans yield a timespan, and two numbers yield a number (10 and 3 give 7). Mixed pairings (a date against a timespan) and a missing operand have no value.

**Shifting.** A date plus or minus a timespan (the `plus` / `minus` builders) is the date shifted by that span, which is how deadlines are written: store `plus(now(), timespan(5, "minutes"))` per player, later test `now()` against it, and read the remaining time as `differenceBetween(deadline, now())`. The `time` sample's `/cdstart` and `/cdleft` commands are exactly this shape, and the behavior test drives the none → cooling → ready sequence. The pairing is asymmetric: a timespan plus a date, a date minus a date, and a date plus a number all have no value; the difference expression is the only way to subtract two dates. The add / remove statements on a variable holding a date shift it by a timespan the same way, and adding a plain number leaves the variable unchanged (both probed). The eternal corners follow the timespan rules without a dedicated probe: shifting by an eternal timespan has no value, and a difference with an eternal side stays eternal.

**Equality, ordering, printing.** Dates compare by their millisecond count: two `now()` readings some 150 ms apart are unequal, and the ordering conditions sort dates as expected; a date equals nothing of another type. A date prints in the original's configured date format — under the default configuration (`date format: default`) that is the JVM's default SHORT/SHORT date-time form, e.g. `11/13/26, 12:40 PM` on an en_US / JST host. The engine prints the same JVM default form and does not read a Skript configuration file, so under a customized Skript date format the two runtimes print the same date differently; values and comparisons are unaffected.

**Types and storage.** Dates type function parameters and returns as `date` / `dates` (plurals collect, as for timespans), store in local and global variables and in list elements, and persist in the engine's variable store (a `__date` record of epoch milliseconds). One divergence is recorded rather than papered over: the original's `type of` on a date reads `<none>`, while the engine names it `date`, following its uniform naming of value types; the behavior battery pins no `type of` line for dates in either mode.

**Not adopted.** Date formatting is out of scope for this feedback item: there is no builder for custom format strings or formatted-date expressions, and dates print in the default form only. Reading a date back from text is likewise unsupported.

## String escaping

Literal text follows Skript's escaping: `"` is doubled (`""`) and a literal
`%` is doubled (`%%`). This applies to `str()` values, the literal parts of
`fmt()`, and permission strings — never to emitted placeholders.

## Resource packs: generation foundation (RP-1)

Build-time only: a project exports one pack definition and
`skript-ts build` generates the pack zip plus a manifest next to the
built scripts. Nothing is deployed or sent to players yet — the zip
is placed into a client's `resourcepacks` folder by hand.

| TS builder                                                                         | Result in the pack                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `defineTexture({ id, palette, map, size?, transparentChar? })`                     | a PNG rendered from the pixel map at `assets/<ns>/textures/<path>.png`                                      |
| `defineTexture({ id, source: { kind: "png", path } })`                             | the PNG file copied to the same place (path resolves against the defining file's directory)                 |
| `defineItem({ id, baseItem, texture?, model?, modelParent?, displayName? })`       | a data-driven item definition at `assets/<ns>/items/<path>.json`, plus a model JSON when a texture is given |
| `defineFontChar({ id, texture, char, height?, ascent })`                           | one bitmap provider in the pack's own font, `assets/<packNs>/font/default.json`                             |
| `definePack({ namespace, description, required?, textures?, items?, fontChars? })` | the pack itself: `<namespace>.zip` + `<namespace>.resourcepack.json` in the build output                    |

Semantics, pinned against the real 1.21.11 client jar (the formats
are Mojang's, so the jar files themselves are the probe):

- **pack.mcmeta** uses the 1.21.9+ form: `min_format` / `max_format`
  are `[75, 0]`, the resource pack format of 1.21.11 (read from the
  version metadata of the 1.21.11 jar). The legacy lone
  `pack_format` number is not emitted.
- **Item definitions** are the data-driven form:
  `{ "model": { "type": "minecraft:model", "model": "<id>" } }`.
  The model id defaults to `<itemNs>:item/<itemPath>`; the model
  JSON is `{ "parent": "minecraft:item/generated", "textures":
  { "layer0": "<texId>" } }` (`modelParent` overrides the parent).
  An item shows in game once a stack carries the matching
  `minecraft:item_model` component — assigning it from scripts is
  RP-2, so in RP-1 the check is a vanilla command:
  `/give @s minecraft:amethyst_shard[item_model="example:gem"]`.
- **Pixel maps**: one character is one pixel; the palette maps a
  character to `#RRGGBB`, `#RRGGBBAA`, or `"transparent"` (alpha 0).
  The transparent character defaults to `.` and must map to
  `"transparent"` when it appears in the palette. Size defaults to
  16x16; each side may be 1–256. Rendering is exact — no scaling.
- **Validation is all at build time**: a map row whose length
  differs from the width (reported with its line number), a
  character missing from the palette (line and column), duplicate
  texture / item / font-char ids after namespace resolution,
  duplicate font characters, a string texture reference that is not
  declared, a PNG source that is missing or not a PNG, and an item
  with neither texture nor model are all build errors. Inline
  `TextureDef` objects referenced by items or font chars are
  collected automatically; re-declaring the same resolved id with a
  different definition object is an error.
- **The manifest** (`<namespace>.resourcepack.json`) records the
  namespace, description, the `required` flag (declared now, acted
  on by the distribution phase), the zip file name, its SHA-1 and
  size, the pack format, and the sorted entry list. Generation is
  deterministic — zip entries are sorted and timestamps pinned to
  1980-01-01 — so an unchanged pack rebuilds to the identical SHA-1.
- **One pack per project**: exporting two `definePack` results is a
  build error. Multiple packs, CustomModelData numbering, scripted
  giving, pack sending and status events are later RP phases.

`examples/resourcepack.ts` exercises all of it — the pixel-map gem,
a PNG-sourced coin texture, the custom item, and a coin glyph in the
pack font — and `tests/resourcepack.test.ts` pins the validation,
the exact generated JSON, the PNG pixels, the zip structure and the
manifest hash.

## Resource packs: model assignment and giving (RP-2)

Scripts hand players the pack's items by reference, and the build
assigns every defined item a CustomModelData number from a
persisted registry.

| TS builder                | Meaning                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `customItem(ref)`         | an item expression for a pack item: the id as written (a bare path resolves against the pack namespace) or the `ItemDef` itself |
| `itemModelOf(item)`       | the item's `item_model` component id as text; no value when unset                                                               |
| `customModelDataOf(item)` | the item's first CustomModelData float as a number; 0 when unset                                                                |

Semantics, pinned by probes against the real Skript 2.17.1 (the
suffix forms and read-backs) and by the behavior suite:

- **Resolution happens at project-build time.** A `customItem`
  node starts unresolved (only the ref); `buildProject` resolves
  it against the project's pack — filling the resolved item id
  (the `item_model` component value), the base item, the registry
  number and the defined display name — before emit and IR. A ref
  that names no pack item, or any `customItem` in a project with
  no pack, is a build error; emitting an unresolved node throws.
- **The emitted form is one suffix chain** (probed):
  `<base> with item model "<id>" with custom model data <n> named
  "<name>"` (the last two parts only when present). It composes
  with the phase-17 suffixes (`3 of ...` via `withAmount`) and
  with `giveItem`. The engine materializes the same stack
  natively (item model, CustomModelData floats[0], display name).
- **The registry** (`resourcepack-registry.json` at the project
  root, `{ "version": 1, "items": { "<ns>:<path>": <number> } }`)
  persists name → number assignments. Allocation is
  **append-only** (max + 1, never the smallest free slot); entries
  are never removed, so a deleted definition's number stays
  reserved forever and re-registering the same name restores its
  original number. A definition may request an explicit number
  (`customModelData` on `defineItem`); a request that collides
  with any existing assignment — including a reserved one — or
  that renumbers an existing name is a build error. The registry
  is written back only when a build allocates something new.
- **The manifest gains an `items` array** (declaration order):
  each entry records the resolved `id`, `baseItem`, the `model`
  used in the item definition JSON, and the allocated
  `customModelData`. This is the contract the distribution phase
  (RP-3: R2 + per-join signed URL + SHA-1) reads — the zip's
  SHA-1 and size fields are unchanged from RP-1.
- **Client-side note**: a numeric CustomModelData does not by
  itself switch models in the vanilla item-definition format
  (numeric dispatch would need `range_dispatch` plus a copy of
  the base definition). Display is carried by the `item_model`
  component — a stack carrying it ignores the base definition —
  and the number is the compatibility record: the registry
  assignment, the stack's floats[0], and the manifest entry.
- **Equality and persistence follow phase 17**: the item model
  and the first CustomModelData float join the both-carry rule
  (each decides equality only when both stacks carry it), and
  the engine's variable store persists both components with the
  stack. Reading the model of a stack without one yields no
  value; reading its custom model data yields 0 — for item
  targets; a non-item target yields no value for both.

`examples/customitems.ts` exercises the flow end to end (store
the gem in a variable, give it, read the components back), and
`examples/behavior/customitems.behavior.ts` pins both runtimes:
the given shard carries `item_model "example:gem"`, CustomModelData
1 and the defined name, and the script's read-back agrees.
`tests/packregistry.test.ts` pins the allocation rules,
`tests/customitems.test.ts` pins resolution and emission, and the
manifest entries are pinned in `tests/resourcepack.test.ts`.
