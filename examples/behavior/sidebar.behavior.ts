import { defineBehavior } from "../../src/behavior.js";

// sidebar.ts is engine-only (Skript core has no sidebar /
// scoreboard-objective syntax), so under Skript mode there is
// nothing to exercise and this test passes without running.
// Under the engine it pins the whole flow through the read-back
// expressions: /sbset sets a sidebar (colored title, four lines
// including a duplicate and an empty line), /sbread reports the
// title, the line count, each line by 1-based position and an
// out-of-range line as <none>, and after /sbclear every
// read-back is empty again.
//
// Why read-back instead of the bot's scoreboard packets:
// mineflayer's scoreboard parsing does not fully handle the
// 1.21 score packets (custom display names on scores), so the
// engine's own read-back expressions are the observation
// channel — the same state Sidebars.set stored and rendered
// into the player's Bukkit scoreboard. The bot's chat messages
// are color-stripped by the harness, so the expectations below
// are the plain-text forms.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only feature; see header comment
  const bot = await t.connect("SidebarBot");
  try {
    bot.chat("/sbread");
    await bot.waitForMessage("sbread: has=no");
    bot.chat("/sbset");
    await bot.waitForMessage("sbset: done");
    bot.chat("/sbread");
    await bot.waitForMessage("sbread: has=yes");
    await bot.waitForMessage("sbread: title=My Server count=4");
    await bot.waitForMessage("sbread: lines=Welcome!||Welcome!|Online: 3");
    await bot.waitForMessage(/sbread: line9=<none>/);
    bot.chat("/sbclear");
    await bot.waitForMessage("sbclear: done");
    bot.chat("/sbread");
    await bot.waitForMessage("sbread: has=no");
    await bot.waitForMessage(/sbread: title=<none> count=<none>/);
  } finally {
    bot.disconnect();
  }
});
