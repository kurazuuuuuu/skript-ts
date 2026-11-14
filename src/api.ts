import type {
  Expr,
  PlayerExpr,
  EntityExpr,
  BlockExpr,
  ItemExpr,
  LocationExpr,
  TextExpr,
  Cond,
  VariableExpr,
  ListExpr,
  LocalVariableExpr,
  LocalListExpr,
  AnyListExpr,
  ScalarVarExpr,
  VarTarget,
  FunctionParam,
  FunctionTypeName,
  Stmt,
  TopLevel,
  Script,
  CommandArgType,
  CommandArgSpec,
  CommandExecutableBy,
  SourceLoc,
  ArithOp,
  TimeUnit,
  TimespanUnit,
  EventFilter,
  EventPriority,
  RelativeDirection,
  WeatherName,
  GameModeName,
  TitleTiming,
  BossBarColorName,
  BossBarStyleName,
  BossBarFlagName,
  FishingStateName,
  FireworkType,
} from "./ast.js";
import { captureLoc } from "./loc.js";
import type { ItemDef } from "./resourcepack.js";

/** Attach the TypeScript call-site location to a freshly built AST node. */
function withLoc<T extends Stmt | TopLevel>(node: T): T {
  const loc: SourceLoc | undefined = captureLoc();
  if (loc !== undefined) node.loc = loc;
  return node;
}

/** Construct a player expression. */
export function player(): PlayerExpr {
  return { kind: "player" } as PlayerExpr;
}

/** Construct an event player expression. */
export function eventPlayer(): PlayerExpr {
  return { kind: "eventPlayer" } as PlayerExpr;
}

/** Construct a loop player expression. */
export function loopPlayer(): PlayerExpr {
  return { kind: "loopPlayer" } as PlayerExpr;
}

/** Construct a victim expression (the entity that died / was damaged, in death and damage events). */
export function victim(): EntityExpr {
  return { kind: "victim" } as EntityExpr;
}

