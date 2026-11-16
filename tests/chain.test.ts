import { describe, expect, it } from "vitest";
import {
  abs,
  amountOf,
  bool,
  broadcast,
  ceil,
  charAt,
  chatMessage,
  colored,
  contains,
  dividedBy,
  emit,
  endsWith,
  equals,
  experienceOf,
  firstChars,
  floor,
  fmt,
  foodLevelOf,
  formatted,
  gameModeOf,
  greaterOrEqual,
  greaterThan,
  healthOf,
  ifElse,
  isSet,
  joinText,
  lastChars,
  levelOf,
  lessOrEqual,
  lessThan,
  listSize,
  listVar,
  localHandle,
  localVar,
  locationOf,
  loreOf,
  lowerCase,
  max,
  maxHealthOf,
  min,
  minus,
  nameOf,
  notEquals,
  num,
  offHandToolOf,
  onJoin,
  player,
  playerVar,
  plus,
  remainder,
  round,
  saturationOf,
  script,
  send,
  set,
  splitText,
  sqrt,
  startsWith,
  str,
  substring,
  textLength,
  times,
  toolOf,
  toIr,
  typeOf,
  uncolored,
  unformatted,
  upperCase,
  uuidOf,
  variable,
  worldOf,
  x,
  xLocal,
  xOf,
  xPlayerVar,
  xValue,
  yOf,
  zOf,
} from "../src/index.js";
import type { Expr, LocationExpr, PlayerExpr } from "../src/index.js";
import { chainFunctionalScript, chainScript } from "../examples/chain.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

/** Emit a one-statement script around a statement built either way. */
function emitStmt(stmt: Parameters<typeof onJoin>[0][number]): string {
  return emit(script(onJoin([stmt])));
}

describe("method chains (feedback E8): entry and terminal", () => {
  it("x() wraps without copying: unwrap() / .expr return the same node", () => {
    const node = variable("v");
    expect(x(node).unwrap()).toBe(node);
    expect(x(node).expr).toBe(node);
  });

  it("the wrapper is not an Expr node (AST nodes stay plain objects)", () => {
    const wrapped = x(num(1)) as unknown as Record<string, unknown>;
    expect("kind" in wrapped).toBe(false);
    expect(wrapped.kind).toBeUndefined();
  });

  it("xValue normalizes JS literals exactly like the builders do", () => {
    expect(xValue(5).unwrap()).toEqual(num(5));
    expect(xValue("hi").unwrap()).toEqual(str("hi"));
    expect(xValue(true).unwrap()).toEqual(bool(true));
    expect(xValue(variable("v")).unwrap()).toEqual(variable("v"));
    expect(xValue(5).plus(1).unwrap()).toEqual(plus(num(5), num(1)));
  });

  it("branded expressions keep their brand through x() and location()", () => {
    const playerChain = x(player());
    const unwrapped: PlayerExpr = playerChain.unwrap();
    expect(unwrapped).toEqual(player());
    const loc: LocationExpr = x(player()).location().unwrap();
    expect(loc).toEqual(locationOf(player()));
    // A transforming method returns a plain Expr chain, not the brand.
    expect(x(player()).health().unwrap()).toEqual(healthOf(player()));
  });
});

describe("method chains (feedback E8): comparisons return the builder's Cond", () => {
  const v = variable("mining");
  it("eq / neq / gt / gte / lt / lte build the identical Cond nodes", () => {
    expect(x(v).eq(10)).toEqual(equals(v, 10));
    expect(x(v).neq(10)).toEqual(notEquals(v, 10));
    expect(x(v).gt(10)).toEqual(greaterThan(v, 10));
    expect(x(v).gte(10)).toEqual(greaterOrEqual(v, 10));
    expect(x(v).lt(10)).toEqual(lessThan(v, 10));
    expect(x(v).lte(10)).toEqual(lessOrEqual(v, 10));
    // An expression operand passes through unchanged, like the builders.
    expect(x(v).gte(variable("goal"))).toEqual(greaterOrEqual(v, variable("goal")));
  });

  it("isSet / contains / startsWith / endsWith build the identical Cond nodes", () => {
    expect(x(v).isSet()).toEqual(isSet(v));
    expect(x(chatMessage()).contains("ell")).toEqual(contains(chatMessage(), "ell"));
    expect(x(chatMessage()).startsWith("!")).toEqual(startsWith(chatMessage(), "!"));
    expect(x(chatMessage()).endsWith("?")).toEqual(endsWith(chatMessage(), "?"));
  });

  it("a chained condition emits byte-identically inside ifElse", () => {
    const chained = emitStmt(ifElse(x(v).gte(10), [broadcast(str("y"))], [broadcast(str("n"))]));
    const functional = emitStmt(
      ifElse(greaterOrEqual(v, num(10)), [broadcast(str("y"))], [broadcast(str("n"))]),
    );
    expect(chained).toBe(functional);
    expect(chained).toBe(
      'on join:\n    if {mining} is greater than or equal to 10:\n        broadcast "y"\n    else:\n        broadcast "n"\n',
    );
  });
});

