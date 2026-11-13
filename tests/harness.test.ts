import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { stripAnsi } from "../src/cli/ansi.js";
import { SandboxServer } from "../src/cli/server.js";
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
    const prog = script(onJoin([send(player(), str("a")), broadcast(str("b"))]));
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
    '[18:00:27] [Server thread/INFO]: Done (66.764s)! For help, type "help"',
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
    p.feed('[18:39:12 INFO]:     Line: send "you died" to player');
    p.feed("[18:39:12 INFO]: [Skript] Loaded 1 script with a total of 1 structure in 0.22 seconds");
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toMatchObject({
      file: "broken.sk",
      skLine: 2,
      sourceLine: 'send "you died" to player',
    });
    expect(p.loadedScriptCount).toBe(1);
  });

  it("recognizes a clean load and reload", () => {
    const p = new SkriptLogParser();
    p.feed("[18:02:52] [Server thread/INFO]: [Skript] All scripts loaded without errors.");
    p.feed(
      "[18:02:52] [Server thread/INFO]: [Skript] Loaded 5 scripts with a total of 8 structures in 0.73 seconds",
    );
    p.feed(
      "[18:02:59] [ForkJoinPool.commonPool-worker-1/INFO]: [Skript] Successfully reloaded the config, aliases and all scripts. (1032ms)",
    );
    expect(p.errors).toHaveLength(0);
    expect(p.allLoadedOk).toBe(true);
    expect(p.reloadOk).toBe(true);
  });

  it("recognizes load and reload outcomes in ANSI-colored output (e.g. under tmux)", () => {
    // When the CLI runs in a color-capable terminal (tmux pane,
    // TERM=tmux-256color), the server console embeds ANSI escapes in
    // its lines — including inside the phrases judged here — and the
    // plain-text checks must still see the same outcomes.
    const colored = new SkriptLogParser();
    colored.feed(
      "\x1b[36m[12:04:31 INFO]:\x1b[0m [Skript] All scripts loaded \x1b[32mwithout errors\x1b[0m.",
    );
    colored.feed(
      "[12:04:31 INFO]: [Skript] Loaded \x1b[33m5 scripts\x1b[0m with a total of 8 structures in 0.73 seconds",
    );
    colored.feed(
      "[12:04:38 INFO]: [Skript] Successfully \x1b[32mreloaded the config\x1b[0m, aliases and all scripts. (1032ms)",
    );
    expect(colored.errors).toHaveLength(0);
    expect(colored.allLoadedOk).toBe(true);
    expect(colored.reloadOk).toBe(true);
    expect(colored.loadedScriptCount).toBe(5);

    const failing = new SkriptLogParser();
    failing.feed("\x1b[33m[12:04:31 INFO]:\x1b[0m [Skript] Line 2: (death.sk)");
    failing.feed("[12:04:31 INFO]:     There's no player in an on death event.");
    failing.feed("[12:04:31 INFO]:     Line: add 1 to {deaths::%player%}");
    failing.feed(
      "[12:04:38 INFO]: [Skript] Encountered \x1b[31m1 error\x1b[0m while reloading the config, aliases and all scripts! (928ms)",
    );
    expect(failing.errors).toHaveLength(1);
    expect(failing.errors[0]).toMatchObject({ file: "death.sk", skLine: 2 });
    expect(failing.reloadErrorCount).toBe(1);
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

describe("stripAnsi", () => {
  it("removes SGR color codes, including ones embedded inside a phrase", () => {
    expect(stripAnsi("\x1b[32mSuccessfully reloaded\x1b[0m the config")).toBe(
      "Successfully reloaded the config",
    );
    expect(stripAnsi("\x1b[36m[12:04:31 INFO]:\x1b[0m hello")).toBe("[12:04:31 INFO]: hello");
    expect(stripAnsi("\x1b[1;31mred\x1b[0m")).toBe("red");
  });

  it("removes OSC sequences, charset switches and cursor-visibility codes", () => {
    expect(stripAnsi("\x1b]8;;https://example.com\x07link\x1b]8;;\x07")).toBe("link");
    expect(stripAnsi("\x1b(B\x1b[?25ltext\x1b[?25h")).toBe("text");
  });

  it("leaves plain text and Minecraft § formatting codes untouched", () => {
    expect(stripAnsi("plain line")).toBe("plain line");
    expect(stripAnsi("§aGreen §lBold")).toBe("§aGreen §lBold");
  });

  it("makes the load-check completion patterns match colored reload lines", () => {
    // The exact patterns the verify load check and the probe round
    // wait on. Against the raw colored line both miss (the reported
    // 180s timeout); against the stripped line both hit.
    const raw =
      "[12:00:05 INFO]: [Skript] Successfully \x1b[32mreloaded the config\x1b[0m, aliases and all scripts. (999ms)";
    const verifyPattern =
      /Successfully reloaded the config|Encountered \d+ errors? while reloading/;
    expect(verifyPattern.test(raw)).toBe(false);
    expect(verifyPattern.test(stripAnsi(raw))).toBe(true);
  });
});

describe("SandboxServer (child output with ANSI color escapes)", () => {
  it("strips escapes at ingestion so waitForLine patterns match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "skript-ts-fake-server-"));
    const fakeJava = join(dir, "fake-java");
    writeFileSync(
      fakeJava,
      [
        "#!/bin/sh",
        "printf '\\033[36m[12:00:00 INFO]:\\033[0m Done (1.234s)! For help, type \"help\"\\n'",
        "printf '[12:00:05 INFO]: [Skript] Successfully \\033[32mreloaded\\033[0m the config, aliases and all scripts. (999ms)\\n'",
        "exec sleep 30",
        "",
      ].join("\n"),
    );
    chmodSync(fakeJava, 0o755);
    const seen: string[] = [];
    const server = new SandboxServer({
      serverDir: dir,
      javaPath: fakeJava,
      onLine: (line) => seen.push(line),
    });
    const prevTerm = process.env["TERM"];
    process.env["TERM"] = "tmux-256color"; // the reported environment
    try {
      server.start();
      const done = await server.waitForLine(/Done \([0-9.]+s\)!/, 10_000);
      expect(done[0]).toContain("Done (1.234s)!");
      const reloaded = await server.waitForLine(
        /Successfully reloaded the config|Encountered \d+ errors? while reloading/,
        10_000,
      );
      expect(reloaded[0]).toContain("Successfully reloaded the config");
      expect(server.logLines.every((l) => !l.includes("\x1b"))).toBe(true);
      expect(seen.every((l) => !l.includes("\x1b"))).toBe(true);
    } finally {
      await server.stop(1_000);
      if (prevTerm === undefined) delete process.env["TERM"];
      else process.env["TERM"] = prevTerm;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
