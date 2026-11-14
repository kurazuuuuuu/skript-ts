/** Represents a Skript expression value. */
export type Expr =
  | { kind: "player" }
  | { kind: "eventPlayer" }
  | { kind: "loopPlayer" }
  | { kind: "victim" }
  | { kind: "argument"; index: number }
  | { kind: "chatMessage" }
  | { kind: "variable"; name: string; index?: Expr }
  // Core-language list support (phase 12): the whole list {name::*}
  // as a value (its entries in iteration order), and its size.
  | { kind: "variableList"; name: string }
  | { kind: "listSize"; list: Expr }
  // Loop expressions (phase 12): the element a list loop is
  // visiting (in times/range loops, the current number; in player
  // loops, the player), and the index of a list loop (a number or
  // a text). loopIndex has no value outside list loops — Skript
  // rejects it there at parse time.
  | { kind: "loopValue" }
  | { kind: "loopIndex" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "item"; name: string }
  | { kind: "locationOf"; target: Expr }
  | { kind: "format"; parts: readonly (string | Expr)[] }
  // Engine-builtin expressions (MundoSK slice, phase 6). These have no
  // .sk equivalent: scripts using them are engine-only (see ir.ts).
  | { kind: "wsMessage" }
  | { kind: "wsId" }
  | { kind: "worldOf"; target: Expr }
  | { kind: "borderSize"; world: Expr }
  | { kind: "borderCenter"; world: Expr }
  // Engine-builtin expressions (SharpSK slice, phase 7): timers.
  | { kind: "timerId" }
  | { kind: "timerTimeLeft"; name: Expr }
  // Engine-builtin expressions (skript-db slice, phase 8): a data
  // source value parsed from a documented URL (sqlite:<path>,
  // mysql://..., mariadb://..., postgresql://...), and the message
  // of the last failed database execution.
  | { kind: "dataSource"; url: TextExpr }
  | { kind: "dbLastError" }
  // Engine-builtin expressions (external connectors, phase 26): the
  // payload of an HTTP completion event, and a JVM-start environment
  // variable resolved by the engine (an unset variable is no value).
  | { kind: "httpId" }
  | { kind: "httpStatus" }
  | { kind: "httpBody" }
  | { kind: "httpError" }
  | { kind: "httpSavedPath" }
  | { kind: "envVar"; name: TextExpr }
  // Engine-builtin expressions (Cloudflare, M4 CF-1): the payload
  // of a Cloudflare completion event. cfError is the error kind
  // text (the HTTP set plus auth/notfound/quota/api); the detail
  // stays in the server log, and a success has no cfError value.
  | { kind: "cfId" }
  | { kind: "cfError" }
  // Engine-builtin expressions (skUtilities slice, phase 9): reads
  // from text files under the engine's files root. All three yield
  // no value when the file is missing.
  | { kind: "fileContents"; path: TextExpr }
  | { kind: "fileLine"; path: TextExpr; line: Expr }
  | { kind: "fileLineCount"; path: TextExpr }
  // Engine-builtin expressions (Ersatz slice, phase 10):
  // placeholderValue evaluates PlaceholderAPI placeholders in a
  // text for a player (a text without %...% is a single placeholder
  // name). placeholderIdentifier / placeholderPrefix expose the
  // parts of the request inside placeholder-request events.
  | { kind: "placeholderValue"; player: Expr; text: TextExpr }
  | { kind: "placeholderIdentifier" }
  | { kind: "placeholderPrefix" }
  // Core-language arithmetic (phase 11): a binary operation over two
  // expressions. "+" also concatenates when both operands are texts;
  // "mod" is the mathematical remainder (Skript's mod() function).
  | { kind: "arith"; op: ArithOp; left: Expr; right: Expr }
  // Core-language randomness (phase 28): a fresh draw on every
  // evaluation — the original has no seed and no reproducibility,
  // and neither does the engine. randomNumber yields a real number
  // between the bounds; randomInteger yields a whole number.
  // Semantics were probed against the real Skript 2.17.1 (see
  // docs/reference.md): reversed bounds are swapped, the integer
  // draw fits fractional bounds inward (ceil / floor — see the
  // engine's randomBetween), and a missing or non-number bound
  // yields no value.
  | { kind: "randomNumber"; min: Expr; max: Expr }
  | { kind: "randomInteger"; min: Expr; max: Expr }
  // Core-language math functions (phase 29): Skript's built-in
  // numeric functions as one variadic node. floor / ceil / abs /
  // sqrt carry exactly one argument, round one or two (the value
  // and an optional decimal-places count), min / max one or more.
  // The semantics — including round's places rules and the
  // no-value treatment of missing or non-number operands — were
  // pinned by probes against the real Skript 2.17.1 and are
  // written up in docs/reference.md.
  | { kind: "math"; fn: MathFn; args: readonly Expr[] }
  // Core-language local variables (phase 13): {_name} / {_name::%i%}
  // and the whole local list {_name::*}. Locals live in the current
  // trigger's frame — every event/command body has one, and every
  // function call gets a fresh one (function parameters ARE locals,
  // bound by name). Verified against the real Skript 2.17.1: frames
  // are isolated in both directions and fresh on every call.
  | { kind: "localVariable"; name: string; index?: Expr }
  | { kind: "localVariableList"; name: string }
  // Core-language function call (phase 13): invoke a function made
  // with defineFunction and use its return value. Skript resolves
  // calls by signature at parse time; the engine resolves by the
  // runtime types of the argument values (see README).
  | { kind: "functionCall"; name: string; args: readonly Expr[] }
  // Core-language gameplay event values (phase 14): the block an
  // event is about (break / place / click on a block; no value for
  // clicks into air), the item an event involves (the item in hand
  // for click, the item being placed for place, the broken block
  // in item form for break), the
  // attacker of a damage event (no value unless an entity caused
  // the damage), the damage amount (current — it reflects earlier
  // setDamage writes in the same handler), and the damage cause
  // as a text ("entity attack", "fall", ...). typeOf yields the
  // Skript type name of any value ("grass block", "dirt",
  // "player", "number", ...), or no value for a missing value.
  | { kind: "eventBlock" }
  | { kind: "eventItem" }
  | { kind: "attacker" }
  | { kind: "damageAmount" }
  | { kind: "damageCause" }
  | { kind: "typeOf"; target: Expr }
  // Core-language event value (phase 16): the entity a right
  // click interacted with. No value for block or air clicks.
  | { kind: "clickedEntity" }
  // Core-language generalized event values (phase 22). All
  // semantics were probed against the real Skript 2.17.1 in the
  // sandbox (see the development log for the probe rounds):
  //
  // - eventEntity is Skript's generic event-entity: the entity
  //   an entity pickup / entity drop is about (the picker /
  //   dropper), the caught entity of an entity-hooked fishing
  //   event, and the caught Item entity of a fish-caught event
  //   (whose type name is "dropped item"). Death has NO
  //   event-entity in the original (a parse error there) — use
  //   victim() — and neither does damage.
  // - hookedEntity is the entity a fishing hook caught, inside
  //   entity-hooked events; the engine reads it from the same
  //   slot as eventEntity.
  // - fishingHook is the hook (bobber) entity of a fishing
  //   event; its type name is "fish hook".
  // - eventFishingState is the fishing event's state value,
  //   printed as its Skript name ("fishing line cast", "lured",
  //   "bite", "fish caught", "entity caught", "bobber in
  //   ground", "fish escape", "reel in"). fishingState is a
  //   state literal (emitted BARE, like weatherType / gameModeType):
  //   the value eventFishingState compares against.
  // - droppedItemEntity is the Item entity of an entity drop
  //   or a fish catch (`event-dropped item`); itemOfEntity
  //   reads the item stack an Item entity carries (`item of
  //   %entity%` — how a script learns WHAT was caught or
  //   dropped; there is no event-item in fishing events).
  | { kind: "eventEntity" }
  | { kind: "hookedEntity" }
  | { kind: "fishingHook" }
  | { kind: "eventFishingState" }
  | { kind: "fishingState"; name: FishingStateName }
  | { kind: "droppedItemEntity" }
  | { kind: "itemOfEntity"; target: Expr }
  // A timespan is a duration stored as whole milliseconds. Literals
  // quantize by rounding to the nearest millisecond (0.0015 seconds is
  // 2 ms); months are 30 days and years 365 days (the original's fixed
  // lengths). Timespan arithmetic and comparisons ride the existing
  // arith / comparison nodes; their rules live with the engine's
  // evalArith. A missing operand counts as zero of the partner's kind
  // (for multiplication, as the number 0). The fishing wait-time /
  // bite-time expressions read the current fishing event's hook
  // (timespans); the approach-angle expressions read plain numbers
  // (degrees). All three are event values like fishingHook: no value
  // outside fishing events.
  | { kind: "timespan"; amount: number; unit: TimespanUnit }
  // Dates and the current time (feedback C3): a date is an
  // instant in time (epoch milliseconds in the engine). now is
  // the moment the expression evaluates; unixTimestamp reads a
  // date as whole seconds since the epoch; dateFromUnix builds
  // a date back from those seconds; difference yields the
  // absolute gap between two dates as a timespan (and, like the
  // original, the numeric / timespan differences of its other
  // operand pairings). Date arithmetic (+/- a timespan) rides
  // the phase-11 arith nodes. All semantics were probed against
  // the real Skript 2.17.1 (see the reference's dates section).
  | { kind: "now" }
  | { kind: "unixTimestamp"; date: Expr }
  | { kind: "dateFromUnix"; seconds: Expr }
  | { kind: "difference"; left: Expr; right: Expr }
  | { kind: "fishingWaitTime"; bound: "min" | "max" }
  | { kind: "fishingBiteTime" }
  | { kind: "fishingApproachAngle"; bound: "min" | "max" }
  // Core-language text operations (phase 15). All semantics were
  // probed against the real Skript 2.17.1 in the sandbox (see the
  // development log for the probe rounds):
  //
  // - textLength counts UTF-16 code units (an emoji counts 2);
  //   a missing text yields no value, an empty text has length 0.
  // - substring is 1-based and inclusive at both ends; `from` is
  //   fitted UP to 1 and `to` DOWN to the length, and when the
  //   fitted from exceeds the fitted to the result is no value
  //   (never an empty text, never swapped). firstChars / lastChars
  //   are the same rule with the other end pinned to the text's
  //   edge, so a count of 0 or less yields no value. charAt is
  //   strict instead: an index outside 1..length yields no value,
  //   and the result is a single UTF-16 code unit.
  // - upperCase / lowerCase convert case; a missing text yields
  //   no value. The single-text operations above map element-wise
  //   over a list target, like Skript's plural %texts% forms.
  // - splitText yields a LIST of texts: delimiter matching is
  //   literal (never a regex) and case-insensitive unless
  //   caseSensitive; the trailing empty part is kept, a text
  //   without the delimiter is one part, an empty text is one
  //   empty part, and an empty delimiter yields one part per
  //   character plus a trailing empty part. A missing text yields
  //   no values. The result composes with the list machinery, and
  //   `loop <split>` works but has NO loop-index (probed).
  // - joinText concatenates a list's TEXT elements (players count
  //   as their name); numbers and other non-text elements are
  //   skipped — Skript does not convert them here (probed: joining
  //   (1, "x") yields "x"). An empty or all-non-text source yields
  //   no value; the default delimiter is "".
  // - coloredText / formattedText parse & codes (including the
  //   &x hex sequence) and the named MiniMessage-style tags
  //   Skript accepts into real formatting; unknown tags, stray
  //   closing tags and the &#RRGGBB form stay literal (probed).
  //   uncoloredText / unformattedText strip ALL formatting codes
  //   (colors and styles alike — probed). Engine values are
  //   legacy-coded strings, so parsed formatting is carried as §
  //   codes; plain-text behavior and the formatting a player sees
  //   match Skript's component model.
  | { kind: "textLength"; target: Expr }
  | { kind: "substring"; target: Expr; from: Expr; to: Expr }
  | { kind: "firstChars"; target: Expr; count: Expr }
  | { kind: "lastChars"; target: Expr; count: Expr }
  | { kind: "charAt"; target: Expr; index: Expr }
  | { kind: "upperCase"; target: Expr }
  | { kind: "lowerCase"; target: Expr }
  | { kind: "splitText"; target: Expr; delimiter: Expr; caseSensitive: boolean }
  | { kind: "joinText"; source: Expr; delimiter: Expr | null }
  | { kind: "coloredText"; target: Expr }
  | { kind: "formattedText"; target: Expr }
  | { kind: "uncoloredText"; target: Expr }
  | { kind: "unformattedText"; target: Expr }
  // Core-language items, inventories and GUIs (phase 17). All
  // semantics were probed against the real Skript 2.17.1 in the
  // sandbox (see the development log for the probe rounds):
  //
  // - Item construction composes suffixes over any item-valued
  //   expression: `<base> named <text>`, `<base> with lore <a> and
  //   <b>`, `<count> of <base>`. The wrappers materialize a real
  //   item stack: a bare item name becomes a fresh stack, a stack
  //   is cloned and re-meta'd. `type of` a meta'd stack is still
  //   its material. Stack-vs-stack equality (phase 11 rules) is
  //   type + amount, PLUS meta fields — but a field only counts
  //   when BOTH stacks carry it: a named stack equals a plain one,
  //   two differently named stacks differ, name comparison is
  //   case-SENSITIVE, and lore compares line by line. A stack
  //   prints as its type name (pluralized with its amount when
  //   above 1: "3 diamond swords") plus " named <name>" when it
  //   has a custom name; lore never prints.
  // - nameOf reads the custom name of an item (no value when the
  //   item is unnamed), the title of an inventory, or the name of
  //   a player. loreOf reads an item's lore lines as a list (no
  //   value when the item has no lore). amountOf reads a stack's
  //   size (and, like Skript's generic amount expression, a list's
  //   size).
  // - chestInventory is a fresh virtual chest inventory value
  //   (`chest inventory with <rows> rows [named <title>]`); it
  //   exists independently of any player until opened, and slots
  //   can be filled before or after opening. currentInventory is
  //   the inventory a player is currently viewing (their chest
  //   GUI while one is open; with nothing open it is their own
  //   crafting inventory, as in Skript). eventInventory is the
  //   top inventory of an inventory click / close event.
  // - slotItem reads the item in a slot of an inventory value (a
  //   player target means their own inventory); an empty slot has
  //   no value. Slot indices are 0-based within the inventory.
  // - clickedSlotIndex / clickedRawSlotIndex are the inventory
  //   click event's slot coordinates: the index within the
  //   inventory that was clicked (the player's own inventory
  //   counts from its top-left when the bottom half is clicked),
  //   and the raw index within the whole view (top inventory
  //   first) — Skript's `index of event-slot` and `raw index of
  //   event-slot`.
  // - toolOf / offHandToolOf read the item in a player's MAIN /
  //   OFF hand (`tool of %player%` / `offhand tool of %player%`,
  //   Skript's player-tool expressions). They are NOT event
  //   values — they read the live hand in any context that has a
  //   player (in a block break the main hand is the digging tool,
  //   where event-item is the broken block in item form instead).
  //   An empty hand reads as the AIR item here, NOT as no value
  //   (probed on the real Skript: both hands report "0 airs",
  //   type "air") — the deliberate contrast with event-item,
  //   whose empty hand is absent. Only a non-player target has
  //   no value.
  | { kind: "itemWithName"; base: Expr; name: Expr }
  | { kind: "itemWithLore"; base: Expr; lines: readonly Expr[] }
  | { kind: "itemWithAmount"; base: Expr; amount: Expr }
  // Resource pack custom items (RP-2). customItem starts
  // UNRESOLVED: only `ref` (the pack item's id as written, or the
  // ItemDef's id) is set by the builder. The project build resolves
  // it against the project's pack (src/resolve.ts) and fills `id`
  // (the resolved item id = the item_model component value),
  // `baseItem`, `customModelData` (the registry number) and
  // `displayName` before emit/IR; emit and the engine refuse an
  // unresolved node. itemModelOf / customModelDataOf read the two
  // components back off any item value (no value / 0 when unset,
  // matching the probed Skript 2.17.1 forms).
  | {
      kind: "customItem";
      ref: string;
      id?: string;
      baseItem?: string;
      customModelData?: number;
      displayName?: string;
    }
  | { kind: "itemModelOf"; target: Expr }
  | { kind: "customModelDataOf"; target: Expr }
  | { kind: "nameOf"; target: Expr }
  // Hidden item tags (feedback D): ENGINE-ONLY. Skript has no
  // PersistentDataContainer access, so there is no .sk form.
  // itemTag reads the tag stored under `key` in the item's
  // PersistentDataContainer (namespaced by the engine with the
  // plugin's own NamespacedKey): a text, number or boolean value,
  // or no value when the item carries no such tag (or is not an
  // item at all). Keys are validated at build time by the API:
  // lowercase [a-z0-9._-] only.
  | { kind: "itemTag"; item: Expr; key: string }
  | { kind: "loreOf"; target: Expr }
  | { kind: "amountOf"; target: Expr }
  // Inventory operations (feedback lane D, 2026-11-13), semantics
  // probed against the real Skript 2.17.1 (probe rounds recorded
  // in the lane's probe notes):
  // - itemCountIn counts the stacks in a target inventory whose
  //   type equals the item pattern's type AND whose meta matches
  //   the pattern directionally (metaCompatible: fields the
  //   pattern specifies must match exactly, unspecified fields
  //   are free). A player target reads the player's whole
  //   inventory INCLUDING armor and the offhand; an inventory
  //   value target reads that inventory. The pattern's own amount
  //   is ignored (the count is of matching stacks' amounts).
  //   Skript form: `amount of <item> in <target>`.
  // - freeSpaceFor is ENGINE-ONLY: the original has no expression
  //   for it (every free-space / empty-slot amount form failed to
  //   parse). It returns how many more of the pattern fit into
  //   the target's STORAGE slots: an empty slot contributes the
  //   pattern material's max stack size, a slot holding a stack
  //   exactly similar to the pattern (Bukkit isSimilar — meta
  //   must match BOTH ways, unlike the directional counting
  //   match) contributes the room left in that stack, anything
  //   else contributes 0. Armor and the offhand never count.
  | { kind: "itemCountIn"; target: Expr; item: Expr }
  | { kind: "freeSpaceFor"; target: Expr; item: Expr }
  | { kind: "toolOf"; target: Expr }
  | { kind: "offHandToolOf"; target: Expr }
  | { kind: "chestInventory"; rows: Expr; title?: Expr }
  | { kind: "currentInventory"; target: Expr }
  | { kind: "eventInventory" }
  | { kind: "slotItem"; inventory: Expr; slot: Expr }
  | { kind: "clickedSlotIndex" }
  | { kind: "clickedRawSlotIndex" }
  // Phase 28: drag slots and enchantment expressions.
  //
  // Drag events expose the affected slots as slot values
  // (`event-slots`). `index of` a slot counts within the
  // inventory the slot belongs to (the player's bottom inventory
  // uses player-inventory numbering). The original exposes no
  // raw view index and no owning inventory for drag slots, and
  // the `event-slots` list order is unspecified.
  //
  // Enchantment expressions mirror the original item-literal
  // suffix: the with-enchantment form exists only in item type
  // literals, and levels are literal integers there and in the
  // enchant effect.
  | { kind: "draggedSlots" }
  | { kind: "slotIndexOf"; target: Expr }
  | { kind: "clickedClickType" }
  | { kind: "eventCursor" }
  | { kind: "itemWithEnchantment"; base: Expr; enchant: string; level: number }
  | { kind: "enchantmentLevelOf"; target: Expr; enchant: string }
  | { kind: "enchantmentsOf"; target: Expr }
  // Core-language world operations (phase 18). All semantics were
  // probed against the real Skript 2.17.1 in the sandbox (see the
  // development log for the probe rounds):
  //
  // - blockAt reads the block at a location (`block at %location%`).
  //   A block prints as '<type>' at <cx>, <cy>, <cz> in world
  //   '<name>' with CENTER coordinates, and locationOf a block is
  //   its center location — the engine mirrors both.
  // - locationAt is Skript's location() function: three arguments
  //   use the server's main world, four take a world expression.
  //   A location prints as "x: <x>, y: <y>, z: <z>, yaw: <yaw>,
  //   pitch: <pitch> in '<world>'".
  // - xOf / yOf / zOf read a location's coordinates
  //   (`x-coordinate of %location%`; the short `x of` form parses
  //   too, the emitter uses the long form).
  // - offsetLoc shifts a location by a vector
  //   (`%location% ~ vector(<x>, <y>, <z>)`); the components are
  //   expressions.
  // - relativeBlock is the block in a direction from a block or
  //   location (`block [n] above %block%`, `block in front of
  //   %location%`). front / behind follow the target location's
  //   facing direction (a block's location faces south, yaw 0 —
  //   probed); the cardinals and above / below are absolute.
  // - world is `world "<name>"` (no value for an unknown name);
  //   worldOf (promoted from the phase-6 engine builtins to the
  //   core — `world of %player/location/block%` is plain Skript)
  //   reads a value's world.
  // - worldTime is the world's clock (`time in %world%`): a Time
  //   value whose text form is "H:MM" (hour unpadded, minutes
  //   two digits; 0 ticks reads 6:00, 6000 reads 12:00). The
  //   engine carries the value as that text, so prints and
  //   equality against clockTime agree in both runtimes; time
  //   ARITHMETIC is not part of the subset. clockTime is a clock
  //   literal (`13:00` in the .sk text), stored canonicalized.
  // - worldWeather is the world's weather (`weather in %world%`),
  //   carried as its name text ("clear" / "rain" / "thunder");
  //   weatherType is a weather literal, emitted BARE (`rain`) —
  //   the quoted text form parses but never compares equal, and
  //   setting weather from a plain text silently does nothing in
  //   the original (all probed).
  //
  // One original-side quirk applies to this whole family (and to
  // typeOf over variables): Skript 2.17.1 does not parse these
  // composite expressions inside string interpolations — they are
  // value-position constructs there, so samples assign them to a
  // variable first and interpolate the variable. The engine has
  // no such restriction.
  | { kind: "blockAt"; location: Expr }
  | { kind: "locationAt"; x: Expr; y: Expr; z: Expr; world?: Expr }
  | { kind: "xOf"; target: Expr }
  | { kind: "yOf"; target: Expr }
  | { kind: "zOf"; target: Expr }
  | { kind: "offsetLoc"; location: Expr; dx: Expr; dy: Expr; dz: Expr }
  | { kind: "relativeBlock"; target: Expr; direction: RelativeDirection; amount: Expr }
  | { kind: "world"; name: string }
  | { kind: "worldTime"; world: Expr }
  | { kind: "clockTime"; text: string }
  | { kind: "worldWeather"; world: Expr }
  | { kind: "weatherType"; name: WeatherName }
  // World paint values (engine-only). A shape is a set of block
  // positions derived from locations; a fill decides which
  // material each position gets. Both are runtime-only values
  // (like data sources): they live in the engine as objects and
  // are never persisted. There is no .sk form on purpose — the
  // paint operation is a single bulk write in the engine (not a
  // per-block statement sequence) and the seeded noise / mix
  // selection is defined as a pure function of (seed, position),
  // which Skript text cannot reproduce; the emitter throws on
  // these kinds and scripts using them deploy as IR only.
  //
  // - cuboidShape is every block between two corner locations
  //   (inclusive, either corner order).
  // - sphereShape is every block whose integer offset from the
  //   center block satisfies dx²+dy²+dz² ≤ radius².
  // - cylinderShape is the vertical cylinder over the center
  //   block: dx²+dz² ≤ radius², from the center's Y up `height`
  //   layers (height is a layer count, at least 1).
  // - lineShape is the blocks on the segment between two
  //   locations, stepped along the dominant axis.
  // - uniformFill paints one item's material everywhere.
  // - mixFill picks per position by cumulative weight, using the
  //   seeded position hash — the same (seed, position) always
  //   picks the same material, so a repaint is reproducible.
  // - noiseFill picks the spot material where a seeded 3D value
  //   noise (trilinear over a lattice of `scale`-block cells)
  //   reaches 1 - amount, and the base material elsewhere.
  | { kind: "cuboidShape"; from: Expr; to: Expr }
  | { kind: "sphereShape"; center: Expr; radius: Expr }
  | { kind: "cylinderShape"; center: Expr; radius: Expr; height: Expr }
  | { kind: "lineShape"; from: Expr; to: Expr }
  | { kind: "uniformFill"; item: Expr }
  | { kind: "mixFill"; entries: readonly { item: Expr; weight: number }[]; seed: number }
  | { kind: "noiseFill"; base: Expr; spot: Expr; scale: number; amount: number; seed: number }
  // Core-language player / entity state (phase 19). All semantics
  // were probed against the real Skript 2.17.1 in the sandbox (see
  // the development log for the probe rounds):
  //
  // - healthOf / maxHealthOf are in HEARTS (half the Bukkit hit
  //   points): a full-health player reads 10, a zombie reads 10,
  //   and fractional hearts are exact (6.3 hearts is 12.6 HP).
  //   foodLevelOf is in drumsticks (half the food points) and
  //   saturationOf is NOT scaled (it reads the raw saturation).
  //   All four work on any living entity that has them (health
  //   and max health are entity-general; food and saturation are
  //   player-only and yield no value elsewhere).
  // - gameModeOf reads a player's game mode as its bare name
  //   text ("survival", ...). gameModeType is a game mode
  //   literal, emitted BARE (`creative`) — the original compares
  //   game modes against the bare literal only: a quoted text
  //   comparison is a parse error there, and setting the mode
  //   from a plain text silently does nothing (all probed; the
  //   same pattern as phase 18's weather).
  // - experienceOf is a player's TOTAL experience points,
  //   computed from level + progress (probed: after setting the
  //   level alone, the total reads as the cumulative total for
  //   that level plus the preserved progress share). levelOf is
  //   the experience level itself.
  // - lastSpawnedEntity is the entity the most recent spawn (by
  //   any script) created (`last spawned entity`); no value
  //   before the first spawn.
  | { kind: "healthOf"; target: Expr }
  | { kind: "maxHealthOf"; target: Expr }
  | { kind: "foodLevelOf"; target: Expr }
  | { kind: "saturationOf"; target: Expr }
  | { kind: "gameModeOf"; target: Expr }
  | { kind: "gameModeType"; name: GameModeName }
  | { kind: "experienceOf"; target: Expr }
  | { kind: "levelOf"; target: Expr }
  | { kind: "lastSpawnedEntity" }
  // Core-language boss bars (phase 21). Boss bars are core
  // Skript since 2.16; all semantics were probed against the
  // real Skript 2.17.1 in the sandbox (raw boss_bar packets;
  // see the development log):
  //
  // - bossBar creates a bar value (`a boss bar`, `a red boss
  //   bar`, `a bossbar with title %text%`, and the color+title
  //   combination `a <color> bossbar with title %text%` all
  //   parse and run). A fresh bar has an empty title, progress
  //   1, color white and a solid style (the add-viewer packet
  //   showed health 1, color 6 = white, dividers 0). Keyed
  //   bars, styles, flags and the section creation form were
  //   deferred in this phase and are covered in phase 24
  //   (keyedBossBar and friends below).
  // - bossBarTitleOf / bossBarProgressOf read the properties
  //   (`title of %bossbar%`, `progress of %bossbar%`); a fresh
  //   bar reads back its title text and progress 1.
  // - A bar is a runtime-only value: storing one in a
  //   PERSISTENT variable is a load error in the original
  //   ("a boss bar cannot be saved. That is, the contents of
  //   the variable will be lost when the server stops"), so
  //   bars belong in locals / function frames. The engine
  //   keeps the value in memory and drops it on save (the
  //   Variables encoder), which reproduces the "lost when
  //   the server stops" half but not the load error itself —
  //   a documented divergence.
  | { kind: "bossBar"; title?: Expr; color?: BossBarColorName }
  | { kind: "bossBarTitleOf"; bar: Expr }
  | { kind: "bossBarProgressOf"; bar: Expr }
  // Keyed boss bars, styles, flags and the section creation form
  // (phase 24), all probed against the real Skript 2.17.1:
  //
  // - keyedBossBar creates a keyed bar (`a keyed boss bar with
  //   key %text%`, color and `with title %text%` clauses probed).
  //   Evaluating the create REPLACES any bar stored under the key
  //   with a fresh one (title "", progress 0 — the vanilla
  //   custom-bossbar default, NOT the plain bar's 1). The value's
  //   property writes reach the stored bar while it is the
  //   registered one; a later create under the same key resets it.
  //   Keyed bars persist in server storage across restarts (title
  //   probed surviving; progress does NOT survive — the vanilla
  //   custom-bossbar storage saves name/color/style/flags but not
  //   the value, so a fetched bar reads progress 0 after a
  //   restart) and CAN be stored in persistent variables.
  // - keyedBossBarOf fetches by key (`boss bar with key %text%`);
  //   a missing key yields no value and never creates a bar, and
  //   property writes through a missing fetch do not create one.
  // - Keys are full namespaced keys: the text is split at the
  //   first ':' (a bare key lives in the `minecraft:` namespace),
  //   lowercase letters/digits and `.` `_` `-` in both parts plus
  //   `/` in the key part. An invalid key is a runtime script
  //   error in the original and the expression yields nothing.
  // - bossBarKeyOf reads a keyed bar's full `namespace:key` text
  //   (`boss bar key of %bar%`); a plain bar's key is not set.
  // - bossBarStyleOf reads `style of %bar%` as text: "solid" or
  //   "N segments" (the original's read spellings, probed).
  // - eventBossBar is the section body's bar (`event-bossbar`),
  //   only meaningful inside a createBossBarSection body; the
  //   enclosing event's player is NOT visible inside the section
  //   in the original (it errors), matching how the section is a
  //   create-bossbar event of its own.
  | { kind: "keyedBossBar"; key: Expr; title?: Expr; color?: BossBarColorName }
  | { kind: "keyedBossBarOf"; key: Expr }
  | { kind: "bossBarKeyOf"; bar: Expr }
  | { kind: "bossBarStyleOf"; bar: Expr }
  | { kind: "eventBossBar" };

