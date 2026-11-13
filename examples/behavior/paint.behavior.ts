import { defineBehavior } from "../../src/behavior.js";

// World paint family (engine-only). The bot stands on the
// standard platform at (300, -60, 300) and drives the paint
// sample's commands, reading the world back block by block:
//   - a noise-mixed floor is reproducible (same seed, same
//     grid) and changes with the seed
//   - a weight-mixed floor is reproducible the same way
//   - cuboid / line / sphere / cylinder land exactly where the
//     geometry says, and nowhere else
//   - a replace-restricted paint only touches the named
//     material
// Under Skript mode the paint script is not deployed at all, so
// there is nothing to exercise.
export default defineBehavior(async (t) => {
  if (t.mode !== "engine") return; // engine-only features; see header comment
  const bot = await t.connect("PaintBot");
  const count = (sub: string): number => bot.messages.filter((m) => m.includes(sub)).length;
  const waitCount = async (sub: string, n: number, timeoutMs = 20_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (count(sub) < n) {
      if (Date.now() > deadline) {
        const recent = bot.messages.slice(-8).join(" | ") || "(none)";
        throw new Error(
          `timed out after ${timeoutMs}ms waiting for ${n}x "${sub}" (saw ${count(sub)}); recent messages: ${recent}`,
        );
      }
      await t.sleep(100);
    }
  };
  const chat = async (text: string): Promise<void> => {
    bot.chat(text);
    await t.sleep(600); // pace commands (Paper command-spam kick)
  };
  const expectBlock = async (
    x: number,
    y: number,
    z: number,
    name: string | null,
  ): Promise<void> => {
    // Block changes reach the bot as packets; poll briefly for
    // the expected value. For an "air" expectation, settle first
    // so a stray write has a chance to land before the check.
    if (name === null) await t.sleep(400);
    const deadline = Date.now() + 5_000;
    for (;;) {
      const actual = bot.blockNameAt(x, y, z);
      if (actual === name) return;
      if (Date.now() > deadline) {
        throw new Error(`block at ${x}, ${y}, ${z}: expected ${name}, got ${actual}`);
      }
      await t.sleep(100);
    }
  };
  // The 5x1x5 floor under the bot: x 298..302, y -61, z 298..302.
  const floorGrid = (): (string | null)[] => {
    const out: (string | null)[] = [];
    for (let x = 298; x <= 302; x++) {
      for (let z = 298; z <= 302; z++) out.push(bot.blockNameAt(x, -61, z));
    }
    return out;
  };
  // Poll the floor grid until every cell shows a painted
  // material (block packets lag the command reply), then return
  // the settled grid.
  const settledFloorGrid = async (label: string): Promise<(string | null)[]> => {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const grid = floorGrid();
      if (grid.every((c) => c === "dirt" || c === "gravel")) return grid;
      if (Date.now() > deadline) {
        throw new Error(`${label}: floor did not settle to dirt/gravel: ${grid.join(",")}`);
      }
      await t.sleep(100);
    }
  };
  const expectMixedGrid = (grid: (string | null)[], label: string): void => {
    for (const cell of grid) {
      if (cell !== "dirt" && cell !== "gravel") {
        throw new Error(`${label}: every cell must be dirt or gravel, got ${cell}`);
      }
    }
    if (!grid.includes("dirt") || !grid.includes("gravel")) {
      throw new Error(`${label}: the mix must contain both dirt and gravel`);
    }
  };

  try {
    await t.console("difficulty peaceful");
    await t.console("tp PaintBot 300.5 -60 300.5");
    await t.sleep(500);
    await t.console("fill 296 -61 296 304 -61 304 stone");
    await t.console("fill 296 -60 296 304 -56 304 air");
    await t.console("tp PaintBot 300.5 -60 300.5");
    await t.sleep(500);
    await t.console("clear PaintBot");

    // -- Noise fill: mixed, reproducible, seed-sensitive. --
    await chat("/paintfloor");
    await waitCount("paint floor done", 1);
    const noiseA = await settledFloorGrid("noise floor");
    expectMixedGrid(noiseA, "noise floor");

    await chat("/paintfloor");
    await waitCount("paint floor done", 2);
    const noiseB = await settledFloorGrid("noise floor repaint");
    if (JSON.stringify(noiseB) !== JSON.stringify(noiseA)) {
      throw new Error("noise floor: repainting with the same seed changed the grid");
    }

    await chat("/paintfloor2");
    await waitCount("paint floor2 done", 1);
    await t.sleep(500); // no reset between paints: let seed-8 packets land
    const noiseC = await settledFloorGrid("noise floor (seed 8)");
    expectMixedGrid(noiseC, "noise floor (seed 8)");
    if (JSON.stringify(noiseC) === JSON.stringify(noiseA)) {
      throw new Error("noise floor: a different seed produced the same grid");
    }

    // -- Mix fill: mixed and reproducible. --
    await t.console("fill 298 -61 298 302 -61 302 stone");
    await chat("/paintmix");
    await waitCount("paint mix done", 1);
    const mixA = await settledFloorGrid("mix floor");
    expectMixedGrid(mixA, "mix floor");

    await t.console("fill 298 -61 298 302 -61 302 stone");
    await chat("/paintmix");
    await waitCount("paint mix done", 2);
    const mixB = await settledFloorGrid("mix floor repaint");
    if (JSON.stringify(mixB) !== JSON.stringify(mixA)) {
      throw new Error("mix floor: repainting with the same seed changed the grid");
    }

    // -- Cuboid with a uniform fill, then replace-restricted repaints. --
    await chat("/paintwall");
    await waitCount("paint wall done", 1);
    await expectBlock(303, -58, 300, "stone_bricks");
    await expectBlock(303, -60, 298, "stone_bricks");
    await expectBlock(304, -58, 300, null);

    await chat("/painttrim");
    await waitCount("paint trim done", 1);
    await expectBlock(303, -58, 300, "stone_bricks"); // no glass in the wall: untouched

    await chat("/paintgild");
    await waitCount("paint gild done", 1);
    await expectBlock(303, -58, 300, "gold_block");
    await expectBlock(303, -57, 302, "gold_block");

    // -- Line: endpoints, a middle step, and the rise. --
    await chat("/paintline");
    await waitCount("paint line done", 1);
    await expectBlock(302, -59, 297, "gold_block");
    await expectBlock(304, -57, 297, "gold_block");
    await expectBlock(306, -56, 297, "gold_block");
    await expectBlock(302, -56, 297, null); // the line rises; nothing at its start height here

    // -- Sphere: center, in-radius axis points, outside points bare. --
    await chat("/paintball");
    await waitCount("paint ball done", 1);
    await expectBlock(296, -57, 300, "glass");
    await expectBlock(298, -57, 300, "glass");
    await expectBlock(296, -56, 300, "glass");
    await expectBlock(299, -57, 300, null);
    await expectBlock(298, -56, 302, null);

    // -- Cylinder: base, top layer, a rim point, outside points bare. --
    await chat("/painttower");
    await waitCount("paint tower done", 1);
    await expectBlock(297, -60, 303, "cobblestone");
    await expectBlock(297, -58, 303, "cobblestone");
    await expectBlock(296, -59, 303, "cobblestone");
    await expectBlock(298, -59, 304, null);
    await expectBlock(297, -57, 303, null);
  } finally {
    bot.disconnect();
  }
});