/** Construct an argument expression with a 1-based index. */
export function argument(index: number): Expr {
  if (!Number.isInteger(index) || index < 1)
    throw new RangeError("argument index must be a positive integer");
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

/**
 * A value in a value position: either a built expression or a
 * plain JavaScript literal. Builders that take a `Value`
 * normalize literals automatically — a string becomes str(),
 * a number num(), a boolean bool() — so `plus(x, 1)` and
 * `equals(state, true)` emit exactly the same AST (and .sk)
 * as their explicitly wrapped forms.
 */
export type Value = Expr | string | number | boolean;

/** Normalize a Value to an Expr: literals become their literal expression nodes. */
function toExpr(v: Value): Expr {
  if (typeof v === "string") return { kind: "string", value: v };
  if (typeof v === "number") return { kind: "number", value: v };
  if (typeof v === "boolean") return { kind: "boolean", value: v };
  return v;
}

/** Construct an item expression. */
export function item(name: string): ItemExpr {
  return { kind: "item", name } as ItemExpr;
}

/** Construct a location-of expression. */
export function locationOf(target: Expr): LocationExpr {
  return { kind: "locationOf", target } as LocationExpr;
}

/** Construct a format expression from parts. */
export function fmt(...parts: (string | Expr)[]): TextExpr {
  return { kind: "format", parts };
}

/**
 * Construct a format expression with a tagged template: sugar
 * over fmt(). The cooked literal parts and the interpolated
 * values are interleaved into the same { kind: "format" } node
 * fmt() builds — Expr values become expression parts, while
 * string values and number / boolean values (via String(value))
 * merge into the adjacent literal text, and empty literal parts
 * are dropped. So t`a${x}b` builds (and emits) exactly
 * fmt("a", x, "b"), and `&` color codes in the literal parts
 * behave exactly as they do in fmt()'s string parts.
 */
export function t(
  strings: TemplateStringsArray,
  ...values: readonly (Expr | string | number | boolean)[]
): TextExpr {
  const parts: (string | Expr)[] = [];
  const pushLiteral = (text: string): void => {
    if (text === "") return;
    const last = parts[parts.length - 1];
    if (typeof last === "string") {
      parts[parts.length - 1] = last + text;
    } else {
      parts.push(text);
    }
  };
  for (let i = 0; i < strings.length; i++) {
    pushLiteral(strings[i]!);
    if (i < values.length) {
      const value = values[i]!;
      if (typeof value === "string") {
        pushLiteral(value);
      } else if (typeof value === "number" || typeof value === "boolean") {
        pushLiteral(String(value));
      } else {
        parts.push(value);
      }
    }
  }
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

/**
 * Anything accepted where a condition is expected (feedback E3):
 * either a real condition, or a boolean expression — a boolean
 * variable, a boolean literal, or the result of a boolean-returning
 * function call, for example. A bare boolean expression is NOT a
 * valid Skript condition (probed against the real Skript 2.17.1:
 * `if {_t}:` and `if myBoolFn():` are parse errors), but the
 * comparison form parses and behaves correctly for function calls,
 * variables and while heads (`if pbool(true) is true:`,
 * `if {_t} is true:`, `while {_go} is true:`), so a boolean
 * expression is lowered at the API level by toCond() below to
 * `equals(expr, true)` — emitted as `<expr> is true`.
 */
export type CondLike = Cond | Expr;

/**
 * The kind names of every Cond variant. The Cond and Expr kind
 * unions are disjoint string sets (no kind name appears in both),
 * so membership in this set is a reliable discriminator between
 * a condition and an expression.
 */
const COND_KINDS: ReadonlySet<string> = new Set([
  "hasPermission",
  "isOp",
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "and",
  "or",
  "not",
  "contains",
  "startsWith",
  "endsWith",
  "eventCancelled",
  "isSet",
  "hasItem",
  "canHoldItem",
  "hasItemTag",
  "chance",
  "timerActive",
  "guiEventIs",
  "fileExists",
  "httpOk",
  "cfOk",
  "bossBarDarkensSky",
  "bossBarCreatesFog",
  "bossBarPlaysBossMusic",
]);

/**
 * Normalize a CondLike to a Cond: a Cond passes through unchanged
 * (so existing programs emit byte-identical output), and an Expr
 * lowers to `equals(expr, true)`.
 */
function toCond(c: CondLike): Cond {
  if (COND_KINDS.has(c.kind)) return c as Cond;
  return equals(c as Expr, { kind: "boolean", value: true });
}

/** Construct an equality condition: the two values are equal (texts compare case-insensitively). */
export function equals(left: Value, right: Value): Cond {
  return { kind: "equals", left: toExpr(left), right: toExpr(right) };
}

/** Construct an inequality condition: the negation of equals(). */
export function notEquals(left: Value, right: Value): Cond {
  return { kind: "notEquals", left: toExpr(left), right: toExpr(right) };
}

/** Construct a greater-than condition (numbers only; false for anything else). */
export function greaterThan(left: Value, right: Value): Cond {
  return { kind: "greaterThan", left: toExpr(left), right: toExpr(right) };
}

/** Construct a greater-than-or-equal condition (numbers only; false for anything else). */
export function greaterOrEqual(left: Value, right: Value): Cond {
  return { kind: "greaterOrEqual", left: toExpr(left), right: toExpr(right) };
}

/** Construct a less-than condition (numbers only; false for anything else). */
export function lessThan(left: Value, right: Value): Cond {
  return { kind: "lessThan", left: toExpr(left), right: toExpr(right) };
}

/** Construct a less-than-or-equal condition (numbers only; false for anything else). */
export function lessOrEqual(left: Value, right: Value): Cond {
  return { kind: "lessOrEqual", left: toExpr(left), right: toExpr(right) };
}

function combine(kind: "and" | "or", conds: readonly CondLike[]): Cond {
  if (conds.length < 2) {
    throw new RangeError(`${kind}() needs at least two conditions`);
  }
  let acc: Cond = toCond(conds[0]!);
  for (let i = 1; i < conds.length; i++) {
    acc =
      kind === "and"
        ? { kind: "and", left: acc, right: toCond(conds[i]!) }
        : { kind: "or", left: acc, right: toCond(conds[i]!) };
  }
  return acc;
}

/** Construct an and condition: every given condition holds. Boolean expressions are accepted and lower to `is true`. */
export function and(...conds: CondLike[]): Cond {
  return combine("and", conds);
}

/** Construct an or condition: at least one of the given conditions holds. Boolean expressions are accepted and lower to `is true`. */
export function or(...conds: CondLike[]): Cond {
  return combine("or", conds);
}

/** Construct a not condition: the given condition does not hold. A boolean expression is accepted and lowers to `is true` first. */
export function not(cond: CondLike): Cond {
  return { kind: "not", cond: toCond(cond) };
}

/** Construct an arithmetic expression from an operator and two operands. */
export function arith(op: ArithOp, left: Value, right: Value): Expr {
  return { kind: "arith", op, left: toExpr(left), right: toExpr(right) };
}

/** Construct an addition expression (or text concatenation, when both operands are texts). */
export function plus(left: Value, right: Value): Expr {
  return arith("+", left, right);
}

/** Construct a subtraction expression. */
export function minus(left: Value, right: Value): Expr {
  return arith("-", left, right);
}

/** Construct a multiplication expression. */
export function times(left: Value, right: Value): Expr {
  return arith("*", left, right);
}

/** Construct a division expression (real division; dividing by zero yields Infinity or NaN). */
export function dividedBy(left: Value, right: Value): Expr {
  return arith("/", left, right);
}

/** Construct a remainder expression: the mathematical modulo (sign of the divisor; NaN for a zero divisor). */
export function remainder(left: Value, right: Value): Expr {
  return arith("mod", left, right);
}

/**
 * Construct a random-number expression: a fresh real-valued draw
 * between the two bounds on every evaluation (there is no seed —
 * the draw is never reproducible). Reversed bounds are swapped;
 * a missing or non-number bound yields no value.
 */
export function randomNumber(min: Value, max: Value): Expr {
  return { kind: "randomNumber", min: toExpr(min), max: toExpr(max) };
}

/**
 * Construct a random-integer expression: a fresh whole-number
 * draw on every evaluation, uniform over the whole numbers
 * inside the closed range — the lower bound fits up and the
 * upper bound fits down, so (1.5, 3.5) draws from {2, 3} and
 * (1, 3) from {1, 2, 3}; a range holding no whole number
 * (1.2, 1.8) yields no value. Reversed bounds are swapped.
 * A missing or non-number bound yields no value.
 */
export function randomInteger(min: Value, max: Value): Expr {
  return { kind: "randomInteger", min: toExpr(min), max: toExpr(max) };
}

/**
 * Construct a chance condition: the draw succeeds with the given
 * probability, expressed as a fraction — chance(0.5) succeeds
 * half the time. (This is the original's own percent model: its
 * `50%` literal is the number 0.5.) A value of 1 or more always
 * succeeds; a missing or non-number value never does. Every
 * check draws again.
 */
export function chance(value: Expr): Cond {
  return { kind: "chance", value };
}

/**
 * Construct a floor expression: the greatest whole number not
 * greater than the value (floor(-2.5) is -3). The result is a
 * whole number; a missing or non-number operand yields no value.
 */
export function floor(value: Value): Expr {
  return { kind: "math", fn: "floor", args: [toExpr(value)] };
}

/**
 * Construct a ceiling expression: the smallest whole number not
 * less than the value (ceil(-2.5) is -2). The result is a whole
 * number; a missing or non-number operand yields no value.
 */
export function ceil(value: Value): Expr {
  return { kind: "math", fn: "ceil", args: [toExpr(value)] };
}

/**
 * Construct a round expression. Without `places`, halves round
 * toward positive infinity (round(-2.5) is -2). With `places`,
 * the value is rounded at that many decimal digits, halves away
 * from zero (round(2.675, 2) is 2.68); a negative places count
 * rounds at the tens/hundreds place — see docs/reference.md for
 * the exact rules, including the places defaulting and the
 * whole-number pass-through. A missing or non-number value
 * yields no value.
 */
export function round(value: Value, places?: Value): Expr {
  return places === undefined
    ? { kind: "math", fn: "round", args: [toExpr(value)] }
    : { kind: "math", fn: "round", args: [toExpr(value), toExpr(places)] };
}

/**
 * Construct an absolute-value expression (abs(-0.5) is 0.5).
 * A missing or non-number operand yields no value.
 */
export function abs(value: Value): Expr {
  return { kind: "math", fn: "abs", args: [toExpr(value)] };
}

/**
 * Construct a square-root expression (sqrt(2) is about 1.41;
 * the root of a negative value is NaN). A missing or
 * non-number operand yields no value.
 */
export function sqrt(value: Value): Expr {
  return { kind: "math", fn: "sqrt", args: [toExpr(value)] };
}

/**
 * Construct a minimum expression over one or more values.
 * Only the numeric arguments compete — missing and non-number
 * arguments drop out silently; a NaN argument loses to any
 * non-NaN one, and if every argument is NaN the result is NaN.
 * With no numeric argument at all, the result has no value.
 * Skript rejects a zero-argument min() at parse time, so this
 * builder throws instead.
 */
export function min(...values: Value[]): Expr {
  if (values.length === 0) {
    throw new RangeError("min() needs at least one argument");
  }
  return { kind: "math", fn: "min", args: values.map(toExpr) };
}

/**
 * Construct a maximum expression over one or more values.
 * The argument rules are min()'s: only numeric arguments
 * compete, NaN loses to any non-NaN argument, all-NaN yields
 * NaN, and no numeric argument yields no value. Skript rejects
 * a zero-argument max() at parse time, so this builder throws
 * instead.
 */
export function max(...values: Value[]): Expr {
  if (values.length === 0) {
    throw new RangeError("max() needs at least one argument");
  }
  return { kind: "math", fn: "max", args: values.map(toExpr) };
}

/** Construct a has-permission condition. */
export function hasPermission(target: Expr, permission: string): Cond {
  return { kind: "hasPermission", target, permission };
}

/** Construct an is-op condition. */
export function isOp(target: Expr): Cond {
  return { kind: "isOp", target };
}

/**
 * Construct an event-cancelled condition: true when the event
 * being handled has been flagged cancelled. Skript's form is
 * `event is cancelled` (the native negation `event is not
 * cancelled` is used for not(...) and while heads). Probed
 * against the real Skript 2.17.1: because a handler only ever
 * runs while the event is not cancelled (see the priority
 * notes on the event builders), the condition reads false on
 * entry and becomes true after the handler itself calls
 * cancelEvent() — and false again after uncancelEvent(). In
 * an event that cannot be cancelled (respawn, bed leave) it
 * always reads false; outside an event (a command, a function
 * body) the engine reads false too.
 */
export function eventCancelled(): Cond {
  return { kind: "eventCancelled" };
}

/**
 * Construct an is-set condition: true when the target expression
 * HAS a value. Skript's form is `<expr> is set` (the native
 * negation `<expr> is not set` is used for not(...) and while
 * heads). Probed against the real Skript 2.17.1: both forms work
 * for local variables, global variables, and function-call
 * results — a function that returns nothing yields "not set",
 * one that returns a value yields "set". This answers feedback
 * C4's "is the variable set" need: it tests presence, not
 * content, so a variable holding an empty text "" is set, while
 * an unset or deleted variable is not. It is a leaf condition,
 * so it works in ifElse, in and/or/not logic, and as a
 * whileLoop head.
 */
export function isSet(target: Expr): Cond {
  return { kind: "isSet", target };
}

/** Construct a send statement. The message may be any expression; text expressions emit as quoted strings. */
export function send(target: Expr, message: Value): Stmt {
  return withLoc({ kind: "send", target, message: toExpr(message) });
}

/** Construct a broadcast statement. The message may be any expression; text expressions emit as quoted strings. */
export function broadcast(message: Value): Stmt {
  return withLoc({ kind: "broadcast", message: toExpr(message) });
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
export function set(variable: VarTarget, value: Value): Stmt {
  return withLoc({ kind: "setVar", variable, value: toExpr(value) });
}

/** Construct an add-variable statement. The target may be a global or a local scalar variable. */
export function add(variable: ScalarVarExpr, value: Value): Stmt {
  return withLoc({ kind: "addVar", variable, value: toExpr(value) });
}

/** Construct a remove-variable statement. The target may be a global or a local scalar variable. */
export function remove(variable: ScalarVarExpr, value: Value): Stmt {
  return withLoc({ kind: "removeVar", variable, value: toExpr(value) });
}

/** Construct an if statement with optional else branch. A boolean expression is accepted as the condition and lowers to `is true`. */
export function ifElse(cond: CondLike, then: readonly Stmt[], elseBody?: readonly Stmt[]): Stmt {
  const normalized = toCond(cond);
  if (elseBody === undefined) return withLoc({ kind: "if", cond: normalized, then });
  return withLoc({ kind: "if", cond: normalized, then, else: elseBody });
}

/** Construct a when statement (feedback E4): sugar for ifElse(cond, body) — the body runs when the condition holds. A boolean expression is accepted and lowers to `is true`. */
export function when(cond: CondLike, ...body: Stmt[]): Stmt {
  return ifElse(cond, body);
}

/**
 * Construct an unless statement (feedback E4): sugar for
 * ifElse(not(cond), body) — the body runs when the condition does
 * NOT hold. Lowered through not() rather than an if/else with an
 * empty then branch, because empty sections are risky in Skript.
 * A boolean expression is accepted and lowers to `is true` first.
 */
export function unless(cond: CondLike, ...body: Stmt[]): Stmt {
  return ifElse(not(toCond(cond)), body);
}

/**
 * Construct a stopIf statement (feedback E4): sugar for
 * ifElse(cond, [stopTrigger()]) — ends the current trigger at
 * once when the condition holds. A boolean expression is
 * accepted and lowers to `is true`.
 */
export function stopIf(cond: CondLike): Stmt {
  return ifElse(cond, [stopTrigger()]);
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

/**
 * Construct a list-size expression: the number of entries in the
 * list (0 when unset). Accepts a list variable or any list-valued
 * expression (phase 28: draggedSlots()).
 */
export function listSize(list: Expr): Expr {
  return { kind: "listSize", list };
}

/**
 * Construct a sorted-list expression: the list's entries sorted
 * ascending (feedback C5). Homogeneous lists only, as probed
 * against the real Skript 2.17.1: numbers sort numerically,
 * texts sort case-insensitively; a mixed list, a list of other
 * types, or an empty list yields no value.
 */
export function sortedList(list: Expr): Expr {
  return { kind: "sortedList", list };
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
export function listAdd(list: AnyListExpr, value: Value): Stmt {
  return withLoc({ kind: "listAdd", list, value: toExpr(value) });
}

/** Construct a list-remove statement: delete the first entry (in iteration order) equal to the value. */
export function listRemove(list: AnyListExpr, value: Value): Stmt {
  return withLoc({ kind: "listRemove", list, value: toExpr(value) });
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

// ---------------------------------------------------------------------------
// Typed variable handles (feedback E6 / E7): pure API sugar over
// the builders above. A handle centralizes the key construction
// for one variable name, so call sites stop repeating
// variable(name, player) / localVar(name) and the index slot can
// never drift between a write and a read-back. Handles build the
// exact same AST nodes as the underlying builders — there is no
// new AST, emitter or engine behavior.
//
// Values accepted by the writing methods are normalized locally:
// a string becomes str(), a number num(), a boolean bool(), and
// an Expr passes through unchanged.
// ---------------------------------------------------------------------------

/** A value a variable handle's writing methods accept: an expression, or a string / number / boolean literal. */
export type VarHandleValue = Expr | string | number | boolean;

function normalizeVarHandleValue(value: VarHandleValue): Expr {
  if (typeof value === "string") return str(value);
  if (typeof value === "number") return num(value);
  if (typeof value === "boolean") return bool(value);
  return value;
}

function requirePlayerVarName(name: string): string {
  // variable() itself performs no name validation; the handle
  // validates eagerly at construction so a typo fails at the
  // definition site, not at the first method call. The check is
  // the same non-empty-string rule localVar() / listVar() use.
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("variable name must be a non-empty string");
  }
  return name;
}

function requireLocalHandleName(name: string): string {
  // Same message localVar() throws, checked eagerly here.
  if (typeof name !== "string" || name.trim() === "") {
    throw new RangeError("local variable name must be a non-empty string");
  }
  return name;
}

/**
 * A typed handle for one player-indexed global variable
 * ({name::%player%}): every method takes the player expression
 * that selects the slot. See playerVar().
 */
export interface PlayerVarHandle {
  /** Read one player's slot as an expression: variable(name, player). */
  of(player: Expr): VariableExpr;
  /** Set one player's slot: set(variable(name, player), value). */
  set(player: Expr, value: VarHandleValue): Stmt;
  /** Add to one player's slot: add(variable(name, player), value). */
  add(player: Expr, value: VarHandleValue): Stmt;
  /** Remove from one player's slot: remove(variable(name, player), value). */
  remove(player: Expr, value: VarHandleValue): Stmt;
  /** Delete one player's slot: deleteVar(variable(name, player)). */
  delete(player: Expr): Stmt;
}

/**
 * Construct a player-variable handle (feedback E6):
 * playerVar("balance") centralizes the {balance::%player%} key
 * construction for a per-player value. The player index is the
 * per-player slot — in the engine the key is the player's UUID
 * (feedback B6), while under Skript the index expands per the
 * server's Skript configuration.
 */
export function playerVar(name: string): PlayerVarHandle {
  const validName = requirePlayerVarName(name);
  const target = (playerExpr: Expr): VariableExpr => variable(validName, playerExpr);
  return {
    of: (playerExpr) => target(playerExpr),
    set: (playerExpr, value) => set(target(playerExpr), normalizeVarHandleValue(value)),
    add: (playerExpr, value) => add(target(playerExpr), normalizeVarHandleValue(value)),
    remove: (playerExpr, value) => remove(target(playerExpr), normalizeVarHandleValue(value)),
    delete: (playerExpr) => deleteVar(target(playerExpr)),
  };
}

/**
 * A typed handle for one local variable ({_name}) inside a
 * trigger or function frame. See localHandle().
 */
export interface LocalVarHandle {
  /** Read the local as an expression: localVar(name). */
  get(): LocalVariableExpr;
  /** Set the local: set(localVar(name), value). */
  set(value: VarHandleValue): Stmt;
  /** Add to the local: add(localVar(name), value). */
  add(value: VarHandleValue): Stmt;
  /** Remove from the local: remove(localVar(name), value). */
  remove(value: VarHandleValue): Stmt;
  /** Delete the local: deleteVar(localVar(name)). */
  delete(): Stmt;
}

/**
 * Construct a local-variable handle (feedback E7):
 * localHandle("total") centralizes the {_total} construction
 * inside a trigger or a defineFunction body, where locals are
 * the per-call frame's variables.
 */
export function localHandle(name: string): LocalVarHandle {
  const validName = requireLocalHandleName(name);
  const target = (): LocalVariableExpr => localVar(validName);
  return {
    get: () => target(),
    set: (value) => set(target(), normalizeVarHandleValue(value)),
    add: (value) => add(target(), normalizeVarHandleValue(value)),
    remove: (value) => remove(target(), normalizeVarHandleValue(value)),
    delete: () => deleteVar(target()),
  };
}

/**
 * Construct a loop over a list's entries, exposing loopValue()
 * and loopIndex(). The list may be a list variable (entries are
 * visited as a snapshot) or any list-valued expression (phase
 * 28: draggedSlots()); expression lists are indexed 1-based.
 */
export function loopList(list: Expr, body: readonly Stmt[]): Stmt {
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
  "hasItem",
  "canHoldItem",
  "hasItemTag",
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
  "eventCancelled",
  "isSet",
  "chance",
  "bossBarDarkensSky",
  "bossBarCreatesFog",
  "bossBarPlaysBossMusic",
  "timerActive",
  "guiEventIs",
  "fileExists",
]);

/**
 * Construct a while loop. The condition must be a leaf condition
 * or the negation of one: an if head can lower and/or/not to
 * control flow, but a loop head cannot, and Skript has no textual
 * conjunction form — so composite conditions are rejected here
 * instead of diverging between the two runtimes. A boolean
 * expression is accepted as the condition: it lowers to
 * `equals(expr, true)`, which is a leaf, so it heads a while loop
 * as `<expr> is true` (probed against the real Skript 2.17.1).
 */
export function whileLoop(cond: CondLike, body: readonly Stmt[]): Stmt {
  const normalized = toCond(cond);
  const inner = normalized.kind === "not" ? normalized.cond : normalized;
  if (!WHILE_LEAF_KINDS.has(inner.kind)) {
    throw new RangeError(
      "whileLoop condition must be a leaf condition or not(leaf): " +
        "and/or conditions cannot head a while loop in this subset",
    );
  }
  if (normalized.kind === "not" && inner.kind === "chance") {
    // A loop head cannot swap branches the way an if can, and
    // the original has no negated chance form, so there is no
    // .sk text for this head. Loop on the positive chance and
    // structure the body around it instead.
    throw new RangeError(
      "whileLoop cannot negate a chance condition: " +
        "chance has no negated .sk form — loop on chance(...) itself instead",
    );
  }
  return withLoc({ kind: "while", cond: normalized, body });
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
  "number",
  "numbers",
  "text",
  "texts",
  "boolean",
  "booleans",
  "player",
  "players",
  "location",
  "locations",
  "object",
  "objects",
  "block",
  "item",
  "entity",
  "timespan",
  "timespans",
  "date",
  "dates",
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
export function param<T extends FunctionTypeName>(
  name: string,
  type: T,
  defaultValue?: Value,
): FunctionParam<T> {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new RangeError(`invalid parameter name: ${String(name)}`);
  }
  requireFunctionType(type, "parameter");
  if (defaultValue === undefined) return { name, type };
  return { name, type, default: toExpr(defaultValue) };
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
export function call(name: string, ...args: Value[]): Expr {
  return { kind: "functionCall", name: requireFunctionName(name), args: args.map(toExpr) };
}

/** Construct a function-call statement: invoke a custom function for its effects, discarding any return value. */
export function callStmt(name: string, ...args: Value[]): Stmt {
  return withLoc({ kind: "callStmt", name: requireFunctionName(name), args: args.map(toExpr) });
}

// ---------------------------------------------------------------------------
// Typed function handles (feedback E2): defineFn is defineFunction
// plus a handle the type checker can call. The handle removes the
// two unchecked spots of the string-name API — a misspelled name
// is an unknown identifier (not a runtime string), and argument
// count / kinds are a mapped tuple over the parameters' declared
// type literals, so tsc checks every call site.
// ---------------------------------------------------------------------------

/**
 * The argument kind one declared parameter type accepts through a
 * typed handle: JS primitives for "number" / "text" / "boolean"
 * (normalized to num() / str() / bool() at runtime), an Expr for
 * every other singular type, and — for a plural type (its name
 * ends in "s") — one Expr or an array of Exprs, flattened into
 * the call's argument list at runtime. The value-kind types
 * ("player", "entity", "block", "item", "location" and their
 * plurals) accept only expressions branded with that kind
 * (feedback T1): an entity expression cannot fill a player
 * parameter, while a player expression can fill an entity one.
 */
export type FnArg<T extends FunctionTypeName> = T extends "players"
  ? PlayerExpr | readonly PlayerExpr[]
  : T extends "entities"
    ? EntityExpr | readonly EntityExpr[]
    : T extends "blocks"
      ? BlockExpr | readonly BlockExpr[]
      : T extends "items"
        ? ItemExpr | readonly ItemExpr[]
        : T extends "locations"
          ? LocationExpr | readonly LocationExpr[]
          : T extends `${string}s`
            ? Expr | readonly Expr[]
            : T extends "number"
              ? number | Expr
              : T extends "text"
                ? string | Expr
                : T extends "boolean"
                  ? boolean | Expr
                  : T extends "player"
                    ? PlayerExpr
                    : T extends "entity"
                      ? EntityExpr
                      : T extends "block"
                        ? BlockExpr
                        : T extends "item"
                          ? ItemExpr
                          : T extends "location"
                            ? LocationExpr
                            : Expr;

/** The call-argument tuple of a parameter list: one FnArg per declared parameter, in order. */
export type FnArgs<Ps extends readonly FunctionParam[]> = {
  [K in keyof Ps]: FnArg<Ps[K]["type"]>;
};

/**
 * Brand assertions (feedback T1): assert a value kind the
 * compiler cannot see — a value read back from a variable, a
 * list element, a function result — so it can fill a branded
 * parameter. Identity functions; the runtime node is unchanged.
 */
export function asPlayer(expr: Expr): PlayerExpr {
  return expr as PlayerExpr;
}

/** The entity counterpart of {@link asPlayer}. */
export function asEntity(expr: Expr): EntityExpr {
  return expr as EntityExpr;
}

/** The block counterpart of {@link asPlayer}. */
export function asBlock(expr: Expr): BlockExpr {
  return expr as BlockExpr;
}

/** The item counterpart of {@link asPlayer}. */
export function asItem(expr: Expr): ItemExpr {
  return expr as ItemExpr;
}

/** The location counterpart of {@link asPlayer}. */
export function asLocation(expr: Expr): LocationExpr {
  return expr as LocationExpr;
}

/** The non-callable part of a typed function handle: the definition and the statement call. */
export interface FnHandleBase<Ps extends readonly FunctionParam[]> {
  /** The TopLevel defineFunction produced for this function; script() also accepts the handle itself. */
  readonly definition: TopLevel;
  /** Invoke the function as a statement, discarding any return value (the callStmt form). */
  stmt(...args: FnArgs<Ps>): Stmt;
}

/**
 * A typed function handle. For a value-returning function the
 * handle itself is callable as an expression; for a void function
 * (return type null) the handle is only FnHandleBase — calling it
 * as an expression is a type error, and only .stmt / .definition
 * are available.
 */
export type FnHandle<
  Ps extends readonly FunctionParam[],
  R extends FunctionTypeName | null,
> = R extends null ? FnHandleBase<Ps> : FnHandleBase<Ps> & ((...args: FnArgs<Ps>) => Expr);

/** Brand property marking a typed function handle, so script() can unwrap it to its definition. */
const FN_HANDLE_BRAND: unique symbol = Symbol("skript-ts.fnHandle");

function isFnHandle(value: unknown): value is { definition: TopLevel } {
  return (
    typeof value === "function" &&
    (value as { [FN_HANDLE_BRAND]?: unknown })[FN_HANDLE_BRAND] === true
  );
}

/** Normalize one handle argument to the expression(s) it contributes to the call. */
function normalizeFnArg(fnName: string, paramDef: FunctionParam, arg: unknown): Expr[] {
  if (isPluralType(paramDef.type)) {
    if (Array.isArray(arg)) {
      for (const element of arg) {
        if (!isExprValue(element)) {
          throw new RangeError(
            `function ${fnName}: argument "${paramDef.name}" (${paramDef.type}) must be expressions`,
          );
        }
      }
      return [...arg];
    }
    if (isExprValue(arg)) return [arg];
    throw new RangeError(
      `function ${fnName}: argument "${paramDef.name}" (${paramDef.type}) must be an expression or an array of expressions`,
    );
  }
  if (paramDef.type === "number" && typeof arg === "number") return [num(arg)];
  if (paramDef.type === "text" && typeof arg === "string") return [str(arg)];
  if (paramDef.type === "boolean" && typeof arg === "boolean") return [bool(arg)];
  if (isExprValue(arg)) return [arg];
  const accepted =
    paramDef.type === "number"
      ? "a number or an expression"
      : paramDef.type === "text"
        ? "a string or an expression"
        : paramDef.type === "boolean"
          ? "a boolean or an expression"
          : "an expression";
  throw new RangeError(
    `function ${fnName}: argument "${paramDef.name}" (${paramDef.type}) must be ${accepted}`,
  );
}

/**
 * Validate and normalize handle call arguments at runtime. The
 * type-level tuple already checks arity for TypeScript callers;
 * this mirrors it for callers that bypass the types: the count
 * must match the parameter list (trailing parameters with
 * defaults may be omitted, as in defineFunction), and each
 * argument is normalized by its parameter's declared kind.
 */
function normalizeFnArgs(
  fnName: string,
  params: readonly FunctionParam[],
  args: readonly unknown[],
): Expr[] {
  let minArgs = params.length;
  while (minArgs > 0 && params[minArgs - 1]?.default !== undefined) minArgs--;
  if (args.length < minArgs || args.length > params.length) {
    const expected =
      minArgs === params.length ? `${params.length}` : `${minArgs} to ${params.length}`;
    throw new RangeError(
      `function ${fnName}: expected ${expected} argument(s), got ${args.length}`,
    );
  }
  const normalized: Expr[] = [];
  for (let i = 0; i < args.length; i++) {
    const paramDef = params[i];
    if (paramDef === undefined) break;
    normalized.push(...normalizeFnArg(fnName, paramDef, args[i]));
  }
  return normalized;
}

/**
 * Construct a custom function declaration like defineFunction,
 * and return a typed handle to it. The handle's .definition is
 * the TopLevel defineFunction produced (script() accepts the
 * handle directly too); calling the handle builds the function
 * call expression with arguments checked and normalized by the
 * declared parameter types, and handle.stmt(...) builds the call
 * statement. A void function (returnType null) yields a handle
 * that is not callable as an expression at the type level.
 */
export function defineFn<Ps extends readonly FunctionParam[], R extends FunctionTypeName | null>(
  name: string,
  params: readonly [...Ps],
  returnType: R,
  body: readonly Stmt[],
): FnHandle<Ps, R> {
  const definition = defineFunction(name, params, returnType, body);
  const invoke = (...args: readonly unknown[]): Expr =>
    call(name, ...normalizeFnArgs(name, params, args));
  const stmt = (...args: readonly unknown[]): Stmt =>
    callStmt(name, ...normalizeFnArgs(name, params, args));
  const handle = Object.assign(invoke, { definition, stmt, [FN_HANDLE_BRAND]: true as const });
  return handle as unknown as FnHandle<Ps, R>;
}

/**
 * Construct a return statement: hand the value back to the caller
 * and exit the function immediately. Only meaningful inside a
 * defineFunction body whose return type is not null (Skript
 * rejects it elsewhere, and rejects it in void functions too).
 */
export function returnValue(value: Value): Stmt {
  return withLoc({ kind: "return", value: toExpr(value) });
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
export function onJoin(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("join", body, options, "onJoin"));
}

/** Construct an on-first-join event. */
export function onFirstJoin(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("firstJoin", body, options, "onFirstJoin"));
}

/** Construct an on-quit event. */
export function onQuit(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("quit", body, options, "onQuit"));
}

/** Construct an on-chat event. */
export function onChat(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("chat", body, options, "onChat"));
}

/** Filter options for onDeath: the victim types of the "of" slot — the death header's only slot (phase 22). */
export interface DeathEventFilter {
  victim?: TypeNameFilter;
  priority?: EventPriority;
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
  requireFilterKeys(filter, ["victim", "priority"], "onDeath");
  const f: EventFilter = {};
  if (filter?.victim !== undefined) f.victimTypes = requireTypeNames(filter.victim, "victim");
  return withLoc(eventWithFilter("death", body, f, requirePriority(filter?.priority, "onDeath")));
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
// - Cancellation state and handler priority (probed against
//   the real Skript 2.17.1, 2026-11-13): a builder's `priority`
//   option emits Skript's `with priority <level>` header suffix
//   (after any filter slots). Handlers for one event run from
//   the lowest slot to monitor; handlers in the same slot run
//   in declaration order. Probed subtlety (r7): a handler with
//   NO priority declared dispatches in the HIGH slot, not the
//   normal one — only an explicit "normal" lands in the normal
//   slot — and the engine's dispatch mirrors that exactly.
//   Once the event is cancelled, NO later handler runs at all
//   (monitor included): a handler only ever starts while the
//   event is un-cancelled, which is what makes a late-priority
//   guard pattern work — put the XP/reward handler at a late
//   priority and a protection handler (or plugin) cancelling
//   earlier keeps it from ever running. eventCancelled() reads
//   the live state inside a handler (true after its own
//   cancelEvent(), false again after uncancelEvent()).
// - typeOf() yields a value's Skript type name; comparing it
//   against item("...") literals is the supported way to test
//   what a block or item is. A missing value has no type.
// ---------------------------------------------------------------------------

/** Construct an on-block-break event: a player breaks a block. The optional filter restricts it to the named block types ("on break of stone"). */
export function onBlockBreak(body: readonly Stmt[], filter?: BlockEventFilter): TopLevel {
  return withLoc(
    eventWithFilter(
      "blockBreak",
      body,
      blockFilter(filter, "onBlockBreak"),
      requirePriority(filter?.priority, "onBlockBreak"),
    ),
  );
}

/** Construct an on-block-place event: a player places a block. The optional filter restricts it to the named block types ("on place of stone"). */
export function onBlockPlace(body: readonly Stmt[], filter?: BlockEventFilter): TopLevel {
  return withLoc(
    eventWithFilter(
      "blockPlace",
      body,
      blockFilter(filter, "onBlockPlace"),
      requirePriority(filter?.priority, "onBlockPlace"),
    ),
  );
}

/** Construct an on-right-click event: a player right-clicks a block, an entity, or air. The optional filter restricts it by clicked block, clicked entity and/or held item ("on right click on a villager with a stick"). */
export function onRightClick(body: readonly Stmt[], filter?: ClickEventFilter): TopLevel {
  return withLoc(
    eventWithFilter(
      "rightClick",
      body,
      clickFilter(filter, "onRightClick"),
      requirePriority(filter?.priority, "onRightClick"),
    ),
  );
}

/** Construct an on-left-click event: a player left-clicks a block or air (attacking an entity is the damage event, not a click). The optional filter restricts it like onRightClick's. */
export function onLeftClick(body: readonly Stmt[], filter?: ClickEventFilter): TopLevel {
  return withLoc(
    eventWithFilter(
      "leftClick",
      body,
      clickFilter(filter, "onLeftClick"),
      requirePriority(filter?.priority, "onLeftClick"),
    ),
  );
}

/** Construct an on-damage event: an entity takes damage from any cause. The optional filter restricts it by victim and/or attacker type ("on damage of player by zombie"; either side may be filtered alone). */
export function onDamage(body: readonly Stmt[], filter?: DamageEventFilter): TopLevel {
  requireFilterKeys(filter, ["victim", "attacker", "priority"], "onDamage");
  const f: EventFilter = {};
  if (filter?.victim !== undefined) f.victimTypes = requireTypeNames(filter.victim, "victim");
  if (filter?.attacker !== undefined)
    f.attackerTypes = requireTypeNames(filter.attacker, "attacker");
  return withLoc(eventWithFilter("damage", body, f, requirePriority(filter?.priority, "onDamage")));
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

/**
 * Header options for event builders that take no filter: the
 * handler priority (see EventPriority in ast.ts). Every event
 * builder accepts a priority — the filtered builders carry it
 * inside their filter object, the unfiltered ones take this
 * options object as their second parameter.
 */
export interface EventOptions {
  priority?: EventPriority;
}

/** Filter options for onBlockBreak / onBlockPlace: the block types of the "of" slot. */
export interface BlockEventFilter {
  block?: TypeNameFilter;
  priority?: EventPriority;
}

/** Filter options for onDamage: the victim types of the "of" slot and the attacker types of the "by" slot. */
export interface DamageEventFilter {
  victim?: TypeNameFilter;
  attacker?: TypeNameFilter;
  priority?: EventPriority;
}

/** Filter options for onRightClick / onLeftClick: the clicked block types ("on"), the clicked entity types ("on") and the held item types ("with"). Block and entity are mutually exclusive — a click has either a block or an entity target. */
export interface ClickEventFilter {
  block?: TypeNameFilter;
  entity?: TypeNameFilter;
  item?: TypeNameFilter;
  priority?: EventPriority;
}

/** Filter options for onPickup / onDrop: the item types of the "of" slot. */
export interface ItemEventFilter {
  item?: TypeNameFilter;
  priority?: EventPriority;
}

const EVENT_PRIORITIES: readonly EventPriority[] = [
  "lowest",
  "low",
  "normal",
  "high",
  "highest",
  "monitor",
];

/** Validate a builder's priority option: one of the six level names (an unknown name is a Skript parse error, so it is rejected here instead). */
function requirePriority(
  priority: EventPriority | undefined,
  what: string,
): EventPriority | undefined {
  if (priority === undefined) return undefined;
  if (!EVENT_PRIORITIES.includes(priority)) {
    throw new RangeError(
      `${what}: unknown event priority "${priority}" (expected one of ${EVENT_PRIORITIES.join(", ")})`,
    );
  }
  return priority;
}

/** Build an unfiltered event top-level, carrying the priority option when one was given. */
function plainEvent(
  event: Extract<TopLevel, { kind: "event" }>["event"],
  body: readonly Stmt[],
  options: EventOptions | undefined,
  what: string,
): TopLevel {
  const priority = requirePriority(options?.priority, what);
  return priority === undefined
    ? { kind: "event", event, body }
    : { kind: "event", event, body, priority };
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
  event:
    | "blockBreak"
    | "blockPlace"
    | "rightClick"
    | "leftClick"
    | "damage"
    | "death"
    | "pickup"
    | "drop"
    | "entityPickup"
    | "entityDrop",
  body: readonly Stmt[],
  filter: EventFilter,
  priority?: EventPriority,
): TopLevel {
  const top: Extract<TopLevel, { kind: "event" }> = { kind: "event", event, body };
  if (Object.keys(filter).length !== 0) top.filter = filter;
  if (priority !== undefined) top.priority = priority;
  return top;
}

function blockFilter(filter: BlockEventFilter | undefined, what: string): EventFilter {
  requireFilterKeys(filter, ["block", "priority"], what);
  const f: EventFilter = {};
  if (filter?.block !== undefined) f.ofTypes = requireTypeNames(filter.block, "block");
  return f;
}

function clickFilter(filter: ClickEventFilter | undefined, what: string): EventFilter {
  requireFilterKeys(filter, ["block", "entity", "item", "priority"], what);
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
  requireFilterKeys(filter, ["item", "priority"], "onPickup");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("pickup", body, f, requirePriority(filter?.priority, "onPickup")));
}

/** Construct an on-drop event: a player drops an item from their inventory. The optional filter restricts it to the named item types ("on drop of an egg"); cancelling it keeps the item. */
export function onDrop(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item", "priority"], "onDrop");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(eventWithFilter("drop", body, f, requirePriority(filter?.priority, "onDrop")));
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
  requireFilterKeys(filter, ["item", "priority"], "onEntityPickup");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(
    eventWithFilter("entityPickup", body, f, requirePriority(filter?.priority, "onEntityPickup")),
  );
}

/** Construct an entity-drop event: a NON-player entity drops an item (a chicken laying an egg). Player drops are the bare onDrop form. The optional filter restricts it to the named item types ("on entity drop of egg"). */
export function onEntityDrop(body: readonly Stmt[], filter?: ItemEventFilter): TopLevel {
  requireFilterKeys(filter, ["item", "priority"], "onEntityDrop");
  const f: EventFilter = {};
  if (filter?.item !== undefined) f.ofTypes = requireTypeNames(filter.item, "item");
  return withLoc(
    eventWithFilter("entityDrop", body, f, requirePriority(filter?.priority, "onEntityDrop")),
  );
}

/** Construct a fish-cast event: a player casts a fishing line (state "fishing line cast"). */
export function onFishCast(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishCast", body, options, "onFishCast"));
}

/** Construct a fish-approach event: a fish is approaching the bobber (state "lured"). */
export function onFishApproach(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishApproach", body, options, "onFishApproach"));
}

/** Construct a fish-bite event: a fish bites the hook (state "bite"). Reel in promptly or the fish escapes. */
export function onFishBite(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishBite", body, options, "onFishBite"));
}

/** Construct a fish-caught event: the player reels in a fish (state "fish caught"). The caught stack is itemOfEntity(eventEntity()). */
export function onFishCaught(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishCaught", body, options, "onFishCaught"));
}

/** Construct an entity-hooked event: the hook catches an entity (state "entity caught"). hookedEntity() / eventEntity() are the caught entity. */
export function onEntityHooked(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("entityHooked", body, options, "onEntityHooked"));
}

/** Construct a hook-in-ground event: the bobber hits the ground (state "bobber in ground"). */
export function onHookInGround(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("hookInGround", body, options, "onHookInGround"));
}

/** Construct a fish-escape event: the bite window lapsed without a reel-in and the fish got away (state "fish escape"). */
export function onFishEscape(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishEscape", body, options, "onFishEscape"));
}

/** Construct a fish-reel-in event: the player reels the line in without a catch (state "reel in"). */
export function onFishReelIn(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishReelIn", body, options, "onFishReelIn"));
}

/** Construct a fishing-state-change event: fires for EVERY fishing state; read the state with eventFishingState(). */
export function onFishingStateChange(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("fishingStateChange", body, options, "onFishingStateChange"));
}

