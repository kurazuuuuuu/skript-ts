import type { Expr, TextExpr, Cond, VariableExpr, ListExpr, LocalVariableExpr, LocalListExpr, AnyListExpr, ScalarVarExpr, VarTarget, FunctionParam, FunctionTypeName, Stmt, TopLevel, Script, CommandArgType, CommandArgSpec, SourceLoc, ArithOp, TimeUnit, TimespanUnit, EventFilter, RelativeDirection, WeatherName, GameModeName, TitleTiming, BossBarColorName, BossBarStyleName, BossBarFlagName, FishingStateName } from "./ast.js";
import { captureLoc } from "./loc.js";

/** Attach the TypeScript call-site location to a freshly built AST node. */
function withLoc<T extends Stmt | TopLevel>(node: T): T {
  const loc: SourceLoc | undefined = captureLoc();
  if (loc !== undefined) node.loc = loc;
  return node;
}

/** Construct a player expression. */
export function player(): Expr {
  return { kind: "player" };
}

/** Construct an event player expression. */
export function eventPlayer(): Expr {
  return { kind: "eventPlayer" };
}

/** Construct a loop player expression. */
export function loopPlayer(): Expr {
  return { kind: "loopPlayer" };
}

/** Construct a victim expression (the entity that died / was damaged, in death and damage events). */
export function victim(): Expr {
  return { kind: "victim" };
}

/** Construct an argument expression with a 1-based index. */
export function argument(index: number): Expr {
  if (!Number.isInteger(index) || index < 1) throw new RangeError("argument index must be a positive integer");
  return { kind: "argument", index };
}

/** Construct a chat message expression. */
export function chatMessage(): Expr {
  return { kind: "chatMessage" };
}

/** Construct a variable expression, optionally indexed. */
export function variable(name: string, index?: Expr): VariableExpr {
  if (index === undefined) return { kind: "variable", name };
  return { kind: "variable", name, index };
}

/** Construct a local variable expression ({_name}), optionally indexed ({_name::%index%}). */
export function localVar(name: string, index?: Expr): LocalVariableExpr {
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("local variable name must be a non-empty string");
  }
  if (index === undefined) return { kind: "localVariable", name };
  return { kind: "localVariable", name, index };
}

/** Construct a whole local-list expression ({_name::*}). */
export function localList(name: string): LocalListExpr {
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("local list name must be a non-empty string");
  }
  return { kind: "localVariableList", name };
}

/** Construct a string literal expression. */
export function str(value: string): TextExpr {
  return { kind: "string", value };
}

/** Construct a number expression. */
export function num(value: number): Expr {
  return { kind: "number", value };
}

/** Construct a boolean expression. */
export function bool(value: boolean): Expr {
  return { kind: "boolean", value };
}

/** Construct an item expression. */
export function item(name: string): Expr {
  return { kind: "item", name };
}

/** Construct a location-of expression. */
export function locationOf(target: Expr): Expr {
  return { kind: "locationOf", target };
}

/** Construct a format expression from parts. */
export function fmt(...parts: (string | Expr)[]): TextExpr {
  return { kind: "format", parts };
}

// ---------------------------------------------------------------------------
// Core language (phase 11): comparisons, logic, arithmetic
//
// Comparisons mirror Skript's compare condition, as verified
// against the real Skript 2.17.1 in the sandbox: text equality is
// case-insensitive, values of different types are never equal (a
// number is never equal to its text form), a value with no value
// (e.g. an unset variable) is not equal to anything — not even to
// another unset value — and only numbers can be ordered (ordering
// a text is always false). Negated forms ("is not ...") are exact
// boolean negations of the positive form, including for values
// that cannot be compared at all.
//
// Arithmetic mirrors Skript's arithmetic expression plus its mod()
// function: operands must both be numbers, except that "+" over
// two texts concatenates them; any other type combination yields
// no value. A MISSING operand is different from a wrong-typed one
// (phase-13 probes): for the four infix operators it counts as 0
// when the other side is a number (unset + 100 is 100, unset * 2
// is 0); with a text/boolean partner or both sides missing the
// result has no value, and mod() never substitutes (a missing
// operand makes it valueless). Division is real division (7 / 2
// is 3.5, 1 / 0 is Infinity); remainder is the mathematical
// modulo — the result takes the divisor's sign (remainder(-1, 10)
// is 9) and is NaN for a zero divisor.
// ---------------------------------------------------------------------------

/** Construct an equality condition: the two values are equal (texts compare case-insensitively). */
export function equals(left: Expr, right: Expr): Cond {
  return { kind: "equals", left, right };
}

/** Construct an inequality condition: the negation of equals(). */
export function notEquals(left: Expr, right: Expr): Cond {
  return { kind: "notEquals", left, right };
}

/** Construct a greater-than condition (numbers only; false for anything else). */
export function greaterThan(left: Expr, right: Expr): Cond {
  return { kind: "greaterThan", left, right };
}

/** Construct a greater-than-or-equal condition (numbers only; false for anything else). */
export function greaterOrEqual(left: Expr, right: Expr): Cond {
  return { kind: "greaterOrEqual", left, right };
}

/** Construct a less-than condition (numbers only; false for anything else). */
export function lessThan(left: Expr, right: Expr): Cond {
  return { kind: "lessThan", left, right };
}

/** Construct a less-than-or-equal condition (numbers only; false for anything else). */
export function lessOrEqual(left: Expr, right: Expr): Cond {
  return { kind: "lessOrEqual", left, right };
}

function combine(kind: "and" | "or", conds: readonly Cond[]): Cond {
  if (conds.length < 2) {
    throw new RangeError(`${kind}() needs at least two conditions`);
  }
  let acc: Cond = conds[0]!;
  for (let i = 1; i < conds.length; i++) {
    acc = kind === "and" ? { kind: "and", left: acc, right: conds[i]! } : { kind: "or", left: acc, right: conds[i]! };
  }
  return acc;
}

/** Construct an and condition: every given condition holds. */
export function and(...conds: Cond[]): Cond {
  return combine("and", conds);
}

/** Construct an or condition: at least one of the given conditions holds. */
export function or(...conds: Cond[]): Cond {
  return combine("or", conds);
}

/** Construct a not condition: the given condition does not hold. */
export function not(cond: Cond): Cond {
  return { kind: "not", cond };
}

/** Construct an arithmetic expression from an operator and two operands. */
export function arith(op: ArithOp, left: Expr, right: Expr): Expr {
  return { kind: "arith", op, left, right };
}

/** Construct an addition expression (or text concatenation, when both operands are texts). */
export function plus(left: Expr, right: Expr): Expr {
  return arith("+", left, right);
}

/** Construct a subtraction expression. */
export function minus(left: Expr, right: Expr): Expr {
  return arith("-", left, right);
}

/** Construct a multiplication expression. */
export function times(left: Expr, right: Expr): Expr {
  return arith("*", left, right);
}

/** Construct a division expression (real division; dividing by zero yields Infinity or NaN). */
export function dividedBy(left: Expr, right: Expr): Expr {
  return arith("/", left, right);
}

/** Construct a remainder expression: the mathematical modulo (sign of the divisor; NaN for a zero divisor). */
export function remainder(left: Expr, right: Expr): Expr {
  return arith("mod", left, right);
}

/** Construct a has-permission condition. */
export function hasPermission(target: Expr, permission: string): Cond {
  return { kind: "hasPermission", target, permission };
}

/** Construct an is-op condition. */
export function isOp(target: Expr): Cond {
  return { kind: "isOp", target };
}

/** Construct a send statement. The message may be any expression; text expressions emit as quoted strings. */
export function send(target: Expr, message: Expr): Stmt {
  return withLoc({ kind: "send", target, message });
}

/** Construct a broadcast statement. The message may be any expression; text expressions emit as quoted strings. */
export function broadcast(message: Expr): Stmt {
  return withLoc({ kind: "broadcast", message });
}

/** Construct a give statement. */
export function give(target: Expr, itemName: string, amount: number): Stmt {
  return withLoc({ kind: "give", target, itemName, amount });
}

/** Construct a teleport statement. */
export function teleport(target: Expr, location: Expr): Stmt {
  return withLoc({ kind: "teleport", target, location });
}

/** Construct a set-variable statement. The target may be a scalar or a whole list, global or local. */
export function set(variable: VarTarget, value: Expr): Stmt {
  return withLoc({ kind: "setVar", variable, value });
}

/** Construct an add-variable statement. The target may be a global or a local scalar variable. */
export function add(variable: ScalarVarExpr, value: Expr): Stmt {
  return withLoc({ kind: "addVar", variable, value });
}

/** Construct a remove-variable statement. The target may be a global or a local scalar variable. */
export function remove(variable: ScalarVarExpr, value: Expr): Stmt {
  return withLoc({ kind: "removeVar", variable, value });
}

/** Construct an if statement with optional else branch. */
export function ifElse(cond: Cond, then: readonly Stmt[], elseBody?: readonly Stmt[]): Stmt {
  if (elseBody === undefined) return withLoc({ kind: "if", cond, then });
  return withLoc({ kind: "if", cond, then, else: elseBody });
}

/** Construct a loop-players statement. */
export function loopPlayers(body: readonly Stmt[]): Stmt {
  return withLoc({ kind: "loopPlayers", body });
}

// ---------------------------------------------------------------------------
// Core language (phase 12): list variables, more loops, while, wait
//
// List semantics mirror the real Skript 2.17.1, verified against
// the sandbox server with hand-written probe scripts (see the
// development log): a list variable {name::*} holds entries under
// indices addressed by their string form — a number and a numeric
// text are the same index (an entry set through a numeric
// expression index reads back through the text "5") — and text
// indices are case-insensitive. Iteration visits text indices
// first (numeric texts by value, then alphabetically), then
// numeric indices in ascending order. Adding appends at the
// smallest unused positive integer index; deleting an entry
// leaves a hole (no renumbering); removing a value deletes only
// the first matching entry. A list used as text reads
// "a, b and c" (two entries: "a and b"); an empty list — like
// any missing value inside a string — reads <none>. size of an
// unset list is 0.
//
// Loops: loopList exposes loopValue() and loopIndex(); loopTimes
// and loopRange expose loopValue() only (the counter / the current
// number) — Skript rejects loop-index in them ("There's no loop
// that matches 'loop-index'"), so loopIndex() outside a list loop
// is an invalid program in this subset. A range runs from the
// first bound to the second, in whichever direction that is.
//
// wait suspends the rest of the trigger: statements after it —
// including the rest of enclosing if branches, the remaining loop
// iterations, and statements after the loop — run once the
// duration has passed, in order (Skript's continuation semantics,
// verified by timed probes). Durations may be fractional.
// ---------------------------------------------------------------------------

/** Construct a whole-list expression: the entries of {name::*} in iteration order. */
export function listVar(name: string): ListExpr {
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("list variable name must be a non-empty string");
  }
  return { kind: "variableList", name };
}

/** Construct a list-size expression: the number of entries in the list (0 when unset). */
export function listSize(list: AnyListExpr): Expr {
  return { kind: "listSize", list };
}

/** Construct a loop-value expression: the element (or number / player) the enclosing loop is visiting. */
export function loopValue(): Expr {
  return { kind: "loopValue" };
}

/** Construct a loop-index expression: the index of the element the enclosing list loop is visiting. */
export function loopIndex(): Expr {
  return { kind: "loopIndex" };
}

/** Construct a list-add statement: append the value at the smallest unused positive integer index. */
export function listAdd(list: AnyListExpr, value: Expr): Stmt {
  return withLoc({ kind: "listAdd", list, value });
}

/** Construct a list-remove statement: delete the first entry (in iteration order) equal to the value. */
export function listRemove(list: AnyListExpr, value: Expr): Stmt {
  return withLoc({ kind: "listRemove", list, value });
}

/**
 * Construct a delete statement: remove a variable, one list entry
 * (an indexed variable), or a whole list (a list variable — the
 * bare variable of the same name is a different node and stays).
 * Global and local targets both work.
 */
export function deleteVar(target: VarTarget): Stmt {
  return withLoc({ kind: "deleteVar", target });
}

/** Construct a loop over a list variable's entries, exposing loopValue() and loopIndex(). */
export function loopList(list: AnyListExpr, body: readonly Stmt[]): Stmt {
  return withLoc({ kind: "loopList", list, body });
}

/** Construct a counted loop: runs the body count times with loopValue() as the 1-based counter. */
export function loopTimes(count: Expr, body: readonly Stmt[]): Stmt {
  return withLoc({ kind: "loopTimes", count, body });
}

