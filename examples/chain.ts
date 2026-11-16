import type { Script } from "../src/index.js";
import {
  script,
  command,
  onJoin,
  onChat,
  broadcast,
  fmt,
  send,
  set,
  str,
  player,
  variable,
  playerVar,
  ifElse,
  chatMessage,
  levelOf,
  x,
  xPlayerVar,
} from "../src/index.js";

// Method chains (feedback E8): this program is written with the
// ExprChain wrapper (x(...) entry, condition methods terminal,
// unwrap() where a plain Expr is needed). The identical program
// written with the plain functional builders lives in
// tests/chainfunctional.ts (a test twin, not a deployable
// example); both build the identical AST, so they emit
// byte-identical .sk (pinned by the golden fixture and by
// tests/chain.test.ts).
//
// Flows exercised:
//   on join        -> the motivating read -> compare flow: the
//                     per-player mining level (a playerVar read)
//                     chained straight into gte(10)
//   /chainstats    -> state reads (health, level) chained into
//                     arithmetic for a bonus, reported with fmt()
//   on chat        -> a chat text chained through upper() and
//                     length() into a comparison

const miningLevel = playerVar("mining_level");

export const chainScript: Script = script(
  onJoin([
    ifElse(xPlayerVar(miningLevel, player()).gte(10), [send(player(), str("mining rank: expert"))]),
  ]),
  command("chainstats", null, [
    set(variable("bonus"), x(levelOf(player())).times(10).plus(5).unwrap()),
    send(player(), fmt("hp=", x(player()).health().unwrap(), " bonus=", variable("bonus"))),
    ifElse(x(player()).health().lt(5), [broadcast(str("someone is low on health"))]),
  ]),
  onChat([
    ifElse(x(chatMessage()).length().gt(10), [
      broadcast(fmt("shout: ", x(chatMessage()).upper().unwrap())),
    ]),
  ]),
);
