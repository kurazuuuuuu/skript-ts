import { describe, expect, it } from "vitest";

import { command, loadOrder, script } from "../src/index.js";
import { toIr } from "../src/ir.js";

const minimalScript = () => script(command("noop", null, []));

describe("loadOrder", () => {
  it("stores the declared order in the IR", () => {
    const ir = toIr(loadOrder(10, minimalScript()));

    expect(ir).toMatchObject({ loadOrder: 10 });
  });

  it("omits loadOrder from the IR when no order was declared", () => {
    const ir = toIr(minimalScript());

    expect(ir).not.toHaveProperty("loadOrder");
  });

  it("rejects non-finite orders", () => {
    expect(() => loadOrder(Number.NaN, minimalScript())).toThrow();
    expect(() => loadOrder(Number.POSITIVE_INFINITY, minimalScript())).toThrow();
    expect(() => loadOrder(Number.NEGATIVE_INFINITY, minimalScript())).toThrow();
  });
});
