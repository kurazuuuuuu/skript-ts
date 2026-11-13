import { defineBehavior } from "../../src/behavior.js";

// customitems.ts (RP-2): /citem stores the pack's gem in a
// variable, gives it to the player, and reports the components
// back. Both runtimes must agree: the stack is an amethyst shard
// carrying item_model "example:gem", CustomModelData 1 (the first
// registry allocation for the example pack), and the pack-defined
// display name — and the script's own read-back says the same.
export default defineBehavior(async (t) => {
  const bot = await t.connect("GemBot");
  try {
    await t.console("clear GemBot");
    bot.chat("/citem");
    await bot.waitForMessage(/モデル: example:gem \/ 番号: 1/);
    const info = await bot.inventoryItemInfo("amethyst_shard");
    if (info === null) {
      throw new Error("the given amethyst shard never reached the inventory");
    }
    if (info.itemModel !== "example:gem") {
      throw new Error(`expected item_model "example:gem", got ${JSON.stringify(info.itemModel)}`);
    }
    if (info.customModelData !== 1) {
      throw new Error(`expected custom model data 1, got ${JSON.stringify(info.customModelData)}`);
    }
    if (info.customName !== "ジェム") {
      throw new Error(`expected custom name "ジェム", got ${JSON.stringify(info.customName)}`);
    }
  } finally {
    bot.disconnect();
  }
});
