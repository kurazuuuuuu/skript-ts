import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Resolution of the CLI's own toolchain (tsx, TypeScript) — always
 * anchored at THIS package, never at the caller's working directory.
 *
 * Feedback A2: the CLI used to leak its dependencies into consumer
 * projects. `node --import tsx` resolved the bare specifier from
 * the current directory, and the typecheck resolved `typescript`
 * from the project root, so a consumer had to install tsx and
 * typescript in their own project just to launch the CLI — and the
 * eager mineflayer import (see behavior.ts, now lazy) forced a full
 * install of the skript-ts package even for `watch`. The rule now:
 * the toolchain lives in the skript-ts package's own node_modules
 * (installed once, in the tool's own home), and consumers need no
 * skript-ts dependencies of their own.
 */

/** Absolute path of the skript-ts package root (this file lives in src/cli/). */
export function packageRootDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const packageRequire = createRequire(join(packageRootDir(), "package.json"));

/**
 * File URL of the tsx loader inside this package's node_modules,
 * for `node --import <url>`. Resolving the bare specifier "tsx"
 * instead would consult the caller's working directory (Node
 * resolves --import specifiers from the CWD), which is exactly the
 * A2 leak. Throws an actionable error when the package's own
 * dependencies have not been installed yet.
 */
export function tsxLoaderUrl(): string {
  try {
    return pathToFileURL(packageRequire.resolve("tsx")).href;
  } catch {
    throw new Error(
      "tsx が skript-ts パッケージ内に見つかりません。" +
        `依存をインストールしてください: (cd ${packageRootDir()} && pnpm install)`,
    );
  }
}

/**
 * Absolute path of the TypeScript compiler entry (typescript/bin/tsc).
 * The package's own copy wins; a project-local copy is the fallback
 * so a consumer who pins their own TypeScript keeps working.
 */
export function typescriptBinPath(projectRoot: string): string {
  try {
    return packageRequire.resolve("typescript/bin/tsc");
  } catch {
    // fall through to the project-local copy
  }
  try {
    return createRequire(join(projectRoot, "package.json")).resolve("typescript/bin/tsc");
  } catch {
    throw new Error(
      "typescript が見つかりません。skript-ts パッケージ側で依存をインストールしてください: " +
        `(cd ${packageRootDir()} && pnpm install)`,
    );
  }
}
