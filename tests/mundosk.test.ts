import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript, wsConnect } from "../src/index.js";
import { mundoskScript } from "../examples/mundosk.js";
import { welcomeScript } from "../examples/welcome.js";

describe("MundoSK builtin slice (phase 6, engine-only)", () => {
  it("mundosk example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(mundoskScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(mundoskScript)) as {
      body: { kind: string; event?: string; body: { kind: string }[] }[];
    };
    const kinds = ir.body.map((t) => (t.kind === "event" ? `event:${t.event ?? ""}` : `command:${t.kind}`));
    expect(kinds).toEqual([
      "command:command",
      "event:wsOpen",
      "event:wsMessage",
      "command:command",
      "event:wsClose",
      "command:command",
    ]);
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual(["wsConnect"]);
    expect(ir.body[1]?.body.map((s) => s.kind)).toEqual(["wsSend"]);
    expect(ir.body[5]?.body.map((s) => s.kind)).toEqual(["setBorderSize", "send"]);
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(mundoskScript)).toThrow(/Unhandled/);
  });

  it("websocket ids must be non-empty", () => {
    expect(() => wsConnect("", { kind: "string", value: "ws://127.0.0.1:1" })).toThrow(RangeError);
    expect(() => wsConnect("   ", { kind: "string", value: "ws://127.0.0.1:1" })).toThrow(RangeError);
  });
});
