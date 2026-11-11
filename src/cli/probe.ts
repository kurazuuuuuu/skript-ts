/**
 * Client operations for the resident probe server (see probe-host.ts
 * for the daemon side and the state-directory contract). The probe
 * server keeps the Paper sandbox booted across probe rounds: a round
 * swaps the hand-written .sk files in the Skript scripts folder and
 * runs `skript reload all` instead of rebooting.
 */
import { spawn } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SkriptLogParser, type SkriptParseError } from "./skript-log.js";

export type { SkriptParseError } from "./skript-log.js";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function probeStateDir(serverDir: string): string {
  return join(serverDir, ".probe");
}

export interface ProbeState {
  stateDir: string;
  hostPid: number | null;
  serverPid: number | null;
  /** True while the host (daemon) process is alive. */
  running: boolean;
  /** True when the host is alive and the server finished booting. */
  ready: boolean;
}

function pidAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readPidFile(path: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function readProbeState(serverDir: string): ProbeState {
  const stateDir = probeStateDir(serverDir);
  const hostPid = readPidFile(join(stateDir, "host.pid"));
  const serverPid = readPidFile(join(stateDir, "server.pid"));
  const running = pidAlive(hostPid);
  return {
    stateDir,
    hostPid,
    serverPid,
    running,
    ready: running && existsSync(join(stateDir, "ready")),
  };
}

async function waitForCondition(
  fn: () => boolean,
  timeoutMs: number,
  pollMs = 200,
): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - t0 >= timeoutMs) return false;
    await sleep(pollMs);
  }
}

async function waitForPidDeath(pid: number, timeoutMs: number): Promise<boolean> {
  return waitForCondition(() => !pidAlive(pid), timeoutMs, 200);
}

function readLogLines(stateDir: string): string[] {
  const path = join(stateDir, "server.log");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

interface ProbeResponse {
  ok: boolean;
  error?: string;
}

/** Send one request to the host and wait for its response file. */
async function sendRequest(
  stateDir: string,
  request: { type: "command"; command: string } | { type: "stop" },
  timeoutMs = 30_000,
): Promise<ProbeResponse> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(join(stateDir, "requests", `${id}.json`), JSON.stringify(request) + "\n", "utf8");
  const responsePath = join(stateDir, "responses", `${id}.json`);
  const found = await waitForCondition(() => existsSync(responsePath), timeoutMs, 100);
  if (!found) throw new Error(`プローブホストが ${timeoutMs}ms 以内に応答しませんでした`);
  const parsed = JSON.parse(readFileSync(responsePath, "utf8")) as ProbeResponse;
  return parsed;
}

const WORLD_DIRS = ["world", "world_nether", "world_the_end"];

/** Remove session.lock files under the sandbox worlds; returns the removed paths. */
function removeStaleSessionLocks(serverDir: string): string[] {
  const removed: string[] = [];
  for (const world of WORLD_DIRS) {
    const lock = join(serverDir, world, "session.lock");
    if (existsSync(lock)) {
      rmSync(lock);
      removed.push(join(world, "session.lock"));
    }
  }
  return removed;
}

