import {
  broadcast,
  command,
  launchFirework,
  locationOf,
  player,
  script,
  spawnParticle,
  str,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// Particles & fireworks (feedback D). This script is engine-only:
// the real Skript 2.17.1 has no native particle or firework effect
// (probed — every candidate form is a parse error), so both
// statements live in the skript-ts engine jar on the Bukkit API.
// There is no .sk form of this file; the build emits only
// particles.ir.json and Skript-mode deployment skips it.
//
// Both effects are fire-and-forget visuals: the statements have
// no result and never fail a script — an unknown particle name is
// a warned no-op in the engine, and a firework option the engine
// cannot use is skipped or defaulted (see docs/reference.md).
//
// Commands:
//   /particles        flame burst + a single heart at the player
//   /firework         a large red/green flickering ball firework
//   /fireworkdefault  a firework with every option defaulted
//                     (white ball, power 1, no flicker/trail)
export const particlesScript: Script = script(
  command("particles", null, [
    spawnParticle("FLAME", locationOf(player()), 10),
    spawnParticle("HEART", locationOf(player())),
    broadcast(str("particles spawned")),
  ]),
  command("firework", null, [
    launchFirework(locationOf(player()), {
      power: 1,
      colors: ["#FF0000", "#00FF00"],
      type: "BALL_LARGE",
      flicker: true,
      trail: true,
    }),
    broadcast(str("firework launched")),
  ]),
  command("fireworkdefault", null, [
    launchFirework(locationOf(player())),
    broadcast(str("default firework launched")),
  ]),
);
