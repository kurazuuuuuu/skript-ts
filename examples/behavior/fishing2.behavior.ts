import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// fishing (phase 22), part 2: the two states part 1 cannot
// reach with mineflayer's auto-reeling fish() — the escape
// (let the bite window lapse on purpose) and the entity
// hook (a point-blank cast onto a zombie standing in the
// pond). Split from part 1 so each file stays well inside
// the harness's per-file timeout even when the random bite
// draw runs long. Runs under BOTH runtimes.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((msg) => msg === pattern);
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
  const bot = await t.connect("Fish2Bot");
  try {
    await t.sleep(1000); // let the join sequence settle
    await t.console("clear Fish2Bot");
    await t.console("difficulty peaceful");
    await t.console("time set 1000");
    // Own pond, east of part 1's (teleport first so the
    // chunks load and the fills land).
    await t.console("tp Fish2Bot 560.5 -50 499.5");
    await t.sleep(1500);
    await t.console("fill 548 -64 488 572 -64 512 stone");
    // Clear the natural terrain above the floor (this site's
    // surface is ~y=-60) so the basin is the artificial one —
    // same lesson as part 1's in-ground diagnosis.
    await t.console("fill 548 -63 488 572 -56 512 air");
    await t.console("fill 550 -63 490 570 -61 510 water");
    // A 3x3 casting pad at the west edge (a 1-wide ledge
    // lets the bot slip off between sections — part 1's
    // diagnosis).
    await t.console("fill 548 -63 498 550 -61 500 stone");
    await t.console("tp Fish2Bot 549.5 -60 499.5");
    await t.sleep(800);
    await t.console("give Fish2Bot fishing_rod 1");
    await bot.equipItem("fishing_rod");
    await t.console("enchant Fish2Bot minecraft:lure 3");
    await t.sleep(500);

    // ---------------------------------------------------------
    // Escape: cast, wait for the bite broadcast, then do NOT
    // reel — the bite window lapses (about a second in the
    // original, probed) and the fish gets away on its own.
    // ---------------------------------------------------------
    await bot.lookAtPoint(560, -61.3, 499.5);
    await t.sleep(500); // let the rotation settle before casting
    const m = bot.messages.length;
    bot.activateItem();
    await waitNew(bot, m, "fish bite", 75_000);
    await t.sleep(2500);
    await waitNew(bot, m, "fish escaped", 15_000);
    await waitNew(bot, m, "fish state fish escape", 10_000);
    bot.activateItem(); // reel the empty line back in
    await t.sleep(400);
    bot.deactivateItem();
    await t.sleep(500);

    // ---------------------------------------------------------
    // Entity hooked: a zombie stands in the pond a few
    // blocks out (on a submerged stone block, NoAI); a short
    // cast onto it and a reel-in catches the entity, not a
    // fish. Retried a few times — the hook has to touch the
    // zombie on its way in.
    // ---------------------------------------------------------
    await t.console("difficulty easy");
    await t.console("tp Fish2Bot 549.5 -60 499.5");
    await t.sleep(400);
    await t.console("setblock 552 -62 499 stone");
    await t.console("summon zombie 552.5 -61 499.5 {NoAI:1b}");
    await t.sleep(800);
    // Three blocks out, exactly the geometry the probes
    // hooked with: at four blocks the cast overshoots the
    // zombie and the reel-in sweep misses it.
    await bot.lookAtPoint(552.5, -60.6, 499.5);
    await t.sleep(500);
    let hooked = false;
    for (let i = 0; i < 3 && !hooked; i++) {
      const h = bot.messages.length;
      bot.activateItem();
      await t.sleep(1600);
      bot.activateItem();
      await t.sleep(400);
      bot.deactivateItem();
      try {
        await waitNew(bot, h, "hooked zombie", 6_000);
        hooked = true;
      } catch {
        await t.sleep(1000); // not this cast; try again
      }
    }
    if (!hooked) throw new Error("the hook never caught the zombie in 3 casts");
    await t.console("kill @e[type=minecraft:zombie]");
    await t.console("difficulty peaceful");
  } finally {
    bot.disconnect();
  }
});