export async function startProbeServer(opts: {
  rootDir: string;
  serverDir: string;
  javaPath: string;
  bootTimeoutMs?: number;
}): Promise<{ bootMs: number; hostPid: number; serverPid: number | null; reclaimed: string[] }> {
  const { rootDir, serverDir, javaPath } = opts;
  const stateDir = probeStateDir(serverDir);
  const reclaimed: string[] = [];

  if (existsSync(stateDir)) {
    const state = readProbeState(serverDir);
    if (state.running) {
      throw new Error(
        `プローブサーバーは既に起動しています (host pid ${state.hostPid})。先に probe stop を実行してください`,
      );
    }
    // Stale state from a crashed host: reclaim the sandbox. A leftover
    // Java process is only killed when its cmdline proves it is the
    // sandbox server; an unrelated process that reused the PID is
    // never touched.
    if (state.serverPid !== null && pidAlive(state.serverPid)) {
      let cmdline = "";
      try {
        cmdline = readFileSync(`/proc/${state.serverPid}/cmdline`, "utf8");
      } catch {
        cmdline = "";
      }
      if (cmdline.includes("paper.jar")) {
        process.kill(state.serverPid, "SIGTERM");
        if (!(await waitForPidDeath(state.serverPid, 10_000))) {
          process.kill(state.serverPid, "SIGKILL");
          await waitForPidDeath(state.serverPid, 5_000);
        }
        reclaimed.push(`残留サーバープロセス ${state.serverPid} を終了しました`);
      } else {
        reclaimed.push(`別プロセスが pid ${state.serverPid} を使用中のため終了しませんでした`);
      }
    }
    for (const rel of removeStaleSessionLocks(serverDir)) {
      reclaimed.push(`古い session.lock を除去しました: ${rel}`);
    }
    rmSync(stateDir, { recursive: true, force: true });
  }

  mkdirSync(stateDir, { recursive: true });
  const hostLogFd = openSync(join(stateDir, "host.log"), "a");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(rootDir, "src", "cli", "probe-host.ts"),
      "--state-dir",
      stateDir,
      "--server-dir",
      serverDir,
      "--java",
      javaPath,
    ],
    { cwd: rootDir, detached: true, stdio: ["ignore", hostLogFd, hostLogFd] },
  );
  child.unref();
  closeSync(hostLogFd);
  const hostPid = child.pid;
  if (hostPid === undefined) throw new Error("プローブホストの起動に失敗しました");

  const readyPath = join(stateDir, "ready");
  const booted = await waitForCondition(
    () => existsSync(readyPath) || !pidAlive(hostPid),
    opts.bootTimeoutMs ?? 240_000,
    250,
  );
  if (!booted || !existsSync(readyPath)) {
    let tail = "";
    try {
      tail = readFileSync(join(stateDir, "host.log"), "utf8").split("\n").slice(-20).join("\n");
    } catch {
      tail = "";
    }
    throw new Error(`プローブサーバーの起動を確認できませんでした。host.log 末尾:\n${tail}`);
  }
  const ready = JSON.parse(readFileSync(readyPath, "utf8")) as {
    bootMs: number;
    serverPid: number | null;
  };
  return { bootMs: ready.bootMs, hostPid, serverPid: ready.serverPid, reclaimed };
}

const RELOAD_DONE = /Successfully reloaded the config|Encountered \d+ errors? while reloading/;

