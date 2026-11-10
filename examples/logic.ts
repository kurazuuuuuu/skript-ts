import {
  and,
  argument,
  broadcast,
  command,
  dividedBy,
  equals,
  fmt,
  greaterOrEqual,
  ifElse,
  isOp,
  not,
  onChat,
  or,
  player,
  remainder,
  script,
  send,
  str,
  times,
  chatMessage,
  num,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 11): comparisons, logic, arithmetic.
// Entirely core constructs, so it runs under both runtimes — the
// emitted .sk under Skript and the IR under the engine jar.
//
//   chat "ping"            -> "pong" (text equality on the message)
//   chat "hello"           -> "hi, regular player", or "hi, boss"
//                             when the sender is op (and / not)
//   /calc <integer>        -> double / half / remainder read-back,
//                             plus a "big number" broadcast at >= 100
//   /gate <text>           -> "gate opens" for "open" or "sesame",
//                             "gate stays shut" otherwise (or)
export const logicScript: Script = script(
  onChat([
    ifElse(equals(chatMessage(), str("ping")), [
      send(player(), str("pong")),
    ]),
    ifElse(and(equals(chatMessage(), str("hello")), not(isOp(player()))), [
      send(player(), str("hi, regular player")),
    ]),
    ifElse(and(equals(chatMessage(), str("hello")), isOp(player())), [
      send(player(), str("hi, boss")),
    ]),
  ]),
  command("calc", "integer", [
    send(
      player(),
      fmt(
        "calc: double=",
        times(argument(1), num(2)),
        ", half=",
        dividedBy(argument(1), num(2)),
        ", mod3=",
        remainder(argument(1), num(3)),
      ),
    ),
    ifElse(greaterOrEqual(argument(1), num(100)), [
      broadcast(fmt("big number: ", argument(1))),
    ]),
  ]),
  command("gate", "text", [
    ifElse(
      or(equals(argument(1), str("open")), equals(argument(1), str("sesame"))),
      [send(player(), str("gate opens"))],
      [send(player(), str("gate stays shut"))],
    ),
  ]),
);
