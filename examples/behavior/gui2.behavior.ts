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

async function collectNew(
  bot: BehaviorBot,
  mark: number,
  prefix: string,
  count: number,
  timeoutMs = 15_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark).filter((m) => m.startsWith(prefix));
    if (fresh.length >= count) return fresh.slice(0, count);
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms collecting ${count} "${prefix}" messages; got: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// gui2.ts (phase 28): inventory drags, slot and inventory
// add/remove, and enchantments. All constructs are core
// language, so this test runs under BOTH runtimes with
// identical expectations:
//   the add/remove commands walk the probed merge rules
//     (merge cap at the material max, the empty-slot set path
//     — uncapped in a player inventory, capped at 99 in a
//     chest inventory —, type-only removes, an emptied slot
//     reading back as "0 airs");
//   /g2named pins merge similarity with names (a plain add
//     merges into the named stack and keeps its name, a
//     differently named add does not merge);
//   /g2ench and /g2ench2 pin the enchantment reads (an
//     absent level reads as no value) and the directional
//     equality rule (the right operand is the pattern);
//   /g2enchslot, /g2persist and /g2readback cover the slot
//     form and the stored item;
//   drags distribute over the GUI (left: even split, right:
//     one per slot), report each receiving slot plus the
//     post-drag cursor as the event item;
//   a cancelled drag reports the same values but distributes
//     nothing and restores the cursor;
//   an armed click cancellation does NOT stop a drag (the
//     original's asymmetry): the pickup click is cancelled,
//     the drag still distributes.
//
// Like the other command-dense tests, commands are paced 1s
// apart against the server's command-spam kick, and waitNew
// only scans messages that arrived after a fresh mark.
export default defineBehavior(async (t) => {
  const bot = await t.connect("Gui2Bot");
  const cmd = async (text: string): Promise<void> => {
    bot.chat(text);
    await t.sleep(1000);
  };

  try {
    await t.sleep(1000);
    await t.console("clear Gui2Bot");

    // Add/remove and enchantment readbacks (no window open).
    let mark = bot.messages.length;
    await cmd("/g2clear");
    await waitNew(bot, mark, "cleared");

    mark = bot.messages.length;
    await cmd("/g2add1");
    await waitNew(bot, mark, "s10=5 stones");

    mark = bot.messages.length;
    await cmd("/g2add2");
    await waitNew(bot, mark, "s10=6 stones");

    mark = bot.messages.length;
    await cmd("/g2add3");
    await waitNew(bot, mark, "s10=64 stones");

    mark = bot.messages.length;
    await cmd("/g2add4");
    await waitNew(bot, mark, "s11=100 stones");

    mark = bot.messages.length;
    await cmd("/g2add5");
    await waitNew(bot, mark, "s11=100 stones");

    mark = bot.messages.length;
    await cmd("/g2rem1");
    await waitNew(bot, mark, "s11=70 stones");

    mark = bot.messages.length;
    await cmd("/g2rem2");
    await waitNew(bot, mark, "s11=70 stones");

    mark = bot.messages.length;
    await cmd("/g2rem3");
    await waitNew(bot, mark, "s11=0 airs");

    mark = bot.messages.length;
    await cmd("/g2chest");
    await waitNew(bot, mark, "c5=99 stones");

    mark = bot.messages.length;
    await cmd("/g2addinv");
    await waitNew(bot, mark, "s0=64 stones s1=36 stones s10=64 stones");

    mark = bot.messages.length;
    await cmd("/g2reminv");
    await waitNew(bot, mark, "s0=0 airs s1=30 stones s10=64 stones");

    mark = bot.messages.length;
    await cmd("/g2named");
    const s12 = await collectNew(bot, mark, "s12=", 3);
    const expectedS12 = [
      "s12=5 stones named Rock",
      "s12=10 stones named Rock",
      "s12=10 stones named Rock",
    ];
    if (JSON.stringify(s12) !== JSON.stringify(expectedS12)) {
      throw new Error(`unexpected /g2named readbacks: ${JSON.stringify(s12)}`);
    }

    mark = bot.messages.length;
    await cmd("/g2ench");
    await waitNew(bot, mark, "lvl=5 list=sharpness 5 fire=");

    mark = bot.messages.length;
    await cmd("/g2ench2");
    await waitNew(bot, mark, "eq1=true");
    await waitNew(bot, mark, "eq2=true");
    await waitNew(bot, mark, "eq3=false");
    await waitNew(bot, mark, "eq4=true");

    mark = bot.messages.length;
    await cmd("/g2enchslot");
    await waitNew(bot, mark, "s20=bow plvl=3");

    mark = bot.messages.length;
    await cmd("/g2persist");
    await waitNew(bot, mark, "saved");

    mark = bot.messages.length;
    await cmd("/g2readback");
    await waitNew(bot, mark, "saved=diamond sword named Keepsake lvl=7");

    // Drag section.
    await cmd("/g2clear");
    await cmd("/g2open");
    await bot.waitForWindow("G2");
    await cmd("/g2load");

    mark = bot.messages.length;
    await bot.clickWindowSlot(36);
    await waitNew(bot, mark, "ct=left mouse button");
    await waitCursor(bot, { name: "stone", count: 12 });

    mark = bot.messages.length;
    await bot.dragWindowSlots([0, 1, 2], "left");
    await waitNew(bot, mark, "dragged 0");
    await waitNew(bot, mark, "dragged 1");
    await waitNew(bot, mark, "dragged 2");
    await waitNew(bot, mark, "drag n=3 item=0 airs");
    await waitSlot(bot, 0, (item) => item.name === "stone" && item.count === 4);
    await waitSlot(bot, 1, (item) => item.name === "stone" && item.count === 4);
    await waitSlot(bot, 2, (item) => item.name === "stone" && item.count === 4);
    await waitCursor(bot, null);

    await cmd("/g2load");
    await bot.clickWindowSlot(36);
    await waitCursor(bot, { name: "stone", count: 12 });

    mark = bot.messages.length;
    await bot.dragWindowSlots([3, 4, 5], "right");
    await waitNew(bot, mark, "dragged 3");
    await waitNew(bot, mark, "dragged 4");
    await waitNew(bot, mark, "dragged 5");
    await waitNew(bot, mark, "drag n=3 item=9 stones");
    await waitSlot(bot, 3, (item) => item.name === "stone" && item.count === 1);
    await waitSlot(bot, 4, (item) => item.name === "stone" && item.count === 1);
    await waitSlot(bot, 5, (item) => item.name === "stone" && item.count === 1);
    await waitCursor(bot, { name: "stone", count: 9 });

    bot.closeWindow();

    // Drag-cancel section.
    await cmd("/g2clear");
    await cmd("/g2modedrag");
    await cmd("/g2open");
    await bot.waitForWindow("G2");
    await cmd("/g2load");

    await bot.clickWindowSlot(36);
    await waitCursor(bot, { name: "stone", count: 12 });

    mark = bot.messages.length;
    await bot.dragWindowSlots([0, 1], "left");
    await waitNew(bot, mark, "dragged 0");
    await waitNew(bot, mark, "dragged 1");
    await waitNew(bot, mark, "drag n=2 item=0 airs");

    await t.sleep(500);
    const dragCancel0 = bot.windowSlotItem(0);
    const dragCancel1 = bot.windowSlotItem(1);
    if (dragCancel0 !== null || dragCancel1 !== null) {
      throw new Error(
        `expected cancelled drag to leave slots 0 and 1 empty; got ${JSON.stringify({
          slot0: dragCancel0,
          slot1: dragCancel1,
        })}`,
      );
    }
    await waitCursor(bot, { name: "stone", count: 12 });

    bot.closeWindow();

    // Click-cancel-does-not-block-drags section.
    await cmd("/g2clear");
    await cmd("/g2modeclick");
    await cmd("/g2open");
    await bot.waitForWindow("G2");
    await cmd("/g2load");

    mark = bot.messages.length;
    await bot.clickWindowSlot(36);
    await waitNew(bot, mark, "ct=left mouse button");

    await t.sleep(500);
    const cancelledCursor = bot.cursorItem();
    const cancelledSlot36 = bot.windowSlotItem(36);
    if (
      cancelledCursor !== null ||
      cancelledSlot36 === null ||
      cancelledSlot36.name !== "stone" ||
      cancelledSlot36.count !== 12
    ) {
      throw new Error(
        `expected cancelled click to leave cursor empty and slot 36 with 12 stone; got cursor ${JSON.stringify(
          cancelledCursor,
        )} slot36 ${JSON.stringify(cancelledSlot36)}`,
      );
    }

    await cmd("/g2modenone");
    await bot.clickWindowSlot(36);
    await waitCursor(bot, { name: "stone", count: 12 });

    await cmd("/g2modeclick");

    mark = bot.messages.length;
    await bot.dragWindowSlots([0, 1], "left");
    await waitNew(bot, mark, "drag n=2 item=0 airs");
    await waitSlot(bot, 0, (item) => item.name === "stone" && item.count === 6);
    await waitSlot(bot, 1, (item) => item.name === "stone" && item.count === 6);

    bot.closeWindow();
  } finally {
    // Suite hygiene: {g2mode} is a persistent global and the
    // sample's handlers cancel clicks / drags in EVERY
    // inventory while it is armed. The suite ends in "click"
    // mode, which then poisons later suites sharing this
    // server — gui2cursor's vanilla clicks were cancelled by
    // it (engine verify on tsumu-dev, 2026-11-13: slot 0
    // stayed empty after a click the handler had reported,
    // and variables.json still held g2mode=click after the
    // run). Disarm on every exit path, not just the happy one.
    try {
      bot.chat("/g2modenone");
      await t.sleep(500);
    } catch {
      // The bot is already gone; nothing to disarm through it.
    }
    bot.disconnect();
  }
});
