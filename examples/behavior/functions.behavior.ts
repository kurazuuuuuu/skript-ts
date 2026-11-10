import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// functions.ts (phase 13): custom functions — definitions with
// typed parameters and defaults, calls as expressions and as
// statements, recursion, plural parameters, list returns,
// overloads, fresh-frame locals, stop, and a wait detaching the
// call. All constructs are core language, so this test runs
// under BOTH runtimes with identical expectations.
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

export default defineBehavior(async (t) => {
  const bot = await t.connect("FuncBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    // Commands are paced by ~1 s: an unpaced burst gets the bot
    // kicked by the server's command-spam protection (observed
    // in the phase-12 runs).
    const cmd = async (text: string): Promise<number> => {
      const mark = bot.messages.length;
      bot.chat(text);
      await t.sleep(1000);
      return mark;
    };

    // A plain value-returning function, called as an expression.
    let m = await cmd("/greet World");
    await waitNew(bot, m, "Hello, World!", 8000);

    // A call with a text literal, interpolated in a string.
    m = await cmd("/greetlit");
    await waitNew(bot, m, "lit=Hello, World!", 8000);

    // Defaults: the omitted trailing argument uses the default
    // (1); an explicit argument overrides it.
    m = await cmd("/greet2 Bob");
    await waitNew(bot, m, "greet2=Bob", 8000);
    m = await cmd("/greet3 Bob");
    await waitNew(bot, m, "greet3=BobBobBob", 8000);

    // Recursion: 5! = 120 (nested calls inside arithmetic).
    m = await cmd("/fact 5");
    await waitNew(bot, m, "fact=120", 8000);

    // A plural parameter fed by a list-returning function
    // assigned to a local list, and by a spread call.
    m = await cmd("/double 7");
    await waitNew(bot, m, "double=14", 8000);
    m = await cmd("/sumto 5");
    await waitNew(bot, m, "sumto=15", 8000);
    m = await cmd("/sum3");
    await waitNew(bot, m, "sum3=6", 8000);

    // Runtime type mismatch: {mismatch} holds the text "abc"
    // (set on join); passed to a number parameter it is NOT
    // converted — the parameter is simply unset. The body's
    // {_n} * 2 then applies Skript's missing-operand rule (a
    // missing operand with a number partner counts as 0), so
    // the call returns 0 — the 0 comes from the arithmetic rule,
    // not from any conversion of "abc".
    m = await cmd("/badcall");
    await waitNew(bot, m, "badcall=[0]", 8000);

    // Locals are a fresh frame per call: the function does not
    // see the caller's {_v}, and the caller's value survives.
    m = await cmd("/scope hello");
    await waitNew(bot, m, "fn sees v=[<none>]", 8000);
    await waitNew(bot, m, "mine=[hello]", 8000);

    // stop exits a void function early: flag 1 broadcasts, any
    // other flag does not (the command's own reply still comes).
    m = await cmd("/announce 1");
    await waitNew(bot, m, "announced", 8000);
    await waitNew(bot, m, "announce-done", 8000);
    m = await cmd("/announce 2");
    await waitNew(bot, m, "announce-done", 8000);
    if (bot.messages.slice(m).some((x) => x === "announced")) {
      throw new Error("announce(2) broadcast 'announced' despite the stop");
    }

    // Overloads dispatch by the argument's type.
    m = await cmd("/ov 5");
    await waitNew(bot, m, "ov=num:5", 8000);
    m = await cmd("/ovt hi");
    await waitNew(bot, m, "ov=text:hi", 8000);

    // A wait inside the function detaches the call: the caller
    // resumes immediately with no value, and the rest of the body
    // runs on its own a second later (its return is dropped).
    m = await cmd("/slow");
    await waitNew(bot, m, "slow=[<none>]", 8000);
    await waitNew(bot, m, "slow tail", 8000);
  } finally {
    bot.disconnect();
  }
});
