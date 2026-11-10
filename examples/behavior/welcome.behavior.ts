import { defineBehavior } from "../../src/behavior.js";

// welcome.ts: on first join the server broadcasts a greeting and gives
// the new player a wooden sword. Requires a fresh player state
// (verify wipes the sandbox playerdata before booting).
export default defineBehavior(async (t) => {
  const bot = await t.connect("SkriptBot");
  try {
    await bot.waitForMessage(/ようこそ SkriptBot さん、初めての参加です！/);
    await bot.expectInventoryItem("wooden_sword");
  } finally {
    bot.disconnect();
  }
});
