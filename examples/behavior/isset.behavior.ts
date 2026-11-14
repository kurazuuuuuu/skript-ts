import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// isset.ts (feedback T3 / C4): the isSet presence condition.
// All constructs are core language, so this test runs under
// BOTH runtimes with identical expectations: a single /isset
// pass reports, in order, an unset local, that local set to an
// empty text (still set — presence is not content), a global
// before / after being set and after being deleted (plus the
// native `is not set` form), a maybe-style function that
// returns a value only for "yes" checked directly as a call
// result, and a whileLoop headed by isSet that runs once,
// deletes its own guard, and leaves the guard unset.
//
// Like the other command tests, waitNew only scans messages
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
  const bot = await t.connect("IssetBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    const mark = bot.messages.length;
    bot.chat("/isset");
    await waitNew(bot, mark, "isset: local=unset");
    await waitNew(bot, mark, "isset: empty=set");
    await waitNew(bot, mark, "isset: global=unset");
    await waitNew(bot, mark, "isset: global-after-set=set");
    await waitNew(bot, mark, "isset: global-after-delete=unset");
    await waitNew(bot, mark, "isset: global-not-set=T");
    await waitNew(bot, mark, "isset: maybe-yes=set");
    await waitNew(bot, mark, "isset: maybe-no=unset");
    await waitNew(bot, mark, "isset: maybe-no-not-set=T");
    await waitNew(bot, mark, "isset: while=ran");
    await waitNew(bot, mark, "isset: guard=unset");
  } finally {
    bot.disconnect();
  }
});
