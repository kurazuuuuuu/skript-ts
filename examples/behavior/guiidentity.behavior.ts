import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// guiidentity.ts (feedback B3 / T4): script-GUI identity. The
// feature is engine-only (the identity lives in the engine jar's
// registry), so under Skript mode the script is not deployed and
// this test passes without exercising anything.
//
// Under the engine:
//   /shopgui opens the "Shop"-titled GUI tagged "shop"; clicking
//     reports "guiid=shop", "gui is shop" and "gui not other".
//   /plaingui opens a GUI with the SAME title "Shop" but no tag;
//     clicking reports "guiid=<none>", "gui not shop" and
//     "gui not other" — proof that identity comes from the
//     engine's registry, not from the (spoofable) title.
//
// Commands are paced 1s apart against the server's command-spam
// kick, and waitNew only scans messages after a fresh mark.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<{ msg: string; at: number }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m.includes(pattern));
    if (hit !== undefined) return { msg: hit, at: Date.now() };
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only feature; see header comment
  const bot = await t.connect("GuiIdBot");
  try {
    await t.sleep(1000); // let the join sequence settle

    const cmd = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(1000);
    };

    // Tagged GUI: the click handler sees the registered id.
    let mark = bot.messages.length;
    await cmd("/shopgui");
    await bot.waitForWindow("Shop");
    await bot.clickWindowSlot(13);
    await waitNew(bot, mark, "guiid=shop");
    await waitNew(bot, mark, "gui is shop");
    await waitNew(bot, mark, "gui not other");
    bot.closeWindow();
    await t.sleep(500);

    // Untagged GUI with the identical title: no identity. A
    // player-renamed chest titled "Shop" would report exactly
    // the same — title matching cannot tell it apart, the
    // registry can.
    mark = bot.messages.length;
    await cmd("/plaingui");
    await bot.waitForWindow("Shop");
    await bot.clickWindowSlot(13);
    await waitNew(bot, mark, "guiid=<none>");
    await waitNew(bot, mark, "gui not shop");
    await waitNew(bot, mark, "gui not other");
    bot.closeWindow();
  } finally {
    bot.disconnect();
  }
});
