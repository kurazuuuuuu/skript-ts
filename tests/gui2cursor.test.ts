import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript } from "../src/index.js";
import { gui2Script } from "../examples/gui2.js";
import { gui2CursorScript } from "../examples/gui2cursor.js";
import { welcomeScript } from "../examples/welcome.js";

// The cursor slice of GUI slice 2 (phase 28) is engine-only:
// the original has no cursor syntax (probed — every spelling
// is a parse error, and the click / drag events reject the
// cursor event-value), so the emitter refuses the script and
// only the engine jar runs it.
describe("cursor values (phase 28, engine-only)", () => {
  it("the cursor example is detected as engine-only, the core examples are not", () => {
    expect(isEngineOnlyScript(gui2CursorScript)).toBe(true);
    expect(isEngineOnlyScript(gui2Script)).toBe(false);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the cursor node kinds for the engine to dispatch on", () => {
    const json = JSON.stringify(JSON.parse(emitIr(gui2CursorScript)));
    expect(json).toContain("eventCursor");
    expect(json).toContain("setCursorItem");
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(gui2CursorScript)).toThrow(/Unhandled/);
  });
});
