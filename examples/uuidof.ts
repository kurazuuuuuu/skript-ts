import { command, fmt, player, script, send, set, str, uuidOf, variable } from "../src/index.js";
import type { Script } from "../src/index.js";

// Player UUID expression (feedback B6-3): uuidOf(player) — the
// player's UUID as a text. Dual-mode: Skript emits its
// `uuid of %player%` form (probed against the real Skript
// 2.17.1 in the sandbox), and the engine reads the player's
// UUID directly. Because the value is plain text, it also works
// as a variable index in both runtimes — the text form of the
// key the engine's player index produces under UUID keying
// (feedback B6).
//
//   /myuuid     report the caller's UUID
//   /uuidstore  store "marked" under the caller's UUID text key
//   /uuidread   read it back through the same key

const myuuid = command("myuuid", null, [send(player(), fmt("myuuid=", uuidOf(player())))]);

const uuidstore = command("uuidstore", null, [
  set(variable("uuidmark", uuidOf(player())), str("marked")),
  send(player(), fmt("uuidstored under ", uuidOf(player()))),
]);

const uuidread = command("uuidread", null, [
  send(player(), fmt("uuidread=", variable("uuidmark", uuidOf(player())))),
]);

export const uuidofScript: Script = script(myuuid, uuidstore, uuidread);