/** Construct a numeric range loop: loopValue() runs from `from` to `to`, step 1, in either direction. */
export function loopRange(from: Expr, to: Expr, body: readonly Stmt[]): Stmt {
  return withLoc({ kind: "loopRange", from, to, body });
}

const WHILE_LEAF_KINDS: ReadonlySet<Cond["kind"]> = new Set([
  "hasPermission",
  "isOp",
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "contains",
  "startsWith",
  "endsWith",
  "bossBarDarkensSky",
  "bossBarCreatesFog",
  "bossBarPlaysBossMusic",
  "timerActive",
  "fileExists",
]);

/**
 * Construct a while loop. The condition must be a leaf condition
 * or the negation of one: an if head can lower and/or/not to
 * control flow, but a loop head cannot, and Skript has no textual
 * conjunction form — so composite conditions are rejected here
 * instead of diverging between the two runtimes.
 */
export function whileLoop(cond: Cond, body: readonly Stmt[]): Stmt {
  const inner = cond.kind === "not" ? cond.cond : cond;
  if (!WHILE_LEAF_KINDS.has(inner.kind)) {
    throw new RangeError(
      "whileLoop condition must be a leaf condition or not(leaf): " +
        "and/or conditions cannot head a while loop in this subset",
    );
  }
  return withLoc({ kind: "while", cond, body });
}

/** Construct a wait statement: suspend the rest of the trigger for the given duration. */
export function wait(amount: Expr, unit: TimeUnit): Stmt {
  return withLoc({ kind: "wait", amount, unit });
}

// ---------------------------------------------------------------------------
// Core language (phase 13): custom functions
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts (six rounds; see
// the development log):
//
// - A function is global: callable from any script, before or
//   after its definition in file order. Names are case-sensitive.
// - Parameters are local variables of the call's fresh frame,
//   named after the parameter, and writable. Locals never leak
//   between the caller and the callee, nor between calls; globals
//   are shared as usual. Recursion works — every call is a frame.
// - Calls are resolved by signature. A value whose type does not
//   match its parameter is NOT converted: literals fail Skript's
//   parse, and a runtime value simply leaves the parameter unset
//   (the body still runs). Passing a missing value does the same —
//   and does not trigger the parameter's default: defaults apply
//   only to omitted arguments. Defaults are arbitrary expressions
//   evaluated at call time before any parameter is bound, so they
//   can read globals but never the arguments.
// - return carries a value (Skript has no bare return); it exits
//   the function at once, from inside loops too, and the value is
//   type-checked against the declared return type (a mismatch at
//   runtime means the call yields no value). A value function
//   that never returns yields no value. Early exit without a
//   value is stopTrigger() (Skript's `stop`).
// - A plural parameter (a type like "numbers") collects the
//   remaining arguments: spread values, one list, or a single
//   value all work, and inside the body it is the local list
//   {_name::*}. A function declared with a plural return type
//   ("objects") returns a list; assigning a multi-value result
//   to a scalar variable yields no value.
// - Function bodies have no event context (player and friends
//   are a parse error under Skript — pass what you need in as a
//   parameter). A wait inside a function detaches: the caller
//   resumes the moment the wait starts, the call yields no value,
//   the rest of the body still runs later, and any return after
//   the wait is lost (Skript warns about exactly this at parse).
// ---------------------------------------------------------------------------

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "number", "numbers", "text", "texts", "boolean", "booleans",
  "player", "players", "location", "locations", "object", "objects",
  "block", "item", "entity", "timespan", "timespans",
]);

function requireFunctionName(name: string): string {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new RangeError(`invalid function name: ${String(name)}`);
  }
  return name;
}

function requireFunctionType(type: FunctionTypeName, what: string): FunctionTypeName {
  if (!FUNCTION_TYPES.has(type)) {
    throw new RangeError(`invalid ${what} type: ${String(type)}`);
  }
  return type;
}

/** True for a plural function type ("numbers", "objects", ...): it takes / returns a list. */
export function isPluralType(type: FunctionTypeName): boolean {
  return type.endsWith("s");
}

/**
 * Construct one parameter of a custom function: a name and a
 * Skript type, plus an optional default expression (used only
 * when a call omits the argument). A plural type ("numbers",
 * "objects", ...) makes the parameter collect the remaining
 * arguments as a list; it must be the last parameter.
 */
export function param(name: string, type: FunctionTypeName, defaultValue?: Expr): FunctionParam {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new RangeError(`invalid parameter name: ${String(name)}`);
  }
  requireFunctionType(type, "parameter");
  if (defaultValue === undefined) return { name, type };
  return { name, type, default: defaultValue };
}

/**
 * Construct a custom function declaration: a name, its parameters
 * (from param()), a return type (null for a void function) and a
 * body. Functions are top-level declarations, like events and
 * commands, and are callable from anywhere in the program.
 */
export function defineFunction(
  name: string,
  params: readonly FunctionParam[],
  returnType: FunctionTypeName | null,
  body: readonly Stmt[],
): TopLevel {
  requireFunctionName(name);
  if (returnType !== null) requireFunctionType(returnType, "return");
  const plurals = params.filter((p) => isPluralType(p.type));
  if (plurals.length > 1) {
    throw new RangeError(`function ${name}: at most one plural parameter is allowed`);
  }
  if (plurals.length === 1 && params[params.length - 1] !== plurals[0]) {
    throw new RangeError(`function ${name}: a plural parameter must be the last parameter`);
  }
  return withLoc({ kind: "function", name, params, returnType, body });
}

/** Construct a function-call expression: invoke a custom function and use its return value. */
export function call(name: string, ...args: Expr[]): Expr {
  return { kind: "functionCall", name: requireFunctionName(name), args };
}

/** Construct a function-call statement: invoke a custom function for its effects, discarding any return value. */
export function callStmt(name: string, ...args: Expr[]): Stmt {
  return withLoc({ kind: "callStmt", name: requireFunctionName(name), args });
}

/**
 * Construct a return statement: hand the value back to the caller
 * and exit the function immediately. Only meaningful inside a
 * defineFunction body whose return type is not null (Skript
 * rejects it elsewhere, and rejects it in void functions too).
 */
export function returnValue(value: Expr): Stmt {
  return withLoc({ kind: "return", value });
}

/**
 * Construct a stop statement (Skript's `stop`): end the current
 * trigger at once. Inside a function the call completes with no
 * value; in an event or command the rest of the body is skipped.
 */
export function stopTrigger(): Stmt {
  return withLoc({ kind: "stop" });
}

/** Construct an on-join event. */
export function onJoin(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "join", body });
}

/** Construct an on-first-join event. */
export function onFirstJoin(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "firstJoin", body });
}

/** Construct an on-quit event. */
export function onQuit(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "quit", body });
}

/** Construct an on-chat event. */
export function onChat(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "chat", body });
}

/** Filter options for onDeath: the victim types of the "of" slot — the death header's only slot (phase 22). */
export interface DeathEventFilter {
  victim?: TypeNameFilter;
}

/**
 * Construct an on-death event: a living entity — ANY living
 * entity, not just a player — dies (phase 22 generalized the
 * v0 player-only form to the original's semantics, probed
 * against the real Skript 2.17.1). Inside, victim() is the
 * entity that died and attacker() is the entity whose damage
 * killed it (the damager of its last damage cause — any
 * entity, not just a killer player; no value for environmental
 * or command deaths). The original has NO player / event-entity
 * value in death events (parse errors there), and its header
 * takes no attacker filter — to react to a kind of killer,
 * filter the victim here and compare typeOf(attacker()) in the
 * body. The optional filter restricts the handler to the named
 * victim types ("on death of zombie").
 */
export function onDeath(body: readonly Stmt[], filter?: DeathEventFilter): TopLevel {
  requireFilterKeys(filter, ["victim"], "onDeath");
  const f: EventFilter = {};
  if (filter?.victim !== undefined) f.victimTypes = requireTypeNames(filter.victim, "victim");
  return withLoc(eventWithFilter("death", body, f));
}

// ---------------------------------------------------------------------------
// Core language (phase 14): gameplay events — block break / place,
// right / left click, damage
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts and mineflayer
// behavior tests (see the development log):
//
// - Each event starts as the unfiltered form ("on block break",
//   "on damage"); Skript's filtered forms ("on break of stone",
//   "on damage of player by zombie") arrived in phase 16 — see
//   the filter options on the builders below.
// - eventBlock() is the block the event is about; a click into
//   air has no block. eventItem() is the item in the player's
//   hand for click events and the item being placed for place
//   events; in break events it is the broken block in item form
//   (NOT the tool in hand — verified live: digging grass with a
//   sword in hand reported "grass block"). In damage events
//   victim() is the entity
//   taking damage and attacker() the entity that caused it —
//   attacker() has no value for environmental damage (fall,
//   lava, ...). damageAmount() is the event's current amount:
//   it reflects setDamage() writes made earlier in the handler.
//   damageCause() is the cause as a text ("entity attack").
// - The bare player()/eventPlayer() are NOT defined in damage
//   events — Skript rejects them at parse time ("There's no
//   player in an on damage event"), and the engine mirrors that
//   by leaving both unset there. Use victim()/attacker().
// - cancelEvent() prevents the action the event describes (the
//   block stays, the damage is not applied); uncancelEvent()
//   undoes a cancellation made earlier in the same event.
// - typeOf() yields a value's Skript type name; comparing it
//   against item("...") literals is the supported way to test
//   what a block or item is. A missing value has no type.
// ---------------------------------------------------------------------------

/** Construct an on-block-break event: a player breaks a block. The optional filter restricts it to the named block types ("on break of stone"). */
export function onBlockBreak(body: readonly Stmt[], filter?: BlockEventFilter): TopLevel {
  return withLoc(eventWithFilter("blockBreak", body, blockFilter(filter, "onBlockBreak")));
}

/** Construct an on-block-place event: a player places a block. The optional filter restricts it to the named block types ("on place of stone"). */
export function onBlockPlace(body: readonly Stmt[], filter?: BlockEventFilter): TopLevel {
  return withLoc(eventWithFilter("blockPlace", body, blockFilter(filter, "onBlockPlace")));
}

/** Construct an on-right-click event: a player right-clicks a block, an entity, or air. The optional filter restricts it by clicked block, clicked entity and/or held item ("on right click on a villager with a stick"). */
export function onRightClick(body: readonly Stmt[], filter?: ClickEventFilter): TopLevel {
  return withLoc(eventWithFilter("rightClick", body, clickFilter(filter, "onRightClick")));
}

/** Construct an on-left-click event: a player left-clicks a block or air (attacking an entity is the damage event, not a click). The optional filter restricts it like onRightClick's. */
export function onLeftClick(body: readonly Stmt[], filter?: ClickEventFilter): TopLevel {
  return withLoc(eventWithFilter("leftClick", body, clickFilter(filter, "onLeftClick")));
}

/** Construct an on-damage event: an entity takes damage from any cause. The optional filter restricts it by victim and/or attacker type ("on damage of player by zombie"; either side may be filtered alone). */
export function onDamage(body: readonly Stmt[], filter?: DamageEventFilter): TopLevel {
  requireFilterKeys(filter, ["victim", "attacker"], "onDamage");
  const f: EventFilter = {};
  if (filter?.victim !== undefined) f.victimTypes = requireTypeNames(filter.victim, "victim");
  if (filter?.attacker !== undefined) f.attackerTypes = requireTypeNames(filter.attacker, "attacker");
  return withLoc(eventWithFilter("damage", body, f));
}

// ---------------------------------------------------------------------------
// Core language (phase 16): filtered event forms, the clicked
// entity, and more events — pickup, drop, respawn, bed enter /
// leave.
//
// Filter design: Skript's filtered headers are literal type
// lists in the script text, not runtime expressions, so the TS
// API takes the type NAMES as plain strings (one name or an
// array) in a trailing options object whose keys name the
// header slots — { block } for "of <blocks>" on break/place,
// { victim, attacker } for "of <victims> by <attackers>" on
// damage, { block, entity, item } for "on <blocks/entities>
// with <items>" on clicks, { item } for "of <items>" on
// pickup/drop. An Expr-based filter would falsely promise that
// variables work in a header. Matching is by Skript type name —
// the same names typeOf() prints and item("...") literals use
// ("stone", "grass block", "zombie", "player"). Every slot
// present must match; a slot whose value the event lacks (an
// attacker filter on fall damage) never matches. Probed against
// the real Skript 2.17.1 (development log, phase 16): all of
// these header shapes parse — including a by-only damage filter
// and both orders of the click on/with combination — and the
// filters match by Bukkit entity/material type at runtime.
//
// The new events are the player forms, like Skript's bare
// headers: the bare "on pick up" / "on drop" do NOT fire for
// mobs (verified live — a zombie picking up wheat fired only
// Skript's explicit "entity pick up" variant). Phase 22 added
// those entity forms (onEntityPickup / onEntityDrop, below)
// and the fishing sub-events. Inside pickup/drop, eventItem()
// is the item stack involved and player() the picker/dropper.
// Respawn is NOT cancellable (Skript rejects "cancel event"
// inside it at parse time); bed enter is, bed leave is not.
// Inside the bed events eventBlock() is the bed.
// ---------------------------------------------------------------------------

