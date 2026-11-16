import { defineBehavior } from "../../src/behavior.js";

// varindex.ts (ext-varindex): multi-level variable indices.
// Core language, identical expectations under BOTH runtimes:
//   /skillset mining 42  -> "skillset=42"   ({skillxp::%player%::%skill%}, player segment keys by UUID in the engine)
//   /skillread mining    -> "skill=42"
//   /skilladd mining 8   -> "skilladded=50"
//   /skilldel mining     -> "skillafterdel=<none>"
//   /visetup             -> "visetup done"  ({vindex::"a"::"b"}="AB", {vindex::"a"::"c"}="AC", {vindex::"d"}="D")
//   /viread A B          -> "vi=AB" (segments are case-insensitive: read back via "A"/"B")
//   /viread a c          -> "vi=AC";  /viread1 d -> "vi1=D"
//   /visize              -> "visize=1" + "vi entry d=D" ({*} sees direct scalar children only, probed)
//   /vifn                -> "vifn=fnval"     (multi-level local handle inside a function frame)
//   /videlone            -> "videl done", then /viread a b -> "vi=<none>", /viread a c -> "vi=AC"
//   /viclear             -> "vicleared size=0"     (delete {vindex::*} clears every segment depth)
export default defineBehavior(async (t) => {
  const bot = await t.connect("VarIndexBot");
  try {
    await t.sleep(1000);

    bot.chat("/skillset mining 42");
    await bot.waitForMessage("skillset=42");
    await t.sleep(600);
    bot.chat("/skillread mining");
    await bot.waitForMessage("skill=42");
    await t.sleep(600);
    bot.chat("/skillread Mining");
    await bot.waitForMessage("skill=42");
    await t.sleep(600);
    bot.chat("/skilladd mining 8");
    await bot.waitForMessage("skilladded=50");
    await t.sleep(600);
    bot.chat("/skilldel mining");
    await bot.waitForMessage("skillafterdel=<none>");

    await t.sleep(600);
    bot.chat("/visetup");
    await bot.waitForMessage("visetup done");
    await t.sleep(600);
    bot.chat("/viread A B");
    await bot.waitForMessage("vi=AB");
    await t.sleep(600);
    bot.chat("/viread a c");
    await bot.waitForMessage("vi=AC");
    await t.sleep(600);
    bot.chat("/viread1 d");
    await bot.waitForMessage("vi1=D");
    await t.sleep(600);
    bot.chat("/visize");
    await bot.waitForMessage("visize=1");
    await bot.waitForMessage("vi entry d=D");
    await t.sleep(600);
    bot.chat("/vifn");
    await bot.waitForMessage("vifn=fnval");
    await t.sleep(600);
    bot.chat("/videlone");
    await bot.waitForMessage("videl done");
    await t.sleep(600);
    bot.chat("/viread a b");
    await bot.waitForMessage("vi=<none>");
    await t.sleep(600);
    bot.chat("/viread a c");
    await bot.waitForMessage("vi=AC");
    await t.sleep(600);
    bot.chat("/viclear");
    await bot.waitForMessage("vicleared size=0");
  } finally {
    bot.disconnect();
  }
});
