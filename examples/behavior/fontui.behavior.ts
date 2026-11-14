import { defineBehavior } from "../../src/behavior.js";

// fontui.ts (RP-4): /fontui sends a message carrying the coin
// glyph and opens a chest GUI titled with the gem icon glyph.
// The glyphs are resource-pack font characters the project build
// resolved from fontchar-registry.json: the coin auto-allocated
// U+E000 and the gem icon U+E001. Both runtimes must agree —
// the resolved scripts are plain string literals by then, so
// the chat text and the window title carry the raw private-use
// characters themselves.
export default defineBehavior(async (t) => {
  const bot = await t.connect("FontUiBot");
  try {
    bot.chat("/fontui");
    // The message assertion: the coin glyph U+E000 is in the
    // chat text the player received.
    await bot.waitForMessage(/コイン: \uE000/);
    // The GUI assertion: a container window opened, and its
    // title carries the gem icon glyph U+E001. windowTitle()
    // returns the raw title (a JSON chat component string), so
    // the glyph may appear either as the literal character or
    // as its JSON \uXXXX escape — accept both spellings.
    await bot.waitForWindow();
    const title = bot.windowTitle();
    if (title === null) {
      throw new Error("the /fontui GUI opened without a readable title");
    }
    if (!title.includes("\uE001") && !/\\ue001/i.test(title)) {
      throw new Error(
        `expected the GUI title to contain the gem glyph \\uE001, got ${JSON.stringify(title)}`,
      );
    }
  } finally {
    bot.disconnect();
  }
});
