import { defineBehavior } from "../../src/behavior.js";

// skript-db slice of skriptdb.ts (engine-only, phase 8). Everything
// runs against a local SQLite file, so no network access is needed.
// The test walks the documented contract end to end:
//   1. setup creates the table (DDL through the execute statement)
//   2. inserts store the affected-row count in a variable
//   3. a stored SELECT result is readable back cell by cell
//      ({var::<column>::<row>})
//   4. a value that looks like SQL is bound as a parameter and
//      stored as data — the table survives (no injection)
//   5. a failing query surfaces through the last-error expression
// Under Skript mode the skriptdb script is not deployed at all, so
// there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("DbBot");
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
    bot.chat("/dbsetup");
    await waitCount("db setup done", 1);

    bot.chat("/dbadd Alice");
    await waitCount("added 1 row", 1);
    bot.chat("/dbadd Bob");
    await waitCount("added 1 row", 2);

    bot.chat("/dbcount");
    await waitCount("total 2", 1);

    bot.chat("/dbnames");
    await waitCount("names Alice and Bob", 1);

    // The classic injection attempt is stored as a plain name; the
    // table is still there afterwards and now holds three rows.
    bot.chat("/dbadd x'); DROP TABLE players;--");
    await waitCount("added 1 row", 3);
    bot.chat("/dbcount");
    await waitCount("total 3", 1);

    bot.chat("/dbbad");
    await bot.waitForMessage("no such table");
  } finally {
    bot.disconnect();
  }
});
