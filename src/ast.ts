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
  | { kind: "listSize"; list: AnyListExpr }
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
  | { kind: "itemWithName"; base: Expr; name: Expr }
  | { kind: "itemWithLore"; base: Expr; lines: readonly Expr[] }
  | { kind: "itemWithAmount"; base: Expr; amount: Expr }
  | { kind: "nameOf"; target: Expr }
  | { kind: "loreOf"; target: Expr }
  | { kind: "amountOf"; target: Expr }
  | { kind: "chestInventory"; rows: Expr; title?: Expr }
  | { kind: "currentInventory"; target: Expr }
  | { kind: "eventInventory" }
  | { kind: "slotItem"; inventory: Expr; slot: Expr }
  | { kind: "clickedSlotIndex" }
  | { kind: "clickedRawSlotIndex" }
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
  | { kind: "weatherType"; name: WeatherName };

/** Represents a binary arithmetic operator. */
export type ArithOp = "+" | "-" | "*" | "/" | "mod";

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
  // Engine-builtin condition (SharpSK slice, phase 7): a named timer exists.
  | { kind: "timerActive"; name: TextExpr }
  // Engine-builtin condition (skUtilities slice, phase 9): a file or
  // directory exists under the engine's files root.
  | { kind: "fileExists"; path: TextExpr };

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
  | "number" | "numbers"
  | "text" | "texts"
  | "boolean" | "booleans"
  | "player" | "players"
  | "location" | "locations"
  | "object" | "objects"
  // Gameplay value types (phase 14): a block, an item, an entity.
  // Singular only — the plural forms are not part of this slice.
  // All three parse as Skript declaration types (probed against
  // the real Skript 2.17.1); the engine matches them against its
  // Block / ItemStack / Entity values.
  | "block" | "item" | "entity";

/**
 * One declared parameter of a custom function. The parameter is a
 * local variable of the function's frame, named after the
 * parameter; `default` is an expression evaluated at call time
 * (before any parameter is bound — defaults can see globals, not
 * the arguments) and used only when the argument is omitted.
 */
export interface FunctionParam {
  name: string;
  type: FunctionTypeName;
  default?: Expr;
}

/** Represents a wait duration unit (phase 12). */
export type TimeUnit = "ticks" | "seconds" | "minutes";

/**
 * A direction for relativeBlock (phase 18): the absolute
 * directions (above / below / the four cardinals) plus the
 * facing-relative front / behind, which follow the target
 * location's direction.
 */
export type RelativeDirection =
  | "above" | "below" | "north" | "south" | "east" | "west" | "front" | "behind";

/** A weather name (phase 18): the three states of Skript's weather type. */
export type WeatherName = "clear" | "rain" | "thunder";

/** Source position in the TypeScript file where a builder call was made. */
export interface SourceLoc { file: string; line: number; column: number }

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
  | { kind: "textReplace"; target: ScalarVarExpr; find: Expr; replacement: Expr; firstOnly: boolean; caseSensitive: boolean; loc?: SourceLoc }
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
  | { kind: "setItemLore"; target: ScalarVarExpr; lines: readonly Expr[]; loc?: SourceLoc }
  | { kind: "setItemAmount"; target: ScalarVarExpr; amount: Expr; loc?: SourceLoc }
  | { kind: "setSlot"; inventory: Expr; slot: Expr; item: Expr; loc?: SourceLoc }
  | { kind: "openInventory"; target: Expr; inventory: Expr; loc?: SourceLoc }
  | { kind: "openGui"; target: Expr; rows: Expr; title?: Expr; loc?: SourceLoc }
  | { kind: "closeInventory"; target: Expr; loc?: SourceLoc }
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
  | { kind: "setWorldTime"; world: Expr; value: Expr; loc?: SourceLoc }
  | { kind: "setWorldWeather"; world: Expr; name: WeatherName; loc?: SourceLoc }
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
  | { kind: "loopList"; list: AnyListExpr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopTimes"; count: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "loopRange"; from: Expr; to: Expr; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "while"; cond: Cond; body: readonly Stmt[]; loc?: SourceLoc }
  | { kind: "wait"; amount: Expr; unit: TimeUnit; loc?: SourceLoc }
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
  | { kind: "setPlaceholderResult"; text: TextExpr; loc?: SourceLoc };

/** Represents a Skript event kind. The ws kinds are engine-builtin events (phase 6), the timer kinds are phase 7, papiRequest is phase 10. The block, click and damage kinds are core-language gameplay events (phase 14); pickup, drop, respawn and the bed kinds are phase 16; the inventory kinds are phase 17. */
export type EventKind =
  | "join" | "firstJoin" | "quit" | "chat" | "death"
  | "blockBreak" | "blockPlace" | "rightClick" | "leftClick" | "damage"
  | "pickup" | "drop" | "respawn" | "bedEnter" | "bedLeave"
  | "inventoryClick" | "inventoryClose"
  | "wsOpen" | "wsMessage" | "wsClose"
  | "timerTick" | "timerComplete"
  | "papiRequest";

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
 * - ofTypes: block break / place (the block), pickup / drop
 *   (the item)
 * - victimTypes / attackerTypes: damage
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

/** Represents a Skript command argument type. */
export type CommandArgType = "text" | "player" | "integer";

/** Represents a Skript top-level declaration. */
export type TopLevel =
  // `prefixes` is set only for the papiRequest event (phase 10): the
  // PlaceholderAPI expansion identifiers this handler serves.
  // `filter` is set only for filtered gameplay events (phase 16).
  | { kind: "event"; event: EventKind; body: readonly Stmt[]; prefixes?: readonly string[]; filter?: EventFilter; loc?: SourceLoc }
  | { kind: "command"; name: string; argType: CommandArgType | null; argOptional: boolean; body: readonly Stmt[]; loc?: SourceLoc }
  // A custom function (phase 13). `returnType` is null for a void
  // function (no `:: type` in the .sk form). Functions are global:
  // they can be called from any script, before or after their
  // definition in file order (verified against the real Skript).
  | { kind: "function"; name: string; params: readonly FunctionParam[]; returnType: FunctionTypeName | null; body: readonly Stmt[]; loc?: SourceLoc }
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
export interface Script { kind: "script"; body: readonly TopLevel[] }