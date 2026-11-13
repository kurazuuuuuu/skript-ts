import {
  command,
  fmt,
  freeSpaceFor,
  giveItem,
  item,
  num,
  player,
  script,
  send,
  str,
  withAmount,
  withName,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// freeSpaceFor is ENGINE-ONLY (feedback lane D): the original
// Skript has no expression for how many more of an item fit
// into an inventory (every free-space / empty-slot amount form
// failed to parse), so this sample deploys IR-only. The number
// follows the original's can-hold rule: storage slots only, an
// empty slot fits a full max-size stack, and a partial slot
// only takes more of an exactly similar stack — so after
// /invspacefill (32 diamonds named "Gem" in slot 0) the plain
// diamond pattern gets NO merge room from that stack
// (2240 = 35 x 64) while the "Gem" pattern does (2272).
export const invspaceScript: Script = script(
  command("invspace", null, [
    send(
      player(),
      fmt(
        "invspace: plain=",
        freeSpaceFor(player(), item("diamond")),
        " gem=",
        freeSpaceFor(player(), withName(item("diamond"), str("Gem"))),
        " iron=",
        freeSpaceFor(player(), item("iron ingot")),
        " sword=",
        freeSpaceFor(player(), item("diamond sword")),
      ),
    ),
  ]),
  command("invspacefill", null, [
    giveItem(player(), withAmount(withName(item("diamond"), str("Gem")), num(32))),
    send(player(), str("invspacefill: done")),
  ]),
);
