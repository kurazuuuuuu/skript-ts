import { describe, expect, it } from "vitest";
import {
  emit,
  emitIr,
  fileAppend,
  fileContents,
  isEngineOnlyScript,
  str,
  variable,
} from "../src/index.js";
import { skutilScript } from "../examples/skutil.js";
import { welcomeScript } from "../examples/welcome.js";

describe("skUtilities builtin slice (phase 9, engine-only)", () => {
  it("skutil example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(skutilScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(skutilScript)) as {
      body: { kind: string; body: { kind: string; cond?: { kind: string } }[] }[];
    };
    expect(ir.body.map((t) => t.kind)).toEqual([
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
    ]);
    // /filecreate: delete, create the directory, create the file,
    // then branch on the exists condition.
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual([
      "fileDelete",
      "dirCreate",
      "fileCreate",
      "if",
    ]);
    expect(ir.body[0]?.body[3]?.cond?.kind).toBe("fileExists");
    // /filelog: append the argument, then report the line count.
    expect(ir.body[1]?.body.map((s) => s.kind)).toEqual(["fileAppend", "send"]);
    // /fileescape writes outside the root and checks existence.
    expect(ir.body[6]?.body.map((s) => s.kind)).toEqual(["fileWrite", "if"]);
  });

  it("the IR carries the paths as text expressions", () => {
    const ir = JSON.parse(emitIr(skutilScript)) as {
      body: {
        body: { kind: string; path?: { kind: string; value?: string }; text?: { kind: string } }[];
      }[];
    };
    const create = ir.body[0]?.body[2];
    expect(create?.path).toEqual({ kind: "string", value: "logs/visits.txt" });
    const dirNode = ir.body[0]?.body[1];
    expect(dirNode?.path).toEqual({ kind: "string", value: "logs" });
    const append = ir.body[1]?.body[0];
    expect(append?.kind).toBe("fileAppend");
    // The appended text is a one-part format wrapping the command argument.
    expect(append?.text?.kind).toBe("format");
    const parts = (append?.text as { parts?: { kind: string }[] } | undefined)?.parts;
    expect(parts?.[0]?.kind).toBe("argument");
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(skutilScript)).toThrow(/Unhandled/);
  });

  it("a lone file expression or statement is already engine-only (no .sk form exists)", () => {
    const withRead = {
      kind: "script",
      body: [
        {
          kind: "command",
          name: "x",
          args: [],
          body: [{ kind: "setVar", variable: variable("v"), value: fileContents(str("a.txt")) }],
        },
      ],
    } as const;
    expect(isEngineOnlyScript(withRead)).toBe(true);
    const withAppend = {
      kind: "script",
      body: [
        {
          kind: "command",
          name: "x",
          args: [],
          body: [fileAppend(str("a.txt"), str("hi"))],
        },
      ],
    } as const;
    expect(isEngineOnlyScript(withAppend)).toBe(true);
    const ir = JSON.parse(emitIr(withAppend)) as { body: { body: { kind: string }[] }[] };
    expect(ir.body[0]?.body[0]?.kind).toBe("fileAppend");
  });
});
