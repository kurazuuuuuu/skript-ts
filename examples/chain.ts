import type { Script } from "../src/index.js";
import {
  script,
  command,
  onJoin,
  broadcast,
  fmt,
  send,
  set,
  str,
  num,
  player,
  variable,
  playerVar,
  ifElse,
  chatMessage,
  healthOf,
  levelOf,
  plus,
  times,
  greaterOrEqual,
  greaterThan,
  lessThan,
  textLength,
  upperCase,
  x,
  xPlayerVar,
} from "../src/index.js";

// Method chains (feedback E8): the same program written twice —
// once with the ExprChain wrapper (x(...) entry, condition methods
// terminal, unwrap() where a plain Expr is needed) and once with
// the plain functional builders. Both scripts build the identical
// AST, so they emit byte-identical .sk (pinned by the golden
// fixture and by tests/chain.test.ts).
//
// Flows exercised:
//   on join        -> the motivating read -> compare flow: the
//                     per-player mining level (a playerVar read)
//                     chained straight into gte(10)
//   /chainstats    -> state reads (health, level) chained into
//                     arithmetic for a bonus, reported with fmt()
//   /chainshout    -> a chat text chained through upper() and
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
  command("chainshout", null, [
    ifElse(x(chatMessage()).length().gt(10), [
      broadcast(fmt("shout: ", x(chatMessage()).upper().unwrap())),
    ]),
  ]),
);

export const chainFunctionalScript: Script = script(
  onJoin([
    ifElse(greaterOrEqual(miningLevel.of(player()), num(10)), [
      send(player(), str("mining rank: expert")),
    ]),
  ]),
  command("chainstats", null, [
    set(variable("bonus"), plus(times(levelOf(player()), num(10)), num(5))),
    send(player(), fmt("hp=", healthOf(player()), " bonus=", variable("bonus"))),
    ifElse(lessThan(healthOf(player()), num(5)), [broadcast(str("someone is low on health"))]),
  ]),
  command("chainshout", null, [
    ifElse(greaterThan(textLength(chatMessage()), num(10)), [
      broadcast(fmt("shout: ", upperCase(chatMessage()))),
    ]),
  ]),
);
