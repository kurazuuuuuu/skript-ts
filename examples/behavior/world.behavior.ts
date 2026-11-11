import { defineBehavior } from "../../src/behavior.js";

/**
 * World operations and periodical events (phase 18): the bot
 * watches the periodical heartbeat arrive on cadence, reads its
 * coordinates back through /wpos, drives the world clock and
 * weather through the sample's commands (observed via /wstat),
 * and sees /wbuild place — and /wraze remove — real blocks next
 * to it. The same expectations run under Skript (the emitted
 * .sk) and under the engine jar (the IR).
 */
export default defineBehavior(async (t) => {
  const bot = await t.connect("WorldBot");
  try {
    // A deterministic platform at a dedicated spot (the pattern
    // the gameplay tests use): teleport first so the chunks are
    // loaded and the fills land.
    await t.console("difficulty peaceful");
    await t.console("tp WorldBot 300.5 -60 300.5");
    await t.sleep(500);
    await t.console("fill 296 -61 296 304 -61 304 stone");
    await t.console("fill 296 -60 296 304 -56 304 air");
    await t.console("tp WorldBot 300.5 -60 300.5");
    await t.sleep(500);
    await t.console("clear WorldBot");

    // Messages are matched only after a mark: the buffer keeps
    // everything the bot has ever received, including ambient
    // broadcasts from other samples.
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

    // -- Periodical heartbeat: two fresh firings, ~3s apart. --
    const heartbeats = (): number =>
      bot.messages.filter((m) => m.includes("[world] heartbeat")).length;
    const waitHeartbeat = async (target: number, timeoutMs: number): Promise<number> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (heartbeats() >= target) return Date.now();
        if (Date.now() >= deadline) {
          throw new Error(
            `timed out after ${timeoutMs}ms waiting for heartbeat #${target} (saw ${heartbeats()})`,
          );
        }
        await t.sleep(100);
      }
    };
    const baseCount = heartbeats();
    const firstAt = await waitHeartbeat(baseCount + 1, 10_000);
    const secondAt = await waitHeartbeat(baseCount + 2, 8_000);
    const gap = secondAt - firstAt;
    if (gap < 2_000 || gap > 5_500) {
      throw new Error(`heartbeat gap ${gap}ms is not the 3 second period`);
    }

    // -- Coordinates: /wpos reports the bot's own position. --
    let mark = bot.messages.length;
    await chat("/wpos");
    const posMsg = await waitMsg(mark, /pos=/);
    const pos = /pos=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(posMsg);
    if (pos === null) throw new Error(`unparsable /wpos reply: ${posMsg}`);
    const [px, py, pz] = [Number(pos[1]), Number(pos[2]), Number(pos[3])];
    if (Math.abs(px - 300.5) > 2 || py !== -60 || Math.abs(pz - 300.5) > 2) {
      throw new Error(`/wpos reported ${px}, ${py}, ${pz}; the bot stands at 300.5, -60, 300.5`);
    }

    // -- World clock and weather through /wstat. --
    mark = bot.messages.length;
    await chat("/wcalm");
    await waitMsg(mark, /calm/);
    mark = bot.messages.length;
    await chat("/wstat");
    await waitMsg(mark, /weather=clear/);

    mark = bot.messages.length;
    await chat("/wnight");
    await waitMsg(mark, /midnight/);
    mark = bot.messages.length;
    await chat("/wstat");
    await waitMsg(mark, /time=0:0[0-9]/);

    mark = bot.messages.length;
    await chat("/wday");
    await waitMsg(mark, /morning/);
    mark = bot.messages.length;
    await chat("/wstat");
    await waitMsg(mark, /time=6:0[0-9]/);

    mark = bot.messages.length;
    await chat("/wstorm");
    await waitMsg(mark, /storm/);
    mark = bot.messages.length;
    await chat("/wstat");
    await waitMsg(mark, /weather=thunder/);

    // -- Blocks: /wbuild places stone + gold east of the bot. --
    // The bot stands at (300.5, -60, 300.5); the sample builds
    // at the block two east of the player's location and on top
    // of it: (302, -60, 300) and (302, -59, 300).
    mark = bot.messages.length;
    await chat("/wbuild");
    await waitMsg(mark, /built stone \+ gold block/);
    const waitBlock = async (
      x: number,
      y: number,
      z: number,
      name: string | null,
    ): Promise<void> => {
      const deadline = Date.now() + 10_000;
      for (;;) {
        if (bot.blockNameAt(x, y, z) === name) return;
        if (Date.now() >= deadline) {
          throw new Error(
            `timed out waiting for block at ${x}, ${y}, ${z} to become ${name ?? "air"}; saw ${bot.blockNameAt(x, y, z) ?? "air"}`,
          );
        }
        await t.sleep(200);
      }
    };
    await waitBlock(302, -60, 300, "stone");
    await waitBlock(302, -59, 300, "gold_block");

    mark = bot.messages.length;
    await chat("/wraze");
    await waitMsg(mark, /cleared/);
    await waitBlock(302, -60, 300, null);
    await waitBlock(302, -59, 300, null);

    // Leave the sandbox as it was found.
    await chat("/wcalm");
    await t.console("difficulty easy");
  } finally {
    bot.disconnect();
  }
});
