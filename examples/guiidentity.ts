import {
  broadcast,
  cancelEvent,
  command,
  fmt,
  guiEventId,
  guiEventIs,
  guiHandle,
  ifElse,
  num,
  onInventoryClick,
  openGui,
  player,
  script,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// GUI identity sample (feedback B3, with the T4 typed-identifier
// angle): script GUIs get an unspoofable engine-side identity.
//
//   /shopgui   open a 3-row GUI titled "Shop", tagged with the
//              "shop" handle
//   /plaingui  open a 3-row GUI with the SAME title "Shop", but
//              untagged (plain core openGui)
//   click      the handler cancels the click and reports the
//              event GUI's registered id plus the two handle
//              tests:
//                tagged:   "guiid=shop", "gui is shop",
//                          "gui not other"
//                untagged: "guiid=<none>", "gui not shop",
//                          "gui not other" — the identical title
//                          does NOT make it the shop GUI, which
//              is exactly what title matching could not prove.
//
// This script is engine-only: GUI identity lives in the engine
// jar's registry, so there is no .sk form of this file. The
// build emits only guiidentity.ir.json and Skript-mode
// deployment skips it. (The untagged /plaingui open on its own
// would be core language; the tagged open and the identity
// reads are what make the script engine-only.)
export const shopGui = guiHandle("shop");
export const otherGui = guiHandle("other");

export const guiIdentityScript: Script = script(
  command("shopgui", null, [openGui(player(), num(3), str("Shop"), shopGui)]),
  command("plaingui", null, [openGui(player(), num(3), str("Shop"))]),
  onInventoryClick([
    cancelEvent(),
    broadcast(fmt("guiid=", guiEventId())),
    ifElse(guiEventIs(shopGui), [broadcast(str("gui is shop"))], [broadcast(str("gui not shop"))]),
    ifElse(
      guiEventIs(otherGui),
      [broadcast(str("gui is other"))],
      [broadcast(str("gui not other"))],
    ),
  ]),
);
