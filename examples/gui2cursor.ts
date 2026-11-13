import {
  command,
  equals,
  eventCursor,
  fmt,
  ifElse,
  item,
  num,
  onInventoryClick,
  openGui,
  player,
  script,
  send,
  set,
  setCursorItem,
  str,
  variable,
  withAmount,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Engine-only sample (phase 28): the original has no cursor
// syntax at all (probed — every spelling is a parse error, and
// the click / drag events reject the cursor event-value), so
// this script runs only under the engine jar: building it for
// Skript is a build-time error.
//
//   /g2copen     open a 1-row GUI titled "G2C" ("opened")
//   /g2cgive     put 7 emeralds on the player's cursor ("gave")
//   /g2cmode     clicks replace the cursor with 3 diamonds
//   /g2cmodeoff  stop replacing the cursor
//
//   click anywhere   "cursor=<the item on the cursor before
//                    the click>" — "cursor=" when it is empty
export const gui2CursorScript: Script = script(
  command("g2copen", null, [openGui(player(), num(1), str("G2C")), send(player(), str("opened"))]),
  command("g2cgive", null, [
    setCursorItem(player(), withAmount(item("emerald"), num(7))),
    send(player(), str("gave")),
  ]),
  command("g2cmode", null, [
    set(variable("g2cmode"), str("swap")),
    send(player(), str("mode set")),
  ]),
  command("g2cmodeoff", null, [
    set(variable("g2cmode"), str("none")),
    send(player(), str("mode set")),
  ]),
  onInventoryClick([
    send(player(), fmt("cursor=", eventCursor())),
    ifElse(equals(variable("g2cmode"), str("swap")), [
      setCursorItem(player(), withAmount(item("diamond"), num(3))),
    ]),
  ]),
);
