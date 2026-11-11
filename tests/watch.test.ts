// Watch-mode (phase 25) unit coverage: the pure helpers the CLI
// watch loop's behavior depends on. The loop itself (fs watching,
// marker-file handshake against a live server) is covered by the
// phase-25 live proof, not by unit tests.
import { describe, expect, it } from "vitest";

import { irHashesEqual } from "../src/cli/watch.js";

describe("irHashesEqual", () => {
  it("treats two empty maps as equal", () => {
    expect(irHashesEqual(new Map(), new Map())).toBe(true);
  });

  it("treats identical entries as equal regardless of insertion order", () => {
    const a = new Map([
      ["a.ir.json", "hash-a"],
      ["sub/b.ir.json", "hash-b"],
    ]);
    const b = new Map([
      ["sub/b.ir.json", "hash-b"],
      ["a.ir.json", "hash-a"],
    ]);
    expect(irHashesEqual(a, b)).toBe(true);
  });

  it("detects a changed hash", () => {
    const a = new Map([["a.ir.json", "hash-a"]]);
    const b = new Map([["a.ir.json", "hash-b"]]);
    expect(irHashesEqual(a, b)).toBe(false);
  });

  it("detects an added file", () => {
    const a = new Map([["a.ir.json", "hash-a"]]);
    const b = new Map([
      ["a.ir.json", "hash-a"],
      ["b.ir.json", "hash-b"],
    ]);
    expect(irHashesEqual(a, b)).toBe(false);
  });

  it("detects a removed file", () => {
    const a = new Map([
      ["a.ir.json", "hash-a"],
      ["b.ir.json", "hash-b"],
    ]);
    const b = new Map([["a.ir.json", "hash-a"]]);
    expect(irHashesEqual(a, b)).toBe(false);
  });
});