describe("method chains (feedback E8): arithmetic composes left-to-right", () => {
  it("plus / minus / times / dividedBy / remainder delegate to the builders", () => {
    const v = variable("n");
    expect(x(v).plus(1).unwrap()).toEqual(plus(v, 1));
    expect(x(v).minus(1).unwrap()).toEqual(minus(v, 1));
    expect(x(v).times(2).unwrap()).toEqual(times(v, 2));
    expect(x(v).dividedBy(2).unwrap()).toEqual(dividedBy(v, 2));
    expect(x(v).remainder(3).unwrap()).toEqual(remainder(v, 3));
  });

  it("composition nests exactly like the functional form", () => {
    const v = variable("n");
    expect(x(v).plus(1).times(2).minus(3).unwrap()).toEqual(minus(times(plus(v, 1), 2), 3));
  });
});

describe("method chains (feedback E8): text methods", () => {
  const m = chatMessage();
  it("length / case / substring / first / last / charAt delegate", () => {
    expect(x(m).length().unwrap()).toEqual(textLength(m));
    expect(x(m).upper().unwrap()).toEqual(upperCase(m));
    expect(x(m).upperCase().unwrap()).toEqual(upperCase(m));
    expect(x(m).lower().unwrap()).toEqual(lowerCase(m));
    expect(x(m).lowerCase().unwrap()).toEqual(lowerCase(m));
    expect(x(m).substring(2, 5).unwrap()).toEqual(substring(m, num(2), num(5)));
    expect(x(m).first(3).unwrap()).toEqual(firstChars(m, num(3)));
    expect(x(m).last(3).unwrap()).toEqual(lastChars(m, num(3)));
    expect(x(m).charAt(1).unwrap()).toEqual(charAt(m, num(1)));
  });

  it("color / format / split / join delegate", () => {
    expect(x(m).colored().unwrap()).toEqual(colored(m));
    expect(x(m).formatted().unwrap()).toEqual(formatted(m));
    expect(x(m).uncolored().unwrap()).toEqual(uncolored(m));
    expect(x(m).unformatted().unwrap()).toEqual(unformatted(m));
    expect(x(m).split(",").unwrap()).toEqual(splitText(m, str(",")));
    expect(x(m).split(",", true).unwrap()).toEqual(splitText(m, str(","), true));
    const list = listVar("l");
    expect(x(list).join(", ").unwrap()).toEqual(joinText(list, str(", ")));
    expect(x(list).join().unwrap()).toEqual(joinText(list));
    expect(x(list).size().unwrap()).toEqual(listSize(list));
  });

  it("text transforms keep chaining into comparisons", () => {
    expect(x(m).upper().length().gt(3)).toEqual(greaterThan(textLength(upperCase(m)), 3));
  });
});

describe("method chains (feedback E8): math methods", () => {
  const v = variable("n");
  it("floor / ceil / abs / sqrt / round delegate", () => {
    expect(x(v).floor().unwrap()).toEqual(floor(v));
    expect(x(v).ceil().unwrap()).toEqual(ceil(v));
    expect(x(v).abs().unwrap()).toEqual(abs(v));
    expect(x(v).sqrt().unwrap()).toEqual(sqrt(v));
    expect(x(v).round().unwrap()).toEqual(round(v));
    expect(x(v).round(2).unwrap()).toEqual(round(v, 2));
  });

  it("min / max keep the wrapped value as the first candidate", () => {
    expect(x(v).min(0, 100).unwrap()).toEqual(min(v, 0, 100));
    expect(x(v).max(0).unwrap()).toEqual(max(v, 0));
    expect(x(v).min().unwrap()).toEqual(min(v));
  });
});

