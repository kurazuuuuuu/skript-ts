import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

export interface SandboxServerOptions {
  /** Directory containing paper.jar and the server data files. */
  serverDir: string;
  /** Java executable to run. */
  javaPath: string;
  /** Server jar file name inside serverDir. Default "paper.jar". */
  jarName?: string;
  /** Max heap passed as -Xmx. Default "1G". */
  maxHeap?: string;
  /** Called for every output line (stdout and stderr merged). */
  onLine?: (line: string) => void;
}

interface Waiter {
  re: RegExp;
  fromIndex: number;
  resolve: (match: RegExpMatchArray) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Controls the throwaway Paper sandbox server as a child process:
 * spawn with piped stdin/stdout, wait for log patterns, send console
 * commands, and stop gracefully (escalating to signals on timeout).
 */
export class SandboxServer {
  private proc: ChildProcess | null = null;
  private readonly lines: string[] = [];
  private waiters: Waiter[] = [];
  private exitInfo: { code: number | null; signal: string | null } | null = null;
  private exitWaiters: ((info: { code: number | null; signal: string | null }) => void)[] = [];

  constructor(private readonly opts: SandboxServerOptions) {}

  get running(): boolean {
    return this.proc !== null && this.exitInfo === null;
  }

  /** Current number of buffered log lines; pass to waitForLine as fromIndex to only see future lines. */
  mark(): number {
    return this.lines.length;
  }

  get logLines(): readonly string[] {
    return this.lines;
  }

  /** Last lines of the server log, for failure diagnostics. */
  tail(count: number): string {
    return this.lines.slice(-count).join("\n");
  }

  start(): void {
    if (this.proc !== null) throw new Error("server already started");
    const jar = this.opts.jarName ?? "paper.jar";
    const heap = this.opts.maxHeap ?? "1G";
    const proc = spawn(this.opts.javaPath, [`-Xmx${heap}`, "-jar", jar, "nogui"], {
      cwd: this.opts.serverDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    for (const stream of [proc.stdout, proc.stderr]) {
      if (stream === null) continue;
      createInterface({ input: stream }).on("line", (line) => {
        if (line !== "") this.pushLine(line);
      });
    }
    proc.on("exit", (code, signal) => {
      this.exitInfo = { code, signal };
      const waiters = this.exitWaiters;
      this.exitWaiters = [];
      for (const w of waiters) w(this.exitInfo);
      for (const w of this.waiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new Error(`server exited (code=${code}, signal=${signal}) while waiting for ${w.re}`));
      }
    });
    proc.on("error", (err) => {
      for (const w of this.waiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(err);
      }
    });
  }

  private pushLine(line: string): void {
    this.lines.push(line);
    this.opts.onLine?.(line);
    const idx = this.lines.length - 1;
    this.waiters = this.waiters.filter((w) => {
      if (idx < w.fromIndex) return true;
      const m = w.re.exec(line);
      if (m === null) return true;
      clearTimeout(w.timer);
      w.resolve(m);
      return false;
    });
  }

  /** Resolve with the first match at or after fromIndex, scanning buffered lines first. */
  waitForLine(re: RegExp, timeoutMs: number, fromIndex = 0): Promise<RegExpMatchArray> {
    for (let i = fromIndex; i < this.lines.length; i++) {
      const m = re.exec(this.lines[i] as string);
      if (m !== null) return Promise.resolve(m);
    }
    if (this.exitInfo !== null) {
      return Promise.reject(
        new Error(`server already exited (code=${this.exitInfo.code}) while waiting for ${re}`),
      );
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`timed out after ${timeoutMs}ms waiting for ${re}`));
      }, timeoutMs);
      timer.unref();
      this.waiters.push({ re, fromIndex, resolve, reject, timer });
    });
  }

  /** Send a console command to the server's stdin. */
  sendCommand(command: string): void {
    if (!this.running || this.proc?.stdin == null) {
      throw new Error("server is not running");
    }
    this.proc.stdin.write(command + "\n");
  }

  private waitExit(timeoutMs: number): Promise<boolean> {
    if (this.exitInfo !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref();
      this.exitWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /** Stop the server: console `stop` first, then SIGTERM, then SIGKILL. */
  async stop(timeoutMs = 120_000): Promise<void> {
    if (this.proc === null || this.exitInfo !== null) return;
    try {
      this.sendCommand("stop");
    } catch {
      // stdin already closed; fall through to signals.
    }
    if (await this.waitExit(timeoutMs)) return;
    this.proc.kill("SIGTERM");
    if (await this.waitExit(15_000)) return;
    this.proc.kill("SIGKILL");
    await this.waitExit(10_000);
  }
}
