import type { Script } from "../src/index.js";
import {
  addEntityTag,
  attributeOf,
  broadcast,
  command,
  customNameOf,
  customNameVisible,
  equipmentOf,
  fmt,
  hasAi,
  hasEntityTag,
  ifElse,
  item,
  lastSpawnedEntity,
  locationOf,
  num,
  player,
  removeEntityTag,
  script,
  send,
  setAi,
  setAttribute,
  setCustomName,
  setCustomNameVisible,
  setEquipment,
  setVelocity,
  spawnEntity,
  str,
  toolOf,
  velocityComponentOf,
} from "../src/index.js";

// Entity equipment, custom name, AI, scoreboard tags, general
// attributes and velocity (ext-entity wave, feedback D). All
// core language: the same script runs under Skript (as the
// emitted .sk) and under the engine jar.
//
// Commands:
//   /entmake    spawn a zombie at the player, freeze its AI,
//               dress it (iron helmet / chestplate / sword),
//               name it "Boss Zombie", tag it "boss" and set
//               its attack damage / armor attributes
//   /entcheck   read everything back in one line, plus the
//               hasEntityTag / hasAi branches
//   /entvel     launch the zombie straight up and read its
//               velocity components back in the same trigger
//   /entstrip   rename it, drop the tag, read back again
//   /enthand    compare the player's main hand through
//               toolOf and through equipmentOf(..., "mainhand")

const entmake = command("entmake", null, [
  spawnEntity("zombie", locationOf(player())),
  setAi(lastSpawnedEntity(), false),
  setEquipment(lastSpawnedEntity(), "helmet", item("iron helmet")),
  setEquipment(lastSpawnedEntity(), "chestplate", item("iron chestplate")),
  setEquipment(lastSpawnedEntity(), "mainhand", item("iron sword")),
  setCustomName(lastSpawnedEntity(), str("Boss Zombie")),
  setCustomNameVisible(lastSpawnedEntity(), true),
  addEntityTag(lastSpawnedEntity(), "boss"),
  setAttribute(lastSpawnedEntity(), "attack damage", num(5)),
  setAttribute(lastSpawnedEntity(), "armor", num(2)),
  broadcast(str("entmade")),
]);

const entcheck = command("entcheck", null, [
  broadcast(
    fmt(
      "entcheck: helmet=",
      equipmentOf(lastSpawnedEntity(), "helmet"),
      " chest=",
      equipmentOf(lastSpawnedEntity(), "chestplate"),
      " hand=",
      equipmentOf(lastSpawnedEntity(), "mainhand"),
      " off=",
      equipmentOf(lastSpawnedEntity(), "offhand"),
      " boots=",
      equipmentOf(lastSpawnedEntity(), "boots"),
      " name=",
      customNameOf(lastSpawnedEntity()),
      " dmg=",
      attributeOf(lastSpawnedEntity(), "attack damage"),
      " armor=",
      attributeOf(lastSpawnedEntity(), "armor"),
      " maxhp=",
      attributeOf(lastSpawnedEntity(), "max health"),
    ),
  ),
  ifElse(
    hasEntityTag(lastSpawnedEntity(), "boss"),
    [broadcast(str("entcheck: tag=boss"))],
    [broadcast(str("entcheck: tag=none"))],
  ),
  ifElse(
    hasAi(lastSpawnedEntity()),
    [broadcast(str("entcheck: ai=on"))],
    [broadcast(str("entcheck: ai=off"))],
  ),
  ifElse(
    customNameVisible(lastSpawnedEntity()),
    [broadcast(str("entcheck: vis=on"))],
    [broadcast(str("entcheck: vis=off"))],
  ),
]);

const entvel = command("entvel", null, [
  setVelocity(lastSpawnedEntity(), num(0), num(0.5), num(0)),
  broadcast(
    fmt(
      "entvel: vx=",
      velocityComponentOf(lastSpawnedEntity(), "x"),
      " vy=",
      velocityComponentOf(lastSpawnedEntity(), "y"),
      " vz=",
      velocityComponentOf(lastSpawnedEntity(), "z"),
    ),
  ),
]);

const entstrip = command("entstrip", null, [
  setCustomName(lastSpawnedEntity(), str("Renamed")),
  removeEntityTag(lastSpawnedEntity(), "boss"),
  broadcast(fmt("entstrip: name=", customNameOf(lastSpawnedEntity()))),
  ifElse(
    hasEntityTag(lastSpawnedEntity(), "boss"),
    [broadcast(str("entstrip: tag=boss"))],
    [broadcast(str("entstrip: tag=none"))],
  ),
]);

const enthand = command("enthand", null, [
  send(
    player(),
    fmt("enthand: tool=", toolOf(player()), " equip=", equipmentOf(player(), "mainhand")),
  ),
]);

export const entityScript: Script = script(entmake, entcheck, entvel, entstrip, enthand);
