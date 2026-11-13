import { createHash } from "node:crypto";
import { defineBehavior } from "../../src/behavior.js";

/**
 * Player-keyed variables (B6): in the engine, a player used as a
 * variable index keys by the player's UUID by default, so the
 * data survives a rename. The sample stores a number under
 * {uvgrowth::%player%}; /uvkeys loops the store entries and
 * reports the raw key segment, which makes the key form
 * observable in-game: it must be the bot's server-side UUID,
 * never its name. A second bot (a different UUID) sees none of
 * the first bot's data and keys its own entry by its own UUID.
 *
 * The key form is an engine storage property, so this suite is
 * engine-only. (Under Skript the same {..::%player%} text keys
 * however Skript's own "use player UUIDs in variable names"
 * config is set.)
 *
 * The sandbox is an offline-mode server, so a bot's server-side
 * UUID is the name-derived version-3 UUID the server assigns —
 * computed here exactly as the server derives it.
 */
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only; see header comment

  const offlineUuid = (name: string): string => {
    const digest = createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
    digest[6] = (digest[6]! & 0x0f) | 0x30;
    digest[8] = (digest[8]! & 0x3f) | 0x80;
    const hex = digest.toString("hex");
    return (
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}` +
      `-${hex.slice(16, 20)}-${hex.slice(20)}`
    );
  };

  const helpers = (bot: Awaited<ReturnType<typeof t.connect>>) => {
    const waitMsg = async (
      mark: number,
      pattern: RegExp,
      timeoutMs = 15_000,
    ): Promise<string> => {
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
    return { waitMsg, chat };
  };

  const bot = await t.connect("UuidBot");
  try {
    const { waitMsg, chat } = helpers(bot);

    let mark = bot.messages.length;
    await chat("/uvset 4242");
    await waitMsg(mark, /uv set to 4242/);

    mark = bot.messages.length;
    await chat("/uvget");
    await waitMsg(mark, /uv=4242/);

    // The stored key segment is the bot's UUID, not "uuidbot".
    const uuid = offlineUuid("UuidBot");
    mark = bot.messages.length;
    await chat("/uvkeys");
    const keyMsg = await waitMsg(mark, /uvkey=/);
    if (!keyMsg.includes(`uvkey=${uuid} val=4242`)) {
      throw new Error(`expected the key segment to be the bot UUID ${uuid}, got: ${keyMsg}`);
    }
    await waitMsg(mark, /uvkeys done/);
  } finally {
    bot.disconnect();
  }

  // A second bot is a different UUID: it reads none of the first
  // bot's data, and its own entry keys by its own UUID.
  const bot2 = await t.connect("UuidBotTwo");
  try {
    const { waitMsg, chat } = helpers(bot2);

    let mark = bot2.messages.length;
    await chat("/uvget");
    await waitMsg(mark, /uv=<none>/);

    mark = bot2.messages.length;
    await chat("/uvset 7");
    await waitMsg(mark, /uv set to 7/);

    const uuid2 = offlineUuid("UuidBotTwo");
    mark = bot2.messages.length;
    await chat("/uvkeys");
    const keyMsg = await waitMsg(mark, /uvkey=/);
    if (!keyMsg.includes(`uvkey=${uuid2} val=7`)) {
      throw new Error(`expected the key segment to be the bot UUID ${uuid2}, got: ${keyMsg}`);
    }
    await waitMsg(mark, /uvkeys done/);
  } finally {
    bot2.disconnect();
  }
});
