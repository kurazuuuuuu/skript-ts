import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  broadcast,
  clearSidebar,
  command,
  emit,
  emitIr,
  fmt,
  hasSidebar,
  ifElse,
  isEngineOnlyScript,
  num,
  onJoin,
  player,
  script,
  setSidebar,
  sidebarLine,
  sidebarLineCount,
  sidebarTitleOf,
  str,
} from "../src/index.js";
import { sidebarScript } from "../examples/sidebar.js";
import { welcomeScript } from "../examples/welcome.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

// Per-player sidebars (feedback D) are engine-only: Skript core
// has no sidebar / scoreboard-objective syntax, so the emitter
// refuses the script and only the engine jar runs it. The
// golden fixture for an engine-only sample is its IR — the
// exact text the build deploys — pinned in
// tests/fixtures/sidebar.ir.json.
describe("per-player sidebars (feedback D, engine-only)", () => {
  it("the sidebar example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(sidebarScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("each of the six builders alone makes a script engine-only", () => {
    expect(
      isEngineOnlyScript(script(command("x", null, [setSidebar(player(), str("t"), str("a"))]))),
    ).toBe(true);
    expect(isEngineOnlyScript(script(command("x", null, [clearSidebar(player())])))).toBe(true);
    expect(
      isEngineOnlyScript(script(onJoin([broadcast(fmt("t=", sidebarTitleOf(player())))]))),
    ).toBe(true);
    expect(
      isEngineOnlyScript(script(onJoin([broadcast(fmt("l=", sidebarLine(player(), num(1))))]))),
    ).toBe(true);
    expect(
      isEngineOnlyScript(script(onJoin([broadcast(fmt("c=", sidebarLineCount(player())))]))),
    ).toBe(true);
    expect(
      isEngineOnlyScript(script(onJoin([ifElse(hasSidebar(player()), [broadcast(str("y"))])]))),
    ).toBe(true);
    expect(isEngineOnlyScript(script(command("x", null, [])))).toBe(false);
  });

  it("the sample's IR matches the golden fixture", () => {
    expect(emitIr(sidebarScript)).toBe(fixture("sidebar.ir.json"));
  });

  it("the IR keeps the sidebar node kinds for the engine to dispatch on", () => {
    const json = emitIr(sidebarScript);
    for (const kind of [
      '"setSidebar"',
      '"clearSidebar"',
      '"sidebarTitle"',
      '"sidebarLine"',
      '"sidebarLineCount"',
      '"hasSidebar"',
    ]) {
      expect(json).toContain(kind);
    }
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(sidebarScript)).toThrow(/Unhandled/);
    expect(() => emit(script(command("x", null, [setSidebar(player(), str("t"))])))).toThrow(
      /engine-only/,
    );
    expect(() => emit(script(command("x", null, [clearSidebar(player())])))).toThrow(/engine-only/);
  });

  it("setSidebar normalizes literal title and lines like the other builders", () => {
    expect(setSidebar(player(), "Title", "a", 2)).toMatchObject({
      kind: "setSidebar",
      title: { kind: "string", value: "Title" },
      lines: [
        { kind: "string", value: "a" },
        { kind: "number", value: 2 },
      ],
    });
    expect(sidebarLine(player(), 3)).toMatchObject({
      kind: "sidebarLine",
      index: { kind: "number", value: 3 },
    });
  });
});
