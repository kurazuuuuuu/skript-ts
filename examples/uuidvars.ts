import type { Script } from "../src/index.js";
import {
  script,
  command,
  cmdArg,
  argument,
  set,
  variable,
  listVar,
  loopList,
  loopIndex,
  loopValue,
  send,
  fmt,
  str,
  player,
} from "../src/index.js";

// Player-keyed variables (B6). In the engine, a player used as a
// variable index keys by the player's UUID by default, so
// {uvgrowth::%player%} survives a rename; the legacy name form
// stays selectable in the engine's config.json
// (variables.playerKeysUseUuid). Under Skript the same choice is
// Skript's own "use player UUIDs in variable names" setting. A
// player still displays as their name everywhere — only the
// storage key differs, which /uvkeys makes observable.

// /uvset <number>: store the number under the player's key.
const uvset = command(
  "uvset",
  [cmdArg("number")],
  [
    set(variable("uvgrowth", player()), argument(1)),
    send(player(), fmt("uv set to ", argument(1))),
  ],
);

// /uvget: read the number back through the same key.
const uvget = command("uvget", null, [send(player(), fmt("uv=", variable("uvgrowth", player())))]);

// /uvkeys: report every stored key segment with its value.
const uvkeys = command("uvkeys", null, [
  loopList(listVar("uvgrowth"), [send(player(), fmt("uvkey=", loopIndex(), " val=", loopValue()))]),
  send(player(), str("uvkeys done")),
]);

export const uuidvarsScript: Script = script(uvset, uvget, uvkeys);
