import { describe, expect, it } from "vitest";
import {
  emit,
  emitIr,
  isEngineOnlyScript,
  item,
  mixFill,
  noiseFill,
} from "../src/index.js";
import { paintScript } from "../examples/paint.js";
import { welcomeScript } from "../examples/welcome.js";

describe("World paint family (engine-only)", () => {
  it("paint example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(paintScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the paint node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(paintScript)) as {
      body: { kind: string; body: { kind: string }[] }[];
    };
    const stmtKinds = ir.body.flatMap((t) => t.body.map((s) => s.kind));
    expect(stmtKinds.filter((k) => k === "paint")).toHaveLength(9);
    expect(stmtKinds.filter((k) => k === "send")).toHaveLength(9);
  });

  it("the IR carries the shape and fill structure of a noise paint", () => {
    const ir = JSON.parse(emitIr(paintScript)) as {
      body: {
        body: {
          kind: string;
          shape?: { kind: string };
          fill?: { kind: string; scale?: number; amount?: number; seed?: number };
          replace?: { kind: string };
        }[];
      }[];
    };
    const floor = ir.body[0]?.body[0];
    expect(floor?.kind).toBe("paint");
    expect(floor?.shape?.kind).toBe("cuboidShape");
    expect(floor?.fill?.kind).toBe("noiseFill");
    expect(floor?.fill?.scale).toBe(2);
    expect(floor?.fill?.amount).toBe(0.4);
    expect(floor?.fill?.seed).toBe(7);
    const trim = ir.body[4]?.body[0];
    expect(trim?.kind).toBe("paint");
    expect(trim?.replace?.kind).toBe("item");
  });

  it("the .sk emitter refuses paint constructs instead of guessing", () => {
    expect(() => emit(paintScript)).toThrow(/Unhandled/);
  });

  it("mix fill validates its entries", () => {
    expect(() => mixFill([])).toThrow(RangeError);
    expect(() => mixFill([[item("dirt"), 0]])).toThrow(RangeError);
    expect(() => mixFill([[item("dirt"), -1]])).toThrow(RangeError);
    expect(() => mixFill([[item("dirt"), Number.NaN]])).toThrow(RangeError);
    expect(() => mixFill([[item("dirt"), 1]], Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("noise fill validates its options", () => {
    expect(() => noiseFill(item("dirt"), item("gravel"), { scale: 0 })).toThrow(RangeError);
    expect(() => noiseFill(item("dirt"), item("gravel"), { amount: -0.1 })).toThrow(RangeError);
    expect(() => noiseFill(item("dirt"), item("gravel"), { amount: 1.1 })).toThrow(RangeError);
    expect(() => noiseFill(item("dirt"), item("gravel"), { seed: Number.NaN })).toThrow(
      RangeError,
    );
  });

  it("noise fill defaults are scale 4, amount 0.5, seed 0", () => {
    const fill = noiseFill(item("dirt"), item("gravel"));
    expect(fill).toMatchObject({ kind: "noiseFill", scale: 4, amount: 0.5, seed: 0 });
  });
});
