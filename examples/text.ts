import {
  argument,
  broadcast,
  charAt,
  colored,
  command,
  contains,
  endsWith,
  equals,
  firstChars,
  fmt,
  formatted,
  ifElse,
  joinText,
  lastChars,
  listSize,
  localList,
  localVar,
  loopIndex,
  loopList,
  loopValue,
  lowerCase,
  not,
  num,
  player,
  replaceAllIn,
  replaceFirstIn,
  script,
  send,
  set,
  splitText,
  startsWith,
  str,
  substring,
  textLength,
  uncolored,
  upperCase,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 15): text operations — length,
// substring / first / last / character-at, case conversion,
// split and join, contains / starts-with / ends-with, replace,
// and the color expressions. Entirely core constructs, so it
// runs under both runtimes — the emitted .sk under Skript and
// the IR under the engine jar.
//
//   /shout !hey     "loud: HEY" (the "!" prefix is stripped)
//   /shout hey      "plain: HEY"
//   /initial Hello  first / last / middle characters, the head
//                   and tail of the text, and its lowercase form
//   /csv a,b,,c     split into a list (4 parts — the empty part
//                   counts), read the parts back, join them two
//                   ways (from the list, and nested from a split)
//   /swap banana    replace-first and case-insensitive
//                   replace-all over the argument
//   /check hello    the contains / starts-with / ends-with
//                   branches that hold for the argument
//   /paint          colored / uncolored demos whose visible
//                   text is plain, and a literal length
//   /paeq &aX       "paint-eq=T": a colored runtime value
//                   equals its § literal (the check goes through
//                   a command argument — with two literals,
//                   Skript constant-folds the condition and the
//                   load check reports the simplification)
//   /fmteq <b>Bold</b>
//                   "fmt-eq=T": the same for a formatted value
export const textScript: Script = script(
  command("shout", "text", [
    ifElse(
      startsWith(argument(1), str("!")),
      [
        send(
          player(),
          fmt("loud: ", upperCase(substring(argument(1), num(2), textLength(argument(1))))),
        ),
      ],
      [send(player(), fmt("plain: ", upperCase(argument(1))))],
    ),
  ]),
  command("initial", "text", [
    send(
      player(),
      fmt(
        "first=",
        charAt(argument(1), num(1)),
        " last=",
        charAt(argument(1), textLength(argument(1))),
        " mid=",
        substring(argument(1), num(2), num(3)),
      ),
    ),
    send(
      player(),
      fmt(
        "head=",
        firstChars(argument(1), num(2)),
        " tail=",
        lastChars(argument(1), num(2)),
        " lower=",
        lowerCase(argument(1)),
      ),
    ),
  ]),
  command("csv", "text", [
    set(localList("parts"), splitText(argument(1), str(","))),
    send(player(), fmt("parts=", listSize(localList("parts")))),
    loopList(localList("parts"), [send(player(), fmt("part ", loopIndex(), "=", loopValue()))]),
    set(localVar("j"), joinText(localList("parts"), str(" | "))),
    send(player(), fmt("joined=", localVar("j"))),
    set(localVar("n"), joinText(splitText(argument(1), str(",")), str("+"))),
    send(player(), fmt("nested=", localVar("n"))),
  ]),
  command("swap", "text", [
    set(localVar("t"), argument(1)),
    replaceFirstIn(localVar("t"), str("a"), str("o")),
    send(player(), fmt("first=", localVar("t"))),
    set(localVar("t"), argument(1)),
    replaceAllIn(localVar("t"), str("A"), str("0")),
    send(player(), fmt("ci=", localVar("t"))),
  ]),
  command("check", "text", [
    ifElse(contains(argument(1), str("ELL")), [send(player(), str("has-ell"))]),
    ifElse(startsWith(argument(1), str("he")), [send(player(), str("starts-he"))]),
    ifElse(endsWith(argument(1), str("lo")), [send(player(), str("ends-lo"))]),
    ifElse(not(contains(argument(1), str("z"))), [send(player(), str("no-z"))]),
  ]),
  command("paint", null, [
    set(localVar("c"), colored(str("&aOK"))),
    broadcast(fmt("paint: ", localVar("c"))),
    set(localVar("u"), uncolored(str("§cRed"))),
    broadcast(fmt("plain: ", localVar("u"))),
    set(localVar("l"), textLength(str("Hello"))),
    broadcast(fmt("len: ", localVar("l"))),
  ]),
  command("paeq", "text", [
    ifElse(
      equals(colored(argument(1)), str("§aX")),
      [broadcast(str("paint-eq=T"))],
      [broadcast(str("paint-eq=F"))],
    ),
  ]),
  command("fmteq", "text", [
    ifElse(
      equals(formatted(argument(1)), str("§lBold")),
      [broadcast(str("fmt-eq=T"))],
      [broadcast(str("fmt-eq=F"))],
    ),
  ]),
);
