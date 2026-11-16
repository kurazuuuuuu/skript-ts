import { defineBehavior } from "../../src/behavior.js";

// smelt.ts (ext-events U1): the smelt event, driven end to end
// with real furnaces set up from the console (the same setup
// the semantics probes used: a furnace block whose inventory
// is filled by data merge, with BurnTime primed). Runs under
// BOTH runtimes with identical expectations — the semantics
// were probed against the real Skript 2.17.1 first:
//
// - raw iron: the filtered handler rewrites the result, so
//   the broadcast reads the REWRITTEN result ("smelted gold
//   ingot" — not the iron ingot the recipe would produce).
// - raw gold: the handler cancels, so "smelt blocked" is
//   broadcast and no result is produced.
async function waitNew(
  messages: readonly string[],
  mark: number,
  pattern: string,
  timeoutMs = 40_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = messages.slice(mark);
    const hit = fresh.find((m) => m === pattern);
    if (hit !== undefined) return hit;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("SmeltBot");
  try {
    await t.sleep(1000);
    await t.console("forceload add 288 288 319 319");
    // Iron furnace at (300,70,300), gold furnace at (301,70,300).
    await t.console("setblock 300 70 300 furnace");
    await t.console(
      'data merge block 300 70 300 {Items:[{Slot:0b,id:"minecraft:raw_iron",count:1b},{Slot:1b,id:"minecraft:coal",count:1b}],BurnTime:1s}',
    );
    await t.console("setblock 301 70 300 furnace");
    await t.console(
      'data merge block 301 70 300 {Items:[{Slot:0b,id:"minecraft:raw_gold",count:1b},{Slot:1b,id:"minecraft:coal",count:1b}],BurnTime:1s}',
    );
    const mark = bot.messages.length;
    await waitNew(bot.messages, mark, "smelted gold ingot");
    await waitNew(bot.messages, mark, "smelt blocked");
  } finally {
    bot.disconnect();
  }
});
