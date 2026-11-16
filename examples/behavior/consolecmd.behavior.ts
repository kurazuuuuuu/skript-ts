import { defineBehavior } from "../../src/behavior.js";

// Console command execution (ext-console U1) is core language,
// so the identical expectations run under BOTH runtimes: each
// sample command dispatches a vanilla `say` command as the
// server console, and the bot — a plain player with no special
// permissions — receives the console's broadcast. That proves
// the command really ran as console (the bot could not `say`
// as the server itself), in the no-slash form, the leading-
// slash form the original's examples use, and a form built
// from a command argument.
export default defineBehavior(async (t) => {
  const bot = await t.connect("ConsoleCmdBot");
  try {
    await t.console("clear ConsoleCmdBot");
    bot.chat("/consolesay");
    await bot.waitForMessage("extconsole-fixed");
    await bot.waitForMessage("consolesay: dispatched");
    bot.chat("/consoleslash");
    await bot.waitForMessage("extconsole-slash");
    await bot.waitForMessage("consoleslash: dispatched");
    bot.chat("/consoleecho hello-console");
    await bot.waitForMessage(/extconsole-echo hello-console/);
    await bot.waitForMessage("consoleecho: dispatched");
  } finally {
    bot.disconnect();
  }
});
