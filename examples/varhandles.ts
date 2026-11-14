import type { Script } from "../src/index.js";
import {
  script,
  command,
  onJoin,
  defineFunction,
  param,
  localVar,
  playerVar,
  localHandle,
  call,
  returnValue,
  plus,
  argument,
  send,
  fmt,
  num,
  player,
} from "../src/index.js";

// Typed variable handles (feedback E6 / E7): pure API sugar over
// variable(name, player) / localVar(name). The handles centralize
// the key construction — {balance::%player%} is built in exactly
// one place, and the {_bonus} local inside applyBonus likewise.
//
// Economy flow:
//   on join          -> balance is set to 100 through the handle
//   /balance         -> reads the balance back through the handle
//   /earn <integer>  -> adds to the balance through the handle
//   /spend <integer> -> removes from the balance through the handle
//   /clearbalance    -> deletes the player's slot through the handle
//   /bonus           -> a function whose local scratch variable is
//                       a localHandle: base 100 + scratch (10 + 5)
//                       reports 115

const balance = playerVar("balance");

const bonusScratch = localHandle("bonus");

export const varhandlesScript: Script = script(
  onJoin([balance.set(player(), 100), send(player(), fmt("balance=", balance.of(player())))]),
  defineFunction("applyBonus", [param("base", "number")], "number", [
    bonusScratch.set(10),
    bonusScratch.add(5),
    returnValue(plus(localVar("base"), bonusScratch.get())),
  ]),
  command("balance", null, [send(player(), fmt("balance=", balance.of(player())))]),
  command("earn", "integer", [
    balance.add(player(), argument(1)),
    send(player(), fmt("balance=", balance.of(player()))),
  ]),
  command("spend", "integer", [
    balance.remove(player(), argument(1)),
    send(player(), fmt("balance=", balance.of(player()))),
  ]),
  command("clearbalance", null, [
    balance.delete(player()),
    send(player(), fmt("balance=", balance.of(player()))),
  ]),
  command("bonus", null, [send(player(), fmt("bonus=", call("applyBonus", num(100))))]),
);
