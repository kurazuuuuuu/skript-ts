import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Result of installing a single file from a skill pack. */
export interface SkillFileResult {
  /** Path of the file relative to the pack root, using "/" separators. */
  file: string;
  status: "installed" | "updated" | "unchanged";
}

/** Result of installing a skill pack into an agent skills directory. */
export interface SkillsInstallResult {
  /** Name of the installed pack directory (the base name of packDir). */
  pack: string;
  /** Absolute path of the source pack directory. */
  sourceDir: string;
  /** Absolute path the pack was installed into: join(skillsDir, pack). */
  targetDir: string;
  /** One entry per file in the pack, sorted by `file`. */
  files: SkillFileResult[];
}

/** Recursively collects regular files as "/"-joined relative paths. */
function walk(dir: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, rel, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

/**
 * Installs the skill pack at packDir into join(skillsDir, basename(packDir)),
 * copying changed files and leaving unrelated target files untouched.
 */
export function installSkillPack(opts: {
  packDir: string;
  skillsDir: string;
}): SkillsInstallResult {
  const sourceDir = resolve(opts.packDir);
  const skillsRoot = resolve(opts.skillsDir);

  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`Skill pack not found at ${sourceDir}`);
  }

  const entryFile = join(sourceDir, "SKILL.md");
  if (!existsSync(entryFile) || !statSync(entryFile).isFile()) {
    throw new Error(`Skill pack at ${sourceDir} is missing SKILL.md`);
  }

  const pack = basename(sourceDir);
  const targetDir = join(skillsRoot, pack);

  const relativeFiles: string[] = [];
  walk(sourceDir, "", relativeFiles);
  relativeFiles.sort();

  const files: SkillFileResult[] = [];
  for (const file of relativeFiles) {
    const sourcePath = join(sourceDir, file);
    const targetPath = join(targetDir, file);
    if (existsSync(targetPath)) {
      if (!statSync(targetPath).isFile()) {
        throw new Error(`Cannot install ${file}: ${targetPath} already exists and is not a file`);
      }
      const same = readFileSync(sourcePath).equals(readFileSync(targetPath));
      if (same) {
        files.push({ file, status: "unchanged" });
        continue;
      }
      copyFileSync(sourcePath, targetPath);
      files.push({ file, status: "updated" });
      continue;
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    files.push({ file, status: "installed" });
  }

  return { pack, sourceDir, targetDir, files };
}
