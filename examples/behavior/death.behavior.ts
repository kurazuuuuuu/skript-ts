import { defineBehavior } from "../../src/behavior.js";

// death.ts: on death a counter variable is incremented and the victim
// is told the new count. The console `kill` command triggers a real
// death; with wiped Skript variables the first death reports 1.
export default defineBehavior(async (t) => {
  const bot = await t.connect("DeathBot");
  try {
    await t.console("kill DeathBot");
    await bot.waitForMessage(/死亡回数は 1 回です/);
  } finally {
    bot.disconnect();
  }
});
