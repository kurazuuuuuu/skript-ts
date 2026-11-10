import {
  add,
  argument,
  command,
  deleteVar,
  equals,
  fmt,
  ifElse,
  lessThan,
  listAdd,
  listRemove,
  listSize,
  listVar,
  loopIndex,
  loopList,
  loopRange,
  loopTimes,
  loopValue,
  num,
  onJoin,
  player,
  script,
  send,
  set,
  str,
  variable,
  wait,
  whileLoop,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 12): list variables, the extended
// loops, while, and wait. Entirely core constructs, so it runs
// under both runtimes — the emitted .sk under Skript and the IR
// under the engine jar.
//
//   /listadd <text>    append to {groceries::*} and read the size back
//   /listshow          "item <index>: <value>" per entry, in
//                      iteration order, or "list is empty"
//   /listall           the whole list as text ("a, b and c")
//   /listremove <text> remove the first matching entry
//   /listdel <integer> delete one entry by index (leaves a hole)
//   /listclear         delete the whole list
//   /tagshow, /tagadd  the same over {labels::*}, which starts with
//                      a text index ("color") set on join: text
//                      indices iterate before numeric ones
//   /countup <int>     sum 1..n with a times loop
//   /rangesum <int>    sum 1..n with a range loop
//   /whilesum <int>    sum 1..n with a while loop
//   /delayed           "start", a 2-second wait, then "done"
//   /delayloop         two 1-second waits inside a times loop,
//                      sending "tick 1" and "tick 2"
export const listsScript: Script = script(
  onJoin([
    set(variable("labels", str("color")), str("red")),
  ]),
  command("listadd", "text", [
    listAdd(listVar("groceries"), argument(1)),
    send(player(), fmt("added ", argument(1), "; size=", listSize(listVar("groceries")))),
  ]),
  command("listshow", null, [
    ifElse(
      equals(listSize(listVar("groceries")), num(0)),
      [send(player(), str("list is empty"))],
      [
        loopList(listVar("groceries"), [
          send(player(), fmt("item ", loopIndex(), ": ", loopValue())),
        ]),
      ],
    ),
  ]),
  command("listall", null, [
    send(player(), fmt("all: ", listVar("groceries"))),
  ]),
  command("listremove", "text", [
    listRemove(listVar("groceries"), argument(1)),
    send(player(), fmt("removed ", argument(1), "; size=", listSize(listVar("groceries")))),
  ]),
  command("listdel", "integer", [
    deleteVar(variable("groceries", argument(1))),
    send(player(), fmt("size=", listSize(listVar("groceries")))),
  ]),
  command("listclear", null, [
    deleteVar(listVar("groceries")),
    send(player(), str("cleared")),
  ]),
  command("tagshow", null, [
    loopList(listVar("labels"), [
      send(player(), fmt("tag ", loopIndex(), ": ", loopValue())),
    ]),
  ]),
  command("tagadd", null, [
    listAdd(listVar("labels"), str("misc")),
    send(player(), fmt("tag added; size=", listSize(listVar("labels")))),
  ]),
  command("countup", "integer", [
    set(variable("total"), num(0)),
    loopTimes(argument(1), [add(variable("total"), loopValue())]),
    send(player(), fmt("sum=", variable("total"))),
  ]),
  command("rangesum", "integer", [
    set(variable("total"), num(0)),
    loopRange(num(1), argument(1), [add(variable("total"), loopValue())]),
    send(player(), fmt("rangesum=", variable("total"))),
  ]),
  command("whilesum", "integer", [
    set(variable("n"), num(0)),
    set(variable("total"), num(0)),
    whileLoop(lessThan(variable("n"), argument(1)), [
      add(variable("n"), num(1)),
      add(variable("total"), variable("n")),
    ]),
    send(player(), fmt("whilesum=", variable("total"))),
  ]),
  command("delayed", null, [
    send(player(), str("start")),
    wait(num(2), "seconds"),
    send(player(), str("done")),
  ]),
  command("delayloop", null, [
    loopTimes(num(2), [
      wait(num(1), "seconds"),
      send(player(), fmt("tick ", loopValue())),
    ]),
  ]),
);
