import { describe, expect, it } from "vitest";
import { emit, emitIr, isEngineOnlyScript } from "../src/index.js";
import { cfjournalScript } from "../examples/cfjournal.js";
import { welcomeScript } from "../examples/welcome.js";

type Node = Record<string, unknown> & { kind?: string; event?: string };

function findNode(value: unknown, predicate: (node: Node) => boolean): Node | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const node = value as Node;
    if (predicate(node)) return node;
  }
  for (const child of Object.values(value)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function findNodes(value: unknown, predicate: (node: Node) => boolean, out: Node[] = []): Node[] {
  if (value === null || typeof value !== "object") return out;
  if (!Array.isArray(value)) {
    const node = value as Node;
    if (predicate(node)) out.push(node);
  }
  for (const child of Object.values(value)) {
    findNodes(child, predicate, out);
  }
  return out;
}

describe("integrated cloudflare sample (CF-4)", () => {
  it("the cfjournal example is engine-only and joins the whole flow", () => {
    expect(isEngineOnlyScript(cfjournalScript)).toBe(true);
    expect(() => emit(cfjournalScript)).toThrow();
    expect(isEngineOnlyScript(welcomeScript)).toBe(false);
    const ir = JSON.parse(emitIr(cfjournalScript)) as unknown;
    // D1 half: table creation, the two journaled inserts and
    // the two stats reads all ride the cfD1Query kind.
    const queries = findNodes(ir, (n) => n.kind === "cfD1Query");
    expect(queries.length).toBe(5);
    // R2 + distribution half, as in the packdist sample.
    for (const kind of ["cfR2Put", "cfR2Presign", "sendResourcePack"]) {
      expect(findNode(ir, (n) => n.kind === kind)).toBeDefined();
    }
    expect(findNode(ir, (n) => n.event === "resourcePackStatus")).toBeDefined();
    expect(findNode(ir, (n) => n.event === "cfResponse")).toBeDefined();
    expect(findNode(ir, (n) => n.event === "join")).toBeDefined();
  });

  it("journals both event kinds with the player name as a bound value", () => {
    const ir = JSON.parse(emitIr(cfjournalScript)) as unknown;
    const inserts = findNodes(
      ir,
      (n) => n.kind === "cfD1Query" && JSON.stringify(n).includes("insert into pack_events"),
    );
    expect(inserts.length).toBe(2);
    // The SQL text is a format node whose expression part is the
    // player name — the value is bound, never inlined.
    for (const insert of inserts) {
      expect(JSON.stringify(insert)).toContain("nameOf");
      expect(JSON.stringify(insert)).not.toContain("values (JournalBot");
    }
  });
});
