// Custom items from the project's resource pack (RP-2).
//
// The pack itself is defined in examples/resourcepack.ts (namespace
// "example", one item: the gem). This script references it by id
// with customItem(): the project build resolves the reference
// against the pack and the persisted CustomModelData registry
// (resourcepack-registry.json at the project root), so the given
// stack carries item_model "example:gem", the registry number as
// its CustomModelData, and the defined display name. The read-back
// expressions report the components off a stored stack — under the
// engine this also exercises the variables.json persistence of the
// two components.

import {
  command,
  customItem,
  customModelDataOf,
  fmt,
  giveItem,
  itemModelOf,
  player,
  script,
  send,
  set,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

export const customItemsScript: Script = script(
  command("cgem", null, [
    set(variable("cgem"), customItem("gem")),
    giveItem(player(), variable("cgem")),
    send(
      player(),
      fmt(
        "モデル: ",
        itemModelOf(variable("cgem")),
        " / 番号: ",
        customModelDataOf(variable("cgem")),
      ),
    ),
  ]),
);
