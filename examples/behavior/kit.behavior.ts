import { defineBehavior } from "../../src/behavior.js";

// kit.ts: /kit <name> requires the "server.kit" permission. A non-op
// bot is refused; after being opped from the console the same command
// succeeds and the bot receives golden apples.
export default defineBehavior(async (t) => {
  const bot = await t.connect("KitBot");
  try {
    bot.chat("/kit starter");
    await bot.waitForMessage(/権限がありません/);
    await t.console("op KitBot");
    bot.chat("/kit starter");
    await bot.waitForMessage(/キット starter を配布しました/);
    await bot.expectInventoryItem("golden_apple");
  } finally {
    bot.disconnect();
  }
});
