#!/usr/bin/env node
// Launcher for the skript-ts CLI: runs the TypeScript entry point
// through the tsx loader. The loader is resolved from THIS package
// (createRequire anchored at the launcher file), never from the
// caller's working directory — `node --import tsx` would resolve
// the bare specifier from the CWD and force every consumer project
// to install tsx itself (feedback A2). The CLI can therefore be
// launched from any directory; the only install it needs is this
// package's own.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let tsxLoader;
try {
  tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
} catch {
  console.error(
    "failed to launch skript-ts CLI: tsx not found in this package — " +
      `run \`pnpm install\` in ${root} first`,
  );
  process.exit(2);
}
const res = spawnSync(
  process.execPath,
  ["--import", tsxLoader, join(root, "src", "cli.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (res.error) {
  console.error(`failed to launch skript-ts CLI: ${res.error.message}`);
  process.exit(2);
}
process.exit(res.status ?? 1);
