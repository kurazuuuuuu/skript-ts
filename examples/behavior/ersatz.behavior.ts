import { defineBehavior } from "../../src/behavior.js";

// Ersatz placeholder slice of ersatz.ts (engine-only, phase 10).
// The round trip is exercised through the real PlaceholderAPI
// plugin deployed next to the engine in the sandbox: the script
// serves the prefixes "skriptts" (echoes the requested identifier)
// and "skripttswho" (answers with the prefix and the target
// player's name), and /papiget reads values back. Covered:
//   1. bare placeholder name form ("skriptts_greet")
//   2. a whole string holding one %...% token — and the identifier
//      "name" specifically branches inside the handler (core
//      text-equality condition, phase 11) to the player's name
//   3. a whole string mixing literal text and a token
//   4. the second prefix, with player() resolved to the target
//   5. an unresolvable placeholder staying literal ("%nope_missing%")
// Under Skript mode the ersatz script is not deployed at all, and
// PlaceholderAPI is not in the sandbox either, so there is nothing
// to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("PapiBot");
  try {
    bot.chat("/papiget skriptts_greet");
    await bot.waitForMessage("papi value: echo-greet");

    bot.chat("/papiget %skriptts_name%");
    await bot.waitForMessage("papi value: PapiBot");

    bot.chat("/papiget say %skriptts_greet%!");
    await bot.waitForMessage("papi value: say echo-greet!");

    bot.chat("/papiget skripttswho_test");
    await bot.waitForMessage("papi value: skripttswho for PapiBot");

    bot.chat("/papiget nope_missing");
    await bot.waitForMessage("papi value: %nope_missing%");
  } finally {
    bot.disconnect();
  }
});
