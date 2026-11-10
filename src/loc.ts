import type { SourceLoc } from "./ast.js";

/** Matches the library's own builder files (api / loc) in stack frames. */
const LIB_FILE = /(?:^|[/\\])(?:api|loc)\.(?:ts|js)$/;

/**
 * Captures the user source location that called a builder function.
 *
 * Parses the formatted stack trace, which the TypeScript runtime (tsx)
 * source-maps back to .ts positions. The raw V8 CallSite API is not
 * source-mapped under tsx (it returns positions in the transpiled
 * output), so it cannot be used for this. Frames from the library's own
 * builder files are skipped; the first remaining frame is the call site.
 */
export function captureLoc(): SourceLoc | undefined {
  const stack: unknown = new Error().stack;
  if (typeof stack !== "string") return undefined;
  for (const raw of stack.split("\n").slice(1)) {
    const m =
      /\((.+):(\d+):(\d+)\)\s*$/.exec(raw) ??
      /^\s*at\s+(?:async\s+)?(.+):(\d+):(\d+)\s*$/.exec(raw);
    if (m === null) continue;
    let file = m[1] as string;
    if (file.startsWith("file://")) {
      file = file.slice("file://".length);
      try {
        file = decodeURIComponent(file);
      } catch {
        // Keep the already-stripped path if decoding fails.
      }
    }
    if (file.startsWith("node:")) continue;
    if (LIB_FILE.test(file)) continue;
    return { file, line: Number(m[2]), column: Number(m[3]) };
  }
  return undefined;
}
