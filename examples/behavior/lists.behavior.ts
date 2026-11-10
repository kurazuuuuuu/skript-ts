import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// lists.ts (phase 12): list variables, the extended loops, while
// and wait. All constructs are core language, so this test runs
// under BOTH runtimes with identical expectations:
//   list add appends at indices 1, 2, 3; the whole list reads
//   "apple, banana and apple"; remove deletes only the first
//   match and leaves a hole (the next show starts at index 2);
//   delete by index leaves the other entries in place; text
//   indices iterate before numeric ones;
//   times / range / while loops all sum 1..n the same way; and
//   wait suspends the rest of the trigger (the /delayed gap and
//   the /delayloop tick spacing are measured, not just ordered).
//
// The harness's waitForMessage scans the whole message buffer, so
// repeated expectations (two identical "item 2: banana" shows)
// would match stale copies. waitNew below only looks at messages
// that arrived after a mark taken before the command.
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

function expectGap(actualMs: number, minMs: number, what: string): void {
  if (actualMs < minMs) {
    throw new Error(`${what}: expected a gap of at least ${minMs}ms, got ${actualMs}ms`);
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("ListBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    // This test is command-dense: an unpaced burst gets the bot
    // kicked by the server's command-spam protection (observed in
    // the first runs of this test — the kick landed mid-test, once
    // right after /delayed, whose "done" then went to an offline
    // player), so every command goes through this helper with a
    // full second of pacing after it.
    const cmd = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(1000);
    };

    let mark = bot.messages.length;
    await cmd("/listshow");
    await waitNew(bot, mark, "list is empty");

    mark = bot.messages.length;
    await cmd("/listadd apple");
    await waitNew(bot, mark, "added apple; size=1");
    mark = bot.messages.length;
    await cmd("/listadd banana");
    await waitNew(bot, mark, "added banana; size=2");
    mark = bot.messages.length;
    await cmd("/listadd apple");
    await waitNew(bot, mark, "added apple; size=3");

    mark = bot.messages.length;
    await cmd("/listall");
    await waitNew(bot, mark, "all: apple, banana and apple");

    mark = bot.messages.length;
    await cmd("/listshow");
    await waitNew(bot, mark, "item 1: apple");
    await waitNew(bot, mark, "item 2: banana");
    await waitNew(bot, mark, "item 3: apple");

    // remove deletes only the first match: the banana at index 2
    // and the second apple at index 3 stay, index 1 is a hole.
    mark = bot.messages.length;
    await cmd("/listremove apple");
    await waitNew(bot, mark, "removed apple; size=2");
    mark = bot.messages.length;
    await cmd("/listshow");
    await waitNew(bot, mark, "item 2: banana");
    await waitNew(bot, mark, "item 3: apple");

    mark = bot.messages.length;
    await cmd("/listdel 3");
    await waitNew(bot, mark, "size=1");
    mark = bot.messages.length;
    await cmd("/listshow");
    await waitNew(bot, mark, "item 2: banana");

    mark = bot.messages.length;
    await cmd("/listclear");
    await waitNew(bot, mark, "cleared");
    mark = bot.messages.length;
    await cmd("/listshow");
    await waitNew(bot, mark, "list is empty");

    // Text indices: set on join ("color") and iterated before
    // the numeric index the add lands on.
    mark = bot.messages.length;
    await cmd("/tagshow");
    await waitNew(bot, mark, "tag color: red");
    mark = bot.messages.length;
    await cmd("/tagadd");
    await waitNew(bot, mark, "tag added; size=2");
    mark = bot.messages.length;
    await cmd("/tagshow");
    await waitNew(bot, mark, "tag color: red");
    await waitNew(bot, mark, "tag 1: misc");

    // The three loop forms agree on the sum 1..n.
    mark = bot.messages.length;
    await cmd("/countup 4");
    await waitNew(bot, mark, "sum=10");
    mark = bot.messages.length;
    await cmd("/rangesum 5");
    await waitNew(bot, mark, "rangesum=15");
    mark = bot.messages.length;
    await cmd("/whilesum 5");
    await waitNew(bot, mark, "whilesum=15");

    // wait suspends the rest of the trigger: "done" follows
    // "start" only after the 2-second wait. These two sends use
    // bot.chat directly (not cmd): the gap is measured from when
    // waitNew *detects* each message, and cmd's post-send pacing
    // sleep would let "start" sit in the buffer for a second and
    // shrink the measured gap. Spam safety is unaffected — the
    // previous cmd already paced a full second after its send.
    mark = bot.messages.length;
    bot.chat("/delayed");
    const start = await waitNew(bot, mark, "start");
    const done = await waitNew(bot, mark, "done");
    expectGap(done.at - start.at, 1400, "/delayed wait");

    // A wait inside a loop delays the following iterations too:
    // the two ticks land about a second apart, not together.
    mark = bot.messages.length;
    const sentAt = Date.now();
    bot.chat("/delayloop");
    const tick1 = await waitNew(bot, mark, "tick 1");
    const tick2 = await waitNew(bot, mark, "tick 2");
    expectGap(tick1.at - sentAt, 600, "/delayloop first tick");
    expectGap(tick2.at - tick1.at, 600, "/delayloop tick spacing");
  } finally {
    bot.disconnect();
  }
});
