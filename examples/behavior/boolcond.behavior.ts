import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// boolcond.ts (feedback E3 + E4): boolean expressions as
// conditions, lowering to `is true`, plus the when / unless /
// stopIf sugar. All constructs are core language, so this test
// runs under BOTH runtimes with identical expectations:
//   /boolcond   -> "var-true" (boolean variable as an ifElse
//                  condition), "fn-true" (boolean-returning
//                  function call as a condition), "looped=3"
//                  (boolean variable as a whileLoop head),
//                  "and-true" / "or-true" / "not-false" (logic
//                  over boolean expressions), "when-true" and
//                  "unless-false" (sugar), then "done" — the
//                  "should-not-appear" lines are never sent
//   /boolstop   -> "before-stop" only: stopIf(true) ends the
//                  trigger, "after-stop" is never sent
//   /boolnostop -> "survived-stop": stopIf(false) does not stop
//
// The harness's waitForMessage scans the whole message buffer,
// so repeated expectations would match stale copies; waitNew
// only looks at messages that arrived after a mark.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m === pattern);
    if (hit !== undefined) return hit;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function expectAbsent(bot: BehaviorBot, mark: number, pattern: string): void {
  const hit = bot.messages.slice(mark).find((m) => m === pattern);
  if (hit !== undefined) {
    throw new Error(`unexpected message "${hit}" (this branch should not have run)`);
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("BoolBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    // Commands are paced by ~1 s: an unpaced burst gets the bot
    // kicked by the server's command-spam protection (observed
    // in the phase-12/13 runs).
    const cmd = async (text: string): Promise<number> => {
      const mark = bot.messages.length;
      bot.chat(text);
      await t.sleep(1000);
      return mark;
    };

    let m = await cmd("/boolcond");
    await waitNew(bot, m, "boolcond: var-true");
    await waitNew(bot, m, "boolcond: fn-true");
    await waitNew(bot, m, "boolcond: looped=3");
    await waitNew(bot, m, "boolcond: and-true");
    await waitNew(bot, m, "boolcond: or-true");
    await waitNew(bot, m, "boolcond: not-false");
    await waitNew(bot, m, "boolcond: when-true");
    await waitNew(bot, m, "boolcond: unless-false");
    await waitNew(bot, m, "boolcond: done");
    expectAbsent(bot, m, "boolcond: var-false");
    expectAbsent(bot, m, "boolcond: fn-false");
    expectAbsent(bot, m, "boolcond: fn-false-should-not-appear");
    expectAbsent(bot, m, "boolcond: when-false-should-not-appear");
    expectAbsent(bot, m, "boolcond: unless-true-should-not-appear");

    m = await cmd("/boolstop");
    await waitNew(bot, m, "boolcond: before-stop");
    await t.sleep(1000); // give a wrongly-continuing trigger time to send
    expectAbsent(bot, m, "boolcond: after-stop-should-not-appear");

    m = await cmd("/boolnostop");
    await waitNew(bot, m, "boolcond: survived-stop");
  } finally {
    bot.disconnect();
  }
});
