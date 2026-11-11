import { defineBehavior } from "../../src/behavior.js";

// skUtilities slice of skutil.ts (engine-only, phase 9): the text
// file core against the engine's confined files root. Everything is
// local file IO, so no network access is needed. The test walks the
// documented contract end to end:
//   1. create makes the directory and an empty file; existence is true
//   2. appends add lines; the line count grows 1, 2
//   3. the whole-file contents come back (both appended lines in it)
//   4. single lines read back by their 1-based number
//   5. a path escaping the files root is refused (nothing is
//      created outside it, existence reports false)
//   6. delete removes the file; existence and the line count
//      fall back afterwards
// Under Skript mode the skutil script is not deployed at all, so
// there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("FileBot");
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
    // /filecreate resets the demo file first, so reruns are clean.
    bot.chat("/filecreate");
    await waitCount("exists: true", 1);

    bot.chat("/filelog alpha");
    await waitCount("count 1", 1);
    bot.chat("/filelog beta");
    await waitCount("count 2", 1);

    // The whole-file read carries both appended lines. (Checked
    // before the per-line reads, so "beta" can only have come from
    // the contents message[s] here.)
    bot.chat("/fileread");
    await bot.waitForMessage("contents: alpha");
    await bot.waitForMessage("beta");

    bot.chat("/fileline 1");
    await waitCount("line 1: alpha", 1);
    bot.chat("/fileline 2");
    await waitCount("line 2: beta", 1);

    bot.chat("/filecount");
    await waitCount("lines: 2", 1);

    // Confinement: "../escape.txt" must not be written, and the
    // existence check on it must read false.
    bot.chat("/fileescape");
    await waitCount("escape exists: false", 1);

    bot.chat("/filewipe");
    await waitCount("exists after wipe: false", 1);

    // After the wipe the line count has no value again: a second
    // "lines:" report arrives, and it is not another "lines: 2".
    bot.chat("/filecount");
    await waitCount("lines:", 2);
    if (count("lines: 2") !== 1) {
      throw new Error(
        `expected the post-wipe count report to have no value; messages: ${bot.messages.slice(-8).join(" | ")}`,
      );
    }
  } finally {
    bot.disconnect();
  }
});
