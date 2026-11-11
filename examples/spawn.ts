import type { Script } from "../src/index.js";
import {
  script,
  command,
  set,
  variable,
  locationOf,
  player,
  send,
  str,
  teleport,
  onQuit,
  broadcast,
  fmt,
  eventPlayer,
} from "../src/index.js";

const A = command("setspawn", null, [
  set(variable("spawn"), locationOf(player())),
  send(player(), str("スポーン地点を設定しました")),
]);

const B = command("spawn", null, [teleport(player(), variable("spawn"))]);

const C = onQuit([broadcast(fmt("", eventPlayer(), " さんが退出しました"))]);

export const spawnScript: Script = script(A, B, C);
