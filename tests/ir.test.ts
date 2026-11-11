import { describe, expect, it } from "vitest";
import { emitIr, toIr } from "../src/index.js";
import { isEngineOnlyScript } from "../src/ir.js";
import { welcomeScript } from "../examples/welcome.js";
import { kitScript } from "../examples/kit.js";
import { chatLogScript } from "../examples/chatlog.js";
import { deathScript } from "../examples/death.js";
import { spawnScript } from "../examples/spawn.js";
import { functionsScript } from "../examples/functions.js";

const examples = [
  ["welcome", welcomeScript],
  ["kit", kitScript],
  ["chatlog", chatLogScript],
  ["death", deathScript],
  ["spawn", spawnScript],
] as const;

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => containsKey(v, key));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key));
  }
  return false;
}

describe("toIr / emitIr", () => {
  it("round-trips every example through JSON with its structure intact", () => {
    for (const [name, prog] of examples) {
      const parsed = JSON.parse(emitIr(prog)) as { kind: string; body: unknown[] };
      expect(parsed.kind, name).toBe("script");
      expect(parsed.body, name).toHaveLength(prog.body.length);
    }
  });

  it("strips every TypeScript call-site loc field", () => {
    for (const [, prog] of examples) {
      expect(containsKey(toIr(prog), "loc")).toBe(false);
    }
  });

  it("custom functions are core language, not engine-only (phase 13)", () => {
    expect(isEngineOnlyScript(functionsScript)).toBe(false);
    const parsed = JSON.parse(emitIr(functionsScript)) as {
      body: { kind: string; name?: string }[];
    };
    const defs = parsed.body.filter((t) => t.kind === "function");
    expect(defs.map((t) => t.name)).toContain("fact");
    expect(defs.map((t) => t.name)).toContain("sumAll");
  });

  it("keeps the node kinds the engine dispatches on", () => {
    const welcome = JSON.parse(emitIr(welcomeScript)) as {
      body: { kind: string; event?: string }[];
    };
    expect(welcome.body.map((t) => `${t.kind}:${t.event ?? ""}`)).toEqual([
      "event:firstJoin",
      "event:join",
    ]);
    const kit = JSON.parse(emitIr(kitScript)) as {
      body: { kind: string; name?: string; args?: { type: string; optional: boolean }[] }[];
    };
    expect(kit.body[0]).toMatchObject({
      kind: "command",
      name: "kit",
      args: [{ type: "text", optional: true }],
    });
    const death = JSON.parse(emitIr(deathScript)) as {
      body: { body: { kind: string }[] }[];
    };
    expect(death.body[0]?.body.map((s) => s.kind)).toEqual(["addVar", "send"]);
  });
});
