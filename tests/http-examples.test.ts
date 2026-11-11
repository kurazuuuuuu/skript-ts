import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript } from "../src/index.js";
import { envScript } from "../examples/env.js";
import { httpScript } from "../examples/http.js";
import { welcomeScript } from "../examples/welcome.js";

type FetchNode = {
  kind: string;
  id?: string;
  timeoutSeconds?: number;
  url?: { value?: string };
  path?: { value?: string };
};

type TopNode = {
  kind: string;
  event?: string;
  body: FetchNode[];
};

describe("HTTP / env builtin slice (phase 26, engine-only)", () => {
  it("http and env examples are detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(httpScript)).toBe(true);
    expect(isEngineOnlyScript(envScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(httpScript)) as { body: TopNode[] };
    expect(ir.body.map((t) => t.kind)).toEqual([
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
      "command",
      "event",
    ]);
    // The response handler is one nested if chain on httpId().
    const eventNode = ir.body[9];
    expect(eventNode?.event).toBe("httpResponse");
    expect(eventNode?.body.map((s) => s.kind)).toEqual(["if"]);
    // Each fetch command is a single httpFetch; /httpdl downloads
    // and /httpread sends.
    expect(ir.body.slice(0, 9).map((t) => t.body.map((s) => s.kind))).toEqual([
      ["httpFetch"],
      ["httpFetch"],
      ["httpFetch"],
      ["httpFetch"],
      ["httpFetch"],
      ["httpFetch"],
      ["httpFetch"],
      ["httpDownload"],
      ["send"],
    ]);
  });

  it("the IR carries the fetch ids, URLs, the slow timeout and the download path", () => {
    const ir = JSON.parse(emitIr(httpScript)) as { body: TopNode[] };
    const helloFetch = ir.body[0]?.body[0];
    expect(helloFetch?.kind).toBe("httpFetch");
    expect(helloFetch?.id).toBe("hello");
    expect(helloFetch?.url?.value).toBe("http://127.0.0.1:8792/hello");
    // No timeout was passed, so the field itself is absent.
    expect(helloFetch?.timeoutSeconds).toBeUndefined();
    expect(helloFetch).not.toHaveProperty("timeoutSeconds");
    const slowFetch = ir.body[4]?.body[0];
    expect(slowFetch?.kind).toBe("httpFetch");
    expect(slowFetch?.id).toBe("slow");
    expect(slowFetch?.timeoutSeconds).toBe(2);
    const downloadNode = ir.body[7]?.body[0];
    expect(downloadNode?.kind).toBe("httpDownload");
    expect(downloadNode?.id).toBe("dl");
    expect(downloadNode?.path?.value).toBe("dl/hello.txt");
  });

  it("the env IR is a single broadcast carrying an envVar node", () => {
    const ir = JSON.parse(emitIr(envScript)) as { body: TopNode[] };
    expect(ir.body.map((t) => t.kind)).toEqual(["command"]);
    expect(ir.body[0]?.body.map((s) => s.kind)).toEqual(["broadcast"]);
    expect(JSON.stringify(ir)).toContain("envVar");
    const httpJson = JSON.stringify(JSON.parse(emitIr(httpScript)));
    expect(httpJson).toContain("httpFetch");
    expect(httpJson).toContain("httpDownload");
    expect(httpJson).toContain("httpOk");
    expect(httpJson).toContain("httpSavedPath");
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(httpScript)).toThrow(/Unhandled/);
    expect(() => emit(envScript)).toThrow(/Unhandled/);
  });
});
