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
// VERIFIED 2026-11-14 (coordinator, subset verify in both
// modes): the real Skript's give effect drops overflow the
// same way, so both runtimes share the DROP semantics this
// test pins. (The suite originally failed in both modes on
// pickup mechanics — a stationary bot and a naturally
// dropped item that rolls away — not on the drop itself;
// the flow now works on virgin ground and teleports the
// bot onto the dropped item after the clear.)
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
    // hands every joining bot a wooden sword). The bot's
    // playerdata persists across runs, so a prize sword from
    // an earlier run can still be in hand — and on a busy
    // server the clear can race the join and miss. Re-issue
    // it until the leftover sword is actually gone.
    await t.console("clear PrizeBot");
    for (let attempt = 0; attempt < 10; attempt++) {
      if ((await bot.inventoryItemInfo("diamond_sword", 300)) === null) break;
      await t.console("clear PrizeBot");
      await t.sleep(300);
    }
    // Work on virgin flat ground far from the shared spawn:
    // the sandbox world accumulates dropped items and terrain
    // edits from other suites, and a naturally dropped item
    // rolls a random short distance — both make a stationary
    // bot's pickup racy. Out here the only item entity is the
    // prize sword itself.
    await t.console("tp PrizeBot 500 -60 500");
    await t.sleep(1000);

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

    // Free space from the console: the dropped sword is now
    // collectable. Teleport the bot onto the nearest item
    // entity (out here that is the sword) so the pickup does
    // not depend on where the natural drop happened to roll;
    // the filtered pickup handler's marker must then arrive
    // (mark first — the wait only counts messages from here).
    const clearMark = bot.messages.length;
    await t.console("clear PrizeBot");
    await t.console("tp PrizeBot @e[type=minecraft:item,limit=1,sort=nearest]");
    await waitNew(bot, clearMark, "picked prize");
    await bot.expectInventoryItem("diamond_sword");
  } finally {
    bot.disconnect();
  }
});
