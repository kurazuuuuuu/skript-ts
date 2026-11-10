import type { Script } from "../src/index.js";
import {
  attacker,
  broadcast,
  call,
  cancelEvent,
  damageAmount,
  damageCause,
  defineFunction,
  dividedBy,
  equals,
  eventBlock,
  eventItem,
  fmt,
  ifElse,
  item,
  localVar,
  num,
  onBlockBreak,
  onBlockPlace,
  onDamage,
  onLeftClick,
  onRightClick,
  param,
  player,
  returnValue,
  script,
  setDamage,
  str,
  typeOf,
  victim,
} from "../src/index.js";

// Core-language sample (phase 14): gameplay events — block break /
// place, right / left click, damage — with their event values
// (event block / item, victim / attacker, damage amount / cause),
// event control (cancel event, set damage), and the block / item /
// entity function parameter types. Entirely core constructs, so
// it runs under both runtimes: dirt cannot be broken and stone
// cannot be placed (both are cancelled), clicks are announced, and
// damage is reported — ShieldBot takes no damage at all and
// HalfBot takes half.
export const gameplayScript: Script = script(
  // The label functions return "object", not "text": Skript's
  // type-of yields a type value, which a text-typed function may
  // not return (a load-time error on the real Skript); it prints
  // as the type's name when interpolated into a string.
  defineFunction("blockLabel", [param("b", "block")], "object", [
    returnValue(typeOf(localVar("b"))),
  ]),
  defineFunction("itemLabel", [param("i", "item")], "object", [
    returnValue(typeOf(localVar("i"))),
  ]),
  defineFunction("entityLabel", [param("e", "entity")], "text", [
    returnValue(fmt(localVar("e"))),
  ]),
  onBlockBreak([
    ifElse(
      equals(typeOf(eventBlock()), item("dirt")),
      [
        broadcast(fmt("break blocked for ", player())),
        cancelEvent(),
      ],
      [
        broadcast(
          fmt(
            player(),
            " broke ",
            call("blockLabel", eventBlock()),
            " (block item: ",
            call("itemLabel", eventItem()),
            ")",
          ),
        ),
      ],
    ),
  ]),
  onBlockPlace([
    ifElse(
      equals(typeOf(eventItem()), item("stone")),
      [
        broadcast(fmt("place blocked for ", player())),
        cancelEvent(),
      ],
      [
        broadcast(
          fmt(
            player(),
            " placed ",
            call("blockLabel", eventBlock()),
            " from ",
            call("itemLabel", eventItem()),
          ),
        ),
      ],
    ),
  ]),
  onRightClick([
    broadcast(
      fmt(
        player(),
        " right clicked ",
        call("blockLabel", eventBlock()),
        " with ",
        call("itemLabel", eventItem()),
      ),
    ),
  ]),
  onLeftClick([
    broadcast(
      fmt(
        player(),
        " left clicked ",
        call("blockLabel", eventBlock()),
        " with ",
        call("itemLabel", eventItem()),
      ),
    ),
  ]),
  onDamage([
    broadcast(
      fmt(
        call("entityLabel", victim()),
        " was hurt by ",
        call("entityLabel", attacker()),
        ": ",
        damageAmount(),
        " damage (",
        damageCause(),
        ")",
      ),
    ),
    ifElse(
      equals(fmt(victim()), str("ShieldBot")),
      [cancelEvent(), broadcast(fmt("shielded ", victim()))],
      [
        ifElse(equals(fmt(victim()), str("HalfBot")), [
          setDamage(dividedBy(damageAmount(), num(2))),
        ]),
      ],
    ),
  ]),
);
