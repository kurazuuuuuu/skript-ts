import type { SourceLoc } from "./ast.js";

/** Mapping for one emitted .sk line. */
export interface LineMapping {
  /** 1-based line number in the emitted .sk file. */
  line: number;
  /** AST node path that produced the line, e.g. "body[0].body[2]". Empty for blank separator lines. */
  node: string;
  /** TypeScript call site of the builder that produced the line, when captured. */
  ts?: SourceLoc;
}

/** Source map file written next to an emitted .sk file as `<name>.sk.map.json`. */
export interface SourceMapFile {
  version: 1;
  /** Emitted .sk file name. */
  file: string;
  /** TypeScript source file the .sk was built from. */
  source: string;
  lines: LineMapping[];
}

/** Look up the mapping for a 1-based .sk line number. */
export function lookupLine(map: SourceMapFile, skLine: number): LineMapping | undefined {
  return map.lines.find((l) => l.line === skLine);
}
