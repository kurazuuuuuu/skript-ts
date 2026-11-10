import {
  add,
  argument,
  broadcast,
  call,
  callStmt,
  command,
  defineFunction,
  fmt,
  ifElse,
  lessOrEqual,
  lessThan,
  listAdd,
  localList,
  localVar,
  loopList,
  loopTimes,
  loopValue,
  minus,
  notEquals,
  num,
  onJoin,
  param,
  player,
  returnValue,
  script,
  send,
  set,
  stopTrigger,
  str,
  times,
  variable,
  wait,
  whileLoop,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 13): custom functions. Entirely
// core constructs, so it runs under both runtimes — the emitted
// .sk under Skript and the IR under the engine jar.
//
// Functions:
//   greet(name)            "Hello, <name>!"
//   greetTimes(name, n=1)  the name repeated n times (default 1)
//   fact(n)                recursive factorial
//   doubleIt(n)            n * 2 (used for the type-mismatch demo)
//   sumAll(ns: numbers)    sum of a plural parameter
//   makeRange(n) :: objects  the list 1..n, built in a local list
//   announce(flag)         void; broadcasts "announced" only for
//                          flag 1, exiting via stop otherwise
//   scopeProbe()           void; shows the fresh-frame locals
//   slowFn()               waits 1 second, then returns — the
//                          caller never sees the value (the call
//                          detaches at the wait, per Skript)
//   ov(number) / ov(text)  overloads, dispatched by argument type
//
// Commands:
//   /greet <text>   /greetlit   /greet2 <text>   /greet3 <text>
//   /fact <int>     /double <int>   /badcall (runtime type mismatch)
//   /sumto <int>    /sum3       /scope <text>
//   /announce <int> /slow       /ov <int>   /ovt <text>
export const functionsScript: Script = script(
  onJoin([
    // A text value in a global, for the /badcall mismatch demo:
    // passing it to a number parameter leaves the parameter unset.
    set(variable("mismatch"), str("abc")),
  ]),
  defineFunction("greet", [param("name", "text")], "text", [
    returnValue(fmt("Hello, ", localVar("name"), "!")),
  ]),
  defineFunction("greetTimes", [param("name", "text"), param("times", "number", num(1))], "text", [
    set(localVar("out"), str("")),
    set(localVar("i"), num(0)),
    whileLoop(lessThan(localVar("i"), localVar("times")), [
      set(localVar("out"), fmt(localVar("out"), localVar("name"))),
      add(localVar("i"), num(1)),
    ]),
    returnValue(localVar("out")),
  ]),
  defineFunction("fact", [param("n", "number")], "number", [
    ifElse(lessOrEqual(localVar("n"), num(1)), [returnValue(num(1))]),
    returnValue(times(localVar("n"), call("fact", minus(localVar("n"), num(1))))),
  ]),
  defineFunction("doubleIt", [param("n", "number")], "number", [
    returnValue(times(localVar("n"), num(2))),
  ]),
  defineFunction("sumAll", [param("ns", "numbers")], "number", [
    set(localVar("total"), num(0)),
    loopList(localList("ns"), [add(localVar("total"), loopValue())]),
    returnValue(localVar("total")),
  ]),
  defineFunction("makeRange", [param("n", "number")], "objects", [
    loopTimes(localVar("n"), [listAdd(localList("r"), loopValue())]),
    returnValue(localList("r")),
  ]),
  defineFunction("announce", [param("flag", "number")], null, [
    ifElse(notEquals(localVar("flag"), num(1)), [stopTrigger()]),
    broadcast(str("announced")),
  ]),
  defineFunction("scopeProbe", [], null, [
    broadcast(fmt("fn sees v=[", localVar("v"), "]")),
    set(localVar("v"), str("function")),
  ]),
  defineFunction("slowFn", [], "text", [
    // The wait detaches the call: /slow reads no value, and the
    // tail broadcast happens a second later, on its own. (A
    // `return` after a wait is a load ERROR under Skript — "A
    // return statement after a delay is useless..." — so this
    // function deliberately ends without one; falling off the
    // end of a value function yields no value anyway.)
    wait(num(1), "seconds"),
    broadcast(str("slow tail")),
  ]),
  defineFunction("ov", [param("a", "number")], "text", [
    returnValue(fmt("num:", localVar("a"))),
  ]),
  defineFunction("ov", [param("a", "text")], "text", [
    returnValue(fmt("text:", localVar("a"))),
  ]),
  command("greet", "text", [
    send(player(), call("greet", argument(1))),
  ]),
  command("greetlit", null, [
    send(player(), fmt("lit=", call("greet", str("World")))),
  ]),
  command("greet2", "text", [
    send(player(), fmt("greet2=", call("greetTimes", argument(1)))),
  ]),
  command("greet3", "text", [
    send(player(), fmt("greet3=", call("greetTimes", argument(1), num(3)))),
  ]),
  command("fact", "integer", [
    send(player(), fmt("fact=", call("fact", argument(1)))),
  ]),
  command("double", "integer", [
    send(player(), fmt("double=", call("doubleIt", argument(1)))),
  ]),
  command("badcall", null, [
    set(localVar("r"), call("doubleIt", variable("mismatch"))),
    send(player(), fmt("badcall=[", localVar("r"), "]")),
  ]),
  command("sumto", "integer", [
    set(localList("r"), call("makeRange", argument(1))),
    set(localVar("s"), call("sumAll", localList("r"))),
    send(player(), fmt("sumto=", localVar("s"))),
  ]),
  command("sum3", null, [
    send(player(), fmt("sum3=", call("sumAll", num(1), num(2), num(3)))),
  ]),
  command("scope", "text", [
    set(localVar("v"), argument(1)),
    callStmt("scopeProbe"),
    send(player(), fmt("mine=[", localVar("v"), "]")),
  ]),
  command("announce", "integer", [
    callStmt("announce", argument(1)),
    send(player(), str("announce-done")),
  ]),
  command("slow", null, [
    set(localVar("r"), call("slowFn")),
    send(player(), fmt("slow=[", localVar("r"), "]")),
  ]),
  command("ov", "integer", [
    send(player(), fmt("ov=", call("ov", argument(1)))),
  ]),
  command("ovt", "text", [
    send(player(), fmt("ov=", call("ov", argument(1)))),
  ]),
);
