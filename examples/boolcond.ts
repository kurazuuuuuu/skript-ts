import {
  add,
  and,
  bool,
  call,
  command,
  defineFunction,
  fmt,
  greaterOrEqual,
  ifElse,
  localVar,
  not,
  num,
  or,
  param,
  player,
  returnValue,
  script,
  send,
  set,
  stopIf,
  str,
  unless,
  when,
  whileLoop,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Boolean conditions (feedback E3 + E4): a boolean expression is
// accepted wherever a condition is expected and lowers to
// `is true` at the API level — a bare boolean is NOT a valid
// Skript condition (probed against the real Skript 2.17.1), but
// the comparison form parses and behaves correctly for function
// calls, variables and while heads. Entirely core constructs, so
// it runs under both runtimes.
//
//   echoBool(b: boolean) :: boolean   returns its argument
//
//   /boolcond   -> exercises, in order:
//                    a boolean variable directly as an ifElse
//                    condition ("var-true"), a boolean-returning
//                    function call directly as a condition
//                    ("fn-true"), a boolean variable as a
//                    whileLoop head (loops 3 times), and/or/not
//                    over boolean expressions, and the when /
//                    unless sugar. Lines that would read
//                    "should-not-appear" are never sent.
//   /boolstop   -> "before-stop", then stopIf(true variable)
//                    ends the trigger: "after-stop" is never sent
//   /boolnostop -> stopIf(false variable) does not stop:
//                    "survived-stop" is sent
export const boolcondScript: Script = script(
  defineFunction("echoBool", [param("b", "boolean")], "boolean", [returnValue(localVar("b"))]),
  command("boolcond", null, [
    set(localVar("t"), bool(true)),
    set(localVar("f"), bool(false)),
    // A boolean variable directly as the condition.
    ifElse(
      localVar("t"),
      [send(player(), str("boolcond: var-true"))],
      [send(player(), str("boolcond: var-false"))],
    ),
    // A boolean-returning function call directly as the condition.
    ifElse(
      call("echoBool", bool(true)),
      [send(player(), str("boolcond: fn-true"))],
      [send(player(), str("boolcond: fn-false"))],
    ),
    ifElse(call("echoBool", bool(false)), [
      send(player(), str("boolcond: fn-false-should-not-appear")),
    ]),
    // A boolean variable as a whileLoop head.
    set(localVar("go"), bool(true)),
    set(localVar("n"), num(0)),
    whileLoop(localVar("go"), [
      add(localVar("n"), num(1)),
      ifElse(greaterOrEqual(localVar("n"), num(3)), [set(localVar("go"), bool(false))]),
    ]),
    send(player(), fmt("boolcond: looped=", localVar("n"))),
    // and / or / not over boolean expressions.
    ifElse(and(localVar("t"), call("echoBool", bool(true))), [
      send(player(), str("boolcond: and-true")),
    ]),
    ifElse(or(localVar("f"), localVar("t")), [send(player(), str("boolcond: or-true"))]),
    ifElse(not(localVar("f")), [send(player(), str("boolcond: not-false"))]),
    // when / unless sugar.
    when(localVar("t"), send(player(), str("boolcond: when-true"))),
    when(localVar("f"), send(player(), str("boolcond: when-false-should-not-appear"))),
    unless(localVar("f"), send(player(), str("boolcond: unless-false"))),
    unless(localVar("t"), send(player(), str("boolcond: unless-true-should-not-appear"))),
    send(player(), str("boolcond: done")),
  ]),
  command("boolstop", null, [
    set(localVar("t"), bool(true)),
    send(player(), str("boolcond: before-stop")),
    stopIf(localVar("t")),
    send(player(), str("boolcond: after-stop-should-not-appear")),
  ]),
  command("boolnostop", null, [
    set(localVar("f"), bool(false)),
    stopIf(localVar("f")),
    send(player(), str("boolcond: survived-stop")),
  ]),
);
