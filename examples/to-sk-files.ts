// Writes the emitted .sk source of every sample program into the local
// Paper test server's Skript scripts folder (server/ is gitignored).
// Run with: pnpm exec tsx examples/to-sk-files.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emit } from "../src/index.js";
import { welcomeScript } from "./welcome.js";
import { kitScript } from "./kit.js";
import { chatLogScript } from "./chatlog.js";
import { deathScript } from "./death.js";
import { spawnScript } from "./spawn.js";

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "server",
  "plugins",
  "Skript",
  "scripts",
);
mkdirSync(outDir, { recursive: true });

const samples = {
  welcome: welcomeScript,
  kit: kitScript,
  chatlog: chatLogScript,
  death: deathScript,
  spawn: spawnScript,
} as const;

for (const [name, prog] of Object.entries(samples)) {
  const path = join(outDir, `${name}.sk`);
  writeFileSync(path, emit(prog), "utf8");
  console.log(`wrote ${path}`);
}
