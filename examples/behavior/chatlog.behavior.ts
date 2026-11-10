import { defineBehavior } from "../../src/behavior.js";

// chatlog.ts: chat messages are relayed to every op player with a
// "[LOG] <player>: <message>" prefix. An opped bot sees its own
// relayed message.
export default defineBehavior(async (t) => {
  const bot = await t.connect("LogBot");
  try {
    await t.console("op LogBot");
    bot.chat("hello-log-check");
    await bot.waitForMessage(/\[LOG\] LogBot: hello-log-check/);
  } finally {
    bot.disconnect();
  }
});
