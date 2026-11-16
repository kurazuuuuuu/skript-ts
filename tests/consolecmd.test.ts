import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  command,
  emit,
  emitIr,
  executeConsoleCommand,
  fmt,
  isEngineOnlyScript,
  script,
  str,
  variable,
} from "../src/index.js";
import { consoleCmdScript } from "../examples/consolecmd.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

// Console command execution (ext-console U1) is CORE language:
// the emitted .sk runs under the real Skript and the engine
// dispatches the same text as the console sender, so the
// sample is NOT engine-only and its golden fixture is the .sk.
describe("console command execution (ext-console U1, core)", () => {
  it("the consolecmd example is not engine-only and matches the golden fixture", () => {
    expect(isEngineOnlyScript(consoleCmdScript)).toBe(false);
    expect(emit(consoleCmdScript)).toBe(fixture("consolecmd.sk"));
  });

  it("emits the canonical form for literal, slashed and formatted commands", () => {
    expect(emit(script(command("x", null, [executeConsoleCommand(str("say hi"))])))).toContain(
      'execute console command "say hi"',
    );
    expect(emit(script(command("x", null, [executeConsoleCommand(str("/say hi"))])))).toContain(
      'execute console command "/say hi"',
    );
    expect(
      emit(script(command("x", null, [executeConsoleCommand(fmt("say ", variable("who")))]))),
    ).toContain('execute console command "say %{who}%"');
  });

  it("the IR keeps the node kind for the engine to dispatch on", () => {
    expect(emitIr(consoleCmdScript)).toContain('"executeConsoleCommand"');
  });

  it("normalizes a plain string literal like the other builders", () => {
    expect(executeConsoleCommand("say hi")).toMatchObject({
      kind: "executeConsoleCommand",
      command: { kind: "string", value: "say hi" },
    });
  });
});