export async function runProbeRound(opts: {
  serverDir: string;
  probeDir: string;
  commandsFile?: string;
  outFile?: string;
  paceMs?: number;
  settleMs?: number;
  reloadTimeoutMs?: number;
  onUpdate?: (detail: string) => void;
}): Promise<{
  reloadMs: number;
  durationMs: number;
  lines: string[];
  errors: SkriptParseError[];
  outFile: string;
  commandCount: number;
}> {
  const t0 = Date.now();
  const paceMs = opts.paceMs ?? 1000;
  const settleMs = opts.settleMs ?? 3000;
  const state = readProbeState(opts.serverDir);
  if (!state.running) {
    throw new Error("プローブサーバーが起動していません。先に probe start を実行してください");
  }
  const { stateDir } = state;

  // Swap the probe scripts: remove every top-level .sk in the scripts
  // folder, then copy this round's probe files in (same discipline as
  // the ad-hoc phase probe drivers; `verify` redeploys its own set).
  opts.onUpdate?.("プローブ配置");
  const scriptsDir = join(opts.serverDir, "plugins", "Skript", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  for (const f of readdirSync(scriptsDir)) {
    if (f.endsWith(".sk")) rmSync(join(scriptsDir, f));
  }
  const probeFiles = readdirSync(opts.probeDir)
    .filter((f) => f.endsWith(".sk"))
    .sort();
  if (probeFiles.length === 0) {
    throw new Error(`プローブファイル (.sk) が ${opts.probeDir} にありません`);
  }
  for (const f of probeFiles) {
    copyFileSync(join(opts.probeDir, f), join(scriptsDir, f));
  }

  const mark = readLogLines(stateDir).length;

  opts.onUpdate?.("skript reload all");
  const reloadStart = Date.now();
  const ack = await sendRequest(stateDir, { type: "command", command: "skript reload all" });
  if (!ack.ok) throw new Error(`リロードコマンドの送信に失敗しました: ${ack.error ?? "unknown"}`);
  const reloaded = await waitForCondition(
    () =>
      readLogLines(stateDir)
        .slice(mark)
        .some((l) => RELOAD_DONE.test(l)),
    opts.reloadTimeoutMs ?? 180_000,
    200,
  );
  if (!reloaded) throw new Error("リロード完了を確認できませんでした");
  const reloadMs = Date.now() - reloadStart;

  // Let `on load` triggers settle before driving console commands.
  await sleep(1500);

  let commandCount = 0;
  if (opts.commandsFile !== undefined) {
    const commands = readFileSync(opts.commandsFile, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    for (const cmd of commands) {
      opts.onUpdate?.(cmd);
      const res = await sendRequest(stateDir, { type: "command", command: cmd });
      if (!res.ok)
        throw new Error(`コマンド ${cmd} の送信に失敗しました: ${res.error ?? "unknown"}`);
      commandCount++;
      await sleep(paceMs);
    }
  }
  await sleep(settleMs);

  const lines = readLogLines(stateDir).slice(mark);
  const parser = new SkriptLogParser();
  for (const line of lines) parser.feed(line);
  const outFile = opts.outFile ?? join(stateDir, "last-run.log");
  writeFileSync(outFile, lines.join("\n") + "\n", "utf8");
  return {
    reloadMs,
    durationMs: Date.now() - t0,
    lines,
    errors: parser.errors,
    outFile,
    commandCount,
  };
}

export async function stopProbeServer(opts: {
  serverDir: string;
}): Promise<{ wasRunning: boolean; notes: string[] }> {
  const serverDir = opts.serverDir;
  const stateDir = probeStateDir(serverDir);
  if (!existsSync(stateDir)) {
    return { wasRunning: false, notes: ["プローブサーバーは起動していません"] };
  }
  const notes: string[] = [];
  const state = readProbeState(serverDir);
  const wasRunning = state.running || pidAlive(state.serverPid);

  if (state.hostPid !== null && pidAlive(state.hostPid)) {
    try {
      await sendRequest(stateDir, { type: "stop" }, 15_000);
    } catch {
      // The host may die mid-stop before answering; the death polls
      // below are the source of truth.
    }
    if (!(await waitForPidDeath(state.hostPid, 180_000))) {
      process.kill(state.hostPid, "SIGKILL");
      await waitForPidDeath(state.hostPid, 5_000);
      notes.push("応答しないホストプロセスを強制終了しました");
    }
  }
  if (state.serverPid !== null && pidAlive(state.serverPid)) {
    process.kill(state.serverPid, "SIGTERM");
    if (!(await waitForPidDeath(state.serverPid, 10_000))) {
      process.kill(state.serverPid, "SIGKILL");
      await waitForPidDeath(state.serverPid, 5_000);
    }
    notes.push(`サーバープロセス ${state.serverPid} を終了しました`);
  }

  // Never claim success while a process survives.
  if (state.hostPid !== null && pidAlive(state.hostPid)) {
    throw new Error(`ホストプロセス ${state.hostPid} を終了できませんでした`);
  }
  if (state.serverPid !== null && pidAlive(state.serverPid)) {
    throw new Error(`サーバープロセス ${state.serverPid} を終了できませんでした`);
  }
  if (state.hostPid !== null) notes.push("ホストプロセスの終了を確認");
  if (state.serverPid !== null) notes.push("サーバープロセスの終了を確認");

  // The server process is confirmed dead, so any remaining lock file
  // is stale by definition.
  for (const rel of removeStaleSessionLocks(serverDir)) {
    notes.push(`session.lock を除去しました: ${rel}`);
  }
  // Remove the probe scripts this session deployed, so a later
  // `verify` run starts from a clean scripts folder (it redeploys its
  // own set on every run).
  const scriptsDir = join(serverDir, "plugins", "Skript", "scripts");
  if (existsSync(scriptsDir)) {
    let removedScripts = 0;
    for (const f of readdirSync(scriptsDir)) {
      if (f.endsWith(".sk")) {
        rmSync(join(scriptsDir, f));
        removedScripts++;
      }
    }
    if (removedScripts > 0) {
      notes.push(`プローブスクリプト ${removedScripts} 件を scripts フォルダから除去しました`);
    }
  }
  rmSync(stateDir, { recursive: true, force: true });
  notes.push("状態ディレクトリを削除しました");
  return { wasRunning, notes };
}
