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
);
