import { defineBehavior } from "../../src/behavior.js";

// World-border slice of mundosk.ts (engine-only, phase 6): /border
// <size> sets the world border size of the player's world and the
// script reports the size back by reading the border size expression,
// so the assertion covers both the set effect and the read-back.
// Under Skript mode the mundosk script is not deployed at all, so
// there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("BorderBot");
  try {
    bot.chat("/border 100");
    await bot.waitForMessage("border size is now 100");
    bot.chat("/border 59999968");
    await bot.waitForMessage("border size is now 59999968");
  } finally {
    bot.disconnect();
  }
});
