import type { Script } from "../src/index.js";
import {
  script,
  command,
  broadcast,
  fmt,
  localVar,
  set,
  send,
  str,
  num,
  player,
  healthOf,
  maxHealthOf,
  foodLevelOf,
  saturationOf,
  gameModeOf,
  experienceOf,
  levelOf,
  setHealth,
  setMaxHealth,
  setFoodLevel,
  setSaturation,
  setGameMode,
  setExperience,
  setLevel,
  heal,
  addTo,
  applyPotion,
  removePotion,
  spawnEntity,
  lastSpawnedEntity,
  typeOf,
  locationOf,
  dropItem,
  withAmount,
  item,
  playSound,
} from "../src/index.js";

// Player / entity state and effects (phase 19). Units follow
// the original: health and max health in hearts, food level in
// drumsticks, saturation unscaled, experience as total points.

// /ststat: report the player's whole state line.
const ststat = command("ststat", null, [
  send(
    player(),
    fmt(
      "hp=", healthOf(player()), "/", maxHealthOf(player()),
      " food=", foodLevelOf(player()), " sat=", saturationOf(player()),
      " gm=", gameModeOf(player()),
      " xp=", experienceOf(player()), " lv=", levelOf(player()),
    ),
  ),
]);

// /stset: set health, food and saturation in one go.
const stset = command("stset", null, [
  setHealth(player(), num(6)),
  setFoodLevel(player(), num(4)),
  setSaturation(player(), num(2.5)),
  send(player(), str("set done")),
]);

// /stheal: drop to 3 hearts, heal 2 back, report.
const stheal = command("stheal", null, [
  setHealth(player(), num(3)),
  heal(player(), num(2)),
  send(player(), fmt("hp=", healthOf(player()))),
]);

// /stgm: switch to creative, report, switch back.
const stgm = command("stgm", null, [
  setGameMode(player(), "creative"),
  send(player(), fmt("gm=", gameModeOf(player()))),
]);

const stgmback = command("stgmback", null, [
  setGameMode(player(), "survival"),
  send(player(), fmt("gm=", gameModeOf(player()))),
]);

// /stxp: set the total experience to 50, add 41 more (91 is
// exactly level 7), then set the level alone to 2 — the total
// re-derives from the level and the preserved progress (0), so
// it reads 16.
const stxp = command("stxp", null, [
  setExperience(player(), num(50)),
  send(player(), fmt("xp=", experienceOf(player()), " lv=", levelOf(player()))),
  addTo(experienceOf(player()), num(41)),
  send(player(), fmt("xp=", experienceOf(player()), " lv=", levelOf(player()))),
  setLevel(player(), num(2)),
  send(player(), fmt("xp=", experienceOf(player()), " lv=", levelOf(player()))),
]);

// /stxpfrac: set the total to 47 (level 4 with progress
// 7/15), then set only the level to 2 — the progress fraction
// is preserved, so the total reads 16 + 5 = 21.
const stxpfrac = command("stxpfrac", null, [
  setExperience(player(), num(47)),
  setLevel(player(), num(2)),
  send(player(), fmt("xp=", experienceOf(player()), " lv=", levelOf(player()))),
]);

// /stmax: raise the max health to 15 hearts, heal to full,
// report; /stmaxback restores the defaults.
const stmax = command("stmax", null, [
  setMaxHealth(player(), num(15)),
  heal(player()),
  send(player(), fmt("hp=", healthOf(player()), "/", maxHealthOf(player()))),
]);

const stmaxback = command("stmaxback", null, [
  setMaxHealth(player(), num(10)),
  setHealth(player(), num(10)),
  send(player(), fmt("hp=", healthOf(player()), "/", maxHealthOf(player()))),
]);

// /stfx: regeneration for a few seconds from 5 hearts.
// /stpoison: poison for 10 seconds; /stcure removes it.
const stfx = command("stfx", null, [
  setHealth(player(), num(5)),
  applyPotion(player(), "regeneration", { durationSeconds: 6 }),
  send(player(), str("regen applied")),
]);

const stpoison = command("stpoison", null, [
  applyPotion(player(), "poison", { durationSeconds: 10 }),
  send(player(), str("poison applied")),
]);

const stcure = command("stcure", null, [
  removePotion(player(), "poison"),
  send(player(), str("poison removed")),
]);

// /stinstant: instant health from 5 hearts.
const stinstant = command("stinstant", null, [
  setHealth(player(), num(5)),
  applyPotion(player(), "instant health"),
  send(player(), str("instant applied")),
]);

// /stspawn: spawn a zombie and two cows at the player and
// report the type of the last spawned entity.
const stspawn = command("stspawn", null, [
  spawnEntity("zombie", locationOf(player())),
  spawnEntity("cow", locationOf(player()), 2),
  set(localVar("t"), typeOf(lastSpawnedEntity())),
  broadcast(fmt("last=", localVar("t"))),
]);

// /stdrop: drop a diamond at the player's feet.
const stdrop = command("stdrop", null, [
  dropItem(withAmount(item("diamond"), num(1)), locationOf(player())),
  send(player(), str("dropped")),
]);

// /stsound: play a note-block pling at the player.
const stsound = command("stsound", null, [
  playSound("block.note_block.pling", locationOf(player())),
  send(player(), str("sound played")),
]);

export const stateScript: Script = script(
  ststat,
  stset,
  stheal,
  stgm,
  stgmback,
  stxp,
  stxpfrac,
  stmax,
  stmaxback,
  stfx,
  stpoison,
  stcure,
  stinstant,
  stspawn,
  stdrop,
  stsound,
);
