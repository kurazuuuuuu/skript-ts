import { defineBehavior } from "../../src/behavior.js";

// itemtags.ts is engine-only (hidden item tags live in the
// item's PersistentDataContainer, which Skript cannot access),
// so under Skript mode there is nothing to exercise and this
// test passes without running. Under the engine it pins the
// whole chain: /tagitem builds a diamond sword, stamps it with
// a text, a number and a boolean tag, stores the tagged stack
// in a global variable and gives a copy to the bot; /tagcheck
// reads all three tags back with their types intact, branches
// on hasItemTag for the stored stack, and branches the other
// way for a fresh untagged sword — whose missing tag reads as
// <none>.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only feature; see header comment
  const bot = await t.connect("ItemTagBot");
  try {
    await t.console("clear ItemTagBot");
    bot.chat("/tagitem");
    await bot.waitForMessage("tagitem: given");
    await bot.expectInventoryItem("diamond_sword");
    bot.chat("/tagcheck");
    await bot.waitForMessage(/tagcheck: serial=gem-001 tier=3 genuine=true/);
    await bot.waitForMessage("tagcheck: tagged=yes");
    await bot.waitForMessage("tagcheck: plain=untagged");
    await bot.waitForMessage(/tagcheck: missing=<none>/);
  } finally {
    bot.disconnect();
  }
});
