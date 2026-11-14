import { describe, expect, it } from "vitest";
import { findItemNameIssues, formatItemNameIssue } from "../src/cli/type-names.js";

describe("findItemNameIssues", () => {
  it("accepts known material names in several spellings", () => {
    const root = {
      structures: [
        {
          steps: [
            { kind: "item", name: "diamond sword" },
            { nested: { kind: "item", name: "Diamond Sword" } },
          ],
        },
        { kind: "item", name: "diamond_sword" },
        { kind: "item", name: "  stone  " },
      ],
    };

    expect(findItemNameIssues(root)).toEqual([]);
  });

  it("reports a near miss as a hard issue with a suggestion", () => {
    const issues = findItemNameIssues({
      structures: [{ kind: "item", name: "dimond sword" }],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.hard).toBe(true);
    expect(issues[0]?.suggestions[0]).toBe("DIAMOND_SWORD");
  });

  it("reports an unknown non-material-looking name as a soft issue", () => {
    const issues = findItemNameIssues({ kind: "item", name: "healing potion" });

    expect(issues).toEqual([{ name: "healing potion", suggestions: [], hard: false }]);
  });

  it("dedupes repeated literal names", () => {
    const issues = findItemNameIssues({
      first: { kind: "item", name: "dimond sword" },
      second: { nested: { kind: "item", name: "dimond sword" } },
    });

    expect(issues).toHaveLength(1);
  });

  it("ignores non-string item names and unrelated kinds", () => {
    const issues = findItemNameIssues({
      itemWithBadName: { kind: "item", name: 42 },
      unrelated: { kind: "not-item", name: "dimond sword" },
      itemWithoutName: { kind: "item" },
    });

    expect(issues).toEqual([]);
  });
});

describe("formatItemNameIssue", () => {
  it("renders hard issues with display-form suggestions", () => {
    const message = formatItemNameIssue("scripts/main.ts", {
      name: "dimond sword",
      suggestions: ["DIAMOND_SWORD"],
      hard: true,
    });

    expect(message).toContain("scripts/main.ts");
    expect(message).toContain("dimond sword");
    expect(message).toContain("diamond sword");
  });
});