/** Represents a binary arithmetic operator. */
export type ArithOp = "+" | "-" | "*" | "/" | "mod";

/** Represents a built-in math function name. */
export type MathFn = "floor" | "ceil" | "round" | "abs" | "sqrt" | "min" | "max";

/** Represents a Skript text expression. */
export type TextExpr = Extract<Expr, { kind: "string" } | { kind: "format" }>;

/** Represents a Skript condition. */
export type Cond =
  | { kind: "hasPermission"; target: Expr; permission: string }
  | { kind: "isOp"; target: Expr }
  // Core-language comparisons and logic (phase 11). The comparison
  // kinds mirror Skript's compare condition: text equality is
  // case-insensitive, values of different types are never equal,
  // and only numbers can be ordered. and/or are binary (the API
  // folds longer chains); not wraps any condition.
  | { kind: "equals"; left: Expr; right: Expr }
  | { kind: "notEquals"; left: Expr; right: Expr }
  | { kind: "greaterThan"; left: Expr; right: Expr }
  | { kind: "greaterOrEqual"; left: Expr; right: Expr }
  | { kind: "lessThan"; left: Expr; right: Expr }
  | { kind: "lessOrEqual"; left: Expr; right: Expr }
  | { kind: "and"; left: Cond; right: Cond }
  | { kind: "or"; left: Cond; right: Cond }
  | { kind: "not"; cond: Cond }
  // Core-language text conditions (phase 15), probed against the
  // real Skript 2.17.1: `contains` on texts is a case-INSENSITIVE
  // substring test (an empty part is always contained), while
  // startsWith / endsWith are case-SENSITIVE. On a list container,
  // contains is element membership under the phase-11 equality
  // rules. A missing operand makes every form false. All three
  // have native negated .sk forms ("does not contain", "does not
  // start with", "does not end with"), so they are leaf conditions
  // usable in while heads too.
  | { kind: "contains"; container: Expr; item: Expr }
  | { kind: "startsWith"; target: Expr; prefix: Expr }
  | { kind: "endsWith"; target: Expr; suffix: Expr }
  // Event cancellation state (cancellation / priority work,
  // 2026-11-13): `event is cancelled` — a leaf condition with
  // the native negated form `event is not cancelled`. Probed
  // against the real Skript 2.17.1: both forms parse (also as
  // `the event is cancelled`), including inside events that are
  // not cancellable (there the state simply reads false). In a
  // context with no event at all (a command, a function) the
  // engine reads false; Skript has no event there to ask about.
  | { kind: "eventCancelled" }
  // Presence condition (feedback T3 / C4): `<expr> is set` — a
  // leaf condition with the native negated form `<expr> is not
  // set`, usable in whileLoop heads. Probed against the real
  // Skript 2.17.1 by the coordinator: both forms parse and behave
  // correctly for local variables, global variables, AND
  // function-call results — a function that returns nothing
  // yields "not set", one that returns a value yields "set".
  // Presence is about having a value at all, not about its
  // content: a set-but-empty text "" IS set (it is a real value);
  // only genuine absence (an unset variable, a deleted variable,
  // a call with no return) is not set.
  | { kind: "isSet"; target: Expr }
  // Inventory operations (feedback lane D, 2026-11-13), probed
  // against the real Skript 2.17.1:
  // - hasItem: the target inventory holds at least the pattern
  //   item's amount (its stack size; a bare item means 1) of
  //   stacks matching the pattern under the directional
  //   metaCompatible rule — see itemCountIn. Player targets
  //   include armor and the offhand. Native negated .sk form:
  //   `<target> does not have <item>` (probed; `doesn't have`
  //   parses too). Skript form: `<target> has <item>`.
  // - canHoldItem: at least the pattern's amount fits into the
  //   target's storage slots under the exact-similarity capacity
  //   rule — see freeSpaceFor. Identical in truth value to the
  //   original's `has space for` spelling in every probed state;
  //   the emitter uses `can hold`. Native negated form:
  //   `<target> can't hold <item>` (probed; `cannot hold`
  //   parses too, `can not hold` does not). Both are leaf
  //   conditions usable in while heads.
  | { kind: "hasItem"; target: Expr; item: Expr }
  | { kind: "canHoldItem"; target: Expr; item: Expr }
  // Hidden item tags (feedback D): ENGINE-ONLY leaf condition —
  // the item carries a tag under `key` in its
  // PersistentDataContainer. False for a missing tag, an item
  // without meta, and a non-item value.
  | { kind: "hasItemTag"; item: Expr; key: string }
  // Core-language randomness (phase 28): the draw succeeds with
  // the given probability. The value is a FRACTION — chance(0.5)
  // is a 50% chance — which is the original's own percent model
  // (its `50%` literal is the number 0.5; probed). A missing or
  // non-number value never succeeds; a value of 1 or more always
  // succeeds. Every evaluation draws again (a while head re-draws
  // per iteration). The original has no negated .sk form for this
  // condition, so not(chance(...)) only lowers when the if has an
  // else branch (see emit.ts).
  | { kind: "chance"; value: Expr }
  // Engine-builtin condition (SharpSK slice, phase 7): a named timer exists.
  | { kind: "timerActive"; name: TextExpr }
  // Engine-builtin condition (skUtilities slice, phase 9): a file or
  // directory exists under the engine's files root.
  | { kind: "fileExists"; path: TextExpr }
  // Engine-builtin condition (external connectors, phase 26): the
  // HTTP completion being handled arrived with a response.
  | { kind: "httpOk" }
  // Engine-builtin condition (Cloudflare, M4 CF-1): the Cloudflare
  // operation being handled completed without an error.
  | { kind: "cfOk" }
  // Boss bar flag conditions (phase 24), probed on Skript 2.17.1:
  // `%bar% darkens the sky`, `%bar% creates fog`,
  // `%bar% plays boss music` (with native negative spellings).
  | { kind: "bossBarDarkensSky"; bar: Expr }
  | { kind: "bossBarCreatesFog"; bar: Expr }
  | { kind: "bossBarPlaysBossMusic"; bar: Expr };

