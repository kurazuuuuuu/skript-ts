import {
  addToInventory,
  addToSlot,
  cancelEvent,
  clickedClickType,
  command,
  draggedSlots,
  enchantItem,
  enchantSlot,
  enchantmentLevelOf,
  enchantmentsOf,
  equals,
  eventItem,
  fmt,
  ifElse,
  item,
  listSize,
  localVar,
  loopIndex,
  loopList,
  loopRange,
  loopValue,
  num,
  onInventoryClick,
  onInventoryDrag,
  openGui,
  player,
  removeFromInventory,
  removeFromSlot,
  script,
  send,
  set,
  setItemName,
  setSlot,
  slotIndexOf,
  slotItem,
  str,
  variable,
  withAmount,
  withEnchantment,
  withName,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 28): GUI slice 2 — inventory drag
// events, the slot / inventory add and remove forms, and
// enchantments (literal suffix, the enchant effect, the level
// and list reads, and the probed equality rule). Entirely core
// constructs, so it runs under both runtimes.
//
//   /g2open       open a 1-row GUI titled "G2" ("opened")
//   /g2modenone   set {g2mode} to "none" ("mode set")
//   /g2modedrag   drags are cancelled by the drag handler
//   /g2modeclick  clicks are cancelled by the click handler —
//                 which does NOT stop drags (the original's
//                 asymmetry, covered by the behavior test)
//   /g2load       add 12 stone to the player's inventory
//   /g2clear      clear slots 0..35 of the player's inventory
//   /g2add1..5    slot adds: "s10=5 stones", "s10=6 stones",
//                 "s10=64 stones" (merge capped at the material
//                 max), "s11=99 stones" (the empty-slot set path
//                 caps at 99 instead), then a dirt add onto the
//                 stone slot is a silent no-op ("s11=99 stones")
//   /g2rem1..3    slot removes: "s11=69 stones", a dirt remove
//                 is a no-op (matching is by type only), and
//                 removing more than present empties the slot
//                 ("s11=0 airs" — an empty slot reads as an air
//                 item of amount 0)
//   /g2addinv     add 100 stone to the whole inventory:
//                 "s0=64 stones s1=36 stones s10=64 stones"
//   /g2reminv     remove 70 stone from the whole inventory:
//                 "s0=0 airs s1=30 stones s10=64 stones"
//   /g2named      named-stack merging: a plain add merges into
//                 the named slot stack and keeps its name
//                 ("s12=10 stones named Rock"); a differently
//                 named add does not merge (same readback)
//   /g2ench       enchant a diamond sword via the effect:
//                 "lvl=5 list=sharpness 5 fire=" (an absent
//                 enchantment's level reads as no value)
//   /g2ench2      the equality rule: "eq1=true" (same
//                 enchantments), "eq2=false" (enchanted vs
//                 plain, no name or lore), "eq3=true" (the
//                 enchanted stack also carries a name)
//   /g2enchslot   enchant slot 20's bow: "s20=bow plvl=3"
//   /g2persist    store a named, enchanted sword in {g2saved}
//   /g2readback   "saved=diamond sword named Keepsake lvl=7" —
//                 also after a server restart (persistence)
//
//   drag in the GUI   one "dragged <index>" message per slot
//                     that received items, then "drag n=<count>
//                     item=<post-drag cursor>" ("0 airs" when
//                     the drag distributed everything)
//   click anywhere    "ct=<click type>" ("left mouse button",…)
export const gui2Script: Script = script(
  command("g2open", null, [
    openGui(player(), num(1), str("G2")),
    send(player(), str("opened")),
  ]),
  command("g2modenone", null, [
    set(variable("g2mode"), str("none")),
    send(player(), str("mode set")),
  ]),
  command("g2modedrag", null, [
    set(variable("g2mode"), str("drag")),
    send(player(), str("mode set")),
  ]),
  command("g2modeclick", null, [
    set(variable("g2mode"), str("click")),
    send(player(), str("mode set")),
  ]),
  command("g2load", null, [
    addToInventory(player(), withAmount(item("stone"), num(12))),
    send(player(), str("loaded")),
  ]),
  command("g2clear", null, [
    loopRange(num(0), num(35), [setSlot(player(), loopIndex(), item("air"))]),
    send(player(), str("cleared")),
  ]),
  command("g2add1", null, [
    addToSlot(player(), num(10), withAmount(item("stone"), num(5))),
    send(player(), fmt("s10=", slotItem(player(), num(10)))),
  ]),
  command("g2add2", null, [
    addToSlot(player(), num(10), item("stone")),
    send(player(), fmt("s10=", slotItem(player(), num(10)))),
  ]),
  command("g2add3", null, [
    addToSlot(player(), num(10), withAmount(item("stone"), num(100))),
    send(player(), fmt("s10=", slotItem(player(), num(10)))),
  ]),
  command("g2add4", null, [
    addToSlot(player(), num(11), withAmount(item("stone"), num(100))),
    send(player(), fmt("s11=", slotItem(player(), num(11)))),
  ]),
  command("g2add5", null, [
    addToSlot(player(), num(11), withAmount(item("dirt"), num(10))),
    send(player(), fmt("s11=", slotItem(player(), num(11)))),
  ]),
  command("g2rem1", null, [
    removeFromSlot(player(), num(11), withAmount(item("stone"), num(30))),
    send(player(), fmt("s11=", slotItem(player(), num(11)))),
  ]),
  command("g2rem2", null, [
    removeFromSlot(player(), num(11), item("dirt")),
    send(player(), fmt("s11=", slotItem(player(), num(11)))),
  ]),
  command("g2rem3", null, [
    removeFromSlot(player(), num(11), withAmount(item("stone"), num(100))),
    send(player(), fmt("s11=", slotItem(player(), num(11)))),
  ]),
  command("g2addinv", null, [
    addToInventory(player(), withAmount(item("stone"), num(100))),
    send(
      player(),
      fmt(
        "s0=",
        slotItem(player(), num(0)),
        " s1=",
        slotItem(player(), num(1)),
        " s10=",
        slotItem(player(), num(10)),
      ),
    ),
  ]),
  command("g2reminv", null, [
    removeFromInventory(player(), withAmount(item("stone"), num(70))),
    send(
      player(),
      fmt(
        "s0=",
        slotItem(player(), num(0)),
        " s1=",
        slotItem(player(), num(1)),
        " s10=",
        slotItem(player(), num(10)),
      ),
    ),
  ]),
  command("g2named", null, [
    set(localVar("x"), withAmount(item("stone"), num(5))),
    setItemName(localVar("x"), str("Rock")),
    addToSlot(player(), num(12), localVar("x")),
    send(player(), fmt("s12=", slotItem(player(), num(12)))),
    addToSlot(player(), num(12), withAmount(item("stone"), num(5))),
    send(player(), fmt("s12=", slotItem(player(), num(12)))),
    set(localVar("y"), withAmount(withName(item("stone"), str("Other")), num(5))),
    addToSlot(player(), num(12), localVar("y")),
    send(player(), fmt("s12=", slotItem(player(), num(12)))),
  ]),
  command("g2ench", null, [
    set(localVar("s"), item("diamond sword")),
    enchantItem(localVar("s"), "sharpness", 5),
    set(variable("g2sword"), localVar("s")),
    send(
      player(),
      fmt(
        "lvl=",
        enchantmentLevelOf(localVar("s"), "sharpness"),
        " list=",
        enchantmentsOf(localVar("s")),
        " fire=",
        enchantmentLevelOf(localVar("s"), "fire aspect"),
      ),
    ),
  ]),
  command("g2ench2", null, [
    set(localVar("a"), withEnchantment(item("diamond sword"), "sharpness", 5)),
    ifElse(
      equals(variable("g2sword"), localVar("a")),
      [send(player(), str("eq1=true"))],
      [send(player(), str("eq1=false"))],
    ),
    ifElse(
      equals(variable("g2sword"), withAmount(item("diamond sword"), num(1))),
      [send(player(), str("eq2=true"))],
      [send(player(), str("eq2=false"))],
    ),
    set(localVar("c"), withName(item("diamond sword"), str("X"))),
    set(
      localVar("d"),
      withEnchantment(withName(item("diamond sword"), str("X")), "sharpness", 5),
    ),
    ifElse(
      equals(localVar("c"), localVar("d")),
      [send(player(), str("eq3=true"))],
      [send(player(), str("eq3=false"))],
    ),
  ]),
  command("g2enchslot", null, [
    setSlot(player(), num(20), item("bow")),
    enchantSlot(player(), num(20), "power", 3),
    send(
      player(),
      fmt(
        "s20=",
        slotItem(player(), num(20)),
        " plvl=",
        enchantmentLevelOf(slotItem(player(), num(20)), "power"),
      ),
    ),
  ]),
  command("g2persist", null, [
    set(
      variable("g2saved"),
      withEnchantment(
        withName(item("diamond sword"), str("Keepsake")),
        "sharpness",
        7,
      ),
    ),
    send(player(), str("saved")),
  ]),
  command("g2readback", null, [
    send(
      player(),
      fmt(
        "saved=",
        variable("g2saved"),
        " lvl=",
        enchantmentLevelOf(variable("g2saved"), "sharpness"),
      ),
    ),
  ]),
  onInventoryDrag([
    loopList(draggedSlots(), [
      send(player(), fmt("dragged ", slotIndexOf(loopValue()))),
    ]),
    send(
      player(),
      fmt("drag n=", listSize(draggedSlots()), " item=", eventItem()),
    ),
    ifElse(equals(variable("g2mode"), str("drag")), [cancelEvent()]),
  ]),
  onInventoryClick([
    send(player(), fmt("ct=", clickedClickType())),
    ifElse(equals(variable("g2mode"), str("click")), [cancelEvent()]),
  ]),
);
