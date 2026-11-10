import { describe, expect, it } from "vitest";
import { emitIr, toIr } from "../src/index.js";
import { welcomeScript } from "../examples/welcome.js";
import { kitScript } from "../examples/kit.js";
import { chatLogScript } from "../examples/chatlog.js";
import { deathScript } from "../examples/death.js";
import { spawnScript } from "../examples/spawn.js";

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

  it("keeps the node kinds the engine dispatches on", () => {
    const welcome = JSON.parse(emitIr(welcomeScript)) as {
      body: { kind: string; event?: string }[];
    };
    expect(welcome.body.map((t) => `${t.kind}:${t.event ?? ""}`)).toEqual([
      "event:firstJoin",
      "event:join",
    ]);
    const kit = JSON.parse(emitIr(kitScript)) as {
      body: { kind: string; name?: string; argType?: string }[];
    };
    expect(kit.body[0]).toMatchObject({ kind: "command", name: "kit", argType: "text" });
    const death = JSON.parse(emitIr(deathScript)) as {
      body: { body: { kind: string }[] }[];
    };
    expect(death.body[0]?.body.map((s) => s.kind)).toEqual(["addVar", "send"]);
  });
});
