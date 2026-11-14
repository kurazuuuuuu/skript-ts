// This file's name sorts LAST alphabetically but it declares load order 10, so the engine runs its handlers before loadorder1.ts (order 20); under Skript the filename order wins and this script's handlers run second. The pair pins the difference.

import {
  chatMessage,
  equals,
  ifElse,
  listAdd,
  listVar,
  loadOrder,
  onChat,
  script,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

export const loadorder2Script: Script = loadOrder(
  10,
  script(
    onChat([
      ifElse(equals(chatMessage(), str("orderprobe")), [
        listAdd(listVar("loadorderprobe"), str("first")),
      ]),
    ]),
  ),
);
