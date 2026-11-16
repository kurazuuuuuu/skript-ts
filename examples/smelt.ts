import type { Script } from "../src/index.js";
import {
  broadcast,
  cancelEvent,
  fmt,
  item,
  onSmelt,
  script,
  setSmeltedItem,
  smeltedItem,
  str,
} from "../src/index.js";

// Smelt event (ext-events U1): core language, probed against
// the real Skript 2.17.1. The header filter matches the SOURCE
// item in the furnace's input slot; smeltedItem() is the
// result, and it can be rewritten (setSmeltedItem) or the
// whole smelt cancelled.
//
//   raw iron  -> the result is rewritten to a gold ingot and
//                announced as "smelted <result>"
//   raw gold  -> the smelt is cancelled and announced as
//                "smelt blocked"; the raw gold stays in the
//                furnace's input slot
export const smeltScript: Script = script(
  onSmelt([setSmeltedItem(item("gold ingot")), broadcast(fmt("smelted ", smeltedItem()))], {
    item: "raw iron",
  }),
  onSmelt([cancelEvent(), broadcast(str("smelt blocked"))], { item: "raw gold" }),
);
