#!/usr/bin/env node
// Launcher for the skript-ts CLI: runs the TypeScript entry point
// through the tsx loader. Run it from the skript-ts project root.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = spawnSync(
  process.execPath,
  ["--import", "tsx", join(root, "src", "cli.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (res.error) {
  console.error(`failed to launch skript-ts CLI: ${res.error.message}`);
  process.exit(2);
}
process.exit(res.status ?? 1);
