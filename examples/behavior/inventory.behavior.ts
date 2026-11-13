import { defineBehavior } from "../../src/behavior.js";

// inventory.ts (feedback lane D): the inventory operations
// against the probed Skript 2.17.1 semantics, with IDENTICAL
// expectations in both modes — directional meta matching for
// has / count / remove (armor and offhand included), partial
// remove in slot order, and the storage-only exact-similarity
// capacity rule for can hold.
//
// /invsetup lays out 5 plain diamonds, 2 diamonds named "Gem"
// and 3 iron ingots. Command pacing: every step waits for the
// sample's reply message before sending the next command.
export default defineBehavior(async (t) => {
  const bot = await t.connect("InvBot");
  try {
    await t.console("clear InvBot");
    bot.chat("/invsetup");
    await bot.waitForMessage(/invsetup: done/);
    bot.chat("/invcheck");
    // Bare-pattern count includes the named stacks (5 + 2);
    // the named pattern counts only its own.
    await bot.waitForMessage(/invcheck: count=7 gem=2/);
    await bot.waitForMessage(/invcheck: has7 yes/);
    await bot.waitForMessage(/invcheck: has8 no/);
    await bot.waitForMessage(/invcheck: hasgem3 no/);
    await bot.waitForMessage(/invcheck: noemerald yes/);
    // Capacity: 59 merge room in the partial plain stack plus
    // 33 empty slots x 64 = 2171; swords fit one per empty slot.
    await bot.waitForMessage(/invcheck: can2171 yes/);
    await bot.waitForMessage(/invcheck: can2172 no/);
    await bot.waitForMessage(/invcheck: swords33 yes/);
    await bot.waitForMessage(/invcheck: swords34 no/);
    // Remove takes from the earliest slot first: the plain
    // stack drops 5 -> 1, the named stack is untouched.
    bot.chat("/invremove");
    await bot.waitForMessage(/invremove: count=3 gem=2/);
    // Partial remove: asking for 100 with 3 held leaves 0.
    bot.chat("/invpartial");
    await bot.waitForMessage(/invpartial: count=0/);
    // Remove-all clears every matching stack and nothing else
    // (the second /invsetup merges the iron into one stack of 6).
    bot.chat("/invsetup");
    await bot.waitForMessage(/invsetup: done/);
    bot.chat("/invremoveall");
    await bot.waitForMessage(/invremoveall: count=0 iron=6/);
    // Armor and offhand COUNT for has / count / remove but not
    // for capacity: 2 diamonds on the head + 4 in the offhand
    // read as 6 held, while storage capacity stays 35 free
    // slots x 64 = 2240 (one storage slot holds the iron).
    await t.console("item replace entity InvBot armor.head with diamond 2");
    await t.console("item replace entity InvBot weapon.offhand with diamond 4");
    bot.chat("/invcount");
    await bot.waitForMessage(/invcount: count=6/);
    await bot.waitForMessage(/invcount: can2240 yes/);
    await bot.waitForMessage(/invcount: can2241 no/);
    bot.chat("/invremoveall");
    await bot.waitForMessage(/invremoveall: count=0 iron=6/);
  } finally {
    bot.disconnect();
  }
});
