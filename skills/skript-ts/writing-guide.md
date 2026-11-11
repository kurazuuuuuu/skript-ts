# Writing guide (layer 1)

How to write skript-ts programs: module shape, the patterns that
cover most scripts, recipes lifted from the repository's
`examples/`, and the runtime type map that connects API
expressions to the Bukkit/Paper classes you already know from
Java plugin development.

The full builder list with emitted `.sk` forms is the
repository's `docs/reference.md`. This guide teaches the shape;
the reference settles details.

## Module shape

Every program is one TypeScript module exporting a `Script`
built with `script(...)` from top-level structures (event
handlers, command definitions, function definitions, periodical
triggers). In the repository, examples import from
`"../src/index.js"`; as a package consumer, import from
`"skript-ts"`.

```ts
import {
  script,
  onJoin,
  onFirstJoin,
  broadcast,
  send,
  give,
  set,
  player,
  fmt,
  variable,
  bool,
} from "skript-ts";
import type { Script } from "skript-ts";

export const welcomeScript: Script = script(
  onFirstJoin([
    broadcast(fmt("Welcome, ", player(), "!")),
    give(player(), "wooden sword", 1),
    set(variable("welcomed", player()), bool(true)),
  ]),
  onJoin([send(player(), fmt("Welcome back, ", player()))]),
);
```

(From `examples/welcome.ts`, which also shows non-English message
text working unchanged.)

Non-negotiable shape rules:

- Statement bodies are **arrays**, everywhere.
- Values are built with literal builders: `str(...)`, `num(...)`,
  `bool(...)`; messages with `fmt(...)` (expression interpolation
  without hand-managed `%...%` placeholders).
- One TS file emits one `.sk` file with the same relative path
  and name.

## Patterns

### Events and their values

Each event builder's body reads its values from dedicated
expressions: `player()` (where the event has one), `victim()`,
`attacker()`, `eventBlock()`, `eventItem()`, `clickedEntity()`,
and so on. Availability is per event — a damage event has **no**
`player()` (use `victim()` / `attacker()`); a death event's
subject is `victim()`.

Event filters are **literal type-name lists** in a trailing
options object — never expressions, because Skript's filtered
headers are literal:

```ts
onBlockBreak([...], { block: ["stone", "deepslate"] }),
onDamage([...], { victim: "player", attacker: "zombie" }),
```

### Variables

- `variable("name")` / `variable("name", indexExpr)` — globals
  (`{name}` / `{name::%index%}`), persisted by both runtimes.
- `listVar("name")` — a list variable (`{name::*}`); `listAdd`,
  `listRemove`, `listSize`, `deleteVar` operate on it.
- `localVar("name")` / `localList("name")` — function locals
  (`{_name}`), fresh frame per call.

Indices are identified by **string form** (the number 5 and the
text "5" are the same entry) and are case-insensitive.

### Control flow

- `ifElse(cond, then, else?)` — composite conditions (`and`,
  `or`, `not`) work here; the emitter lowers them to control
  flow because Skript has no textual conjunction.
- `loopList(list, body)`, `loopTimes(n, body)`,
  `loopRange(a, b, body)` — inside, `loopValue()` and (list
  loops only) `loopIndex()`.
- `whileLoop(cond, body)` — the head must be a **leaf** condition
  or `not(leaf)`.
- `wait(num(1), "seconds")` — continuation semantics: everything
  after it runs after the delay, in order.

### Custom functions

```ts
defineFunction("greet", [param("name", "text")], "text", [
  returnValue(fmt("Hello, ", localVar("name"), "!")),
]),
```

Call with `call("greet", arg)` in expression position or
`callStmt(...)` as a statement. Names are **case-sensitive**;
resolution is by signature; there are **no type conversions** —
a mismatched argument leaves the parameter unset and the body
still runs. See `examples/functions.ts` for overloads, plural
params (`"numbers"`), list returns (`"objects"`), and defaults.

### Commands

```ts
command("cpoke", [cmdArg("player"), cmdArg("integer", true)], [
  broadcast(fmt("cpoke target=", argument(1), " n=", argument(2))),
  send(argument(1), fmt("cpoke: poked by ", player())),
]),
```

`cmdArg(type, optional?)` declares typed arguments (`"text"`,
`"player"`, `"offlinePlayer"`, `"integer"`, `"number"`,
`"boolean"`, `"item"`); `argument(n)` reads them (1-based).
Parsing follows the original's Brigadier behavior — a bad value
fails the invocation before the body runs. Options (permission,
usage, aliases) ride a trailing options form; see
`examples/commands.ts`.

### Items, inventories, GUIs

