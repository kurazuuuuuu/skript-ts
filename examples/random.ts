import {
  add,
  broadcast,
  chance,
  command,
  fmt,
  ifElse,
  localVar,
  loopTimes,
  not,
  num,
  player,
  plus,
  randomInteger,
  randomNumber,
  script,
  send,
  set,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 28): randomness — random number /
// integer draws and the chance condition. Entirely core
// constructs, so it runs under both runtimes. Every evaluation
// draws fresh; there is no seed.
//
//   /roll          -> a die roll, 1..6
//   /coinflip      -> "flip: heads" or "flip: tails" (chance)
//   /antiflip      -> the negated chance, lowered by branch swap
//   /jackpot       -> a 25% chance win/lose read-back
//   /spanroll      -> a real-valued draw between 1 and 2
//   /dicebattery   -> 100 draws of randomInteger(1, 3) with the
//                     per-face counts broadcast
//   /chancebattery -> 100 checks of chance(0.5), true count out
//   /chancebounds  -> chance(0) never fires, chance(1) always
export const randomScript: Script = script(
  command("roll", null, [
    send(player(), fmt("roll: ", randomInteger(num(1), num(6)))),
  ]),
  command("coinflip", null, [
    ifElse(
      chance(num(0.5)),
      [send(player(), str("flip: heads"))],
      [send(player(), str("flip: tails"))],
    ),
  ]),
  command("antiflip", null, [
    ifElse(
      not(chance(num(0.5))),
      [send(player(), str("anti: no draw"))],
      [send(player(), str("anti: draw"))],
    ),
  ]),
  command("jackpot", null, [
    ifElse(
      chance(num(0.25)),
      [send(player(), str("jackpot: won"))],
      [send(player(), str("jackpot: lost"))],
    ),
  ]),
  command("spanroll", null, [
    set(localVar("v"), randomNumber(num(1), num(2))),
    send(player(), fmt("span: ", localVar("v"))),
  ]),
  command("dicebattery", null, [
    // Counting goes through an indexed local: one tally update
    // per draw, no per-face branches. (The battery loop counts
    // in this sample stay modest: the engine chains one stack
    // frame set per loop iteration, so very long loops in one
    // trigger can exhaust the server thread's stack there,
    // while the original iterates natively.)
    set(localVar("tally", str("1")), num(0)),
    set(localVar("tally", str("2")), num(0)),
    set(localVar("tally", str("3")), num(0)),
    loopTimes(num(100), [
      set(localVar("v"), randomInteger(num(1), num(3))),
      set(
        localVar("tally", localVar("v")),
        plus(localVar("tally", localVar("v")), num(1)),
      ),
      // The three counts pin the range exactly: a draw outside
      // 1..3 would leave their total below 100 (and a draw of
      // some other whole number would grow a fourth element
      // instead of one of these).
    ]),
    // Read back through scalars: a quoted index inside a
    // string interpolation does not parse in the original.
    set(localVar("c1"), localVar("tally", str("1"))),
    set(localVar("c2"), localVar("tally", str("2"))),
    set(localVar("c3"), localVar("tally", str("3"))),
    broadcast(
      fmt(
        "battery: c1=",
        localVar("c1"),
        " c2=",
        localVar("c2"),
        " c3=",
        localVar("c3"),
      ),
    ),
  ]),
  command("chancebattery", null, [
    set(localVar("t"), num(0)),
    loopTimes(num(100), [
      ifElse(chance(num(0.5)), [add(localVar("t"), num(1))]),
    ]),
    broadcast(fmt("chancebattery: true=", localVar("t"))),
  ]),
  command("chancebounds", null, [
    // The bounds go through locals so the emitted .sk carries
    // no constant chance literal (the original warns at load
    // about always-true / always-false constant conditions).
    set(localVar("zero"), num(0)),
    set(localVar("one"), num(1)),
    set(localVar("never"), num(0)),
    set(localVar("always"), num(0)),
    loopTimes(num(50), [
      ifElse(chance(localVar("zero")), [add(localVar("never"), num(1))]),
      ifElse(chance(localVar("one")), [add(localVar("always"), num(1))]),
    ]),
    broadcast(
      fmt("chancebounds: never=", localVar("never"), " always=", localVar("always")),
    ),
  ]),
);
