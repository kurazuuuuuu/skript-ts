import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  command,
  emit,
  fmt,
  fontCharOf,
  num,
  openGui,
  player,
  script,
  send,
  type Script,
} from "../src/index.js";
import { allocateFontChars, emptyFontCharRegistry } from "../src/packregistry.js";
import {
  defineFontChar,
  definePack,
  defineTexture,
  parseResourceId,
  type FontCharDef,
  type PackDef,
} from "../src/resourcepack.js";
import { buildFontCharTable, resolveCustomItems, resolvePackFontChars } from "../src/resolve.js";
import { fontUiScript } from "../examples/fontui.js";
import { resourcePack } from "../examples/resourcepack.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

function samplePack(): PackDef {
  const texture = defineTexture({
    id: "ui/icons",
    palette: { ".": "transparent", r: "#FF0000FF" },
    size: [2, 2],
    map: ["r.", ".r"],
  });
  return definePack({
    namespace: "example",
    description: "Example resource pack",
    textures: [texture],
    fontChars: [
      defineFontChar({ id: "ui/coin_icon", texture, ascent: 7 }),
      defineFontChar({ id: "ui/gem_icon", texture, ascent: 7 }),
      defineFontChar({ id: "ui/star_icon", texture, char: "\uE100", ascent: 7 }),
    ],
  });
}

/** Allocate a pack's font chars the way the project build does. */
function allocationsFor(pack: PackDef) {
  return allocateFontChars(
    emptyFontCharRegistry(),
    pack.fontChars.map((fontChar) => {
      const id = parseResourceId(fontChar.id, pack.namespace);
      return {
        id: `${id.namespace}:${id.path}`,
        ...(fontChar.char !== undefined ? { char: fontChar.char } : {}),
      };
    }),
  ).allocations;
}

function resolve(scriptValue: Script, pack: PackDef): Script {
  return resolveCustomItems(
    scriptValue,
    new Map(),
    "test.ts",
    pack.namespace,
    buildFontCharTable(pack, allocationsFor(pack)),
  );
}

describe("fontCharOf resolution (RP-4)", () => {
  it("allocates the sample pack's chars in declaration order", () => {
    const allocations = allocationsFor(samplePack());
    expect(allocations.get("example:ui/coin_icon")).toBe("\uE000");
    expect(allocations.get("example:ui/gem_icon")).toBe("\uE001");
    expect(allocations.get("example:ui/star_icon")).toBe("\uE100");
  });

  it("replaces a known ref with a string literal carrying the char", () => {
    const pack = samplePack();
    const source = script(
      command("x", null, [send(player(), fmt("coin:", fontCharOf("ui/coin_icon")))]),
    );
    const out = emit(resolve(source, pack));
    expect(out).toContain('send "coin:\uE000" to player');
  });

  it("resolves a fully namespaced ref and a FontCharDef ref identically", () => {
    const pack = samplePack();
    const byName = script(
      command("x", null, [send(player(), fmt("g:", fontCharOf("example:ui/gem_icon")))]),
    );
    const def = pack.fontChars[1] as FontCharDef;
    const byDef = script(command("x", null, [send(player(), fmt("g:", fontCharOf(def)))]));
    expect(emit(resolve(byName, pack))).toBe(emit(resolve(byDef, pack)));
    expect(emit(resolve(byDef, pack))).toContain('send "g:\uE001" to player');
  });

  it("composes into a GUI title like any other text part", () => {
    const pack = samplePack();
    const source = script(
      command("x", null, [openGui(player(), num(3), fmt("gem ", fontCharOf("ui/gem_icon")))]),
    );
    expect(emit(resolve(source, pack))).toContain(
      'open chest inventory with 3 rows named "gem \uE001" to player',
    );
  });

  it("fails the build for a font char the pack does not define", () => {
    const pack = samplePack();
    const bad = script(command("x", null, [send(player(), fontCharOf("ui/nope"))]));
    expect(() => resolve(bad, pack)).toThrow(
      /font char "example:ui\/nope" is not defined in the project's resource pack/,
    );
  });

  it("fails the build when no font char table is supplied at all", () => {
    const source = script(command("x", null, [send(player(), fontCharOf("ui/coin_icon"))]));
    expect(() => resolveCustomItems(source, new Map(), "test.ts", "example")).toThrow(
      /font char "example:ui\/coin_icon" is not defined/,
    );
  });

  it("refuses to emit an unresolved fontCharOf", () => {
    const source = script(command("x", null, [send(player(), fontCharOf("ui/coin_icon"))]));
    expect(() => emit(source)).toThrow(
      /emit: fontCharOf must be resolved by the project build before emitting/,
    );
  });

  it("rejects an empty ref and a wrong-kind def at build time", () => {
    expect(() => fontCharOf("")).toThrow(/non-empty string/);
    const notAFontChar = { kind: "item", id: "gem" } as unknown as FontCharDef;
    expect(() => fontCharOf(notAFontChar)).toThrow(/kind "fontChar"/);
  });
});

describe("resolvePackFontChars / buildFontCharTable (RP-4)", () => {
  it("fills every font char of the pack copy and leaves the original unresolved", () => {
    const pack = samplePack();
    const resolved = resolvePackFontChars(pack, allocationsFor(pack));
    expect(resolved.fontChars.map((fontChar) => fontChar.char)).toEqual([
      "\uE000",
      "\uE001",
      "\uE100",
    ]);
    expect(pack.fontChars[0]?.char).toBeUndefined();
  });

  it("throws when an auto-allocated char has no allocation", () => {
    const pack = samplePack();
    expect(() => resolvePackFontChars(pack, new Map())).toThrow(/has no resolved char/);
  });

  it("builds the id -> char table from allocations with explicit chars as fallback", () => {
    const pack = samplePack();
    const table = buildFontCharTable(pack, allocationsFor(pack));
    expect(table.get("example:ui/coin_icon")).toBe("\uE000");
    expect(table.get("example:ui/gem_icon")).toBe("\uE001");
    expect(table.get("example:ui/star_icon")).toBe("\uE100");
    const partial = buildFontCharTable(pack, new Map());
    expect(partial.has("example:ui/coin_icon")).toBe(false);
    expect(partial.get("example:ui/star_icon")).toBe("\uE100");
  });
});

describe("fontui sample (RP-4)", () => {
  it("matches the golden fixture once resolved against the example pack", () => {
    const resolved = resolveCustomItems(
      fontUiScript,
      new Map(),
      "examples/fontui.ts",
      resourcePack.namespace,
      buildFontCharTable(resourcePack, allocationsFor(resourcePack)),
    );
    expect(emit(resolved)).toBe(fixture("fontui.sk"));
  });
});