Build stacks with `item("diamond sword")` and the meta
builders `withName` / `withLore` / `withAmount`; read back with
`nameOf` / `loreOf` / `amountOf`. Chest GUIs: `openGui(player,
rows, title)`, fill with `setSlot(currentInventoryOf(player),
slot, item)`, and guard with `onInventoryClick` /
`onInventoryClose` using `clickedSlotIndex()` /
`eventInventory()` / `cancelEvent()`. Full recipe in
`examples/gui.ts`.

## Runtime type map

The writing side is typed (literal names below are checked by
`tsc`; function and command types are string-literal unions),
while values coming back from the variable store stay dynamic by
design. To predict what an expression _holds_, map it to the
Bukkit class it wraps at runtime — the same hierarchy you know
from Paper plugin development:

| Expression                                                                                            | Runtime value (Bukkit)                                                           |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `player()`, `eventPlayer()`, `loopPlayer()`                                                           | `org.bukkit.entity.Player` (Entity → LivingEntity → Player)                      |
| `victim()`, `attacker()`, `clickedEntity()`, `eventEntity()`, `hookedEntity()`, `lastSpawnedEntity()` | `org.bukkit.entity.Entity` (may be absent — "no value")                          |
| `fishingHook()`                                                                                       | `org.bukkit.entity.FishHook` (an Entity, not a LivingEntity)                     |
| `droppedItemEntity()`                                                                                 | `org.bukkit.entity.Item`                                                         |
| `eventBlock()`, `blockAt(loc)`, `relativeBlock(...)`                                                  | `org.bukkit.block.Block`                                                         |
| `location(...)`, `locationOf(target)`                                                                 | `org.bukkit.Location`                                                            |
| `world(name)`, `worldOf(target)`                                                                      | `org.bukkit.World`                                                               |
| `eventItem()`, `item(name)`, `itemOfEntity(e)`, `slotItem(inv, n)`                                    | `org.bukkit.inventory.ItemStack`                                                 |
| `chestInventory(...)`, `currentInventoryOf(p)`, `eventInventory()`                                    | `org.bukkit.inventory.Inventory`                                                 |
| `bossBar(...)`, `eventBossBar()`                                                                      | `org.bukkit.boss.BossBar`                                                        |
| `keyedBossBar(...)`, `keyedBossBarOf(key)`                                                            | `org.bukkit.boss.KeyedBossBar`                                                   |
| `timespan(n, unit)`                                                                                   | a timespan value (integer milliseconds inside; no Bukkit counterpart)            |
| `damageAmount()`                                                                                      | number                                                                           |
| `damageCause()`, `typeOf(x)`, `chatMessage()`                                                         | text                                                                             |
| `argument(n)`, `loopValue()`, `loopIndex()`, `variable(...)`, `localVar(...)`                         | dynamic — depends on the command definition, the loop target, or what was stored |

Notes that matter when writing:

- "May be absent" is Skript's **no value**, not Java `null`:
  an absent value renders as `<none>` in messages, fails every
  equality (even against another absent value), and counts as 0
  in arithmetic when the other side is numeric.
- `victim()` is statically just an Entity even when the event's
  subject is usually a player — exactly as in Skript.
- Closed name sets are literal unions in the API and are checked
  at compile time: weather (3), game modes (4), boss bar colors
  (7) / styles (5) / flags (3), fishing states (8), relative
  directions (8), timespan units (8). Entity type names for
  `spawnEntity` are display-name strings ("zombie",
  "cave spider") validated against the registry at runtime, so
  a typo there surfaces at load/run time, not in `tsc`.

## Recipes

The repository's `examples/` are the recipe book — each file is
a complete program that doubles as a golden-test fixture:

| Want                                           | Read                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Join / first-join flow                         | `examples/welcome.ts`                                                        |
| Kit, spawn, simple commands                    | `examples/kit.ts`, `examples/spawn.ts`                                       |
| Typed commands (options, aliases, permissions) | `examples/commands.ts`                                                       |
| Lists, loops, while, wait                      | `examples/lists.ts`                                                          |
| Custom functions                               | `examples/functions.ts`                                                      |
| Comparisons / logic / arithmetic               | `examples/logic.ts`                                                          |
| Text operations and colors                     | `examples/text.ts`                                                           |
| Gameplay events and filters                    | `examples/gameplay.ts`, `examples/events2.ts`, `examples/events3.ts`         |
| Items and chest GUIs                           | `examples/gui.ts`                                                            |
| World operations, periodical triggers          | `examples/world.ts`                                                          |
| Player state (health, food, XP, potions)       | `examples/state.ts`                                                          |
| Titles, action bars, boss bars                 | `examples/display.ts`, `examples/bossbar.ts`                                 |
| Timespans                                      | `examples/timespan.ts`                                                       |
| HTTP requests and `env()` (engine builtins)    | `examples/http.ts`, `examples/env.ts`                                        |
| One sample per engine builtin                  | `examples/mundosk.ts`, `sharpsk.ts`, `skriptdb.ts`, `skutil.ts`, `ersatz.ts` |
