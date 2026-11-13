import { defineBehavior, type BehaviorBot, type WindowSlotItem } from "../../src/behavior.js";

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

async function waitCursor(
  bot: BehaviorBot,
  want: { name: string; count: number } | null,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const item = bot.cursorItem();
    const ok =
      want === null
        ? item === null
        : item !== null && item.name === want.name && item.count === want.count;
    if (ok) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for cursor ${JSON.stringify(want)}; current: ${JSON.stringify(item)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

// gui2cursor.ts (phase 28): the engine-only cursor values —
// the click event's cursor item and the cursor replacement
// statement. Under Skript mode the gui2cursor script is not
// deployed at all, and this test returns immediately.
//
//   /g2cgive puts 7 emeralds on the cursor outside any event
//     (read back off the open window's cursor);
//   clicking slot 0 reports the PRE-click cursor
//     ("cursor=7 emeralds") and the vanilla click places the
//     stack into the slot;
//   in swap mode a click on an empty cursor ("cursor=")
//     replaces it with 3 diamonds;
//   with swap off, clicking slot 2 reports "cursor=3
//     diamonds" and places them.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return;

  const bot = await t.connect("Gui2CursorBot");
  const cmd = async (text: string): Promise<void> => {
    bot.chat(text);
    await t.sleep(1000);
  };

  try {
    await t.sleep(1000);
    await t.console("clear Gui2CursorBot");

    await cmd("/g2copen");
    await bot.waitForWindow("G2C");

    let mark = bot.messages.length;
    await cmd("/g2cgive");
    await waitNew(bot, mark, "gave");
    await waitCursor(bot, { name: "emerald", count: 7 });

    mark = bot.messages.length;
    await bot.clickWindowSlot(0);
    await waitNew(bot, mark, "cursor=7 emeralds");
    await waitSlot(bot, 0, (item) => item.name === "emerald" && item.count === 7);
    await waitCursor(bot, null);

    await cmd("/g2cmode");

    mark = bot.messages.length;
    await bot.clickWindowSlot(1);
    await waitNew(bot, mark, "cursor=");
    await waitCursor(bot, { name: "diamond", count: 3 });

    await cmd("/g2cmodeoff");

    mark = bot.messages.length;
    await bot.clickWindowSlot(2);
    await waitNew(bot, mark, "cursor=3 diamonds");
    await waitSlot(bot, 2, (item) => item.name === "diamond" && item.count === 3);
    await waitCursor(bot, null);

    bot.closeWindow();
  } finally {
    bot.disconnect();
  }
});
