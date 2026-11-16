import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  blockAt,
  bool,
  broadcast,
  chunkTag,
  command,
  deleteChunkTag,
  emit,
  emitIr,
  fmt,
  hasChunkTag,
  ifElse,
  isEngineOnlyScript,
  locationOf,
  onJoin,
  player,
  script,
  setChunkTag,
  str,
} from "../src/index.js";
import { chunkTagsScript } from "../examples/chunktags.js";
import { welcomeScript } from "../examples/welcome.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

// Chunk tags (ext-console U2) are engine-only, mirroring the
// hidden item tags: the tags live in the chunk's
// PersistentDataContainer, which Skript cannot access, so the
// emitter refuses the script and only the engine jar runs it.
// The golden fixture is the IR, like itemtags.
describe("chunk tags (ext-console U2, engine-only)", () => {
  it("the chunktags example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(chunkTagsScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("each of the four builders alone makes a script engine-only", () => {
    const at = blockAt(locationOf(player()));
    expect(isEngineOnlyScript(script(command("x", null, [setChunkTag(at, "k", str("a"))])))).toBe(
      true,
    );
    expect(isEngineOnlyScript(script(command("x", null, [deleteChunkTag(at, "k")])))).toBe(true);
    expect(isEngineOnlyScript(script(onJoin([broadcast(fmt("t=", chunkTag(at, "k")))])))).toBe(
      true,
    );
    expect(
      isEngineOnlyScript(script(onJoin([ifElse(hasChunkTag(at, "k"), [broadcast(str("y"))])]))),
    ).toBe(true);
    expect(isEngineOnlyScript(script(command("x", null, [])))).toBe(false);
  });

  it("the sample's IR matches the golden fixture", () => {
    expect(emitIr(chunkTagsScript)).toBe(fixture("chunktags.ir.json"));
  });

  it("the IR keeps the tag node kinds for the engine to dispatch on", () => {
    const json = emitIr(chunkTagsScript);
    expect(json).toContain('"setChunkTag"');
    expect(json).toContain('"deleteChunkTag"');
    expect(json).toContain('"chunkTag"');
    expect(json).toContain('"hasChunkTag"');
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(chunkTagsScript)).toThrow(/Unhandled/);
    const at = blockAt(locationOf(player()));
    expect(() => emit(script(command("x", null, [setChunkTag(at, "k", "a")])))).toThrow(
      /engine-only/,
    );
  });

  it("tag keys are validated at build time: lowercase [a-z0-9._-] only, like item tags", () => {
    const at = blockAt(locationOf(player()));
    for (const ok of ["placed", "a", "tier.2", "x_y-z", "0"]) {
      expect(() => setChunkTag(at, ok, str("v"))).not.toThrow();
      expect(() => deleteChunkTag(at, ok)).not.toThrow();
      expect(() => chunkTag(at, ok)).not.toThrow();
      expect(() => hasChunkTag(at, ok)).not.toThrow();
    }
    for (const bad of ["", "Placed", "has space", "a/b", "a:b", "é", "a%"]) {
      expect(() => setChunkTag(at, bad, str("v"))).toThrow(RangeError);
      expect(() => deleteChunkTag(at, bad)).toThrow(RangeError);
      expect(() => chunkTag(at, bad)).toThrow(RangeError);
      expect(() => hasChunkTag(at, bad)).toThrow(RangeError);
    }
  });

  it("setChunkTag normalizes literal values like the other builders", () => {
    const at = blockAt(locationOf(player()));
    expect(setChunkTag(at, "count", 7)).toMatchObject({
      kind: "setChunkTag",
      value: { kind: "number", value: 7 },
    });
    expect(setChunkTag(at, "owned", true)).toMatchObject({
      value: { kind: "boolean", value: true },
    });
    expect(setChunkTag(at, "placed", "x")).toMatchObject({
      value: { kind: "string", value: "x" },
    });
    expect(bool(true).kind).toBe("boolean");
  });
});
