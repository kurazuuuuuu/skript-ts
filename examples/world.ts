import type { Script } from "../src/index.js";
import {
  script,
  every,
  command,
  add,
  broadcast,
  fmt,
  variable,
  localVar,
  set,
  send,
  player,
  worldOf,
  worldTime,
  worldWeather,
  clockTime,
  setWorldTime,
  setWorldWeather,
  locationOf,
  offsetLocation,
  blockAt,
  relativeBlock,
  setBlockAt,
  item,
  typeOf,
  xOf,
  yOf,
  zOf,
  num,
  str,
} from "../src/index.js";

// World operations and periodical events (phase 18). Note the
// pattern used throughout: the phase-18 expressions are computed
// into local variables first and the variables are interpolated
// into messages — Skript 2.17.1 does not parse these composite
// expressions inside string interpolations (probed; see the
// development log).

// A heartbeat every 3 seconds: the periodical trigger. The body
// has no event context, only globals and its own locals.
const heartbeat = every(3, "seconds", [
  add(variable("heartbeats"), num(1)),
  broadcast(fmt("[world] heartbeat ", variable("heartbeats"))),
]);

// /wstat: report the player's world, its clock and its weather.
const wstat = command("wstat", null, [
  set(localVar("w"), worldOf(player())),
  set(localVar("t"), worldTime(localVar("w"))),
  set(localVar("x"), worldWeather(localVar("w"))),
  send(player(), fmt("world=", localVar("w"), " time=", localVar("t"), " weather=", localVar("x"))),
]);

// /wday and /wnight: set the player's world's clock.
const wday = command("wday", null, [
  set(localVar("w"), worldOf(player())),
  setWorldTime(localVar("w"), clockTime("6:00")),
  send(player(), str("morning")),
]);

const wnight = command("wnight", null, [
  set(localVar("w"), worldOf(player())),
  setWorldTime(localVar("w"), clockTime("0:00")),
  send(player(), str("midnight")),
]);

// /wcalm and /wstorm: set the player's world's weather.
const wcalm = command("wcalm", null, [
  set(localVar("w"), worldOf(player())),
  setWorldWeather(localVar("w"), "clear"),
  send(player(), str("calm")),
]);

const wstorm = command("wstorm", null, [
  set(localVar("w"), worldOf(player())),
  setWorldWeather(localVar("w"), "thunder"),
  send(player(), str("storm")),
]);

// /wbuild: place a stone two blocks east of the player and a
// gold block on top of it, then report what stands there.
const wbuild = command("wbuild", null, [
  set(localVar("base"), locationOf(player())),
  set(localVar("spot"), offsetLocation(localVar("base"), num(2), num(0), num(0))),
  setBlockAt(localVar("spot"), item("stone")),
  set(localVar("b"), blockAt(localVar("spot"))),
  set(localVar("up"), relativeBlock(localVar("b"), "above")),
  setBlockAt(locationOf(localVar("up")), item("gold block")),
  set(localVar("t1"), typeOf(blockAt(localVar("spot")))),
  set(localVar("t2"), typeOf(localVar("up"))),
  send(player(), fmt("built ", localVar("t1"), " + ", localVar("t2"))),
]);

// /wraze: clear the two blocks /wbuild placed.
const wraze = command("wraze", null, [
  set(localVar("base"), locationOf(player())),
  set(localVar("spot"), offsetLocation(localVar("base"), num(2), num(0), num(0))),
  setBlockAt(localVar("spot"), item("air")),
  set(localVar("b"), blockAt(localVar("spot"))),
  set(localVar("up"), relativeBlock(localVar("b"), "above")),
  setBlockAt(locationOf(localVar("up")), item("air")),
  send(player(), str("cleared")),
]);

// /wpos: report the player's coordinates.
const wpos = command("wpos", null, [
  set(localVar("l"), locationOf(player())),
  set(localVar("x"), xOf(localVar("l"))),
  set(localVar("y"), yOf(localVar("l"))),
  set(localVar("z"), zOf(localVar("l"))),
  send(player(), fmt("pos=", localVar("x"), ",", localVar("y"), ",", localVar("z"))),
]);

export const worldScript: Script = script(
  heartbeat,
  wstat,
  wday,
  wnight,
  wcalm,
  wstorm,
  wbuild,
  wraze,
  wpos,
);