/** Represents a Skript variable expression. */
export type VariableExpr = Extract<Expr, { kind: "variable" }>;

/** Represents a whole-list variable expression ({name::*}). */
export type ListExpr = Extract<Expr, { kind: "variableList" }>;

/** Represents a local variable expression ({_name}). */
export type LocalVariableExpr = Extract<Expr, { kind: "localVariable" }>;

/** Represents a whole local-list variable expression ({_name::*}). */
export type LocalListExpr = Extract<Expr, { kind: "localVariableList" }>;

/** Any scalar variable expression: a global variable or a local one. */
export type ScalarVarExpr = VariableExpr | LocalVariableExpr;

/** Any whole-list variable expression: a global list or a local one. */
export type AnyListExpr = ListExpr | LocalListExpr;

/** Anything a set/delete statement can target: a scalar or a whole list, global or local. */
export type VarTarget = ScalarVarExpr | AnyListExpr;

/**
 * A Skript type name for function parameters and return types
 * (phase 13). The plural forms ("numbers", "objects", ...) take /
 * return lists of the singular type; "object" accepts any single
 * value and "objects" any list.
 */
export type FunctionTypeName =
  | "number"
  | "numbers"
  | "text"
  | "texts"
  | "boolean"
  | "booleans"
  | "player"
  | "players"
  | "location"
  | "locations"
  | "object"
  | "objects"
  // Gameplay value types (phase 14): a block, an item, an entity.
  // Singular only — the plural forms are not part of this slice.
  // All three parse as Skript declaration types (probed against
  // the real Skript 2.17.1); the engine matches them against its
  // Block / ItemStack / Entity values.
  | "block"
  | "item"
  | "entity"
  // Both "timespan" and "timespans" parse as Skript declaration types
  // (probed); the engine matches them against its timespan values.
  | "timespan"
  | "timespans"
  // Both "date" and "dates" parse as Skript declaration types
  // (probed, feedback C3); the engine matches them against its
  // date values.
  | "date"
  | "dates";

