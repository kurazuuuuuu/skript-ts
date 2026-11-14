import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// sorted.ts (feedback C5): sortedList(list). All constructs are
// core language, so this test runs under BOTH runtimes with
// identical expectations, as probed against the real Skript
// 2.17.1: an all-number list sorts ascending numerically
// (3, 1, 2 -> "1, 2 and 3"), an all-text list sorts ascending
// case-insensitively (banana, Apple, cherry -> "Apple, banana
// and cherry"), a mixed number/text list yields no value (the
// sorted list renders <none>), a split result sorts when
// assigned into a list variable, and a global list variable
// sorts the same way as a local one.
//
// Like the other command tests, commands are paced (the server
// kicks unpaced command bursts) and waitNew only scans messages
// that arrived after a fresh mark.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<{ msg: string; at: number }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m.includes(pattern));
    if (hit !== undefined) return { msg: hit, at: Date.now() };
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("SortedBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    const cmd = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(1000);
    };

    let mark = bot.messages.length;
    await cmd("/sortnums");
    await waitNew(bot, mark, "nums=1, 2 and 3");

    mark = bot.messages.length;
    await cmd("/sorttexts");
    await waitNew(bot, mark, "texts=Apple, banana and cherry");

    mark = bot.messages.length;
    await cmd("/sortmixed");
    await waitNew(bot, mark, "mixed=<none>");

    mark = bot.messages.length;
    await cmd("/sortsplit");
    await waitNew(bot, mark, "split=apple, kiwi and pear");

    mark = bot.messages.length;
    await cmd("/sortglobal");
    await waitNew(bot, mark, "global=10, 20 and 30");
  } finally {
    bot.disconnect();
  }
});
