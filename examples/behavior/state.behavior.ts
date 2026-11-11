import { defineBehavior } from "../../src/behavior.js";

/**
 * Player state and effects (phase 19): the bot's own body is
 * the observation surface — the sample's commands set and heal
 * its health, food and saturation (read back both as client
 * state and as script messages, in the original's hearts /
 * drumsticks units), switch its game mode, move its experience
 * total and level, run potion effects whose damage / healing
 * the bot feels, spawn entities it can see, drop an item it
 * picks up, and play a sound whose packet arrives at its
 * position. The same expectations run under Skript (the
 * emitted .sk) and under the engine jar (the IR).
 */
export default defineBehavior(async (t) => {
  const bot = await t.connect("StateBot");
  try {
    await t.console("difficulty easy");
    await t.console("tp StateBot 400.5 -60 400.5");
    await t.sleep(500);
    await t.console("fill 396 -61 396 404 -61 404 stone");
    await t.console("fill 396 -60 396 404 -56 404 air");
    await t.console("tp StateBot 400.5 -60 400.5");
    await t.console("time set day");
    await t.console("weather clear");
    await t.console("gamemode survival StateBot");
    await t.console("effect clear StateBot");
    await t.console("clear StateBot");
    await t.sleep(500);

    const waitMsg = async (mark: number, pattern: RegExp, timeoutMs = 15_000): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        for (let i = mark; i < bot.messages.length; i++) {
          const m = bot.messages[i]!;
          if (pattern.test(m)) return m;
        }
        if (Date.now() >= deadline) {
          const recent = bot.messages.slice(mark).slice(-6).join(" | ") || "(none)";
          throw new Error(
            `timed out after ${timeoutMs}ms waiting for ${pattern}; recent: ${recent}`,
          );
        }
        await t.sleep(100);
      }
    };
    const chat = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(600); // pace commands (Paper command-spam kick)
    };
    const waitFor = async (label: string, fn: () => boolean, timeoutMs = 10_000): Promise<void> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (fn()) return;
        if (Date.now() >= deadline)
          throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
        await t.sleep(150);
      }
    };

    // -- Set state: health 6 hearts = 12 HP, food 4 drumsticks
    // = 8 points, saturation 2.5 unscaled. The script readback
    // reports the same values in script units. --
    let mark = bot.messages.length;
    await chat("/stset");
    await waitMsg(mark, /set done/);
    await waitFor("health 12", () => bot.health() === 12);
    await waitFor("food 8", () => bot.food() === 8);
    await waitFor("saturation 2.5", () => Math.abs(bot.saturation() - 2.5) < 0.01);
    mark = bot.messages.length;
    await chat("/ststat");
    await waitMsg(mark, /hp=6\/10 food=4 sat=2\.5 gm=survival xp=0 lv=0/);

    // -- Heal by an amount: 3 hearts set, 2 healed back. --
    mark = bot.messages.length;
    await chat("/stheal");
    await waitMsg(mark, /hp=5/);
    await waitFor("health 10", () => bot.health() === 10);

    // -- Game mode round-trip, observed client-side. --
    mark = bot.messages.length;
    await chat("/stgm");
    await waitMsg(mark, /gm=creative/);
    await waitFor("creative mode", () => bot.gameMode() === "creative");
    mark = bot.messages.length;
    await chat("/stgmback");
    await waitMsg(mark, /gm=survival/);
    await waitFor("survival mode", () => bot.gameMode() === "survival");

    // -- Experience: totals and levels through the sample's
    // three-step report, plus the progress-preserving level
    // set. The intermediate totals are asserted through the
    // script's own readbacks (server-side reads); the client
    // only ever receives the command's final state — the
    // server coalesces the three back-to-back writes into one
    // experience sync (probed: a single packet, level 2). --
    mark = bot.messages.length;
    await chat("/stxp");
    await waitMsg(mark, /xp=50 lv=4/);
    await waitMsg(mark, /xp=91 lv=7/);
    await waitMsg(mark, /xp=16 lv=2/);
    await waitFor("xp level 2", () => bot.xpLevel() === 2);
    mark = bot.messages.length;
    await chat("/stxpfrac");
    await waitMsg(mark, /xp=21 lv=2/);

    // -- Max health: raise to 15 hearts, heal full (30 HP),
    // restore. --
    mark = bot.messages.length;
    await chat("/stmax");
    await waitMsg(mark, /hp=15\/15/);
    await waitFor("health 30", () => bot.health() === 30);
    mark = bot.messages.length;
    await chat("/stmaxback");
    await waitMsg(mark, /hp=10\/10/);
    await waitFor("health 20", () => bot.health() === 20);

    // -- Potions: regeneration climbs from 5 hearts; poison
    // declines and stops when removed. (The bot's food is low,
    // so vanilla natural regeneration cannot interfere.) --
    mark = bot.messages.length;
    await chat("/stfx");
    await waitMsg(mark, /regen applied/);
    // Regeneration I heals 1 HP per 2.5s; the 6-second effect
    // lands exactly two heals: 10 -> 12 HP (probed pace).
    await waitFor("regenerated to >=12 HP", () => bot.health() >= 12, 12_000);

    mark = bot.messages.length;
    await chat("/stpoison");
    await waitMsg(mark, /poison applied/);
    const poisonStart = bot.health();
    await t.sleep(3_500);
    const poisoned = bot.health();
    if (!(poisoned < poisonStart)) {
      throw new Error(`poison did not reduce health: ${poisonStart} -> ${poisoned}`);
    }
    mark = bot.messages.length;
    await chat("/stcure");
    await waitMsg(mark, /poison removed/);
    await t.sleep(400);
    const curedAt = bot.health();
    await t.sleep(3_000);
    if (bot.health() < curedAt - 1) {
      throw new Error(`health kept dropping after the cure: ${curedAt} -> ${bot.health()}`);
    }

    // -- Instant health: from 5 hearts, at least the vanilla
    // +4 HP lands. --
    mark = bot.messages.length;
    await chat("/stinstant");
    await waitMsg(mark, /instant applied/);
    await waitFor("instant heal to >=14 HP", () => bot.health() >= 14, 10_000);
    await t.console("effect clear StateBot");

    // -- Spawn: a zombie and two cows appear around the bot;
    // the sample reports the last spawned type. --
    mark = bot.messages.length;
    await chat("/stspawn");
    await waitMsg(mark, /last=cow/);
    await waitFor("a visible zombie", () => bot.countEntities("zombie") >= 1);
    await waitFor("two visible cows", () => bot.countEntities("cow") >= 2);
    await t.console("execute at StateBot run kill @e[type=!minecraft:player,distance=..30]");
    // Re-center the bot: the zombie may have knocked it toward
    // the platform edge, where a scattered drop could land out
    // of pickup reach.
    await t.console("tp StateBot 400.5 -60 400.5");
    await t.sleep(500);

    // -- Drop: a diamond lands at the bot's feet and is picked
    // up. The drop scatters: Skript's drop effect is Bukkit's
    // dropItem (the engine uses dropItemNaturally), which
    // gives the item a random velocity — probed in phase 22
    // after repeated flakes here, it can come to rest ~3
    // blocks from the drop point, out of a stationary bot's
    // pickup reach. So the bot sweeps a small grid over the
    // platform to vacuum it up, like a player walking over to
    // their drop. --
    mark = bot.messages.length;
    await chat("/stdrop");
    await waitMsg(mark, /dropped/);
    for (const dx of [-2, 0, 2]) {
      for (const dz of [-2, 0, 2]) {
        await t.console(`tp StateBot ${400.5 + dx} -60 ${400.5 + dz}`);
        await t.sleep(300);
      }
    }
    await t.console("tp StateBot 400.5 -60 400.5");
    await bot.expectInventoryItem("diamond");

    // -- Sound: a registry-sound packet arrives at the bot's
    // position. (The decoded name is client-data dependent, so
    // the packet's arrival and place are what is asserted.) --
    const soundMark = bot.soundPackets().length;
    mark = bot.messages.length;
    await chat("/stsound");
    await waitMsg(mark, /sound played/);
    const pos = bot.position();
    const packet = await bot.waitForSoundNear(pos.x, pos.y, pos.z, 3, 10_000, soundMark);
    if (packet.soundId === null) {
      throw new Error(`expected a registry sound packet, got ${JSON.stringify(packet)}`);
    }

    await t.console("effect clear StateBot");
  } finally {
    bot.disconnect();
  }
});
