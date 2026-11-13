import { describe, expect, it } from "vitest";
import {
  allocateCustomModelData,
  emptyRegistry,
  parseRegistry,
  serializeRegistry,
  type PackRegistry,
} from "../src/packregistry.js";

function registry(items: Record<string, number>): PackRegistry {
  return { version: 1, items };
}

describe("allocateCustomModelData", () => {
  it("allocates append-only numbers in request order", () => {
    const {
      allocations,
      registry: next,
      changed,
    } = allocateCustomModelData(emptyRegistry(), [{ id: "example:gem" }, { id: "example:coin" }]);
    expect(changed).toBe(true);
    expect(allocations.get("example:gem")).toBe(1);
    expect(allocations.get("example:coin")).toBe(2);
    expect(next.items).toEqual({ "example:gem": 1, "example:coin": 2 });
  });

  it("appends after the maximum, never into a gap left by a deletion", () => {
    // "example:old" held 1 and was deleted from the definitions;
    // its registry entry (and number) stays reserved.
    const start = registry({ "example:old": 1, "example:gem": 3 });
    const { allocations } = allocateCustomModelData(start, [{ id: "example:new" }]);
    expect(allocations.get("example:new")).toBe(4);
  });

  it("restores a re-registered name to its original number without changes", () => {
    const start = registry({ "example:old": 5 });
    const {
      allocations,
      changed,
      registry: next,
    } = allocateCustomModelData(start, [{ id: "example:old" }]);
    expect(allocations.get("example:old")).toBe(5);
    expect(changed).toBe(false);
    expect(next).toBe(start);
  });

  it("does not mutate the input registry", () => {
    const start = registry({ "example:gem": 1 });
    allocateCustomModelData(start, [{ id: "example:coin" }]);
    expect(start.items).toEqual({ "example:gem": 1 });
  });

  it("honors an explicit number and allocates around it", () => {
    const { allocations, registry: next } = allocateCustomModelData(emptyRegistry(), [
      { id: "example:gem", customModelData: 10 },
      { id: "example:coin" },
    ]);
    expect(allocations.get("example:gem")).toBe(10);
    expect(allocations.get("example:coin")).toBe(11);
    expect(next.items).toEqual({ "example:gem": 10, "example:coin": 11 });
  });

  it("rejects an explicit number held by another name, including a reserved one", () => {
    const start = registry({ "example:old": 2 });
    expect(() =>
      allocateCustomModelData(start, [{ id: "example:gem", customModelData: 2 }]),
    ).toThrow(/already held by id "example:old"/);
  });

  it("rejects re-registering a name with a different explicit number", () => {
    const start = registry({ "example:gem": 3 });
    expect(() =>
      allocateCustomModelData(start, [{ id: "example:gem", customModelData: 4 }]),
    ).toThrow(/already has customModelData 3; requested 4/);
  });

  it("merges duplicate requests in one batch and rejects conflicting ones", () => {
    const merged = allocateCustomModelData(emptyRegistry(), [
      { id: "example:gem" },
      { id: "example:gem", customModelData: 9 },
    ]);
    expect(merged.allocations.get("example:gem")).toBe(9);
    expect(() =>
      allocateCustomModelData(emptyRegistry(), [
        { id: "example:gem", customModelData: 9 },
        { id: "example:gem", customModelData: 10 },
      ]),
    ).toThrow(/conflicting customModelData values 9 and 10/);
  });

  it("rejects invalid requests", () => {
    expect(() => allocateCustomModelData(emptyRegistry(), [{ id: "" }])).toThrow(/invalid id/);
    expect(() =>
      allocateCustomModelData(emptyRegistry(), [{ id: "example:gem", customModelData: 0 }]),
    ).toThrow(/invalid customModelData/);
  });
});

describe("parseRegistry / serializeRegistry", () => {
  it("round-trips with sorted keys and a trailing newline", () => {
    const text = serializeRegistry(registry({ "example:gem": 1, "example:coin": 2 }));
    expect(text).toBe(
      '{\n  "version": 1,\n  "items": {\n    "example:coin": 2,\n    "example:gem": 1\n  }\n}\n',
    );
    expect(parseRegistry(text)).toEqual(registry({ "example:coin": 2, "example:gem": 1 }));
  });

  it("rejects malformed registries", () => {
    expect(() => parseRegistry("not json")).toThrow(/invalid JSON/);
    expect(() => parseRegistry('{"version":2,"items":{}}')).toThrow(/expected version 1/);
    expect(() => parseRegistry('{"version":1,"items":[]}')).toThrow(/plain object/);
    expect(() => parseRegistry('{"version":1,"items":{"a":0}}')).toThrow(/positive integer/);
    expect(() => parseRegistry('{"version":1,"items":{"a":1.5}}')).toThrow(/positive integer/);
  });
});
