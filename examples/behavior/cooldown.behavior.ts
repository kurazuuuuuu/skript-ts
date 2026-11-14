import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

/**
 * Command cooldown + executable-by (feedback C6), from
 * examples/cooldown.ts. Identical expectations under Skript
 * (the emitted .sk sections, enforced by the original) and
 * under the engine jar (the IR fields, enforced by the engine):
 *
 * - /ccool has a 3-second per-player cooldown: a first run
 *   broadcasts, an immediate second run does NOT broadcast and
 *   answers with the declared cooldown message instead, and a
 *   run after the cooldown has elapsed broadcasts again.
 * - /cponly is players-only: invoked from the CONSOLE its body
 *   must not run in either mode (asserted as the absence of its
 *   broadcast; the rejection's exact text is a runtime detail —
 *   the engine mirrors its permission-gate unknown-command
 *   failure). The /cboth console run right before it is the
 *   control proving console dispatch itself works, and the bot
 *   running /cponly itself proves the command exists.
 * - /cconly is console-only: a player run must not run its body
 *   either (absence again).
 *
 * The bot is deliberately NOT opped and holds no permissions:
 * an operator would hold the cooldown-bypass permission (both
 * runtimes grant it implicitly) and the cooldown would never
 * engage. Pacing follows commands.behavior.ts (marks into the
 * message buffer, 800ms between chat commands).
 */
export default defineBehavior(async (t) => {
  const bot = await t.connect("CoolBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    const waitMsg = async (
      b: BehaviorBot,
      mark: number,
      pattern: RegExp,
      timeoutMs = 15_000,
    ): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        for (let i = mark; i < b.messages.length; i++) {
          const m = b.messages[i]!;
          if (pattern.test(m)) return m;
        }
        if (Date.now() >= deadline) {
          const recent = b.messages.slice(mark).slice(-6).join(" | ") || "(none)";
          throw new Error(
            `timed out after ${timeoutMs}ms waiting for ${pattern}; recent: ${recent}`,
          );
        }
        await t.sleep(100);
      }
    };
    const chat = async (b: BehaviorBot, text: string): Promise<number> => {
      const mark = b.messages.length;
      b.chat(text);
      await t.sleep(800); // pace commands (Paper command-spam kick)
      return mark;
    };
    const expectNone = async (
      b: BehaviorBot,
      mark: number,
      pattern: RegExp,
      what: string,
      waitMs = 1000,
    ): Promise<void> => {
      await t.sleep(waitMs);
      for (let i = mark; i < b.messages.length; i++) {
        if (pattern.test(b.messages[i]!)) {
          throw new Error(`unexpected ${what}: ${b.messages[i]}`);
        }
      }
    };

    // -- Cooldown: first run runs the body. --
    let mark = await chat(bot, "/ccool");
    await waitMsg(bot, mark, /^ccool ran by CoolBot$/);

    // -- Second run inside the 3-second cooldown: the body does
    // not run again and the cooldown message arrives instead. --
    mark = await chat(bot, "/ccool");
    await waitMsg(bot, mark, /^ccool is on cooldown, please wait$/);
    await expectNone(bot, mark, /^ccool ran/, "second ccool broadcast inside the cooldown");

    // -- After the cooldown elapses, the command runs again. --
    await t.sleep(3500);
    mark = await chat(bot, "/ccool");
    await waitMsg(bot, mark, /^ccool ran by CoolBot$/);

    // -- Executable-by, console side: the control first (a
    // both-executable command DOES run from the console)... --
    mark = bot.messages.length;
    await t.console("cboth");
    await waitMsg(bot, mark, /^cboth ran$/);

    // -- ...then the players-only command from the console: its
    // body must not run in either mode. --
    mark = bot.messages.length;
    await t.console("cponly");
    await expectNone(bot, mark, /^cponly ran$/, "cponly broadcast from a console invocation", 1200);

    // The same command runs fine for the player itself.
    mark = await chat(bot, "/cponly");
    await waitMsg(bot, mark, /^cponly ran$/);

    // -- Executable-by, player side: the console-only command
    // must not run for a player. --
    mark = await chat(bot, "/cconly");
    await expectNone(bot, mark, /^cconly ran$/, "cconly broadcast from a player invocation", 1200);
  } finally {
    bot.disconnect();
  }
});
