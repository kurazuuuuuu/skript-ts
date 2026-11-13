# Type map (layer 1)

The complete correspondence between builder expressions and
the Bukkit/Paper classes their values are at runtime — the
table that lets you transfer the Java API knowledge you
already have (the `Entity → LivingEntity → Player` hierarchy
and friends) to skript-ts. The writing guide's _Runtime type
map_ section is the summary; this file is the full per-builder
version, checked against `src/api.ts`, `src/ast.ts` and the
engine (`Engine.java`'s context, `Variables.java`).

## How the static side looks today

Almost every builder returns plain `Expr`; TypeScript does
**not** yet distinguish a player-valued expression from a
block-valued one statically. What `tsc` does check today:

- the closed name sets below (string-literal unions in
  `src/ast.ts`),
- narrowed argument types where the API declares them — e.g.
  `placeholderValue(player, text)` and `dbExecute(ds, query)`
  take `TextExpr` for their text argument. Note `TextExpr` is
  an AST-node extraction (string and format nodes only), not
  "any expression holding text",
- the variable family (`VariableExpr`, `ListExpr`,
  `LocalVariableExpr`, …) and the structural types `Cond`,
  `Stmt`, `TopLevel`.

So read the table as a **runtime** contract: it tells you what
an expression holds when the program runs (identically under
Skript and under the engine jar), which is what you need to
predict behavior — not what the compiler will catch.

## The correspondence

| Expression                                                                  | Runtime value (Bukkit)                                      | Notes                                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `player()`, `eventPlayer()`, `loopPlayer()`                                 | `org.bukkit.entity.Player` (Entity → LivingEntity → Player) |                                                                                                                               |
| `victim()`                                                                  | `org.bukkit.entity.Entity`                                  | The dead/damaged entity. A player victim is a `Player` at runtime, but statically it is just an Entity — exactly as in Skript |
| `attacker()`                                                                | `org.bukkit.entity.Entity`                                  | May be absent (no value)                                                                                                      |
| `clickedEntity()`                                                           | `org.bukkit.entity.Entity`                                  | May be absent                                                                                                                 |
| `eventEntity()`                                                             | `org.bukkit.entity.Entity`                                  | In fish-caught events this is an `org.bukkit.entity.Item`                                                                     |
| `hookedEntity()`                                                            | `org.bukkit.entity.Entity`                                  | Reads the same event slot as `eventEntity()`                                                                                  |
| `lastSpawnedEntity()`                                                       | `org.bukkit.entity.Entity`                                  | The entity the most recent `spawnEntity` created                                                                              |
| `fishingHook()`                                                             | `org.bukkit.entity.FishHook`                                | An Entity, **not** a LivingEntity                                                                                             |
| `droppedItemEntity()`                                                       | `org.bukkit.entity.Item`                                    | An Entity carrying an ItemStack                                                                                               |
| `eventBlock()`                                                              | `org.bukkit.block.Block`                                    | Absent on air clicks                                                                                                          |
| `blockAt(loc)`, `relativeBlock(target, dir)`                                | `org.bukkit.block.Block`                                    |                                                                                                                               |
| `locationOf(target)`, `location(x, y, z, world?)`                           | `org.bukkit.Location`                                       |                                                                                                                               |
| `world(name)`, `worldOf(target)`                                            | `org.bukkit.World`                                          |                                                                                                                               |
| `eventItem()`, `item(name)`, `slotItem(inv, slot)`                          | `org.bukkit.inventory.ItemStack`                            |                                                                                                                               |
| `itemOfEntity(e)`                                                           | `org.bukkit.inventory.ItemStack`                            | The stack an Item entity carries                                                                                              |
| `chestInventory(rows, title?)`, `currentInventoryOf(p)`, `eventInventory()` | `org.bukkit.inventory.Inventory`                            |                                                                                                                               |
| `bossBar(options)`, `eventBossBar()`                                        | `org.bukkit.boss.BossBar`                                   |                                                                                                                               |
| `keyedBossBar(key, options)`, `keyedBossBarOf(key)`                         | `org.bukkit.boss.KeyedBossBar`                              | A BossBar sub-interface                                                                                                       |
| `timespan(amount, unit)`                                                    | a timespan value                                            | Integer milliseconds inside; no Bukkit counterpart                                                                            |
| `now()`, `dateFromUnix(seconds)`                                            | a date value                                                | Epoch milliseconds inside; no Bukkit counterpart. `unixTimestamp(date)` reads it back as fractional epoch seconds             |
| `fishingState(name)`                                                        | a fishing-state literal                                     | One of the 8 `FishingStateName` values; a comparison value, not an object                                                     |
| `damageAmount()`                                                            | number                                                      |                                                                                                                               |
| `damageCause()`, `typeOf(x)`, `chatMessage()`                               | text                                                        | `typeOf` returns the Skript type name                                                                                         |
| `placeholderValue(p, text)`                                                 | text                                                        | Engine builtin. No value when PlaceholderAPI is not installed                                                                 |
| `placeholderIdentifier()`, `placeholderPrefix()`                            | text                                                        | Inside `onPlaceholderRequest` handlers                                                                                        |
| `env(name)`                                                                 | text                                                        | Engine builtin. No value when the variable is unset                                                                           |
| `httpId()`                                                                  | text                                                        | The request id, inside `onHttpResponse`                                                                                       |
| `httpStatus()`                                                              | number                                                      | No value when there was no response                                                                                           |
| `httpBody()`                                                                | text                                                        | Fetch responses only                                                                                                          |
| `httpError()`                                                               | text                                                        | No value on success                                                                                                           |
| `httpSavedPath()`                                                           | text                                                        | Downloads only                                                                                                                |
| `dbLastError()`                                                             | text                                                        | The last failed execution's message, or no value                                                                              |
| `argument(n)`                                                               | dynamic                                                     | Whatever the command definition's `CommandArgType` declares                                                                   |
| `loopValue()`                                                               | dynamic                                                     | The loop target's element type                                                                                                |
| `loopIndex()`                                                               | dynamic                                                     | Exists only in list loops, where it is a number or a text                                                                     |
| `variable(...)`, `localVar(...)` and the list forms                         | dynamic                                                     | Whatever was stored — see below                                                                                               |

## Absent values

"May be absent" above is Skript's **no value**, not Java
`null`: an absent value renders as `<none>` in messages, fails
every equality (even against another absent value), and counts
as 0 in arithmetic when the other side is numeric. Do not
model it as `null` or `undefined` when reasoning about a
program.

## Dynamic by design

Values that come back from the variable store, custom-function
return values, `argument(n)` and loop values carry no static
value type, on purpose (Skript compatibility). The engine
persists variables with type tags (`__location`, `__item`,
`__timespan`, `__date`, `__keyedbossbar` in `Variables.java`) and
restores the Java type at runtime — but on the TypeScript side
a variable expression does not know what it holds. A function
call whose argument type mismatches the declared parameter
type is likewise not an error in the original's semantics: the
parameter is simply left unset and the body still runs. Typing
never narrows what the runtimes accept.

## Closed name sets

These name sets are string-literal unions in the API, so a
typo in a directly-written literal is a compile error:

| Union (`src/ast.ts`) | Values | Used for            | Bukkit / Skript counterpart                                                                       |
| -------------------- | ------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `WeatherName`        | 3      | weather             | Skript's weather type (no direct Bukkit enum)                                                     |
| `GameModeName`       | 4      | game modes          | `org.bukkit.GameMode`                                                                             |
| `BossBarColorName`   | 7      | boss bar color      | `org.bukkit.boss.BarColor`                                                                        |
| `BossBarStyleName`   | 5      | boss bar style      | `org.bukkit.boss.BarStyle`                                                                        |
| `BossBarFlagName`    | 3      | boss bar flags      | `org.bukkit.boss.BarFlag` (API literals are camelCase: `darkenSky`, `createFog`, `playBossMusic`) |
| `FishingStateName`   | 8      | fishing states      | `PlayerFishEvent.State` equivalent                                                                |
| `RelativeDirection`  | 8      | relative directions | Skript's direction type; `front` / `behind` are facing-relative, not `BlockFace` values           |
| `TimeUnit`           | 3      | wait durations      | —                                                                                                 |
| `TimespanUnit`       | 8      | timespan units      | — (TimeUnit plus hours/days/weeks/months/years)                                                   |

The unions only guard values written as literals. Names that
arrive through a variable are plain `string` to the compiler,
and several name parameters are string-based today —
`item(name)`, event-filter type names, `spawnEntity`'s type,
`playSound`'s sound name — so a typo there surfaces at load or
run time, not in `tsc`.

## Entity type names

`spawnEntity(entityType, at, count?)` takes the **Skript
display name** ("zombie", "cave spider"), not the Bukkit
`EntityType` enum name. The builder normalizes what you pass
(trim, lowercase, underscores become spaces) and validates the
shape before it reaches the AST; which names actually exist
is resolved against the server's registry at runtime. Keep
the two namespaces apart in your head: `typeOf(x)` and event
filters also speak display names, while your Java knowledge
speaks enum names — the correspondence is by entity, not by
spelling.

## Function and command type names

Custom functions declare parameter/return types from
`FunctionTypeName`: `number(s)`, `text(s)`, `boolean(s)`,
`player(s)`, `location(s)`, `object(s)`, `block`, `item`,
`entity`, `timespan(s)`, `date(s)` — the singular/plural pairs mirror the
runtime classes in the table above (`player` ↔ a `Player`
value, and so on). Command arguments use `CommandArgType`:
`text`, `player`, `offlinePlayer`, `integer`, `number`,
`boolean`, `item`. `offlinePlayer` has no expression-side
counterpart in the table: an offline player is not an
`org.bukkit.entity.Player` (it may not be online at all).

## Staged typing: where this goes next

The recorded direction (decided 2026-11-11) is to type the
API in stages, starting where a value's origin is statically
known — event values and construction results — while the
dynamic boundaries above stay loose:

- **Level 0 (today):** plain `Expr` returns plus the literal
  unions; `tsc` strict is the gate.
- **Level 1:** brand the expressions whose origin is static
  (this table's rows) so their value class is visible in the
  type; statement arguments stay `Expr`.
- **Level 2:** narrow selected statement/expression arguments
  (e.g. a health setter's target to LivingEntity-valued
  expressions), one construct at a time and only where a probe
  confirms the original accepts nothing wider.
- **Level 3:** tie `FunctionTypeName` / `CommandArgType` to
  the brands at function and command boundaries.

The brand type names for levels 1+ (such as a hypothetical
`PlayerExpr`) are **not in the API yet** — do not write code
against them. When they land, this file's table is where their
correspondence will be recorded.
