// This file's name sorts FIRST alphabetically but it declares load order 20, so the engine runs its handlers after loadorder2.ts (order 10); under Skript the filename order wins and this script's handlers run first. The pair pins the difference.

import {
  chatMessage,
  command,
  deleteVar,
  equals,
  fmt,
  ifElse,
  listAdd,
  listVar,
  loadOrder,
  loopList,
  loopValue,
  onChat,
  player,
  script,
  send,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

export const loadorder1Script: Script = loadOrder(
  20,
  script(
    onChat([
      ifElse(equals(chatMessage(), str("orderprobe")), [
        listAdd(listVar("loadorderprobe"), str("second")),
      ]),
    ]),
    command("orderreset", null, [
      deleteVar(listVar("loadorderprobe")),
      send(player(), str("orderreset: done")),
    ]),
    command("orderread", null, [
      loopList(listVar("loadorderprobe"), [send(player(), fmt("order: ", loopValue()))]),
    ]),
  ),
);