/** Construct an event-entity expression: the entity an entity pickup / drop is about; in fishing events, the caught entity (or the caught Item entity for a fish). */
export function eventEntity(): EntityExpr {
  return { kind: "eventEntity" } as EntityExpr;
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
  "fishing line cast",
  "lured",
  "bite",
  "fish caught",
  "entity caught",
  "bobber in ground",
  "fish escape",
  "reel in",
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
export function onRespawn(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("respawn", body, options, "onRespawn"));
}

/** Construct an on-bed-enter event: a player gets into a bed. eventBlock() is the bed; the event is cancellable. */
export function onBedEnter(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("bedEnter", body, options, "onBedEnter"));
}

/** Construct an on-bed-leave event: a player gets out of a bed. eventBlock() is the bed; the event is not cancellable. */
export function onBedLeave(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("bedLeave", body, options, "onBedLeave"));
}

// ---------------------------------------------------------------------------
// More events (feedback batch D): consume, craft, projectile
// hit, toggle sneak, and the engine-only swap-hand event. The
// five core headers were probed live against the real Skript
// 2.17.1 ("on consume:", "on craft:", "on inventory drag:",
// "on projectile hit:", "on toggle sneak:" all parse); the
// swap-hand event exists under NO spelling in the original
// (on swap hand / on item swap / on hand swap / on swap /
// on offhand swap all rejected), so onSwapHand is engine-only
// and scripts using it deploy IR-only, per the established
// ENGINE_ONLY_EVENTS mechanism.
//
// Event values, by Bukkit event:
// - consume (PlayerItemConsumeEvent): player(), eventItem()
//   is the consumed stack. Cancellable — cancelling leaves
//   the item uneaten.
// - craft (CraftItemEvent): player() is the clicking player,
//   eventItem() is the crafted result, eventInventory() is
//   the crafting inventory. Cancellable.
// - projectile hit (ProjectileHitEvent): attacker() is the
//   shooter when it is an entity (no value for a dispenser
//   shot), victim() the hit entity (no value for a block
//   hit), eventBlock() the hit block (no value for an entity
//   hit). NOT cancellable in Bukkit, so no cancellable is
//   packed — a cancelEvent() in the handler is a no-op, the
//   onRespawn precedent.
// - toggle sneak (PlayerToggleSneakEvent): player().
//   Cancellable — cancelling keeps the previous sneak state.
// - swap hand (PlayerSwapHandItemsEvent, engine-only):
//   player(), eventItem() is the item moving INTO the main
//   hand. Cancellable.
// ---------------------------------------------------------------------------

