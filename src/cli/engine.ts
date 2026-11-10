import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

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

export interface PluginSetResult {
  /** Human-readable description of what changed ("" when already in the target state). */
  note: string;
}

/** Built engine jar location, relative to the project root. */
export function engineJarPath(rootDir: string): string {
  return join(rootDir, "engine", "build", "skript-ts.jar");
}

/** Put the server into engine mode: install skript-ts.jar, disable Skript.jar. */
export function installEngine(rootDir: string, serverDir: string): PluginSetResult {
  const built = engineJarPath(rootDir);
  if (!existsSync(built)) {
    throw new Error(
      `engine jar not found at ${built} — build it first with engine/build.sh (see README)`,
    );
  }
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
  const skriptJar = join(pluginsDir, "Skript.jar");
  const skriptDisabled = skriptJar + SKRIPT_DISABLED_SUFFIX;
  if (!existsSync(skriptJar) && existsSync(skriptDisabled)) {
    renameSync(skriptDisabled, skriptJar);
    changes.push("Skript.jar を復帰");
  }
  return { note: changes.join("、") };
}
