import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

/**
 * Command definitions (phase 20): two bots exercise the
 * multi-argument commands of examples/commands.ts — typed values,
 * an omitted optional, the Brigadier failure messages for bad
 * values / offline names / leftover tokens, backtracking past an
 * optional argument, the permission gate, the usage line and the
 * aliases. Identical expectations under Skript (the emitted .sk)
 * and under the engine jar (the IR): argument parsing is part of
 * the shared behavior contract.
 */
export default defineBehavior(async (t) => {
  const a = await t.connect("CmdA");
  const b = await t.connect("CmdB");
  try {
    await t.console("op CmdA");
    await t.sleep(500);

    // Messages are matched only after a mark: the buffer keeps
    // everything a bot has ever received, including ambient
    // broadcasts from other samples.
    const waitMsg = async (
      bot: BehaviorBot,
      mark: number,
      pattern: RegExp,
      timeoutMs = 15_000,
    ): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        for (let i = mark; i < bot.messages.length; i++) {
          const m = bot.messages[i]!;
          if (pattern.test(m)) return m;
        }
        if (Date.now() >= deadline) {
          const recent = bot.messages.slice(mark).slice(-6).join(" | ") || "(none)";
          throw new Error(
            `timed out after ${timeoutMs}ms waiting for ${pattern}; recent: ${recent}`,
          );
        }
        await t.sleep(100);
      }
    };
    const chat = async (bot: BehaviorBot, text: string): Promise<number> => {
      const mark = bot.messages.length;
      bot.chat(text);
      await t.sleep(800); // pace commands (Paper command-spam kick)
      return mark;
    };
    const expectNone = async (
      bot: BehaviorBot,
      mark: number,
      pattern: RegExp,
      what: string,
    ): Promise<void> => {
      await t.sleep(700);
      for (let i = mark; i < bot.messages.length; i++) {
        if (pattern.test(bot.messages[i]!)) {
          throw new Error(`unexpected ${what}: ${bot.messages[i]}`);
        }
      }
    };

    // -- Typed arguments: player + optional integer. --
    let markA = a.messages.length;
    let markB = b.messages.length;
    await chat(a, "/cpoke CmdB 3");
    await waitMsg(a, markA, /^cpoke target=CmdB n=3$/);
    await waitMsg(b, markB, /^cpoke: poked by CmdA$/);

    markA = await chat(a, "/cpoke CmdB");
    await waitMsg(a, markA, /^cpoke target=CmdB n=<none>$/);

    // An offline player name fails the invocation: the error goes
    // to the sender and the trigger never runs.
    markA = a.messages.length;
    await chat(a, "/cpoke Ghost 3");
    await waitMsg(a, markA, /^No player was found$/);
    await expectNone(a, markA, /^cpoke target=/, "cpoke broadcast for an offline target");

    // Brigadier feedback is ONE chat message: the reason, a
    // newline, then the context line.
    markA = await chat(a, "/cpoke CmdB x");
    await waitMsg(a, markA, /^Expected long\n.*<--\[HERE\]$/);

    // -- Number and boolean arguments. --
    markA = await chat(a, "/croll 1.5 true");
    await waitMsg(a, markA, /^croll num=1\.5 bool=true$/);

    markA = await chat(a, "/croll 1 yes");
    await waitMsg(
      a,
      markA,
      /^Invalid boolean: expected 'true' or 'false' but found 'yes'\n.*<--\[HERE\]$/,
    );

    // -- Item argument: a single-token id, printed as the type name. --
    markA = await chat(a, "/citem diamond_sword");
    await waitMsg(a, markA, /^citem item=diamond sword$/);

    markA = await chat(a, "/citem junk_thing");
    await waitMsg(a, markA, /^Unknown item 'minecraft:junk_thing'\n.*<--\[HERE\]$/);

    // -- Trailing text takes the rest of the line. --
    markA = await chat(a, "/ctell CmdB hello there world");
    await waitMsg(a, markA, /^ctell to=CmdB text=hello there world$/);

    // -- Backtracking: an optional integer before a required text. --
    markA = await chat(a, "/cmix hello");
    await waitMsg(a, markA, /^cmix n=<none> text=hello$/);

    markA = await chat(a, "/cmix 4 hello");
    await waitMsg(a, markA, /^cmix n=4 text=hello$/);

    // -- Offline player argument: any name resolves. --
    markA = await chat(a, "/coff Ghost");
    await waitMsg(a, markA, /^coff p=Ghost$/);

    // -- Permission: a sender without it cannot address the
    // command at all; the failure reads like an unknown command
    // and the trigger never runs. --
    markB = b.messages.length;
    markA = a.messages.length;
    await chat(b, "/cadmin");
    await waitMsg(
      b,
      markB,
      /^Unknown or incomplete command\. See below for error\ncadmin<--\[HERE\]$/,
    );
    await expectNone(a, markA, /^cadmin ran/, "cadmin broadcast from a sender without permission");
    await expectNone(b, markB, /^cadmin ran/, "cadmin broadcast from a sender without permission");

    markA = await chat(a, "/cadmin");
    await waitMsg(a, markA, /^cadmin ran by CmdA$/);

    // -- Usage: missing arguments answer with the usage line;
    // leftover tokens are the structural Brigadier failure. --
    markA = await chat(a, "/cuse");
    await waitMsg(a, markA, /^USAGE \/cuse <count>$/);

    markA = await chat(a, "/cuse 1 2");
    await waitMsg(a, markA, /^Incorrect argument for command\n.*<--\[HERE\]$/);

    markA = await chat(a, "/cuse 7");
    await waitMsg(a, markA, /^cuse n=7$/);

    // -- Aliases: all three names run the same trigger. --
    for (const name of ["/calias", "/ca2", "/ca3"]) {
      markA = await chat(a, name);
      await waitMsg(a, markA, /^calias ran$/);
    }

    // -- The console can run script commands too. --
    markA = a.messages.length;
    await t.console("cpoke CmdB 2");
    await waitMsg(a, markA, /^cpoke target=CmdB n=2$/);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
