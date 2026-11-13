import { defineBehavior } from "../../src/behavior.js";

// invspace.ts is engine-only (freeSpaceFor has no form in the
// original Skript), so under Skript mode there is nothing to
// exercise and this test passes without running. Under the
// engine it pins the free-space numbers: an empty inventory
// fits 36 x 64 stackables and 36 non-stackables; after
// /invspacefill puts 32 diamonds named "Gem" in slot 0, the
// plain pattern gets no merge room from that stack (exact
// similarity) while the "Gem" pattern gets the 32 room left
// in it.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only feature; see header comment
  const bot = await t.connect("InvSpaceBot");
  try {
    await t.console("clear InvSpaceBot");
    bot.chat("/invspace");
    await bot.waitForMessage(/invspace: plain=2304 gem=2304 iron=2304 sword=36/);
    bot.chat("/invspacefill");
    await bot.waitForMessage(/invspacefill: done/);
    bot.chat("/invspace");
    await bot.waitForMessage(/invspace: plain=2240 gem=2272 iron=2240 sword=35/);
  } finally {
    bot.disconnect();
  }
});
