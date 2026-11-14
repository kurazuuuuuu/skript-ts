import { describe, expect, it } from "vitest";
import {
  emit,
  emitIr,
  isEngineOnlyScript,
  launchFirework,
  locationOf,
  player,
  spawnParticle,
} from "../src/index.js";
import { particlesScript } from "../examples/particles.js";
import { welcomeScript } from "../examples/welcome.js";

describe("Particles & fireworks (feedback D, engine-only)", () => {
  it("particles example is detected as engine-only, the v0 examples are not", () => {
    expect(isEngineOnlyScript(particlesScript)).toBe(true);
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
  });

  it("the IR keeps the builtin node kinds and their fields for the engine to dispatch on", () => {
    const ir = JSON.parse(emitIr(particlesScript)) as {
      body: { kind: string; body: Record<string, unknown>[] }[];
    };
    const stmts = ir.body.flatMap((t) => t.body);
    expect(stmts.map((s) => s.kind)).toEqual([
      "spawnParticle",
      "spawnParticle",
      "broadcast",
      "launchFirework",
      "broadcast",
      "launchFirework",
      "broadcast",
    ]);
    // The counted spawn carries its count; the defaulted one omits it.
    expect(stmts[0]).toMatchObject({ kind: "spawnParticle", particle: "FLAME", count: 10 });
    expect(stmts[1]).toMatchObject({ kind: "spawnParticle", particle: "HEART" });
    expect("count" in (stmts[1] ?? {})).toBe(false);
    // The full-option firework carries every option literally.
    expect(stmts[3]).toMatchObject({
      kind: "launchFirework",
      power: 1,
      colors: ["#FF0000", "#00FF00"],
      type: "BALL_LARGE",
      flicker: true,
      trail: true,
    });
    // The defaulted firework omits every option (engine defaults apply).
    expect(stmts[5]).toEqual({ kind: "launchFirework", location: stmts[5]?.["location"] });
  });

  it("the .sk emitter refuses engine-only constructs instead of guessing", () => {
    expect(() => emit(particlesScript)).toThrow(/Unhandled/);
  });

  it("particle names must be uppercase snake case", () => {
    const at = locationOf(player());
    expect(spawnParticle("FLAME", at).kind).toBe("spawnParticle");
    expect(spawnParticle("CRIT_PORTAL", at).kind).toBe("spawnParticle");
    expect(() => spawnParticle("flame", at)).toThrow(RangeError);
    expect(() => spawnParticle("Flame", at)).toThrow(RangeError);
    expect(() => spawnParticle("", at)).toThrow(RangeError);
    expect(() => spawnParticle("FLAME ", at)).toThrow(RangeError);
    expect(() => spawnParticle("FLAME__HEART", at)).toThrow(RangeError);
    expect(() => spawnParticle("_FLAME", at)).toThrow(RangeError);
    expect(() => spawnParticle("FLAME_", at)).toThrow(RangeError);
  });

  it("the particle count must be a finite number when given", () => {
    const at = locationOf(player());
    expect(spawnParticle("FLAME", at, 0).kind).toBe("spawnParticle");
    expect(spawnParticle("FLAME", at, -3).kind).toBe("spawnParticle");
    expect(() => spawnParticle("FLAME", at, Number.NaN)).toThrow(RangeError);
    expect(() => spawnParticle("FLAME", at, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("firework options validate their shapes", () => {
    const at = locationOf(player());
    expect(launchFirework(at).kind).toBe("launchFirework");
    expect(launchFirework(at, { colors: ["#ff0000", "#00FF00"] }).kind).toBe("launchFirework");
    expect(() => launchFirework(at, { colors: ["red"] })).toThrow(RangeError);
    expect(() => launchFirework(at, { colors: ["#FF00"] })).toThrow(RangeError);
    expect(() => launchFirework(at, { colors: ["FF0000"] })).toThrow(RangeError);
    expect(() => launchFirework(at, { colors: ["#GGGGGG"] })).toThrow(RangeError);
    expect(() => launchFirework(at, { type: "SPHERE" as never })).toThrow(RangeError);
    expect(() => launchFirework(at, { power: Number.NaN })).toThrow(RangeError);
    expect(() => launchFirework(at, { power: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    // A negative power is a shape the engine clamps to 0, not a builder error.
    expect(launchFirework(at, { power: -2 }).kind).toBe("launchFirework");
    for (const type of ["BALL", "BALL_LARGE", "BURST", "CREEPER", "STAR"] as const) {
      expect(launchFirework(at, { type }).kind).toBe("launchFirework");
    }
  });
});
