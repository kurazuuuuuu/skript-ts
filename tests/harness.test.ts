import { describe, expect, it } from "vitest";
import {
  add,
  broadcast,
  emit,
  emitWithMap,
  num,
  onDeath,
  onJoin,
  player,
  script,
  send,
  str,
  variable,
  victim,
} from "../src/index.js";
import { SkriptLogParser, mapError } from "../src/cli/skript-log.js";
import type { SourceMapFile } from "../src/source-map.js";

describe("emitWithMap", () => {
  it("produces byte-identical code to emit()", () => {
    const prog = script(
      onJoin([broadcast(str("x"))]),
      onDeath([add(variable("deaths", victim()), num(1))]),
    );
    expect(emitWithMap(prog).code).toBe(emit(prog));
  });

  it("maps every line to its AST node path", () => {
    const prog = script(
      onJoin([send(player(), str("a")), broadcast(str("b"))]),
    );
    const { code, lines } = emitWithMap(prog);
    expect(code.split("\n")).toHaveLength(lines.length + 1); // trailing newline
    expect(lines.map((l) => l.node)).toEqual(["body[0]", "body[0].body[0]", "body[0].body[1]"]);
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3]);
  });

  it("separates top-level blocks with a blank line that has an empty node", () => {
    const prog = script(onJoin([broadcast(str("x"))]), onJoin([broadcast(str("y"))]));
    const { lines } = emitWithMap(prog);
    expect(lines[2]).toEqual({ line: 3, node: "" });
  });
});

describe("SkriptLogParser (real log formats from Skript 2.17.1)", () => {
  const failLog = [
    "[18:00:27] [Server thread/INFO]: [Skript] Line 2: (death.sk)",
    "[18:00:27] [Server thread/INFO]:     Use 'attacker' and/or 'victim' in damage/death events",
    "[18:00:27] [Server thread/INFO]:     Line: add 1 to {deaths::%player%}",
    "[18:00:27] [Server thread/INFO]:  ",
    "[18:00:27] [Server thread/INFO]: [Skript] Loaded 5 scripts with a total of 8 structures in 0.65 seconds",
    "[18:00:27] [Server thread/INFO]: [Skript] Finished loading.",
    "[18:00:27] [Server thread/INFO]: Done (66.764s)! For help, type \"help\"",
    "[18:00:34] [ForkJoinPool.commonPool-worker-1/INFO]: Line 2: (death.sk)",
    "[18:00:34] [ForkJoinPool.commonPool-worker-1/INFO]:     There's no player in an on death event.",
    "[18:00:34] [ForkJoinPool.commonPool-worker-1/INFO]:     Line: add 1 to {deaths::%player%}",
    "[18:00:34] [ForkJoinPool.commonPool-worker-1/INFO]: [Skript] Encountered 1 errors while reloading the config, aliases and all scripts! (928ms)",
  ];

  it("extracts errors and prefers the reload-phase message", () => {
    const p = new SkriptLogParser();
    for (const line of failLog) p.feed(line);
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toMatchObject({
      file: "death.sk",
      skLine: 2,
      message: "There's no player in an on death event.",
      sourceLine: "add 1 to {deaths::%player%}",
      phase: "load",
    });
    expect(p.reloadErrorCount).toBe(1);
    expect(p.loadedScriptCount).toBe(5);
    expect(p.allLoadedOk).toBe(false);
  });

  it("handles the live console prefix format ([HH:MM:SS INFO]: )", () => {
    // The child's stdout uses a single-bracket prefix, unlike the file log.
    const p = new SkriptLogParser();
    p.feed("[18:39:12 INFO]: [Skript] Line 2: (broken.sk)");
    p.feed("[18:39:12 INFO]:     Use 'attacker' and/or 'victim' in damage/death events");
    p.feed("[18:39:12 INFO]:     Line: send \"you died\" to player");
    p.feed("[18:39:12 INFO]: [Skript] Loaded 1 script with a total of 1 structure in 0.22 seconds");
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toMatchObject({ file: "broken.sk", skLine: 2, sourceLine: 'send "you died" to player' });
    expect(p.loadedScriptCount).toBe(1);
  });

  it("recognizes a clean load and reload", () => {
    const p = new SkriptLogParser();
    p.feed("[18:02:52] [Server thread/INFO]: [Skript] All scripts loaded without errors.");
    p.feed("[18:02:52] [Server thread/INFO]: [Skript] Loaded 5 scripts with a total of 8 structures in 0.73 seconds");
    p.feed("[18:02:59] [ForkJoinPool.commonPool-worker-1/INFO]: [Skript] Successfully reloaded the config, aliases and all scripts. (1032ms)");
    expect(p.errors).toHaveLength(0);
    expect(p.allLoadedOk).toBe(true);
    expect(p.reloadOk).toBe(true);
  });

  it("mapError joins parser output with the source map", () => {
    const p = new SkriptLogParser();
    for (const line of failLog) p.feed(line);
    const map: SourceMapFile = {
      version: 1,
      file: "death.sk",
      source: "examples/death.ts",
      lines: [
        { line: 1, node: "body[0]", ts: { file: "examples/death.ts", line: 4, column: 3 } },
        { line: 2, node: "body[0].body[0]", ts: { file: "examples/death.ts", line: 5, column: 5 } },
      ],
    };
    const first = p.errors[0];
    if (first === undefined) throw new Error("expected one parsed error");
    const mapped = mapError(first, new Map([["death.sk", map]]));
    expect(mapped.node).toBe("body[0].body[0]");
    expect(mapped.ts).toEqual({ file: "examples/death.ts", line: 5, column: 5 });
  });
});
