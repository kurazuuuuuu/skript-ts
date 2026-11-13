import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// priority.ts (B2, 2026-11-13): cancellation state and handler
// priority — driven with console damage commands against two
// bots and asserted on the EXACT broadcast sequence, under both
// runtimes. The probed contract (real Skript 2.17.1): handlers
// run lowest → monitor (declaration order inside a level), and
// once the event is cancelled no later handler runs at all.
// GuardBot's hit is cancelled by the low-priority guard, so its
// sequence stops after the guard's own read-back; FreeBot's hit
// is never cancelled and runs the full ladder.
async function prioLines(bot: BehaviorBot, mark: number): Promise<string[]> {
  return bot.messages.slice(mark).filter((m) => m.startsWith("[prio]"));
}

async function waitForPrio(
  bot: BehaviorBot,
  mark: number,
  last: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lines = await prioLines(bot, mark);
    if (lines.includes(last)) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${last}"; prio lines: ${lines.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function expectSequence(actual: string[], expected: string[], what: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: expected sequence ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export default defineBehavior(async (t) => {
  const observer = await t.connect("FreeBot");
  const guarded = await t.connect("GuardBot");
  await t.sleep(1000); // let the join sequences settle
  // Peaceful: no ambient mob damage can interleave [prio] lines
  // (the sample's handlers fire for every damage event in the
  // world, including other suites' fights). Restored at the end.
  await t.console("difficulty peaceful");
  // Own platform, away from the other suites' spots (the world
  // persists between runs). Teleport first so the chunks load.
  await t.console("tp FreeBot 230.5 -60 230.5");
  await t.console("tp GuardBot 231.5 -60 230.5");
  await t.sleep(800);
  await t.console("fill 228 -61 228 234 -61 234 grass_block");
  await t.console("fill 228 -60 228 234 -56 234 air");
  await t.console("tp FreeBot 230.5 -60 230.5");
  await t.console("tp GuardBot 231.5 -60 230.5");
  await t.sleep(800);

  // --- GuardBot: the low-priority guard cancels; nothing after
  // the guard may run (no normal, no XP, no monitor), and the
  // bot keeps full health.
  let m = observer.messages.length;
  await t.console("damage GuardBot 3");
  await waitForPrio(observer, m, "[prio] guard confirms cancelled for GuardBot");
  await t.sleep(1500); // any wrongly-dispatched later handler would land here
  expectSequence(
    await prioLines(observer, m),
    [
      "[prio] lowest ran for GuardBot",
      "[prio] guard cancelled for GuardBot",
      "[prio] guard confirms cancelled for GuardBot",
    ],
    "guarded hit",
  );
  const gh = guarded.health();
  if (gh !== 20) {
    throw new Error(`guarded hit: expected GuardBot health 20 (damage cancelled), got ${gh}`);
  }

  // --- FreeBot: nothing cancels; the full ladder runs slot by
  // slot even though the sample declares the handlers out of
  // order — including the undeclared "legacy" handler sharing
  // the high slot with the XP handler (declared earlier there,
  // so it runs first) — and the damage lands.
  m = observer.messages.length;
  await t.console("damage FreeBot 3");
  await waitForPrio(observer, m, "[prio] monitor ran for FreeBot");
  await t.sleep(500);
  expectSequence(
    await prioLines(observer, m),
    [
      "[prio] lowest ran for FreeBot",
      "[prio] normal-1 ran for FreeBot",
      "[prio] normal-2 ran for FreeBot",
      "[prio] legacy ran for FreeBot",
      "[prio] xp granted for FreeBot",
      "[prio] highest ran for FreeBot",
      "[prio] monitor ran for FreeBot",
    ],
    "unguarded hit",
  );
  const fh = observer.health();
  if (!(fh < 19.5 && fh >= 14)) {
    throw new Error(`unguarded hit: expected FreeBot health to drop by ~3, got ${fh}`);
  }

  await t.console("difficulty easy");
});