/** A Skript type name ("stone", "zombie") or a list of names, for one event filter slot. */
export type TypeNameFilter = string | readonly string[];

/** Filter options for onBlockBreak / onBlockPlace: the block types of the "of" slot. */
export interface BlockEventFilter {
  block?: TypeNameFilter;
}

/** Filter options for onDamage: the victim types of the "of" slot and the attacker types of the "by" slot. */
export interface DamageEventFilter {
  victim?: TypeNameFilter;
  attacker?: TypeNameFilter;
}

/** Filter options for onRightClick / onLeftClick: the clicked block types ("on"), the clicked entity types ("on") and the held item types ("with"). Block and entity are mutually exclusive — a click has either a block or an entity target. */
export interface ClickEventFilter {
  block?: TypeNameFilter;
  entity?: TypeNameFilter;
  item?: TypeNameFilter;
}

/** Filter options for onPickup / onDrop: the item types of the "of" slot. */
export interface ItemEventFilter {
  item?: TypeNameFilter;
}

function requireTypeNames(value: TypeNameFilter, slot: string): readonly string[] {
  const names = typeof value === "string" ? [value] : [...value];
  if (names.length === 0) {
    throw new RangeError(`event filter "${slot}" must name at least one type`);
  }
  for (const name of names) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new RangeError(`event filter "${slot}" contains an empty type name`);
    }
  }
  return names;
}

function requireFilterKeys(
  opts: object | undefined,
  allowed: readonly string[],
  what: string,
): void {
  if (opts === undefined) return;
  for (const key of Object.keys(opts)) {
    if (!allowed.includes(key)) {
      throw new RangeError(`${what} has no "${key}" filter slot`);
    }
  }
}

function eventWithFilter(
  event: "blockBreak" | "blockPlace" | "rightClick" | "leftClick" | "damage" | "death" | "pickup" | "drop" | "entityPickup" | "entityDrop",
  body: readonly Stmt[],
  filter: EventFilter,
): TopLevel {
  return Object.keys(filter).length === 0
    ? { kind: "event", event, body }
    : { kind: "event", event, body, filter };
}

function blockFilter(filter: BlockEventFilter | undefined, what: string): EventFilter {
  requireFilterKeys(filter, ["block"], what);
  const f: EventFilter = {};
  if (filter?.block !== undefined) f.ofTypes = requireTypeNames(filter.block, "block");
  return f;
}

function clickFilter(filter: ClickEventFilter | undefined, what: string): EventFilter {
  requireFilterKeys(filter, ["block", "entity", "item"], what);
  if (filter?.block !== undefined && filter?.entity !== undefined) {
    throw new RangeError(`${what}: a click filter cannot name both a block and an entity target`);
  }
  const f: EventFilter = {};
  if (filter?.block !== undefined) f.onTypes = requireTypeNames(filter.block, "block");
  if (filter?.entity !== undefined) f.onEntityTypes = requireTypeNames(filter.entity, "entity");
  if (filter?.item !== undefined) f.withTypes = requireTypeNames(filter.item, "item");
  return f;
}

/** Construct an on-pickup event: a player picks up an item from the ground. The optional filter restricts it to the named item types ("on pick up of wheat"). */
export function onPickup(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item"], "onPickup");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("pickup", body, f));
}

/** Construct an on-drop event: a player drops an item from their inventory. The optional filter restricts it to the named item types ("on drop of an egg"); cancelling it keeps the item. */
export function onDrop(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item"], "onDrop");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("drop", body, f));
}

// ---------------------------------------------------------------------------
// Core language (phase 22): event generalization — the entity
// pickup / drop forms and the fishing sub-events.
//
// Entity pickup / drop (probed live against the real Skript
// 2.17.1): the explicit entity forms fire for EVERY entity —
// mobs AND players (a player picking up wheat fires both the
// bare and the entity form). Inside, eventEntity() is the
// picker / dropper, eventItem() the stack involved, player()
// is the picker when it is a player and has no value for a
// mob, and droppedItemEntity() (drop only) is the dropped
// Item entity itself, whose stack itemOfEntity() reads. The
// entity drop form does NOT fire for player drops (a player's
// toss is the bare form's event; Bukkit keeps the two in
// separate events, and Skript mirrors that) — a chicken
// laying an egg is the canonical entity drop. A NoAI mob
// never lays / picks up in the original's world either (its
// EggLayTime freezes), which the behavior tests respect.
//
// Fishing: the original (2.10+) has no generic fishing event;
// PlayerFishEvent states map one-to-one onto sub-event
// headers, all probed live (state names are what
// eventFishingState() prints):
//   cast (FISHING)         -> onFishCast          "fishing line cast"
//   approach (LURED)       -> onFishApproach      "lured"
//   bite (BITE)            -> onFishBite          "bite"
//   caught fish (CAUGHT_FISH)   -> onFishCaught   "fish caught"
//   caught entity (CAUGHT_ENTITY) -> onEntityHooked "entity caught"
//   in ground (IN_GROUND)  -> onHookInGround      "bobber in ground"
//   escape (FAILED_ATTEMPT) -> onFishEscape       "fish escape"
//   reel in (REEL_IN)      -> onFishReelIn        "reel in"
// and onFishingStateChange fires for every state. The escape
// state fires when the bite window lapses unreeled (~1s after
// the bite — probed), which is what makes it testable: wait
// for the bite broadcast, then simply do not reel. Inside
// fishing events player() is the fisher, fishingHook() the
// hook entity (type name "fish hook"); in fish-caught events
// eventEntity() / droppedItemEntity() are the caught Item
// entity and itemOfEntity(eventEntity()) is the caught stack
// — fishing events have NO event-item (a parse error in the
// original). In entity-hooked events eventEntity() and
// hookedEntity() are both the caught entity. The fishing
// wait-time / bite-time / approach-angle expressions are NOT
// offered: they read and write timespans, and this subset has
// no timespan value type (the same prerequisite recorded for
// title timings in phase 21).
// ---------------------------------------------------------------------------

/** Construct an entity-pickup event: ANY entity (a mob, or a player too) picks up an item. The optional filter restricts it to the named item types ("on entity pick up of wheat"). */
export function onEntityPickup(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item"], "onEntityPickup");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("entityPickup", body, f));
}

/** Construct an entity-drop event: a NON-player entity drops an item (a chicken laying an egg). Player drops are the bare onDrop form. The optional filter restricts it to the named item types ("on entity drop of egg"). */
export function onEntityDrop(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item"], "onEntityDrop");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("entityDrop", body, f));
}

/** Construct a fish-cast event: a player casts a fishing line (state "fishing line cast"). */
export function onFishCast(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishCast", body });
}

/** Construct a fish-approach event: a fish is approaching the bobber (state "lured"). */
export function onFishApproach(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishApproach", body });
}

/** Construct a fish-bite event: a fish bites the hook (state "bite"). Reel in promptly or the fish escapes. */
export function onFishBite(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishBite", body });
}

/** Construct a fish-caught event: the player reels in a fish (state "fish caught"). The caught stack is itemOfEntity(eventEntity()). */
export function onFishCaught(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishCaught", body });
}

/** Construct an entity-hooked event: the hook catches an entity (state "entity caught"). hookedEntity() / eventEntity() are the caught entity. */
export function onEntityHooked(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "entityHooked", body });
}

/** Construct a hook-in-ground event: the bobber hits the ground (state "bobber in ground"). */
export function onHookInGround(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "hookInGround", body });
}

/** Construct a fish-escape event: the bite window lapsed without a reel-in and the fish got away (state "fish escape"). */
export function onFishEscape(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishEscape", body });
}

/** Construct a fish-reel-in event: the player reels the line in without a catch (state "reel in"). */
export function onFishReelIn(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishReelIn", body });
}

/** Construct a fishing-state-change event: fires for EVERY fishing state; read the state with eventFishingState(). */
export function onFishingStateChange(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "fishingStateChange", body });
}

/** Construct an event-entity expression: the entity an entity pickup / drop is about; in fishing events, the caught entity (or the caught Item entity for a fish). */
export function eventEntity(): Expr {
  return { kind: "eventEntity" };
}

/** Construct a hooked-entity expression: the entity a fishing hook caught (entity-hooked events). */
export function hookedEntity(): Expr {
  return { kind: "hookedEntity" };
}

/** Construct a fishing-hook expression: the hook (bobber) entity of a fishing event; its type name is "fish hook". */
export function fishingHook(): Expr {
  return { kind: "fishingHook" };
}

/** Construct an event-fishing-state expression: the state of a fishing event as its name text ("bite", "fish caught", ...). */
export function eventFishingState(): Expr {
  return { kind: "eventFishingState" };
}

const FISHING_STATE_NAMES: readonly FishingStateName[] = [
  "fishing line cast", "lured", "bite", "fish caught",
  "entity caught", "bobber in ground", "fish escape", "reel in",
];

/** Construct a fishing-state literal: the value eventFishingState() compares against, written bare in the .sk text like a weather or game mode literal. */
export function fishingState(name: FishingStateName): Expr {
  if (!FISHING_STATE_NAMES.includes(name)) {
    throw new RangeError(`unknown fishing state "${name}"`);
  }
  return { kind: "fishingState", name };
}

/** Construct an event-dropped-item expression: the dropped Item entity of an entity drop or a fish catch. */
export function droppedItemEntity(): Expr {
  return { kind: "droppedItemEntity" };
}

/** Construct an item-of expression: the item stack an Item entity carries (the caught fish, the dropped item); no value for other entities. */
export function itemOfEntity(target: Expr): Expr {
  return { kind: "itemOfEntity", target };
}

/** Construct an on-respawn event: a player respawns after death. Not cancellable. */
export function onRespawn(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "respawn", body });
}

/** Construct an on-bed-enter event: a player gets into a bed. eventBlock() is the bed; the event is cancellable. */
export function onBedEnter(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "bedEnter", body });
}

/** Construct an on-bed-leave event: a player gets out of a bed. eventBlock() is the bed; the event is not cancellable. */
export function onBedLeave(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "bedLeave", body });
}

/** Construct an event-block expression: the block of a block break / place / click event (no value for air clicks). */
export function eventBlock(): Expr {
  return { kind: "eventBlock" };
}

/** Construct an event-item expression: the item a click / place event involves (hand / placed item); in break events, the broken block in item form. */
export function eventItem(): Expr {
  return { kind: "eventItem" };
}

/** Construct an attacker expression: the entity that caused a damage event (no value for environmental damage). */
export function attacker(): Expr {
  return { kind: "attacker" };
}

/** Construct a clicked-entity expression: the entity a right click interacted with (no value for block or air clicks). */
export function clickedEntity(): Expr {
  return { kind: "clickedEntity" };
}

/** Construct a damage-amount expression: the current damage of the damage event being handled. */
export function damageAmount(): Expr {
  return { kind: "damageAmount" };
}

/** Construct a damage-cause expression: the cause of a damage event as a text ("entity attack", "fall", ...). */
export function damageCause(): Expr {
  return { kind: "damageCause" };
}

/** Construct a type-of expression: the Skript type name of the value ("grass block", "player", ...), or no value. */
export function typeOf(target: Expr): Expr {
  return { kind: "typeOf", target };
}

/** Construct a cancel-event statement: cancel the event the current trigger is handling. */
export function cancelEvent(): Stmt {
  return withLoc({ kind: "cancelEvent" });
}

/** Construct an uncancel-event statement: undo a cancellation of the event being handled. */
export function uncancelEvent(): Stmt {
  return withLoc({ kind: "uncancelEvent" });
}

/** Construct a set-damage statement: rewrite the amount of the damage event being handled. */
export function setDamage(value: Expr): Stmt {
  return withLoc({ kind: "setDamage", value });
}