/** Construct an on-consume event: a player consumes an item (eats, drinks). eventItem() is the consumed stack; the event is cancellable. */
export function onConsume(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("consume", body, options, "onConsume"));
}

/** Construct an on-craft event: a player takes a crafted result out of a crafting inventory. eventItem() is the result, eventInventory() the crafting inventory; the event is cancellable. */
export function onCraft(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("craft", body, options, "onCraft"));
}

/** Construct a projectile-hit event: a projectile hits an entity or a block. attacker() is the shooter (entity shooters only), victim() the hit entity, eventBlock() the hit block. Not cancellable. */
export function onProjectileHit(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("projectileHit", body, options, "onProjectileHit"));
}

/** Construct a toggle-sneak event: a player starts or stops sneaking. The event is cancellable. */
export function onToggleSneak(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("toggleSneak", body, options, "onToggleSneak"));
}

/** Construct a swap-hand event: a player swaps their main-hand and off-hand items. eventItem() is the item moving into the main hand; the event is cancellable. ENGINE-ONLY: Skript has no swap-hand event under any spelling, so scripts using it deploy IR-only. */
export function onSwapHand(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("swapHand", body, options, "onSwapHand"));
}

/** Construct an event-block expression: the block of a block break / place / click event (no value for air clicks). */
export function eventBlock(): BlockExpr {
  return { kind: "eventBlock" } as BlockExpr;
}

