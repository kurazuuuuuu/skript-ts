import type { Script } from "../src/index.js";
import {
  add,
  broadcast,
  cancelEvent,
  command,
  fmt,
  ifElse,
  onMove,
  player,
  script,
  send,
  set,
  str,
  variable,
  equals,
} from "../src/index.js";

// Move event (ext-events U2): core language — the original's
// `on player move:` (probed against the real Skript 2.17.1:
// it fires on every position change, never for look-only
// changes, and it is cancellable). This sample counts moves
// in a global counter; /movecount reports it, and the
// /movefreeze toggle makes the handler cancel every move
// while it is on (a cancelled teleport / walk simply does
// not happen).
export const moveScript: Script = script(
  onMove([
    add(variable("extmove::count"), 1),
    ifElse(equals(variable("extmove::frozen"), true), [cancelEvent()]),
  ]),
  command("movecount", null, [send(player(), fmt("moves ", variable("extmove::count")))]),
  command("movefreeze", null, [
    ifElse(
      equals(variable("extmove::frozen"), true),
      [set(variable("extmove::frozen"), false), broadcast(str("moves unfrozen"))],
      [set(variable("extmove::frozen"), true), broadcast(str("moves frozen"))],
    ),
  ]),
);
