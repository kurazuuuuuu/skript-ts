import { defineBehavior } from "../../src/behavior.js";

// chunktags.ts is engine-only (chunk tags live in the chunk's
// PersistentDataContainer, which Skript cannot access), so
// under Skript mode there is nothing to exercise and this test
// passes without running. Under the engine it pins the flow
// from the brief: /chunkmark places a stone block at the bot
// and stamps the placed block's chunk with a text, a number
// and a boolean tag; /chunkcheck reads all three back through
// the bot's location (the same chunk), branches on
// hasChunkTag, deletes the text tag, and shows the deleted tag
// reading as <none> while the block itself is really stone.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only feature; see header comment
  const bot = await t.connect("ChunkTagBot");
  try {
    // A deterministic platform at a dedicated far spot, like
    // the other world-touching suites: teleport first so the
    // chunk is loaded, then fill.
    await t.console("difficulty peaceful");
    await t.console("tp ChunkTagBot 400.5 -60 400.5");
    await t.sleep(500);
    await t.console("fill 396 -61 396 404 -61 404 stone");
    await t.console("fill 396 -60 396 404 -56 404 air");
    await t.console("tp ChunkTagBot 400.5 -60 400.5");
    await t.sleep(500);
    await t.console("clear ChunkTagBot");

    const pos = bot.position();
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    bot.chat("/chunkmark");
    await bot.waitForMessage("chunkmark: marked");

    // The placed block is real world state, not just a message.
    const deadline = Date.now() + 10_000;
    for (;;) {
      if (bot.blockNameAt(bx, by, bz) === "stone") break;
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out waiting for the placed stone at ${bx},${by},${bz}; saw ${bot.blockNameAt(bx, by, bz)}`,
        );
      }
      await t.sleep(100);
    }

    bot.chat("/chunkcheck");
    await bot.waitForMessage(/chunkcheck: placed=stone-marker count=7 owned=true/);
    await bot.waitForMessage("chunkcheck: tagged=yes");
    await bot.waitForMessage("chunkcheck: after-delete=untagged");
    await bot.waitForMessage(/chunkcheck: missing=<none>/);
  } finally {
    bot.disconnect();
  }
});
