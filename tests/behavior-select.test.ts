import { describe, expect, it } from "vitest";
import {
  FAST_SAMPLE_MODULUS,
  fnv1a32,
  inFastSample,
  selectBehaviorSuites,
} from "../src/cli/behavior-select.js";

const SUITES = [
  "bossbar.behavior.ts",
  "chatlog.behavior.ts",
  "commands.behavior.ts",
  "death.behavior.ts",
  "display.behavior.ts",
  "ersatz.behavior.ts",
  "events2.behavior.ts",
  "events3.behavior.ts",
  "fishing.behavior.ts",
  "fishing2.behavior.ts",
  "functions.behavior.ts",
  "gameplay.behavior.ts",
  "gui.behavior.ts",
  "http.behavior.ts",
  "kit.behavior.ts",
  "lists.behavior.ts",
  "logic.behavior.ts",
  "mundosk-border.behavior.ts",
  "mundosk.behavior.ts",
  "sharpsk.behavior.ts",
  "skriptdb.behavior.ts",
  "skutil.behavior.ts",
  "state.behavior.ts",
  "text.behavior.ts",
  "timespan.behavior.ts",
  "welcome.behavior.ts",
  "world.behavior.ts",
];

describe("fnv1a32", () => {
  it("matches the published FNV-1a test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });
});

describe("selectBehaviorSuites", () => {
  it("returns the input unchanged when fast is off", () => {
    expect(selectBehaviorSuites(SUITES, false)).toEqual(SUITES);
  });

  it("is deterministic: the same input always selects the same sample", () => {
    const first = selectBehaviorSuites(SUITES, true);
    const second = selectBehaviorSuites([...SUITES].reverse().sort(), true);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(SUITES.length);
  });

  it("keeps a suite's membership stable when other suites are added", () => {
    const before = new Set(selectBehaviorSuites(SUITES, true));
    const extended = selectBehaviorSuites([...SUITES, "zzz-new.behavior.ts"], true);
    for (const name of extended) {
      if (name === "zzz-new.behavior.ts") continue;
      expect(before.has(name)).toBe(true);
    }
    for (const name of before) expect(extended).toContain(name);
  });

  it("selects roughly one in FAST_SAMPLE_MODULUS suites", () => {
    const many = Array.from({ length: 300 }, (_, i) => `suite-${i}.behavior.ts`);
    const picked = selectBehaviorSuites(many, true);
    const ratio = picked.length / many.length;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.5);
    expect(FAST_SAMPLE_MODULUS).toBe(3);
  });

  it("inFastSample agrees with the selector", () => {
    for (const name of SUITES) {
      expect(selectBehaviorSuites([name], true)).toEqual(inFastSample(name) ? [name] : []);
    }
  });
});
