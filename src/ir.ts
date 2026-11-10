import type { Script } from "./ast.js";

/**
 * The intermediate representation (IR) consumed by the skript-ts engine
 * jar. It is the script AST serialized as plain JSON: the same
 * kind-tagged node objects the builder API produces, with the
 * TypeScript call-site `loc` fields removed (they are meaningless to
 * the JVM side and would leak local paths into deployed files).
 *
 * One `.ir.json` file is written per source script, mirroring the
 * `.sk` output: `welcome.ts` -> `welcome.sk` + `welcome.ir.json`.
 * The engine loads the IR and executes the v0 subset semantics
 * directly on Paper, without the Skript plugin.
 */
export type IrNode = Record<string, unknown>;

function stripLoc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLoc);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "loc") continue;
      out[key] = stripLoc(v);
    }
    return out;
  }
  return value;
}

/** Convert a built Script into its JSON-serializable IR form. */
export function toIr(script: Script): IrNode {
  return stripLoc(script) as IrNode;
}

/** Serialize a Script to the exact IR JSON text written to `.ir.json` files. */
export function emitIr(script: Script): string {
  return JSON.stringify(toIr(script), null, 2) + "\n";
}