/** Construct an event-item expression: the item a click / place event involves (hand / placed item); in break events, the broken block in item form. */
export function eventItem(): ItemExpr {
  return { kind: "eventItem" } as ItemExpr;
}

/** Construct an attacker expression: the entity that caused a damage event (no value for environmental damage). */
export function attacker(): EntityExpr {
  return { kind: "attacker" } as EntityExpr;
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
export function setDamage(value: Value): Stmt {
  return withLoc({ kind: "setDamage", value: toExpr(value) });
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
  /**
   * Per-player cooldown in seconds (feedback C6): after a player
   * runs the command, running it again before this many seconds
   * have passed does not run the body. Must be a positive finite
   * number; fractions are allowed (`2.5` emits `2.5 seconds`).
   * Console senders are never cooled down.
   */
  cooldown?: number;
  /**
   * Text sent to a player who runs the command while it is on
   * cooldown for them (a single line). Under the engine the text
   * is sent with the usual color-code parsing but otherwise
   * as-is: the `%remaining time%` / `%elapsed time%`
   * substitutions the original performs are NOT applied in this
   * version, so those placeholders stay literal under the engine
   * (they are substituted under Skript). With no message, a
   * blocked run is silent under the engine.
   */
  cooldownMessage?: string;
  /**
   * A permission node whose holders skip the cooldown entirely
   * (the original's `cooldown bypass:` entry).
   */
  cooldownBypass?: string;
  /**
   * Who may execute the command (the original's
   * `executable by:` entry): `"players"` rejects non-player
   * senders, `"console"` rejects player senders, and `"both"`
   * (emitted as `players and console`) allows everyone. Under
   * the engine a rejected sender gets the same
   * unknown-command failure as a sender who fails the
   * permission check.
   */
  executableBy?: CommandExecutableBy;
}

const COMMAND_ARG_TYPES: ReadonlySet<string> = new Set([
  "text",
  "player",
  "offlinePlayer",
  "integer",
  "number",
  "boolean",
  "item",
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
 *   its fourth argument too). Feedback C6 adds the cooldown /
 *   executable-by entries to the same options object.
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
  if (
    options?.cooldown !== undefined &&
    (typeof options.cooldown !== "number" ||
      !Number.isFinite(options.cooldown) ||
      options.cooldown <= 0)
  ) {
    throw new RangeError(`invalid command cooldown: ${JSON.stringify(options.cooldown)}`);
  }
  if (
    options?.cooldownMessage !== undefined &&
    (options.cooldownMessage === "" || /[\r\n]/.test(options.cooldownMessage))
  ) {
    throw new RangeError("command cooldown message must be a single non-empty line");
  }
  if (options?.cooldownBypass !== undefined && !/^\S+$/.test(options.cooldownBypass)) {
    throw new RangeError(
      `invalid command cooldown bypass: ${JSON.stringify(options.cooldownBypass)}`,
    );
  }
  if (
    options?.executableBy !== undefined &&
    options.executableBy !== "players" &&
    options.executableBy !== "console" &&
    options.executableBy !== "both"
  ) {
    throw new RangeError(`invalid command executableBy: ${JSON.stringify(options.executableBy)}`);
  }
  return withLoc({
    kind: "command",
    name,
    args: specs,
    ...(options?.permission !== undefined ? { permission: options.permission } : {}),
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    ...(aliases !== undefined && aliases.length > 0 ? { aliases } : {}),
    ...(options?.cooldown !== undefined ? { cooldown: options.cooldown } : {}),
    ...(options?.cooldownMessage !== undefined ? { cooldownMessage: options.cooldownMessage } : {}),
    ...(options?.cooldownBypass !== undefined ? { cooldownBypass: options.cooldownBypass } : {}),
    ...(options?.executableBy !== undefined ? { executableBy: options.executableBy } : {}),
    body,
  });
}

/**
 * Construct a script from top-level declarations. Typed function
 * handles (from defineFn) are accepted directly wherever their
 * definition belongs: each handle is unwrapped to its
 * .definition, which is also where the unwrapping happens for
 * everything downstream (emit / IR read the Script body only).
 */
export function script(...body: (TopLevel | FnHandle<any, any>)[]): Script {
  return {
    kind: "script",
    body: body.map((item) => (isFnHandle(item) ? item.definition : item)),
  };
}

/**
 * Declare a script's load order (feedback B4): the engine
 * loads scripts in ascending declared order (undeclared
 * scripts count as 0; ties fall back to the relative path),
 * which fixes same-priority event handler order, duplicate
 * definition resolution and periodical scheduling order
 * across files without encoding it in file names. Skript
 * loads .sk files in filename order and has no equivalent —
 * the declaration is engine-only metadata in the IR, and
 * the emitted .sk is unchanged.
 */
export function loadOrder(order: number, value: Script): Script {
  if (!Number.isFinite(order)) {
    throw new RangeError("load order must be a finite number");
  }
  return { ...value, loadOrder: order };
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
export function onPlaceholderRequest(
  prefix: string | readonly string[],
  body: readonly Stmt[],
): TopLevel {
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
export function contains(container: Expr, item: Value): Cond {
  return { kind: "contains", container, item: toExpr(item) };
}

/** Construct a starts-with condition: a case-sensitive prefix test on a text. */
export function startsWith(target: Expr, prefix: Value): Cond {
  return { kind: "startsWith", target, prefix: toExpr(prefix) };
}

/** Construct an ends-with condition: a case-sensitive suffix test on a text. */
export function endsWith(target: Expr, suffix: Value): Cond {
  return { kind: "endsWith", target, suffix: toExpr(suffix) };
}

/**
 * Construct a replace-all statement: rewrite every occurrence of
 * `find` in the text held by a scalar variable. Matching is
 * literal and case-insensitive unless `caseSensitive` is true.
 */
export function replaceAllIn(
  target: ScalarVarExpr,
  find: Expr,
  replacement: Expr,
  caseSensitive = false,
): Stmt {
  return withLoc({
    kind: "textReplace",
    target,
    find,
    replacement,
    firstOnly: false,
    caseSensitive,
  });
}

/**
 * Construct a replace-first statement: rewrite only the first
 * occurrence of `find` in the text held by a scalar variable.
 * Matching is literal and case-insensitive unless
 * `caseSensitive` is true.
 */
export function replaceFirstIn(
  target: ScalarVarExpr,
  find: Expr,
  replacement: Expr,
  caseSensitive = false,
): Stmt {
  return withLoc({
    kind: "textReplace",
    target,
    find,
    replacement,
    firstOnly: true,
    caseSensitive,
  });
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
// - toolOf / offHandToolOf read the item in a player's main /
//   off hand (Skript's player-tool expressions). They are not
//   event values: they read the live hand wherever a player
//   value exists, so inside a block break the main hand yields
//   the digging tool while eventItem() yields the broken block
//   in item form. An empty hand reads as the air item — unlike
//   eventItem(), whose empty hand has no value.
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

// ---------------------------------------------------------------------------
// Resource pack custom items (RP-2)
//
// customItem(ref) references an item defined by the project's
// resource pack (defineItem). The reference is by id as written
// (a bare path resolves against the pack namespace) or by passing
// the ItemDef itself. The node is UNRESOLVED at script-build time;
// the project build resolves it against the pack — filling the
// resolved item id (the item_model component), the base item, the
// registry CustomModelData number and the defined display name —
// before emit/IR. Using it in a project with no matching pack item
// is a build error. Compose with the phase-17 suffixes and give:
// withAmount(customItem("gem"), num(3)), giveItem(player, ...).
// itemModelOf / customModelDataOf read the components back off any
// item value: no value when no item model is set, 0 when no custom
// model data is set (the probed Skript 2.17.1 forms).
// ---------------------------------------------------------------------------

/**
 * Reference a custom item from the project's resource pack.
 *
 * The node is UNRESOLVED at script-build time. The project build resolves
 * `ref` against the project's resource pack, filling `id`, `baseItem`,
 * `customModelData`, and `displayName`, before Skript emit/IR.
 */
export function customItem(ref: string | ItemDef): Expr {
  let value: string;
  if (typeof ref === "string") {
    if (ref.length === 0) {
      throw new RangeError("customItem: ref must be a non-empty string");
    }
    value = ref;
  } else {
    if (ref.kind !== "item") {
      throw new RangeError('customItem: ItemDef must have kind "item"');
    }
    value = ref.id;
  }
  return { kind: "customItem", ref: value };
}

/** Construct an item-model-of expression: the item's `item_model` component id (no value when unset). */
export function itemModelOf(target: Expr): Expr {
  return { kind: "itemModelOf", target };
}

/** Construct a custom-model-data-of expression: the item's first CustomModelData float as a number (0 when unset). */
export function customModelDataOf(target: Expr): Expr {
  return { kind: "customModelDataOf", target };
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

/** Construct a tool-of expression: the item in the player's main hand (`tool of %player%`). An empty hand reads as an air item, exactly like Skript's tool expression; only a non-player target has no value. In a block break this is the digging tool — eventItem() there is the broken block in item form, not the tool. */
export function toolOf(target: Expr): Expr {
  return { kind: "toolOf", target };
}

/** Construct an off-hand tool-of expression: the item in the player's off hand (`offhand tool of %player%`). The same value rules as toolOf: an empty off hand reads as an air item, and only a non-player target has no value. This is the typed read that replaces scanning slot 40 of the inventory by hand. */
export function offHandToolOf(target: Expr): Expr {
  return { kind: "offHandToolOf", target };
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

// ---------------------------------------------------------------------------
// Hidden item tags (feedback D): ENGINE-ONLY
//
// Names and lore can be faked by a modified client, so authenticity
// markers must live where display data cannot reach: the item's
// PersistentDataContainer. Skript has no PDC access at all, so —
// like the other engine builtins — these three builders have no
// .sk form: a script using any of them is engine-only and deploys
// as IR only (see ir.ts).
//
// - The engine namespaces every key with the plugin's own
//   NamespacedKey (namespace "skript-ts"), so script tags can
//   neither collide with nor read another plugin's tags.
// - Keys are validated HERE, at build time: lowercase
//   [a-z0-9._-] only (a non-empty string). Anything else is a
//   RangeError before any IR is written.
// - Type mapping (the value's runtime type decides the stored
//   PDC type): text -> STRING, number -> DOUBLE, boolean -> BYTE
//   (1/0, read back as a boolean). A value of any other type
//   makes setItemTag a no-op.
// - setItemTag mirrors setItemName: it rewrites the item a scalar
//   variable holds (a bare type name is materialized first) and a
//   variable holding no item value is left untouched.
// - itemTag yields the tag value, or no value when the tag is
//   missing, the item has no meta, or the value is not an item.
//   hasItemTag is the leaf-condition form: false in exactly those
//   cases (it can head a while loop, like the other leaf
//   conditions).
// - Persistence: tags survive the engine's variable store — the
//   `__item` encoding in Variables.java carries them alongside
//   material / amount / name / lore, so a tagged stack stored in
//   a global variable keeps its tags across restarts. Saves
//   written before tags existed have no tag field and still
//   decode (as untagged stacks).
// ---------------------------------------------------------------------------

const ITEM_TAG_KEY_PATTERN = /^[a-z0-9._-]+$/;

/** Validate a hidden item tag key at build time: lowercase [a-z0-9._-] only. */
function requireItemTagKey(key: string): string {
  if (typeof key !== "string" || !ITEM_TAG_KEY_PATTERN.test(key)) {
    throw new RangeError(
      "item tag key must be a non-empty lowercase [a-z0-9._-] string: " + JSON.stringify(key),
    );
  }
  return key;
}

/**
 * Construct a set-item-tag statement (engine-only): write a hidden tag into the
 * PersistentDataContainer of the item a scalar variable holds. A variable with
 * no item value is left untouched, mirroring setItemName.
 */
export function setItemTag(target: ScalarVarExpr, key: string, value: Value): Stmt {
  return withLoc({ kind: "setItemTag", target, key: requireItemTagKey(key), value: toExpr(value) });
}

/** Construct an item-tag expression (engine-only): the tag value stored on an item, or no value when absent. */
export function itemTag(item: Expr, key: string): Expr {
  return { kind: "itemTag", item, key: requireItemTagKey(key) };
}

/** Construct a has-item-tag condition (engine-only): the item carries a hidden tag under the key. */
export function hasItemTag(item: Expr, key: string): Cond {
  return { kind: "hasItemTag", item, key: requireItemTagKey(key) };
}

/** Construct a set-slot statement: write an item into a 0-based slot of an inventory (a player means their own inventory). */
export function setSlot(inventory: Expr, slot: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "setSlot", inventory, slot, item: itemValue });
}

/** Construct an open-inventory statement: show an inventory value to a player. */
export function openInventory(target: Expr, inventory: Expr): Stmt {
  return withLoc({ kind: "openInventory", target, inventory });
}

// ---------------------------------------------------------------------------
// GUI identity (feedback B3, with the T4 typed-identifier angle):
// an unspoofable identity for script-opened GUIs.
//
// Title matching is NOT identity: inventoryTitle()/nameOf reads
// the real title of ANY inventory, so a player-renamed chest (or
// any container) titled "Shop Menu" is indistinguishable from
// the script's own shop GUI, and a click handler guarding on the
// title alone can be fooled. A GuiHandle is the typed fix: pass
// one to openGui and the engine registers the opened inventory
// under the handle's id in its own registry — a value no player
// action can forge, because it never comes from the inventory
// itself. Inside inventory events, guiEventIs(handle) tests the
// current event inventory's registered id and guiEventId()
// reads it as text.
//
// Matching is by handle/id, never by title text (T4). Handles
// are plain build-time values: define one once
// (const shopGui = guiHandle("shop")) and reuse the same handle
// at the open site and in every handler.
//
// All three constructs are ENGINE-ONLY: the identity lives in
// the engine's registry, so there is no .sk form. A tagged open
// is its own statement kind (openGuiTagged) precisely so that
// kind-based engine-only detection does not drag the plain,
// fully core openGui with it — untagged openGui scripts stay
// portable.
// ---------------------------------------------------------------------------

/**
 * A typed identifier for a script GUI (feedback B3 / T4). See
 * guiHandle(): the handle carries only its `id`; matching is by
 * that id, never by the GUI's title text.
 */
export interface GuiHandle {
  /** The GUI's registered id (a non-empty string). */
  readonly id: string;
}

function requireGuiId(id: unknown): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("gui handle id must be a non-empty string");
  }
  return id;
}

/**
 * Construct a GUI handle (feedback B3 / T4): the typed identifier
 * of a script GUI. Pass it as openGui's fourth argument to
 * register the opened GUI under this id, and to guiEventIs() to
 * recognize the GUI again inside inventory events. The id must
 * be a non-empty string. ENGINE-ONLY feature.
 */
export function guiHandle(id: string): GuiHandle {
  return { id: requireGuiId(id) };
}

/**
 * Construct an open-GUI statement: build a fresh chest inventory
 * (rows 1..6, optional title) and open it to a player. With a
 * GuiHandle as the fourth argument the opened GUI is registered
 * under the handle's id (ENGINE-ONLY — see guiHandle); without
 * one the statement is plain core language.
 */
export function openGui(target: Expr, rows: Expr, title?: Expr, gui?: GuiHandle): Stmt {
  if (gui !== undefined) {
    const guiId = requireGuiId(gui?.id);
    return title === undefined
      ? withLoc({ kind: "openGuiTagged", target, rows, guiId })
      : withLoc({ kind: "openGuiTagged", target, rows, title, guiId });
  }
  return title === undefined
    ? withLoc({ kind: "openGui", target, rows })
    : withLoc({ kind: "openGui", target, rows, title });
}

/**
 * Construct a GUI-identity condition (feedback B3 / T4): true
 * when the current inventory event's inventory is a script GUI
 * registered under the handle's id. False outside inventory
 * events and for inventories the script did not tag — including
 * title lookalikes. ENGINE-ONLY.
 */
export function guiEventIs(gui: GuiHandle): Cond {
  return { kind: "guiEventIs", guiId: requireGuiId(gui?.id) };
}

/**
 * Construct a GUI-event-id expression (feedback B3 / T4): the
 * registered id (text) of the current inventory event's GUI, or
 * no value when the event's inventory is not a tagged script
 * GUI. ENGINE-ONLY.
 */
export function guiEventId(): Expr {
  return { kind: "guiEventId" };
}

/** Construct a close-inventory statement: close the inventory view a player has open. */
export function closeInventory(target: Expr): Stmt {
  return withLoc({ kind: "closeInventory", target });
}

/** Construct an inventory-click event: fires for every click in an inventory view, with eventItem / eventInventory / slot indices set. */
export function onInventoryClick(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("inventoryClick", body, options, "onInventoryClick"));
}

/** Construct an inventory-close event: fires when a player closes an inventory view. */
export function onInventoryClose(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("inventoryClose", body, options, "onInventoryClose"));
}

