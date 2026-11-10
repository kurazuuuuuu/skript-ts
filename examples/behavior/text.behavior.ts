import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// text.ts (phase 15): text operations. All constructs are core
// language, so this test runs under BOTH runtimes with identical
// expectations:
//   case conversion and the fitted substring behind /shout;
//   character-at / first / last and lowercase behind /initial;
//   split into a list variable (the empty part counts), the
//   loop read-back, and join — from the list, and nested
//   directly from a split — behind /csv;
//   replace-first and case-insensitive replace-all behind /swap;
//   the contains (case-insensitive) / starts-with / ends-with
//   (case-sensitive) branches behind /check;
//   and behind /paint: color parsing is visible only as plain
//   text ("paint: OK", "plain: Red"), but the EQUALITY of a
//   parsed colored/formatted value with its § literal is a real
//   text-level observable in both runtimes (component equality
//   in Skript, string equality in the engine) — probed in both
//   directions during the phase's probe rounds.
//
// Like the other command-dense tests, commands are paced 1s
// apart against the server's command-spam kick, and waitNew
// only scans messages that arrived after a fresh mark.
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
  const bot = await t.connect("TextBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    const cmd = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(1000);
    };

    let mark = bot.messages.length;
    await cmd("/shout hello");
    await waitNew(bot, mark, "plain: HELLO");
    mark = bot.messages.length;
    await cmd("/shout !hey");
    await waitNew(bot, mark, "loud: HEY");

    mark = bot.messages.length;
    await cmd("/initial Hello");
    await waitNew(bot, mark, "first=H last=o mid=el");
    await waitNew(bot, mark, "head=He tail=lo lower=hello");

    mark = bot.messages.length;
    await cmd("/csv a,b,,c");
    await waitNew(bot, mark, "parts=4");
    await waitNew(bot, mark, "part 1=a");
    await waitNew(bot, mark, "part 2=b");
    await waitNew(bot, mark, "part 3=");
    await waitNew(bot, mark, "part 4=c");
    await waitNew(bot, mark, "joined=a | b |  | c");
    await waitNew(bot, mark, "nested=a+b++c");

    mark = bot.messages.length;
    await cmd("/swap banana");
    await waitNew(bot, mark, "first=bonana");
    await waitNew(bot, mark, "ci=b0n0n0");

    mark = bot.messages.length;
    await cmd("/check hello");
    await waitNew(bot, mark, "has-ell");
    await waitNew(bot, mark, "starts-he");
    await waitNew(bot, mark, "ends-lo");
    await waitNew(bot, mark, "no-z");

    // jello: starts-with correctly stays silent; the other
    // three branches still fire.
    mark = bot.messages.length;
    await cmd("/check jello");
    await waitNew(bot, mark, "has-ell");
    await waitNew(bot, mark, "ends-lo");
    await waitNew(bot, mark, "no-z");

    mark = bot.messages.length;
    await cmd("/paint");
    await waitNew(bot, mark, "paint: OK");
    await waitNew(bot, mark, "plain: Red");
    await waitNew(bot, mark, "len: 5");

    mark = bot.messages.length;
    await cmd("/paeq &aX");
    await waitNew(bot, mark, "paint-eq=T");
    mark = bot.messages.length;
    await cmd("/fmteq <b>Bold</b>");
    await waitNew(bot, mark, "fmt-eq=T");
  } finally {
    bot.disconnect();
  }
});
