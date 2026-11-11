import {
  amountOf,
  broadcast,
  cancelEvent,
  clickedRawSlotIndex,
  clickedSlotIndex,
  command,
  currentInventoryOf,
  equals,
  eventInventory,
  eventItem,
  fmt,
  giveItem,
  ifElse,
  item,
  joinText,
  localVar,
  loreOf,
  nameOf,
  num,
  onInventoryClick,
  onInventoryClose,
  openGui,
  player,
  script,
  set,
  setItemLore,
  setItemName,
  setSlot,
  slotItem,
  str,
  variable,
  withAmount,
  withLore,
  withName,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Core-language sample (phase 17): items, inventories and GUIs —
// item construction with names / lore / amounts, the meta
// statements and read expressions, a chest GUI opened to the
// player with slots filled through the current inventory, and
// the inventory click / close events guarding it. Entirely core
// constructs, so it runs under both runtimes — the emitted .sk
// under Skript and the IR under the engine jar.
//
//   /gem        build a diamond sword, rename it and give it
//               lore via the meta statements, hand it to the
//               player, and keep a copy in {gemitem}
//   /geminfo    print the stored item and read its name, lore
//               and amount back through the expressions
//   /menu       open the 3-row "Shop Menu" GUI: a named diamond
//               ("Menu Gem", lore "Click to buy") at slot 13 and
//               3 stone at slot 11
//   click 13    the click is reported ("clicked 13 raw 13
//               item=diamond named Menu Gem in Shop Menu"),
//               cancelled, answered with "bought the gem slot",
//               and slot 22 of the event inventory gains an
//               emerald, read back at once ("slot22=emerald")
//   click else  reported too ("clicked 12 raw 30 item=<none>
//               in Shop Menu" for a bottom-inventory click) and
//               cancelled while the menu is open
//   close       "closed Shop Menu"
export const guiScript: Script = script(
  command("gem", null, [
    set(localVar("i"), item("diamond sword")),
    setItemName(localVar("i"), str("Gem Blade")),
    setItemLore(localVar("i"), str("Sharp and bright"), str("Handle with care")),
    set(variable("gemitem"), localVar("i")),
    giveItem(player(), localVar("i")),
  ]),
  command("geminfo", null, [
    broadcast(
      fmt(
        "gem=",
        variable("gemitem"),
        " name=",
        nameOf(variable("gemitem")),
        " lore=",
        joinText(loreOf(variable("gemitem")), str(" / ")),
        " n=",
        amountOf(variable("gemitem")),
      ),
    ),
  ]),
  command("menu", null, [
    openGui(player(), num(3), str("Shop Menu")),
    setSlot(
      currentInventoryOf(player()),
      num(13),
      withLore(withName(item("diamond"), str("Menu Gem")), str("Click to buy")),
    ),
    setSlot(currentInventoryOf(player()), num(11), withAmount(item("stone"), num(3))),
  ]),
  onInventoryClick([
    ifElse(equals(nameOf(eventInventory()), str("Shop Menu")), [
      cancelEvent(),
      broadcast(
        fmt(
          "clicked ",
          clickedSlotIndex(),
          " raw ",
          clickedRawSlotIndex(),
          " item=",
          eventItem(),
          " in ",
          nameOf(eventInventory()),
        ),
      ),
      ifElse(equals(clickedSlotIndex(), num(13)), [
        broadcast(str("bought the gem slot")),
        setSlot(eventInventory(), num(22), item("emerald")),
        broadcast(fmt("slot22=", slotItem(eventInventory(), num(22)))),
      ]),
    ]),
  ]),
  onInventoryClose([
    ifElse(equals(nameOf(eventInventory()), str("Shop Menu")), [
      broadcast(fmt("closed ", nameOf(eventInventory()))),
    ]),
  ]),
);