/** The section entries a command declaration can carry (phase 20). */
export interface CommandOptions {
  /**
   * The permission a sender must hold to run the command. Senders
   * without it cannot address the command at all: under the real
   * Skript (2.17.1, Brigadier) the attempt fails exactly like an
   * unknown command, and the engine mirrors that. (The original's
   * separate "permission message" entry is deprecated there and
   * the message is never delivered, so the subset has no such
   * option.)
   */
  permission?: string;
  /** Text sent verbatim to the sender when required arguments are missing. */
  usage?: string;
  /** Alternative names for the command, with or without a leading slash. */
  aliases?: readonly string[];
}

const COMMAND_ARG_TYPES: ReadonlySet<string> = new Set([
  "text", "player", "offlinePlayer", "integer", "number", "boolean", "item",
]);

/** Construct one typed argument for the multi-argument form of command(). */
export function cmdArg(type: CommandArgType, optional = false): CommandArgSpec {
  if (!COMMAND_ARG_TYPES.has(type)) {
    throw new RangeError(`unknown command argument type: ${String(type)}`);
  }
  return { type, optional };
}

function isSpecList(
  args: CommandArgType | null | readonly CommandArgSpec[],
): args is readonly CommandArgSpec[] {
  return Array.isArray(args);
}

function requireCommandName(name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new RangeError(`invalid command name: ${JSON.stringify(name)}`);
  }
}

/**
 * Construct a command declaration. Two forms:
 *
 * - Legacy: `command(name, argType | null, body, argOptional?)` —
 *   at most one argument; the argument is optional unless the
 *   fourth parameter says otherwise.
 * - General (phase 20): `command(name, cmdArg(...)[], body,
 *   options?)` — any number of typed arguments, plus the
 *   permission / usage / aliases section entries via
 *   CommandOptions (the legacy form accepts an options object as
 *   its fourth argument too).
 */
export function command(
  name: string,
  args: CommandArgType | null | readonly CommandArgSpec[],
  body: readonly Stmt[],
  extra?: boolean | CommandOptions,
): TopLevel {
  requireCommandName(name);
  let specs: readonly CommandArgSpec[];
  let options: CommandOptions | undefined;
  if (isSpecList(args)) {
    if (typeof extra === "boolean") {
      throw new RangeError(
        "the multi-argument form of command() takes CommandOptions as its fourth argument, not the legacy boolean",
      );
    }
    options = extra;
    specs = args.map((a) => cmdArg(a.type, a.optional === true));
  } else {
    options = typeof extra === "object" ? extra : undefined;
    const optional = typeof extra === "boolean" ? extra : args !== null;
    specs = args === null ? [] : [{ type: args, optional }];
  }
  if (options?.permission !== undefined && !/^\S+$/.test(options.permission)) {
    throw new RangeError(`invalid command permission: ${JSON.stringify(options.permission)}`);
  }
  if (options?.usage !== undefined && (options.usage === "" || /[\r\n]/.test(options.usage))) {
    throw new RangeError("command usage must be a single non-empty line");
  }
  const aliases = options?.aliases?.map((a) => {
    const bare = a.startsWith("/") ? a.slice(1) : a;
    if (!/^[A-Za-z0-9_-]+$/.test(bare)) {
      throw new RangeError(`invalid command alias: ${JSON.stringify(a)}`);
    }
    return a;
  });
  return withLoc({
    kind: "command",
    name,
    args: specs,
    ...(options?.permission !== undefined ? { permission: options.permission } : {}),
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    ...(aliases !== undefined && aliases.length > 0 ? { aliases } : {}),
    body,
  });
}

/** Construct a script from top-level declarations. */
export function script(...body: TopLevel[]): Script {
  return { kind: "script", body };
}

// ---------------------------------------------------------------------------
// Engine builtins (MundoSK slice, phase 6)
//
// These builders produce nodes the .sk emitter intentionally does not
// support: the features live in the skript-ts engine jar itself, not in
// a separate addon plugin and not in Skript text. A script using any of
// them is detected as engine-only at build time (see ir.ts) and is
// deployed as IR only.
// ---------------------------------------------------------------------------

function requireWsId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("websocket id must be a non-empty string");
  }
  return id;
}

/** Construct a websocket-connect statement (engine builtin). */
export function wsConnect(id: string, url: TextExpr): Stmt {
  return withLoc({ kind: "wsConnect", id: requireWsId(id), url });
}

/** Construct a websocket-send statement (engine builtin). */
export function wsSend(id: string, message: TextExpr): Stmt {
  return withLoc({ kind: "wsSend", id: requireWsId(id), message });
}

/** Construct a websocket-disconnect statement (engine builtin). */
export function wsDisconnect(id: string): Stmt {
  return withLoc({ kind: "wsDisconnect", id: requireWsId(id) });
}

/** Construct an on-websocket-open event (engine builtin). */
export function onWsOpen(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsOpen", body });
}

/** Construct an on-websocket-message event (engine builtin). */
export function onWsMessage(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsMessage", body });
}

/** Construct an on-websocket-close event (engine builtin). */
export function onWsClose(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "wsClose", body });
}

/** Construct a websocket-message expression: the text received, inside wsMessage events. */
export function wsMessage(): Expr {
  return { kind: "wsMessage" };
}

/** Construct a websocket-id expression: the connection id, inside websocket events. */
export function wsId(): Expr {
  return { kind: "wsId" };
}

// worldOf moved to the core language in phase 18 — see the
// phase-18 section at the end of this file.

/** Construct a border-size expression (engine builtin): the current size of a world's border. */
export function borderSize(world: Expr): Expr {
  return { kind: "borderSize", world };
}

/** Construct a border-center expression (engine builtin): the center location of a world's border. */
export function borderCenter(world: Expr): Expr {
  return { kind: "borderCenter", world };
}

/** Construct a set-border-size statement (engine builtin). */
export function setBorderSize(world: Expr, size: Expr): Stmt {
  return withLoc({ kind: "setBorderSize", world, size });
}

/** Construct a set-border-center statement (engine builtin). */
export function setBorderCenter(world: Expr, center: Expr): Stmt {
  return withLoc({ kind: "setBorderCenter", world, center });
}

// ---------------------------------------------------------------------------
// Engine builtins (SharpSK slice, phase 7): named countdown timers
//
// Timers are SharpSK's headline standalone feature, reimplemented on
// the Bukkit scheduler. A timer is created with a name and a duration
// in seconds; the tick event fires every second while it runs (after
// the remaining time is decremented, while it is still above zero),
// and the complete event fires once when the countdown reaches zero,
// after which the timer no longer exists. Stopping removes a timer
// silently; pausing freezes it (still active, no ticks). Creating a
// timer whose name is already in use restarts it.
// ---------------------------------------------------------------------------

function requireTimerId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("timer id must be a non-empty string");
  }
  return id;
}

/** Construct a timer-create statement (engine builtin): start a named countdown of the given seconds. */
export function timerCreate(id: string, seconds: Expr): Stmt {
  return withLoc({ kind: "timerCreate", id: requireTimerId(id), seconds });
}

/** Construct a timer-stop statement (engine builtin): remove a timer without firing its complete event. */
export function timerStop(id: string): Stmt {
  return withLoc({ kind: "timerStop", id: requireTimerId(id) });
}

/** Construct a timer-pause statement (engine builtin): freeze a timer's countdown. */
export function timerPause(id: string): Stmt {
  return withLoc({ kind: "timerPause", id: requireTimerId(id) });
}

/** Construct a timer-resume statement (engine builtin): continue a paused timer. */
export function timerResume(id: string): Stmt {
  return withLoc({ kind: "timerResume", id: requireTimerId(id) });
}

/** Construct an on-timer-tick event (engine builtin): fires every second while a timer runs. */
export function onTimerTick(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "timerTick", body });
}

/** Construct an on-timer-complete event (engine builtin): fires once when a timer's countdown reaches zero. */
export function onTimerComplete(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "timerComplete", body });
}

/** Construct a timer-id expression: the name of the timer, inside timer events. */
export function timerId(): Expr {
  return { kind: "timerId" };
}

/** Construct a timer-time-left expression (engine builtin): seconds remaining on the named timer, or no value when it is not active. */
export function timerTimeLeft(name: Expr): Expr {
  return { kind: "timerTimeLeft", name };
}

/** Construct a timer-active condition (engine builtin): the named timer exists (running or paused). */
export function timerActive(name: TextExpr): Cond {
  return { kind: "timerActive", name };
}

// ---------------------------------------------------------------------------
// Engine builtins (skript-db slice, phase 8): SQL data sources
//
// A data source is a value: build one from a documented URL and keep
// it in a variable, as in `set(variable("sql"), dataSource(str(
// "sqlite:data.db")))`. Supported URL forms are "sqlite:<path>"
// (relative paths resolve under the engine's data folder),
// "mysql://host[:port]/db?user=..&password=..", "mariadb://..." and
// "postgresql://..."; credentials travel as query parameters.
//
// dbExecute runs one statement. The query is a text expression: its
// literal parts are the author's own SQL, and every expression part
// of a format is bound by the engine as a JDBC parameter — values
// are never inlined into the SQL text, so they cannot inject. With a
// store variable, a result set is mapped to entries
// <var>::<column>::<row> (rows are 1-based, previous entries are
// cleared first) and the variable itself is set to the row count;
// for a statement without a result set the variable receives the
// number of affected rows. Execution is synchronous on the calling
// thread; failures do not throw — read dbLastError() afterwards.
// ---------------------------------------------------------------------------

/** Construct a data-source expression (engine builtin) from a documented database URL. */
export function dataSource(url: TextExpr): Expr {
  return { kind: "dataSource", url };
}

/** Construct a database-execute statement (engine builtin): run one SQL statement, optionally storing its result. */
export function dbExecute(datasource: Expr, query: TextExpr, store?: VariableExpr): Stmt {
  if (store === undefined) return withLoc({ kind: "dbExecute", datasource, query });
  return withLoc({ kind: "dbExecute", datasource, query, store });
}

/** Construct a last-database-error expression (engine builtin): the last failed execution's message, or no value. */
export function dbLastError(): Expr {
  return { kind: "dbLastError" };
}

// ---------------------------------------------------------------------------
// Engine builtins (skUtilities slice, phase 9): the text file core
//
// skUtilities' flagship area is file operations; this slice covers
// the core of it as documented behavior — create / delete / write /
// append / read text files, count and pick lines, test existence —
// reimplemented clean-room from the documented behavior (the addon
// is GPL-3.0; no addon code was consulted).
//
// Paths are text expressions. Relative paths resolve under the
// engine's files root (plugins/skript-ts/files/); absolute paths
// and paths that escape the root after normalization are refused —
// statements do nothing, expressions yield no value, the condition
// is false. (The original addon is deliberately non-restrictive
// about paths; the confinement is an engine safety rule, recorded
// in the development log.)
//
// Semantics: fileCreate makes parent directories and an empty file
// and leaves an existing file's contents untouched; fileWrite
// replaces the whole file (UTF-8); fileAppend adds the text plus a
// newline; fileDelete removes a regular file or an *empty*
// directory (no recursive delete). fileContents returns the whole
// file as one string, fileLine is 1-based, fileLineCount counts
// lines (an empty file is 0); all three yield no value for a
// missing file. Failures never throw: they log a warning engine
// side and read as no-ops / no value.
// ---------------------------------------------------------------------------

/** Construct a file-create statement (engine builtin): create an empty file (and parents), leaving an existing file untouched. */
export function fileCreate(path: TextExpr): Stmt {
  return withLoc({ kind: "fileCreate", path });
}

/** Construct a directory-create statement (engine builtin): create a directory including parents. */
export function dirCreate(path: TextExpr): Stmt {
  return withLoc({ kind: "dirCreate", path });
}

/** Construct a file-delete statement (engine builtin): delete a regular file or an empty directory. */
export function fileDelete(path: TextExpr): Stmt {
  return withLoc({ kind: "fileDelete", path });
}

/** Construct a file-write statement (engine builtin): replace a file's whole contents with the text (UTF-8). */
export function fileWrite(path: TextExpr, text: TextExpr): Stmt {
  return withLoc({ kind: "fileWrite", path, text });
}

/** Construct a file-append statement (engine builtin): append the text plus a newline to a file, creating it if needed. */
export function fileAppend(path: TextExpr, text: TextExpr): Stmt {
  return withLoc({ kind: "fileAppend", path, text });
}

/** Construct a file-contents expression (engine builtin): the whole text of a file, or no value when it is missing. */
export function fileContents(path: TextExpr): Expr {
  return { kind: "fileContents", path };
}

/** Construct a file-line expression (engine builtin): the 1-based line of a file, or no value when out of range / missing. */
export function fileLine(path: TextExpr, line: Expr): Expr {
  return { kind: "fileLine", path, line };
}

