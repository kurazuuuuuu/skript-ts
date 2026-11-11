import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// keyed boss bars, styles, flags and the section creation form
// (phase 24): the /bossbar battery of the bossbar sample —
// create and read back, the create-resets-storage rule, style
// and flag round trips, the key read, keyed and plain section
// creation, storage in a persistent variable, and deletion —
// plus the wire packet of the shown keyed bar. All constructs
// are core language: this test runs under BOTH runtimes with
// identical expectations.

async function waitNew(bot: BehaviorBot, mark: number, pattern: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    if (fresh.includes(pattern)) {
      return pattern;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `bossbar.behavior: timed out after ${timeoutMs} ms waiting for ${JSON.stringify(pattern)}: ${JSON.stringify(fresh)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const EXPECTED_LINES: string[] = [
  "BB1 title=Alpha progress=0.25",
  "BB2 title= progress=0",
  "BB3 style=6 segments",
  "BB4 fog=on",
  "BB4 fog=off",
  "BB5 key=sktest:main",
  "BB6 title=SecT progress=0.3",
  "BB6 sky=on",
  "BB7 title=PlainT",
  "BB8 title=SecT",
  "BB9 title=<none>",
  "BB9 deleted",
];

export default defineBehavior(async (t) => {
  const bot = await t.connect("BbBot");
  try {
    await t.sleep(1000);
    await t.console("clear BbBot");
    await t.console("difficulty peaceful");
    await t.console("time set 1000");

    const mark = bot.messages.length;
    const bossMark = bot.bossBarPackets().length;
    bot.chat("/bossbar");

    // The shown keyed bar arrives as one add packet carrying the
    // title and progress set before the viewer was added
    // (color 6 is white on the wire, 0 dividers is solid).
    const added = await bot.waitForBossBarAction(0, 10_000, bossMark);
    if (added.title !== "Alpha" || added.health !== 0.25 || added.color !== 6 || added.dividers !== 0) {
      throw new Error(`unexpected keyed boss bar add packet: ${JSON.stringify(added)}`);
    }

    for (const line of EXPECTED_LINES) {
      await waitNew(bot, mark, line, 20_000);
    }
  } finally {
    await bot.disconnect();
  }
});
