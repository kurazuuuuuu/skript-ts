import { defineBehavior } from "../../src/behavior.js";

// math.ts (phase 29): the built-in math functions. All constructs
// are core language, so this test exercises the feature under BOTH
// runtimes — the emitted .sk under Skript and the IR under the
// engine — with identical expectations:
//   /math 2.5       -> floor/ceil/round/abs/sqrt read-back
//   /math -2.5      -> the negative side: floor rounds down, round
//                      halves toward +infinity, sqrt is NaN
//   /mathround 2.675 -> 2 places on the decimal representation
//   /mathround 14.9 -> the tens place: 20, not 10
//   /mathmin 7      -> min/max against literals; an unset local
//                      drops out of min instead of poisoning it
//   /mathbig        -> floor/ceil saturate at the long extremes
export default defineBehavior(async (t) => {
  const bot = await t.connect("MathBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    bot.chat("/math 2.5");
    await bot.waitForMessage("math: floor=2, ceil=3, round=3, abs=2.5, sqrt=1.58");

    bot.chat("/math -2.5");
    await bot.waitForMessage("math: floor=-3, ceil=-2, round=-2, abs=2.5, sqrt=NaN");

    bot.chat("/mathround 2.675");
    await bot.waitForMessage("round: two=2.68, tens=0");

    bot.chat("/mathround 14.9");
    await bot.waitForMessage("round: two=14.9, tens=20");

    bot.chat("/mathmin 7");
    await bot.waitForMessage("minmax: min=3, max=10, missmin=7");

    bot.chat("/mathmin -5");
    await bot.waitForMessage("minmax: min=-5, max=10, missmin=-5");

    bot.chat("/mathbig");
    await bot.waitForMessage("big: floor=9223372036854775807, ceil=-9223372036854775808");
  } finally {
    bot.disconnect();
  }
});
