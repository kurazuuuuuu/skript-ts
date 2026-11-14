import {
  command,
  deleteVar,
  fmt,
  listAdd,
  listVar,
  localList,
  num,
  player,
  script,
  send,
  set,
  sortedList,
  splitText,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// List sorting (feedback C5): sortedList(list) — Skript's
// `sorted <list>`. Semantics probed against the real Skript
// 2.17.1 by the coordinator: homogeneous lists only — an
// all-number list sorts ascending numerically, an all-text list
// sorts ascending case-insensitively, and a mixed list (or any
// other element type, or an empty list) yields no value, which
// a whole list renders as <none> inside a string. Entirely core
// constructs, so it runs under both runtimes — the emitted .sk
// under Skript and the IR under the engine jar.
//
//   /sortnums    3, 1, 2 in a local list -> "nums=1, 2 and 3"
//   /sorttexts   banana, Apple, cherry -> "texts=Apple, banana and cherry"
//   /sortmixed   1, "x", 2 -> "mixed=<none>"
//   /sortsplit   sorted split of "pear,apple,kiwi" assigned into
//                a list variable -> "split=apple, kiwi and pear"
//   /sortglobal  the same over a global list variable
//                (30, 10, 20 -> "global=10, 20 and 30")
export const sortedScript: Script = script(
  command("sortnums", null, [
    listAdd(localList("nums"), num(3)),
    listAdd(localList("nums"), num(1)),
    listAdd(localList("nums"), num(2)),
    set(localList("sorted"), sortedList(localList("nums"))),
    send(player(), fmt("nums=", localList("sorted"))),
  ]),
  command("sorttexts", null, [
    listAdd(localList("words"), str("banana")),
    listAdd(localList("words"), str("Apple")),
    listAdd(localList("words"), str("cherry")),
    set(localList("sorted"), sortedList(localList("words"))),
    send(player(), fmt("texts=", localList("sorted"))),
  ]),
  command("sortmixed", null, [
    listAdd(localList("mixed"), num(1)),
    listAdd(localList("mixed"), str("x")),
    listAdd(localList("mixed"), num(2)),
    set(localList("sorted"), sortedList(localList("mixed"))),
    send(player(), fmt("mixed=", localList("sorted"))),
  ]),
  command("sortsplit", null, [
    set(localList("sorted"), sortedList(splitText(str("pear,apple,kiwi"), str(",")))),
    send(player(), fmt("split=", localList("sorted"))),
  ]),
  command("sortglobal", null, [
    deleteVar(listVar("scores")),
    listAdd(listVar("scores"), num(30)),
    listAdd(listVar("scores"), num(10)),
    listAdd(listVar("scores"), num(20)),
    set(listVar("sortedscores"), sortedList(listVar("scores"))),
    send(player(), fmt("global=", listVar("sortedscores"))),
  ]),
);
