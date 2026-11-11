import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// events2.ts (phase 16): event expansion, slice 2 — filtered
// event forms, the clicked entity, and the pickup / drop /
// respawn / bed events — exercised with real bot actions on the
// sandbox platform. All constructs are core language, so this
// test runs under BOTH runtimes with identical expectations.
//
// Like the gameplay test, expectations use message marks: the
// buffer is only scanned from a mark taken just before the
// action, because the unfiltered samples (and this sample's own
// other handlers) keep broadcasting throughout.
async function waitNew(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = bot.messages.slice(mark);
    const hit = fresh.find((m) => m === pattern);
    if (hit !== undefined) return hit;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${pattern}"; fresh messages: ${fresh.join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Assert a message does NOT arrive within the settle window
// after the mark: how a non-matching filter is pinned (the
// matching control message is awaited separately).
async function expectAbsent(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  settleMs = 1500,
): Promise<void> {
  await new Promise((r) => setTimeout(r, settleMs));
  const hit = bot.messages.slice(mark).find((m) => m === pattern);
  if (hit !== undefined) {
    throw new Error(`unexpected message "${hit}" (filter should not have matched)`);
  }
}

// Wait until the message has been seen at least n times in the
// whole buffer: for events that must fire REPEATEDLY (a drop
// that stays blocked proves the item never left the inventory).
async function waitCount(
  bot: BehaviorBot,
  pattern: string,
  n: number,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const count = bot.messages.filter((m) => m === pattern).length;
    if (count >= n) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for ${n}x "${pattern}" (saw ${count}); recent: ${bot.messages.slice(-10).join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function expectBlock(bot: BehaviorBot, x: number, y: number, z: number, name: string | null): void {
  const actual = bot.blockNameAt(x, y, z);
  if (actual !== name) {
    throw new Error(`block at ${x}, ${y}, ${z}: expected ${name ?? "(air)"}, got ${actual ?? "(air)"}`);
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("EvBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    // The welcome sample hands every joining bot a wooden sword;
    // clear it so hands and inventory start deterministic.
    await t.console("clear EvBot");
    // Own platform at the fixed sandbox spot (teleport first so
    // the chunks are loaded and the fills land).
    await t.console("tp EvBot 200.5 -60 200.5");
    await t.sleep(800);
    await t.console("fill 198 -61 198 202 -61 202 stone");
    await t.console("fill 198 -60 198 202 -56 202 air");
    await t.console("tp EvBot 200.5 -60 200.5");
    await t.sleep(600);
    // The platform sits below y=40 in slime-chunk territory:
    // slimes spawn there regardless of light and body-block
    // placements, knock the bot around and can kill it outright
    // (all three observed while developing this test). Run on
    // peaceful — no hostile spawns, existing ones despawn — and
    // only drop to easy inside the zombie sections, which need
    // a live zombie. Restored to easy at the end.
    await t.console("difficulty peaceful");
    await t.console("time set 1000");
    const pos = bot.position();
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    // ---------------------------------------------------------
    // Filtered break: stone and cobblestone match the filter
    // list; a grass block does not (the unfiltered sample's
    // message is the control that the dig really happened).
    // ---------------------------------------------------------
    await t.console("give EvBot iron_pickaxe 1");
    await bot.equipItem("iron_pickaxe");
    await t.console(`setblock ${bx + 1} ${by} ${bz} stone`);
    let m = bot.messages.length;
    await bot.digAt(bx + 1, by, bz);
    await waitNew(bot, m, "filtered break stone by EvBot", 10_000);

    await t.console(`setblock ${bx + 1} ${by} ${bz} cobblestone`);
    m = bot.messages.length;
    await bot.digAt(bx + 1, by, bz);
    await waitNew(bot, m, "filtered break cobblestone by EvBot", 10_000);

    await t.console(`setblock ${bx + 1} ${by} ${bz} grass_block`);
    m = bot.messages.length;
    await bot.digAt(bx + 1, by, bz);
    await waitNew(bot, m, "EvBot broke grass block (block item: grass block)", 10_000);
    await expectAbsent(bot, m, "filtered break grass block by EvBot");

    // ---------------------------------------------------------
    // Filtered place: cobblestone matches; dirt does not.
    // ---------------------------------------------------------
    await t.console("give EvBot cobblestone 4");
    await bot.equipItem("cobblestone");
    m = bot.messages.length;
    await bot.placeOnTopOf(bx + 1, by - 1, bz);
    await waitNew(bot, m, "filtered place cobblestone by EvBot", 10_000);
    expectBlock(bot, bx + 1, by, bz, "cobblestone");

    await t.console("give EvBot dirt 4");
    await bot.equipItem("dirt");
    m = bot.messages.length;
    await bot.placeOnTopOf(bx + 2, by - 1, bz);
    await waitNew(bot, m, "EvBot placed dirt from dirt", 10_000);
    await expectAbsent(bot, m, "filtered place dirt by EvBot");

    // ---------------------------------------------------------
    // Left click with a held-item filter: digging with a stick
    // in hand matches; the dig start is the click.
    // ---------------------------------------------------------
    await t.console("give EvBot stick 1");
    await bot.equipItem("stick");
    await t.console(`setblock ${bx + 1} ${by} ${bz} grass_block`);
    m = bot.messages.length;
    await bot.digAt(bx + 1, by, bz);
    await waitNew(bot, m, "stick swing on grass block", 10_000);

    // ---------------------------------------------------------
    // Filtered block click, empty hand (so the click cannot
    // place anything): stone matches; dirt does not.
    // ---------------------------------------------------------
    await t.console("clear EvBot");
    await t.console(`setblock ${bx + 1} ${by} ${bz} stone`);
    m = bot.messages.length;
    await bot.activateBlockAt(bx + 1, by, bz);
    await waitNew(bot, m, "block click stone by EvBot", 10_000);

    await t.console(`setblock ${bx + 1} ${by} ${bz} dirt`);
    m = bot.messages.length;
    await bot.activateBlockAt(bx + 1, by, bz);
    await waitNew(bot, m, "EvBot right clicked dirt with <none>", 10_000);
    await expectAbsent(bot, m, "block click dirt by EvBot");

    // ---------------------------------------------------------
    // Entity click: right-clicking a villager matches the
    // entity filter and carries the clicked-entity value.
    // ---------------------------------------------------------
    await t.console(`summon villager ${bx + 2} ${by} ${bz} {NoAI:1b}`);
    await t.sleep(500);
    m = bot.messages.length;
    await bot.activateEntityByName("villager");
    await waitNew(bot, m, "entity click villager / villager by EvBot", 10_000);
    bot.closeWindow(); // the trade screen the click opened
    // Remove the villager: the zombie sections reuse its spot,
    // and a bystander villager would draw the zombie's attacks.
    await t.console("kill @e[type=minecraft:villager]");

    // ---------------------------------------------------------
    // Damage victim filter: a long fall hurts the bot; the
    // attacker-filtered handler must stay silent because a fall
    // has no attacker.
    // ---------------------------------------------------------
    m = bot.messages.length;
    await t.console("tp EvBot 200.5 -45 200.5");
    await waitNew(bot, m, "player victim (fall)", 10_000);
    await expectAbsent(bot, m, "zombie attack on EvBot");
    await t.console("effect give EvBot instant_health 1 10");
    await t.sleep(500);

    // ---------------------------------------------------------
    // Damage victim + attacker filters: a zombie summoned next
    // to the bot at night walks over and hits it. (The one
    // stretch that needs hostiles: difficulty easy, then right
    // back to peaceful.)
    // ---------------------------------------------------------
    await t.console("difficulty easy");
    await t.console("time set 18000");
    m = bot.messages.length;
    await t.console(`summon zombie ${bx + 2} ${by} ${bz}`);
    await waitNew(bot, m, "zombie attack on EvBot", 25_000);
    await t.console("kill @e[type=minecraft:zombie]");

    // A zombie taking fall damage matches the non-player victim
    // filter.
    m = bot.messages.length;
    await t.console(`summon zombie 202 -45 200`);
    await waitNew(bot, m, "zombie victim (fall)", 15_000);
    await t.console("kill @e[type=minecraft:zombie]");
    await t.console("difficulty peaceful");
    await t.console("time set 1000");

    // ---------------------------------------------------------
    // Pickup: an item summoned at the bot's feet is picked up;
    // wheat also matches the item filter, dirt does not. The
    // zombie sections may have knocked the bot away from the
    // setup spot, so re-teleport and re-read the position: a
    // pickup only happens within about a block.
    // ---------------------------------------------------------
    await t.console("clear EvBot");
    await t.console("tp EvBot 200.5 -60 200.5");
    await t.sleep(600);
    const ppos = bot.position();
    const px = Math.floor(ppos.x);
    const py = Math.floor(ppos.y);
    const pz = Math.floor(ppos.z);
    // The marks are taken BEFORE the summon commands on purpose:
    // an item at the bot's feet is collected within a few ticks —
    // faster than the console helper's settle delay — so a mark
    // taken after the command can already be past the message.
    m = bot.messages.length;
    await t.console(
      `summon item ${px} ${py} ${pz} {Item:{id:"minecraft:wheat",count:1},PickupDelay:0}`,
    );
    await waitNew(bot, m, "picked wheat by EvBot", 10_000);
    await waitNew(bot, m, "picked filtered wheat", 10_000);

    await t.console(
      `summon item ${px} ${py} ${pz} {Item:{id:"minecraft:dirt",count:1},PickupDelay:0}`,
    );
    await waitNew(bot, m, "picked dirt by EvBot", 10_000);
    await t.sleep(1000);
    // Counted within this section's mark window only: the world
    // persists between runs, and a leftover wheat from an
    // earlier run's death scatter once fired the filtered
    // handler during the zombie section (a knockback pushed the
    // bot onto it) — a whole-buffer count is not this section's
    // evidence.
    const filteredPickups = bot.messages
      .slice(m)
      .filter((msg) => msg.startsWith("picked filtered")).length;
    if (filteredPickups !== 1) {
      throw new Error(`expected exactly 1 filtered pickup in the pickup section, saw ${filteredPickups}`);
    }

    // ---------------------------------------------------------
    // Drop: the compass drop is cancelled by the filtered
    // handler, so the compass can be tossed — and blocked —
    // twice; a stick drops normally and leaves the inventory.
    // ---------------------------------------------------------
    await t.console("give EvBot compass 1");
    await t.console("give EvBot stick 1");
    await bot.tossItem("compass");
    await waitCount(bot, "drop blocked: compass", 1, 10_000);
    await bot.tossItem("compass");
    await waitCount(bot, "drop blocked: compass", 2, 10_000);
    m = bot.messages.length;
    await bot.tossItem("stick");
    await waitNew(bot, m, "dropped stick by EvBot", 10_000);
    await bot.expectNoInventoryItem("stick");

    // ---------------------------------------------------------
    // Bed: at night (still on peaceful, so nothing disturbs
    // the sleep), entering and leaving the bed are announced.
    // ---------------------------------------------------------
    await t.console("time set 18000");
    // Stand next to where the bed goes (the drop section may
    // have left the bot anywhere on the platform).
    await t.console("tp EvBot 200.5 -60 200.5");
    await t.sleep(600);
    await t.console(`setblock ${bx + 1} ${by} ${bz} minecraft:white_bed[facing=east,part=foot]`);
    await t.console(`setblock ${bx + 2} ${by} ${bz} minecraft:white_bed[facing=east,part=head]`);
    m = bot.messages.length;
    await bot.sleepAt(bx + 1, by, bz);
    await waitNew(bot, m, "EvBot entered bed", 10_000);
    await bot.wake();
    await waitNew(bot, m, "EvBot left bed", 10_000);
    await t.console("time set 1000");

    // ---------------------------------------------------------
    // Respawn: a console kill takes the bot out; the respawn
    // handler announces its return (mineflayer respawns
    // automatically, at the bed it slept in).
    // ---------------------------------------------------------
    m = bot.messages.length;
    await t.console("kill EvBot");
    await waitNew(bot, m, "EvBot respawned", 20_000);
    await t.console("difficulty easy");

    // Leave the shared platform clean for the tests that run
    // after this one: remove the bed and sweep every item
    // entity in the platform box. Death scatter (the kill above
    // dropped EvBot's inventory) and bed halves popped by later
    // fills otherwise leak into other bots' hands — a GameBot
    // in the gameplay test once dug "with white bed" because of
    // this test's bed.
    await t.console(`fill ${bx + 1} ${by} ${bz} ${bx + 2} ${by} ${bz} air`);
    await t.console("kill @e[type=minecraft:item,x=198,y=-61,z=198,dx=4,dy=4,dz=4]");
  } finally {
    bot.disconnect();
  }
});
