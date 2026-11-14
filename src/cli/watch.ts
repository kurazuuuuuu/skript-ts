// `skript-ts watch` — dev loop for ENGINE mode.
// typecheck -> transpile to IR -> deploy into a running server -> ask the plugin to reload.

import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import * as fs from "node:fs/promises";
import { register } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { installEngine } from "./engine.js";
import { createProgress, type ProgressReporter } from "./progress.js";
import {
  buildProject,
  deployEngineScripts,
  runTypecheck,
  type BuildResult,
  type BuiltScript,
} from "./project.js";

export interface WatchOptions {
  rootDir: string;
  srcDir: string;
  outDir: string;
  serverDir: string;
  json: boolean;
  yes: boolean;
  debounceMs: number;
  /** Explicit engine jar path (--engine-jar), already absolute; null = default resolution. */
  engineJar: string | null;
  /** --no-engine-jar: never place the engine jar; the server's plugin set is managed elsewhere. */
  noEngineJar: boolean;
}

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const RELOAD_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 100;
const IGNORED_SOURCES: readonly string[] = ["to-sk-files.ts"];

const SEMANTICS_WARNING =
  "注意: リロードすると名前付きタイマーはリセットされ、periodical トリガーは再アンカーされます" +
  "（初回発火はリロード後 1 周期後）。グローバル変数は保持されます。" +
  "これは本家 Skript の /skript reload と同じ挙動です。";

type StageStatus = "passed" | "failed";

interface StageRecord {
  name: string;
  status: StageStatus;
  durationMs: number;
  note?: string;
}

interface StageHandleWithLog {
  update(detail: string): void;
  finish(status: StageStatus, note?: string): void;
}

interface StageLog {
  readonly records: StageRecord[];
  begin(name: string): StageHandleWithLog;
}

interface WatchLock {
  pid: number;
  startedAt: number;
}

interface ReloadStatus {
  buildId: string;
  ok: boolean;
  failed: string[];
}

// ---------------------------------------------------------------------------
// pure helper (exported for tests)
// ---------------------------------------------------------------------------

export function irHashesEqual(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || other !== value) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// main entry point
// ---------------------------------------------------------------------------

