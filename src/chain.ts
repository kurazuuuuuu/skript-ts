// ---------------------------------------------------------------------------
// Method chains (feedback E8): an additive Expr wrapper.
//
// The functional builder API reads inside-out for composed
// expressions — greaterOrEqual(healthOf(player()), 10) — while
// server code mostly flows read -> transform -> compare:
// health first, then the comparison. ExprChain wraps a plain
// Expr node in a small class whose methods delegate one-to-one
// to the existing builders, so x(healthOf(player())).gte(10)
// builds exactly the Cond greaterOrEqual(healthOf(player()), 10)
// builds. There is no new AST node, no emitter or engine change,
// and no runtime semantics change: every method is a thin
// delegation, and the tests pin chain-built and function-built
// programs to identical IR and identical .sk output.
//
// Design rules (recorded in the lane findings):
// - The wrapper is a separate class, NOT an Expr: Expr nodes stay
//   plain objects (the AST invariant the emitter, the IR writer
//   and the engine all rely on), so methods are never attached
//   to a node itself.
// - A method that builds an expression returns a NEW ExprChain,
//   so it can be chained further; a method that builds a
//   condition returns the Cond itself (terminal — conditions do
//   not chain into expressions in this subset).
// - unwrap() (or the readonly .expr) extracts the plain Expr at
//   the end of a chain for positions that take an Expr (set(),
//   send(), fmt(), ...).
// - The type parameter preserves the wrapped node's type, so a
//   branded expression keeps its brand through x(): x(player())
//   is ExprChain<PlayerExpr>, .expr / .unwrap() are PlayerExpr,
//   and a branded value can flow into a defineFn handle's typed
//   parameter after unwrapping. A transforming method returns
//   ExprChain<Expr> (the transform's result is a plain value);
//   the one exception is location(), whose builder returns the
//   LocationExpr brand, so it returns ExprChain<LocationExpr>.
// ---------------------------------------------------------------------------

import {
  equals,
  notEquals,
  greaterThan,
  greaterOrEqual,
  lessThan,
  lessOrEqual,
  isSet,
  contains,
  startsWith,
  endsWith,
  plus,
  minus,
  times,
  dividedBy,
  remainder,
  textLength,
  substring,
  firstChars,
  lastChars,
  charAt,
  upperCase,
  lowerCase,
  colored,
  formatted,
  uncolored,
  unformatted,
  splitText,
  joinText,
  listSize,
  floor,
  ceil,
  abs,
  sqrt,
  round,
  min,
  max,
  healthOf,
  maxHealthOf,
  foodLevelOf,
  saturationOf,
  gameModeOf,
  experienceOf,
  levelOf,
  typeOf,
  locationOf,
  nameOf,
  amountOf,
  loreOf,
  uuidOf,
  toolOf,
  offHandToolOf,
  worldOf,
  xOf,
  yOf,
  zOf,
  str,
  num,
  bool,
} from "./api.js";
import type { LocalVarHandle, PlayerVarHandle, Value } from "./api.js";
import type { Cond, Expr, LocalVariableExpr, LocationExpr, VariableExpr } from "./ast.js";

/**
 * Convert a Value into an Expr. Existing Expr nodes are returned unchanged;
 * primitive literals are normalized through the existing str/num/bool builders.
 */
function toExprValue(value: Value): Expr {
  if (typeof value === "string") return str(value);
  if (typeof value === "number") return num(value);
  if (typeof value === "boolean") return bool(value);
  return value;
}

/**
 * A thin method-chain wrapper around existing skript-ts builders.
 *
 * ExprChain is a plain class, not an Expr itself. Expr and Cond nodes remain plain
 * objects created by the existing builders in `./api.js`. Methods that build an
 * expression return a new ExprChain wrapping the builder result, so they can be
 * chained; condition methods are terminal and return a Cond directly. Use
 * {@link ExprChain.unwrap} to get the underlying plain Expr.
 */
export class ExprChain<T extends Expr = Expr> {
  /** The wrapped plain Expr node. */
  readonly expr: T;

  /** Wrap an existing plain Expr without modifying or cloning it. */
  constructor(expr: T) {
    this.expr = expr;
  }

  /** Extract the wrapped plain Expr node (terminal). */
  unwrap(): T {
    return this.expr;
  }

  /** Equality comparison; terminal, returns a Cond. */
  eq(value: Value): Cond {
    return equals(this.expr, value);
  }

  /** Inequality comparison; terminal, returns a Cond. */
  neq(value: Value): Cond {
    return notEquals(this.expr, value);
  }

  /** Greater-than comparison; terminal, returns a Cond. */
  gt(value: Value): Cond {
    return greaterThan(this.expr, value);
  }

  /** Greater-than-or-equal comparison; terminal, returns a Cond. */
  gte(value: Value): Cond {
    return greaterOrEqual(this.expr, value);
  }

  /** Less-than comparison; terminal, returns a Cond. */
  lt(value: Value): Cond {
    return lessThan(this.expr, value);
  }