/**
 * One declared parameter of a custom function. The parameter is a
 * local variable of the function's frame, named after the
 * parameter; `default` is an expression evaluated at call time
 * (before any parameter is bound — defaults can see globals, not
 * the arguments) and used only when the argument is omitted.
 *
 * The type parameter carries the declared type as a literal (the
 * `param()` builder in api.ts infers it) so typed function handles
 * (`defineFn`) can map each parameter to the argument kind it
 * accepts. It defaults to the full FunctionTypeName union, which
 * is how all pre-existing code sees this interface.
 */
export interface FunctionParam<T extends FunctionTypeName = FunctionTypeName> {
  name: string;
  type: T;
  default?: Expr;
}

/** Represents a wait duration unit (phase 12). */
export type TimeUnit = "ticks" | "seconds" | "minutes";

/**
 * A timespan literal unit (phase 23). Months are 30 days and years
 * 365 days (the original's fixed lengths, probed through its printed
 * forms).
 */
export type TimespanUnit = TimeUnit | "hours" | "days" | "weeks" | "months" | "years";

/**
 * A direction for relativeBlock (phase 18): the absolute
 * directions (above / below / the four cardinals) plus the
 * facing-relative front / behind, which follow the target
 * location's direction.
 */
export type RelativeDirection =
  | "above"
  | "below"
  | "north"
  | "south"
  | "east"
  | "west"
  | "front"
  | "behind";