export async function runWatch(opts: WatchOptions): Promise<number> {
  // Human-facing output goes to stderr in JSON mode so stdout stays machine-only.
  const humanStream: NodeJS.WriteStream = opts.json ? process.stderr : process.stdout;
  const reporter: ProgressReporter = createProgress({
    stream: humanStream,
    tty: humanStream.isTTY === true,
  });

  const rootDir = path.resolve(opts.rootDir);
  const srcDir = path.resolve(opts.srcDir);
  const outDir = path.resolve(opts.outDir);
  const serverDir = path.resolve(opts.serverDir);

  const pluginDir = path.join(serverDir, "plugins", "skript-ts");
  const scriptsDir = path.join(pluginDir, "scripts");
  const lockPath = path.join(pluginDir, ".watch-lock.json");
  const requestPath = path.join(pluginDir, "reload.request");
  const statusPath = path.join(pluginDir, "reload.status");
  const tokenFile = path.join(os.tmpdir(), `skript-ts-watch-${process.pid}.token`);

  // --- preflight: describe the target -------------------------------------
  // The server must already exist (and be running) in this directory;
  // a missing server.properties means the directory is wrong — fail
  // before anything is written into it.
  const propertiesPath = path.join(serverDir, "server.properties");
  try {
    await fs.access(propertiesPath);
  } catch {
    throw new Error(
      `server.properties が見つかりません: ${propertiesPath}（--server-dir の指定を確認してください）`,
    );
  }
  const props = await readServerProperties(propertiesPath);
  const worldName = props.get("level-name") ?? "(不明)";
  const motd = props.get("motd") ?? "(なし)";

  humanStream.write(`サーバーディレクトリ: ${serverDir}\n`);
  humanStream.write(`ワールド: ${worldName}\n`);
  humanStream.write(`MOTD: ${motd}\n`);
  humanStream.write(`配置先: ${scriptsDir}\n`);

  if (!opts.yes) {
    if (process.stdout.isTTY !== true) {
      throw new Error("非対話環境で watch を実行するには --yes が必要です");
    }
    const answer = await prompt(humanStream, "続行しますか? [y/N] ");
    if (!/^y(es)?$/i.test(answer.trim())) {
      humanStream.write("中止しました\n");
      return 1;
    }
  }

  await fs.mkdir(pluginDir, { recursive: true });
  // buildProject creates outDir itself since phase 27 (a fresh
  // clone's build/verify run used to fail with ENOENT); the
  // pre-creation here is kept as a no-cost guard.
  await fs.mkdir(outDir, { recursive: true });

  // --- lock file ----------------------------------------------------------
  const existing = await readLock(lockPath);
  if (existing !== null) {
    if (isProcessAlive(existing.pid)) {
      throw new Error(
        `別の watch が同じサーバーで実行中です (pid ${existing.pid})。停止してから再実行してください`,
      );
    }
    humanStream.write(`古いロックを引き継ぎます (pid ${existing.pid} は停止済み)\n`);
  }
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), "utf8");

  // --- mutable loop state -------------------------------------------------
  let stopped = false;
  let finishing = false;
  let roundActive: Promise<void> | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  const pending = new Set<string>();
  let firstRound = true;
  let roundNumber = 0;
  let lastSuccessRound = 0;
  let consecutiveFailures = 0;
  let lastHashes: Map<string, string> | null = null;
  let tokenValue = 0;
  let watcher: FSWatcher | null = null;

  let resolveDone!: (code: number) => void;
  const done = new Promise<number>((resolve) => {
    resolveDone = resolve;
  });

  const cleanupFiles = async (): Promise<void> => {
    await removeIfExists(lockPath);
    await removeIfExists(tokenFile);
  };

  const onSignal = (): void => {
    void finish(0);
  };

  const finish = async (code: number): Promise<void> => {
    if (finishing) return;
    finishing = true;
    stopped = true;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watcher !== null) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      watcher = null;
    }
    // Wait for any in-flight round, then tear down. The server is left running.
    const active = roundActive;
    if (active !== null) {
      try {
        await active;
      } catch {
        /* ignore */
      }
    }
    humanStream.write(
      `\n最終成功ラウンド: #${lastSuccessRound} / 連続失敗: ${consecutiveFailures}\n`,
    );
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await cleanupFiles();
    resolveDone(code);
  };

  // --- one round ----------------------------------------------------------
  const runRound = async (): Promise<void> => {
    roundNumber += 1;
    const n = roundNumber;
    const isFirst = firstRound;
    firstRound = false;
    const changed = [...pending].sort();
    pending.clear();

    const startedAt = Date.now();
    const stageLog = createStageLog(reporter);

    // Bump the cache-busting token BEFORE buildProject imports user modules.
    tokenValue += 1;
    await fs.writeFile(tokenFile, String(tokenValue), "utf8");

    if (!opts.json) {
      const label = isFirst ? "初回" : changed.length > 0 ? changed.join(", ") : "なし";
      humanStream.write(`#${n} ${formatClock(startedAt)} 変更: ${label}\n`);
      if (isFirst) humanStream.write(`${SEMANTICS_WARNING}\n`);
    }

    const executeStages = async (): Promise<boolean> => {
      // --- 型チェック -----------------------------------------------------
      const typeStage = stageLog.begin("型チェック");
      let typeOk = false;
      try {
        const tc = runTypecheck(rootDir);
        typeOk = tc.ok;
        if (typeOk) typeStage.finish("passed");
        else typeStage.finish("failed", firstLine(tc.output) || "型チェック失敗");
      } catch (err) {
        typeStage.finish("failed", errMessage(err));
      }
      if (!typeOk) return false; // deploy is skipped on type errors

      // --- 変換 -----------------------------------------------------------
      const transformStage = stageLog.begin("変換");
      let build: BuildResult | null = null;
      try {
        build = await buildProject({
          rootDir,
          srcDir,
          outDir,
          ignore: IGNORED_SOURCES,
          onFile: (rel) => transformStage.update(rel),
        });
        transformStage.finish("passed");
      } catch (err) {
        transformStage.finish("failed", errMessage(err));
      }
      if (build === null) return false;
      for (const warning of build.warnings) humanStream.write(`${warning}\n`);

      // --- 配置 (with no-change detection) --------------------------------
      const deployStage = stageLog.begin("配置");
      const hashOutcome = await hashIrFiles(build.scripts).then(
        (map) => ({ ok: true as const, map }),
        (err: unknown) => ({ ok: false as const, err }),
      );
      if (!hashOutcome.ok) {
        deployStage.finish("failed", errMessage(hashOutcome.err));
        return false;
      }
      const hashes = hashOutcome.map;

      if (lastHashes !== null && irHashesEqual(lastHashes, hashes)) {
        // IR is byte-identical to what we last deployed: nothing to do.
        deployStage.finish("passed", "変更なし");
        const skipStage = stageLog.begin("読み込み確認");
        skipStage.finish("passed", "変更なし");
        return true;
      }

      try {
        const deployed = deployEngineScripts({
          scripts: build.scripts,
          engineScriptsDir: scriptsDir,
        });
        deployStage.finish(
          "passed",
          deployed.deployed.length > 0 ? `${deployed.deployed.length} 件配置` : undefined,
        );
        // Only remember what was deployed; failed deploys must be retried.
        lastHashes = hashes;
      } catch (err) {
        deployStage.finish("failed", errMessage(err));
        return false;
      }

      // --- 読み込み確認 ---------------------------------------------------
      const loadStage = stageLog.begin("読み込み確認");
      try {
        const result = await confirmReload(
          requestPath,
          statusPath,
          `watch-${process.pid}-${n}`,
          (detail) => loadStage.update(detail),
          () => stopped,
        );
        if (result.ok) {
          loadStage.finish("passed");
          return true;
        }
        loadStage.finish("failed", result.note);
        return false;
      } catch (err) {
        loadStage.finish("failed", errMessage(err));
        return false;
      }
    };

    let ok = false;
    try {
      ok = await executeStages();
    } catch (err) {
      humanStream.write(`ラウンド #${n} が失敗しました: ${errMessage(err)}\n`);
      ok = false;
    }

    if (ok) {
      lastSuccessRound = n;
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
    }

    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({
          round: n,
          startedAt,
          changedFiles: changed,
          ok,
          stages: stageLog.records,
        })}\n`,
      );
    }
  };

  // --- scheduling ---------------------------------------------------------
  const launchRound = (): void => {
    if (stopped || roundActive !== null) return;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const task = runRound();
    roundActive = task.then(
      () => undefined,
      (err: unknown) => {
        humanStream.write(`ラウンド失敗: ${errMessage(err)}\n`);
      },
    );
    void roundActive.then(() => {
      roundActive = null;
      if (stopped) {
        void finish(0);
        return;
      }
      // Events that arrived during the round get exactly one follow-up round.
      if (pending.size > 0) launchRound();
    });
  };

  const toWatchedRel = (filename: string | Buffer | null): string | null => {
    if (filename === null) return null;
    const raw = typeof filename === "string" ? filename : filename.toString("utf8");
    if (raw === "") return null;
    let rel = raw.replace(/\\/g, "/");
    if (path.isAbsolute(raw)) rel = path.relative(srcDir, raw).replace(/\\/g, "/");
    if (rel === "" || rel.startsWith("../")) return null;
    if (rel.endsWith(".d.ts")) return null;
    if (!rel.endsWith(".ts")) return null;
    const segments = rel.split("/");
    if (segments.includes("behavior") || segments.includes("node_modules")) return null;
    return rel;
  };

  const onFsEvent = (filename: string | Buffer | null): void => {
    if (stopped) return;
    const rel = toWatchedRel(filename);
    if (rel === null) return;
    pending.add(rel);
    if (roundActive !== null) return; // dirty: follow-up round runs after this one
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => {
        debounceTimer = null;
        launchRound();
      },
      Math.max(0, opts.debounceMs),
    );
  };

  // --- startup ------------------------------------------------------------
  try {
    if (opts.noEngineJar) {
      // The jar (and the Skript.jar disabling that comes with it) is
      // the operator's own business: watch only deploys IR and asks
      // for reloads. Feedback A3: startup used to overwrite the
      // running server's jar unconditionally.
      humanStream.write("エンジン jar は配置しません（--no-engine-jar）\n");
    } else {
      const installed = installEngine(rootDir, serverDir, {
        ...(opts.engineJar !== null ? { jarPath: opts.engineJar } : {}),
      });
      humanStream.write(`${installed.note}\n`);
    }

    // ESM cache busting: the loader hook appends the current token to every
    // file URL under the watched src root, so each round re-imports modules.
    await fs.writeFile(tokenFile, "0", "utf8");
    const rootPrefix = pathToFileURL(
      srcDir.endsWith(path.sep) ? srcDir : `${srcDir}${path.sep}`,
    ).href;
    register(new URL("./watch-hooks.mjs", import.meta.url), {
      data: { tokenFile, rootPrefix },
    });

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    watcher = watch(srcDir, { recursive: true });
    watcher.on("change", (_event, filename) => {
      onFsEvent(filename);
    });
    watcher.on("error", (err) => {
      humanStream.write(`監視エラー: ${errMessage(err)}\n`);
      void finish(1);
    });

    launchRound();
    return await done;
  } catch (err) {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (watcher !== null) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      watcher = null;
    }
    await cleanupFiles();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// stage logging
// ---------------------------------------------------------------------------

function createStageLog(reporter: ProgressReporter): StageLog {
  const records: StageRecord[] = [];
  return {
    records,
    begin(name: string): StageHandleWithLog {
      const handle = reporter.begin(name);
      const t0 = Date.now();
      let closed = false;
      return {
        update(detail: string): void {
          if (!closed) handle.update(detail);
        },
        finish(status: StageStatus, note?: string): void {
          if (closed) return;
          closed = true;
          handle.finish(status, note);
          const record: StageRecord = { name, status, durationMs: Date.now() - t0 };
          if (note !== undefined) record.note = note;
          records.push(record);
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// reload handshake
// ---------------------------------------------------------------------------

async function confirmReload(
  requestPath: string,
  statusPath: string,
  buildId: string,
  onDetail: (detail: string) => void,
  isAborted: () => boolean,
): Promise<{ ok: true } | { ok: false; note: string }> {
  const tmpPath = `${requestPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify({ buildId, requestedAt: Date.now() }), "utf8");
  await fs.rename(tmpPath, requestPath);

  const startedAt = Date.now();
  const deadline = startedAt + RELOAD_TIMEOUT_MS;

  for (;;) {
    if (isAborted()) return { ok: false, note: "中断" };
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, note: "タイムアウト: サーバーが起動していない可能性" };
    }
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(statusPath, "utf8"));
    } catch {
      // Missing file or a partially written status: retry.
      onDetail(`${Math.floor((Date.now() - startedAt) / 1000)}s`);
      continue;
    }

    const status = parseReloadStatus(parsed);
    if (status === null || status.buildId !== buildId) continue;

    if (status.ok) return { ok: true };
    const note =
      status.failed.length > 0 ? `読み込み失敗: ${status.failed.join(", ")}` : "読み込み失敗";
    return { ok: false, note };
  }
}

