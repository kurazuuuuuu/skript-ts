import type { Script } from "../src/index.js";
import {
  addBossBarViewer,
  bossBarCreatesFog,
  bossBarDarkensSky,
  bossBarKeyOf,
  bossBarProgressOf,
  bossBarStyleOf,
  bossBarTitleOf,
  broadcast,
  command,
  createBossBarSection,
  deleteKeyedBossBar,
  eventBossBar,
  fmt,
  ifElse,
  keyedBossBar,
  keyedBossBarOf,
  localVar,
  not,
  num,
  player,
  script,
  set,
  setBossBarFlag,
  setBossBarProgress,
  setBossBarStyle,
  setBossBarTitle,
  str,
  variable,
} from "../src/index.js";

// Keyed boss bars, styles, flags and the section creation
// form (phase 24). The /bossbar command runs a narrated
// battery over a persistent keyed bar: create and read back,
// the create-resets-storage rule, a style write and read, a
// flag toggle, the key read, keyed and plain section
// creation, storage in a persistent variable (keyed bars can
// be saved; plain bars cannot), and deletion. Every line is
// broadcast with a BBn tag so the behavior test can assert
// the identical sequence under both runtimes.

export const bossbarScript: Script = script(
  command("bossbar", null, [
    // create and read back
    set(localVar("bar"), keyedBossBar(str("sktest:main"))),
    setBossBarTitle(localVar("bar"), str("Alpha")),
    setBossBarProgress(localVar("bar"), num(0.25)),
    set(localVar("fetched"), keyedBossBarOf(str("sktest:main"))),
    addBossBarViewer(localVar("fetched"), player()),
    broadcast(fmt("BB1 title=", bossBarTitleOf(localVar("fetched")), " progress=", bossBarProgressOf(localVar("fetched")))),
    // create again to check the storage reset rule
    set(localVar("bar"), keyedBossBar(str("sktest:main"))),
    set(localVar("fetched"), keyedBossBarOf(str("sktest:main"))),
    broadcast(fmt("BB2 title=", bossBarTitleOf(localVar("fetched")), " progress=", bossBarProgressOf(localVar("fetched")))),
    // style write and read
    setBossBarStyle(localVar("fetched"), "6 notches"),
    broadcast(fmt("BB3 style=", bossBarStyleOf(localVar("fetched")))),
    // flag toggle
    setBossBarFlag(localVar("fetched"), "createFog", true),
    ifElse(bossBarCreatesFog(localVar("fetched")), [broadcast(str("BB4 fog=on"))]),
    setBossBarFlag(localVar("fetched"), "createFog", false),
    ifElse(not(bossBarCreatesFog(localVar("fetched"))), [broadcast(str("BB4 fog=off"))]),
    // key read
    broadcast(fmt("BB5 key=", bossBarKeyOf(localVar("fetched")))),
    // keyed section creation
    createBossBarSection(localVar("sec"), [
      setBossBarTitle(eventBossBar(), str("SecT")),
      setBossBarProgress(eventBossBar(), num(0.3)),
      setBossBarFlag(eventBossBar(), "darkenSky", true),
    ], { key: str("sktest:sec") }),
    set(localVar("secFetched"), keyedBossBarOf(str("sktest:sec"))),
    broadcast(fmt("BB6 title=", bossBarTitleOf(localVar("secFetched")), " progress=", bossBarProgressOf(localVar("secFetched")))),
    ifElse(bossBarDarkensSky(localVar("secFetched")), [broadcast(str("BB6 sky=on"))]),
    // plain section creation
    createBossBarSection(localVar("plain"), [
      setBossBarTitle(eventBossBar(), str("PlainT")),
    ]),
    broadcast(fmt("BB7 title=", bossBarTitleOf(localVar("plain")))),
    // save keyed bar in a persistent variable
    set(variable("bb24"), keyedBossBarOf(str("sktest:sec"))),
    broadcast(fmt("BB8 title=", bossBarTitleOf(variable("bb24")))),
    // delete, then read back the missing key
    deleteKeyedBossBar(str("sktest:main")),
    set(localVar("gone"), keyedBossBarOf(str("sktest:main"))),
    broadcast(fmt("BB9 title=", bossBarTitleOf(localVar("gone")))),
    ifElse(bossBarCreatesFog(localVar("gone")), [broadcast(str("BB9 present"))], [broadcast(str("BB9 deleted"))]),
  ]),
);