/** Construct a file-line-count expression (engine builtin): the number of lines in a file, or no value when it is missing. */
export function fileLineCount(path: TextExpr): Expr {
  return { kind: "fileLineCount", path };
}

/** Construct a file-exists condition (engine builtin): a file or directory exists at the path. */
export function fileExists(path: TextExpr): Cond {
  return { kind: "fileExists", path };
}

// ---------------------------------------------------------------------------
// Engine builtins (Ersatz slice, phase 10): PlaceholderAPI integration
//
// Ersatz bridges Skript and PlaceholderAPI (PAPI); this slice
// reimplements that bridge inside the engine, clean-room from the
// documented behavior (the addon is GPL-3.0; no addon code was
// consulted — see the development log for the provenance work and
// the sources used). PAPI itself stays an external plugin: the
// engine declares it as a soft dependency, and when it is absent
// the read expression yields no value and request events never
// fire.
//
// Read side: placeholderValue(player, text) evaluates the PAPI
// placeholders in a text for that player. A text containing no
// %...% token is treated as a single placeholder name (the
// documented bare form, e.g. "player_ping"); a text containing
// %...% tokens is formatted as a whole. Placeholders nobody
// resolves stay in the text literally, per PAPI's own contract.
//
// Write side: onPlaceholderRequest(prefix, body) serves requests
// for that prefix (a PAPI expansion identifier). Inside the body,
// placeholderIdentifier() is the parameter part of the request
// ("%prefix_<identifier>%"), placeholderPrefix() is the prefix
// that matched, and player() is the player the value is computed
// for (no value for offline/console requests). Answer with
// setPlaceholderResult(text); a handler that never sets a result
// leaves the placeholder unresolved.
// ---------------------------------------------------------------------------

function requirePrefixes(prefix: string | readonly string[]): readonly string[] {
  const list = typeof prefix === "string" ? [prefix] : [...prefix];
  if (list.length === 0) {
    throw new RangeError("placeholder request needs at least one prefix");
  }
  for (const p of list) {
    if (typeof p !== "string" || p.trim() === "") {
      throw new RangeError("placeholder prefix must be a non-empty string");
    }
  }
  return list;
}

/** Construct a placeholder-value expression (engine builtin): evaluate PAPI placeholders in a text for a player. */
export function placeholderValue(player: Expr, text: TextExpr): Expr {
  return { kind: "placeholderValue", player, text };
}

/** Construct an on-placeholder-request event (engine builtin): serve PAPI requests for the given prefix(es). */
export function onPlaceholderRequest(prefix: string | readonly string[], body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "papiRequest", prefixes: requirePrefixes(prefix), body });
}

/** Construct a placeholder-identifier expression: the parameter part of the request, inside placeholder-request events. */
export function placeholderIdentifier(): Expr {
  return { kind: "placeholderIdentifier" };
}

/** Construct a placeholder-prefix expression: the prefix that matched, inside placeholder-request events. */
export function placeholderPrefix(): Expr {
  return { kind: "placeholderPrefix" };
}

/** Construct a set-placeholder-result statement (engine builtin): answer the placeholder request being handled. */
export function setPlaceholderResult(text: TextExpr): Stmt {
  return withLoc({ kind: "setPlaceholderResult", text });
}

// ---------------------------------------------------------------------------
// Core language (phase 15): text operations
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts (five rounds;
// see the development log):
//
// - Lengths and indices count UTF-16 code units (an emoji counts
//   2), like Java strings — this is what Skript itself computes.
// - substring is 1-based and inclusive at both ends; `from` is
//   fitted UP to 1 and `to` DOWN to the length, and a fitted range
//   with from > to yields NO value (not an empty text). firstChars
//   and lastChars share the rule with one end pinned, so a count
//   of 0 or less yields no value. charAt is strict: an index
//   outside 1..length yields no value. A missing text yields no
//   value everywhere; an empty text is a real value (length 0).
// - split yields a list: delimiter matching is literal (never a
//   regex) and case-insensitive unless asked otherwise; the
//   trailing empty part is kept, and an empty delimiter yields
//   one part per character plus a trailing empty part. join
//   concatenates a list's text elements only — numbers and other
//   non-text elements are skipped (Skript converts nothing here),
//   players count as their name, and an empty remainder means no
//   value. The default join delimiter is "".
// - contains on texts is a case-INSENSITIVE substring test while
//   startsWith / endsWith are case-SENSITIVE (probed asymmetry of
//   the original); on a list, contains is element membership
//   under the phase-11 equality rules. Missing operands are false.
// - replace rewrites the text held by a scalar variable: literal,
//   case-insensitive matching unless asked otherwise; empty search
//   text inserts at every gap (all) or the start (first); a
//   missing or non-text target is left untouched.
// - colored / formatted parse & codes (including the &x hex
//   sequence) and named MiniMessage-style tags into formatting;
//   uncolored / unformatted strip every formatting code. String
//   literals go through the same parsing in both runtimes
//   (Skript parses literals into components; the engine converts
//   literals to §-coded strings), while values that arrive at
//   runtime — chat text, variable contents — keep their raw &
//   characters until colored / formatted is applied.
// ---------------------------------------------------------------------------

/** Construct a text-length expression: the number of characters (UTF-16 code units) of a text. */
export function textLength(target: Expr): Expr {
  return { kind: "textLength", target };
}

/** Construct a substring expression: characters `from`..`to` of a text, 1-based and inclusive. */
export function substring(target: Expr, from: Expr, to: Expr): Expr {
  return { kind: "substring", target, from, to };
}

/** Construct a first-characters expression: the first `count` characters of a text. */
export function firstChars(target: Expr, count: Expr): Expr {
  return { kind: "firstChars", target, count };
}

/** Construct a last-characters expression: the last `count` characters of a text. */
export function lastChars(target: Expr, count: Expr): Expr {
  return { kind: "lastChars", target, count };
}

/** Construct a character-at expression: the character at a 1-based index of a text. */
export function charAt(target: Expr, index: Expr): Expr {
  return { kind: "charAt", target, index };
}

/** Construct an uppercase expression: a text converted to upper case. */
export function upperCase(target: Expr): Expr {
  return { kind: "upperCase", target };
}

/** Construct a lowercase expression: a text converted to lower case. */
export function lowerCase(target: Expr): Expr {
  return { kind: "lowerCase", target };
}

/**
 * Construct a split expression: split a text at a literal
 * delimiter into a list of texts. Matching is case-insensitive
 * unless `caseSensitive` is true.
 */
export function splitText(target: Expr, delimiter: Expr, caseSensitive = false): Expr {
  return { kind: "splitText", target, delimiter, caseSensitive };
}

/**
 * Construct a join expression: concatenate the text elements of
 * a list (or of a split result) into one text, with an optional
 * delimiter (default "").
 */
export function joinText(source: Expr, delimiter?: Expr): Expr {
  return { kind: "joinText", source, delimiter: delimiter ?? null };
}

/** Construct a colored expression: parse & codes and named tags in a text into formatting. */
export function colored(target: Expr): Expr {
  return { kind: "coloredText", target };
}

/** Construct a formatted expression: like colored(), with Skript's full tag parser. */
export function formatted(target: Expr): Expr {
  return { kind: "formattedText", target };
}

/** Construct an uncolored expression: strip all formatting codes (colors and styles) from a text. */
export function uncolored(target: Expr): Expr {
  return { kind: "uncoloredText", target };
}

/** Construct an unformatted expression: strip all formatting from a text. */
export function unformatted(target: Expr): Expr {
  return { kind: "unformattedText", target };
}

/**
 * Construct a contains condition: for a text container, a
 * case-insensitive substring test; for a list container, element
 * membership under the equality rules.
 */
export function contains(container: Expr, item: Expr): Cond {
  return { kind: "contains", container, item };
}

/** Construct a starts-with condition: a case-sensitive prefix test on a text. */
export function startsWith(target: Expr, prefix: Expr): Cond {
  return { kind: "startsWith", target, prefix };
}

/** Construct an ends-with condition: a case-sensitive suffix test on a text. */
export function endsWith(target: Expr, suffix: Expr): Cond {
  return { kind: "endsWith", target, suffix };
}

/**
 * Construct a replace-all statement: rewrite every occurrence of
 * `find` in the text held by a scalar variable. Matching is
 * literal and case-insensitive unless `caseSensitive` is true.
 */
export function replaceAllIn(target: ScalarVarExpr, find: Expr, replacement: Expr, caseSensitive = false): Stmt {
  return withLoc({ kind: "textReplace", target, find, replacement, firstOnly: false, caseSensitive });
}

/**
 * Construct a replace-first statement: rewrite only the first
 * occurrence of `find` in the text held by a scalar variable.
 * Matching is literal and case-insensitive unless
 * `caseSensitive` is true.
 */
export function replaceFirstIn(target: ScalarVarExpr, find: Expr, replacement: Expr, caseSensitive = false): Stmt {
  return withLoc({ kind: "textReplace", target, find, replacement, firstOnly: true, caseSensitive });
}

// ---------------------------------------------------------------------------
// Core language (phase 17): items, inventories and GUIs
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probes and a mineflayer bot
// (see the development log):
//
// - Item suffixes compose over any item-valued expression:
//   withName / withLore / withAmount materialize a real stack
//   (a bare item name becomes a fresh stack; a stack is cloned).
//   `type of` ignores meta. Equality of two stacks is type +
//   amount plus the meta fields BOTH stacks carry: names compare
//   case-sensitively, lore compares line by line, and a field
//   present on only one side is ignored (a named stack equals a
//   plain one). A stack prints as its type name (pluralized when
//   its amount is above 1) plus " named <name>"; lore never
//   prints.
// - nameOf yields an item's custom name (no value when unnamed),
//   an inventory's title, or a player's name. loreOf yields the
//   lore lines as a list (no value when there is no lore).
//   amountOf yields a stack's size (or a list's size, like
//   Skript's generic amount expression).
// - setItemName / setItemLore / setItemAmount rewrite the item
//   a scalar variable holds; a variable holding a bare type name
//   is materialized first, and a variable with no item value is
//   left untouched.
// - chestInventory builds a fresh virtual chest inventory (rows
//   are clamped to 1..6 by the runtimes) that can be filled via
//   setSlot before or after openInventory shows it.
//   currentInventoryOf reads the inventory a player is viewing
//   — their own crafting inventory when nothing is open.
//   slotItem / setSlot address 0-based slots; a player used as
//   the inventory means their own inventory, and setting a slot
//   to a valueless item expression clears it.
// - onInventoryClick fires for every inventory click (top and
//   bottom halves alike) with eventItem() as the clicked slot's
//   item (no value for an empty slot), eventInventory() as the
//   view's top inventory, and the two slot-index expressions;
//   cancelEvent() inside is the standard GUI guard.
//   onInventoryClose fires when a view closes, by script or by
//   the player. Neither event carries a clicked-block or filter.
// ---------------------------------------------------------------------------

/** Construct a named-item expression: the item with a custom display name (`<item> named <name>`). */
export function withName(base: Expr, name: Expr): Expr {
  return { kind: "itemWithName", base, name };
}

/** Construct a lored-item expression: the item with lore lines (`<item> with lore <a> and <b>`). At least one line is required. */
export function withLore(base: Expr, ...lines: Expr[]): Expr {
  if (lines.length === 0) throw new RangeError("withLore requires at least one lore line");
  return { kind: "itemWithLore", base, lines };
}

/** Construct a counted-item expression: a stack of the item (`<count> of <item>`). */
export function withAmount(base: Expr, amount: Expr): Expr {
  return { kind: "itemWithAmount", base, amount };
}

/** Construct a name-of expression: an item's custom name, an inventory's title, or a player's name. */
export function nameOf(target: Expr): Expr {
  return { kind: "nameOf", target };
}

/** Construct a lore-of expression: an item's lore lines as a list (no value when the item has no lore). */
export function loreOf(target: Expr): Expr {
  return { kind: "loreOf", target };
}

/** Construct an amount-of expression: a stack's size (or a list's size). */
export function amountOf(target: Expr): Expr {
  return { kind: "amountOf", target };
}

/** Construct a chest-inventory expression: a fresh virtual chest inventory with the given rows (1..6) and optional title. */
export function chestInventory(rows: Expr, title?: Expr): Expr {
  return title === undefined
    ? { kind: "chestInventory", rows }
    : { kind: "chestInventory", rows, title };
}

/** Construct a current-inventory expression: the inventory the player is currently viewing. */
export function currentInventoryOf(target: Expr): Expr {
  return { kind: "currentInventory", target };
}

/** Construct an event-inventory expression: the top inventory of an inventory click / close event. */
export function eventInventory(): Expr {
  return { kind: "eventInventory" };
}

/** Construct a slot-item expression: the item in a 0-based slot of an inventory (a player means their own inventory). */
export function slotItem(inventory: Expr, slot: Expr): Expr {
  return { kind: "slotItem", inventory, slot };
}

/** Construct a clicked-slot-index expression: the clicked slot's index within its own inventory (inventory click events). */
export function clickedSlotIndex(): Expr {
  return { kind: "clickedSlotIndex" };
}

/** Construct a clicked-raw-slot-index expression: the clicked slot's index within the whole view (inventory click events). */
export function clickedRawSlotIndex(): Expr {
  return { kind: "clickedRawSlotIndex" };
}

/** Construct a give-item statement: hand an item-valued expression (meta included) to a player. */
export function giveItem(target: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "giveItem", target, item: itemValue });
}

