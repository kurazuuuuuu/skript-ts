import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { defineBehavior } from "../../src/behavior.js";

// fontui.ts (RP-4): /fontui sends a message carrying the coin
// glyph and opens a chest GUI titled with the gem icon glyph.
// The glyphs are resource-pack font characters the project build
// resolved from fontchar-registry.json: the coin auto-allocated
// U+E000 and the gem icon U+E001. Both runtimes must agree —
// the resolved scripts are plain string literals by then, so
// the chat text and the window title carry the raw private-use
// characters themselves.
//
// fb3 H1: carrying the character is not enough — on a real
// client the glyph only renders if it is registered in the
// font the client draws untagged text with, minecraft:default.
// The glyphs used to be registered only in the pack font
// (example:default), which plain text never selects, so they
// showed as tofu boxes. The pack now mirrors its providers
// into assets/minecraft/font/default.json; this suite opens
// the built pack zip and asserts both glyphs the script sends
// are registered on that rendering side. (A real client's
// pixels are still a manual check — the bot cannot load the
// pack — but a missing registration is now caught here.)

/** Read one entry out of a zip through its local headers. */
function unzipEntry(zip: Buffer, wanted: string): Buffer | undefined {
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString("utf8", offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    if (name === wanted) {
      return method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    }
    offset = dataStart + compressedSize;
  }
  return undefined;
}

function assertGlyphsRegisteredInDefaultFont(): void {
  const zipPath = join(process.cwd(), "build", "example.zip");
  if (!existsSync(zipPath)) {
    throw new Error(
      `built pack not found at ${zipPath}; the H1 default-font registration check cannot run`,
    );
  }
  const entry = unzipEntry(readFileSync(zipPath), "assets/minecraft/font/default.json");
  if (entry === undefined) {
    throw new Error(
      "the built pack has no assets/minecraft/font/default.json: font glyphs are " +
        "registered only in the pack font and would render as tofu in plain text (fb3 H1)",
    );
  }
  const font = JSON.parse(entry.toString("utf8")) as {
    providers?: { type?: string; chars?: string[] }[];
  };
  const registered = new Set<string>();
  for (const provider of font.providers ?? []) {
    if (provider.type !== "bitmap") continue;
    for (const chars of provider.chars ?? []) {
      for (const ch of chars) registered.add(ch);
    }
  }
  for (const glyph of ["\uE000", "\uE001"]) {
    if (!registered.has(glyph)) {
      throw new Error(
        `glyph \\u${glyph.codePointAt(0)!.toString(16).toUpperCase()} is not registered in ` +
          `minecraft:default (registered: ${[...registered].join(", ") || "none"}); ` +
          "it would render as tofu on a real client (fb3 H1)",
      );
    }
  }
}

export default defineBehavior(async (t) => {
  assertGlyphsRegisteredInDefaultFont();
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
