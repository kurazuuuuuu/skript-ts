import { defineBehavior } from "../../src/behavior.js";

/**
 * Entity equipment / custom name / AI / scoreboard tags /
 * attributes / velocity (ext-entity wave, feedback D): the
 * sample dresses a spawned zombie and reads everything back
 * through script messages, under BOTH runtimes with identical
 * expectations. The zombie's AI is frozen in the same trigger
 * that spawns it, so it stands on the platform as a dress-up
 * dummy. The velocity section launches it straight up and
 * reads the components back inside the same trigger (before
 * physics can move it), so the readback is the set value.
 */
export default defineBehavior(async (t) => {
  const bot = await t.connect("EntityBot");
  try {
    await t.console("difficulty peaceful");
    await t.console("tp EntityBot 500.5 -60 500.5");
    await t.sleep(500);
    await t.console("fill 496 -61 496 504 -61 504 stone");
    await t.console("fill 496 -60 496 504 -56 504 air");
    await t.console("tp EntityBot 500.5 -60 500.5");
    await t.console("time set day");
    await t.console("weather clear");
    await t.console("gamemode survival EntityBot");
    await t.console("clear EntityBot");
    await t.sleep(500);

    const chat = async (text: string): Promise<void> => {
      bot.chat(text);
      await t.sleep(700); // pace commands (Paper command-spam kick)
    };

    // -- Make and dress the zombie; read it all back. --
    await chat("/entmake");
    await bot.waitForMessage("entmade");
    await chat("/entcheck");
    await bot.waitForMessage(
      /entcheck: helmet=iron helmet chest=iron chestplate hand=iron sword off=air boots=<none> name=Boss Zombie dmg=5 armor=2 maxhp=20/,
    );
    await bot.waitForMessage("entcheck: tag=boss");
    await bot.waitForMessage("entcheck: ai=off");

    // -- Velocity: set straight up, components read back in
    // the same trigger. --
    await chat("/entvel");
    await bot.waitForMessage(/entvel: vx=0 vy=0\.5 vz=0/);

    // -- Rename + untag. --
    await chat("/entstrip");
    await bot.waitForMessage(/entstrip: name=Renamed/);
    await bot.waitForMessage("entstrip: tag=none");

    // -- The player's main hand reads the same through the
    // player tool expression and the entity equipment form. --
    await t.console("clear EntityBot");
    await chat("/enthand");
    await bot.waitForMessage(/enthand: tool=air equip=air/);

    await t.console("execute at EntityBot run kill @e[type=!minecraft:player,distance=..30]");
  } finally {
    bot.disconnect();
  }
});
