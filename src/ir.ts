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

/**
 * Node kinds (and event kinds) that exist only in the engine jar:
 * builtin addon features (phase 6, MundoSK slice) with no `.sk`
 * equivalent. A script containing any of them is engine-only — the
 * build writes its IR but no `.sk`, and Skript-mode deployment skips it.
 */
const ENGINE_ONLY_KINDS: ReadonlySet<string> = new Set([
  "wsConnect",
  "wsSend",
  "wsDisconnect",
  "wsMessage",
  "wsId",
  "borderSize",
  "borderCenter",
  "setBorderSize",
  "setBorderCenter",
  "timerCreate",
  "timerStop",
  "timerPause",
  "timerResume",
  "timerId",
  "timerTimeLeft",
  "timerActive",
  "dataSource",
  "dbExecute",
  "dbLastError",
  "fileCreate",
  "dirCreate",
  "fileDelete",
  "fileWrite",
  "fileAppend",
  "fileContents",
  "fileLine",
  "fileLineCount",
  "fileExists",
  "placeholderValue",
  "placeholderIdentifier",
  "placeholderPrefix",
  "setPlaceholderResult",
  "httpFetch",
  "httpDownload",
  "envVar",
  "httpId",
  "httpStatus",
  "httpBody",
  "httpError",
  "httpSavedPath",
  "httpOk",
  "cfD1Query",
  "cfId",
  "cfError",
  "cfOk",
  "cuboidShape",
  "sphereShape",
  "cylinderShape",
  "lineShape",
  "uniformFill",
  "mixFill",
  "noiseFill",
  "paint",
  "eventCursor",
  "setCursorItem",
  "freeSpaceFor",
]);

const ENGINE_ONLY_EVENTS: ReadonlySet<string> = new Set([
  "wsOpen",
  "wsMessage",
  "wsClose",
  "timerTick",
  "timerComplete",
  "papiRequest",
  "httpResponse",
  "cfResponse",
  // Feedback batch D: Skript has no swap-hand event under any
  // spelling, so the event exists only in the engine.
  "swapHand",
]);

function containsEngineOnly(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsEngineOnly);
  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;
    if (typeof rec["kind"] === "string" && ENGINE_ONLY_KINDS.has(rec["kind"])) return true;
    if (
      rec["kind"] === "event" &&
      typeof rec["event"] === "string" &&
      ENGINE_ONLY_EVENTS.has(rec["event"])
    ) {
      return true;
    }
    return Object.values(rec).some(containsEngineOnly);
  }
  return false;
}

/** True when the script uses engine-builtin features and has no `.sk` form. */
export function isEngineOnlyScript(script: Script): boolean {
  return containsEngineOnly(toIr(script));
}

/** Serialize a Script to the exact IR JSON text written to `.ir.json` files. */
export function emitIr(script: Script): string {
  return JSON.stringify(toIr(script), null, 2) + "\n";
}
