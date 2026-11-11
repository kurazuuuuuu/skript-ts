import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// fishing (phase 22), part 1: a full catch cycle against the
// events3 sample's fishing sub-events — cast, approach, bite,
// caught — plus the early reel-in state. The pond is deep and wide on purpose: in a shallow
// 1-deep pool the approaching fish never completes its swim
// and the bite never comes (found by probing the original).
// A Lure III rod keeps the cycle near 15 seconds; even so
// the bite timing is the original's random draw, so every
// wait here carries a generous timeout. All constructs are
// core language: this test runs under BOTH runtimes with
// identical expectations.
//
// The casting station is a 3x3 pad in the middle of the pond,
// not a 1-wide ledge: phase-22 diagnosis found a bot on a
// 1-block pillar can slip off during the catch cycle, and
// every later cast then goes out from the wrong position.
// The pad is re-teleported to before each cast for the same
// reason.
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
  const bot = await t.connect("FishBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    await t.console("clear FishBot");
    await t.console("difficulty peaceful");
    await t.console("time set 1000");
    // Build the pond: teleport first so the chunks load and
    // the fills land. A stone floor at -64, a clear above it
    // (this site's natural surface is ~y=-60, above the
    // floor — without the clear, the margins stay uneven
    // natural terrain), three blocks of water, and a 3x3
    // casting pad in the middle with its top at -60.
    await t.console("tp FishBot 500.5 -50 499.5");
    await t.sleep(1500);
    await t.console("fill 488 -64 488 512 -64 512 stone");
    await t.console("fill 488 -63 488 512 -56 512 air");
    await t.console("fill 490 -63 490 510 -61 510 water");
    await t.console("fill 499 -63 499 501 -61 501 stone");
    await t.console("tp FishBot 500.5 -60 500.5");
    await t.sleep(800);
    await t.console("give FishBot fishing_rod 1");
    await bot.equipItem("fishing_rod");
    await t.console("enchant FishBot minecraft:lure 3");
    await t.sleep(500);

    // Re-center on the pad and let the rotation settle before
    // a cast (a same-tick cast can go out with the previous
    // rotation, and a slipped bot casts from the wrong spot).
    const readyCast = async (x: number, y: number, z: number): Promise<void> => {
      await t.console("tp FishBot 500.5 -60 500.5");
      await t.sleep(400);
      await bot.lookAtPoint(x, y, z);
      await t.sleep(500);
    };

    // ---------------------------------------------------------
    // The full cycle: cast -> approach -> bite -> caught.
    // mineflayer's fish() drives the rod (it reels the moment
    // the bobber dips), so the whole sequence lands in one
    // mark window. The catch itself is the pond's random pick
    // from the fishing loot table — usually one of the four
    // fish, but treasure shows up too (an enchanted book was
    // caught in phase-22 verification), so the assertion is
    // any real item type name, not "<none>".
    // ---------------------------------------------------------
    await readyCast(508, -61.3, 500.5);
    const m = bot.messages.length;
    await bot.fishOnce(75_000);
    await waitNew(bot, m, "fish cast (hook: fish hook)", 10_000);
    await waitNew(bot, m, "fish state fishing line cast", 10_000);
    await waitNew(bot, m, "fish approaching", 10_000);
    await waitNew(bot, m, "fish bite", 10_000);
    await waitNew(bot, m, "bite confirmed via state", 10_000);
    await waitNew(bot, m, "fish state fish caught", 10_000);
    await bot.waitForMessage(/^fish caught: (?!<none>$)[a-z ]+$/, 10_000);

    // ---------------------------------------------------------
    // No bobber-in-ground section: the sub-event IS
    // implemented in all three routes (the events3 sample
    // has the handler, and the golden test pins the header),
    // but phase-22 diagnosis could not make Bukkit produce
    // PlayerFishEvent IN_GROUND on demand in this sandbox —
    // seven diagnostic rounds covered dry rests, shallow
    // source water, the pond-margin drift dip, a raised
    // reef rest, wall/pillar impacts, reeling a resting
    // bobber, and a slime bouncing on the resting bobber;
    // none fired it. The one probe-era firing was never
    // reproduced. Both runtimes dispatch the state from the
    // same Bukkit event the original wraps, so parity holds
    // by construction; the behavior assertion waits for a
    // reproducible trigger (full record in the dev log).
    // ---------------------------------------------------------

    // ---------------------------------------------------------
    // Early reel: a cast into the pond reeled in well before
    // any bite is the plain reel-in state.
    // ---------------------------------------------------------
    await readyCast(508, -61.3, 500.5);
    const r = bot.messages.length;
    bot.activateItem();
    await t.sleep(2500);
    bot.activateItem();
    await t.sleep(400);
    bot.deactivateItem();
    await waitNew(bot, r, "reel in", 15_000);
    await waitNew(bot, r, "fish state reel in", 10_000);
  } finally {
    bot.disconnect();
  }
});
