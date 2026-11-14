import { createHash } from "node:crypto";
import { defineBehavior } from "../../src/behavior.js";

/**
 * Player UUID expression (feedback B6-3): uuidOf(player) must
 * read the bot's server-side UUID as text under BOTH runtimes —
 * the engine reads it directly, and Skript mode goes through
 * the emitted `uuid of %player%`. The sandbox is an offline-mode
 * server, so the expected UUID is the name-derived version-3
 * UUID the server assigns (computed exactly as the server
 * derives it, like uuidvars.behavior.ts). The stored value is
 * also read back through the UUID text key, which pins uuidOf
 * as a variable index in both runtimes.
 */
export default defineBehavior(async (t) => {
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

  const bot = await t.connect("UuidOfBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    const uuid = offlineUuid("UuidOfBot");

    bot.chat("/myuuid");
    await bot.waitForMessage(`myuuid=${uuid}`, 15_000);

    await t.sleep(600); // pace commands (Paper command-spam kick)
    bot.chat("/uuidstore");
    await bot.waitForMessage(`uuidstored under ${uuid}`, 15_000);

    await t.sleep(600);
    bot.chat("/uuidread");
    await bot.waitForMessage("uuidread=marked", 15_000);
  } finally {
    bot.disconnect();
  }
});
