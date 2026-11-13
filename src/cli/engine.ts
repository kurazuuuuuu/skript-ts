import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { packageRootDir } from "./toolchain.js";

/**
 * Server plugin-set management for the two verify modes.
 *
 * - Skript mode: `plugins/Skript.jar` present, no `skript-ts.jar`.
 * - Engine mode: `plugins/skript-ts.jar` present (copied from
 *   `engine/build/skript-ts.jar`), and the real Skript plugin renamed
 *   aside so the sandbox runs *without* Skript at all.
 *
 * Both directions are applied deterministically before every verify,
 * so the mode of the previous run never leaks into the next one.
 * Running both engines at once would execute every script twice and
 * make behavior tests meaningless, which is why this is strict.
 */

/** Suffix appended to Skript.jar while engine mode owns the plugins folder. */
export const SKRIPT_DISABLED_SUFFIX = ".skript-ts-disabled";

/**
 * PlaceholderAPI jar (phase 10): the engine's placeholder bridge
 * soft-depends on the PlaceholderAPI plugin, so engine mode deploys
 * the checksum-pinned jar from `engine/libs/` (fetched by
 * `engine/fetch-libs.sh`) next to the engine jar. The pin is
 * re-verified at deploy time (see `verifyPinnedJar`), so a jar
 * whose bits changed after fetching never reaches the sandbox.
 * Skript mode never deploys it, keeping that sandbox's plugin set
 * unchanged. The file name inside the sandbox is fixed so
 * install/uninstall stay exact.
 */
export const PAPI_LIBS_JAR = "PlaceholderAPI-2.12.3.jar";
export const PAPI_SANDBOX_JAR = "PlaceholderAPI.jar";

export interface PluginSetResult {
  /** Human-readable description of what changed ("" when already in the target state). */
  note: string;
}

/** Built engine jar location, relative to the project root. */
export function engineJarPath(rootDir: string): string {
  return join(rootDir, "engine", "build", "skript-ts.jar");
}

/**
 * Engine directories consulted for the built jar and the pinned
 * libs, in order: the project root first (the contributor flow,
 * where the project IS skript-ts), then the skript-ts package
 * itself. The package fallback is what lets a consumer project use
 * the CLI from a submodule checkout without bridge-copying the jar
 * into its own root (feedback A3).
 */
function engineDirCandidates(rootDir: string): string[] {
  const project = join(rootDir, "engine");
  const packaged = join(packageRootDir(), "engine");
  return project === packaged ? [project] : [project, packaged];
}

/**
 * Which engine jar to deploy. An explicit path (the CLI's
 * --engine-jar) always wins; otherwise the first existing jar in
 * the candidate order above. When nothing is built yet, the
 * project-conventional path is returned so the caller's error
 * message names the documented location.
 */
export function resolveEngineJar(rootDir: string, explicit?: string): string {
  if (explicit !== undefined) return explicit;
  for (const dir of engineDirCandidates(rootDir)) {
    const candidate = join(dir, "build", "skript-ts.jar");
    if (existsSync(candidate)) return candidate;
  }
  return engineJarPath(rootDir);
}

/** The pinned PlaceholderAPI jar, under the same candidate order; null when absent. */
export function resolvePapiLib(rootDir: string): string | null {
  for (const dir of engineDirCandidates(rootDir)) {
    const candidate = join(dir, "libs", PAPI_LIBS_JAR);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface InstallEngineOptions {
  /** Explicit engine jar path (--engine-jar); wins over every default location. */
  jarPath?: string;
}

/**
 * Re-verify a jar in `engine/libs/` against the SHA-512 pinned next
 * to it (`<jar>.sha512`, the same pin `engine/fetch-libs.sh` checks
 * after downloading). Fetching verified the bits once; this catches
 * anything that changed them afterwards — a truncated copy, a
 * manual replacement, the wrong version dropped in — before the
 * jar is deployed into the sandbox. Throws on a missing pin or a
 * mismatch; the pin file holds the bare hex digest (a trailing
 * `sha512sum`-style file name is tolerated).
 */
export function verifyPinnedJar(jarPath: string): void {
  const pinPath = `${jarPath}.sha512`;
  if (!existsSync(pinPath)) {
    throw new Error(
      `cannot deploy ${basename(jarPath)}: pinned checksum file ${pinPath} is missing — restore it with engine/fetch-libs.sh`,
    );
  }
  const expected = readFileSync(pinPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash("sha512").update(readFileSync(jarPath)).digest("hex");
  if (expected !== actual) {
    throw new Error(
      `SHA-512 mismatch for ${basename(jarPath)} — refusing to deploy an unverified jar\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `  (pin: ${pinPath}; re-fetch with engine/fetch-libs.sh if the jar is stale)`,
    );
  }
}

/** Put the server into engine mode: install skript-ts.jar, disable Skript.jar. */
export function installEngine(
  rootDir: string,
  serverDir: string,
  opts: InstallEngineOptions = {},
): PluginSetResult {
  const built = resolveEngineJar(rootDir, opts.jarPath);
  if (!existsSync(built)) {
    throw new Error(
      `engine jar not found at ${built} — build it first with engine/build.sh (see README)`,
    );
  }
  // Verify the PlaceholderAPI pin before touching the plugin set,
  // so a bad jar fails the run with the sandbox exactly as it was.
  const papiLib = resolvePapiLib(rootDir);
  if (papiLib !== null) verifyPinnedJar(papiLib);
  const pluginsDir = join(serverDir, "plugins");
  const changes: string[] = [];
  const skriptJar = join(pluginsDir, "Skript.jar");
  const skriptDisabled = skriptJar + SKRIPT_DISABLED_SUFFIX;
  if (existsSync(skriptJar)) {
    if (existsSync(skriptDisabled)) rmSync(skriptDisabled);
    renameSync(skriptJar, skriptDisabled);
    changes.push("Skript.jar を無効化");
  }
  copyFileSync(built, join(pluginsDir, "skript-ts.jar"));
  changes.push("skript-ts.jar を配置");
  if (papiLib !== null) {
    copyFileSync(papiLib, join(pluginsDir, PAPI_SANDBOX_JAR));
    changes.push("PlaceholderAPI.jar を配置");
  } else {
    changes.push("PlaceholderAPI.jar が engine/libs に無いためプレースホルダ機能は無効");
  }
  return { note: changes.join("、") };
}

/** Put the server back into Skript mode: remove skript-ts.jar, restore Skript.jar. */
export function uninstallEngine(rootDir: string, serverDir: string): PluginSetResult {
  void rootDir;
  const pluginsDir = join(serverDir, "plugins");
  const changes: string[] = [];
  const engineJar = join(pluginsDir, "skript-ts.jar");
  if (existsSync(engineJar)) {
    rmSync(engineJar);
    changes.push("skript-ts.jar を除去");
  }
  const papiJar = join(pluginsDir, PAPI_SANDBOX_JAR);
  if (existsSync(papiJar)) {
    rmSync(papiJar);
    changes.push("PlaceholderAPI.jar を除去");
  }
  const skriptJar = join(pluginsDir, "Skript.jar");
  const skriptDisabled = skriptJar + SKRIPT_DISABLED_SUFFIX;
  if (!existsSync(skriptJar) && existsSync(skriptDisabled)) {
    renameSync(skriptDisabled, skriptJar);
    changes.push("Skript.jar を復帰");
  }
  return { note: changes.join("、") };
}