  /** Less-than-or-equal comparison; terminal, returns a Cond. */
  lte(value: Value): Cond {
    return lessOrEqual(this.expr, value);
  }

  /** Test whether the wrapped expression is set; terminal, returns a Cond. */
  isSet(): Cond {
    return isSet(this.expr);
  }

  /** Test whether the wrapped expression contains an item; terminal, returns a Cond. */
  contains(item: Value): Cond {
    return contains(this.expr, item);
  }

  /** Test whether the wrapped expression starts with a prefix; terminal, returns a Cond. */
  startsWith(prefix: Value): Cond {
    return startsWith(this.expr, prefix);
  }

  /** Test whether the wrapped expression ends with a suffix; terminal, returns a Cond. */
  endsWith(suffix: Value): Cond {
    return endsWith(this.expr, suffix);
  }

  /** Add a value; returns a new chain wrapping the plus expression. */
  plus(value: Value): ExprChain<Expr> {
    return new ExprChain(plus(this.expr, value));
  }

  /** Subtract a value; returns a new chain wrapping the minus expression. */
  minus(value: Value): ExprChain<Expr> {
    return new ExprChain(minus(this.expr, value));
  }

  /** Multiply by a value; returns a new chain wrapping the times expression. */
  times(value: Value): ExprChain<Expr> {
    return new ExprChain(times(this.expr, value));
  }

  /** Divide by a value; returns a new chain wrapping the dividedBy expression. */
  dividedBy(value: Value): ExprChain<Expr> {
    return new ExprChain(dividedBy(this.expr, value));
  }

  /** Take the remainder by a value; returns a new chain wrapping the remainder expression. */
  remainder(value: Value): ExprChain<Expr> {
    return new ExprChain(remainder(this.expr, value));
  }

  /** Get the text length; returns a new chain. */
  length(): ExprChain<Expr> {
    return new ExprChain(textLength(this.expr));
  }

  /** Convert to upper case; returns a new chain. */
  upper(): ExprChain<Expr> {
    return new ExprChain(upperCase(this.expr));
  }

  /** Convert to lower case; returns a new chain. */
  lower(): ExprChain<Expr> {
    return new ExprChain(lowerCase(this.expr));
  }

  /** Convert to upper case; returns a new chain. */
  upperCase(): ExprChain<Expr> {
    return new ExprChain(upperCase(this.expr));
  }

  /** Convert to lower case; returns a new chain. */
  lowerCase(): ExprChain<Expr> {
    return new ExprChain(lowerCase(this.expr));
  }

  /** Take a substring from a start to an end value; returns a new chain. */
  substring(from: Value, to: Value): ExprChain<Expr> {
    return new ExprChain(substring(this.expr, toExprValue(from), toExprValue(to)));
  }

  /** Take the first count characters; returns a new chain. */
  first(count: Value): ExprChain<Expr> {
    return new ExprChain(firstChars(this.expr, toExprValue(count)));
  }

  /** Take the last count characters; returns a new chain. */
  last(count: Value): ExprChain<Expr> {
    return new ExprChain(lastChars(this.expr, toExprValue(count)));
  }

  /** Get the character at an index; returns a new chain. */
  charAt(index: Value): ExprChain<Expr> {
    return new ExprChain(charAt(this.expr, toExprValue(index)));
  }

  /** Apply color formatting; returns a new chain. */
  colored(): ExprChain<Expr> {
    return new ExprChain(colored(this.expr));
  }

  /** Apply formatting; returns a new chain. */
  formatted(): ExprChain<Expr> {
    return new ExprChain(formatted(this.expr));
  }

  /** Remove color formatting; returns a new chain. */
  uncolored(): ExprChain<Expr> {
    return new ExprChain(uncolored(this.expr));
  }

  /** Remove formatting; returns a new chain. */
  unformatted(): ExprChain<Expr> {
    return new ExprChain(unformatted(this.expr));
  }

  /** Split text by a delimiter; returns a new chain. */
  split(delimiter: Value, caseSensitive?: boolean): ExprChain<Expr> {
    return new ExprChain(splitText(this.expr, toExprValue(delimiter), caseSensitive));
  }

  /** Round down; returns a new chain. */
  floor(): ExprChain<Expr> {
    return new ExprChain(floor(this.expr));
  }

  /** Round up; returns a new chain. */
  ceil(): ExprChain<Expr> {
    return new ExprChain(ceil(this.expr));
  }

  /** Absolute value; returns a new chain. */
  abs(): ExprChain<Expr> {
    return new ExprChain(abs(this.expr));
  }

  /** Square root; returns a new chain. */
  sqrt(): ExprChain<Expr> {
    return new ExprChain(sqrt(this.expr));
  }

  /** Round to optional places; returns a new chain. */
  round(places?: Value): ExprChain<Expr> {
    return new ExprChain(round(this.expr, places));
  }

  /** Health accessor; returns a new chain. */
  health(): ExprChain<Expr> {
    return new ExprChain(healthOf(this.expr));
  }