function parseReloadStatus(value: unknown): ReloadStatus | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.buildId !== "string" || typeof v.ok !== "boolean") return null;
  const failed = Array.isArray(v.failed)
    ? v.failed.filter((x): x is string => typeof x === "string")
    : [];
  return { buildId: v.buildId, ok: v.ok, failed };
}

// ---------------------------------------------------------------------------
// hashing / file helpers
// ---------------------------------------------------------------------------

async function hashIrFiles(scripts: readonly BuiltScript[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const script of scripts) {
    const bytes = await fs.readFile(script.irPath);
    out.set(script.irRel, createHash("sha256").update(bytes).digest("hex"));
  }
  return out;
}

async function readServerProperties(file: string): Promise<Map<string, string>> {
  const props = new Map<string, string>();
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return props;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key !== "") props.set(key, value);
  }
  return props;
}

async function readLock(file: string): Promise<WatchLock | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const v = parsed as Record<string, unknown>;
    if (typeof v.pid !== "number" || !Number.isInteger(v.pid) || v.pid <= 0) return null;
    return { pid: v.pid, startedAt: typeof v.startedAt === "number" ? v.startedAt : 0 };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we may not signal it.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeIfExists(file: string): Promise<void> {
  try {
    await fs.unlink(file);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number): string => String(v).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
  }
  return "";
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prompt(output: NodeJS.WriteStream, question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
