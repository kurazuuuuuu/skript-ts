#!/usr/bin/env node
/**
 * skript-ts CLI.
 *
 *   skript-ts build  [--src <dir>] [--out <dir>] [--deploy] [--engine] [--server-dir <dir>] [--json]
 *   skript-ts verify [--src <dir>] [--out <dir>] [--server-dir <dir>] [--java <path>]
 *                    [--engine] [--no-behavior] [--no-fresh] [--json]
 *
 * build:  typecheck -> transpile -> deploy (with --deploy)
 * verify: typecheck -> transpile -> deploy -> server start -> script load
 *         check -> behavior tests -> stop.
 *         Runs against the throwaway sandbox server in --server-dir only.
 *         Default mode loads the emitted .sk files with the real Skript
 *         plugin; --engine instead deploys the IR files plus the
 *         skript-ts.jar engine and disables Skript.jar, so the same
 *         programs run with no Skript plugin present. The load check is
 *         `skript reload all` in Skript mode and `skript-ts reload`
 *         (engine summary line) in engine mode.
 *
 * With --json, progress is written to stderr and a single JSON result
 * object is printed to stdout. Exit code is 0 on success, 1 on failure.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBehaviorContext, type BehaviorTest } from "./behavior.js";
import { installEngine, uninstallEngine } from "./cli/engine.js";
import { createProgress, type StageHandle } from "./cli/progress.js";
import { buildProject, deployEngineScripts, deployScripts, runTypecheck, type BuildResult } from "./cli/project.js";
import { SandboxServer } from "./cli/server.js";
import { SkriptLogParser, mapError, type MappedError } from "./cli/skript-log.js";

interface CliOptions {
  command: "build" | "verify";
  srcDir: string;
  outDir: string;
  serverDir: string;
  java: string | null;
  json: boolean;
  deploy: boolean;
  engine: boolean;
  behavior: boolean;
  fresh: boolean;
}

interface StageResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  note?: string;
  errors?: string[];
}

interface BehaviorResult {
  name: string;
  status: "passed" | "failed";
  error?: string;
}

interface RunResult {
  command: string;
  mode: "skript" | "engine";
  ok: boolean;
  durationMs: number;
  stages: StageResult[];
  skriptErrors: MappedError[];
  behavior: BehaviorResult[];
}

const USAGE = `usage:
  skript-ts build  [--src <dir>] [--out <dir>] [--deploy] [--engine] [--server-dir <dir>] [--json]
  skript-ts verify [--src <dir>] [--out <dir>] [--server-dir <dir>] [--java <path>]
                   [--engine] [--no-behavior] [--no-fresh] [--json]`;

function parseArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (command !== "build" && command !== "verify") {
    throw new Error(`unknown command: ${command ?? "(none)"}\n${USAGE}`);
  }
  const opts: CliOptions = {
    command,
    srcDir: "examples",
    outDir: "build",
    serverDir: "server",
    java: null,
    json: false,
    deploy: false,
    engine: false,
    behavior: true,
    fresh: true,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    const value = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`missing value for ${arg}\n${USAGE}`);
      return v;
    };
    switch (arg) {
      case "--src": opts.srcDir = value(); break;
      case "--out": opts.outDir = value(); break;
      case "--server-dir": opts.serverDir = value(); break;
      case "--java": opts.java = value(); break;
      case "--json": opts.json = true; break;
      case "--deploy": opts.deploy = true; break;
      case "--engine": opts.engine = true; break;
      case "--no-behavior": opts.behavior = false; break;
      case "--no-fresh": opts.fresh = false; break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option: ${arg}\n${USAGE}`);
    }
  }
  return opts;
}

function resolveJava(opts: CliOptions): string {
  if (opts.java !== null) return opts.java;
  const env = process.env["SKRIPT_TS_JAVA"];
  if (env !== undefined && env !== "") return env;
  const bundled = join(homedir(), "workspace", "tools", "jdk-21.0.13+9", "bin", "java");
  return existsSync(bundled) ? bundled : "java";
}

function readServerPort(serverDir: string): number {
  try {
    const text = readFileSync(join(serverDir, "server.properties"), "utf8");
    const m = /^server-port=(\d+)$/m.exec(text);
    if (m !== null) return Number(m[1]);
  } catch {
    // fall through to default
  }
  return 25565;
}

function readMcVersion(serverDir: string): string {
  try {
    const text = readFileSync(join(serverDir, "version_history.json"), "utf8");
    const m = /"currentVersion":\s*"(\d+\.\d+(?:\.\d+)?)/.exec(text);
    if (m !== null) return m[1] as string;
  } catch {
    // fall through to default
  }
  return "1.21.11";
}

/** Remove per-player state from the sandbox so behavior tests start from a clean slate. */
function wipeSandboxState(serverDir: string): void {
  const playerdata = join(serverDir, "world", "playerdata");
  if (existsSync(playerdata)) {
    for (const f of readdirSync(playerdata)) {
      if (f.endsWith(".dat") || f.endsWith(".dat_old")) rmSync(join(playerdata, f));
    }
  }
  const variables = join(serverDir, "plugins", "Skript", "variables.csv");
  if (existsSync(variables)) rmSync(variables);
  // Engine-mode variables live in the engine plugin's own store file.
  const engineVariables = join(serverDir, "plugins", "skript-ts", "variables.json");
  if (existsSync(engineVariables)) rmSync(engineVariables);
  // Op status persists across runs and would change behavior-test
  // preconditions (e.g. a bot opped by an earlier run stays op).
  const ops = join(serverDir, "ops.json");
  if (existsSync(ops)) rmSync(ops);
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const srcDir = resolve(rootDir, opts.srcDir);
  const outDir = resolve(rootDir, opts.outDir);
  const serverDir = resolve(rootDir, opts.serverDir);

  const progressStream = opts.json ? process.stderr : process.stdout;
  const progress = createProgress({ stream: progressStream, tty: progressStream.isTTY === true });

  const stages: StageResult[] = [];
  const behaviorResults: BehaviorResult[] = [];
  let skriptErrors: MappedError[] = [];
  let aborted = false;

  const runStage = async (
    name: string,
    fn: (h: StageHandle) => Promise<{ note?: string } | void>,
  ): Promise<boolean> => {
    if (aborted) {
      stages.push({ name, status: "skipped", durationMs: 0 });
      return false;
    }
    const handle = progress.begin(name);
    const t0 = Date.now();
    try {
      const out = await fn(handle);
      const note = out?.note;
      handle.finish("passed", note);
      stages.push({
        name,
        status: "passed",
        durationMs: Date.now() - t0,
        ...(note !== undefined ? { note } : {}),
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      handle.finish("failed", message.split("\n")[0]);
      stages.push({ name, status: "failed", durationMs: Date.now() - t0, errors: [message] });
      aborted = true;
      return false;
    }
  };
  const skipStage = (name: string, note?: string): void => {
    stages.push({ name, status: "skipped", durationMs: 0, ...(note !== undefined ? { note } : {}) });
  };

  // 1. Typecheck
  await runStage("型チェック", async () => {
    const res = runTypecheck(rootDir);
    if (!res.ok) throw new Error(`tsc failed:\n${res.output}`);
    return { note: "tsc --noEmit" };
  });

  // 2. Transpile
  let build: BuildResult | null = null;
  await runStage("変換", async (h) => {
    build = await buildProject({
      rootDir,
      srcDir,
      outDir,
      ignore: ["to-sk-files.ts"],
      onFile: (rel) => h.update(rel),
    });
    const n = build.scripts.length;
    const skippedNote = build.skipped.length > 0 ? `、${build.skipped.length} 件スキップ` : "";
    return { note: `${n} ファイル${skippedNote}` };
  });

  // 3. Deploy
  const wantDeploy = opts.command === "verify" || opts.deploy;
  if (!wantDeploy) {
    skipStage("配置", "--deploy なし");
  } else if (opts.engine) {
    await runStage("配置", async () => {
      if (build === null) throw new Error("build result missing");
      const res = deployEngineScripts({
        scripts: build.scripts,
        engineScriptsDir: join(serverDir, "plugins", "skript-ts", "scripts"),
      });
      const set = installEngine(rootDir, serverDir);
      const removedNote = res.removed.length > 0 ? `、${res.removed.length} 件削除` : "";
      return { note: `IR ${res.deployed.length} ファイル${removedNote}、${set.note}` };
    });
  } else {
    await runStage("配置", async () => {
      if (build === null) throw new Error("build result missing");
      // Deterministic plugin set: a previous engine run must not leak
      // skript-ts.jar (or a disabled Skript.jar) into Skript mode.
      uninstallEngine(rootDir, serverDir);
      const res = deployScripts({ scripts: build.scripts, serverScriptsDir: join(serverDir, "plugins", "Skript", "scripts") });
      const removedNote = res.removed.length > 0 ? `、${res.removed.length} 件削除` : "";
      return { note: `${res.deployed.length} ファイル${removedNote}` };
    });
  }

  if (opts.command === "verify") {
    const parser = new SkriptLogParser();
    const server = new SandboxServer({
      serverDir,
      javaPath: resolveJava(opts),
      onLine: (line) => parser.feed(line),
    });
    let serverStarted = false;

    // 4. Server start
    await runStage("サーバー起動", async (h) => {
      if (build === null) throw new Error("build result missing");
      if (opts.fresh) wipeSandboxState(serverDir);
      server.start();
      serverStarted = true;
      h.update("Paper 起動待ち");
      await server.waitForLine(/Done \([0-9.]+s\)!/, 240_000);
      if (opts.engine) return { note: "skript-ts エンジンで起動" };
      return { note: `スクリプト ${parser.loadedScriptCount ?? "?"} 件読み込み` };
    });

    // 5. Script load check (initial load + explicit reload)
    await runStage("読み込み確認", async (h) => {
      if (build === null) throw new Error("build result missing");
      if (opts.engine) {
        h.update("skript-ts reload 実行");
        const mark = server.mark();
        server.sendCommand("skript-ts reload");
        const m = await server.waitForLine(
          /\[skript-ts\] Loaded (\d+) script\(s\), (\d+) top-level structure\(s\)/,
          120_000,
          mark,
        );
        const loadedCount = Number(m[1]);
        const expected = build.scripts.length;
        const failures = server.logLines
          .slice(mark)
          .filter((l) => l.includes("[skript-ts]") && l.includes("Failed to load"));
        if (failures.length > 0) {
          throw new Error(`エンジン読み込みエラー: ${failures[0]?.trim()}`);
        }
        if (loadedCount !== expected) {
          throw new Error(`エンジン読み込み数 ${loadedCount} 件（期待 ${expected} 件）`);
        }
        return { note: `エンジン ${loadedCount} スクリプト、エラー 0 件` };
      }
      h.update("skript reload all 実行");
      const mark = server.mark();
      server.sendCommand("skript reload all");
      await server.waitForLine(/Successfully reloaded the config|Encountered \d+ errors? while reloading/, 180_000, mark);
      skriptErrors = parser.errors.map((e) => mapError(e, (build as BuildResult).maps));
      if (skriptErrors.length > 0) {
        throw new Error(`Skript エラー ${skriptErrors.length} 件（詳細は結果を参照）`);
      }
      if (!parser.allLoadedOk) throw new Error("起動時に 'All scripts loaded without errors' を確認できませんでした");
      if (!parser.reloadOk) throw new Error("リロード成功を確認できませんでした");
      return { note: "エラー 0 件" };
    });

    // 6. Behavior tests
    if (!opts.behavior) {
      skipStage("振る舞いテスト", "--no-behavior");
    } else {
      await runStage("振る舞いテスト", async (h) => {
        if (build === null) throw new Error("build result missing");
        const behaviorDir = join(srcDir, "behavior");
        const files = existsSync(behaviorDir)
          ? readdirSync(behaviorDir).filter((f) => f.endsWith(".behavior.ts")).sort()
          : [];
        if (files.length === 0) return { note: "テストなし（スキップ扱い）" };
        const ctx = createBehaviorContext({
          host: "127.0.0.1",
          port: readServerPort(serverDir),
          version: readMcVersion(serverDir),
          console: (cmd) => server.sendCommand(cmd),
        });
        let failures = 0;
        for (const file of files) {
          const name = basename(file, ".behavior.ts");
          h.update(name);
          try {
            const mod = (await import(pathToFileURL(join(behaviorDir, file)).href)) as Record<string, unknown>;
            const fn = (mod["default"] ?? mod["behavior"]) as BehaviorTest | undefined;
            if (typeof fn !== "function") throw new Error("default export に関数がありません");
            await Promise.race([
              fn(ctx),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("テスト全体のタイムアウト (120s)")), 120_000).unref(),
              ),
            ]);
            behaviorResults.push({ name, status: "passed" });
          } catch (err) {
            failures++;
            behaviorResults.push({
              name,
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            });
          }
          // Give the single player slot a moment to free up between tests.
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (failures > 0) throw new Error(`振る舞いテスト ${failures}/${files.length} 件失敗`);
        return { note: `${files.length} 件合格` };
      });
    }

    // 7. Stop (always attempted when the server was started)
    if (serverStarted) {
      const handle = progress.begin("停止");
      const t0 = Date.now();
      try {
        await server.stop();
        handle.finish("passed");
        stages.push({ name: "停止", status: "passed", durationMs: Date.now() - t0 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        handle.finish("failed", message);
        stages.push({ name: "停止", status: "failed", durationMs: Date.now() - t0, errors: [message] });
      }
    } else {
      skipStage("停止", "サーバー未起動");
    }
  }

  const ok = stages.every((s) => s.status !== "failed");
  const result: RunResult = {
    command: opts.command,
    mode: opts.engine ? "engine" : "skript",
    ok,
    durationMs: Date.now() - startedAt,
    stages,
    skriptErrors,
    behavior: behaviorResults,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (skriptErrors.length > 0) {
      console.log("\nSkript エラー（TS 位置つき）:");
      for (const e of skriptErrors) {
        const loc =
          e.ts !== undefined ? ` → ${e.ts.file}:${e.ts.line}:${e.ts.column}${e.node !== undefined ? ` (${e.node})` : ""}` : "";
        console.log(`  ${e.file}:${e.skLine}${loc}`);
        console.log(`    ${e.message}`);
        if (e.sourceLine !== undefined) console.log(`    Line: ${e.sourceLine}`);
      }
    }
    for (const b of behaviorResults) {
      if (b.status === "failed") console.log(`振る舞いテスト失敗: ${b.name}: ${b.error ?? ""}`);
    }
    console.log(ok ? "\n結果: 合格" : "\n結果: 不合格");
  }
  return ok ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  },
);