// ---------------------------------------------------------------------------
// Inventory operations (feedback lane D, 2026-11-13): test, count,
// remove and capacity-check the items in a player's inventory (or
// an inventory value). All semantics were probed against the real
// Skript 2.17.1 before designing (five probe rounds; the records
// live with the lane's notes):
//
// - Matching (hasItem / itemCountIn / removeItem /
//   removeAllItems) is DIRECTIONAL, exactly like the original's
//   item conditions: a stack matches the pattern when its type
//   equals the pattern's type and every meta field the pattern
//   specifies (custom name, lore, ...) matches exactly —
//   unspecified fields are free. So a bare `diamond` pattern
//   matches named diamonds too, while a `diamond named "Gem"`
//   pattern matches only the stacks carrying that name. A
//   pattern is an item expression: use withAmount(...) to ask
//   for more than 1; a bare pattern means an amount of 1.
// - The target is a player (their whole inventory: main storage,
//   armor AND offhand all count for has / count / remove) or an
//   inventory value (a chestInventory, currentInventoryOf(...),
//   eventInventory(), ...). The .sk forms emitted are the
//   original's own: `<target> has <item>`,
//   `amount of <item> in <target>`, `remove <item> from
//   <target>`, `remove all <item> from <target>`.
// - removeItem is PARTIAL, like the original: asking for more
//   than the inventory holds removes what exists and silently
//   skips the rest — it never fails and never goes negative.
//   Stacks are consumed in slot order (main storage, then armor,
//   then the offhand).
// - Capacity (canHoldItem / freeSpaceFor) follows a DIFFERENT,
//   stricter rule — the original's own: only the 36 storage
//   slots count (armor and the offhand never do), an empty slot
//   fits a full max-size stack of the pattern's material, and a
//   partially filled slot only takes more of a stack EXACTLY
//   similar to the pattern (meta equal both ways — a plain
//   diamond stack gives a named pattern no merge room, and vice
//   versa). An empty inventory therefore holds 36 x 64 = 2304
//   diamonds but only 36 diamond swords.
// - freeSpaceFor has NO form in the original (every free-space /
//   empty-slot amount expression failed to parse), so it is an
//   ENGINE-ONLY expression: a script using it deploys IR-only,
//   like the other engine builtins. canHoldItem is the portable
//   boolean form of the same number.
// - A target or pattern with no value (an unset item variable, a
//   non-player target) reads as: has = false, count / free
//   space = no value, remove = a no-op (engine micro-choice,
//   mirroring how the other item operations treat missing
//   values).
// ---------------------------------------------------------------------------

/** Test whether a target inventory holds at least the pattern item's amount of matching items. */
export function hasItem(target: Expr, item: Expr): Cond {
  return { kind: "hasItem", target, item };
}

/** Read how many items matching the pattern a target inventory holds (armor and offhand included for players). */
export function itemCountIn(target: Expr, item: Expr): Expr {
  return { kind: "itemCountIn", target, item };
}

/** Remove up to the pattern item's amount of matching items from a target, in slot order; a shortfall removes what exists. */
export function removeItem(target: Expr, item: Expr): Stmt {
  return withLoc({ kind: "removeItem", target, item });
}

/** Remove every item matching the pattern from a target, whatever the count. The pattern must not carry an amount. */
export function removeAllItems(target: Expr, item: Expr): Stmt {
  if (item.kind === "itemWithAmount") {
    throw new RangeError(
      "removeAllItems takes a bare item pattern: 'remove all' has no counted form in Skript — " +
        "use removeItem with withAmount(...) to remove a fixed number instead",
    );
  }
  return withLoc({ kind: "removeAllItems", target, item });
}

/** Test whether the pattern item's amount still fits into a target's storage slots (exact-similarity merging; see the section note). */
export function canHoldItem(target: Expr, item: Expr): Cond {
  return { kind: "canHoldItem", target, item };
}

/** Read how many more of the pattern item fit into a target's storage slots. ENGINE-ONLY: Skript has no such expression. */
export function freeSpaceFor(target: Expr, item: Expr): Expr {
  return { kind: "freeSpaceFor", target, item };
}

// ---------------------------------------------------------------------------
// Core language (phase 28): GUI slice 2 — drags, slot add/remove,
// cursor, enchantments
//
// Semantics mirror the real Skript 2.17.1, verified against the
// sandbox server with hand-written probe scripts (seven rounds)
// and mineflayer bot drags of a real GUI (see the development
// log):
//
// - onInventoryDrag fires for inventory drags. Cancelling a drag
//   stops the distribution, while cancelling clicks does NOT
//   stop drags (a real GUI must cancel both). Inside,
//   eventItem() is the cursor item AFTER the drag (an air item
//   of amount 0 when the drag empties the cursor — not no
//   value), eventInventory() is the view's top inventory, and
//   draggedSlots() loops the slots that actually receive
//   items: incompatible slots are excluded, each slot's index
//   counts within its own inventory, and the order is
//   unspecified.
// - add/remove on slots and whole inventories take item
//   operands only — the original rejects a bare number operand
//   outright ('3' can't be added to a slot because the former
//   is neither an item type nor an item stack); counts ride on
//   the item (withAmount). Slot add merges into a similar
//   stack (similarity = type plus the both-carry meta rule,
//   keeping the slot stack's meta) up to the material's max
//   stack size, sets an empty slot (capped at 99, possibly
//   above the material max), and silently drops whatever does
//   not fit or does not match. Slot remove matches by type
//   only. Inventory add merges similar partial stacks in slot
//   order, then fills empty slots, and silently drops the
//   rest; inventory remove subtracts by type in slot order.
//   An emptied slot reads back as an air item of amount 0.
// - clickedClickType() yields the click's type as text in
//   inventory click events ("left mouse button", "right mouse
//   button", "left mouse button with shift", ...).
// - The original has NO cursor syntax at all (probed: every
//   candidate spelling is rejected), so eventCursor() /
//   setCursorItem() are engine-only builtins: inside inventory
//   click and drag events the cursor is the item the player is
//   carrying (for a click, the pre-click item); setCursorItem
//   replaces it (during a click/drag event the replacement is
//   applied as the event completes — the event's own cursor
//   setter does not survive Paper's click resolution).
// - Enchantments: withEnchantment applies only to item type
//   literals (the original's `of <enchantment> <level>` suffix
//   lives in item literals; levels are literal integers; level
//   0 means no enchantment; incompatible enchantments and
//   levels above the vanilla cap are accepted). enchantItem /
//   enchantSlot are the effect forms for variables and slots.
//   enchantmentLevelOf yields no value for an unenchanted
//   item; enchantmentsOf yields the print forms ("sharpness
//   5") as a text list, no value when there are none. Stack
//   equality extends the both-carry rule: two enchanted stacks
//   need the exact same enchantment set; a stack enchanted on
//   only one side differs UNLESS the enchanted stack also
//   carries a name or lore, in which case the enchantment
//   difference is ignored.
// ---------------------------------------------------------------------------

