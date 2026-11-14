import {
  broadcast,
  command,
  fmt,
  onJoin,
  player,
  script,
  send,
  set,
  t,
  variable,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Tagged-template sample (feedback E5): t`` is sugar over fmt().
// It builds the same format node, so this sample's .sk output is
// exactly what the fmt()-written equivalents would emit —
// expression interpolations become expression parts, while
// string / number / boolean interpolations merge into the
// adjacent literal text. Entirely core constructs, so it runs
// under both runtimes.
//
//   (join)          "&aWelcome, <player>!" to the joining
//                   player, and a join broadcast
//   /reward         a merged-literal demo: the string "Bonus",
//                   the number 25 and the boolean true all land
//                   in the literal text around an expression
//   /nested         t`` inside fmt() and fmt() inside t`` —
//                   formats flatten into the enclosing string
//                   either way
export const taggedScript: Script = script(
  onJoin([
    send(player(), t`&aWelcome, ${player()}!`),
    broadcast(t`&e${player()} &fjoined the server`),
  ]),
  command("reward", null, [
    send(player(), t`&a${"Bonus"} &f+${25} XP`),
    broadcast(t`&a${player()} &fearned ${variable("xp")} XP (bonus: ${true})`),
    set(variable("lastReward"), t`&a${player()} &f+${25} XP`),
  ]),
  command("nested", null, [
    send(player(), fmt("&7[", t`&a${player()}`, "]")),
    broadcast(fmt("outer ", t`inner ${player()}`)),
    send(player(), t`wrap ${fmt("inner ", player())} end`),
  ]),
);
