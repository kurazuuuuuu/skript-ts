import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// dates (feedback C3): the current time and its unix
// timestamp, the timecalc value battery (round trips,
// differences between dates / numbers / timespans, date
// shifting and its asymmetric no-value pairings, date-typed
// functions), and a cooldown written the way cooldowns are
// written in practice — a deadline date stored per player,
// the remaining time read back as a difference of two dates.
// All constructs are core language: this test runs under BOTH
// runtimes with identical expectations. Printed dates use the
// host's default date format, so the battery pins the unix
// numbers and the boolean lines exactly and matches the date
// print only by shape.

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
        `time.behavior: timed out after ${timeoutMs} ms waiting for ${JSON.stringify(pattern)}; fresh messages: ${JSON.stringify(fresh)}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

async function waitMatch(
  bot: BehaviorBot,
  mark: number,
  test: (message: string) => boolean,
  description: string,
  timeoutMs: number = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    for (const message of fresh) {
      if (test(message)) {
        return message;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `time.behavior: timed out after ${timeoutMs} ms waiting for ${description}; fresh messages: ${JSON.stringify(fresh)}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

const EXPECTED_CALC: string[] = [
  "TIME roundtrip=true",
  "TIME fixedunix=[1700000000]",
  "TIME diffself=[0 seconds]",
  "TIME numdiff=[7]",
  "TIME tsdiff=[1 minute]",
  "TIME diffabs=true",
  "TIME diffwindow=true",
  "TIME dateplus=true",
  "TIME dateminus=true",
  "TIME tsplus=[<none>]",
  "TIME datediff=[<none>]",
  "TIME fn=true",
  "TIME fnnow=true",
  "TIME fncount=[2]",
];

export default defineBehavior(async (t) => {
  const bot = await t.connect("TimeBot");
  try {
    await t.sleep(1000);
    await t.console("clear TimeBot");
    await t.console("difficulty peaceful");

    // ------------------------------------------------------------------
    // /timenow: the printed date is matched by shape (its format
    // is the host default); the unix timestamp must be the real
    // current epoch seconds of this same host clock.
    // ------------------------------------------------------------------
    const nowMark = bot.messages.length;
    bot.chat("/timenow");
    await waitMatch(
      bot,
      nowMark,
      (m) => /^TIME now=\[.+\]$/.test(m),
      "a TIME now=[<printed date>] line",
      10_000,
    );
    const unixLine = await waitMatch(
      bot,
      nowMark,
      (m) => /^TIME unix=\[[0-9.]+\]$/.test(m),
      "a TIME unix=[<epoch seconds>] line",
      10_000,
    );
    const unix = Number(/^TIME unix=\[([0-9.]+)\]$/.exec(unixLine)?.[1]);
    const hostUnix = Date.now() / 1000;
    if (!Number.isFinite(unix) || Math.abs(unix - hostUnix) > 120) {
      throw new Error(
        `time.behavior: unix timestamp ${unixLine} is not within 120 seconds of the host clock (${hostUnix})`,
      );
    }

    // ------------------------------------------------------------------
    // the calc battery: round trips, differences, shifting and
    // function results, each echoed verbatim once. The fixed
    // date's printed form is host-format dependent, shape only.
    // ------------------------------------------------------------------
    const calcMark = bot.messages.length;
    await t.console("timecalc");
    await waitMatch(
      bot,
      calcMark,
      (m) => /^TIME fixed=\[.+\]$/.test(m),
      "a TIME fixed=[<printed date>] line",
      20_000,
    );
    for (const line of EXPECTED_CALC) {
      await waitNew(bot, calcMark, line, 20_000);
    }

    // ------------------------------------------------------------------
    // the cooldown: no deadline stored yet, then a 5 second
    // cooldown started for the bot, reported as cooling with a
    // remaining difference, and ready once it has elapsed.
    // ------------------------------------------------------------------
    const noneMark = bot.messages.length;
    bot.chat("/cdleft");
    await waitNew(bot, noneMark, "TIME cd state=none", 10_000);

    const startMark = bot.messages.length;
    bot.chat("/cdstart");
    await waitNew(bot, startMark, "TIME cd started", 10_000);

    const coolMark = bot.messages.length;
    bot.chat("/cdleft");
    await waitMatch(
      bot,
      coolMark,
      (m) => /^TIME cd state=cooling left=\[.+\]$/.test(m),
      "a TIME cd state=cooling line",
      10_000,
    );

    await t.sleep(6500);
    const readyMark = bot.messages.length;
    bot.chat("/cdleft");
    await waitNew(bot, readyMark, "TIME cd state=ready", 10_000);
  } finally {
    bot.disconnect();
  }
});
