import type { Script } from "../src/index.js";
import {
  attacker,
  broadcast,
  droppedItemEntity,
  eventEntity,
  eventFishingState,
  eventItem,
  fishingHook,
  fishingState,
  fmt,
  hookedEntity,
  ifElse,
  equals,
  itemOfEntity,
  onDeath,
  onEntityDrop,
  onEntityHooked,
  onEntityPickup,
  onFishApproach,
  onFishBite,
  onFishCast,
  onFishCaught,
  onFishEscape,
  onFishReelIn,
  onFishingStateChange,
  onHookInGround,
  script,
  str,
  typeOf,
  victim,
} from "../src/index.js";

// Core-language sample (phase 22): event generalization —
// death for every entity with a victim filter, the entity
// pickup / drop forms, and the fishing sub-events. Entirely
// core constructs, so it runs under both runtimes. Deaths are
// announced per victim kind (the attacker reads as its type:
// "player", "iron golem", or <none> when nothing dealt the
// killing damage), wheat pickups are reported for mobs and
// players alike through the entity form, egg drops are the
// canonical entity drop, and fishing is followed state by
// state — the state-change handler also demonstrates the
// fishing-state literal by singling out the bite.
export const events3Script: Script = script(
  // Filtered death: only zombie and skeleton deaths.
  onDeath([broadcast(fmt("mob death ", typeOf(victim()), " by ", typeOf(attacker())))], {
    victim: ["zombie", "skeleton"],
  }),
  // Filtered death: players, with the attacker kind read back.
  onDeath([broadcast(fmt("player died (attacker: ", typeOf(attacker()), ")"))], {
    victim: "player",
  }),
  // Entity pickup, item-filtered: fires for mobs and players.
  onEntityPickup(
    [broadcast(fmt("entity picked ", typeOf(eventItem()), " by ", typeOf(eventEntity())))],
    { item: "wheat" },
  ),
  // Entity drop: any non-player drop, with the dropped stack
  // read off the dropped-item entity itself.
  onEntityDrop([
    broadcast(
      fmt(
        "entity dropped ",
        typeOf(itemOfEntity(droppedItemEntity())),
        " by ",
        typeOf(eventEntity()),
      ),
    ),
  ]),
  // Fishing sub-events, one per state that has a header.
  onFishCast([broadcast(fmt("fish cast (hook: ", typeOf(fishingHook()), ")"))]),
  onFishApproach([broadcast(str("fish approaching"))]),
  onFishBite([broadcast(str("fish bite"))]),
  onFishCaught([broadcast(fmt("fish caught: ", typeOf(itemOfEntity(eventEntity()))))]),
  onEntityHooked([broadcast(fmt("hooked ", typeOf(hookedEntity())))]),
  onHookInGround([broadcast(str("hook in ground"))]),
  onFishEscape([broadcast(str("fish escaped"))]),
  onFishReelIn([broadcast(str("reel in"))]),
  // The state-change event fires for every state; the bite is
  // singled out through the fishing-state literal comparison.
  onFishingStateChange([
    broadcast(fmt("fish state ", eventFishingState())),
    ifElse(equals(eventFishingState(), fishingState("bite")), [
      broadcast(str("bite confirmed via state")),
    ]),
  ]),
);
