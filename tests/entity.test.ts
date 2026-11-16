import { describe, expect, it } from "vitest";
import {
  attributeOf,
  command,
  customNameOf,
  customNameVisible,
  emit,
  equipmentOf,
  hasAi,
  hasEntityTag,
  ifElse,
  isEngineOnlyScript,
  item,
  lastSpawnedEntity,
  num,
  player,
  script,
  setAi,
  setAttribute,
  setCustomNameVisible,
  setEquipment,
  setVelocity,
  broadcast,
  str,
  velocityComponentOf,
} from "../src/index.js";
import { entityScript } from "../examples/entity.js";

// Entity equipment / name / AI / tags / attributes / velocity
// (ext-entity wave, feedback D): all core language, so the
// sample is NOT engine-only and the emitter produces its .sk
// form (pinned as the golden fixture in golden.test.ts).
describe("entity equipment/name/AI/tags/attributes/velocity (ext-entity)", () => {
  it("the entity example is not engine-only", () => {
    expect(isEngineOnlyScript(entityScript)).toBe(false);
  });

  it("builders validate their closed literal sets", () => {
    expect(() => equipmentOf(player(), "hat" as never)).toThrow(RangeError);
    expect(() => setEquipment(player(), "hat" as never, item("iron helmet"))).toThrow(RangeError);
    expect(() => attributeOf(player(), "luck" as never)).toThrow(RangeError);
    expect(() => setAttribute(player(), "luck" as never, num(1))).toThrow(RangeError);
    expect(() => velocityComponentOf(player(), "w" as never)).toThrow(RangeError);
    expect(() => hasEntityTag(player(), "  ")).toThrow(RangeError);
  });

  it("emits the probed .sk forms", () => {
    const out = emit(
      script(
        command("x", null, [
          setEquipment(lastSpawnedEntity(), "boots", item("iron boots")),
          setAi(lastSpawnedEntity(), true),
          setCustomNameVisible(lastSpawnedEntity(), false),
          setAttribute(lastSpawnedEntity(), "follow range", num(16)),
          setVelocity(lastSpawnedEntity(), num(1), num(2), num(3)),
          ifElse(hasAi(lastSpawnedEntity()), [broadcast(str("ai"))]),
          ifElse(customNameVisible(lastSpawnedEntity()), [broadcast(str("vis"))]),
          ifElse(hasEntityTag(lastSpawnedEntity(), "boss"), [broadcast(str("tag"))]),
          broadcast(customNameOf(lastSpawnedEntity())),
          broadcast(attributeOf(lastSpawnedEntity(), "armor")),
          broadcast(velocityComponentOf(lastSpawnedEntity(), "y")),
          broadcast(equipmentOf(lastSpawnedEntity(), "offhand")),
        ]),
      ),
    );
    expect(out).toContain("set boots of last spawned entity to iron boots");
    expect(out).toContain("set artificial intelligence of last spawned entity to true");
    expect(out).toContain("hide custom name of last spawned entity");
    expect(out).toContain("set follow range attribute of last spawned entity to 16");
    expect(out).toContain("set velocity of last spawned entity to vector(1, 2, 3)");
    expect(out).toContain("if artificial intelligence of last spawned entity is true:");
    expect(out).toContain("if last spawned entity's custom name is visible:");
    expect(out).toContain('if scoreboard tags of last spawned entity contains "boss":');
    expect(out).toContain("broadcast custom name of last spawned entity");
    expect(out).toContain("broadcast armor attribute of last spawned entity");
    expect(out).toContain("broadcast y component of velocity of last spawned entity");
    expect(out).toContain("broadcast offhand tool of last spawned entity");
  });
});
