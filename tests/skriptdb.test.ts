import { describe, expect, it } from "vitest";
import { dbExecute, emit, emitIr, isEngineOnlyScript, str, variable } from "../src/index.js";
import { skriptdbScript } from "../examples/skriptdb.js";
import { welcomeScript } from "../examples/welcome.js";

describe("skript-db builtin slice (phase 8, engine-only)", () => {
  it("skriptdb example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(skriptdbScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(skriptdbScript)) as {
      body: { kind: string; body: { kind: string }[] }[];
    };
    expect(ir.body.map((t) => t.kind)).toEqual(["command", "command", "command", "command", "command"]);
    // /dbsetup: set the data source, then two executes without a store.
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual(["setVar", "dbExecute", "dbExecute", "send"]);
    // /dbadd: set, execute with a store, send.
    expect(ir.body[1]?.body.map((s) => s.kind)).toEqual(["setVar", "dbExecute", "send"]);
    // /dbbad ends by reporting the last error.
    expect(ir.body[4]?.body.map((s) => s.kind)).toEqual(["setVar", "dbExecute", "send"]);
  });

  it("the IR carries the data source URL and the optional store variable", () => {
    const ir = JSON.parse(emitIr(skriptdbScript)) as {
      body: {
        body: {
          kind: string;
          value?: { kind: string; url?: { kind: string; value?: string } };
          store?: { kind: string; name?: string };
        }[];
      }[];
    };
    const setNode = ir.body[0]?.body[0];
    expect(setNode?.value?.kind).toBe("dataSource");
    expect(setNode?.value?.url?.value).toBe("sqlite:skriptdb-test.db");
    const addExec = ir.body[1]?.body[1];
    expect(addExec?.store).toEqual({ kind: "variable", name: "added" });
    const setupExec = ir.body[0]?.body[1];
    expect(setupExec?.store).toBeUndefined();
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(skriptdbScript)).toThrow(/Unhandled/);
  });

  it("a lone dbExecute is already engine-only (no .sk form exists)", () => {
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
    const withDb = {
      kind: "script",
      body: [
        {
          kind: "command",
          name: "x",
          args: [],
          body: [dbExecute(variable("s"), str("select 1"))],
        },
      ],
    } as const;
    expect(isEngineOnlyScript(withDb)).toBe(true);
    const ir = JSON.parse(emitIr(withDb)) as { body: { body: { kind: string }[] }[] };
    expect(ir.body[0]?.body[0]?.kind).toBe("dbExecute");
  });
});
