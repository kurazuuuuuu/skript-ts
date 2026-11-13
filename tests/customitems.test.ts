import { describe, expect, it } from "vitest";
import {
  command,
  customItem,
  customModelDataOf,
  defineItem,
  definePack,
  defineTexture,
  emit,
  giveItem,
  itemModelOf,
  player,
  script,
  send,
  set,
  variable,
  type Script,
} from "../src/index.js";
import { buildCustomItemTable, resolveCustomItems } from "../src/resolve.js";

function samplePack() {
  const texture = defineTexture({
    id: "item/gem",
    palette: { ".": "transparent", r: "#FF0000FF" },
    size: [2, 2],
    map: ["r.", ".r"],
  });
  return definePack({
    namespace: "example",
    description: "Example resource pack",
    textures: [texture],
    items: [
      defineItem({
        id: "gem",
        baseItem: "minecraft:amethyst_shard",
        displayName: "ジェム",
        texture,
      }),
    ],
  });
}

function sampleScript(): Script {
  return script(
    command("citem", null, [
      set(variable("citem"), customItem("gem")),
      giveItem(player(), variable("citem")),
      send(player(), itemModelOf(variable("citem"))),
    ]),
  );
}

describe("customItem resolution (RP-2)", () => {
  it("resolves against the pack and emits the probed suffix chain", () => {
    const table = buildCustomItemTable(samplePack(), new Map([["example:gem", 1]]));
    const resolved = resolveCustomItems(sampleScript(), table, "customitems.ts", "example");
    expect(emit(resolved)).toContain(
      'set {citem} to minecraft:amethyst_shard with item model "example:gem" with custom model data 1 named "ジェム"',
    );
    expect(emit(resolved)).toContain("give {citem} to player");
  });

  it("resolves a fully namespaced ref and an ItemDef ref identically", () => {
    const pack = samplePack();
    const table = buildCustomItemTable(pack, new Map([["example:gem", 1]]));
    const byName = script(command("a", null, [giveItem(player(), customItem("example:gem"))]));
    const item = pack.items[0];
    if (!item) throw new Error("sample pack lost its item");
    const byDef = script(command("a", null, [giveItem(player(), customItem(item))]));
    const a = emit(resolveCustomItems(byName, table, "a.ts", "example"));
    const b = emit(resolveCustomItems(byDef, table, "a.ts", "example"));
    expect(a).toBe(b);
  });

  it("fails the build for an item the pack does not define", () => {
    const table = buildCustomItemTable(samplePack(), new Map());
    const bad = script(command("a", null, [giveItem(player(), customItem("nope"))]));
    expect(() => resolveCustomItems(bad, table, "a.ts", "example")).toThrow(
      /custom item "example:nope" is not defined in the project's resource pack/,
    );
  });

  it("refuses to emit an unresolved customItem", () => {
    expect(() => emit(sampleScript())).toThrow(/must be resolved by the project build/);
  });

  it("rejects an empty ref at build time", () => {
    expect(() => customItem("")).toThrow(/non-empty string/);
  });
});

describe("component read-backs (RP-2)", () => {
  it("emits the probed getter forms", () => {
    const s = script(
      command("a", null, [
        send(player(), itemModelOf(variable("x"))),
        send(player(), customModelDataOf(variable("x"))),
      ]),
    );
    const out = emit(s);
    expect(out).toContain("item model of {x}");
    expect(out).toContain("custom model data of {x}");
  });
});