/** Construct an item-with-enchantment expression: the item with an enchantment at a literal level. The base must be an item literal (the original's suffix exists only in item type literals). */
export function withEnchantment(base: Expr, enchant: string, level: number): Expr {
  if (!Number.isInteger(level) || level < 0) {
    throw new RangeError("withEnchantment: level must be a non-negative integer");
  }
  return { kind: "itemWithEnchantment", base, enchant, level };
}

/** Construct an enchantment-level expression: the level of an enchantment on an item (no value when the item lacks it). */
export function enchantmentLevelOf(target: Expr, enchant: string): Expr {
  return { kind: "enchantmentLevelOf", target, enchant };
}

/** Construct an enchantments expression: an item's enchantments in print form ("sharpness 5") as a text list (no value when there are none). */
export function enchantmentsOf(target: Expr): Expr {
  return { kind: "enchantmentsOf", target };
}

/** Construct a dragged-slots expression: the slot values a drag distributes into (inventory drag events), for use with a list loop and slotIndexOf. */
export function draggedSlots(): Expr {
  return { kind: "draggedSlots" };
}

/** Construct a slot-index expression: a slot value's index within the inventory it belongs to. */
export function slotIndexOf(target: Expr): Expr {
  return { kind: "slotIndexOf", target };
}

/** Construct a clicked-click-type expression: the click's type as text (inventory click events). */
export function clickedClickType(): Expr {
  return { kind: "clickedClickType" };
}

/** Construct an event-cursor expression: the item on the event player's cursor (inventory click/drag events). Engine-only: the original has no cursor syntax. */
export function eventCursor(): Expr {
  return { kind: "eventCursor" };
}

/** Construct an add-to-slot statement: add an item into a 0-based slot of an inventory, merging with a similar stack; whatever does not fit or match is silently dropped. */
export function addToSlot(inventory: Expr, slot: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "addToSlot", inventory, slot, item: itemValue });
}

/** Construct a remove-from-slot statement: subtract an item from a 0-based slot of an inventory, matching by type only. */
export function removeFromSlot(inventory: Expr, slot: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "removeFromSlot", inventory, slot, item: itemValue });
}

/** Construct an add-to-inventory statement: add an item to an inventory (merge similar partial stacks, then empty slots); the rest is silently dropped. */
export function addToInventory(inventory: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "addToInventory", inventory, item: itemValue });
}

/** Construct a remove-from-inventory statement: subtract an item from an inventory by type, in slot order. */
export function removeFromInventory(inventory: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "removeFromInventory", inventory, item: itemValue });
}

/** Construct an enchant-item statement: apply an enchantment at a literal level to the item a scalar variable holds. */
export function enchantItem(target: ScalarVarExpr, enchant: string, level: number): Stmt {
  if (!Number.isInteger(level) || level < 0) {
    throw new RangeError("enchantItem: level must be a non-negative integer");
  }
  return withLoc({ kind: "enchantItem", target, enchant, level });
}

/** Construct an enchant-slot statement: apply an enchantment at a literal level to the item in a 0-based slot of an inventory. */
export function enchantSlot(inventory: Expr, slot: Expr, enchant: string, level: number): Stmt {
  if (!Number.isInteger(level) || level < 0) {
    throw new RangeError("enchantSlot: level must be a non-negative integer");
  }
  return withLoc({ kind: "enchantSlot", inventory, slot, enchant, level });
}

/** Construct a set-cursor-item statement: replace the item on a player's cursor. Engine-only: the original has no cursor syntax. */
export function setCursorItem(target: Expr, itemValue: Expr): Stmt {
  return withLoc({ kind: "setCursorItem", target, item: itemValue });
}

/** Construct an inventory-drag event: fires for every drag in an inventory view, with eventItem (the post-drag cursor) / eventInventory / dragged slots set. */
export function onInventoryDrag(body: readonly Stmt[], options?: EventOptions): TopLevel {
  return withLoc(plainEvent("inventoryDrag", body, options, "onInventoryDrag"));
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
export function blockAt(location: Expr): BlockExpr {
  return { kind: "blockAt", location } as BlockExpr;
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
  "above",
  "below",
  "north",
  "south",
  "east",
  "west",
  "front",
  "behind",
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

// ---------------------------------------------------------------------------
// World paint (engine-only): compose a shape with a fill and
// write the whole region in one bulk operation via paint().
// Shapes and fills are runtime-only values (like data sources):
// build them inline or store them in a variable and reuse them.
// The bulk write and the seeded, position-based material
// selection have no .sk form, so scripts using this family
// deploy as IR only and run under the engine jar.
// ---------------------------------------------------------------------------

/** Construct a cuboid shape: every block between two corner locations, inclusive, in either corner order. */
export function cuboid(from: Expr, to: Expr): Expr {
  return { kind: "cuboidShape", from, to };
}

/** Construct a sphere shape: every block whose integer offset from the center location's block satisfies dx²+dy²+dz² ≤ radius². */
export function sphere(center: Expr, radius: Expr): Expr {
  return { kind: "sphereShape", center, radius };
}

/** Construct a cylinder shape: the vertical cylinder over the center location's block (dx²+dz² ≤ radius²), rising `height` layers from the center's Y (a layer count, at least 1). */
export function cylinder(center: Expr, radius: Expr, height: Expr): Expr {
  return { kind: "cylinderShape", center, radius, height };
}

/** Construct a line shape: the blocks on the segment between two locations, stepped along the dominant axis so the line stays connected. */
export function blockLine(from: Expr, to: Expr): Expr {
  return { kind: "lineShape", from, to };
}

/** Construct a uniform fill: one item's material at every position of the shape. */
export function uniformFill(item: Expr): Expr {
  return { kind: "uniformFill", item };
}

/**
 * Construct a mix fill: each position picks one of the given
 * items by weight, using a seeded position hash — the same
 * (seed, position) always picks the same material, so painting
 * the same shape twice with the same seed is reproducible.
 * Entries are `[item, weight]` pairs; weights are relative
 * (they are normalized) and must be positive. The seed defaults
 * to 0.
 */
export function mixFill(entries: readonly (readonly [Expr, number])[], seed = 0): Expr {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError("mix fill needs at least one [item, weight] entry");
  }
  const checked = entries.map(([item, weight]) => {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      throw new RangeError(`mix fill weights must be positive numbers, got ${String(weight)}`);
    }
    return { item, weight };
  });
  if (!Number.isFinite(seed)) {
    throw new RangeError("mix fill seed must be a finite number");
  }
  return { kind: "mixFill", entries: checked, seed };
}

/**
 * Construct a noise fill: the spot item's material lands where
 * a seeded 3D value noise reaches the coverage threshold, and
 * the base item's material lands elsewhere — the natural mix
 * for scattering gravel over a dirt path and the like. Options:
 * `scale` is the noise feature size in blocks (default 4),
 * `amount` is the approximate spot coverage between 0 and 1
 * (default 0.5), and `seed` (default 0) selects the noise
 * field; the same (seed, position) always picks the same
 * material, so a repaint is reproducible.
 */
export function noiseFill(
  base: Expr,
  spot: Expr,
  options: { scale?: number; amount?: number; seed?: number } = {},
): Expr {
  const scale = options.scale ?? 4;
  const amount = options.amount ?? 0.5;
  const seed = options.seed ?? 0;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`noise fill scale must be a positive number, got ${String(scale)}`);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1) {
    throw new RangeError(`noise fill amount must be between 0 and 1, got ${String(amount)}`);
  }
  if (!Number.isFinite(seed)) {
    throw new RangeError("noise fill seed must be a finite number");
  }
  return { kind: "noiseFill", base, spot, scale, amount, seed };
}

/**
 * Construct a paint statement (engine-only): write every block
 * of `shape` with the material `fill` picks for its position,
 * as one bulk operation in the engine. With `replace`, only
 * positions currently holding that item's material are written.
 * Blocks already holding the picked material are left untouched
 * and the write applies no physics updates.
 */
export function paint(shape: Expr, fill: Expr, options: { replace?: Expr } = {}): Stmt {
  return withLoc(
    options.replace === undefined
      ? { kind: "paint", shape, fill }
      : { kind: "paint", shape, fill, replace: options.replace },
  );
}

// ---------------------------------------------------------------------------
// Engine builtins (particles & fireworks, feedback D): fire-and-
// forget visual effects, executed natively on the Bukkit API.
//
// The coordinator probed the real Skript 2.17.1 in the sandbox:
// it has NO native particle or firework effect — `show 10 of
// flame at ...`, `draw ...` and `launch firework at ...` are all
// parse errors there. These two statements are therefore engine
// builtins like the addon slices: a script using either deploys
// as IR only, and the .sk emitter refuses them.
//
// - spawnParticle takes the Bukkit Particle enum name as a plain
//   string ("FLAME", "HEART", "CRIT_PORTAL", ...). The builder
//   validates only the SHAPE — uppercase snake case — because the
//   enum's membership is a server-version fact, not a builder
//   fact: the engine resolves the name with Particle.valueOf
//   inside a guard, and an unknown (but well-shaped) name logs a
//   warning and does nothing — it never crashes the script. The
//   count is a builder-level number, default 1; the engine treats
//   a count of 0 or less as a no-op. The location is any location-
//   valued expression (a location, a block, an entity — the
//   engine's usual at-position coercion).
// - launchFirework spawns a Firework entity at the location and
//   applies one FireworkEffect built from the options: the colors
//   are "#RRGGBB" hex strings (an unparseable color is skipped
//   engine side; no colors at all yields a default white), the
//   type is one of the FireworkEffect.Type names (default
//   "BALL"), flicker / trail are the effect flags, and power is
//   the flight power (default 1, clamped by the engine to >= 0).
//   All options are builder-level literals, validated here:
//   a bad hex string, an unknown type or a non-finite power is a
//   RangeError at build time.
// ---------------------------------------------------------------------------

const PARTICLE_NAME_PATTERN: RegExp = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function requireParticleName(particle: string): string {
  if (typeof particle !== "string" || !PARTICLE_NAME_PATTERN.test(particle)) {
    throw new RangeError(
      `particle name must be an uppercase snake-case Bukkit Particle enum name, got ${String(particle)}`,
    );
  }
  return particle;
}

/**
 * Construct a spawn-particle statement (engine builtin): spawn
 * `count` particles of the named Bukkit Particle at a location.
 * The name is a Particle enum name in uppercase snake case
 * ("FLAME", "HEART"); a well-shaped name the server does not
 * know is a warned no-op in the engine, never an error. The
 * count defaults to 1; a count of 0 or less spawns nothing.
 */
export function spawnParticle(particle: string, location: Expr, count?: number): Stmt {
  const name = requireParticleName(particle);
  if (count !== undefined && (typeof count !== "number" || !Number.isFinite(count))) {
    throw new RangeError(`particle count must be a finite number, got ${String(count)}`);
  }
  return withLoc(
    count === undefined
      ? { kind: "spawnParticle", particle: name, location }
      : { kind: "spawnParticle", particle: name, location, count },
  );
}

/** The options of launchFirework: builder-level literals for the firework's single effect and its flight power. */
export interface FireworkOptions {
  /** Flight power (default 1); the engine clamps it to >= 0. */
  power?: number;
  /** Effect colors as "#RRGGBB" hex strings; an empty/absent list yields a default white effect. */
  colors?: readonly string[];
  /** Effect shape (default "BALL"). */
  type?: FireworkType;
  /** Whether the effect flickers (default false). */
  flicker?: boolean;
  /** Whether the effect leaves a trail (default false). */
  trail?: boolean;
}

