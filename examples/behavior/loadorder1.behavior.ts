import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// Load order across scripts (feedback B4): two scripts handle
// the same chat event at the same priority, each appending
// its name to a shared list. The append order is the merged
// program's handler order: the engine follows the declared
// loadOrder (loadorder2.ts declares 10 and runs before
// loadorder1.ts with 20, despite the filenames), while
// Skript loads .sk files in filename order (loadorder1
// first). The suite pins exactly that difference, per mode.
async function waitOrderEntries(
  bot: BehaviorBot,
  mark: number,
  count: number,
  timeoutMs = 15_000,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = bot.messages.slice(mark).filter((m) => m.startsWith("order: "));
    if (entries.length >= count) return entries.slice(0, count);
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for ${count} order entries; fresh messages: ${bot.messages.slice(mark).join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("OrderBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    bot.chat("/orderreset");
    await bot.waitForMessage("orderreset: done");
    const mark = bot.messages.length;
    bot.chat("orderprobe");
    await t.sleep(1500); // both chat handlers append within this window
    bot.chat("/orderread");
    const actual = await waitOrderEntries(bot, mark, 2);
    const expected =
      t.mode === "engine" ? ["order: first", "order: second"] : ["order: second", "order: first"];
    if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
      throw new Error(
        `handler order in ${t.mode} mode: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  } finally {
    bot.disconnect();
  }
});
