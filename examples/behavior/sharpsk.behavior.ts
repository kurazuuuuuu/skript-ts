import { defineBehavior } from "../../src/behavior.js";

// SharpSK timer slice of sharpsk.ts (engine-only, phase 7). The demo
// timer runs for 3 seconds: the tick event broadcasts the remaining
// seconds at 2 and 1, then the complete event fires and the timer is
// gone. The test walks the full lifecycle with message counts (the
// bot's buffer keeps earlier flows' messages, so counts — not first
// matches — are the reliable signal):
//   1. countdown to completion, then the timer reports inactive
//   2. pause freezes the countdown (no ticks, no completion), resume
//      lets it finish
//   3. stop removes the timer silently (no completion afterwards)
// Under Skript mode the sharpsk script is not deployed at all, so
// there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("TimerBot");
  const count = (sub: string): number => bot.messages.filter((m) => m.includes(sub)).length;
  const waitCount = async (sub: string, n: number, timeoutMs = 20_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (count(sub) < n) {
      if (Date.now() > deadline) {
        const recent = bot.messages.slice(-8).join(" | ") || "(none)";
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for ${n}x "${sub}" (saw ${count(sub)}); recent messages: ${recent}`,
        );
      }
      await t.sleep(100);
    }
  };
  try {
    // 1. Full countdown.
    bot.chat("/timerleft");
    await waitCount("timer demo is not active", 1);
    bot.chat("/timerstart");
    await waitCount("tick demo left 2", 1);
    await waitCount("tick demo left 1", 1);
    await waitCount("timer demo complete", 1);
    bot.chat("/timerleft");
    await waitCount("timer demo is not active", 2);

    // 2. Pause freezes the countdown; resume lets it finish.
    bot.chat("/timerstart");
    await waitCount("tick demo left 2", 2);
    bot.chat("/timerpause");
    await bot.waitForMessage("timer demo paused");
    await t.sleep(400); // let any in-flight tick land before snapshotting
    const ticksAtPause = count("tick demo");
    const completesAtPause = count("timer demo complete");
    await t.sleep(2_400);
    if (count("tick demo") !== ticksAtPause || count("timer demo complete") !== completesAtPause) {
      throw new Error("timer kept counting while paused");
    }
    bot.chat("/timerresume");
    await waitCount("tick demo left 1", 2);
    await waitCount("timer demo complete", 2);

    // 3. Stop removes the timer silently.
    bot.chat("/timerstart");
    await waitCount("timer demo started", 3);
    bot.chat("/timerstop");
    bot.chat("/timerleft");
    await waitCount("timer demo is not active", 3);
    await t.sleep(400);
    const ticksAtStop = count("tick demo");
    const completesAtStop = count("timer demo complete");
    await t.sleep(3_400);
    if (count("tick demo") !== ticksAtStop || count("timer demo complete") !== completesAtStop) {
      throw new Error("stopped timer kept firing");
    }
  } finally {
    bot.disconnect();
  }
});
