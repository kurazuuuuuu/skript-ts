import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bool,
  broadcast,
  command,
  emit,
  emitIr,
  fmt,
  hasItemTag,
  ifElse,
  isEngineOnlyScript,
  item,
  itemTag,
  localVar,
  onJoin,
  script,
  setItemTag,
  str,
  variable,
} from "../src/index.js";
import { itemTagsScript } from "../examples/itemtags.js";
import { welcomeScript } from "../examples/welcome.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

// Hidden item tags (feedback D) are engine-only: the tags live in
// the item's PersistentDataContainer, which Skript cannot access,
// so the emitter refuses the script and only the engine jar runs
// it. The golden fixture for an engine-only sample is its IR —
// the exact text the build deploys — pinned in
// tests/fixtures/itemtags.ir.json.
describe("hidden item tags (feedback D, engine-only)", () => {
  it("the itemtags example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(itemTagsScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("each of the three builders alone makes a script engine-only", () => {
    expect(
      isEngineOnlyScript(
        script(command("x", null, [setItemTag(localVar("i"), "serial", str("a"))])),
      ),
    ).toBe(true);
    expect(
      isEngineOnlyScript(script(onJoin([broadcast(fmt("t=", itemTag(variable("i"), "serial")))]))),
    ).toBe(true);
    expect(
      isEngineOnlyScript(
        script(onJoin([ifElse(hasItemTag(variable("i"), "serial"), [broadcast(str("y"))])])),
      ),
    ).toBe(true);
    expect(isEngineOnlyScript(script(command("x", null, [])))).toBe(false);
    const ir = emitIr(script(command("x", null, [setItemTag(localVar("i"), "flag", bool(true))])));
    expect(ir).toContain('"setItemTag"');
  });

  it("the sample's IR matches the golden fixture", () => {
    expect(emitIr(itemTagsScript)).toBe(fixture("itemtags.ir.json"));
  });

  it("the IR keeps the tag node kinds for the engine to dispatch on", () => {
    const json = emitIr(itemTagsScript);
    expect(json).toContain('"setItemTag"');
    expect(json).toContain('"itemTag"');
    expect(json).toContain('"hasItemTag"');
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(itemTagsScript)).toThrow(/Unhandled/);
    expect(() =>
      emit(script(command("x", null, [setItemTag(localVar("i"), "serial", "a")]))),
    ).toThrow(/engine-only/);
  });

  it("tag keys are validated at build time: lowercase [a-z0-9._-] only", () => {
    for (const ok of ["serial", "a", "tier.2", "x_y-z", "0"]) {
      expect(() => setItemTag(localVar("i"), ok, str("v"))).not.toThrow();
      expect(() => itemTag(item("diamond"), ok)).not.toThrow();
      expect(() => hasItemTag(item("diamond"), ok)).not.toThrow();
    }
    for (const bad of ["", "Serial", "has space", "a/b", "a:b", "é", "a%"]) {
      expect(() => setItemTag(localVar("i"), bad, str("v"))).toThrow(RangeError);
      expect(() => itemTag(item("diamond"), bad)).toThrow(RangeError);
      expect(() => hasItemTag(item("diamond"), bad)).toThrow(RangeError);
    }
  });

  it("setItemTag normalizes literal values like the other builders", () => {
    expect(setItemTag(localVar("i"), "tier", 3)).toMatchObject({
      kind: "setItemTag",
      value: { kind: "number", value: 3 },
    });
    expect(setItemTag(localVar("i"), "genuine", true)).toMatchObject({
      value: { kind: "boolean", value: true },
    });
    expect(setItemTag(localVar("i"), "serial", "gem-001")).toMatchObject({
      value: { kind: "string", value: "gem-001" },
    });
  });
});
