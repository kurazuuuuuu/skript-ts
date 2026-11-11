/**
 * Resident probe host: a long-lived daemon that owns the Paper sandbox
 * server so later CLI invocations (`skript-ts probe run`) can iterate
 * probe scripts via `skript reload all` instead of rebooting.
 *
 *   probe-host --state-dir <dir> --server-dir <dir> --java <path>
 *
 * All communication with the CLI goes through the state directory:
 *   server.log          every server console line, appended
 *   host.pid/server.pid PID files for liveness checks
 *   ready               JSON { bootMs, serverPid }, written after boot
 *   stopped.json        written when the server has been stopped
 *   requests/<id>.json  { type: "command", command } | { type: "stop" }
 *   responses/<id>.json { ok: boolean, error?: string }
 *
 * The host is the only process that talks to the server's stdin, and it
 * always stops the server before exiting (console stop, then signals),
 * so a dead host never leaves a Java process holding the world lock.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxServer } from "./server.js";

function parseArgs(argv: string[]): { stateDir: string; serverDir: string; javaPath: string } {
  const out = { stateDir: "", serverDir: "", javaPath: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const value = argv[++i];
    if (value === undefined) throw new Error(`missing value for ${arg}`);
    switch (arg) {
      case "--state-dir": out.stateDir = value; break;
      case "--server-dir": out.serverDir = value; break;
      case "--java": out.javaPath = value; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  if (out.stateDir === "" || out.serverDir === "" || out.javaPath === "") {
    throw new Error("probe-host requires --state-dir, --server-dir and --java");
  }
  return out;
}

async function main(): Promise<void> {
  const { stateDir, serverDir, javaPath } = parseArgs(process.argv.slice(2));
  const requestsDir = join(stateDir, "requests");
  const responsesDir = join(stateDir, "responses");
  mkdirSync(requestsDir, { recursive: true });
  mkdirSync(responsesDir, { recursive: true });
  writeFileSync(join(stateDir, "host.pid"), `${process.pid}\n`, "utf8");

  const logStream = createWriteStream(join(stateDir, "server.log"), { flags: "a" });
  const server = new SandboxServer({
    serverDir,
    javaPath,
    onLine: (line) => {
      if (line !== "") logStream.write(line + "\n");
    },
  });

  let shuttingDown = false;
  const removePidFiles = (): void => {
    for (const name of ["host.pid", "server.pid"]) {
      const p = join(stateDir, name);
      if (existsSync(p)) rmSync(p);
    }
  };
  const writeStopped = (data: Record<string, unknown>): void => {
    try {
      writeFileSync(join(stateDir, "stopped.json"), JSON.stringify(data) + "\n", "utf8");
    } catch {
      // State dir may already be gone; nothing more to do.
    }
  };

  const shutdown = async (via: "request" | "signal"): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    await server.stop(60_000);
    writeStopped({ stopped: true, via });
    removePidFiles();
    logStream.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("signal"));
  process.on("SIGINT", () => void shutdown("signal"));

  const startedAt = Date.now();
  server.start();
  const serverPid = server.pid;
  if (serverPid !== null) {
    writeFileSync(join(stateDir, "server.pid"), `${serverPid}\n`, "utf8");
  }

  void server.waitForLine(/Done \([0-9.]+s\)!/, 240_000).then(
    () => {
      writeFileSync(
        join(stateDir, "ready"),
        JSON.stringify({ bootMs: Date.now() - startedAt, serverPid }) + "\n",
        "utf8",
      );
    },
    (err: unknown) => {
      // Boot failed or the server died during boot: stop whatever is
      // left, record the failure, and exit nonzero.
      void (async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        clearInterval(timer);
        await server.stop(30_000);
        writeStopped({ unexpected: true, reason: err instanceof Error ? err.message : String(err) });
        removePidFiles();
        logStream.end();
        process.exit(1);
      })();
    },
  );

  const processed = new Set<string>();
  const writeResponse = (id: string, data: Record<string, unknown>): void => {
    writeFileSync(join(responsesDir, `${id}.json`), JSON.stringify(data) + "\n", "utf8");
  };
  const handleRequest = (id: string, raw: string): void => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      writeResponse(id, { ok: false, error: "unparseable request" });
      return;
    }
    const req = parsed as { type?: unknown; command?: unknown };
    if (req.type === "stop") {
      writeResponse(id, { ok: true });
      void shutdown("request");
      return;
    }
    if (req.type === "command" && typeof req.command === "string") {
      try {
        server.sendCommand(req.command);
        writeResponse(id, { ok: true });
      } catch (err) {
        writeResponse(id, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    writeResponse(id, { ok: false, error: "unknown request type" });
  };

  const timer = setInterval(() => {
    if (shuttingDown) return;
    // Unexpected server exit: record it and leave; the CLI's stop path
    // verifies that no process survives before removing the state.
    if (!server.running) {
      shuttingDown = true;
      clearInterval(timer);
      writeStopped({ unexpected: true, reason: "server exited" });
      removePidFiles();
      logStream.end();
      process.exit(1);
    }
    let names: string[];
    try {
      names = readdirSync(requestsDir).filter((f) => f.endsWith(".json")).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const id = name.slice(0, -".json".length);
      if (processed.has(id)) continue;
      processed.add(id);
      let raw: string;
      try {
        raw = readFileSync(join(requestsDir, name), "utf8");
      } catch {
        continue;
      }
      handleRequest(id, raw);
      if (shuttingDown) break;
    }
  }, 100);
  timer.unref();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
