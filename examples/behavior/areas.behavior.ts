import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// areas.ts (ext-events U3): area enter/leave, ENGINE-ONLY —
// under Skript mode the script is not deployed at all, so the
// test only exercises the feature when t.mode is "engine".
//
// The sample defines "extzone" over x/z 400..404, y -60..-58.
// The test builds a platform under it, teleports the bot next
// to it (teleports do not fire the events — the transitions
// below come from walking), then walks east across the whole
// zone: "entered extzone" on the way in, "left extzone" on
// the way out.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    if (fresh.some((m) => m === pattern)) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}; position: ${JSON.stringify(bot.position())}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return;
  const bot = await t.connect("AreaBot");
  try {
    await t.sleep(1000);
    await t.console("fill 394 -61 394 412 -61 412 stone");
    await t.console("tp AreaBot 396.5 -60 402.5");
    await t.sleep(1000);
    const start = bot.position();
    await bot.lookAtPoint(start.x + 10, start.y, start.z);
    const mark = bot.messages.length;
    bot.setForward(true);
    try {
      await waitNew(bot, mark, "entered extzone");
      await waitNew(bot, mark, "left extzone");
    } finally {
      bot.setForward(false);
    }
  } finally {
    bot.disconnect();
  }
});
