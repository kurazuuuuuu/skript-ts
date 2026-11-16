import type { Script } from "../src/index.js";
import {
  areaName,
  defineArea,
  fmt,
  location,
  num,
  onAreaEnter,
  onAreaLeave,
  player,
  script,
  send,
} from "../src/index.js";

// Area enter/leave events (ext-events U3): ENGINE-ONLY. The
// original's region events require a regions plugin, so
// skript-ts defines its own: defineArea() declares a named
// cuboid (here a 5x3x5 box over the behavior test's platform
// at x/z 400..404), and the engine fires enter/leave when a
// player's block position crosses the boundary — the polling
// loop this replaces used to watch positions once a second.
// The script is the source of truth: definitions are not
// persisted, and a player who joins inside an area is simply
// recorded as inside (no enter event fires for the join).
export const areasScript: Script = script(
  defineArea(
    "extzone",
    location(num(400), num(-60), num(400)),
    location(num(404), num(-58), num(404)),
  ),
  onAreaEnter([send(player(), fmt("entered ", areaName()))]),
  onAreaLeave([send(player(), fmt("left ", areaName()))]),
);
