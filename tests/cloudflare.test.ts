import { describe, expect, it } from "vitest";
import {
  broadcast,
  cfD1Query,
  cfError,
  cfId,
  cfOk,
  command,
  emit,
  emitIr,
  equals,
  fmt,
  ifElse,
  isEngineOnlyScript,
  onCfResponse,
  script,
  str,
  variable,
} from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";

type Node = Record<string, unknown> & { kind?: string; event?: string };

/** Depth-first search for the first node matching a predicate. */
function findNode(value: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const node = value as Node;
    if (predicate(node)) return node;
  }
  for (const child of Object.values(value)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

/** A script exercising the statement, the event, and all three accessors. */
function cfScript() {
  return script(
    command("x", null, [cfD1Query("q", "default", str("select 1"))]),
    onCfResponse([
      ifElse(
        equals(cfId(), str("q")),
        [ifElse(cfOk(), [broadcast(str("ok"))], [broadcast(fmt("error ", cfError()))])],
        [],
      ),
    ]),
  );
}

describe("cloudflare d1 builtin slice (M4 CF-1, engine-only)", () => {
  it("builds a cfD1Query IR node without store/timeout", () => {
    const ir = JSON.parse(
      emitIr(script(command("x", null, [cfD1Query("q1", "default", str("select 1"))]))),
    ) as unknown;
    const node = findNode(ir, (n) => n.kind === "cfD1Query");
    expect(node?.kind).toBe("cfD1Query");
    expect(node?.["id"]).toBe("q1");
    expect(node?.["handle"]).toBe("default");
    expect(node?.["sql"]).toEqual({ kind: "string", value: "select 1" });
    expect(node?.["store"]).toBeUndefined();
    expect(node?.["timeoutSeconds"]).toBeUndefined();
  });

  it("captures store and timeout on cfD1Query", () => {
    const ir = JSON.parse(
      emitIr(
        script(
          command("x", null, [
            cfD1Query("q2", "default", str("select 1"), variable("rows"), { timeoutSeconds: 30 }),
          ]),
        ),
      ),
    ) as unknown;
    const node = findNode(ir, (n) => n.kind === "cfD1Query");
    expect(node?.kind).toBe("cfD1Query");
    expect((node?.["store"] as Node | undefined)?.kind).toBe("variable");
    expect(node?.["timeoutSeconds"]).toBe(30);
  });

  it("rejects invalid cfD1Query arguments", () => {
    expect(() => cfD1Query("", "default", str("select 1"))).toThrow(RangeError);
    expect(() => cfD1Query("q", " ", str("select 1"))).toThrow(RangeError);
    expect(() =>
      cfD1Query("q", "default", str("select 1"), undefined, { timeoutSeconds: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      cfD1Query("q", "default", str("select 1"), undefined, { timeoutSeconds: 121 }),
    ).toThrow(RangeError);
  });

  it("detects engine-only scripts", () => {
    expect(isEngineOnlyScript(cfScript())).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("emitter refuses engine-only scripts", () => {
    expect(() => emit(cfScript())).toThrow();
  });

  it("emits a cfResponse event node", () => {
    const ir = JSON.parse(emitIr(cfScript())) as unknown;
    const event = findNode(ir, (n) => n.event === "cfResponse");
    expect(event?.event).toBe("cfResponse");
  });
});
