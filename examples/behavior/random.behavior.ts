import { defineBehavior } from "../../src/behavior.js";

// random.ts (phase 28): random number / integer draws and the
// chance condition. All constructs are core language, so this
// test exercises the feature under BOTH runtimes with identical
// expectations. Randomness is asserted statistically, with
// tolerances many standard deviations wide:
//
//   /roll          -> "roll: N" with N in 1..6
//   /coinflip      -> "flip: heads" or "flip: tails"
//   /antiflip      -> "anti: draw" or "anti: no draw"
//   /jackpot       -> "jackpot: won" or "jackpot: lost"
//   /spanroll      -> "span: x" with 1 <= x < 2
//   /dicebattery   -> 100 draws over {1, 2, 3}: counts sum to
//                     100 (so every draw was in range) and each
//                     face lands within 12..58 (mean 33.3)
//   /chancebattery -> 100 checks at 0.5: true count 27..73
//                     (mean 50)
//   /chancebounds  -> chance(0) fires 0 of 50, chance(1) 50 of 50
export default defineBehavior(async (t) => {
  const bot = await t.connect("RandomBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    bot.chat("/roll");
    await bot.waitForMessage(/^roll: [1-6]$/);

    await t.sleep(1000);
    bot.chat("/coinflip");
    await bot.waitForMessage(/^flip: (heads|tails)$/);

    await t.sleep(1000);
    bot.chat("/antiflip");
    await bot.waitForMessage(/^anti: (draw|no draw)$/);

    await t.sleep(1000);
    bot.chat("/jackpot");
    await bot.waitForMessage(/^jackpot: (won|lost)$/);

    await t.sleep(1000);
    bot.chat("/spanroll");
    const span = await bot.waitForMessage(/^span: /);
    const spanValue = Number(span.slice("span: ".length));
    if (!(spanValue >= 1 && spanValue < 2)) {
      throw new Error(`spanroll out of range: ${span}`);
    }

    await t.sleep(1000);
    bot.chat("/dicebattery");
    const battery = await bot.waitForMessage(/^battery: /);
    const m = /^battery: c1=(\d+) c2=(\d+) c3=(\d+)$/.exec(battery);
    if (m === null) throw new Error(`unparsable battery line: ${battery}`);
    const counts = [Number(m[1]), Number(m[2]), Number(m[3])];
    const total = counts.reduce((a, b) => a + b, 0);
    if (total !== 100) {
      throw new Error(`dicebattery draws escaped 1..3: ${battery}`);
    }
    for (const c of counts) {
      if (c < 12 || c > 58) {
        throw new Error(`dicebattery face count off: ${battery}`);
      }
    }

    await t.sleep(1000);
    bot.chat("/chancebattery");
    const chanceLine = await bot.waitForMessage(/^chancebattery: /);
    const cm = /^chancebattery: true=(\d+)$/.exec(chanceLine);
    if (cm === null) throw new Error(`unparsable chancebattery line: ${chanceLine}`);
    const trues = Number(cm[1]);
    if (trues < 27 || trues > 73) {
      throw new Error(`chancebattery count off: ${chanceLine}`);
    }

    await t.sleep(1000);
    bot.chat("/chancebounds");
    await bot.waitForMessage("chancebounds: never=0 always=50");
  } finally {
    bot.disconnect();
  }
});