describe("method chains (feedback E8): state and value accessors (U2)", () => {
  const p = player();
  it("player / entity state reads delegate", () => {
    expect(x(p).health().unwrap()).toEqual(healthOf(p));
    expect(x(p).maxHealth().unwrap()).toEqual(maxHealthOf(p));
    expect(x(p).foodLevel().unwrap()).toEqual(foodLevelOf(p));
    expect(x(p).saturation().unwrap()).toEqual(saturationOf(p));
    expect(x(p).gameMode().unwrap()).toEqual(gameModeOf(p));
    expect(x(p).experience().unwrap()).toEqual(experienceOf(p));
    expect(x(p).level().unwrap()).toEqual(levelOf(p));
  });

  it("generic reads delegate: type / name / amount / lore / uuid / tools / world / coords", () => {
    expect(x(p).type().unwrap()).toEqual(typeOf(p));
    expect(x(p).name().unwrap()).toEqual(nameOf(p));
    expect(x(p).amount().unwrap()).toEqual(amountOf(p));
    expect(x(p).lore().unwrap()).toEqual(loreOf(p));
    expect(x(p).uuid().unwrap()).toEqual(uuidOf(p));
    expect(x(p).tool().unwrap()).toEqual(toolOf(p));
    expect(x(p).offHandTool().unwrap()).toEqual(offHandToolOf(p));
    expect(x(p).world().unwrap()).toEqual(worldOf(p));
    const loc = locationOf(p);
    expect(x(loc).x().unwrap()).toEqual(xOf(loc));
    expect(x(loc).y().unwrap()).toEqual(yOf(loc));
    expect(x(loc).z().unwrap()).toEqual(zOf(loc));
  });

  it("read -> compare flows emit identically to the functional form", () => {
    const chained = emitStmt(ifElse(x(p).health().lt(5), [broadcast(str("low"))]));
    const functional = emitStmt(ifElse(lessThan(healthOf(p), num(5)), [broadcast(str("low"))]));
    expect(chained).toBe(functional);
    expect(chained).toBe(
      'on join:\n    if health of player is less than 5:\n        broadcast "low"\n',
    );
  });
});

describe("method chains (feedback E8): variable-handle entries (U2)", () => {
  it("xPlayerVar is the motivating flow: a per-player read straight into a comparison", () => {
    const miningLevel = playerVar("mining_level");
    expect(xPlayerVar(miningLevel, player()).gte(10)).toEqual(
      greaterOrEqual(variable("mining_level", player()), 10),
    );
    expect(xPlayerVar(miningLevel, player()).unwrap()).toEqual(miningLevel.of(player()));
    const chained = emitStmt(
      ifElse(xPlayerVar(miningLevel, player()).gte(10), [broadcast(str("rank up"))]),
    );
    expect(chained).toBe(
      'on join:\n    if {mining_level::%player%} is greater than or equal to 10:\n        broadcast "rank up"\n',
    );
  });

  it("xLocal enters from a local handle's read", () => {
    const total = localHandle("total");
    expect(xLocal(total).unwrap()).toEqual(localVar("total"));
    expect(xLocal(total).plus(1).unwrap()).toEqual(plus(localVar("total"), 1));
  });
});

describe("method chains (feedback E8): whole programs are identical", () => {
  it("the chain sample matches the golden fixture", () => {
    expect(emit(chainScript)).toBe(fixture("chain.sk"));
  });

  it("the chain sample and its functional twin emit identical .sk and IR", () => {
    expect(emit(chainScript)).toBe(emit(chainFunctionalScript));
    expect(toIr(chainScript)).toEqual(toIr(chainFunctionalScript));
    expect(JSON.stringify(toIr(chainScript))).toBe(JSON.stringify(toIr(chainFunctionalScript)));
  });

  it("a mixed chain program emits identically to its functional twin", () => {
    const chained = script(
      onJoin([
        set(variable("bonus"), x(levelOf(player())).times(10).plus(5).unwrap()),
        send(player(), fmt("hp=", x(player()).health().unwrap())),
        ifElse(x(player()).health().gte(10), [broadcast(str("healthy"))]),
      ]),
    );
    const functional = script(
      onJoin([
        set(variable("bonus"), plus(times(levelOf(player()), num(10)), num(5))),
        send(player(), fmt("hp=", healthOf(player()))),
        ifElse(greaterOrEqual(healthOf(player()), num(10)), [broadcast(str("healthy"))]),
      ]),
    );
    expect(emit(chained)).toBe(emit(functional));
    expect(toIr(chained)).toEqual(toIr(functional));
  });
});

// Compile-time guard, never invoked: a chain is not an Expr, so it
// cannot be dropped into an Expr position without unwrap().
// (Checked by `pnpm typecheck`; vitest only needs the file to load.)
function _chainIsNotAnExpr(): void {
  const asValue: Expr = x(num(1)).unwrap();
  void asValue;
  // @ts-expect-error an ExprChain must be unwrapped before use as an Expr
  const bad: Expr = x(num(1));
  void bad;
}
void _chainIsNotAnExpr;
