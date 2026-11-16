import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// move.ts (ext-events U2): the move event, driven by a bot
// actually walking (teleports do not fire move events in
// either runtime). Runs under BOTH runtimes:
//
// - walking raises the /movecount counter;
// - with /movefreeze on, the handler cancels every move, so
//   the bot's position does not change while it tries to walk;
// - with it off again, walking moves the bot (and the count).
async function moveCount(bot: BehaviorBot): Promise<number> {
  const mark = bot.messages.length;
  bot.chat("/movecount");
  const deadline = Date.now() + 10_000;
  for (;;) {
    for (const m of bot.messages.slice(mark)) {
      const hit = /^moves (\d+)$/.exec(m);
      if (hit) return Number(hit[1]);
    }
    if (Date.now() >= deadline) throw new Error("timed out waiting for /movecount reply");
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function walk(bot: BehaviorBot, ms: number): Promise<void> {
  bot.setForward(true);
  await new Promise((r) => setTimeout(r, ms));
  bot.setForward(false);
  await new Promise((r) => setTimeout(r, 300));
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("MoveBot");
  let frozen = false;
  try {
    await t.sleep(1000);
    // Face open ground (the spawn platform) and walk.
    const p0 = bot.position();
    await bot.lookAtPoint(p0.x + 10, p0.y, p0.z);
    const before = await moveCount(bot);
    await walk(bot, 900);
    const after = await moveCount(bot);
    if (!(after > before)) {
      throw new Error(`move count did not rise while walking: ${before} -> ${after}`);
    }
    bot.chat("/movefreeze");
    frozen = true;
    await t.sleep(500);
    const frozenPos = bot.position();
    await walk(bot, 900);
    const stillPos = bot.position();
    const drift = Math.hypot(stillPos.x - frozenPos.x, stillPos.z - frozenPos.z);
    if (drift > 0.5) {
      throw new Error(`bot moved ${drift.toFixed(2)} blocks while moves were frozen`);
    }
    bot.chat("/movefreeze");
    frozen = false;
    await t.sleep(500);
    await walk(bot, 900);
    const endPos = bot.position();
    const gained = Math.hypot(endPos.x - stillPos.x, endPos.z - stillPos.z);
    if (gained < 0.5) {
      throw new Error(`bot did not move after unfreezing (gained ${gained.toFixed(2)})`);
    }
  } finally {
    if (frozen) bot.chat("/movefreeze");
    bot.disconnect();
  }
});
