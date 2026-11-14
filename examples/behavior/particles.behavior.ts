import { defineBehavior } from "../../src/behavior.js";

// Particles & fireworks (feedback D, engine-only). These are
// fire-and-forget VISUAL effects: a mineflayer bot cannot see
// particles or a firework burst, so this test asserts EXECUTION,
// not visuals — each command's follow-up broadcast proves the
// effect statement ran in the engine without errors and the
// trigger continued past it. (A statement that threw would abort
// the trigger before its broadcast.)
// Under Skript mode the particles script is not deployed at all,
// so there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("ParticleBot");
  try {
    bot.chat("/particles");
    await bot.waitForMessage("particles spawned");
    bot.chat("/firework");
    await bot.waitForMessage("firework launched");
    bot.chat("/fireworkdefault");
    await bot.waitForMessage("default firework launched");
  } finally {
    bot.disconnect();
  }
});
