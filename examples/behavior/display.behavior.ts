import { defineBehavior } from "../../src/behavior.js";

/**
 * Display effects and boss bars (phase 21): the observation
 * surface is the client's display packets themselves — the
 * bot receives a fully timed title with a subtitle and an
 * action bar message on join, untimed and partially timed
 * title sends (an untimed send must produce NO times packet;
 * a partial one is filled with the 10 / 70 / 20 tick
 * defaults), a subtitle-only send, title clear / reset
 * packets, and a boss bar lifecycle (add with title / health /
 * color, title and health updates, a style update for the
 * color change, and the remove). Script readbacks of the
 * bar's title and progress corroborate the wire. The same
 * expectations run under Skript (the emitted .sk) and under
 * the engine jar (the IR).
 */
export default defineBehavior(async (t) => {
  const bot = await t.connect("DisplayBot");
  try {
    const waitMsg = async (mark: number, pattern: RegExp, timeoutMs = 15_000): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        for (let i = mark; i < bot.messages.length; i++) {
          const m = bot.messages[i]!;
          if (pattern.test(m)) return m;
        }
        if (Date.now() >= deadline) {
          const recent = bot.messages.slice(mark).slice(-6).join(" | ") || "(none)";
          throw new Error(`timed out after ${timeoutMs}ms waiting for ${pattern}; recent: ${recent}`);
        }
        await t.sleep(100);
      }
    };
    const chat = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(600); // pace commands (Paper command-spam kick)
    };

    // -- Join display: times first (fade-in 1s = 20 ticks,
    // stay 5s = 100, fade-out 1s = 20), then the subtitle and
    // the title, plus the action bar message. --
    await bot.waitForTitleTimes(20, 100, 20);
    await bot.waitForTitleText("Welcome Title");
    if (!bot.titleSubtitles().includes("Welcome Subtitle")) {
      throw new Error(`join subtitle missing; saw ${JSON.stringify(bot.titleSubtitles())}`);
    }
    await bot.waitForActionBarText("Welcome Action Bar");

    // -- Untimed title: the text arrives and NO new times
    // packet is sent (the client keeps the join timings). --
    let timeCount = bot.titleTimes().length;
    await chat("/dtplain");
    await bot.waitForTitleText("Plain Title");
    await t.sleep(600);
    if (bot.titleTimes().length !== timeCount) {
      throw new Error(
        `untimed title send produced a times packet: ${JSON.stringify(bot.titleTimes().slice(timeCount))}`,
      );
    }

    // -- Stay-only title: the fades are filled with the
    // defaults (10 / 20), the stay is 5 seconds = 100. --
    let timeMark = bot.titleTimes().length;
    await chat("/dtstay");
    await bot.waitForTitleTimes(10, 100, 20, 10_000, timeMark);
    await bot.waitForTitleText("Stay Title");

    // -- Subtitle-only send with a stay: a times packet and
    // the subtitle arrive; no title text is sent. --
    timeMark = bot.titleTimes().length;
    const titleMark = bot.titleTexts().length;
    await chat("/dtsub");
    await bot.waitForTitleTimes(10, 100, 20, 10_000, timeMark);
    await t.sleep(600);
    if (!bot.titleSubtitles().includes("Only Subtitle")) {
      throw new Error(`subtitle-only send missing; saw ${JSON.stringify(bot.titleSubtitles())}`);
    }
    if (bot.titleTexts().length !== titleMark) {
      throw new Error(
        `subtitle-only send produced a title packet: ${JSON.stringify(bot.titleTexts().slice(titleMark))}`,
      );
    }

    // -- Clear: the title text, then a clear packet with
    // reset=false. Reset: same with reset=true. --
    let clearMark = bot.titleClears().length;
    await chat("/dtclear");
    await bot.waitForTitleText("Clear Me");
    await bot.waitForTitleClear(false, 10_000, clearMark);
    clearMark = bot.titleClears().length;
    await chat("/dtreset");
    await bot.waitForTitleText("Reset Me");
    await bot.waitForTitleClear(true, 10_000, clearMark);

    // -- A standalone action bar message. --
    const barMark = bot.actionBarTexts().length;
    await chat("/dbar");
    await bot.waitForActionBarText("Action Two", 10_000, barMark);

    // -- Boss bar lifecycle, all inside /dbshow (the bar
    // lives in a local; it cannot be saved). The packet
    // sequence is: add (0) with the title, full health, red
    // (2) and a solid style (0) — then a title update (3), a
    // health update (2) at 0.5, a style update (4) with blue
    // (1), and the remove (1). Chat readbacks corroborate the
    // title and progress between steps. --
    const bossMark = bot.bossBarPackets().length;
    let mark = bot.messages.length;
    await chat("/dbshow");
    const added = await bot.waitForBossBarAction(0, 10_000, bossMark);
    if (added.title !== "Display Boss" || added.health !== 1 || added.color !== 2 || added.dividers !== 0) {
      throw new Error(`unexpected boss bar add packet: ${JSON.stringify(added)}`);
    }
    await waitMsg(mark, /boss=Display Boss p=1/);
    const retitled = await bot.waitForBossBarAction(3, 10_000, bossMark);
    if (retitled.title !== "Boss Renamed") {
      throw new Error(`unexpected boss bar title update: ${JSON.stringify(retitled)}`);
    }
    await waitMsg(mark, /boss=Boss Renamed/);
    const halved = await bot.waitForBossBarAction(2, 10_000, bossMark);
    if (halved.health !== 0.5) {
      throw new Error(`unexpected boss bar health update: ${JSON.stringify(halved)}`);
    }
    await waitMsg(mark, /p=0\.5/);
    const recolored = await bot.waitForBossBarAction(4, 10_000, bossMark);
    if (recolored.color !== 1) {
      throw new Error(`unexpected boss bar style update: ${JSON.stringify(recolored)}`);
    }
    await waitMsg(mark, /color set/);
    await bot.waitForBossBarAction(1, 10_000, bossMark);
    await waitMsg(mark, /hidden/);

    // -- A fresh bar with no options shows the defaults:
    // empty title, full health, white (6), solid (0). --
    const freshMark = bot.bossBarPackets().length;
    mark = bot.messages.length;
    await chat("/dbfresh");
    const fresh = await bot.waitForBossBarAction(0, 10_000, freshMark);
    if (fresh.title !== "" || fresh.health !== 1 || fresh.color !== 6 || fresh.dividers !== 0) {
      throw new Error(`unexpected fresh boss bar packet: ${JSON.stringify(fresh)}`);
    }
    await waitMsg(mark, /fresh p=1/);
    await bot.waitForBossBarAction(1, 10_000, freshMark);

    // -- A colored broadcast arrives as formatting, not as
    // a literal section-sign code in the text (phase 27,
    // R-8: the engine's broadcast path used to ship the
    // § code raw). --
    mark = bot.messages.length;
    await chat("/dbcast");
    await waitMsg(mark, /^Colored News$/);

    // -- A number-valued stay is not a title timing (phase
    // 27, R-9): a specified timing part that is not a
    // timespan makes the whole send a no-op — NEITHER a
    // times packet NOR the title text arrives. --
    timeCount = bot.titleTimes().length;
    const titleCount = bot.titleTexts().length;
    await chat("/dtnum");
    await t.sleep(1200);
    if (bot.titleTimes().length !== timeCount) {
      throw new Error(
        `number-timed title send produced a times packet: ${JSON.stringify(bot.titleTimes().slice(timeCount))}`,
      );
    }
    if (bot.titleTexts().length !== titleCount) {
      throw new Error(
        `number-timed title send produced a title text: ${JSON.stringify(bot.titleTexts().slice(titleCount))}`,
      );
    }

    // -- A half-tick fade-in (25 ms by timespan division)
    // converts rounding half DOWN (phase 27, R-9): the
    // times packet reads fade-in 0, stay / fade-out filled
    // with the 70 / 20 defaults. --
    timeMark = bot.titleTimes().length;
    await chat("/dthalf");
    await bot.waitForTitleTimes(0, 70, 20, 10_000, timeMark);
    await bot.waitForTitleText("Half Title");

    // -- The boss bar write family (phase 27, R-4 / R-5):
    // the value / viewer operands are evaluated even when
    // the bar has no value, and progress writes with a
    // missing or wrong-typed value are no-ops. --
    mark = bot.messages.length;
    await chat("/dbord");
    await waitMsg(mark, /ord1=1/);
    await waitMsg(mark, /ord2=2/);
    await waitMsg(mark, /q1=0\.7/);
    await waitMsg(mark, /q2=0\.7/);
  } finally {
    bot.disconnect();
  }
});