/** A weather name (phase 18): the three states of Skript's weather type. */
export type WeatherName = "clear" | "rain" | "thunder";

/** A game mode name (phase 19): the four states of Skript's gamemode type. */
export type GameModeName = "survival" | "creative" | "adventure" | "spectator";

/**
 * A fishing state name (phase 22): the eight states of Skript's
 * fishing-state type, in their printed form — what
 * eventFishingState() reads and what the fishingState() literal
 * compares against. Each is also the state a fishing sub-event
 * fires on (see the fishing builders in api.ts).
 */
export type FishingStateName =
  | "fishing line cast"
  | "lured"
  | "bite"
  | "fish caught"
  | "entity caught"
  | "bobber in ground"
  | "fish escape"
  | "reel in";

/**
 * A title timing in literal form (phase 21): a literal timespan for
 * one part of a title send (fade-in, stay, fade-out). Fractional
 * amounts are fine (2.5 seconds is 50 ticks on the wire, probed).
 * Since phase 23 the builders also accept any timespan-valued
 * expression in these slots, like the original (a timespan variable
 * parses there — probed); a TitleTiming is normalized to a timespan
 * literal expression by the builders.
 */
export interface TitleTiming {
  amount: number;
  unit: TimespanUnit;
}

/**
 * A boss bar color name (phase 21): the seven colors of the
 * original's boss bar create / set forms. The name is a literal
 * in the .sk text, like a weather or game mode name.
 */
export type BossBarColorName = "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "white";

/**
 * A boss bar style literal (phase 24), spelled the way the subset
 * emits it in `set style of %bar% to ...`. The original accepts
 * many spellings (notches / segments / number words / "notched
 * with N segments"); the subset fixes one canonical spelling per
 * style. Note the read form is asymmetric in the original:
 * `style of %bar%` prints "solid" or "N segments" (probed).
 */
export type BossBarStyleName = "solid" | "6 notches" | "10 notches" | "12 notches" | "20 notches";

/**
 * A boss bar flag (phase 24), the subset's names for Bukkit's
 * BarFlag values DARKEN_SKY / CREATE_FOG / PLAY_BOSS_MUSIC
 * (Skript boss bar flags exist since 2.16; probed on 2.17.1).
 */
export type BossBarFlagName = "darkenSky" | "createFog" | "playBossMusic";

/** Source position in the TypeScript file where a builder call was made. */
export interface SourceLoc {
  file: string;
  line: number;
  column: number;
}

