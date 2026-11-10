import type { Script } from "../src/index.js";
import { script, onDeath, add, variable, victim, num, send, fmt } from "../src/index.js";

export const deathScript: Script = script(
  onDeath([
    add(variable("deaths", victim()), num(1)),
    send(victim(), fmt("死亡回数は ", variable("deaths", victim()), " 回です")),
  ]),
);