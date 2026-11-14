import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  broadcast,
  emit,
  emitIr,
  fmt,
  guiEventId,
  guiEventIs,
  guiHandle,
  ifElse,
  isEngineOnlyScript,
  num,
  onInventoryClick,
  onJoin,
  openGui,
  player,
  script,
  str,
  type GuiHandle,
} from "../src/index.js";
import { guiIdentityScript, otherGui, shopGui } from "../examples/guiidentity.js";
import { guiScript } from "../examples/gui.js";
import { welcomeScript } from "../examples/welcome.js";

// GUI identity (feedback B3 / T4) is engine-only: the identity
// lives in the engine jar's registry, so — like the other
// engine-only samples (mundosk, gui2cursor) — the sample has no
// .sk golden fixture; its golden fixture is the emitted IR
// (tests/fixtures/guiidentity.ir.json), and the .sk emitter must
// refuse the script instead of guessing a form.
describe("GUI identity (feedback B3 / T4, engine-only)", () => {
  it("the sample's IR matches the golden fixture", () => {
    const fixture = readFileSync(
      fileURLToPath(new URL("./fixtures/guiidentity.ir.json", import.meta.url)),
      "utf8",
    );
    expect(emitIr(guiIdentityScript)).toBe(fixture);
  });

  it("the identity sample is detected as engine-only, the core samples are not", () => {
    expect(isEngineOnlyScript(guiIdentityScript)).toBe(true);
    expect(isEngineOnlyScript(guiScript)).toBe(false);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("each identity construct on its own makes a script engine-only", () => {
    expect(isEngineOnlyScript(script(onJoin([openGui(player(), num(1), str("T"), shopGui)])))).toBe(
      true,
    );
    expect(
      isEngineOnlyScript(
        script(onInventoryClick([ifElse(guiEventIs(shopGui), [broadcast(str("y"))])])),
      ),
    ).toBe(true);
    expect(
      isEngineOnlyScript(script(onInventoryClick([broadcast(fmt("id=", guiEventId()))]))),
    ).toBe(true);
  });

  it("an untagged openGui stays fully core: same node kind, same .sk text", () => {
    const stmt = openGui(player(), num(3), str("Shop Menu"));
    expect(stmt.kind).toBe("openGui");
    expect(isEngineOnlyScript(script(onJoin([openGui(player(), num(3), str("Shop Menu"))])))).toBe(
      false,
    );
    expect(emit(script(onJoin([openGui(player(), num(3), str("Shop Menu"))])))).toBe(
      'on join:\n    open chest inventory with 3 rows named "Shop Menu" to player\n',
    );
  });

  it("a tagged openGui is its own statement kind carrying the handle id", () => {
    const stmt = openGui(player(), num(3), str("Shop"), shopGui) as unknown as Record<
      string,
      unknown
    >;
    expect(stmt["kind"]).toBe("openGuiTagged");
    expect(stmt["guiId"]).toBe("shop");
    const untitled = openGui(player(), num(2), undefined, otherGui) as unknown as Record<
      string,
      unknown
    >;
    expect(untitled["kind"]).toBe("openGuiTagged");
    expect(untitled["guiId"]).toBe("other");
    expect("title" in untitled).toBe(false);
  });

  it("the IR keeps the identity node kinds and ids for the engine to dispatch on", () => {
    const json = JSON.stringify(JSON.parse(emitIr(guiIdentityScript)));
    expect(json).toContain("openGuiTagged");
    expect(json).toContain("guiEventIs");
    expect(json).toContain("guiEventId");
    expect(json).toContain('"guiId":"shop"');
    expect(json).toContain('"guiId":"other"');
  });

  it("the .sk emitter refuses identity constructs instead of guessing", () => {
    expect(() => emit(guiIdentityScript)).toThrow(/Unhandled/);
    expect(() => emit(script(onJoin([openGui(player(), num(1), str("T"), shopGui)])))).toThrow(
      /Unhandled/,
    );
    expect(() => emit(script(onInventoryClick([broadcast(fmt("id=", guiEventId()))])))).toThrow(
      /Unhandled/,
    );
    expect(() =>
      emit(script(onInventoryClick([ifElse(guiEventIs(shopGui), [broadcast(str("y"))])]))),
    ).toThrow(/Unhandled/);
  });

  it("guiHandle validates its id and exposes it read-only", () => {
    expect(shopGui.id).toBe("shop");
    expect(otherGui.id).toBe("other");
    expect(guiHandle("  padded  ").id).toBe("  padded  ");
    expect(() => guiHandle("")).toThrow(RangeError);
    expect(() => guiHandle("   ")).toThrow(RangeError);
    // Loose (plain-JS) callers bypassing the types are rejected too.
    expect(() => guiHandle(42 as unknown as string)).toThrow(RangeError);
    expect(() => guiEventIs({ id: "" } as GuiHandle)).toThrow(RangeError);
    expect(() => guiEventIs(null as unknown as GuiHandle)).toThrow(RangeError);
    expect(() => openGui(player(), num(1), str("T"), { id: " " } as GuiHandle)).toThrow(RangeError);
  });

  it("guiEventIs builds the condition node from the handle's id", () => {
    expect(guiEventIs(shopGui)).toEqual({ kind: "guiEventIs", guiId: "shop" });
    expect(guiEventId()).toEqual({ kind: "guiEventId" });
  });
});
