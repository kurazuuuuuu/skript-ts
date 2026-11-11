import { describe, expect, it } from "vitest";
import {
  bossBar,
  command,
  emit,
  keyedBossBar,
  localVar,
  player,
  script,
  setBossBarColor,
  setBossBarFlag,
  setBossBarStyle,
  str,
} from "../src/index.js";
import type { Expr, Stmt } from "../src/index.js";

/**
 * Phase 27 (review items R-1 / R-2): the emitter re-checks
 * the closed literal name sets the builders validate, so a
 * hand-built AST fails with a positioned, explicit error
 * instead of emitting a line the original rejects — or, for
 * flags, silently emitting the wrong verb — and a sendTitle
 * statement with neither part fails explicitly instead of
 * crashing inside emitText with a TypeError.
 */
describe("emitter validation of hand-built ASTs (phase 27)", () => {
  const emitStmt = (stmt: Stmt): string =>
    emit(script(command("rfixprobe", null, [stmt])));

  it("rejects a sendTitle statement with neither title nor subtitle", () => {
    const stmt = { kind: "sendTitle", target: player() } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(
      /sendTitle statement has neither a title nor a subtitle/,
    );
    expect(() => emitStmt(stmt)).not.toThrowError(TypeError);
  });

  it("rejects an unknown boss bar color in setBossBarColor", () => {
    const stmt = {
      kind: "setBossBarColor",
      bar: localVar("bar"),
      name: "orange",
    } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(/invalid boss bar color name: "orange"/);
  });

  it("rejects an unknown boss bar style in setBossBarStyle", () => {
    const stmt = {
      kind: "setBossBarStyle",
      bar: localVar("bar"),
      style: "7 notches",
    } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(/invalid boss bar style name: "7 notches"/);
  });

  it("rejects an unknown boss bar flag instead of emitting the boss-music verb", () => {
    const stmt = {
      kind: "setBossBarFlag",
      bar: localVar("bar"),
      flag: "bogus",
      enabled: true,
    } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(/invalid boss bar flag name: "bogus"/);
  });

  it("rejects an unknown color in the bossBar create expression", () => {
    const expr = { kind: "bossBar", color: "orange" } as unknown as Expr;
    const stmt = {
      kind: "setVar",
      variable: localVar("bar"),
      value: expr,
    } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(/invalid boss bar color name: "orange"/);
  });

  it("rejects an unknown color in the keyedBossBar create expression", () => {
    const expr = {
      kind: "keyedBossBar",
      key: str("k"),
      color: "orange",
    } as unknown as Expr;
    const stmt = {
      kind: "setVar",
      variable: localVar("bar"),
      value: expr,
    } as unknown as Stmt;
    expect(() => emitStmt(stmt)).toThrowError(/invalid boss bar color name: "orange"/);
  });

  it("still emits the valid forms the builders produce", () => {
    expect(emitStmt(setBossBarColor(localVar("bar"), "red"))).toContain(
      "set color of {_bar} to red",
    );
    expect(emitStmt(setBossBarStyle(localVar("bar"), "6 notches"))).toContain(
      "set style of {_bar} to 6 notches",
    );
    expect(emitStmt(setBossBarFlag(localVar("bar"), "createFog", true))).toContain(
      "make {_bar} create fog",
    );
    const created = emit(
      script(
        command("rfixprobe2", null, [
          {
            kind: "setVar",
            variable: localVar("bar"),
            value: bossBar({ color: "blue", title: str("T") }),
          } as unknown as Stmt,
          {
            kind: "setVar",
            variable: localVar("bar2"),
            value: keyedBossBar(str("k"), { color: "green" }),
          } as unknown as Stmt,
        ]),
      ),
    );
    expect(created).toContain("a blue bossbar with title \"T\"");
    expect(created).toContain("a keyed green boss bar with key \"k\"");
  });
});
