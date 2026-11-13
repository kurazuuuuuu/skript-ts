import { defineBehavior, type BehaviorBot } from "../../src/behavior.js";

// gameplay.ts (phase 14): gameplay events — block break / place,
// right / left click, damage — exercised with real bot actions:
// the bot digs, places, clicks and fights, and the world's state
// afterwards (block gone / still there, health) is asserted, not
// just the messages. All constructs are core language, so this
// test runs under BOTH runtimes with identical expectations.
//
// The harness's waitForMessage scans the whole message buffer, so
// repeated expectations would match stale copies; waitNew only
// looks at messages that arrived after a mark.
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

function expectBlock(bot: BehaviorBot, x: number, y: number, z: number, name: string | null): void {
  const actual = bot.blockNameAt(x, y, z);
  if (actual !== name) {
    throw new Error(
      `block at ${x}, ${y}, ${z}: expected ${name ?? "(air)"}, got ${actual ?? "(air)"}`,
    );
  }
}

function expectHealth(bot: BehaviorBot, min: number, max: number, what: string): void {
  const h = bot.health();
  if (!(h >= min && h <= max)) {
    throw new Error(`${what}: expected health in [${min}, ${max}], got ${h}`);
  }
}

// Wait for a "<victim> was hurt by <attacker>: <amt> damage
// (attack)" message after the mark and return the amount. The
// amount itself is the server's own computation (a fist hit is 1
// only at full attack charge; a recently teleported / logged-in
// attacker reads lower, e.g. 0.5) — identical under both runtimes
// because the engine reads the same Bukkit event — so the test
// pins the amount's CONSISTENCY with the health the victim
// actually lost, not a literal 1.
async function waitHurt(
  bot: BehaviorBot,
  mark: number,
  victim: string,
  attacker: string,
  timeoutMs = 10_000,
): Promise<number> {
  const re = new RegExp(`^${victim} was hurt by ${attacker}: ([0-9.]+) damage \\(attack\\)$`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const msg of bot.messages.slice(mark)) {
      const hit = re.exec(msg);
      if (hit !== null) return Number(hit[1]);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${victim} was hurt by ${attacker}"; fresh messages: ${bot.messages.slice(mark).join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Like waitHurt, but the damage cause is a parameter and the
// participants are mobs (their labels are type names, identical
// under both runtimes: the engine stringifies a non-player
// entity by its type name, as does the original).
async function waitHurtCause(
  bot: BehaviorBot,
  mark: number,
  victim: string,
  attacker: string,
  cause: string,
  timeoutMs = 15_000,
): Promise<number> {
  const re = new RegExp(
    `^${victim} was hurt by ${attacker}: ([0-9.]+) damage \\(${cause}\\)$`,
  );
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const msg of bot.messages.slice(mark)) {
      const hit = re.exec(msg);
      if (hit !== null) return Number(hit[1]);
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for "${victim} was hurt by ${attacker} (${cause})"; fresh messages: ${bot.messages.slice(mark).join(" | ") || "(none)"}`,
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export default defineBehavior(async (t) => {
  // ---------------------------------------------------------------
  // Blocks and clicks (one bot, on the flat sandbox surface)
  // ---------------------------------------------------------------
  const bot = await t.connect("GameBot");
  try {
    await t.sleep(1000); // let the join sequence settle
    // The welcome sample hands every joining bot a wooden sword;
    // clear it so the hand is deterministically empty (the click
    // and break messages report what the hand holds).
    await t.console("clear GameBot");
    // The sandbox world persists between runs and the spawn area's
    // surface is no longer pristine (earlier runs dug it up), so
    // the test builds its own grass platform at a fixed spot far
    // from spawn and works there — same world state every run.
    // Teleport first: the fill only lands once a player has loaded
    // the destination chunks.
    await t.console("tp GameBot 200.5 -60 200.5");
    await t.sleep(800);
    await t.console("fill 198 -61 198 202 -61 202 grass_block");
    await t.console("fill 198 -60 198 202 -56 202 air");
    await t.console("tp GameBot 200.5 -60 200.5");
    await t.sleep(600);
    // Sweep leftover item entities off the platform: earlier
    // tests leave death scatter behind (and the air fill above
    // can pop a leftover bed into an item). Picking one up
    // would change what the hand "holds" in the expectations
    // below — this once made the first dig report a white bed.
    await t.console("kill @e[type=minecraft:item,x=198,y=-61,z=198,dx=4,dy=4,dz=4]");
    const pos = bot.position();
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    // Left click + break: digging the block below fires the click
    // at dig start and the break at completion. The empty hand's
    // event-item has no value under Skript (pinned live: it reads
    // <none>, not "air").
    let m = bot.messages.length;
    await bot.digAt(bx, by - 1, bz);
    await waitNew(bot, m, "GameBot left clicked grass block with <none>", 8000);
    await waitNew(bot, m, "GameBot broke grass block (block item: grass block)", 8000);
    expectBlock(bot, bx, by - 1, bz, null);

    // Restore the platform and put the bot back at grade.
    await t.console("fill 198 -61 198 202 -61 202 grass_block");
    await t.console("tp GameBot 200.5 -60 200.5");
    await t.sleep(600);
    const pos2 = bot.position();
    const cx = Math.floor(pos2.x);
    const cy = Math.floor(pos2.y);
    const cz = Math.floor(pos2.z);

    // Right click on a block with a stick in hand.
    await t.console("give GameBot stick 1");
    await bot.equipItem("stick");
    m = bot.messages.length;
    await bot.activateBlockAt(cx + 1, cy - 1, cz);
    await waitNew(bot, m, "GameBot right clicked grass block with stick", 8000);

    // Place: dirt lands east of the bot at feet level.
    await t.console("give GameBot dirt 4");
    await bot.equipItem("dirt");
    m = bot.messages.length;
    await bot.placeOnTopOf(cx + 1, cy - 1, cz);
    await waitNew(bot, m, "GameBot placed dirt from dirt", 8000);
    expectBlock(bot, cx + 1, cy, cz, "dirt");

    // Cancelled place: stone is refused by the script, so the
    // placement never lands (the place call may hang or reject —
    // either is fine, the world state is the assertion).
    await t.console("give GameBot stone 4");
    await bot.equipItem("stone");
    m = bot.messages.length;
    await Promise.race([
      bot.placeOnTopOf(cx + 2, cy - 1, cz).catch(() => undefined),
      t.sleep(5000),
    ]);
    await waitNew(bot, m, "place blocked for GameBot", 8000);
    await t.sleep(300);
    expectBlock(bot, cx + 2, cy, cz, null);

    // Cancelled break: a dirt block is protected, so digging it
    // runs to completion server-side but the block stays.
    await t.console(`setblock ${cx - 1} ${cy - 1} ${cz} dirt`);
    m = bot.messages.length;
    await Promise.race([bot.digAt(cx - 1, cy - 1, cz).catch(() => undefined), t.sleep(6000)]);
    bot.stopDigging();
    await waitNew(bot, m, "break blocked for GameBot", 8000);
    await t.sleep(300);
    expectBlock(bot, cx - 1, cy - 1, cz, "dirt");
  } finally {
    bot.disconnect();
  }
  await t.sleep(1000); // let the player slot free up

  // ---------------------------------------------------------------
  // Damage (an attacker bot and three victim bots, in sequence)
  // ---------------------------------------------------------------
  // Pin the difficulty: an earlier suite may leave the world
  // on peaceful, where a fist hit fires the damage event (and
  // its broadcast) but the applied damage is nullified, so the
  // health assertions below would read a full 20.
  await t.console("difficulty easy");
  await t.console("time set 1000");
  await t.console("kill @e[type=minecraft:slime]");
  const attacker = await t.connect("AttackBot");
  try {
    // Bare fists only: the welcome sample's wooden sword would
    // change the damage amount (a sword hit is not 1).
    await t.console("clear AttackBot");
    // Fight on the test platform, away from spawn's wildlife.
    await t.console("tp AttackBot 200.5 -60 200.5");
    await t.sleep(600);
    // A plain fist hit, cause "attack": the reported amount is
    // applied to the victim's health in full.
    const plain = await t.connect("PlainBot");
    try {
      await t.console("tp PlainBot AttackBot");
      await t.sleep(1200);
      const m = plain.messages.length;
      await attacker.attackPlayer("PlainBot");
      const amt = await waitHurt(plain, m, "PlainBot", "AttackBot");
      if (!(amt > 0 && amt <= 1)) throw new Error(`fist damage amount out of range: ${amt}`);
      await t.sleep(300);
      expectHealth(plain, 20 - amt - 1.5, 20 - amt + 0.01, "PlainBot after one fist hit");
    } finally {
      plain.disconnect();
    }
    await t.sleep(1000);

    // ShieldBot: the handler cancels the damage outright.
    const shield = await t.connect("ShieldBot");
    try {
      await t.console("tp ShieldBot AttackBot");
      await t.sleep(1200);
      const m = shield.messages.length;
      await attacker.attackPlayer("ShieldBot");
      await waitHurt(shield, m, "ShieldBot", "AttackBot");
      await waitNew(shield, m, "shielded ShieldBot", 8000);
      await t.sleep(300);
      expectHealth(shield, 20, 20, "ShieldBot after a cancelled hit");
    } finally {
      shield.disconnect();
    }
    await t.sleep(1000);

    // HalfBot: the handler rewrites the damage to half, and the
    // victim's health drops by the halved amount, not the full
    // one the message reported (the broadcast runs before the
    // rewrite in the handler).
    const half = await t.connect("HalfBot");
    try {
      await t.console("tp HalfBot AttackBot");
      await t.sleep(1200);
      const m = half.messages.length;
      await attacker.attackPlayer("HalfBot");
      const amt = await waitHurt(half, m, "HalfBot", "AttackBot");
      if (!(amt > 0 && amt <= 1)) throw new Error(`fist damage amount out of range: ${amt}`);
      await t.sleep(300);
      expectHealth(half, 20 - amt / 2 - 1.5, 20 - amt / 2 + 0.01, "HalfBot after a halved hit");
    } finally {
      half.disconnect();
    }
  } finally {
    attacker.disconnect();
  }
  await t.sleep(1000); // let the player slot free up

  // ---------------------------------------------------------------
  // Projectile attacker resolution (B1), with console-driven
  // mobs on a roofed pad (the roof keeps the undead from
  // burning in daylight). Probed against the real Skript: a
  // projectile damager resolves to its shooter — a skeleton's
  // arrows read attacker "skeleton" (never "arrow") — while a
  // melee hit reads the damager itself. The observer watches
  // from a sealed pocket under the pad, out of every mob's
  // line of sight (a visible bot draws the skeleton's target).
  // ---------------------------------------------------------------
  await t.console("difficulty easy");
  await t.console("time set 1000");
  const watcher = await t.connect("BowBot");
  try {
    await t.console("tp BowBot 200.5 -60 216.5");
    await t.sleep(800);
    await t.console("fill 199 -65 215 201 -64 216 stone");
    await t.console("fill 199 -63 215 201 -62 216 air");
    await t.console("tp BowBot 200.5 -63 216.5");
    await t.sleep(400);
    await t.console("fill 191 -61 208 209 -61 224 stone");
    await t.console("fill 191 -60 208 209 -56 224 air");
    await t.console("fill 191 -55 208 209 -55 224 stone");
    // A two-high rim keeps the mobs on the pad (a strafing
    // skeleton otherwise backs off the edge mid-fight).
    await t.console("fill 191 -60 208 209 -59 208 stone");
    await t.console("fill 191 -60 224 209 -59 224 stone");
    await t.console("fill 191 -60 209 191 -59 223 stone");
    await t.console("fill 209 -60 209 209 -59 223 stone");
    await t.sleep(600);
    await t.console("kill @e[type=minecraft:zombie,x=191,y=-61,z=208,dx=18,dy=6,dz=16]");
    await t.console("kill @e[type=minecraft:skeleton,x=191,y=-61,z=208,dx=18,dy=6,dz=16]");

    // Projectile: a fence row the skeleton cannot cross (the
    // golem stands 7 blocks past it, far beyond melee reach)
    // forces arrow hits. The original reads an arrow hit's
    // cause as "attack" (a snowball reads "projectile"
    // instead — both probed), and the attacker as the
    // skeleton that shot it. (The melee control case — the
    // attacker is the damager itself — is covered by the bot
    // fist-fight sections above and by events3's Death B; a
    // mob-melee pair here proved too load-sensitive to keep.)
    await t.console("fill 200 -60 213 200 -60 219 oak_fence");
    await t.console("summon iron_golem 207.5 -60 216.5 {NoAI:1b,PersistenceRequired:1b}");
    let m = watcher.messages.length;
    await t.console("summon skeleton 193.5 -60 216.5 {PersistenceRequired:1b}");
    await waitHurtCause(watcher, m, "iron golem", "skeleton", "attack", 30_000);
    await t.console("kill @e[type=minecraft:skeleton]");
    await t.console("kill @e[type=minecraft:iron_golem]");
    await t.console("kill @e[type=minecraft:arrow]");
    await t.console("fill 200 -60 213 200 -60 219 air");
  } finally {
    watcher.disconnect();
  }
});
