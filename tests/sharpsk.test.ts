import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript, timerCreate } from "../src/index.js";
import { sharpskScript } from "../examples/sharpsk.js";
import { welcomeScript } from "../examples/welcome.js";

describe("SharpSK builtin slice (phase 7, engine-only)", () => {
  it("sharpsk example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(sharpskScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(sharpskScript)) as {
      body: { kind: string; event?: string; body: { kind: string }[] }[];
    };
    const kinds = ir.body.map((t) =>
      t.kind === "event" ? `event:${t.event ?? ""}` : `command:${t.kind}`,
    );
    expect(kinds).toEqual([
      "command:command",
      "event:timerTick",
      "event:timerComplete",
      "command:command",
      "command:command",
      "command:command",
      "command:command",
    ]);
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual(["timerCreate", "send"]);
    expect(ir.body[1]?.body.map((s) => s.kind)).toEqual(["broadcast"]);
    expect(ir.body[6]?.body.map((s) => s.kind)).toEqual(["if"]);
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(sharpskScript)).toThrow(/Unhandled/);
  });

  it("timer ids must be non-empty", () => {
    expect(() => timerCreate("", { kind: "number", value: 3 })).toThrow(RangeError);
    expect(() => timerCreate("   ", { kind: "number", value: 3 })).toThrow(RangeError);
  });
});
