import {
  call,
  command,
  defineFunction,
  deleteVar,
  equals,
  ifElse,
  isSet,
  localVar,
  not,
  num,
  param,
  player,
  returnValue,
  script,
  send,
  set,
  str,
  variable,
  whileLoop,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Presence condition (feedback T3 / C4): isSet(target) —
// `<expr> is set`, with the native negated form `<expr> is not
// set` for not(...) and whileLoop heads. Probed against the
// real Skript 2.17.1: both forms work for local variables,
// global variables, and function-call results (a function that
// returns nothing is "not set"; one that returns a value is
// "set"). Presence is not content: a variable holding an empty
// text "" IS set. Entirely core constructs, so it runs under
// both runtimes — the emitted .sk under Skript and the IR under
// the engine jar.
//
//   /isset   one pass over every case, in order:
//            an unset local, that local set to "" (still set),
//            a global before it is set, after it is set, and
//            after it is deleted (plus the native negated form),
//            the maybe() function for "yes" (returns a value)
//            and for "no" (returns nothing), and a whileLoop
//            headed by isSet that runs once and deletes its own
//            guard, leaving the guard unset.
export const issetScript: Script = script(
  defineFunction("maybe", [param("input", "text")], "text", [
    ifElse(equals(localVar("input"), str("yes")), [returnValue(str("found"))]),
  ]),
  command("isset", null, [
    ifElse(
      isSet(localVar("probe")),
      [send(player(), str("isset: local=set"))],
      [send(player(), str("isset: local=unset"))],
    ),
    set(localVar("probe"), str("")),
    ifElse(
      isSet(localVar("probe")),
      [send(player(), str("isset: empty=set"))],
      [send(player(), str("isset: empty=unset"))],
    ),
    deleteVar(variable("issetglobal")),
    ifElse(
      isSet(variable("issetglobal")),
      [send(player(), str("isset: global=set"))],
      [send(player(), str("isset: global=unset"))],
    ),
    set(variable("issetglobal"), num(42)),
    ifElse(
      isSet(variable("issetglobal")),
      [send(player(), str("isset: global-after-set=set"))],
      [send(player(), str("isset: global-after-set=unset"))],
    ),
    deleteVar(variable("issetglobal")),
    ifElse(
      isSet(variable("issetglobal")),
      [send(player(), str("isset: global-after-delete=set"))],
      [send(player(), str("isset: global-after-delete=unset"))],
    ),
    ifElse(not(isSet(variable("issetglobal"))), [send(player(), str("isset: global-not-set=T"))]),
    ifElse(
      isSet(call("maybe", str("yes"))),
      [send(player(), str("isset: maybe-yes=set"))],
      [send(player(), str("isset: maybe-yes=unset"))],
    ),
    ifElse(
      isSet(call("maybe", str("no"))),
      [send(player(), str("isset: maybe-no=set"))],
      [send(player(), str("isset: maybe-no=unset"))],
    ),
    ifElse(not(isSet(call("maybe", str("no")))), [
      send(player(), str("isset: maybe-no-not-set=T")),
    ]),
    set(localVar("guard"), num(1)),
    whileLoop(isSet(localVar("guard")), [
      send(player(), str("isset: while=ran")),
      deleteVar(localVar("guard")),
    ]),
    ifElse(
      isSet(localVar("guard")),
      [send(player(), str("isset: guard=set"))],
      [send(player(), str("isset: guard=unset"))],
    ),
  ]),
);
