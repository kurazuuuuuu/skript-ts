import type { Script } from "../src/index.js";
import {
  broadcast,
  cancelEvent,
  clickedEntity,
  damageCause,
  eventBlock,
  eventItem,
  fmt,
  onBedEnter,
  onBedLeave,
  onBlockBreak,
  onBlockPlace,
  onDamage,
  onDrop,
  onLeftClick,
  onPickup,
  onRespawn,
  onRightClick,
  player,
  script,
  typeOf,
  victim,
} from "../src/index.js";

// Core-language sample (phase 16): event expansion, slice 2 —
// filtered event forms, the clicked entity, and the pickup /
// drop / respawn / bed events. Entirely core constructs, so it
// runs under both runtimes: only stone-family breaks and
// cobblestone placements are announced (the unfiltered sample
// announces the rest), damage is reported per participant type,
// villagers and stone blocks have their own click handlers,
// wheat pickups are singled out, compasses cannot be dropped,
// and respawns and bed use are announced.
export const events2Script: Script = script(
  // Filtered forms: the "of" slot names the block types.
  onBlockBreak([broadcast(fmt("filtered break ", typeOf(eventBlock()), " by ", player()))], {
    block: ["stone", "cobblestone"],
  }),
  onBlockPlace([broadcast(fmt("filtered place ", typeOf(eventBlock()), " by ", player()))], {
    block: "cobblestone",
  }),
  // Damage filters: victim-only, victim + attacker, and a
  // non-player victim. An attacker slot on environmental damage
  // (a fall) simply does not match.
  onDamage([broadcast(fmt("player victim (", damageCause(), ")"))], { victim: "player" }),
  onDamage([broadcast(fmt("zombie attack on ", victim()))], {
    victim: "player",
    attacker: "zombie",
  }),
  onDamage([broadcast(fmt("zombie victim (", damageCause(), ")"))], { victim: "zombie" }),
  // Click filters: the entity target (with the clicked-entity
  // value), the block target, and the item in hand.
  onRightClick(
    [
      broadcast(
        fmt("entity click ", typeOf(clickedEntity()), " / ", clickedEntity(), " by ", player()),
      ),
    ],
    { entity: "villager" },
  ),
  onRightClick([broadcast(fmt("block click ", typeOf(eventBlock()), " by ", player()))], {
    block: "stone",
  }),
  onLeftClick([broadcast(fmt("stick swing on ", typeOf(eventBlock())))], {
    item: "stick",
  }),
  // Pickup / drop: the bare forms plus an item-filtered form of
  // each. The compass handler cancels, so the compass stays.
  onPickup([broadcast(fmt("picked ", typeOf(eventItem()), " by ", player()))]),
  onPickup([broadcast(fmt("picked filtered ", typeOf(eventItem())))], {
    item: "wheat",
  }),
  onDrop([broadcast(fmt("dropped ", typeOf(eventItem()), " by ", player()))]),
  onDrop([cancelEvent(), broadcast(fmt("drop blocked: ", typeOf(eventItem())))], {
    item: "compass",
  }),
  // Respawn (not cancellable) and the bed events.
  onRespawn([broadcast(fmt(player(), " respawned"))]),
  onBedEnter([broadcast(fmt(player(), " entered bed"))]),
  onBedLeave([broadcast(fmt(player(), " left bed"))]),
);
