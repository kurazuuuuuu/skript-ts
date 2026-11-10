import type { Script } from "../src/index.js";
import { script, onDeath, add, variable, player, num, send, fmt } from "../src/index.js";

export const deathScript: Script = script(
  onDeath([
    add(variable("deaths", player()), num(1)),
    send(player(), fmt("死亡回数は ", variable("deaths", player()), " 回です")),
  ]),
);