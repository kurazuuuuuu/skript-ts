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
} from "../src/index.js";

// Method chains (feedback E8): the functional-builder twin of
// examples/chain.ts — the same program written without the
// ExprChain wrapper. Both build the identical AST and emit
// byte-identical .sk (pinned by tests/chain.test.ts). This twin
// lives under tests/ (not examples/) because it is a test
// artifact: deployed side by side, the two scripts would define
// the same commands twice.

const miningLevel = playerVar("mining_level");

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
  onChat([
    ifElse(greaterThan(textLength(chatMessage()), num(10)), [
      broadcast(fmt("shout: ", upperCase(chatMessage()))),
    ]),
  ]),
);
