
import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// timespans (phase 23): the value battery of the timespan
// sample (literals of every unit, arithmetic, comparisons,
// eternity, functions), a wait driven by a timespan
// expression, title timings given as expressions, and the
// fishing wait / bite / angle values read and retuned inside
// a cast handler. All constructs are core language: this test
// runs under BOTH runtimes with identical expectations.

async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs: number = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    for (const message of fresh) {
      if (message === pattern) {
        return message;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timespan.behavior: timed out after ${timeoutMs} ms waiting for ${JSON.stringify(pattern)}; fresh messages: ${JSON.stringify(fresh)}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

async function waitStamp(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    for (const message of fresh) {
      if (message === pattern) {
        return Date.now();
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timespan.behavior: timed out after ${timeoutMs} ms waiting for ${JSON.stringify(pattern)}; fresh messages: ${JSON.stringify(fresh)}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

const EXPECTED_CALC: string[] = [
  "TS lit90=[1 minute and 30 seconds]",
  "TS lit100t=[5 seconds]",
  "TS lit25h=[1 day and 1 hour]",
  "TS lit8d=[1 week and 1 day]",
  "TS lit400d=[1 year and 1 month and 5 days]",
  "TS lit2mo=[2 months]",
  "TS lit1y=[1 year]",
  "TS lit0=[0 seconds]",
  "TS lit1t=[0.05 seconds]",
  "TS lit19t=[0.95 seconds]",
  "TS lit2.5s=[2.5 seconds]",
  "TS lit59999=[60 seconds]",
  "TS lit119999=[1 minute and 60 seconds]",
  "TS comp=[1 hour and 30 minutes]",
  "TS add=[8 seconds]",
  "TS sub=[2 seconds]",
  "TS subrev=[0 seconds]",
  "TS mul=[10 seconds]",
  "TS mulrev=[10 seconds]",
  "TS div=[2.5 seconds]",
  "TS ratio=[1.67]",
  "TS trunc=[0.5 seconds]",
  "TS inf=[forever]",
  "TS infminus=[forever]",
  "TS infzero=[0 seconds]",
  "TS mix=[<none>]",
  "TS neg=[<none>]",
  "TS stmtadd=[8 seconds]",
  "TS stmtremove=[0 seconds]",
  "TS global=[33 seconds]",
  "TS listelem=[44 seconds]",
  "TS eq=true",
  "TS gt=true",
  "TS lt=true",
  "TS eqnum=false",
  "TS infeq=true",
  "TS fn=[7 seconds]",
  "TS fnvar=[5 seconds]",
  "TS fndef=[42 seconds]",
  "TS fncount=[3]",
];

export default defineBehavior(async (t) => {
  const bot = await t.connect("TsBot");
  try {
    await t.sleep(1000);
    await t.console("clear TsBot");
    await t.console("difficulty peaceful");
    await t.console("time set 1000");

    // ------------------------------------------------------------------
    // the calc battery: literals of every unit, arithmetic, comparisons,
    // eternity and function results, each echoed verbatim once.
    // ------------------------------------------------------------------
    const calcMark = bot.messages.length;
    await t.console("tscalc");
    for (const line of EXPECTED_CALC) {
      await waitNew(bot, calcMark, line, 20_000);
    }

    // ------------------------------------------------------------------
    // the wait: driven by a timespan expression, the scripted 2 second
    // pause must land inside the observed window.
    // ------------------------------------------------------------------
    const waitMark = bot.messages.length;
    await t.console("tswait");
    const t0 = await waitStamp(bot, waitMark, "TS wait start", 10_000);
    const t1 = await waitStamp(bot, waitMark, "TS wait end", 15_000);
    const gap = t1 - t0;
    if (gap < 1200 || gap > 8000) {
      throw new Error(
        `timespan.behavior: observed wait gap ${gap} ms is outside the expected window; the scripted wait is 2 seconds and both runtimes schedule it in 50 ms ticks, so the observed gap must be near 2000 ms`,
      );
    }

    // ------------------------------------------------------------------
    // the title: fade in, stay and fade out timings given as timespan
    // expressions and read back through the title-time probe.
    // ------------------------------------------------------------------
    const timeMark = bot.titleTimes().length;
    bot.chat("/tstitle");
    await bot.waitForTitleTimes(20, 60, 20, 10_000, timeMark);
    await bot.waitForTitleText("TS Title");

    // ------------------------------------------------------------------
    // the fishing values: a fresh pond at x/z +200 from the fishing
    // sample's site so the two tests never share water; the wait, bite
    // and angle values are read, retuned and reported inside the cast.
    // ------------------------------------------------------------------
    await t.console("tp TsBot 700.5 -50 699.5");
    await t.sleep(1500);
    await t.console("fill 688 -64 688 712 -64 712 stone");
    await t.console("fill 688 -63 688 712 -56 712 air");
    await t.console("fill 690 -63 690 710 -61 710 water");
    await t.console("fill 699 -63 699 701 -61 701 stone");
    await t.console("tp TsBot 700.5 -60 700.5");
    await t.sleep(800);
    await t.console("give TsBot fishing_rod 1");
    await bot.equipItem("fishing_rod");
    await t.console("enchant TsBot minecraft:lure 3");
    await t.sleep(500);

    // arm the rod and cast into the pond
    const armMark = bot.messages.length;
    bot.chat("/tsfish");
    await waitNew(bot, armMark, "TS fish armed", 10_000);
    await t.console("tp TsBot 700.5 -60 700.5");
    await t.sleep(400);
    await bot.lookAtPoint(708, -61.3, 700.5);
    await t.sleep(500);
    const fishMark = bot.messages.length;
    bot.activateItem();
    await waitNew(
      bot,
      fishMark,
      "TS fish def min=[5 seconds] max=[30 seconds] bite=[0 seconds] amin=[0] amax=[360]",
      15_000,
    );
    await waitNew(
      bot,
      fishMark,
      "TS fish set min=[10 seconds] max=[20 seconds] bite=[3 seconds] amin=[45] amax=[270]",
      15_000,
    );

    // reel back in, mirroring the fishing sample's early-reel shape
    await t.sleep(2500);
    bot.activateItem();
    await t.sleep(400);
    bot.deactivateItem();
  } finally {
    bot.disconnect();
  }
});
