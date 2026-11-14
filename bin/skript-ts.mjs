#!/usr/bin/env node
// Launcher for the skript-ts CLI, in two modes:
// - Published install: run the prebuilt CLI from dist/cli.js
//   with plain node (prepack builds dist before packing).
// - Source checkout without a build: run the TypeScript
//   entry point through the tsx loader. The loader is
//   resolved from THIS package (createRequire anchored at
//   the launcher file), never from the caller's working
//   directory — `node --import tsx` would resolve the bare
//   specifier from the CWD and force every consumer project
//   to install tsx itself (feedback A2). Either way the CLI
//   can be launched from any directory; the only install it
//   needs is this package's own.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const distCli = join(root, "dist", "cli.js");
let res;
if (existsSync(distCli)) {
  res = spawnSync(process.execPath, [distCli, ...args], { stdio: "inherit" });
} else {
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
  res = spawnSync(process.execPath, ["--import", tsxLoader, join(root, "src", "cli.ts"), ...args], {
    stdio: "inherit",
  });
}
if (res.error) {
  console.error(`failed to launch skript-ts CLI: ${res.error.message}`);
  process.exit(2);
}
process.exit(res.status ?? 1);
