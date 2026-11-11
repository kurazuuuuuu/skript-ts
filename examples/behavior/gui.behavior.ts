import { defineBehavior, type BehaviorBot, type WindowSlotItem } from "../../src/behavior.js";

// gui.ts (phase 17): items, inventories and GUIs. All constructs
// are core language, so this test runs under BOTH runtimes with
// identical expectations:
//   /gem builds a named, lored diamond sword through the meta
//     statements and hands it over (the bot's sword slot proves
//     the give-item statement);
//   /geminfo reads the stored copy back — the broadcast pins the
//     stack print form ("diamond sword named Gem Blade"), the
//     name / lore / amount expressions, and join over loreOf;
//   /menu opens the "Shop Menu" GUI: the bot sees the window,
//     the named diamond at slot 13 (custom name + lore read off
//     the item components mineflayer receives), 3 stone at 11;
//   clicking slot 13 is reported with both slot indices and the
//     item's print form, answered ("bought the gem slot"), and
//     slot 22 gains an emerald through the event inventory —
//     while the click's cancellation keeps the diamond OUT of
//     the bot's inventory;
//   a bottom-inventory click reports the clicked-inventory
//     index (12) versus the raw view index (30) and a <none>
//     item, and is cancelled too;
//   closing the window reports "closed Shop Menu".
//
// Like the other command-dense tests, commands are paced 1s
// apart against the server's command-spam kick, and waitNew
// only scans messages that arrived after a fresh mark.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<{ msg: string; at: number }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m.includes(pattern));
    if (hit !== undefined) return { msg: hit, at: Date.now() };
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Poll a window slot until it holds the expected item shape. */
async function waitSlot(
  bot: BehaviorBot,
  slot: number,
  want: (item: WindowSlotItem) => boolean,
  timeoutMs = 10_000,
): Promise<WindowSlotItem> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const item = bot.windowSlotItem(slot);
    if (item !== null && want(item)) return item;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for window slot ${slot}; current: ${JSON.stringify(item)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("GuiBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    // The welcome sample hands joining bots a wooden sword (in
    // both runtimes); start from an empty inventory so the
    // give/cancel assertions below are exact.
    await t.console("clear GuiBot");

    const cmd = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(1000);
    };

    await cmd("/gem");
    await bot.expectInventoryItem("diamond_sword");

    let mark = bot.messages.length;
    await cmd("/geminfo");
    await waitNew(
      bot,
      mark,
      "gem=diamond sword named Gem Blade name=Gem Blade lore=Sharp and bright / Handle with care n=1",
    );

    mark = bot.messages.length;
    await cmd("/menu");
    await bot.waitForWindow("Shop Menu");
    const gem = await waitSlot(bot, 13, (i) => i.name === "diamond" && i.customName === "Menu Gem");
    if (gem.lore.join("|") !== "Click to buy") {
      throw new Error(`slot 13 lore mismatch: ${JSON.stringify(gem.lore)}`);
    }
    await waitSlot(bot, 11, (i) => i.name === "stone" && i.count === 3);

    await bot.clickWindowSlot(13);
    await waitNew(bot, mark, "clicked 13 raw 13 item=diamond named Menu Gem in Shop Menu");
    await waitNew(bot, mark, "bought the gem slot");
    await waitNew(bot, mark, "slot22=emerald");
    await waitSlot(bot, 22, (i) => i.name === "emerald");
    // The click was cancelled: the gem never entered the bot's
    // own inventory (only the /gem diamond_sword is in there).
    await bot.expectNoInventoryItem("diamond");

    // A bottom-inventory click while the GUI is open: the item
    // is empty, the index counts within the clicked (bottom)
    // inventory while the raw index counts within the view.
    mark = bot.messages.length;
    await bot.clickWindowSlot(30);
    await waitNew(bot, mark, "clicked 12 raw 30 item=<none> in Shop Menu");

    mark = bot.messages.length;
    bot.closeWindow();
    await waitNew(bot, mark, "closed Shop Menu");
  } finally {
    bot.disconnect();
  }
});
