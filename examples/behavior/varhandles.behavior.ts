import { defineBehavior } from "../../src/behavior.js";

// varhandles.ts (feedback E6 / E7): typed variable handles.
// The bot's balance lives behind playerVar("balance") and a
// localHandle("bonus") scratch variable inside the applyBonus
// function. All constructs are core language, so this test
// exercises the feature under BOTH runtimes — the emitted .sk
// under Skript and the IR under the engine — with identical
// expectations:
//   join            -> "balance=100" (set on join via the handle)
//   /balance        -> "balance=100" (read via the handle)
//   /earn 50        -> "balance=150" (add via the handle)
//   /spend 30       -> "balance=120" (remove via the handle)
//   /balance        -> "balance=120"
//   /bonus          -> "bonus=115" (localHandle inside a function)
//   /clearbalance   -> "balance=<none>" (delete via the handle)
export default defineBehavior(async (t) => {
  const bot = await t.connect("VarHandleBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    await bot.waitForMessage("balance=100");

    bot.chat("/balance");
    await bot.waitForMessage("balance=100");

    await t.sleep(600); // pace commands (Paper command-spam kick)
    bot.chat("/earn 50");
    await bot.waitForMessage("balance=150");

    await t.sleep(600);
    bot.chat("/spend 30");
    await bot.waitForMessage("balance=120");

    await t.sleep(600);
    bot.chat("/balance");
    await bot.waitForMessage("balance=120");

    await t.sleep(600);
    bot.chat("/bonus");
    await bot.waitForMessage("bonus=115");

    await t.sleep(600);
    bot.chat("/clearbalance");
    await bot.waitForMessage("balance=<none>");
  } finally {
    bot.disconnect();
  }
});
