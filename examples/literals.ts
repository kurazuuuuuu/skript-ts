import {
  abs,
  add,
  arith,
  broadcast,
  call,
  callStmt,
  ceil,
  command,
  contains,
  defineFunction,
  dividedBy,
  endsWith,
  equals,
  floor,
  fmt,
  greaterOrEqual,
  greaterThan,
  ifElse,
  lessOrEqual,
  lessThan,
  listAdd,
  listRemove,
  listVar,
  localVar,
  max,
  min,
  minus,
  notEquals,
  onDamage,
  param,
  player,
  plus,
  randomInteger,
  randomNumber,
  remainder,
  remove,
  returnValue,
  round,
  script,
  send,
  set,
  setDamage,
  sqrt,
  startsWith,
  times,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (feedback E1): plain JavaScript literals
// in value positions. Every literal below — a string, a number
// or a boolean written directly — is normalized by the builder
// to the same AST node as str() / num() / bool(), so the
// emitted .sk is byte-identical to the explicitly wrapped form.
// Entirely core constructs, so it runs under both runtimes.
//
//   /litcalc <number>  arithmetic, math functions and random
//                      draws with literal operands and bounds
//   /litstate          set / add / remove and list add / remove
//                      with literal values; comparisons against
//                      literal texts, numbers and booleans;
//                      contains / startsWith / endsWith with
//                      literal parts; bare string messages
//   /litcall           function calls (expression and statement)
//                      with literal arguments, plus defaults
//                      declared with literal default values
//   on damage          the damage amount is set to a literal
export const literalsScript: Script = script(
  defineFunction(
    "litGreet",
    [param("name", "text", "world"), param("times", "number", 1)],
    "text",
    [returnValue(fmt("hello ", localVar("name")))],
  ),
  defineFunction("litAnswer", [], "number", [returnValue(42)]),
  defineFunction("litFlag", [param("flag", "boolean", true)], "boolean", [
    returnValue(localVar("flag")),
  ]),
  command("litcalc", "number", [
    set(localVar("x"), plus(variable("n"), 1)),
    set(localVar("y"), minus(localVar("x"), 2)),
    set(localVar("z"), times(localVar("y"), 3)),
    set(localVar("w"), dividedBy(localVar("z"), 4)),
    set(localVar("r"), remainder(localVar("w"), 5)),
    set(localVar("a"), arith("+", localVar("r"), 10)),
    send(
      player(),
      fmt(
        "calc: floor=",
        floor(9.7),
        ", ceil=",
        ceil(localVar("a")),
        ", round=",
        round(localVar("a"), 2),
        ", abs=",
        abs(-3),
        ", sqrt=",
        sqrt(2),
        ", min=",
        min(localVar("a"), 3, 10),
        ", max=",
        max(localVar("a"), 3, 10),
        ", die=",
        randomInteger(1, 6),
        ", span=",
        randomNumber(1, 2),
      ),
    ),
  ]),
  command("litstate", null, [
    set(variable("greeting"), "hello"),
    set(variable("count"), 42),
    set(variable("enabled"), true),
    add(variable("count"), 5),
    remove(variable("count"), 2),
    listAdd(listVar("groceries"), "milk"),
    listAdd(listVar("groceries"), 7),
    listRemove(listVar("groceries"), "milk"),
    ifElse(equals(variable("enabled"), true), [broadcast("enabled")]),
    ifElse(notEquals(variable("greeting"), "bye"), [broadcast("not bye")]),
    ifElse(greaterThan(variable("count"), 10), [broadcast("big")]),
    ifElse(greaterOrEqual(variable("count"), 45), [broadcast("at least 45")]),
    ifElse(lessThan(variable("count"), 100), [broadcast("small")]),
    ifElse(lessOrEqual(variable("count"), 45), [broadcast("at most 45")]),
    ifElse(contains(variable("greeting"), "ell"), [broadcast("has ell")]),
    ifElse(startsWith(variable("greeting"), "he"), [broadcast("starts he")]),
    ifElse(endsWith(variable("greeting"), "lo"), [broadcast("ends lo")]),
    send(player(), "done"),
  ]),
  command("litcall", null, [
    send(player(), fmt("greet=", call("litGreet", "skript", 2))),
    send(player(), fmt("answer=", call("litAnswer"))),
    callStmt("litGreet", "again", 1),
    set(variable("flag"), call("litFlag", false)),
  ]),
  onDamage([setDamage(2.5)]),
);
