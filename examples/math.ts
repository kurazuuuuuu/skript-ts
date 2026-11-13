import {
  abs,
  argument,
  ceil,
  command,
  floor,
  fmt,
  localVar,
  max,
  min,
  num,
  player,
  round,
  script,
  send,
  sqrt,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 29): the built-in math functions
// floor / ceil / round / abs / sqrt / min / max. Entirely core
// constructs, so it runs under both runtimes — the emitted .sk
// under Skript and the IR under the engine jar.
//
//   /math <number>     -> floor / ceil / round / abs / sqrt of it
//   /mathround <number> -> round at 2 places and at the tens place
//   /mathmin <number>  -> min / max against 3 and 10, plus a min
//                         over an unset local (which drops out)
//   /mathbig           -> floor / ceil of ±1e19 (the saturating
//                         whole-number extremes)
export const mathScript: Script = script(
  command("math", "number", [
    send(
      player(),
      fmt(
        "math: floor=",
        floor(argument(1)),
        ", ceil=",
        ceil(argument(1)),
        ", round=",
        round(argument(1)),
        ", abs=",
        abs(argument(1)),
        ", sqrt=",
        sqrt(argument(1)),
      ),
    ),
  ]),
  command("mathround", "number", [
    send(
      player(),
      fmt(
        "round: two=",
        round(argument(1), num(2)),
        ", tens=",
        round(argument(1), num(-1)),
      ),
    ),
  ]),
  command("mathmin", "number", [
    send(
      player(),
      fmt(
        "minmax: min=",
        min(argument(1), num(10), num(3)),
        ", max=",
        max(argument(1), num(10), num(3)),
        ", missmin=",
        min(localVar("unset"), argument(1)),
      ),
    ),
  ]),
  command("mathbig", null, [
    send(
      player(),
      fmt("big: floor=", floor(num(1e19)), ", ceil=", ceil(num(-1e19))),
    ),
  ]),
);
