import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// events3.ts (phase 22): event generalization — death for
// every entity with victim filters and the last-damage-cause
// attacker, the entity pickup / drop forms — exercised with
// real bot actions and console-driven mobs on an own platform.
// All constructs are core language, so this test runs under
// BOTH runtimes with identical expectations.
//
// Like events2, expectations use message marks: the buffer is
// only scanned from a mark taken just before the action,
// because the other samples' handlers (and the sandbox
// world's ambient mobs) keep broadcasting throughout.
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
// after the mark: how a form that must stay silent is pinned.
async function expectAbsent(
  bot: BehaviorBot,
  mark: number,
  pattern: string,
  settleMs = 1500,
): Promise<void> {
  await new Promise((r) => setTimeout(r, settleMs));
  const hit = bot.messages.slice(mark).find((m) => m === pattern);
  if (hit !== undefined) {
    throw new Error(`unexpected message "${hit}" (this form should not have fired)`);
  }
}

export default defineBehavior(async (t) => {
  const bot = await t.connect("Ev3Bot");
  try {
    await t.sleep(1000); // let the join sequence settle
    await t.console("clear Ev3Bot");
    // Own platform at a fresh sandbox spot (teleport first so
    // the chunks are loaded and the fills land).
    await t.console("tp Ev3Bot 218.5 -60 218.5");
    await t.sleep(800);
    await t.console("fill 216 -61 216 220 -61 220 stone");
    await t.console("fill 216 -60 216 220 -56 220 air");
    await t.console("tp Ev3Bot 218.5 -60 218.5");
    await t.sleep(600);
    // Same discipline as events2: peaceful except inside the
    // zombie windows (the platform sits in slime-chunk
    // territory, and summoned zombies need easy to exist).
    await t.console("difficulty peaceful");
    await t.console("time set 1000");

    // ---------------------------------------------------------
    // Death A: a zombie killed by a console damage command
    // with no source — the filtered handler fires and the
    // attacker reads as no value.
    // ---------------------------------------------------------
    await t.console("difficulty easy");
    let m = bot.messages.length;
    await t.console("summon zombie 219.5 -60 217.5 {NoAI:1b}");
    await t.console("damage @e[type=minecraft:zombie,limit=1] 100 minecraft:generic_kill");
    await waitNew(bot, m, "mob death zombie by <none>", 15_000);

    // ---------------------------------------------------------
    // Death B: the killing damage is sourced from an iron
    // golem — the attacker is the last damage cause's damager,
    // any entity, not just a player killer.
    // ---------------------------------------------------------
    await t.console("summon iron_golem 220 -60 220 {NoAI:1b}");
    m = bot.messages.length;
    await t.console("summon zombie 219.5 -60 217.5 {NoAI:1b}");
    await t.console(
      "damage @e[type=minecraft:zombie,limit=1] 100 minecraft:mob_attack by @e[type=minecraft:iron_golem,limit=1]",
    );
    await waitNew(bot, m, "mob death zombie by iron golem", 15_000);
    await t.console("kill @e[type=minecraft:iron_golem]");

    // ---------------------------------------------------------
    // Death C: the bot kills a zombie with a sword — the
    // attacker reads as "player".
    // ---------------------------------------------------------
    await t.console("give Ev3Bot diamond_sword 1");
    await bot.equipItem("diamond_sword");
    await t.console("summon zombie 219.5 -60 218.5 {NoAI:1b}");
    await t.console("tp Ev3Bot 218.2 -60 218.5");
    await t.sleep(600);
    m = bot.messages.length;
    {
      const deadline = Date.now() + 30_000;
      for (;;) {
        if (bot.messages.slice(m).some((msg) => msg === "mob death zombie by player")) break;
        if (Date.now() >= deadline) {
          throw new Error(
            "timed out waiting for the bot's sword kill to register as attacker=player",
          );
        }
        await bot.attackEntityByName("zombie");
        await t.sleep(650);
      }
    }
    await t.console("difficulty peaceful");

    // ---------------------------------------------------------
    // Entity pickup: a loot-enabled zombie takes wheat at
    // its feet — the entity form fires with the zombie as
    // event-entity, and the bare form (player-only) does not.
    // ---------------------------------------------------------
    await t.console("difficulty easy");
    await t.console("summon zombie 217.5 -60 219.5 {CanPickUpLoot:1b,NoAI:1b}");
    await t.sleep(500);
    m = bot.messages.length;
    await t.console(`summon item 217 -60 219 {Item:{id:"minecraft:wheat",count:1},PickupDelay:0}`);
    await waitNew(bot, m, "entity picked wheat by zombie", 15_000);
    await expectAbsent(bot, m, "picked filtered wheat");
    await t.console("kill @e[type=minecraft:zombie]");
    await t.console("difficulty peaceful");

    // ---------------------------------------------------------
    // Player pickup control: the bot picking up wheat fires
    // the entity form too ("by player"), alongside the bare
    // form from the phase-16 sample.
    // ---------------------------------------------------------
    await t.console("clear Ev3Bot");
    await t.console("tp Ev3Bot 218.5 -60 218.5");
    await t.sleep(600);
    m = bot.messages.length;
    await t.console(`summon item 218 -60 218 {Item:{id:"minecraft:wheat",count:1},PickupDelay:0}`);
    await waitNew(bot, m, "entity picked wheat by player", 15_000);
    await waitNew(bot, m, "picked filtered wheat", 15_000);

    // ---------------------------------------------------------
    // Entity drop: a chicken (NOT NoAI — a NoAI chicken's
    // EggLayTime never counts down, probed in phase 22) lays
    // an egg once its timer is wound down.
    // ---------------------------------------------------------
    await t.console("summon chicken 218.5 -60 218.5");
    await t.sleep(500);
    m = bot.messages.length;
    await t.console(
      "data modify entity @e[type=minecraft:chicken,x=218,y=-60,z=218,distance=..5,limit=1] EggLayTime set value 40",
    );
    await waitNew(bot, m, "entity dropped egg by chicken", 25_000);
    await t.console("kill @e[type=minecraft:chicken]");

    // ---------------------------------------------------------
    // Player drop control: the bot's toss fires the bare
    // form (phase-16 sample) and NOT the entity form.
    // ---------------------------------------------------------
    await bot.tossItem("wheat");
    await waitNew(bot, m, "dropped wheat by Ev3Bot", 15_000);
    await expectAbsent(bot, m, "entity dropped wheat by player");

    // ---------------------------------------------------------
    // Player death: a console kill lands in the player
    // victim filter; the attacker is no value.
    // ---------------------------------------------------------
    m = bot.messages.length;
    await t.console("kill Ev3Bot");
    await waitNew(bot, m, "player died (attacker: <none>)", 20_000);

    // Leave the shared world tidy: sweep item entities (death
    // scatter, the egg, the tossed wheat) around the platform.
    await t.console("kill @e[type=minecraft:item,x=216,y=-61,z=216,dx=4,dy=4,dz=4]");
    await t.console("difficulty easy");
  } finally {
    bot.disconnect();
  }
});
