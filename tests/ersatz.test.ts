import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript, onPlaceholderRequest } from "../src/index.js";
import { ersatzScript } from "../examples/ersatz.js";
import { welcomeScript } from "../examples/welcome.js";

describe("Ersatz builtin slice (phase 10, engine-only)", () => {
  it("ersatz example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(ersatzScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds and the served prefixes", () => {
    const ir = JSON.parse(emitIr(ersatzScript)) as {
      body: { kind: string; event?: string; prefixes?: string[]; body: { kind: string }[] }[];
    };
    const kinds = ir.body.map((t) =>
      t.kind === "event" ? `event:${t.event ?? ""}` : `command:${t.kind}`,
    );
    expect(kinds).toEqual(["event:papiRequest", "event:papiRequest", "command:command"]);
    expect(ir.body[0]?.prefixes).toEqual(["skriptts"]);
    expect(ir.body[1]?.prefixes).toEqual(["skripttswho"]);
    // Phase 11: the first handler branches on the identifier with
    // the core equals condition; both branches set the result.
    const branch = ir.body[0]?.body[0] as unknown as {
      kind: string;
      cond: { kind: string };
      then: { kind: string }[];
      else: { kind: string }[];
    };
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual(["if"]);
    expect(branch.cond.kind).toBe("equals");
    expect(branch.then.map((s) => s.kind)).toEqual(["setPlaceholderResult"]);
    expect(branch.else.map((s) => s.kind)).toEqual(["setPlaceholderResult"]);
    expect(ir.body[1]?.body.map((s) => s.kind)).toEqual(["setPlaceholderResult"]);
    const commandJson = JSON.stringify(ir.body[2]);
    expect(commandJson).toContain('"kind":"placeholderValue"');
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(ersatzScript)).toThrow(/Unhandled/);
  });

  it("placeholder prefixes must be non-empty", () => {
    expect(() => onPlaceholderRequest("", [])).toThrow(RangeError);
    expect(() => onPlaceholderRequest("   ", [])).toThrow(RangeError);
    expect(() => onPlaceholderRequest([], [])).toThrow(RangeError);
    expect(() => onPlaceholderRequest(["ok", ""], [])).toThrow(RangeError);
  });
});
