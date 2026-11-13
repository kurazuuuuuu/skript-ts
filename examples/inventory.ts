import {
  canHoldItem,
  command,
  fmt,
  giveItem,
  hasItem,
  ifElse,
  item,
  itemCountIn,
  not,
  num,
  player,
  removeAllItems,
  removeItem,
  script,
  send,
  str,
  withAmount,
  withName,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Inventory operations (feedback lane D): test, count, remove
// and capacity-check the items a player holds. Matching is
// directional (a bare diamond pattern also matches named
// diamonds; a named pattern matches only its own stacks) and
// counts armor and the offhand, while the capacity check uses
// the stricter storage-only, exact-similarity rule — see the
// api.ts section note. /invsetup lays out a known inventory:
// 5 plain diamonds, 2 diamonds named "Gem", 3 iron ingots.
export const inventoryScript: Script = script(
  command("invsetup", null, [
    giveItem(player(), withAmount(item("diamond"), num(5))),
    giveItem(player(), withAmount(withName(item("diamond"), str("Gem")), num(2))),
    giveItem(player(), withAmount(item("iron ingot"), num(3))),
    send(player(), str("invsetup: done")),
  ]),
  command("invcheck", null, [
    send(
      player(),
      fmt(
        "invcheck: count=",
        itemCountIn(player(), item("diamond")),
        " gem=",
        itemCountIn(player(), withName(item("diamond"), str("Gem"))),
      ),
    ),
    ifElse(
      hasItem(player(), withAmount(item("diamond"), num(7))),
      [send(player(), str("invcheck: has7 yes"))],
      [send(player(), str("invcheck: has7 no"))],
    ),
    ifElse(
      hasItem(player(), withAmount(item("diamond"), num(8))),
      [send(player(), str("invcheck: has8 yes"))],
      [send(player(), str("invcheck: has8 no"))],
    ),
    ifElse(
      hasItem(player(), withAmount(withName(item("diamond"), str("Gem")), num(3))),
      [send(player(), str("invcheck: hasgem3 yes"))],
      [send(player(), str("invcheck: hasgem3 no"))],
    ),
    // No else branch: the .sk form uses the native negation
    // (`player does not have emerald`).
    ifElse(not(hasItem(player(), item("emerald"))), [
      send(player(), str("invcheck: noemerald yes")),
    ]),
    // Storage capacity for plain diamonds after /invsetup:
    // 59 merge room in the partial plain stack + 33 empty slots
    // x 64 = 2171 (the named stack gives a plain pattern no
    // merge room, and armor / offhand never count).
    ifElse(
      canHoldItem(player(), withAmount(item("diamond"), num(2171))),
      [send(player(), str("invcheck: can2171 yes"))],
      [send(player(), str("invcheck: can2171 no"))],
    ),
    ifElse(
      canHoldItem(player(), withAmount(item("diamond"), num(2172))),
      [send(player(), str("invcheck: can2172 yes"))],
      [send(player(), str("invcheck: can2172 no"))],
    ),
    // Non-stackables fit one per empty slot: 33 here.
    ifElse(
      canHoldItem(player(), withAmount(item("diamond sword"), num(33))),
      [send(player(), str("invcheck: swords33 yes"))],
      [send(player(), str("invcheck: swords33 no"))],
    ),
    ifElse(
      canHoldItem(player(), withAmount(item("diamond sword"), num(34))),
      [send(player(), str("invcheck: swords34 yes"))],
      [send(player(), str("invcheck: swords34 no"))],
    ),
  ]),
  command("invcount", null, [
    send(player(), fmt("invcount: count=", itemCountIn(player(), item("diamond")))),
    ifElse(
      canHoldItem(player(), withAmount(item("diamond"), num(2240))),
      [send(player(), str("invcount: can2240 yes"))],
      [send(player(), str("invcount: can2240 no"))],
    ),
    ifElse(
      canHoldItem(player(), withAmount(item("diamond"), num(2241))),
      [send(player(), str("invcount: can2241 yes"))],
      [send(player(), str("invcount: can2241 no"))],
    ),
  ]),
  command("invremove", null, [
    removeItem(player(), withAmount(item("diamond"), num(4))),
    send(
      player(),
      fmt(
        "invremove: count=",
        itemCountIn(player(), item("diamond")),
        " gem=",
        itemCountIn(player(), withName(item("diamond"), str("Gem"))),
      ),
    ),
  ]),
  command("invpartial", null, [
    // Removing more than the inventory holds removes what
    // exists (partial remove, never an error).
    removeItem(player(), withAmount(item("diamond"), num(100))),
    send(player(), fmt("invpartial: count=", itemCountIn(player(), item("diamond")))),
  ]),
  command("invremoveall", null, [
    removeAllItems(player(), item("diamond")),
    send(
      player(),
      fmt(
        "invremoveall: count=",
        itemCountIn(player(), item("diamond")),
        " iron=",
        itemCountIn(player(), item("iron ingot")),
      ),
    ),
  ]),
);