/** Construct a set-item-name statement: rewrite the display name of the item a scalar variable holds. */
export function setItemName(target: ScalarVarExpr, name: Expr): Stmt {
  return withLoc({ kind: "setItemName", target, name });
}

/** Construct a set-item-lore statement: replace the lore of the item a scalar variable holds. At least one line is required. */
export function setItemLore(target: ScalarVarExpr, ...lines: Expr[]): Stmt {
  if (lines.length === 0) throw new RangeError("setItemLore requires at least one lore line");
  return withLoc({ kind: "setItemLore", target, lines });
}

/** Construct a set-item-amount statement: resize the stack a scalar variable holds. */
export function setItemAmount(target: ScalarVarExpr, amount: Expr): Stmt {
  return withLoc({ kind: "setItemAmount", target, amount });
}

/** Construct a set-slot statement: write an item into a 0-based slot of an inventory (a player means their own inventory). */
export function setSlot(inventory: Expr, slot: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "setSlot", inventory, slot, item: itemValue });
}

/** Construct an open-inventory statement: show an inventory value to a player. */
export function openInventory(target: Expr, inventory: Expr): Stmt {
  return withLoc({ kind: "openInventory", target, inventory });
}

/** Construct an open-GUI statement: build a fresh chest inventory (rows 1..6, optional title) and open it to a player. */
export function openGui(target: Expr, rows: Expr, title?: Expr): Stmt {
  return title === undefined
    ? withLoc({ kind: "openGui", target, rows })
    : withLoc({ kind: "openGui", target, rows, title });
}

/** Construct a close-inventory statement: close the inventory view a player has open. */
export function closeInventory(target: Expr): Stmt {
  return withLoc({ kind: "closeInventory", target });
}

/** Construct an inventory-click event: fires for every click in an inventory view, with eventItem / eventInventory / slot indices set. */
export function onInventoryClick(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "inventoryClick", body });
}

/** Construct an inventory-close event: fires when a player closes an inventory view. */
export function onInventoryClose(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "inventoryClose", body });
}

// ---------------------------------------------------------------------------
// Core language (phase 18): world operations and periodical events
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts (four rounds;
// see the development log):
//
// - Blocks and locations are values with agreed print forms: a
//   block prints as '<type>' at <cx>, <cy>, <cz> in world
//   '<name>' using its CENTER coordinates, a location as
//   "x: <x>, y: <y>, z: <z>, yaw: <yaw>, pitch: <pitch> in
//   '<world>'", and locationOf a block is its center location.
// - location() with three arguments builds in the server's main
//   world; the four-argument form takes a world expression.
//   Coordinates read back as the stored doubles
//   (`x-coordinate of ...`). A location shifts by a vector
//   (offsetLocation, the `~` operator); relativeBlock walks from
//   a block or location in an absolute direction (above / below
//   / the cardinals, with an optional block count) or in the
//   facing-relative front / behind, which follow the target
//   location's direction (a block's location faces south).
// - worldOf — an engine builtin since phase 6 — is core
//   language: `world of %player/location/block%` is plain
//   Skript, so the node is no longer engine-only. world(name)
//   is `world "<name>"` (no value for an unknown name).
// - worldTime is the world's clock as an "H:MM" text (0 ticks
//   reads 6:00, 6000 reads 12:00, 18000 reads 0:00);
//   setWorldTime takes a clockTime literal or an expression
//   carrying a clock text (a variable set from worldTime works).
//   The original's timespan set form parses but its effect
//   could not be verified, so it is deliberately not offered.
// - worldWeather reads "clear" / "rain" / "thunder";
//   setWorldWeather takes the name as a literal. Weather values
//   round-trip through variables in the original, but a plain
//   TEXT does not convert (a set from a text variable silently
//   does nothing) and a quoted text never compares equal —
//   hence the dedicated weatherType literal, emitted bare.
// - every() is the periodical trigger. The period is a number
//   literal (expressions are rejected by the original's parser),
//   fractional amounts work, and the units are ticks / seconds /
//   minutes. The first firing comes one full period after load;
//   a reload re-anchors the schedule. The body has no event
//   context.
// - Original-side quirk: this family's composite expressions
//   (and typeOf over a variable) do not parse inside string
//   interpolations in Skript 2.17.1 — assign to a variable and
//   interpolate the variable instead, as the world sample does.
// ---------------------------------------------------------------------------

/** Construct a block-at expression: the block at a location (`block at %location%`). */
export function blockAt(location: Expr): Expr {
  return { kind: "blockAt", location };
}

/**
 * Construct a location expression: Skript's location() function.
 * With three arguments the location is in the server's main
 * world; pass a world expression as the fourth argument to build
 * it in a specific world.
 */
export function location(x: Expr, y: Expr, z: Expr, world?: Expr): Expr {
  return world === undefined
    ? { kind: "locationAt", x, y, z }
    : { kind: "locationAt", x, y, z, world };
}

/** Construct an x-coordinate expression: the x coordinate of a location. */
export function xOf(target: Expr): Expr {
  return { kind: "xOf", target };
}

/** Construct a y-coordinate expression: the y coordinate of a location. */
export function yOf(target: Expr): Expr {
  return { kind: "yOf", target };
}

/** Construct a z-coordinate expression: the z coordinate of a location. */
export function zOf(target: Expr): Expr {
  return { kind: "zOf", target };
}

/** Construct an offset-location expression: a location shifted by the given vector components (`<loc> ~ vector(<dx>, <dy>, <dz>)`). */
export function offsetLocation(location: Expr, dx: Expr, dy: Expr, dz: Expr): Expr {
  return { kind: "offsetLoc", location, dx, dy, dz };
}

const RELATIVE_DIRECTIONS: ReadonlySet<string> = new Set([
  "above", "below", "north", "south", "east", "west", "front", "behind",
]);

/**
 * Construct a relative-block expression: the block `amount`
 * blocks (default 1) in `direction` from a block or location.
 * front / behind follow the target location's facing direction;
 * the other directions are absolute.
 */
export function relativeBlock(target: Expr, direction: RelativeDirection, amount = 1): Expr {
  if (!RELATIVE_DIRECTIONS.has(direction)) {
    throw new RangeError(`invalid relative direction: ${String(direction)}`);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new RangeError("relative block amount must be a positive number");
  }
  return { kind: "relativeBlock", target, direction, amount: num(amount) };
}

/** Construct a world expression by name (`world "<name>"`): the named world, or no value when it does not exist. */
export function world(name: string): Expr {
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("world name must be a non-empty string");
  }
  return { kind: "world", name };
}

/** Construct a world-of expression: the world of a player / location / block expression (core language since phase 18; an engine builtin in phase 6). */
export function worldOf(target: Expr): Expr {
  return { kind: "worldOf", target };
}

/** Construct a world-time expression: the world's clock as an "H:MM" text (`time in %world%`; 0 ticks reads "6:00"). */
export function worldTime(world: Expr): Expr {
  return { kind: "worldTime", world };
}

/**
 * Construct a clock-time literal ("13:00"): a time-of-day value
 * for setWorldTime and for comparisons against worldTime. The
 * text is validated and canonicalized (hour unpadded, minutes
 * two digits), matching how the original prints time values.
 */
export function clockTime(text: string): Expr {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof text === "string" ? text.trim() : "");
  if (m === null) {
    throw new RangeError(`invalid clock time: ${String(text)} (expected "H:MM")`);
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) {
    throw new RangeError(`invalid clock time: ${String(text)} (hour 0-23, minute 0-59)`);
  }
  return { kind: "clockTime", text: `${hour}:${m[2]}` };
}

/** Construct a world-weather expression: the world's weather as a name text (`weather in %world%`). */
export function worldWeather(world: Expr): Expr {
  return { kind: "worldWeather", world };
}

const WEATHER_NAMES: ReadonlySet<string> = new Set(["clear", "rain", "thunder"]);

/** Construct a weather literal (clear / rain / thunder): the value worldWeather reads and weather comparisons use. Emitted bare, as the original's weather literals are. */
export function weatherType(name: WeatherName): Expr {
  if (!WEATHER_NAMES.has(name)) {
    throw new RangeError(`invalid weather name: ${String(name)}`);
  }
  return { kind: "weatherType", name };
}

/** Construct a set-block statement: write an item's material at a location (`set block at <loc> to <item>`); an air item clears the block. */
export function setBlockAt(location: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "setBlock", location, item: itemValue });
}

/** Construct a set-world-time statement: set a world's clock (`set time in <world> to <time>`). The value is a clockTime literal or an expression carrying a clock text. */
export function setWorldTime(world: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setWorldTime", world, value });
}

/** Construct a set-world-weather statement: set a world's weather by name (`set weather in <world> to rain`). */
export function setWorldWeather(world: Expr, name: WeatherName): Stmt {
  if (!WEATHER_NAMES.has(name)) {
    throw new RangeError(`invalid weather name: ${String(name)}`);
  }
  return withLoc({ kind: "setWorldWeather", world, name });
}

/**
 * Construct a periodical trigger: run the body every `amount`
 * `unit` (`every <amount> <unit>:`). The amount is a number
 * literal — the original rejects expression periods at parse
 * time — and may be fractional. The first firing comes one full
 * period after the script loads, and a reload re-anchors the
 * schedule. The body runs with no event context.
 */
