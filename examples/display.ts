import type { Script } from "../src/index.js";
import {
  script,
  command,
  onJoin,
  broadcast,
  fmt,
  set,
  send,
  str,
  num,
  player,
  localVar,
  variable,
  defineFunction,
  param,
  returnValue,
  call,
  add,
  dividedBy,
  timespan,
  sendTitle,
  sendSubtitle,
  sendActionBar,
  clearTitle,
  resetTitle,
  bossBar,
  setBossBarTitle,
  setBossBarColor,
  setBossBarProgress,
  addBossBarViewer,
  removeBossBarViewer,
  bossBarTitleOf,
  bossBarProgressOf,
} from "../src/index.js";

// Display effects and boss bars (phase 21). On join the
// player gets a fully timed title with a subtitle and an
// action bar message; the commands exercise the untimed and
// partially timed title forms, a subtitle-only send, title
// clear / reset, and a boss bar's create / show / progress
// lifecycle (in one trigger, in a local — bars cannot be
// saved, so no variable outlives the command).

const joinDisplay = onJoin([
  sendTitle(player(), str("Welcome Title"), {
    subtitle: str("Welcome Subtitle"),
    fadeIn: { amount: 1, unit: "seconds" },
    stay: { amount: 5, unit: "seconds" },
    fadeOut: { amount: 1, unit: "seconds" },
  }),
  sendActionBar(player(), str("Welcome Action Bar")),
]);

// /dtplain: a title with no timings — the client keeps its
// previous timings (no times packet is sent).
const dtplain = command("dtplain", null, [
  sendTitle(player(), str("Plain Title")),
]);

// /dtstay: only the stay is given — the fade-in / fade-out
// are filled with the defaults (10 / 20 ticks).
const dtstay = command("dtstay", null, [
  sendTitle(player(), str("Stay Title"), { stay: { amount: 5, unit: "seconds" } }),
]);

// /dtsub: a subtitle-only send, with a stay timing.
const dtsub = command("dtsub", null, [
  sendSubtitle(player(), str("Only Subtitle"), { stay: { amount: 5, unit: "seconds" } }),
]);

// /dtclear: show a title, then clear it (timings kept).
const dtclear = command("dtclear", null, [
  sendTitle(player(), str("Clear Me")),
  clearTitle(player()),
]);

// /dtreset: show a title, then reset it (timings reset too).
const dtreset = command("dtreset", null, [
  sendTitle(player(), str("Reset Me")),
  resetTitle(player()),
]);

// /dbar: a standalone action bar message.
const dbar = command("dbar", null, [
  sendActionBar(player(), str("Action Two")),
]);

// /dbshow: the whole boss bar lifecycle in one trigger —
// bars cannot be saved, so the bar lives in a local (the
// original rejects persistent variables holding one at load
// time). Create it red and titled, show it, rename it, halve
// its progress, recolor it blue, and hide it again; each step
// reports back so the flow can be followed in chat.
const dbshow = command("dbshow", null, [
  set(localVar("bar"), bossBar({ title: str("Display Boss"), color: "red" })),
  addBossBarViewer(localVar("bar"), player()),
  broadcast(fmt("boss=", bossBarTitleOf(localVar("bar")), " p=", bossBarProgressOf(localVar("bar")))),
  setBossBarTitle(localVar("bar"), str("Boss Renamed")),
  broadcast(fmt("boss=", bossBarTitleOf(localVar("bar")))),
  setBossBarProgress(localVar("bar"), num(0.5)),
  broadcast(fmt("p=", bossBarProgressOf(localVar("bar")))),
  setBossBarColor(localVar("bar"), "blue"),
  send(player(), str("color set")),
  removeBossBarViewer(localVar("bar"), player()),
  send(player(), str("hidden")),
]);

// /dbfresh: a plain bar with no title or color — the client
// sees the defaults (empty title, full progress, white).
const dbfresh = command("dbfresh", null, [
  set(localVar("bar"), bossBar()),
  addBossBarViewer(localVar("bar"), player()),
  broadcast(fmt("fresh p=", bossBarProgressOf(localVar("bar")))),
  removeBossBarViewer(localVar("bar"), player()),
]);

// /dbcast: a colored broadcast (phase 27, review item R-8).
// The text carries a color code; both runtimes must deliver
// it as formatting, never as a literal "§a" in the chat.
const dbcast = command("dbcast", null, [
  broadcast(str("&aColored News")),
]);

// /dtnum: a title whose stay is a NUMBER variable (phase 27,
// review item R-9 re-derived). A number does not count as a
// title timing in the original, and a specified timing part
// that does not evaluate to a timespan makes the WHOLE send
// a no-op — neither a times packet nor the title text is
// sent (the "a number counts as ticks" rule belongs to
// waitFor only).
const dtnum = command("dtnum", null, [
  set(variable("dtn27"), num(100)),
  sendTitle(player(), str("Num Title"), { stay: variable("dtn27") }),
]);

// /dthalf: a title whose fade-in is half a tick (25 ms),
// computed by timespan division. The original converts a
// timespan to title ticks rounding half DOWN, so the client
// receives a fade-in of 0 ticks (phase 27 probe).
const dthalf = command("dthalf", null, [
  set(localVar("h"), dividedBy(timespan(1, "ticks"), num(2))),
  sendTitle(player(), str("Half Title"), { fadeIn: localVar("h") }),
]);

// Marking functions for /dbord: each call bumps the global
// counter {p27c}, making operand evaluation observable.
const p27markt = defineFunction("p27markt", [param("t", "text")], "text", [
  add(variable("p27c"), num(1)),
  returnValue(str("marked")),
]);
const p27markp = defineFunction("p27markp", [param("p", "player")], "player", [
  add(variable("p27c"), num(1)),
  returnValue(localVar("p")),
]);

// /dbord: the boss bar write family's evaluation and
// missing-value policy (phase 27 probes of the original):
// the non-bar operand is evaluated even when the bar has no
// value (ord1 / ord2 count the marking calls), and progress
// writes with a missing or wrong-typed value are no-ops
// (q1 / q2 keep reading 0.7).
const dbord = command("dbord", null, [
  set(variable("p27c"), num(0)),
  setBossBarTitle(localVar("missing"), call("p27markt", str("x"))),
  broadcast(fmt("ord1=", variable("p27c"))),
  addBossBarViewer(localVar("missing"), call("p27markp", player())),
  broadcast(fmt("ord2=", variable("p27c"))),
  set(localVar("bar"), bossBar()),
  setBossBarProgress(localVar("bar"), num(0.7)),
  setBossBarProgress(localVar("bar"), localVar("unset")),
  broadcast(fmt("q1=", bossBarProgressOf(localVar("bar")))),
  set(localVar("txt"), str("hello")),
  setBossBarProgress(localVar("bar"), localVar("txt")),
  broadcast(fmt("q2=", bossBarProgressOf(localVar("bar")))),
]);

export const displayScript: Script = script(
  joinDisplay,
  dtplain,
  dtstay,
  dtsub,
  dtclear,
  dtreset,
  dbar,
  dbshow,
  dbfresh,
  dbcast,
  dtnum,
  dthalf,
  p27markt,
  p27markp,
  dbord,
);
