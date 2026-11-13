import {
  blockLine,
  command,
  cuboid,
  cylinder,
  item,
  locationOf,
  localVar,
  noiseFill,
  num,
  offsetLocation,
  paint,
  player,
  script,
  send,
  set,
  sphere,
  str,
  uniformFill,
  mixFill,
} from "../src/index.js";
import type { Script } from "../src/index.js";

// World paint (engine-only): shapes composed with fills, written
// as one bulk operation by the engine. There is no .sk form — the
// build emits only paint.ir.json and Skript-mode deployment skips
// this file.
//
// Every command anchors at the caller's feet (the pattern the
// world sample uses), so the painted geometry lands at known
// offsets from the player:
//
//   /paintfloor   5x1x5 floor underfoot, noise-mixed dirt/gravel
//                 (seed 7)
//   /paintfloor2  the same floor with seed 8 — a different mix
//   /paintmix     the same floor, weight-mixed dirt/gravel
//   /paintwall    a 1x4x5 stone-brick wall two blocks east
//   /painttrim    repaint the wall gold, replacing glass only
//                 (the wall holds no glass, so nothing changes)
//   /paintgild    repaint the wall gold, replacing stone bricks
//   /paintline    a rising gold line east and north
//   /paintball    a glass sphere of radius 2, four blocks up
//   /painttower   a cobblestone cylinder, radius 1, 3 layers

const floorShape = () =>
  cuboid(
    offsetLocation(locationOf(player()), num(-2), num(-1), num(-2)),
    offsetLocation(locationOf(player()), num(2), num(-1), num(2)),
  );

const wallShape = () =>
  cuboid(
    offsetLocation(locationOf(player()), num(3), num(0), num(-2)),
    offsetLocation(locationOf(player()), num(3), num(3), num(2)),
  );

export const paintScript: Script = script(
  command("paintfloor", null, [
    paint(
      floorShape(),
      noiseFill(item("dirt"), item("gravel"), { scale: 2, amount: 0.4, seed: 7 }),
    ),
    send(player(), str("paint floor done")),
  ]),
  command("paintfloor2", null, [
    paint(
      floorShape(),
      noiseFill(item("dirt"), item("gravel"), { scale: 2, amount: 0.4, seed: 8 }),
    ),
    send(player(), str("paint floor2 done")),
  ]),
  command("paintmix", null, [
    paint(
      floorShape(),
      mixFill(
        [
          [item("dirt"), 3],
          [item("gravel"), 1],
        ],
        7,
      ),
    ),
    send(player(), str("paint mix done")),
  ]),
  command("paintwall", null, [
    paint(wallShape(), uniformFill(item("stone bricks"))),
    send(player(), str("paint wall done")),
  ]),
  command("painttrim", null, [
    paint(wallShape(), uniformFill(item("gold block")), { replace: item("glass") }),
    send(player(), str("paint trim done")),
  ]),
  command("paintgild", null, [
    paint(wallShape(), uniformFill(item("gold block")), { replace: item("stone bricks") }),
    send(player(), str("paint gild done")),
  ]),
  command("paintline", null, [
    paint(
      blockLine(
        offsetLocation(locationOf(player()), num(2), num(1), num(-3)),
        offsetLocation(locationOf(player()), num(6), num(4), num(-3)),
      ),
      uniformFill(item("gold block")),
    ),
    send(player(), str("paint line done")),
  ]),
  command("paintball", null, [
    set(localVar("c"), offsetLocation(locationOf(player()), num(-4), num(3), num(0))),
    paint(sphere(localVar("c"), num(2)), uniformFill(item("glass"))),
    send(player(), str("paint ball done")),
  ]),
  command("painttower", null, [
    set(localVar("c"), offsetLocation(locationOf(player()), num(-3), num(0), num(3))),
    paint(cylinder(localVar("c"), num(1), num(3)), uniformFill(item("cobblestone"))),
    send(player(), str("paint tower done")),
  ]),
);