/** Represents a Skript statement. */
export type Stmt =
  // The message of send / broadcast is any expression (phase 13
  // widened it from text-only): Skript's send effect takes
  // %objects%, so a function call or a variable can be sent
  // directly; string/format expressions still emit as quoted text.
  | { kind: "send"; target: Expr; message: Expr; loc?: SourceLoc }
  | { kind: "broadcast"; message: Expr; loc?: SourceLoc }
  | { kind: "give"; target: Expr; itemName: string; amount: number; loc?: SourceLoc }
  | { kind: "teleport"; target: Expr; location: Expr; loc?: SourceLoc }
  | { kind: "setVar"; variable: VarTarget; value: Expr; loc?: SourceLoc }
  | { kind: "addVar"; variable: ScalarVarExpr; value: Expr; loc?: SourceLoc }
  | { kind: "removeVar"; variable: ScalarVarExpr; value: Expr; loc?: SourceLoc }
  | { kind: "if"; cond: Cond; then: readonly Stmt[]; else?: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopPlayers"; body: readonly Stmt[]; loc?: SourceLoc }
  // Core-language function statements (phase 13). return carries a
  // value (Skript has no bare return — that is a parse error there;
  // a value function that never returns yields no value) and exits
  // the function immediately, from inside loops too. stop emits
  // Skript's `stop`: it ends the current trigger — in a function,
  // the call completes with no value; anywhere else, the rest of
  // the trigger is skipped. callStmt invokes a function for its
  // effects and discards any return value.
  | { kind: "return"; value: Expr; loc?: SourceLoc }
  | { kind: "stop"; loc?: SourceLoc }
  | { kind: "callStmt"; name: string; args: readonly Expr[]; loc?: SourceLoc }
  // Core-language event control (phase 14). cancelEvent /
  // uncancelEvent map to Skript's `cancel event` / `uncancel
  // event`: they flag the Bukkit event the current trigger is
  // handling (block break/place, clicks, damage, ...) as cancelled
  // or not; outside a cancellable event they do nothing. setDamage
  // rewrites the amount of the damage event being handled (damage
  // is a settable expression in Skript, not a variable, so it gets
  // its own statement kind); anywhere else it does nothing.
  | { kind: "cancelEvent"; loc?: SourceLoc }
  | { kind: "uncancelEvent"; loc?: SourceLoc }
  | { kind: "setDamage"; value: Expr; loc?: SourceLoc }
  // Core-language text replacement (phase 15): Skript's replace
  // effect, applied to the text held by a scalar variable. Probed
  // semantics: matching is literal (never a regex) and
  // case-insensitive unless caseSensitive; plain `replace` and
  // replaceAllIn replace every occurrence, replaceFirstIn only
  // the first; an empty search text inserts the replacement at
  // every gap (all) or at the start (first); a missing or
  // non-text target is left untouched.
  | {
      kind: "textReplace";
      target: ScalarVarExpr;
      find: Expr;
      replacement: Expr;
      firstOnly: boolean;
      caseSensitive: boolean;
      loc?: SourceLoc;
    }
  // Core-language inventory and GUI statements (phase 17),
  // mirroring the change / effect forms probed against the real
  // Skript 2.17.1:
  // - giveItem hands an item-valued expression (meta included) to
  //   a player: Skript's `give <item> to <player>`.
  // - setItemName / setItemLore / setItemAmount rewrite the item
  //   a scalar variable holds (`set name of {v} to ...` and
  //   friends). The variable's current value is materialized
  //   first (a bare type name becomes a stack), the meta is
  //   rewritten, and the stack is stored back; a variable with no
  //   item value is left untouched.
  // - setSlot writes an item into one slot of an inventory value
  //   (`set slot <n> of <inventory> to <item>`); a player target
  //   means their own inventory, and an item expression with no
  //   value clears the slot.
  // - openInventory shows an inventory value to a player;
  //   openGui is the direct form that builds a fresh chest
  //   inventory and opens it in one statement (`open chest
  //   inventory with <rows> rows [named <title>] to <player>`);
  //   closeInventory closes what a player is viewing (`close
  //   <player>'s inventory`).
  | { kind: "giveItem"; target: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "setItemName"; target: ScalarVarExpr; name: Expr; loc?: SourceLoc }
  // Hidden item tags (feedback D): ENGINE-ONLY statement — write
  // a tag into the PersistentDataContainer of the item a scalar
  // variable holds, mirroring setItemName (a variable with no
  // item value is left untouched). The value's runtime type
  // decides the stored PDC type: text -> STRING, number ->
  // DOUBLE, boolean -> BYTE (1/0); any other value is a no-op.
  | { kind: "setItemTag"; target: ScalarVarExpr; key: string; value: Expr; loc?: SourceLoc }
  | { kind: "setItemLore"; target: ScalarVarExpr; lines: readonly Expr[]; loc?: SourceLoc }
  | { kind: "setItemAmount"; target: ScalarVarExpr; amount: Expr; loc?: SourceLoc }
  | { kind: "setSlot"; inventory: Expr; slot: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "openInventory"; target: Expr; inventory: Expr; loc?: SourceLoc }
  | { kind: "openGui"; target: Expr; rows: Expr; title?: Expr; loc?: SourceLoc }
  | { kind: "closeInventory"; target: Expr; loc?: SourceLoc }
  // Inventory operations (feedback lane D, 2026-11-13), probed
  // against the real Skript 2.17.1:
  // - removeItem removes up to the pattern item's amount (a bare
  //   item means 1) of matching stacks from the target, walking
  //   the inventory in slot order — main storage first, then
  //   armor, then the offhand for a player. A shortfall is NOT an
  //   error: what exists is removed and the rest is silently
  //   skipped (have 5, remove 10 -> 0 left). Matching is the
  //   directional metaCompatible rule, so a bare pattern strips
  //   named stacks too. Skript form: `remove <item> from
  //   <target>`.
  // - removeAllItems removes every matching stack regardless of
  //   the pattern's amount: `remove all <item> from <target>`.
  //   The builder rejects an amount-carrying pattern (the
  //   original has no `remove all <n> of` form).
  | { kind: "removeItem"; target: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "removeAllItems"; target: Expr; item: Expr; loc?: SourceLoc }
  // Phase 28: GUI slice 2 — slot/inventory add/remove, cursor and enchantment effects.
  | { kind: "addToSlot"; inventory: Expr; slot: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "removeFromSlot"; inventory: Expr; slot: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "addToInventory"; inventory: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "removeFromInventory"; inventory: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "enchantItem"; target: ScalarVarExpr; enchant: string; level: number; loc?: SourceLoc }
  | {
      kind: "enchantSlot";
      inventory: Expr;
      slot: Expr;
      enchant: string;
      level: number;
      loc?: SourceLoc;
    }
  | { kind: "setCursorItem"; target: Expr; item: Expr; loc?: SourceLoc }
  // Core-language world statements (phase 18), mirroring the
  // change / effect forms probed against the real Skript 2.17.1:
  // - setBlock writes an item's material at a location
  //   (`set block at %location% to %item%`); an air item clears
  //   the block.
  // - setWorldTime sets a world's clock (`set time in %world%
  //   to %time%`); the value is a clockTime literal or any
  //   expression carrying a clock text (a variable that was set
  //   from worldTime / clockTime works — probed). The timespan
  //   form parses in the original but its effect could not be
  //   verified, so it is not offered.
  // - setWorldWeather sets a world's weather by name
  //   (`set weather in %world% to rain`); the name is a literal
  //   in the .sk text, like an item name.
  | { kind: "setBlock"; location: Expr; item: Expr; loc?: SourceLoc }
  // - paint (engine-only) writes a whole shape in one bulk
  //   operation: every position of the shape expression gets
  //   the material its fill expression picks for it. The
  //   optional replace item restricts the write to positions
  //   currently holding that item's material. Blocks already
  //   holding the picked material are left untouched, and the
  //   write applies no physics updates.
  | { kind: "paint"; shape: Expr; fill: Expr; replace?: Expr; loc?: SourceLoc }
  | { kind: "setWorldTime"; world: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setWorldWeather"; world: Expr; name: WeatherName; loc?: SourceLoc }
  // Core-language state changes and effects (phase 19), mirroring
  // the change / effect forms probed against the real Skript
  // 2.17.1:
  // - setHealth / setMaxHealth / setFoodLevel / setSaturation /
  //   setExperience / setLevel write the matching expression
  //   (`set health of %entity% to %number%` and friends) in the
  //   expression's own units (hearts / drumsticks / raw
  //   saturation / total points / levels). Health writes clamp
  //   to the current maximum and 0 kills; a food write rounds to
  //   whole food points (6.3 drumsticks lands on 13 points);
  //   setting the max health rewrites the attribute base and
  //   leaves the current health alone; setting the level keeps
  //   the progress fraction; setting the experience sets the
  //   total exactly (the level and progress are re-derived).
  // - setGameMode takes the mode as a literal name (`set
  //   gamemode of %player% to creative`).
  // - heal without an amount refills to full; with an amount it
  //   heals that many hearts (`heal %entity% [by %number%]`).
  // - addToExpr / removeFromExpr are Skript's generic add /
  //   remove changers over the numeric state expressions
  //   (health, food level, experience, level): `add %number% to
  //   health of %entity%`. Variables keep their own addVar /
  //   list statements.
  // - applyPotion applies a potion effect by type name
  //   (`apply <type> [<level>] to %entity% [for <seconds>
  //   seconds]`): the level defaults to 1 and the duration to
  //   30 seconds in the original (both probed — a durationless
  //   apply showed 600 ticks in the entity's NBT). removePotion
  //   removes one type (`remove <type> from %entity%`); the
  //   original has NO remove-all form (three candidate phrasings
  //   all failed to parse), so none is offered.
  // - spawnEntity spawns entities of a named type at a location
  //   or at an entity (`spawn [<n> of] <type> at %location%`) and
  //   updates lastSpawnedEntity. dropItem drops an item-valued
  //   expression at a location (`drop %item% at %location%`).
  //   playSound plays a sound by registry name at a location or
  //   entity (`play sound "<name>" at %location%`); the original
  //   resolves the name through the sound registry (the packet
  //   carries the registry id), has no working volume option
  //   (the form does not parse) and parses but does not apply a
  //   pitch option (the wire pitch stayed 1 for 0.5 and 2), so
  //   neither is offered.
  | { kind: "setHealth"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setMaxHealth"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setFoodLevel"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setSaturation"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setGameMode"; target: Expr; name: GameModeName; loc?: SourceLoc }
  | { kind: "setExperience"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setLevel"; target: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "heal"; target: Expr; amount?: Expr; loc?: SourceLoc }
  | { kind: "addToExpr"; expr: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "removeFromExpr"; expr: Expr; value: Expr; loc?: SourceLoc }
  | {
      kind: "applyPotion";
      target: Expr;
      potion: string;
      level?: number;
      durationSeconds?: number;
      loc?: SourceLoc;
    }
  | { kind: "removePotion"; target: Expr; potion: string; loc?: SourceLoc }
  | { kind: "spawnEntity"; entityType: string; at: Expr; count?: number; loc?: SourceLoc }
  | { kind: "dropItem"; item: Expr; at: Expr; loc?: SourceLoc }
  | { kind: "playSound"; name: string; at: Expr; loc?: SourceLoc }
  // Core-language display effects and boss bar changes
  // (phase 21), mirroring the forms probed against the real
  // Skript 2.17.1 (raw client packets; see the development
  // log):
  // - sendTitle sends a title and/or subtitle to a player
  //   (`send title %object% [with subtitle %object%] to
  //   %player%`, or `send subtitle %object% to %player%` for
  //   the subtitle-only form). Exactly one of title / subtitle
  //   may be absent (the builder enforces that at least one is
  //   present). The optional timing tail — `for <stay>`,
  //   `with fadein <t>`, `and fade out <t>` — comes AFTER the
  //   target (putting `for` before `to` is a parse error in
  //   the original). Wire behavior (probed): when at least one
  //   timing is given, one times packet precedes the text
  //   packets and every unspecified part is filled with the
  //   defaults fade-in 10 / stay 70 / fade-out 20 ticks; when
  //   no timing is given, no times packet is sent at all (the
  //   client keeps its previous timings). A title-only send
  //   sends no subtitle packet and vice versa. The text slots
  //   are %object% — any expression, stringified like a chat
  //   message.
  // - sendActionBar shows a message in the action bar
  //   (`send action bar %object% to %player%`); no timings
  //   exist for it in the original.
  // - clearTitle clears the shown title (`clear title of
  //   %player%`); with reset set it additionally resets the
  //   title timings (`reset title of %player%`) — one packet,
  //   carrying the reset flag.
  // - The boss bar changes write the bar's properties and
  //   viewer set: `set title of %bossbar% to %text%`, `set
  //   color of %bossbar% to <color>` (a literal name), `set
  //   progress of %bossbar% to <fraction>` (a fraction 0..1,
  //   clamped by the original — writing 50 reads back 1;
  //   percent literals in hand-written Skript are the same
  //   fraction divided by 100), `add %player% to viewers of
  //   %bossbar%` and `remove %player% from viewers of
  //   %bossbar%`. (Style (notches) and the sky/fog/music
  //   flags were deferred in this phase and are covered in
  //   phase 24 — see setBossBarStyle / setBossBarFlag below.)
  | {
      kind: "sendTitle";
      target: Expr;
      title?: Expr;
      subtitle?: Expr;
      fadeIn?: Expr;
      stay?: Expr;
      fadeOut?: Expr;
      loc?: SourceLoc;
    }
  | { kind: "sendActionBar"; target: Expr; message: Expr; loc?: SourceLoc }
  | { kind: "clearTitle"; target: Expr; reset: boolean; loc?: SourceLoc }
  | { kind: "setBossBarTitle"; bar: Expr; title: Expr; loc?: SourceLoc }
  | { kind: "setBossBarColor"; bar: Expr; name: BossBarColorName; loc?: SourceLoc }
  | { kind: "setBossBarProgress"; bar: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "addBossBarViewer"; bar: Expr; viewer: Expr; loc?: SourceLoc }
  | { kind: "removeBossBarViewer"; bar: Expr; viewer: Expr; loc?: SourceLoc }
  // Boss bar completion (phase 24), probed on Skript 2.17.1:
  // deleteKeyedBossBar emits the fetch expression under `delete`
  // (`delete boss bar with key %text%`), which removes the stored
  // bar and is a silent no-op for a missing key. (Deleting the
  // keyed CREATE expression crashes the original with a
  // ClassCastException — an original bug the subset does not
  // reproduce; deleting a variable holding a keyed bar only
  // clears the variable, the bar survives.)
  | { kind: "deleteKeyedBossBar"; key: Expr; loc?: SourceLoc }
  // setBossBarStyle emits `set style of %bar% to <literal>` with
  // the canonical BossBarStyleName spellings.
  | { kind: "setBossBarStyle"; bar: Expr; style: BossBarStyleName; loc?: SourceLoc }
  // setBossBarFlag emits the make / make-no-longer effect family:
  // `make %bar% darken the sky` / `create fog` / `play boss music`
  // and `make %bar% no longer ...` for enabled=false (the
  // stop-from family also exists in the original; the subset
  // fixes the make family). Fresh bars have all flags off.
  | { kind: "setBossBarFlag"; bar: Expr; flag: BossBarFlagName; enabled: boolean; loc?: SourceLoc }
  // createBossBarSection is the section creation form:
  // `set <target> to a [keyed] boss bar [with key %text%]:` with
  // the body addressing the new bar as eventBossBar. A color word
  // is allowed in the section head (probed, plain and keyed), but
  // there is no title clause (the docs' keyed+title section
  // example does not parse in 2.17.1); the body's property
  // statements on event-bossbar do that work. With `key` present
  // the bar is keyed (and the create resets any stored bar under
  // the key, like keyedBossBar); without it, a plain bar.
  | {
      kind: "createBossBarSection";
      target: VarTarget;
      key?: Expr;
      color?: BossBarColorName;
      body: Stmt[];
      loc?: SourceLoc;
    }
  // Core-language list statements and control flow (phase 12).
  // listAdd appends at the smallest unused positive integer index;
  // listRemove deletes the first matching entry (in iteration
  // order); deleteVar removes a variable, one list entry, or a
  // whole list; the loops expose loopValue (and list loops also
  // loopIndex); while accepts leaf conditions only (the builder
  // enforces it — a while head has no control-flow lowering);
  // wait suspends the rest of the trigger for the duration.
  | { kind: "listAdd"; list: AnyListExpr; value: Expr; loc?: SourceLoc }
  | { kind: "listRemove"; list: AnyListExpr; value: Expr; loc?: SourceLoc }
  | { kind: "deleteVar"; target: VarTarget; loc?: SourceLoc }
  | { kind: "loopList"; list: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopTimes"; count: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopRange"; from: Expr; to: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "while"; cond: Cond; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "wait"; amount: Expr; unit: TimeUnit; loc?: SourceLoc }
  // waitFor suspends for a timespan-valued expression — the
  // original's `wait <timespan>` form (probed). The fishing setters
  // write the current fishing event's hook and are no-ops outside
  // fishing events.
  | { kind: "waitFor"; value: Expr; loc?: SourceLoc }
  | { kind: "setFishingWaitTime"; bound: "min" | "max"; value: Expr; loc?: SourceLoc }
  | { kind: "setFishingBiteTime"; value: Expr; loc?: SourceLoc }
  | { kind: "setFishingApproachAngle"; bound: "min" | "max"; value: Expr; loc?: SourceLoc }
  // Engine-builtin statements (MundoSK slice, phase 6): no .sk equivalent.
  | { kind: "wsConnect"; id: string; url: TextExpr; loc?: SourceLoc }
  | { kind: "wsSend"; id: string; message: TextExpr; loc?: SourceLoc }
  | { kind: "wsDisconnect"; id: string; loc?: SourceLoc }
  | { kind: "setBorderSize"; world: Expr; size: Expr; loc?: SourceLoc }
  | { kind: "setBorderCenter"; world: Expr; center: Expr; loc?: SourceLoc }
  // Engine-builtin statements (SharpSK slice, phase 7): named countdown timers.
  | { kind: "timerCreate"; id: string; seconds: Expr; loc?: SourceLoc }
  | { kind: "timerStop"; id: string; loc?: SourceLoc }
  | { kind: "timerPause"; id: string; loc?: SourceLoc }
  | { kind: "timerResume"; id: string; loc?: SourceLoc }
  // Engine-builtin statement (skript-db slice, phase 8): execute one
  // SQL statement on a data source. The query is a text expression;
  // its expression parts are bound as statement parameters by the
  // engine, never inlined. When `store` is given, a result set is
  // mapped to <store>::<column>::<row> entries (and <store> itself
  // becomes the row count); otherwise the variable receives the
  // number of affected rows.
  | { kind: "dbExecute"; datasource: Expr; query: TextExpr; store?: VariableExpr; loc?: SourceLoc }
  // Engine-builtin statements (skUtilities slice, phase 9): the text
  // file core. Paths are text expressions resolved by the engine
  // under its files root; escaping paths are refused.
  | { kind: "fileCreate"; path: TextExpr; loc?: SourceLoc }
  | { kind: "dirCreate"; path: TextExpr; loc?: SourceLoc }
  | { kind: "fileDelete"; path: TextExpr; loc?: SourceLoc }
  | { kind: "fileWrite"; path: TextExpr; text: TextExpr; loc?: SourceLoc }
  | { kind: "fileAppend"; path: TextExpr; text: TextExpr; loc?: SourceLoc }
  // Engine-builtin statement (Ersatz slice, phase 10): set the
  // answer string for the placeholder request being handled. Only
  // meaningful inside an onPlaceholderRequest body; a request whose
  // handler never sets a result resolves to no value.
  | { kind: "setPlaceholderResult"; text: TextExpr; loc?: SourceLoc }
  // Engine-builtin statements (external connectors, phase 26): start
  // an asynchronous HTTP fetch / download. The statement returns at
  // once; the outcome arrives later as an httpResponse event.
  | { kind: "httpFetch"; id: string; url: TextExpr; timeoutSeconds?: number; loc?: SourceLoc }
  | {
      kind: "httpDownload";
      id: string;
      url: TextExpr;
      path: TextExpr;
      timeoutSeconds?: number;
      loc?: SourceLoc;
    }
  // Engine-builtin statement (Cloudflare, M4 CF-1): start an
  // asynchronous D1 query against the database bound to a named
  // handle (resolved by the engine from SKRIPTTS_CF_* environment
  // variables). The statement returns at once; the outcome arrives
  // later as a cfResponse event. The sql is a text expression whose
  // expression parts become bound ? parameters, never inlined.
  | {
      kind: "cfD1Query";
      id: string;
      handle: string;
      sql: TextExpr;
      store?: VariableExpr;
      timeoutSeconds?: number;
      loc?: SourceLoc;
    };

/** Represents a Skript event kind. The ws kinds are engine-builtin events (phase 6), the timer kinds are phase 7, papiRequest is phase 10. The block, click and damage kinds are core-language gameplay events (phase 14); pickup, drop, respawn and the bed kinds are phase 16; the inventory kinds are phase 17. Phase 22 generalized death (any entity, victim filter), added the entity pickup / drop forms, and split fishing into its state sub-events. */
export type EventKind =
  | "join"
  | "firstJoin"
  | "quit"
  | "chat"
  | "death"
  | "blockBreak"
  | "blockPlace"
  | "rightClick"
  | "leftClick"
  | "damage"
  | "pickup"
  | "drop"
  | "respawn"
  | "bedEnter"
  | "bedLeave"
  | "inventoryClick"
  | "inventoryClose"
  | "inventoryDrag"
  | "entityPickup"
  | "entityDrop"
  | "fishCast"
  | "fishApproach"
  | "fishBite"
  | "fishCaught"
  | "entityHooked"
  | "hookInGround"
  | "fishEscape"
  | "fishReelIn"
  | "fishingStateChange"
  | "wsOpen"
  | "wsMessage"
  | "wsClose"
  | "timerTick"
  | "timerComplete"
  | "papiRequest"
  | "httpResponse"
  | "cfResponse";

/**
 * A Skript event filter (phase 16): the type-name lists of the
 * filtered event forms — "on break of stone", "on damage of
 * player by zombie", "on right click on a villager with a
 * stick". A field is present only when that slot is filtered;
 * the handler runs only when every present slot matches the
 * event's actual value, compared by Skript type name (the name
 * typeOf would print). A slot whose value the event does not
 * have (an attacker filter on environmental damage, a block
 * filter on an air click) never matches. Slots by event:
 * - ofTypes: block break / place (the block), pickup / drop /
 *   entity pickup / entity drop (the item)
 * - victimTypes: damage and death (phase 22 — the death
 *   header carries ONLY this slot; the original rejects an
 *   attacker slot on death at parse time)
 * - attackerTypes: damage
 * - onTypes / onEntityTypes / withTypes: clicks (the clicked
 *   block / the clicked entity / the item in hand)
 */
export interface EventFilter {
  ofTypes?: readonly string[];
  victimTypes?: readonly string[];
  attackerTypes?: readonly string[];
  onTypes?: readonly string[];
  onEntityTypes?: readonly string[];
  withTypes?: readonly string[];
}

/**
 * A handler priority (event cancellation / priority work,
 * 2026-11-13): the names are Bukkit's EventPriority levels,
 * spelled the way Skript's `with priority <level>` header suffix
 * spells them. Handlers for one event run from the lowest slot
 * to monitor; a handler with NO priority declared dispatches in
 * the HIGH slot, not the normal one (probed r7 — only an
 * explicit "normal" lands in the normal slot). Probed against
 * the real Skript 2.17.1: the suffix
 * comes AFTER any filter slots ("on damage of zombie with
 * priority highest"), an unknown level name is a parse error,
 * and a `priority:` section line inside the body does not
 * exist (also a parse error).
 */
export type EventPriority = "lowest" | "low" | "normal" | "high" | "highest" | "monitor";

/**
 * Represents a Skript command argument type. The set mirrors the
 * classes Skript 2.17.1 accepts in command headers, which it maps
 * onto Brigadier argument types (all probed against the real
 * Skript in phase 20):
 * - "text": one word, or the rest of the line in last position.
 * - "player": an ONLINE player by name (case-insensitive); an
 *   offline name is a parse failure, and selectors (@p etc.) are
 *   rejected outright.
 * - "offlinePlayer": emitted as "offline player"; ANY name
 *   resolves (the value is the offline player of that name).
 * - "integer": a Brigadier long (fractional input is invalid).
 * - "number": a Brigadier double.
 * - "boolean": only the literals "true" / "false".
 * - "item": a single-token item id ("diamond_sword",
 *   "minecraft:diamond_sword").
 */
export type CommandArgType =
  | "text"
  | "player"
  | "offlinePlayer"
  | "integer"
  | "number"
  | "boolean"
  | "item";

/**
 * One declared command argument (phase 20). There is deliberately
 * no default value: the original's `[<type> = <expr>]` form loads
 * under 2.17.1 but is broken there — omission yields no value (the
 * default never applies) and supplying a value fails dispatch
 * ("Unknown or incomplete command") — so the subset does not
 * offer it.
 */
export interface CommandArgSpec {
  type: CommandArgType;
  /** Optional arguments emit as [<type>] and may be omitted; an omitted argument has no value. */
  optional: boolean;
}

/** Represents a Skript top-level declaration. */
export type TopLevel =
  // `prefixes` is set only for the papiRequest event (phase 10): the
  // PlaceholderAPI expansion identifiers this handler serves.
  // `filter` is set only for filtered gameplay events (phase 16).
  // `priority` is set only when the builder was given one
  // (cancellation / priority work, 2026-11-13); absent dispatches
  // in the high slot under both runtimes (probed r7).
  | {
      kind: "event";
      event: EventKind;
      body: readonly Stmt[];
      prefixes?: readonly string[];
      filter?: EventFilter;
      priority?: EventPriority;
      loc?: SourceLoc;
    }
  // A command (generalized in phase 20): a list of typed arguments
  // plus the section entries the original supports — permission,
  // usage, aliases. The legacy single-argument builder maps onto
  // a one-element args list. `permissionMessage` is deliberately
  // absent: 2.17.1 deprecates the entry (a load-time deprecation)
  // and never delivers the message — a sender without permission
  // cannot address the command at all and gets the same
  // "Unknown or incomplete command" failure as an unknown command.
  | {
      kind: "command";
      name: string;
      args: readonly CommandArgSpec[];
      permission?: string;
      usage?: string;
      aliases?: readonly string[];
      body: readonly Stmt[];
      loc?: SourceLoc;
    }
  // A custom function (phase 13). `returnType` is null for a void
  // function (no `:: type` in the .sk form). Functions are global:
  // they can be called from any script, before or after their
  // definition in file order (verified against the real Skript).
  | {
      kind: "function";
      name: string;
      params: readonly FunctionParam[];
      returnType: FunctionTypeName | null;
      body: readonly Stmt[];
      loc?: SourceLoc;
    }
  // A periodical trigger (phase 18): `every <amount> <unit>:`,
  // Skript's periodical event. The amount is a NUMBER LITERAL —
  // the original rejects expression periods at parse time
  // ("Can't understand this structure: every {_n} seconds"), so
  // the builder takes a plain number (fractional amounts are
  // fine: `every 2.5 seconds` parses and fires on cadence).
  // Semantics probed against the real Skript 2.17.1: the first
  // firing happens one full period after the script loads, and
  // a reload re-anchors the schedule (the old firing is dropped,
  // the next comes one period after the reload). The body runs
  // with no event context, like a function body: there is no
  // player or event value, only globals and the body's locals.
  | { kind: "periodical"; amount: number; unit: TimeUnit; body: readonly Stmt[]; loc?: SourceLoc };

/** Represents a Skript script. */
export interface Script {
  kind: "script";
  body: readonly TopLevel[];
}