  /** Max health accessor; returns a new chain. */
  maxHealth(): ExprChain<Expr> {
    return new ExprChain(maxHealthOf(this.expr));
  }

  /** Food level accessor; returns a new chain. */
  foodLevel(): ExprChain<Expr> {
    return new ExprChain(foodLevelOf(this.expr));
  }

  /** Saturation accessor; returns a new chain. */
  saturation(): ExprChain<Expr> {
    return new ExprChain(saturationOf(this.expr));
  }

  /** Game mode accessor; returns a new chain. */
  gameMode(): ExprChain<Expr> {
    return new ExprChain(gameModeOf(this.expr));
  }

  /** Experience accessor; returns a new chain. */
  experience(): ExprChain<Expr> {
    return new ExprChain(experienceOf(this.expr));
  }

  /** Level accessor; returns a new chain. */
  level(): ExprChain<Expr> {
    return new ExprChain(levelOf(this.expr));
  }

  /** Type accessor; returns a new chain. */
  type(): ExprChain<Expr> {
    return new ExprChain(typeOf(this.expr));
  }

  /** Name accessor; returns a new chain. */
  name(): ExprChain<Expr> {
    return new ExprChain(nameOf(this.expr));
  }

  /** Amount accessor; returns a new chain. */
  amount(): ExprChain<Expr> {
    return new ExprChain(amountOf(this.expr));
  }

  /** Lore accessor; returns a new chain. */
  lore(): ExprChain<Expr> {
    return new ExprChain(loreOf(this.expr));
  }

  /** UUID accessor; returns a new chain. */
  uuid(): ExprChain<Expr> {
    return new ExprChain(uuidOf(this.expr));
  }

  /** Tool accessor; returns a new chain. */
  tool(): ExprChain<Expr> {
    return new ExprChain(toolOf(this.expr));
  }

  /** Location accessor; returns a new chain typed as LocationExpr. */
  location(): ExprChain<LocationExpr> {
    return new ExprChain(locationOf(this.expr) as LocationExpr);
  }

  /** Off-hand tool accessor; returns a new chain. */
  offHandTool(): ExprChain<Expr> {
    return new ExprChain(offHandToolOf(this.expr));
  }

  /** World accessor; returns a new chain. */
  world(): ExprChain<Expr> {
    return new ExprChain(worldOf(this.expr));
  }

  /** X coordinate accessor; returns a new chain. */
  x(): ExprChain<Expr> {
    return new ExprChain(xOf(this.expr));
  }

  /** Y coordinate accessor; returns a new chain. */
  y(): ExprChain<Expr> {
    return new ExprChain(yOf(this.expr));
  }

  /** Z coordinate accessor; returns a new chain. */
  z(): ExprChain<Expr> {
    return new ExprChain(zOf(this.expr));
  }

  /** List size accessor (size of a list-valued expression); returns a new chain. */
  size(): ExprChain<Expr> {
    return new ExprChain(listSize(this.expr));
  }

  /** Join a list-valued expression into one text; returns a new chain. */
  join(delimiter?: Value): ExprChain<Expr> {
    return new ExprChain(
      delimiter === undefined ? joinText(this.expr) : joinText(this.expr, toExprValue(delimiter)),
    );
  }

  /** Minimum of the wrapped value and the given others; returns a new chain. */
  min(...others: Value[]): ExprChain<Expr> {
    return new ExprChain(min(this.expr, ...others));
  }

  /** Maximum of the wrapped value and the given others; returns a new chain. */
  max(...others: Value[]): ExprChain<Expr> {
    return new ExprChain(max(this.expr, ...others));
  }
}

/** Wrap an existing Expr in an ExprChain; no new AST node is created. */
export function x<T extends Expr>(expr: T): ExprChain<T> {
  return new ExprChain(expr);
}

/** Wrap a Value, normalizing string/number/boolean literals via str/num/bool. */
export function xValue(value: Value): ExprChain<Expr> {
  return new ExprChain(toExprValue(value));
}

/**
 * Enter a chain from a player-variable handle's read for one
 * player: xPlayerVar(playerVar("mining_level"), player()).gte(10)
 * is the motivating feedback-E8 flow — the per-player value read
 * straight into a comparison. This is the handle-side entry as a
 * standalone function rather than a new method on the handle
 * itself: the handles live in api.ts, and a method there would
 * make api.ts and this module import each other, while the read
 * result (handle.of(player)) is already exactly the Expr the
 * chain entry takes. The wrapped node's type is preserved, so
 * .expr / .unwrap() stay VariableExpr.
 */
export function xPlayerVar(handle: PlayerVarHandle, player: Expr): ExprChain<VariableExpr> {
  return new ExprChain(handle.of(player));
}

/**
 * Enter a chain from a local-variable handle's read:
 * xLocal(localHandle("total")).plus(1).unwrap() builds the same
 * node as plus(localVar("total"), 1). See xPlayerVar for why the
 * entry is a function over the handle's read, not a handle method.
 */
export function xLocal(handle: LocalVarHandle): ExprChain<LocalVariableExpr> {
  return new ExprChain(handle.get());
}
