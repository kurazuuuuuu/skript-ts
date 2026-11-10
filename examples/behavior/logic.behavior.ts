import { defineBehavior } from "../../src/behavior.js";

// logic.ts (phase 11): core comparisons, logic and arithmetic.
// All constructs are core language, so this test exercises the
// feature under BOTH runtimes — the emitted .sk under Skript and
// the IR under the engine — with identical expectations:
//   chat "ping"     -> "pong" (text equality on the chat message)
//   chat "hello"    -> "hi, regular player" while not op, then
//                      "hi, boss" after being opped (and / not)
//   /calc 7         -> "calc: double=14, half=3.5, mod3=1"
//   /calc 120       -> the read-back plus a "big number: 120"
//                      broadcast (>= comparison)
//   /gate sesame    -> "gate opens"; /gate wrong -> "gate stays
//                      shut" (or over argument equality)
export default defineBehavior(async (t) => {
  const bot = await t.connect("LogicBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    bot.chat("ping");
    await bot.waitForMessage("pong");

    bot.chat("hello");
    await bot.waitForMessage("hi, regular player");

    bot.chat("/calc 7");
    await bot.waitForMessage("calc: double=14, half=3.5, mod3=1");

    bot.chat("/calc 120");
    await bot.waitForMessage("calc: double=240, half=60, mod3=0");
    await bot.waitForMessage("big number: 120");

    bot.chat("/gate sesame");
    await bot.waitForMessage("gate opens");

    bot.chat("/gate wrong");
    await bot.waitForMessage("gate stays shut");

    await t.console("op LogicBot");
    bot.chat("hello");
    await bot.waitForMessage("hi, boss");
  } finally {
    bot.disconnect();
  }
});