export function every(amount: number, unit: TimeUnit, body: readonly Stmt[]): TopLevel {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new RangeError("periodical amount must be a positive number");
  }
  if (unit !== "ticks" && unit !== "seconds" && unit !== "minutes") {
    throw new RangeError(`invalid periodical unit: ${String(unit)}`);
  }
  return withLoc({ kind: "periodical", amount, unit, body });
}
// ---------------------------------------------------------------------------
// Core language (phase 19): player / entity state and effects
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts (five rounds,
// NBT ground truth read back through the server console; see the
// development log):
//
// - Units: health and max health are in HEARTS (half the Bukkit
//   hit points), food level in drumsticks (half the food points),
//   saturation unscaled. Setting health clamps to the maximum
//   (0 kills); setting food rounds to whole points (6.3
//   drumsticks lands on 13 points); setting max health rewrites
//   the attribute base and leaves current health alone;
//   saturation is not clamped to the food level. `heal` refills,
//   `heal by n` heals n hearts.
// - Game mode: reading yields the bare name text; comparing and
//   setting need the bare literal (gameModeType) — a quoted text
//   never compares (it is a parse error in conditions) and a set
//   from a text variable silently does nothing, exactly the
//   phase-18 weather situation.
// - Experience is the TOTAL points (level + progress share);
//   setting it re-derives level and progress, adding adds
//   points. Setting the level preserves the progress fraction.
// - Potions: apply takes a type name, an optional level
//   (default 1) and an optional duration in seconds (default 30
//   seconds in the original — a durationless apply leaves a
//   600-tick effect). Every vanilla type name was probed,
//   including "swiftness" as an alias of speed. Remove takes one
//   type; the original has no remove-all form.
// - Spawn / drop / play sound are the plain effects: spawn
//   [<n> of] <type> at a location or entity (the spawned entity
//   is readable as lastSpawnedEntity), drop an item expression
//   at a location, and play a registry sound name at a location
//   or entity (no volume/pitch options — see ast.ts).
// ---------------------------------------------------------------------------

/** Construct a health expression: the living entity's health in hearts (`health of %entity%`; 10 is full for a player). */
export function healthOf(target: Expr): Expr {
  return { kind: "healthOf", target };
}

/** Construct a max-health expression: the living entity's maximum health in hearts (`max health of %entity%`). */
export function maxHealthOf(target: Expr): Expr {
  return { kind: "maxHealthOf", target };
}

/** Construct a food-level expression: the player's food level in drumsticks (`food level of %player%`; 10 is full). */
export function foodLevelOf(target: Expr): Expr {
  return { kind: "foodLevelOf", target };
}

/** Construct a saturation expression: the player's saturation, unscaled (`saturation of %player%`). */
export function saturationOf(target: Expr): Expr {
  return { kind: "saturationOf", target };
}

/** Construct a game-mode expression: the player's game mode as its name text (`gamemode of %player%`). For comparisons use gameModeType — a plain text never compares equal in the original. */
export function gameModeOf(target: Expr): Expr {
  return { kind: "gameModeOf", target };
}

const GAME_MODE_NAMES: ReadonlySet<string> = new Set([
  "survival", "creative", "adventure", "spectator",
]);

/** Construct a game-mode literal (survival / creative / adventure / spectator): the value gameModeOf compares against and setGameMode writes. Emitted bare, as the original's gamemode literals are. */
export function gameModeType(name: GameModeName): Expr {
  if (!GAME_MODE_NAMES.has(name)) {
    throw new RangeError(`invalid game mode name: ${String(name)}`);
  }
  return { kind: "gameModeType", name };
}

/** Construct an experience expression: the player's total experience points (`experience of %player%`). */
export function experienceOf(target: Expr): Expr {
  return { kind: "experienceOf", target };
}

/** Construct a level expression: the player's experience level (`level of %player%`). */
export function levelOf(target: Expr): Expr {
  return { kind: "levelOf", target };
}

/** Construct a last-spawned-entity expression: the entity the most recent spawn created (`last spawned entity`). */
export function lastSpawnedEntity(): Expr {
  return { kind: "lastSpawnedEntity" };
}

/** Construct a set-health statement (`set health of <target> to <value>`), in hearts; clamps to the maximum, 0 kills. */
export function setHealth(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setHealth", target, value });
}

/** Construct a set-max-health statement (`set max health of <target> to <value>`), in hearts; rewrites the attribute base, current health untouched. */
export function setMaxHealth(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setMaxHealth", target, value });
}

/** Construct a set-food-level statement (`set food level of <target> to <value>`), in drumsticks; rounds to whole food points. */
export function setFoodLevel(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setFoodLevel", target, value });
}

/** Construct a set-saturation statement (`set saturation of <target> to <value>`), unscaled; not clamped to the food level. */
export function setSaturation(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setSaturation", target, value });
}

/** Construct a set-game-mode statement (`set gamemode of <target> to creative`): the mode is a literal name. */
export function setGameMode(target: Expr, name: GameModeName): Stmt {
  if (!GAME_MODE_NAMES.has(name)) {
    throw new RangeError(`invalid game mode name: ${String(name)}`);
  }
  return withLoc({ kind: "setGameMode", target, name });
}

/** Construct a set-experience statement (`set experience of <target> to <value>`): sets the total points exactly; level and progress are re-derived. */
export function setExperience(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setExperience", target, value });
}

/** Construct a set-level statement (`set level of <target> to <value>`): sets the experience level, keeping the progress fraction. */
export function setLevel(target: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setLevel", target, value });
}

/** Construct a heal statement (`heal <target>` or `heal <target> by <amount>`): without an amount, refills to full; with one, heals that many hearts. */
export function heal(target: Expr, amount?: Expr): Stmt {
  return amount === undefined
    ? withLoc({ kind: "heal", target })
    : withLoc({ kind: "heal", target, amount });
}

const ADDABLE_STATE_KINDS: ReadonlySet<string> = new Set([
  "healthOf", "foodLevelOf", "experienceOf", "levelOf",
]);

function requireStateExpr(builder: string, expr: Expr): Expr {
  if (!ADDABLE_STATE_KINDS.has(expr.kind)) {
    throw new RangeError(
      `${builder} target must be a numeric state expression (healthOf / foodLevelOf / experienceOf / levelOf); use add() for variables`,
    );
  }
  return expr;
}

/** Construct an add-to-state statement (`add <value> to health of <target>`): Skript's generic add changer over a numeric state expression. */
export function addTo(expr: Expr, value: Expr): Stmt {
  return withLoc({ kind: "addToExpr", expr: requireStateExpr("addTo", expr), value });
}

/** Construct a remove-from-state statement (`remove <value> from food level of <target>`): Skript's generic remove changer over a numeric state expression. */
export function removeFrom(expr: Expr, value: Expr): Stmt {
  return withLoc({ kind: "removeFromExpr", expr: requireStateExpr("removeFrom", expr), value });
}

/**
 * The potion effect type names of the original (all probed
 * against Skript 2.17.1): the lowercase display names, spaces
 * included. "swiftness" is an accepted alias of "speed".
 */
const POTION_TYPES: ReadonlySet<string> = new Set([
  "absorption", "bad omen", "blindness", "conduit power", "darkness",
  "dolphin's grace", "fire resistance", "glowing", "haste", "health boost",
  "hero of the village", "hunger", "instant damage", "instant health",
  "invisibility", "jump boost", "levitation", "luck", "mining fatigue",
  "nausea", "night vision", "poison", "regeneration", "resistance",
  "slow falling", "slowness", "speed", "strength", "unluck",
  "water breathing", "weakness", "wither", "swiftness",
]);

function requirePotionType(name: string): string {
  const canonical = typeof name === "string" ? name.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (!POTION_TYPES.has(canonical)) {
    throw new RangeError(`invalid potion effect type: ${String(name)}`);
  }
  return canonical;
}

/**
 * Construct an apply-potion statement (`apply <type> [<level>] to
 * <target> [for <seconds> seconds]`). Options: `level` (default
 * 1) and `durationSeconds` (default: the original's 30 seconds).
 */
export function applyPotion(
  target: Expr,
  potion: string,
  options?: { level?: number; durationSeconds?: number },
): Stmt {
  const canonical = requirePotionType(potion);
  const level = options?.level;
  const durationSeconds = options?.durationSeconds;
  if (level !== undefined && (!Number.isInteger(level) || level < 1)) {
    throw new RangeError("potion level must be a positive integer");
  }
  if (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    throw new RangeError("potion duration must be a positive number of seconds");
  }
  return withLoc({
    kind: "applyPotion",
    target,
    potion: canonical,
    ...(level !== undefined ? { level } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  });
}

/** Construct a remove-potion statement (`remove <type> from <target>`): removes one effect type. The original has no remove-all form. */
export function removePotion(target: Expr, potion: string): Stmt {
  return withLoc({ kind: "removePotion", target, potion: requirePotionType(potion) });
}

function requireEntityType(name: string): string {
  const canonical = typeof name === "string" ? name.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ") : "";
  if (!/^[a-z][a-z0-9 ]*$/.test(canonical)) {
    throw new RangeError(`invalid entity type name: ${String(name)}`);
  }
  return canonical;
}

/**
 * Construct a spawn statement (`spawn [<count> of] <type> at
 * <at>`): spawn entities of the named type at a location or at
 * an entity. The last spawned entity is readable afterwards via
 * lastSpawnedEntity(). The count defaults to 1.
 */
export function spawnEntity(entityType: string, at: Expr, count?: number): Stmt {
  const canonical = requireEntityType(entityType);
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    throw new RangeError("spawn count must be a positive integer");
  }
  return withLoc({
    kind: "spawnEntity",
    entityType: canonical,
    at,
    ...(count !== undefined ? { count } : {}),
  });
}

/** Construct a drop-item statement (`drop <item> at <at>`): drop an item-valued expression at a location or at an entity. */
export function dropItem(itemValue: Expr, at: Expr): Stmt {
  return withLoc({ kind: "dropItem", item: itemValue, at });
}

/**
 * Construct a play-sound statement (`play sound "<name>" at
 * <at>`): play the named registry sound at a location or at an
 * entity. The original offers no working volume or pitch option
 * for named sounds (probed), so neither is taken.
 */
export function playSound(name: string, at: Expr): Stmt {
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9_.:/-]*$/i.test(name.trim())) {
    throw new RangeError(`invalid sound name: ${String(name)}`);
  }
  return withLoc({ kind: "playSound", name: name.trim(), at });
}

// ---------------------------------------------------------------------------
// Core language (phase 21): display effects and boss bars
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts whose client
// packets were captured raw (see the development log):
//
// - Titles: `send title %object% [with subtitle %object%] to
//   %player%` plus a timing tail AFTER the target — `for
//   <timespan>` (the stay), `with fadein <timespan>`, `and fade
//   out <timespan>`, in any combination. When at least one
//   timing is given the client receives one times packet with
//   the unspecified parts filled by the defaults (fade-in 10,
//   stay 70, fade-out 20 ticks); with no timing at all no times
//   packet is sent and the client keeps its previous timings.
//   A subtitle-only send (`send subtitle ...`) shows the
//   subtitle under whatever title is up (or the next one). The
//   text slots accept any expression, stringified like a chat
//   message. `clear title of %player%` hides the title;
//   `reset title of %player%` also resets the timings.
// - Action bar: `send action bar %object% to %player%` — one
//   packet, no timing concept.
// - Boss bars (core since Skript 2.16): the create expression
//   `a boss bar` / `a <color> bossbar [with title %text%]`
//   makes a bar value (fresh: empty title, progress 1, white,
//   solid). Properties are written with the change forms
//   (title / color / progress — progress is a fraction 0..1
//   that the original clamps) and the viewer set with
//   add/remove; title and progress read back as expressions.
//   Not offered: keyed bars (the keyed+color+title create form
//   does not parse even in the original, and keyed bars are
//   persistent server storage addressed by key), the section
//   creation form (no section expressions in this subset),
//   bar styles and the darken-sky / fog / boss-music flags.
// ---------------------------------------------------------------------------

/** The optional timing parts of a title send (phase 21, extended in phase 23): a literal timing or any timespan-valued expression for the fade-in, the stay (`for ...`) and the fade-out. Literal timings are normalized into timespan literal expressions; unspecified parts are filled with the original's defaults (10 / 70 / 20 ticks) whenever any timing is given. */
export interface TitleTimingOptions {
  fadeIn?: TitleTiming | Expr;
  stay?: TitleTiming | Expr;
  fadeOut?: TitleTiming | Expr;
}

/** The options of a title send: an optional subtitle plus the optional timing parts. */
export interface SendTitleOptions extends TitleTimingOptions {
  subtitle?: Expr;
}

