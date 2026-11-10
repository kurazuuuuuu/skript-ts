import { script, onFirstJoin, onJoin, broadcast, fmt, player, give, set, variable, bool, send } from "../src/index.js";
import type { Script } from "../src/index.js";

export const welcomeScript: Script = script(
  onFirstJoin([
    broadcast(fmt("ようこそ ", player(), " さん、初めての参加です！")),
    give(player(), "wooden sword", 1),
    set(variable("welcomed", player()), bool(true)),
  ]),
  onJoin([
    send(player(), fmt("おかえりなさい、", player(), " さん")),
  ])
);