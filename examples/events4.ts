import type { Script } from "../src/index.js";
import {
  broadcast,
  command,
  eventItem,
  fmt,
  num,
  onConsume,
  onCraft,
  onInventoryDrag,
  onProjectileHit,
  onToggleSneak,
  openGui,
  player,
  script,
  send,
  str,
  typeOf,
} from "../src/index.js";

// More events (feedback batch D): consume, craft, inventory
// drag (now with the standard options object), projectile hit
// and toggle sneak — all core constructs, so this sample runs
// under both runtimes. The sixth event of the batch,
// onSwapHand, is engine-only (Skript has no swap-hand header
// under any spelling) and therefore cannot live in this
// dual-runtime sample; it is covered by the golden suite's
// engine-only assertions instead.
//
//   consume         "consumed <type of the eaten / drunk item>"
//   craft           "crafted <type of the crafted result>"
//   inventory drag  "inventory dragged"
//   projectile hit  "projectile hit" (arrow into the bot OR
//                   into the ground — both fire it)
//   toggle sneak    "sneak toggled" (on AND off)
//
// /ev4open opens the 1-row "EV4" GUI the behavior test drags
// items across.
export const events4Script: Script = script(
  onConsume([broadcast(fmt("consumed ", typeOf(eventItem())))]),
  onCraft([broadcast(fmt("crafted ", typeOf(eventItem())))]),
  onInventoryDrag([broadcast(str("inventory dragged"))]),
  onProjectileHit([broadcast(str("projectile hit"))]),
  onToggleSneak([broadcast(str("sneak toggled"))]),
  command("ev4open", null, [openGui(player(), num(1), str("EV4")), send(player(), str("opened"))]),
);