function isExprValue(value: unknown): value is Expr {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

function requireTitleTiming(label: string, timing: TitleTiming | undefined): void {
  if (timing === undefined) return;
  const validUnit = (
    ["ticks", "seconds", "minutes", "hours", "days", "weeks", "months", "years"] as readonly string[]
  ).includes(timing.unit);
  if (
    typeof timing.amount !== "number" ||
    !Number.isFinite(timing.amount) ||
    timing.amount < 0 ||
    !validUnit
  ) {
    throw new RangeError(`invalid title ${label} timing: ${JSON.stringify(timing)}`);
  }
}

function normalizeTitleTiming(label: string, timing: TitleTiming | Expr | undefined): Expr | undefined {
  if (timing === undefined) return undefined;
  if (isExprValue(timing)) return timing;
  requireTitleTiming(label, timing);
  return { kind: "timespan", amount: timing.amount, unit: timing.unit };
}

function titleTimingFields(options: TitleTimingOptions): {
  fadeIn?: Expr;
  stay?: Expr;
  fadeOut?: Expr;
} {
  const fadeIn = normalizeTitleTiming("fade-in", options.fadeIn);
  const stay = normalizeTitleTiming("stay", options.stay);
  const fadeOut = normalizeTitleTiming("fade-out", options.fadeOut);
  return {
    ...(fadeIn !== undefined ? { fadeIn } : {}),
    ...(stay !== undefined ? { stay } : {}),
    ...(fadeOut !== undefined ? { fadeOut } : {}),
  };
}

/**
 * Construct a send-title statement (`send title <title> [with
 * subtitle <subtitle>] to <target> [for <stay>] [with fadein
 * <fadeIn>] [and fade out <fadeOut>]`): show a title (and an
 * optional subtitle) to a player. With no timing options the
 * client keeps its previous title timings; with any timing
 * given, the rest are filled with the defaults (fade-in 10,
 * stay 70, fade-out 20 ticks) — all probed on the wire.
 */
export function sendTitle(target: Expr, title: Expr, options: SendTitleOptions = {}): Stmt {
  return withLoc({
    kind: "sendTitle",
    target,
    title,
    ...(options.subtitle !== undefined ? { subtitle: options.subtitle } : {}),
    ...titleTimingFields(options),
  });
}

/**
 * Construct a subtitle-only send (`send subtitle <subtitle> to
 * <target> [...]`): set the subtitle under the currently shown
 * title (or the next one), with the same optional timing tail
 * as sendTitle. No title packet is sent.
 */
export function sendSubtitle(target: Expr, subtitle: Expr, options: TitleTimingOptions = {}): Stmt {
  return withLoc({
    kind: "sendTitle",
    target,
    subtitle,
    ...titleTimingFields(options),
  });
}

/** Construct a send-action-bar statement (`send action bar <message> to <target>`): show a message in the player's action bar. The message is any expression, stringified like a chat message. */
export function sendActionBar(target: Expr, message: Expr): Stmt {
  return withLoc({ kind: "sendActionBar", target, message });
}

/** Construct a clear-title statement (`clear title of <target>`): hide the title currently shown to the player. The title timings are kept. */
export function clearTitle(target: Expr): Stmt {
  return withLoc({ kind: "clearTitle", target, reset: false });
}

/** Construct a reset-title statement (`reset title of <target>`): hide the title currently shown to the player AND reset its timings to the client's defaults. */
export function resetTitle(target: Expr): Stmt {
  return withLoc({ kind: "clearTitle", target, reset: true });
}

const BOSS_BAR_COLOR_NAMES: ReadonlySet<string> = new Set([
  "pink", "blue", "red", "green", "yellow", "purple", "white",
]);

const BOSS_BAR_STYLE_NAMES: ReadonlySet<string> = new Set([
  "solid", "6 notches", "10 notches", "12 notches", "20 notches",
]);

const BOSS_BAR_FLAG_NAMES: ReadonlySet<string> = new Set([
  "darkenSky", "createFog", "playBossMusic",
]);

/**
 * Construct a boss bar creation expression (`a boss bar`, `a
 * <color> boss bar`, `a bossbar with title <title>`, or `a
 * <color> bossbar with title <title>`): a new bar value with
 * an empty title, progress 1, white color and a solid style
 * unless the options say otherwise. Store it in a LOCAL
 * variable and add viewers to show it: a bar cannot be saved,
 * and the original rejects storing one in a persistent
 * variable at load time. For a persistent bar, see
 * keyedBossBar below.
 */
export function bossBar(options: { title?: Expr; color?: BossBarColorName } = {}): Expr {
  if (options.color !== undefined && !BOSS_BAR_COLOR_NAMES.has(options.color)) {
    throw new RangeError(`invalid boss bar color name: ${String(options.color)}`);
  }
  return {
    kind: "bossBar",
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.color !== undefined ? { color: options.color } : {}),
  };
}

/** Construct a set-boss-bar-title statement (`set title of <bar> to <title>`). */
export function setBossBarTitle(bar: Expr, title: Expr): Stmt {
  return withLoc({ kind: "setBossBarTitle", bar, title });
}

/** Construct a set-boss-bar-color statement (`set color of <bar> to <name>`): the color is a literal name. */
export function setBossBarColor(bar: Expr, name: BossBarColorName): Stmt {
  if (!BOSS_BAR_COLOR_NAMES.has(name)) {
    throw new RangeError(`invalid boss bar color name: ${String(name)}`);
  }
  return withLoc({ kind: "setBossBarColor", bar, name });
}

/** Construct a set-boss-bar-progress statement (`set progress of <bar> to <value>`): the value is a fraction (1 is full); the original clamps it to 0..1. */
export function setBossBarProgress(bar: Expr, value: Expr): Stmt {
  return withLoc({ kind: "setBossBarProgress", bar, value });
}

/** Construct an add-boss-bar-viewer statement (`add <viewer> to viewers of <bar>`): show the bar to a player. */
export function addBossBarViewer(bar: Expr, viewer: Expr): Stmt {
  return withLoc({ kind: "addBossBarViewer", bar, viewer });
}

/** Construct a remove-boss-bar-viewer statement (`remove <viewer> from viewers of <bar>`): stop showing the bar to a player. */
export function removeBossBarViewer(bar: Expr, viewer: Expr): Stmt {
  return withLoc({ kind: "removeBossBarViewer", bar, viewer });
}

/** Construct a boss bar title expression: the bar's current title text (`title of %bossbar%`). */
export function bossBarTitleOf(bar: Expr): Expr {
  return { kind: "bossBarTitleOf", bar };
}

/** Construct a boss bar progress expression: the bar's current progress as a fraction (`progress of %bossbar%`; 1 is full). */
export function bossBarProgressOf(bar: Expr): Expr {
  return { kind: "bossBarProgressOf", bar };
}

/**
 * Construct a keyed boss bar creation expression (`a keyed boss
 * bar with key <key>`, with optional color and `with title`
 * clauses): evaluating it REPLACES any bar stored under the key
 * with a fresh one (empty title, progress 0) in the server's
 * persistent boss bar storage. Unlike a plain bar, a keyed bar
 * CAN be stored in a persistent variable.
 */
export function keyedBossBar(key: Expr, options: { title?: Expr; color?: BossBarColorName } = {}): Expr {
  if (options.color !== undefined && !BOSS_BAR_COLOR_NAMES.has(options.color)) {
    throw new RangeError(`invalid boss bar color name: ${String(options.color)}`);
  }
  return {
    kind: "keyedBossBar",
    key,
    ...(options.title !== undefined ? { title: options.title } : {}),
    ...(options.color !== undefined ? { color: options.color } : {}),
  };
}

/** Construct a keyed boss bar fetch expression (`boss bar with key <key>`): the bar stored under the key, or no value when the key has no bar. Fetching never creates a bar. */
export function keyedBossBarOf(key: Expr): Expr {
  return { kind: "keyedBossBarOf", key };
}

/** Construct a boss bar key expression (`boss bar key of <bar>`): the full `namespace:key` text of a keyed bar; not set for a plain bar. */
export function bossBarKeyOf(bar: Expr): Expr {
  return { kind: "bossBarKeyOf", bar };
}

/** Construct a boss bar style expression (`style of <bar>`): the style as text — "solid" or "N segments". */
export function bossBarStyleOf(bar: Expr): Expr {
  return { kind: "bossBarStyleOf", bar };
}

/** Construct the section boss bar expression (`event-bossbar`): the bar being created inside a createBossBarSection body. Only meaningful there. */
export function eventBossBar(): Expr {
  return { kind: "eventBossBar" };
}

/** Construct a delete-keyed-boss-bar statement (`delete boss bar with key <key>`): remove the bar stored under the key. A missing key is a silent no-op. */
export function deleteKeyedBossBar(key: Expr): Stmt {
  return withLoc({ kind: "deleteKeyedBossBar", key });
}

/** Construct a set-boss-bar-style statement (`set style of <bar> to <style>`): the style is a literal name. */
export function setBossBarStyle(bar: Expr, style: BossBarStyleName): Stmt {
  if (!BOSS_BAR_STYLE_NAMES.has(style)) {
    throw new RangeError(`invalid boss bar style name: ${String(style)}`);
  }
  return withLoc({ kind: "setBossBarStyle", bar, style });
}

/** Construct a set-boss-bar-flag statement (`make <bar> darken the sky` / `create fog` / `play boss music`, or `make <bar> no longer ...` when enabled is false). */
export function setBossBarFlag(bar: Expr, flag: BossBarFlagName, enabled: boolean): Stmt {
  if (!BOSS_BAR_FLAG_NAMES.has(flag)) {
    throw new RangeError(`invalid boss bar flag name: ${String(flag)}`);
  }
  return withLoc({ kind: "setBossBarFlag", bar, flag, enabled });
}

/** Construct a boss-bar-darkens-the-sky condition (`<bar> darkens the sky`). */
export function bossBarDarkensSky(bar: Expr): Cond {
  return { kind: "bossBarDarkensSky", bar };
}

/** Construct a boss-bar-creates-fog condition (`<bar> creates fog`). */
export function bossBarCreatesFog(bar: Expr): Cond {
  return { kind: "bossBarCreatesFog", bar };
}

/** Construct a boss-bar-plays-boss-music condition (`<bar> plays boss music`). */
export function bossBarPlaysBossMusic(bar: Expr): Cond {
  return { kind: "bossBarPlaysBossMusic", bar };
}

/**
 * Construct a boss bar section creation statement (`set <target>
 * to a [keyed] boss bar [with key <key>]:` plus an indented
 * body): create a bar and run the body with the new bar
 * available as eventBossBar(). With `key` the bar is keyed (the
 * create resets any bar stored under the key); the body
 * typically sets the title, progress, style and flags on
 * eventBossBar().
 */
export function createBossBarSection(target: VarTarget, body: readonly Stmt[], options: { key?: Expr; color?: BossBarColorName } = {}): Stmt {
  if (options.color !== undefined && !BOSS_BAR_COLOR_NAMES.has(options.color)) {
    throw new RangeError(`invalid boss bar color name: ${String(options.color)}`);
  }
  return withLoc({
    kind: "createBossBarSection",
    target,
    ...(options.key !== undefined ? { key: options.key } : {}),
    ...(options.color !== undefined ? { color: options.color } : {}),
    body: [...body],
  });
}

// ---------------------------------------------------------------------------
// Core language (phase 23): timespan values and the fishing
// wait / bite / angle expressions
//
// A timespan is a duration stored as whole milliseconds; literal amounts round
// to the nearest millisecond, months are 30 days and years 365 days. Composite
// durations are composed with plus(); there is no dynamic `<number> <unit>`
// literal in the original, so a variable amount times a unit timespan (for
// example times(num(3), timespan(1, "seconds"))) builds one from a number.
// Arithmetic and comparisons ride the phase-11 arith/comparison builders with
// timespan rules (see the engine's evalArith). waitFor is the original's
// `wait <timespan>` form, accepting a variable or an arithmetic result. The
// fishing expressions are event values of fishing events (before lure: wait
// 5-30 seconds by hook roll between min and max, bite time 0 until a fish
// approaches, approach angles 0 and 360 degrees) and their setters write the
// current hook.
// ---------------------------------------------------------------------------

const TIMESPAN_UNITS: ReadonlySet<string> = new Set([
  "ticks",
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
]);

/** Builds a timespan literal (phase 23). The amount must be finite and non-negative; unit must be one of the timespan units. */
export function timespan(amount: number, unit: TimespanUnit): Expr {
  if (!Number.isFinite(amount) || amount < 0 || !TIMESPAN_UNITS.has(unit)) {
    throw new RangeError(`invalid timespan literal: ${amount} ${String(unit)}`);
  }
  return { kind: "timespan", amount, unit };
}

/** Builds the original's `wait <timespan>` statement (phase 23); a variable or an arithmetic result both work. */
export function waitFor(value: Expr): Stmt {
  return withLoc({ kind: "waitFor", value });
}

/** Validates a fishing bound argument ("min" or "max"). */
function requireFishingBound(bound: "min" | "max"): "min" | "max" {
  if (bound !== "min" && bound !== "max") {
    throw new RangeError(`invalid fishing bound: ${String(bound)}`);
  }
  return bound;
}

/** The current fishing hook's wait-time bound (phase 23): an event value of fishing events, defaulting to a 5-30 second roll before a lure. */
export function fishingWaitTime(bound: "min" | "max"): Expr {
  return { kind: "fishingWaitTime", bound: requireFishingBound(bound) };
}

/** The current fishing hook's bite time (phase 23): an event value of fishing events, 0 seconds until a fish starts approaching. */
export function fishingBiteTime(): Expr {
  return { kind: "fishingBiteTime" };
}

/** The current fishing hook's approach-angle bound (phase 23): an event value of fishing events, defaulting to 0 and 360 degrees before a lure. */
export function fishingApproachAngle(bound: "min" | "max"): Expr {
  return { kind: "fishingApproachAngle", bound: requireFishingBound(bound) };
}

/** Sets the current fishing hook's wait-time bound (phase 23). */
export function setFishingWaitTime(bound: "min" | "max", value: Expr): Stmt {
  return withLoc({ kind: "setFishingWaitTime", bound: requireFishingBound(bound), value });
}

/** Sets the current fishing hook's bite time (phase 23). */
export function setFishingBiteTime(value: Expr): Stmt {
  return withLoc({ kind: "setFishingBiteTime", value });
}

/** Sets the current fishing hook's approach-angle bound (phase 23). */
export function setFishingApproachAngle(bound: "min" | "max", value: Expr): Stmt {
  return withLoc({ kind: "setFishingApproachAngle", bound: requireFishingBound(bound), value });
}
