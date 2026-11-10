import type { SourceMapFile } from "../source-map.js";
import { lookupLine } from "../source-map.js";

export interface SkriptParseError {
  file: string;
  skLine: number;
  message: string;
  sourceLine?: string;
  phase: "load" | "reload";
}

export interface MappedError extends SkriptParseError {
  node?: string;
  ts?: { file: string; line: number; column: number };
}

interface PendingError {
  phase: "load" | "reload";
  skLine: number;
  file: string;
  messages: string[];
  sourceLine?: string;
}

export class SkriptLogParser {
  private static readonly headerRegex =
    /^(?:\[Skript\] )?Line (\d+): \(([^)]+)\)\s*$/;
  private static readonly sourceLineRegex = /^\s+Line: (.*)$/;

  private phase: "load" | "reload" = "load";
  private pending: PendingError | null = null;
  private readonly _errors: SkriptParseError[] = [];
  private readonly dedupe = new Map<string, number>();

  allLoadedOk = false;
  reloadOk = false;
  reloadErrorCount: number | null = null;
  loadedScriptCount: number | null = null;

  feed(rawLine: string): void {
    const message = stripPrefix(rawLine);

    if (message.includes("Finished loading.")) {
      this.phase = "reload";
    }
    if (/^Done \([0-9.]+s\)!/.test(message)) {
      this.phase = "reload";
    }

    if (message.includes("All scripts loaded without errors")) {
      this.allLoadedOk = true;
    }
    if (message.includes("Successfully reloaded the config, aliases and all scripts")) {
      this.reloadOk = true;
    }

    const encounteredMatch = message.match(/Encountered (\d+) errors? while reloading/);
    if (encounteredMatch) {
      this.reloadErrorCount = Number(encounteredMatch[1]);
    }

    const loadedMatch = message.match(
      /Loaded (\d+) scripts with a total of \d+ structures/
    );
    if (loadedMatch) {
      this.loadedScriptCount = Number(loadedMatch[1]);
    }

    const headerMatch = message.match(SkriptLogParser.headerRegex);
    if (headerMatch) {
      this.finalizePending();
      this.pending = {
        phase: this.phase,
        skLine: Number(headerMatch[1]),
        file: headerMatch[2],
        messages: []
      };
      return;
    }

    if (this.pending !== null) {
      if (message.trim() === "") {
        this.finalizePending();
        return;
      }

      const sourceMatch = message.match(SkriptLogParser.sourceLineRegex);
      if (sourceMatch) {
        this.pending.sourceLine = sourceMatch[1];
        this.finalizePending();
        return;
      }

      if (/^\s+\S/.test(message)) {
        if (this.pending.messages.length === 0) {
          this.pending.messages.push(message.trim());
        }
        return;
      }

      this.finalizePending();
      return;
    }
  }

  private finalizePending(): void {
    if (this.pending === null) {
      return;
    }

    const pending = this.pending;
    this.pending = null;

    const error: SkriptParseError = {
      file: pending.file,
      skLine: pending.skLine,
      message: pending.messages[0] ?? "",
      phase: pending.phase
    };
    if (pending.sourceLine !== undefined) {
      error.sourceLine = pending.sourceLine;
    }

    const key = `${pending.file}\u0000${pending.skLine}`;
    const existingIndex = this.dedupe.get(key);

    if (existingIndex === undefined) {
      this.dedupe.set(key, this._errors.length);
      this._errors.push(error);
      return;
    }

    if (error.phase === "reload") {
      const existing = this._errors[existingIndex];
      if (existing !== undefined) {
        existing.message = error.message;
        if (error.sourceLine !== undefined) {
          existing.sourceLine = error.sourceLine;
        }
      }
    }
  }

  get errors(): SkriptParseError[] {
    return this._errors;
  }
}

export function mapError(
  err: SkriptParseError,
  maps: ReadonlyMap<string, SourceMapFile>
): MappedError {
  const result: MappedError = { ...err };

  const map = maps.get(err.file);
  if (map) {
    const mapping = lookupLine(map, err.skLine);
    if (mapping !== undefined) {
      if (mapping.node !== "") {
        result.node = mapping.node;
      }
      if (mapping.ts !== undefined) {
        result.ts = { ...mapping.ts };
      }
    }
  }

  return result;
}

function stripPrefix(rawLine: string): string {
  // Paper log lines look like `[18:00:27] [Server thread/INFO]: <message>`.
  const m = /^\[[^\]]*\] \[[^\]]*\]: /.exec(rawLine);
  return m === null ? rawLine : rawLine.slice(m[0].length);
}