import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// events4.ts (feedback batch D): the additional core events —
// consume, craft, inventory drag, projectile hit, toggle
// sneak. All constructs are core language, so this test runs
// under BOTH runtimes with identical expectations.
//
// Coverage split, honestly:
// - toggle sneak, craft, inventory drag and projectile hit
//   are DRIVEN below with real bot actions.
// - consume is golden/load-only: mineflayer bots spawn with
//   full hunger (food 20) and vanilla refuses to eat at full
//   hunger, and the behavior API has no way to lower a bot's
//   hunger — there is no bot action that makes a fresh bot
//   consume anything. The handler is pinned by the golden
//   fixture and the load checks instead.
// - swap hand (onSwapHand) is golden/IR-only: it is
//   engine-only (Skript has no such event) and the bot API
//   exposes no swap-hands action (mineflayer has no
//   swapHandItems), so no behavior path exists for it. The
//   golden suite pins its engine-only IR form.
//
// Like events2/events3, expectations use message marks: the
// buffer is only scanned from a mark taken just before the
// action, because the other samples' handlers (and the
// sandbox world's ambient mobs) keep broadcasting throughout.
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
  const bot = await t.connect("Ev4Bot");
  try {
    await t.sleep(1000); // let the join sequence settle
    await t.console("clear Ev4Bot");
    // Own platform at a fresh sandbox spot (teleport first so
    // the chunks are loaded and the fills land).
    await t.console("tp Ev4Bot 238.5 -60 238.5");
    await t.sleep(800);
    await t.console("fill 236 -61 236 240 -61 240 stone");
    await t.console("fill 236 -60 236 240 -56 240 air");
    await t.console("tp Ev4Bot 238.5 -60 238.5");
    await t.sleep(600);
    await t.console("difficulty peaceful");
    await t.console("time set 1000");

    // ---------------------------------------------------------
    // Toggle sneak: each control-state change fires the
    // event — sneaking on, and sneaking off again.
    // ---------------------------------------------------------
    let m = bot.messages.length;
    bot.setSneak(true);
    await waitNew(bot, m, "sneak toggled");
    m = bot.messages.length;
    bot.setSneak(false);
    await waitNew(bot, m, "sneak toggled");

    // ---------------------------------------------------------
    // Craft: console-give a log, craft planks in the 2x2
    // grid (no table); the handler reports the result type.
    // ---------------------------------------------------------
    await t.console("give Ev4Bot oak_log 1");
    await bot.expectInventoryItem("oak_log");
    m = bot.messages.length;
    await bot.craftItem("oak_planks");
    await waitNew(bot, m, "crafted oak planks");
    await bot.expectInventoryItem("oak_planks");

    // ---------------------------------------------------------
    // Inventory drag: open the sample's GUI, pick a stack
    // up from the bot's own inventory and drag it across
    // the GUI's first two slots.
    // ---------------------------------------------------------
    await t.console("give Ev4Bot stone 16");
    await bot.expectInventoryItem("stone");
    bot.chat("/ev4open");
    await bot.waitForWindow("EV4");
    // Find the raw window slot holding the stone: the top
    // inventory takes raw slots 0..8, the bot's own inventory
    // follows from raw slot 9.
    let stoneSlot = -1;
    {
      const deadline = Date.now() + 10_000;
      for (;;) {
        for (let raw = 9; raw < 45; raw++) {
          if (bot.windowSlotItem(raw)?.name === "stone") {
            stoneSlot = raw;
            break;
          }
        }
        if (stoneSlot >= 0) break;
        if (Date.now() >= deadline) {
          throw new Error("timed out looking for the stone stack in the open window");
        }
        await t.sleep(200);
      }
    }
    await bot.clickWindowSlot(stoneSlot);
    m = bot.messages.length;
    await bot.dragWindowSlots([0, 1], "left");
    await waitNew(bot, m, "inventory dragged");
    bot.closeWindow();

    // ---------------------------------------------------------
    // Projectile hit: a skeleton summoned next to the
    // stationary bot shoots at it; an arrow hitting the bot
    // OR the platform both fire the event, so the marker is
    // asserted with a generous timeout. Same discipline as
    // events2/events3: easy only inside this window.
    // ---------------------------------------------------------
    await t.console("difficulty easy");
    m = bot.messages.length;
    await t.console("summon skeleton 240.5 -60 238.5");
    await waitNew(bot, m, "projectile hit", 30_000);
    await t.console("difficulty peaceful");
    await t.console("kill @e[type=minecraft:arrow]");
  } finally {
    bot.disconnect();
  }
});