const FIREWORK_TYPES: ReadonlySet<string> = new Set([
  "BALL",
  "BALL_LARGE",
  "BURST",
  "CREEPER",
  "STAR",
]);

const FIREWORK_COLOR_PATTERN: RegExp = /^#[0-9a-fA-F]{6}$/;

/**
 * Construct a launch-firework statement (engine builtin): spawn
 * a firework at a location with one effect built from the
 * options (colors as "#RRGGBB" hex strings, type, flicker,
 * trail) and the given flight power. Bad option shapes — an
 * unparseable hex color, an unknown type, a non-finite power —
 * are RangeErrors at build time.
 */
export function launchFirework(location: Expr, options: FireworkOptions = {}): Stmt {
  const { power, colors, type, flicker, trail } = options;
  if (power !== undefined && (typeof power !== "number" || !Number.isFinite(power))) {
    throw new RangeError(`firework power must be a finite number, got ${String(power)}`);
  }
  if (colors !== undefined) {
    if (!Array.isArray(colors)) {
      throw new RangeError('firework colors must be an array of "#RRGGBB" hex strings');
    }
    for (const color of colors) {
      if (typeof color !== "string" || !FIREWORK_COLOR_PATTERN.test(color)) {
        throw new RangeError(`firework color must be a "#RRGGBB" hex string, got ${String(color)}`);
      }
    }
  }
  if (type !== undefined && !FIREWORK_TYPES.has(type)) {
    throw new RangeError(`invalid firework type: ${String(type)}`);
  }
  if (flicker !== undefined && typeof flicker !== "boolean") {
    throw new RangeError("firework flicker must be a boolean");
  }
  if (trail !== undefined && typeof trail !== "boolean") {
    throw new RangeError("firework trail must be a boolean");
  }
  return withLoc({
    kind: "launchFirework",
    location,
    ...(power !== undefined ? { power } : {}),
    ...(colors !== undefined ? { colors: [...colors] } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(flicker !== undefined ? { flicker } : {}),
    ...(trail !== undefined ? { trail } : {}),
  });
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
  "survival",
  "creative",
  "adventure",
  "spectator",
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
  "healthOf",
  "foodLevelOf",
  "experienceOf",
  "levelOf",
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
  "absorption",
  "bad omen",
  "blindness",
  "conduit power",
  "darkness",
  "dolphin's grace",
  "fire resistance",
  "glowing",
  "haste",
  "health boost",
  "hero of the village",
  "hunger",
  "instant damage",
  "instant health",
  "invisibility",
  "jump boost",
  "levitation",
  "luck",
  "mining fatigue",
  "nausea",
  "night vision",
  "poison",
  "regeneration",
  "resistance",
  "slow falling",
  "slowness",
  "speed",
  "strength",
  "unluck",
  "water breathing",
  "weakness",
  "wither",
  "swiftness",
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
  if (
    durationSeconds !== undefined &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  ) {
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
  const canonical =
    typeof name === "string"
      ? name.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ")
      : "";
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
//   makes a bar value (fresh: empty title, progress 1, white,
//   solid). The plain create forms are `a boss bar`,
//   `a <color> boss bar`, `a bossbar with title %text%` and
//   `a <color> bossbar with title %text%`. Properties are
//   written with the change forms (title / color / progress —
//   progress is a fraction 0..1 that the original clamps) and
//   the viewer set with add/remove; title and progress read
//   back as expressions. Phase 24 added the keyed forms
//   (`a keyed boss bar with key %text%` plus its color and
//   title variants, the `boss bar with key %text%` fetch and
//   `delete boss bar with key %text%`), bar styles, the
//   darken-sky / fog / boss-music flags, and the section
//   creation form (`set <var> to a boss bar:` with an
//   `event-bossbar` body).
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
    [
      "ticks",
      "seconds",
      "minutes",
      "hours",
      "days",
      "weeks",
      "months",
      "years",
    ] as readonly string[]
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

function normalizeTitleTiming(
  label: string,
  timing: TitleTiming | Expr | undefined,
): Expr | undefined {
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
  "pink",
  "blue",
  "red",
  "green",
  "yellow",
  "purple",
  "white",
]);

const BOSS_BAR_STYLE_NAMES: ReadonlySet<string> = new Set([
  "solid",
  "6 notches",
  "10 notches",
  "12 notches",
  "20 notches",
]);

const BOSS_BAR_FLAG_NAMES: ReadonlySet<string> = new Set([
  "darkenSky",
  "createFog",
  "playBossMusic",
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
export function keyedBossBar(
  key: Expr,
  options: { title?: Expr; color?: BossBarColorName } = {},
): Expr {
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
export function createBossBarSection(
  target: VarTarget,
  body: readonly Stmt[],
  options: { key?: Expr; color?: BossBarColorName } = {},
): Stmt {
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

// ---------------------------------------------------------------------------
// Core language (feedback C3): dates — the current time, unix
// timestamps and differences between times
//
// A date is an instant in time with millisecond precision.
// now() is the moment the expression evaluates (the original's
// `now`); a date prints in the original's configured date
// format and stores in variables like any other value.
// unixTimestamp(date) reads a date as seconds since the unix
// epoch (a fractional number — the milliseconds ride along as
// the fraction), and dateFromUnix(seconds) (the original's
// `unix date of ...`) builds the date back; the pair
// round-trips at millisecond precision.
// differenceBetween(a, b) is the original's `difference
// between ... and ...`: two dates yield the absolute gap as a
// timespan, two timespans yield a timespan, two numbers yield a
// number; any other pairing has no value. A date plus or minus
// a timespan (the phase-11 plus / minus builders) is the date
// shifted by that span — asymmetrically: a timespan plus a
// date, a date minus a date and a date plus a number all have
// no value in the original. Shifting is how deadlines are
// written:
// store plus(now(), timespan(90, "seconds")), then read the
// remaining time as differenceBetween(deadline, now()).
// ---------------------------------------------------------------------------

/** The current date and time (feedback C3): the moment this expression evaluates. */
export function now(): Expr {
  return { kind: "now" };
}

/** A date as seconds since the unix epoch, fractional at millisecond precision (feedback C3); a non-date operand has no value. */
export function unixTimestamp(date: Expr): Expr {
  return { kind: "unixTimestamp", date };
}

/** The date at the given number of seconds since the unix epoch (feedback C3); a non-number operand has no value. */
export function dateFromUnix(seconds: Expr): Expr {
  return { kind: "dateFromUnix", seconds };
}

/** The absolute difference between two dates (a timespan), two timespans, or two numbers (feedback C3); other pairings have no value. */
export function differenceBetween(left: Expr, right: Expr): Expr {
  return { kind: "difference", left, right };
}

// ---------------------------------------------------------------------------
// Engine builtins (external connectors, phase 26)
//
// HTTP requests are asynchronous: httpFetch/httpDownload only start a
// request under a caller-chosen literal id and return immediately. The
// result arrives later in an onHttpResponse event, whose httpId(),
// httpStatus(), httpBody(), httpError(), httpSavedPath(), and httpOk()
// values describe that one response. env() reads an environment variable
// of the JVM process; the JVM inherits its environment at launch and it
// never changes afterwards, so changing a variable requires a server
// restart. An unset variable yields no value.
// ---------------------------------------------------------------------------

function requireHttpId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("http id must be a non-empty string");
  }
  return id;
}

function requireTimeoutSeconds(opts?: { timeoutSeconds?: number }): number | undefined {
  const value = opts?.timeoutSeconds;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 120) {
    throw new RangeError("timeoutSeconds must be a number between 1 and 120");
  }
  return value;
}

/** Construct an http-fetch statement that starts an asynchronous text fetch (engine builtin). */
export function httpFetch(id: string, url: TextExpr, opts?: { timeoutSeconds?: number }): Stmt {
  const timeout = requireTimeoutSeconds(opts);
  return withLoc({
    kind: "httpFetch",
    id: requireHttpId(id),
    url,
    ...(timeout !== undefined ? { timeoutSeconds: timeout } : {}),
  });
}

/** Construct an http-download statement that starts an asynchronous file download (engine builtin). */
export function httpDownload(
  id: string,
  url: TextExpr,
  path: TextExpr,
  opts?: { timeoutSeconds?: number },
): Stmt {
  const timeout = requireTimeoutSeconds(opts);
  return withLoc({
    kind: "httpDownload",
    id: requireHttpId(id),
    url,
    path,
    ...(timeout !== undefined ? { timeoutSeconds: timeout } : {}),
  });
}

/** Construct an on-http-response event (engine builtin). */
export function onHttpResponse(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "httpResponse", body });
}

/** Construct an http-id expression: the request id, inside httpResponse events. */
export function httpId(): Expr {
  return { kind: "httpId" };
}

/** Construct an http-status expression: the numeric status, no value when there was no response. */
export function httpStatus(): Expr {
  return { kind: "httpStatus" };
}

/** Construct an http-body expression: the fetched text body (fetch only). */
export function httpBody(): Expr {
  return { kind: "httpBody" };
}

/** Construct an http-error expression: the error kind text, no value on success. */
export function httpError(): Expr {
  return { kind: "httpError" };
}

/** Construct an http-saved-path expression: the saved file path (download only). */
export function httpSavedPath(): Expr {
  return { kind: "httpSavedPath" };
}

/** Construct an http-ok condition (engine builtin): a response arrived and was not an error. */
export function httpOk(): Cond {
  return { kind: "httpOk" };
}

/** Construct an env expression: a JVM-start environment variable; changing it requires a server restart, and an unset variable yields no value. */
export function env(name: TextExpr): Expr {
  return { kind: "envVar", name };
}

// ---------------------------------------------------------------------------
// Engine builtins (Cloudflare, M4 CF-1)
//
// Cloudflare operations are asynchronous like HTTP: cfD1Query starts
// one D1 statement under a caller-chosen literal id against a named
// handle and returns immediately. The handle is resolved by the
// engine from environment variables (SKRIPTTS_CF_*), so credentials
// never appear in scripts or IR; a handle that cannot be resolved
// completes with error kind "policy". The SQL is a text expression
// whose literal parts are the author's SQL and whose expression
// parts become bound ? parameters, never inlined (the dbExecute
// rule). The optional store variable receives the result rows as
// <var>::<column>::<row> entries with the variable itself set to
// the row count, or the affected-row count for statements without
// a result set (the dbExecute mapping). Completion arrives as a
// cfResponse event read through cfId(), cfError(), and cfOk().
// D1 over REST has no session consistency: a read right after a
// write can observe older data on the real service.
// ---------------------------------------------------------------------------

function requireCfId(id: string): string {
  if (typeof id !== "string" || id.trim() === "") {
    throw new RangeError("cf id must be a non-empty string");
  }
  return id;
}

function requireCfHandle(handle: string): string {
  if (typeof handle !== "string" || handle.trim() === "") {
    throw new RangeError("cf handle must be a non-empty string");
  }
  return handle;
}

/** Construct a cf-d1-query statement that starts an asynchronous D1 query (engine builtin). */
export function cfD1Query(
  id: string,
  handle: string,
  sql: TextExpr,
  store?: VariableExpr,
  opts?: { timeoutSeconds?: number },
): Stmt {
  const timeout = requireTimeoutSeconds(opts);
  return withLoc({
    kind: "cfD1Query",
    id: requireCfId(id),
    handle: requireCfHandle(handle),
    sql,
    ...(store !== undefined ? { store } : {}),
    ...(timeout !== undefined ? { timeoutSeconds: timeout } : {}),
  });
}

/** Construct an on-cf-response event (engine builtin). */
export function onCfResponse(body: readonly Stmt[]): TopLevel {
  return withLoc({ kind: "event", event: "cfResponse", body });
}

/** Construct a cf-id expression: the operation id, inside cfResponse events. */
export function cfId(): Expr {
  return { kind: "cfId" };
}

/** Construct a cf-error expression: the error kind text, no value on success. */
export function cfError(): Expr {
  return { kind: "cfError" };
}

/** Construct a cf-ok condition (engine builtin): the operation completed without an error. */
export function cfOk(): Cond {
  return { kind: "cfOk" };
}
