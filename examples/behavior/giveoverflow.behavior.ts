import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// giveoverflow.ts (feedback B5): giveItem overflow handling,
// with IDENTICAL expectations intended for BOTH runtimes.
//
// Flow: the bot joins with a cleared inventory, /fillbags
// fills every storage slot with full stacks of dirt (through
// giveItem itself), /giveprize tries to give one diamond
// sword that cannot fit, and the filtered onPickup handler
// for diamond swords broadcasts "picked prize". While the
// inventory stays full the sword must NOT be picked up (it
// is on the ground at the bot's feet, not in the inventory
// and not vanished); once the test clears the inventory
// from the console, the bot picks the dropped sword up and
// the marker arrives — plus the sword itself is in the
// inventory afterwards.
//
// UNVERIFIED ASSUMPTION: whether the real Skript drops
// overflow the same way is NOT yet verified. This test is
// written for the DROP behavior; the coordinator's
// Skript-mode subset verify is the arbiter. If Skript turns
// out to vanish overflow instead, the design flips and the
// engine change behind this test gets revisited.
//
// The harness's waitForMessage scans the whole message
// buffer, so the marker expectations use marks (waitNew),
// like the gameplay / events2 suites: a stale "picked
// prize" from an earlier step must never satisfy a later
// wait.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m === pattern);
    if (hit !== undefined) return hit;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("PrizeBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    // Start from a cleared inventory (the welcome sample
    // hands every joining bot a wooden sword).
    await t.console("clear PrizeBot");

    // Fill every storage slot with a full stack of dirt,
    // through the script's own giveItem path.
    bot.chat("/fillbags");
    await bot.waitForMessage(/fillbags: done/);
    await bot.expectInventoryItem("dirt");

    // The prize cannot fit: under the DROP semantics it
    // lands at the bot's feet. While the bags stay full it
    // must not be picked up — no marker, and no sword in
    // the inventory (a sword that vanished outright is
    // caught by the pickup wait after the clear below).
    const mark = bot.messages.length;
    bot.chat("/giveprize");
    await bot.waitForMessage(/giveprize: done/);
    await t.sleep(1500); // settle: a pickup would fire within this window
    if (bot.messages.slice(mark).includes("picked prize")) {
      throw new Error("picked up the prize while the inventory was still full");
    }
    const heldBeforeClear = await bot.inventoryItemInfo("diamond_sword", 500);
    if (heldBeforeClear !== null) {
      throw new Error("prize sword is in the inventory despite a full inventory");
    }

    // Free space from the console: the dropped sword at the
    // bot's feet is now collectable, so the filtered pickup
    // handler's marker must arrive (mark first — the wait
    // only counts messages from here on).
    const clearMark = bot.messages.length;
    await t.console("clear PrizeBot");
    await waitNew(bot, clearMark, "picked prize");
    await bot.expectInventoryItem("diamond_sword");
  } finally {
    bot.disconnect();
  }
});
