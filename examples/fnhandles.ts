import {
  add,
  argument,
  bool,
  broadcast,
  command,
  defineFn,
  equals,
  fmt,
  ifElse,
  levelOf,
  listVar,
  localList,
  localVar,
  loopList,
  loopValue,
  num,
  onJoin,
  param,
  player,
  plus,
  returnValue,
  script,
  send,
  set,
  textLength,
  times,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Typed function handles (feedback E2): defineFn is defineFunction
// plus a handle the type checker can call. Where call(name, ...)
// and callStmt(name, ...) take the function name as a string and
// the arguments as unchecked expressions, a handle knows its
// parameter list: tsc checks the argument count and each
// argument's kind, JS primitives for number / text / boolean
// parameters are normalized to literals, and a plural parameter
// takes a single expression or an array of expressions (flattened
// into the call). A void function's handle is not callable as an
// expression at the type level — only .stmt and .definition.
//
// Functions:
//   mmoXp(who, label) :: number   level * 2 + the label's length
//   announceXp(who, amount, loud) void; broadcasts or whispers
//   totalXp(amounts: numbers) :: number   sum of a plural parameter
//
// script() accepts the handles directly (it unwraps .definition).
export const mmoXp = defineFn("mmoXp", [param("who", "player"), param("label", "text")], "number", [
  returnValue(plus(times(levelOf(localVar("who")), num(2)), textLength(localVar("label")))),
]);

export const announceXp = defineFn(
  "announceXp",
  [param("who", "player"), param("amount", "number"), param("loud", "boolean")],
  null,
  [
    ifElse(
      equals(localVar("loud"), bool(true)),
      [broadcast(fmt("xp +", localVar("amount")))],
      [send(localVar("who"), fmt("xp +", localVar("amount")))],
    ),
  ],
);

export const totalXp = defineFn("totalXp", [param("amounts", "numbers")], "number", [
  set(localVar("total"), num(0)),
  loopList(localList("amounts"), [add(localVar("total"), loopValue())]),
  returnValue(localVar("total")),
]);

export const fnHandlesScript: Script = script(
  mmoXp,
  announceXp,
  totalXp,
  onJoin([
    // A text literal fills the text parameter; the handle call is
    // an expression, so it composes with set / fmt like call().
    set(variable("xp"), mmoXp(player(), "join bonus")),
    // A non-void handle also has the statement form (.stmt), and
    // number / boolean literals fill their parameters directly.
    announceXp.stmt(player(), 25, true),
    mmoXp.stmt(player(), "stmt call"),
  ]),
  command("xp", "text", [
    set(variable("xp"), mmoXp(player(), argument(1))),
    send(player(), fmt("xp=", variable("xp"))),
    announceXp.stmt(player(), variable("xp"), false),
  ]),
  command("totalxp", null, [
    // A plural parameter takes an array of expressions, flattened
    // into the call (totalXp(1, 2, 3) in the emitted .sk) ...
    send(player(), fmt("total=", totalXp([num(1), num(2), num(3)]))),
    // ... or a single list expression, passed through as-is.
    set(variable("t"), totalXp(listVar("bonus"))),
    send(player(), fmt("bonus=", variable("t"))),
  ]),
);

// Compile-time negative checks for the handle types. This function
// is never called and is not part of fnHandlesScript, so the calls
// below emit nothing into any script; `pnpm typecheck` (which
// compiles the examples) is what verifies them — each suppression
// directive below fails the typecheck if the call it sits on ever
// becomes valid TypeScript.
function fnHandleTypeChecks(): void {
  // @ts-expect-error wrong arity: mmoXp takes a player and a text
  mmoXp(player());
  // @ts-expect-error a text literal cannot fill a player parameter
  mmoXp("Steve", "join bonus");
  // @ts-expect-error a number parameter rejects a text literal
  announceXp.stmt(player(), "25", true);
  // @ts-expect-error a void handle is not callable as an expression
  announceXp(player(), 25, true);
  // @ts-expect-error a plural parameter rejects a bare number
  totalXp(5);
}
void fnHandleTypeChecks;
